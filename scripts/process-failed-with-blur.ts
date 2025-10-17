/**
 * 🔄 PROCESS FAILED WITH BLUR - Blur preventivo nos 42 produtos que precisam revisão
 *
 * Estratégia:
 * 1. Ler relatório V1 para identificar produtos que precisam revisão
 * 2. Aplicar blur computacional nas áreas detectadas
 * 3. Verificar resultado com Gemini
 * 4. Salvar em pasta separada
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { applySmartBlur } from '@/services/structural-validation.service';

const V1_REPORT_PATH = 'debug/v1-final-report.json';
const V1_IMAGES_DIR = 'debug/smart-reprocessed-v1';
const BLUR_OUTPUT_DIR = 'debug/blur-preventive-final';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

interface V1Result {
  filename: string;
  original_risk: number;
  final_risk: number;
  improvement: number;
  brands_original: string[];
  brands_remaining: string[];
  strategies_used: string[];
  status: 'clean' | 'needs_review';
}

interface V1Report {
  timestamp: string;
  strategy: string;
  summary: {
    total_processed: number;
    clean: number;
    needs_review: number;
    success_rate: string;
    total_improvement: number;
    average_improvement: string;
  };
  results: V1Result[];
}

async function fileToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const resized = await sharp(buffer)
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return resized.toString('base64');
}

async function verifyWithGemini(imageBase64: string): Promise<{ brands: string[], riskScore: number }> {
  const prompt = `Analyze this edited sneaker and detect ANY remaining brand elements.

IMPORTANT: Focus ONLY on the SNEAKERS/SHOES, NOT boxes or packaging.

Look for:
- Nike swoosh logos
- Jordan jumpman/wings logos
- Adidas stripes
- Any brand text/wordmarks
- Brand symbols ON THE SHOES

Return ONLY JSON:
{
  "brands": ["Brand1"],
  "riskScore": 0-100
}

Risk scale: 0-20 clean, 21-40 minor traces, 41+ needs more work.
Be VERY STRICT.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const result = await response.json();
  return JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
}

/**
 * Detecta regiões de marcas e retorna coordenadas para blur
 */
async function detectBrandRegions(
  imageBase64: string,
  brandsToFind: string[]
): Promise<Array<{ x: number; y: number; width: number; height: number }>> {
  const prompt = `Detect the EXACT locations of these brand elements: ${brandsToFind.join(', ')}

Return bounding boxes in normalized coordinates (0-1).

Return ONLY JSON:
{
  "regions": [
    {"x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1, "brand": "Nike swoosh"},
    {"x": 0.7, "y": 0.15, "width": 0.12, "height": 0.08, "brand": "Jordan Wings"}
  ]
}

Each region should be a tight bounding box around the brand element.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const result = await response.json();
  const parsed = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
  return parsed.regions || [];
}

/**
 * Aplica blur nas regiões específicas
 */
async function applyBlurToRegions(
  imagePath: string,
  regions: Array<{ x: number; y: number; width: number; height: number }>
): Promise<Buffer> {
  const imageBuffer = await fs.readFile(imagePath);
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const imgWidth = metadata.width!;
  const imgHeight = metadata.height!;

  // Começar com a imagem original
  let result = await image.toBuffer();

  // Aplicar blur em cada região
  for (const region of regions) {
    // Converter coordenadas normalizadas para pixels
    const left = Math.floor(region.x * imgWidth);
    const top = Math.floor(region.y * imgHeight);
    const width = Math.floor(region.width * imgWidth);
    const height = Math.floor(region.height * imgHeight);

    // Extrair região, aplicar blur, e compor de volta
    const blurredRegion = await sharp(result)
      .extract({ left, top, width, height })
      .blur(30) // Blur forte
      .toBuffer();

    result = await sharp(result)
      .composite([{
        input: blurredRegion,
        left,
        top
      }])
      .toBuffer();
  }

  return result;
}

async function processFailedWithBlur(): Promise<void> {
  console.log('🔄 PROCESS FAILED WITH BLUR - Blur Preventivo\n');
  console.log('📋 Lendo relatório V1 para identificar produtos que precisam revisão...\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(BLUR_OUTPUT_DIR, { recursive: true });

  // Ler relatório V1
  const reportContent = await fs.readFile(V1_REPORT_PATH, 'utf-8');
  const report: V1Report = JSON.parse(reportContent);

  // Filtrar apenas produtos que precisam revisão
  const needsReview = report.results.filter(r => r.status === 'needs_review');

  console.log(`📊 Total que precisa revisão: ${needsReview.length}\n`);
  console.log('🎯 Aplicando blur preventivo em áreas detectadas...\n');
  console.log('='.repeat(80) + '\n');

  const results: any[] = [];
  let cleanCount = 0;
  let totalImprovement = 0;

  for (let i = 0; i < needsReview.length; i++) {
    const product = needsReview[i];
    const imagePath = path.join(V1_IMAGES_DIR, product.filename);

    console.log(`\n[${i + 1}/${needsReview.length}] 🔄 ${product.filename}`);
    console.log('─'.repeat(80));
    console.log(`   📊 Risk V1: ${product.final_risk}`);
    console.log(`   🏷️  Marcas detectadas: ${product.brands_remaining.join(', ')}`);

    try {
      // 1. Carregar imagem V1
      const imageBase64 = await fileToBase64(imagePath);

      // 2. Detectar regiões exatas das marcas
      console.log(`   🎯 Detectando regiões exatas das marcas...`);
      const regions = await detectBrandRegions(imageBase64, product.brands_remaining);

      console.log(`   📍 Regiões detectadas: ${regions.length}`);
      regions.forEach((r, idx) => {
        console.log(`      ${idx + 1}. x:${(r.x * 100).toFixed(1)}% y:${(r.y * 100).toFixed(1)}% w:${(r.width * 100).toFixed(1)}% h:${(r.height * 100).toFixed(1)}%`);
      });

      if (regions.length === 0) {
        console.log(`   ⚠️  Nenhuma região detectada - aplicando blur em toda imagem`);
        // Fallback: aplicar blur suave em toda imagem
        const fullImageBuffer = await fs.readFile(imagePath);
        const blurred = await sharp(fullImageBuffer)
          .blur(15)
          .toBuffer();

        await fs.writeFile(path.join(BLUR_OUTPUT_DIR, product.filename), blurred);

        const blurredBase64 = blurred.toString('base64');
        const verification = await verifyWithGemini(blurredBase64);

        const improvement = product.final_risk - verification.riskScore;
        const isClean = verification.brands.length === 0 || verification.riskScore < 30;

        console.log(`   📈 Risk Final: ${verification.riskScore}`);
        console.log(`   📊 Melhoria: ${improvement > 0 ? '+' : ''}${improvement} pontos`);
        console.log(`   ${isClean ? '✅ LIMPO!' : '⚠️  Ainda detectado: ' + verification.brands.join(', ')}`);

        if (isClean) cleanCount++;
        totalImprovement += improvement;

        results.push({
          filename: product.filename,
          v1_risk: product.final_risk,
          blur_risk: verification.riskScore,
          improvement,
          regions_blurred: 'full_image',
          brands_remaining: verification.brands,
          status: isClean ? 'clean' : 'needs_review'
        });

        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // 3. Aplicar blur nas regiões específicas
      console.log(`   💨 Aplicando blur preventivo nas regiões...`);
      const blurredBuffer = await applyBlurToRegions(imagePath, regions);

      // 4. Salvar
      await fs.writeFile(path.join(BLUR_OUTPUT_DIR, product.filename), blurredBuffer);

      // 5. Verificar resultado
      console.log(`   🔎 Verificando resultado...`);
      const blurredBase64 = blurredBuffer.toString('base64');
      const verification = await verifyWithGemini(blurredBase64);

      const improvement = product.final_risk - verification.riskScore;
      const isClean = verification.brands.length === 0 || verification.riskScore < 30;

      console.log(`   📈 Risk Final: ${verification.riskScore}`);
      console.log(`   📊 Melhoria: ${improvement > 0 ? '+' : ''}${improvement} pontos`);
      console.log(`   ${isClean ? '✅ LIMPO!' : '⚠️  Ainda detectado: ' + verification.brands.join(', ')}`);

      if (isClean) cleanCount++;
      totalImprovement += improvement;

      results.push({
        filename: product.filename,
        v1_risk: product.final_risk,
        blur_risk: verification.riskScore,
        improvement,
        regions_blurred: regions.length,
        brands_remaining: verification.brands,
        status: isClean ? 'clean' : 'needs_review'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename: product.filename,
        status: 'error',
        error: String(error)
      });
    }
  }

  // Resumo Final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO FINAL - BLUR PREVENTIVO\n');
  console.log(`   Total processado: ${needsReview.length}`);
  console.log(`   ✅ Limpos após blur: ${cleanCount} (${(cleanCount / needsReview.length * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Ainda precisam revisão: ${needsReview.length - cleanCount}`);
  console.log(`   📈 Melhoria total: ${totalImprovement > 0 ? '+' : ''}${totalImprovement} pontos`);
  console.log(`   📊 Melhoria média: ${(totalImprovement / needsReview.length).toFixed(1)} pontos/produto\n`);

  // Top melhorias
  const topImprovements = results
    .filter(r => r.improvement !== undefined)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 10);

  if (topImprovements.length > 0) {
    console.log('🏆 TOP 10 MAIORES MELHORIAS COM BLUR:\n');
    topImprovements.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename}`);
      console.log(`      Risk V1: ${r.v1_risk} → Blur: ${r.blur_risk} (${r.improvement > 0 ? '+' : ''}${r.improvement})`);
      console.log(`      Regiões com blur: ${r.regions_blurred}\n`);
    });
  }

  // Produtos que ainda precisam revisão
  const stillNeedsReview = results.filter(r => r.status === 'needs_review');
  if (stillNeedsReview.length > 0) {
    console.log(`⚠️  PRODUTOS QUE AINDA PRECISAM REVISÃO (${stillNeedsReview.length}):\n`);
    stillNeedsReview.slice(0, 10).forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename} - Risk: ${r.blur_risk} - Marcas: ${r.brands_remaining.join(', ')}`);
    });
    if (stillNeedsReview.length > 10) {
      console.log(`   ... e mais ${stillNeedsReview.length - 10} produtos\n`);
    }
  }

  // Salvar relatório
  await fs.writeFile('debug/blur-preventive-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    strategy: 'Blur Preventivo em Regiões Detectadas',
    v1_summary: report.summary,
    blur_summary: {
      total_processed: needsReview.length,
      clean: cleanCount,
      still_needs_review: needsReview.length - cleanCount,
      success_rate: `${(cleanCount / needsReview.length * 100).toFixed(1)}%`,
      total_improvement: totalImprovement,
      average_improvement: `${(totalImprovement / needsReview.length).toFixed(1)} points`
    },
    results
  }, null, 2));

  console.log('='.repeat(80));
  console.log('💾 Relatório completo: debug/blur-preventive-report.json');
  console.log('📁 Imagens com blur: debug/blur-preventive-final/');
  console.log('='.repeat(80));
  console.log(`\n✅ BLUR PREVENTIVO CONCLUÍDO! (${cleanCount}/${needsReview.length} limpos)`);
  console.log('🎯 Estratégia: Blur direcionado em regiões detectadas pelo Gemini\n');

  // Resumo combinado V1 + Blur
  const totalClean = report.summary.clean + cleanCount;
  const totalProcessed = report.summary.total_processed;
  console.log('📊 RESUMO GERAL (V1 + BLUR):');
  console.log(`   ✅ Total limpo: ${totalClean}/${totalProcessed} (${(totalClean / totalProcessed * 100).toFixed(1)}%)`);
  console.log(`   🎯 V1 Moderada: ${report.summary.clean} limpos`);
  console.log(`   💨 Blur Preventivo: ${cleanCount} limpos adicionais`);
  console.log('='.repeat(80));
}

processFailedWithBlur().catch(console.error);
