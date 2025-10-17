/**
 * 🔍 VERIFY ALL BATCHES - Analisar TODOS os produtos editados
 *
 * Analisa todos os produtos dos batches 1-5 com Vision AI
 * Move produtos com marcas detectadas para pasta Detected
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

const BATCH_DIRS = [
  'debug/reprocessed-top-10',
  'debug/reprocessed-batch-2',
  'debug/reprocessed-batch-3',
  'debug/reprocessed-batch-4',
  'debug/reprocessed-batch-5'
];

const DETECTED_DIR = 'debug/detected';
const CLEAN_DIR = 'debug/clean-verified';

interface BrandDetection {
  brands: string[];
  riskScore: number;
  detected_elements: string[];
}

async function fileToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const resized = await sharp(buffer)
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return resized.toString('base64');
}

async function detectBrandsInEditedImage(imageBase64: string): Promise<BrandDetection> {
  const prompt = `Analyze this edited sneaker product image and detect ANY remaining brand elements.

IMPORTANT: Focus ONLY on the SNEAKERS/SHOES themselves, NOT on any boxes or packaging.

Look for:
- Nike swoosh logos
- Jordan jumpman logos
- Adidas three stripes
- Yeezy branding
- Any brand text/wordmarks
- Any brand symbols or icons ON THE SHOES

Return ONLY a JSON object:
{
  "brands": ["Brand1", "Brand2"],
  "riskScore": 0-100,
  "detected_elements": ["description of what brand elements were found ON THE SHOES"]
}

riskScore scale:
- 0-20: Clean, no brands detected
- 21-40: Very minor traces
- 41-60: Moderate branding
- 61-100: Strong branding

Be VERY STRICT. Even partial or faded logos should be flagged.`;

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

async function getAllEditedProducts(): Promise<Array<{ file: string, source: string }>> {
  const allProducts: Array<{ file: string, source: string }> = [];

  for (const batchDir of BATCH_DIRS) {
    try {
      const files = await fs.readdir(batchDir);
      const imageFiles = files.filter(f =>
        f.toLowerCase().endsWith('.jpg') ||
        f.toLowerCase().endsWith('.jpeg') ||
        f.toLowerCase().endsWith('.png')
      );

      for (const file of imageFiles) {
        allProducts.push({
          file,
          source: batchDir
        });
      }
    } catch (error) {
      console.log(`⚠️  Pasta ${batchDir} não encontrada, pulando...`);
    }
  }

  return allProducts;
}

async function verifyAllBatches(): Promise<void> {
  console.log('🔍 VERIFICAÇÃO CONSOLIDADA - TODOS OS BATCHES\n');
  console.log('='.repeat(80) + '\n');

  // Criar pastas
  await fs.mkdir(DETECTED_DIR, { recursive: true });
  await fs.mkdir(CLEAN_DIR, { recursive: true });

  // Buscar todos os produtos editados
  const allProducts = await getAllEditedProducts();
  console.log(`📋 Total de produtos editados: ${allProducts.length}\n`);
  console.log('='.repeat(80) + '\n');

  const results: any[] = [];
  let detectedCount = 0;
  let cleanCount = 0;

  for (let i = 0; i < allProducts.length; i++) {
    const { file, source } = allProducts[i];
    const sourcePath = path.join(source, file);

    console.log(`[${i + 1}/${allProducts.length}] ${file}`);
    console.log(`   📁 Fonte: ${source}`);

    try {
      // Analisar com Vision AI
      const imageBase64 = await fileToBase64(sourcePath);
      const detection = await detectBrandsInEditedImage(imageBase64);

      console.log(`   📊 Risk: ${detection.riskScore}`);
      console.log(`   🏷️  Marcas: ${detection.brands.join(', ') || 'Nenhuma'}`);

      const hasBrands = detection.brands.length > 0 || detection.riskScore >= 30;

      if (hasBrands) {
        // DETECTADO - Mover para pasta Detected
        const detectedImagePath = path.join(DETECTED_DIR, file);
        const detectedAnalysisPath = path.join(DETECTED_DIR, file.replace(/\.(jpg|jpeg|png)$/i, '_analysis.json'));

        await fs.copyFile(sourcePath, detectedImagePath);
        await fs.writeFile(detectedAnalysisPath, JSON.stringify({
          filename: file,
          source_batch: source,
          detection,
          analyzed_at: new Date().toISOString()
        }, null, 2));

        console.log(`   ❌ DETECTADO - Movido para debug/detected/`);
        console.log(`      Elementos: ${detection.detected_elements.join(', ')}\n`);

        detectedCount++;
        results.push({
          filename: file,
          source_batch: source,
          status: 'brands_detected',
          brands: detection.brands,
          risk_score: detection.riskScore,
          detected_elements: detection.detected_elements
        });

      } else {
        // LIMPO - Mover para pasta Clean
        const cleanImagePath = path.join(CLEAN_DIR, file);

        await fs.copyFile(sourcePath, cleanImagePath);

        console.log(`   ✅ LIMPO - Movido para debug/clean-verified/\n`);

        cleanCount++;
        results.push({
          filename: file,
          source_batch: source,
          status: 'clean',
          brands: [],
          risk_score: detection.riskScore
        });
      }

      // Pequeno delay
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename: file,
        source_batch: source,
        status: 'error',
        error: String(error)
      });
    }
  }

  // Resumo final
  console.log('='.repeat(80));
  console.log('📊 RESUMO DA VERIFICAÇÃO CONSOLIDADA\n');
  console.log(`   Total analisado: ${allProducts.length}`);
  console.log(`   ❌ Com marcas detectadas: ${detectedCount} (${(detectedCount / allProducts.length * 100).toFixed(1)}%)`);
  console.log(`   ✅ Limpos: ${cleanCount} (${(cleanCount / allProducts.length * 100).toFixed(1)}%)\n`);

  // Marcas mais detectadas
  const brandCounts: Record<string, number> = {};
  results
    .filter(r => r.status === 'brands_detected')
    .forEach(r => {
      r.brands.forEach((brand: string) => {
        brandCounts[brand] = (brandCounts[brand] || 0) + 1;
      });
    });

  if (Object.keys(brandCounts).length > 0) {
    console.log('🏷️  MARCAS MAIS DETECTADAS:\n');
    Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([brand, count]) => {
        console.log(`   • ${brand}: ${count} produtos`);
      });
    console.log('');
  }

  // Produtos detectados
  const detected = results.filter(r => r.status === 'brands_detected');
  if (detected.length > 0) {
    console.log('❌ PRODUTOS COM MARCAS DETECTADAS:\n');
    detected
      .sort((a, b) => b.risk_score - a.risk_score)
      .forEach(r => {
        console.log(`   • ${r.filename}`);
        console.log(`     Risk: ${r.risk_score} | Marcas: ${r.brands.join(', ')}`);
        console.log(`     Batch: ${r.source_batch}\n`);
      });
  }

  // Salvar relatório
  await fs.writeFile('debug/batch-verification-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total_analyzed: allProducts.length,
      brands_detected: detectedCount,
      clean: cleanCount,
      detection_rate: `${(detectedCount / allProducts.length * 100).toFixed(1)}%`,
      success_rate: `${(cleanCount / allProducts.length * 100).toFixed(1)}%`
    },
    brand_statistics: brandCounts,
    results
  }, null, 2));

  console.log('='.repeat(80));
  console.log('💾 Relatório: debug/batch-verification-report.json');
  console.log('📁 Detectados: debug/detected/');
  console.log('📁 Limpos: debug/clean-verified/');
  console.log('='.repeat(80));
  console.log(`\n✅ VERIFICAÇÃO CONCLUÍDA! ${cleanCount}/${allProducts.length} produtos limpos`);
}

verifyAllBatches().catch(console.error);
