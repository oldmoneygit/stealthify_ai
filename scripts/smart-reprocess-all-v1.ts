/**
 * 🎯 SMART REPROCESS ALL - V1 Moderada em TODOS os 67 produtos detectados
 *
 * Baseado nos testes, V1 Moderada é a estratégia mais consistente:
 * ✅ Sempre melhora ~5 pontos
 * ✅ Nunca piora
 * ✅ Previsível
 * ✅ 1 passagem (rápido)
 *
 * V2/V3 descartadas por inconsistência
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editImageWithCustomPrompt } from '@/services/qwen-edit.service';

const DETECTED_DIR = 'debug/detected';
const OUTPUT_DIR = 'debug/smart-reprocessed-v1';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

interface DetectionAnalysis {
  filename: string;
  source_batch: string;
  detection: {
    brands: string[];
    riskScore: number;
    detected_elements: string[];
  };
  analyzed_at: string;
}

interface EditStrategy {
  type: 'swoosh' | 'text' | 'logo' | 'pattern' | 'silhouette';
  priority: 'high' | 'medium' | 'low';
  approach: 'remove' | 'subtle' | 'ignore';
  prompt_modifier: string;
}

/**
 * V1 Moderate categorization (proven to work consistently)
 */
function categorizeDetectedElements(elements: string[]): EditStrategy[] {
  const strategies: EditStrategy[] = [];

  for (const element of elements) {
    const lower = element.toLowerCase();

    if (lower.includes('swoosh')) {
      strategies.push({
        type: 'swoosh',
        priority: 'high',
        approach: 'subtle',
        prompt_modifier: 'SUBTLY blend the Nike swoosh into the surrounding material. Maintain the panel shape and stitching lines, but COMPLETELY remove the swoosh logo itself. Match the exact color and texture of the surrounding leather/material.'
      });
    } else if (lower.includes('wings') || lower.includes('jumpman')) {
      strategies.push({
        type: 'logo',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'COMPLETELY REMOVE the Jordan Wings/Jumpman logo. Fill the area with matching leather texture and color. Ensure NO traces of the logo remain.'
      });
    } else if (lower.includes('text') || lower.includes('wordmark') || lower.includes('sply') || lower.includes('nike air')) {
      strategies.push({
        type: 'text',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'COMPLETELY REMOVE all visible text and wordmarks. Replace with matching material texture. NO text should remain visible.'
      });
    } else if (lower.includes('louis vuitton') || lower.includes('monogram') || lower.includes('lv')) {
      strategies.push({
        type: 'pattern',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'REMOVE the Louis Vuitton monogram pattern (LV symbols, flowers, stars). Replace with solid color matching the base material. Maintain material texture but REMOVE all brand patterns.'
      });
    } else if (lower.includes('silhouette') || lower.includes('design') || lower.includes('shape')) {
      strategies.push({
        type: 'silhouette',
        priority: 'low',
        approach: 'ignore',
        prompt_modifier: 'DO NOT alter the shoe silhouette or overall design. This is product design, not branding.'
      });
    }
  }

  return strategies;
}

/**
 * V1 Moderate prompt builder (proven consistent)
 */
function buildModeratePrompt(
  brands: string[],
  strategies: EditStrategy[],
  productCategory: string
): string {
  const activeStrategies = strategies.filter(s => s.approach !== 'ignore');

  if (activeStrategies.length === 0) {
    return `Remove all brand elements from this ${productCategory} while maintaining design integrity.`;
  }

  const sortedStrategies = activeStrategies.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const prompt = `
TARGETED BRAND REMOVAL from ${productCategory}:

Detected brands: ${brands.join(', ')}

SPECIFIC EDITS REQUIRED (in order of priority):

${sortedStrategies.map((s, i) => `${i + 1}. [${s.type.toUpperCase()}] ${s.prompt_modifier}`).join('\n\n')}

CRITICAL RULES:
- Maintain overall shoe design and silhouette
- Match exact colors and textures of surrounding materials
- Preserve stitching lines, panel shapes, and construction details
- ONLY edit brand elements, NOT design elements
- Result must look natural and unedited

OUTPUT: A ${productCategory} with ALL brand elements removed but design integrity 100% preserved.
  `.trim();

  return prompt;
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

async function processAllProducts(): Promise<void> {
  console.log('🎯 SMART REPROCESS ALL - V1 MODERADA\n');
  console.log('✅ Estratégia escolhida: V1 Moderada (mais consistente)');
  console.log('📊 Expectativa: ~5 pontos de melhoria por produto');
  console.log('🎯 Total: 67 produtos detectados\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Buscar todos os JSONs de análise
  const files = await fs.readdir(DETECTED_DIR);
  const analysisFiles = files.filter(f => f.endsWith('_analysis.json'));

  console.log(`📁 Total de análises encontradas: ${analysisFiles.length}\n`);
  console.log('='.repeat(80) + '\n');

  const results: any[] = [];
  let cleanCount = 0;
  let totalImprovement = 0;

  for (let i = 0; i < analysisFiles.length; i++) {
    const analysisFile = analysisFiles[i];
    const analysisPath = path.join(DETECTED_DIR, analysisFile);

    console.log(`\n[${i + 1}/${analysisFiles.length}] 🔍 ${analysisFile}`);
    console.log('─'.repeat(80));

    try {
      // Ler análise
      const analysisContent = await fs.readFile(analysisPath, 'utf-8');
      const analysis: DetectionAnalysis = JSON.parse(analysisContent);

      const imageFilename = analysis.filename;
      const imagePath = path.join(DETECTED_DIR, imageFilename);

      console.log(`   📦 Produto: ${imageFilename}`);
      console.log(`   📊 Risk Original: ${analysis.detection.riskScore}`);
      console.log(`   🏷️  Marcas: ${analysis.detection.brands.join(', ')}`);

      // Categorizar com estratégia V1
      const strategies = categorizeDetectedElements(analysis.detection.detected_elements);
      console.log(`   🎯 Estratégias V1: ${strategies.filter(s => s.approach !== 'ignore').length}`);
      strategies.forEach(s => {
        if (s.approach !== 'ignore') {
          console.log(`      • ${s.type} (${s.priority}) - ${s.approach}`);
        }
      });

      // Determinar categoria
      let category = 'sneaker';
      if (imageFilename.includes('Yeezy')) category = 'Yeezy sneaker';
      else if (imageFilename.includes('Jordan')) category = 'Air Jordan sneaker';
      else if (imageFilename.includes('Dunk')) category = 'Nike Dunk sneaker';
      else if (imageFilename.includes('Air-Force')) category = 'Air Force 1 sneaker';

      // Criar prompt V1 moderate
      const moderatePrompt = buildModeratePrompt(
        analysis.detection.brands,
        strategies,
        category
      );

      console.log(`   📝 Prompt V1 (${moderatePrompt.length} chars)`);

      // Aplicar edição V1 (1 passagem)
      console.log(`   ✨ Aplicando V1 Moderada...`);
      const imageBase64 = await fileToBase64(imagePath);
      const editedBase64 = await editImageWithCustomPrompt(imageBase64, moderatePrompt);

      // Verificar resultado
      console.log(`   🔎 Verificando resultado...`);
      const verification = await verifyWithGemini(editedBase64);

      const improvement = analysis.detection.riskScore - verification.riskScore;
      const isClean = verification.brands.length === 0 || verification.riskScore < 30;

      console.log(`   📈 Risk Final: ${verification.riskScore}`);
      console.log(`   📊 Melhoria: ${improvement > 0 ? '+' : ''}${improvement} pontos`);
      console.log(`   ${isClean ? '✅ LIMPO!' : '⚠️  Ainda detectado: ' + verification.brands.join(', ')}`);

      // Salvar
      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );
      await fs.writeFile(path.join(OUTPUT_DIR, imageFilename), editedBuffer);

      if (isClean) cleanCount++;
      totalImprovement += improvement;

      results.push({
        filename: imageFilename,
        original_risk: analysis.detection.riskScore,
        final_risk: verification.riskScore,
        improvement,
        brands_original: analysis.detection.brands,
        brands_remaining: verification.brands,
        strategies_used: strategies.filter(s => s.approach !== 'ignore').map(s => s.type),
        status: isClean ? 'clean' : 'needs_review'
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename: analysisFile,
        status: 'error',
        error: String(error)
      });
    }
  }

  // Resumo Final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO FINAL - V1 MODERADA\n');
  console.log(`   Total processado: ${analysisFiles.length}`);
  console.log(`   ✅ Limpos: ${cleanCount} (${(cleanCount / analysisFiles.length * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Precisam revisão: ${analysisFiles.length - cleanCount}`);
  console.log(`   📈 Melhoria total: ${totalImprovement} pontos`);
  console.log(`   📊 Melhoria média: ${(totalImprovement / analysisFiles.length).toFixed(1)} pontos/produto\n`);

  // Top 10 melhorias
  const topImprovements = results
    .filter(r => r.improvement !== undefined)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 10);

  if (topImprovements.length > 0) {
    console.log('🏆 TOP 10 MAIORES MELHORIAS:\n');
    topImprovements.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename}`);
      console.log(`      Risk: ${r.original_risk} → ${r.final_risk} (${r.improvement > 0 ? '+' : ''}${r.improvement})`);
      console.log(`      Estratégias: ${r.strategies_used.join(', ')}\n`);
    });
  }

  // Produtos que ainda precisam revisão
  const needsReview = results.filter(r => r.status === 'needs_review');
  if (needsReview.length > 0) {
    console.log(`⚠️  PRODUTOS QUE PRECISAM REVISÃO (${needsReview.length}):\n`);
    needsReview.slice(0, 10).forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename} - Risk: ${r.final_risk} - Marcas: ${r.brands_remaining.join(', ')}`);
    });
    if (needsReview.length > 10) {
      console.log(`   ... e mais ${needsReview.length - 10} produtos\n`);
    }
  }

  // Salvar relatório
  await fs.writeFile('debug/v1-final-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    strategy: 'V1 Moderate',
    summary: {
      total_processed: analysisFiles.length,
      clean: cleanCount,
      needs_review: analysisFiles.length - cleanCount,
      success_rate: `${(cleanCount / analysisFiles.length * 100).toFixed(1)}%`,
      total_improvement: totalImprovement,
      average_improvement: `${(totalImprovement / analysisFiles.length).toFixed(1)} points`
    },
    results
  }, null, 2));

  console.log('='.repeat(80));
  console.log('💾 Relatório completo: debug/v1-final-report.json');
  console.log('📁 Imagens editadas: debug/smart-reprocessed-v1/');
  console.log('='.repeat(80));
  console.log(`\n✅ PROCESSAMENTO CONCLUÍDO! (${cleanCount}/${analysisFiles.length} limpos)`);
  console.log('🎯 Estratégia V1 Moderada aplicada com sucesso!\n');
}

processAllProducts().catch(console.error);
