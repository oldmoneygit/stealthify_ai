/**
 * 🔥 TEST ULTRA AGGRESSIVE V2 - Prompts ultra-agressivos com múltiplas passagens
 *
 * Estratégia V2:
 * - Prompts MUITO mais agressivos (OBLITERATE, ERASE, DESTROY)
 * - Múltiplas passagens automáticas (até 3x)
 * - Instruções super específicas de preenchimento
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editImageWithCustomPrompt } from '@/services/qwen-edit.service';

const DETECTED_DIR = 'debug/detected';
const TEST_OUTPUT_DIR = 'debug/test-ultra-aggressive-v2';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Mesmos 3 produtos para comparar
const TEST_PRODUCTS = [
  '25899-Nike-Air-Jordan-1-High-Bred-Banned-2016_analysis.json',
  '25819-Adidas-Yeezy-Boost-350-V2-Semi-Frozen-Yellow_analysis.json',
  '26061-Nike-Air-Jordan-1-Retro-High-Fragment_analysis.json'
];

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
  approach: 'obliterate' | 'destroy' | 'ignore';
  prompt_modifier: string;
}

/**
 * V2: Categorização com estratégias ULTRA AGRESSIVAS
 */
function categorizeDetectedElementsV2(elements: string[]): EditStrategy[] {
  const strategies: EditStrategy[] = [];

  for (const element of elements) {
    const lower = element.toLowerCase();

    // Nike Swoosh - OBLITERAR (não apenas blender)
    if (lower.includes('swoosh')) {
      strategies.push({
        type: 'swoosh',
        priority: 'high',
        approach: 'obliterate',
        prompt_modifier: 'AGGRESSIVELY OBLITERATE the Nike swoosh logo. COMPLETELY ERASE it leaving ZERO visual trace. Fill the area with EXACT matching leather/material color and texture from the surrounding panel. The swoosh area must become INDISTINGUISHABLE from the rest of the panel - same color, same texture, same lighting. NO outline, NO shadow, NO remnant of the logo whatsoever.'
      });
    }

    // Wings Logo / Jumpman - DESTRUIR TOTALMENTE
    else if (lower.includes('wings') || lower.includes('jumpman')) {
      strategies.push({
        type: 'logo',
        priority: 'high',
        approach: 'destroy',
        prompt_modifier: 'COMPLETELY DESTROY and ERASE the Jordan Wings/Jumpman logo. OBLITERATE it with ZERO trace remaining. Replace with EXACT matching leather texture, color, and grain pattern from the surrounding collar area. The logo area must be PERFECTLY blended - NO visible difference in color, texture, or lighting. ABSOLUTE removal required.'
      });
    }

    // Texto - APAGAR COMPLETAMENTE
    else if (lower.includes('text') || lower.includes('wordmark') || lower.includes('sply') || lower.includes('nike air')) {
      strategies.push({
        type: 'text',
        priority: 'high',
        approach: 'destroy',
        prompt_modifier: 'AGGRESSIVELY ERASE all text and wordmarks with ZERO trace. OBLITERATE the letters completely. Fill with EXACT matching material texture and color from the surrounding stripe/panel. The text area must become INVISIBLE - perfectly matching the base material with NO ghosting, NO outline, NO shadow of the text. COMPLETE eradication required.'
      });
    }

    // Padrão LV - DESTRUIR PADRÃO
    else if (lower.includes('louis vuitton') || lower.includes('monogram') || lower.includes('lv')) {
      strategies.push({
        type: 'pattern',
        priority: 'high',
        approach: 'destroy',
        prompt_modifier: 'COMPLETELY OBLITERATE the Louis Vuitton monogram pattern. ERASE ALL LV symbols, flowers, and stars with ZERO trace. Replace with solid UNIFORM color matching the base material. NO pattern remnants, NO ghosting, NO visible traces of the original monogram. The area must be PERFECTLY SOLID and UNIFORM.'
      });
    }

    // Silhueta - NÃO TOCAR
    else if (lower.includes('silhouette') || lower.includes('design') || lower.includes('shape')) {
      strategies.push({
        type: 'silhouette',
        priority: 'low',
        approach: 'ignore',
        prompt_modifier: 'PRESERVE the shoe silhouette and overall design completely. This is product design, NOT branding.'
      });
    }
  }

  return strategies;
}

/**
 * V2: Prompt ultra-agressivo baseado na passagem (1ª, 2ª ou 3ª)
 */
function buildUltraAggressivePrompt(
  brands: string[],
  strategies: EditStrategy[],
  productCategory: string,
  passNumber: number = 1
): string {
  const activeStrategies = strategies.filter(s => s.approach !== 'ignore');

  if (activeStrategies.length === 0) {
    return `AGGRESSIVELY OBLITERATE all brand elements from this ${productCategory}.`;
  }

  const sortedStrategies = activeStrategies.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Intensidade aumenta a cada passagem
  const intensityPrefix = [
    '⚡ AGGRESSIVE BRAND OBLITERATION',
    '💥 ULTRA AGGRESSIVE BRAND DESTRUCTION - 2ND PASS',
    '🔥 MAXIMUM AGGRESSIVE BRAND ANNIHILATION - FINAL PASS'
  ][passNumber - 1];

  const prompt = `
${intensityPrefix} from ${productCategory}:

TARGET BRANDS FOR COMPLETE ERADICATION: ${brands.join(', ')}

ULTRA AGGRESSIVE EDITS REQUIRED (ZERO TOLERANCE):

${sortedStrategies.map((s, i) => `${i + 1}. [${s.type.toUpperCase()} - ${passNumber === 1 ? 'OBLITERATE' : passNumber === 2 ? 'DESTROY' : 'ANNIHILATE'}]
${s.prompt_modifier}`).join('\n\n')}

🔥 CRITICAL ULTRA-AGGRESSIVE RULES (PASS ${passNumber}/3):
- OBLITERATE brand elements with ABSOLUTE ZERO trace
- Match EXACT colors using RGB values from surrounding pixels
- Replicate EXACT textures with microscopic precision
- Preserve stitching, panel shapes, and construction PERFECTLY
- Result must be FORENSICALLY UNDETECTABLE as edited
- NO ghosting, NO shadows, NO outlines, NO remnants WHATSOEVER
- ONLY destroy brand elements - NEVER touch product design

${passNumber > 1 ? `
⚠️ ENHANCED ${passNumber === 2 ? 'SECOND' : 'FINAL'} PASS INSTRUCTIONS:
- Previous pass was TOO SUBTLE - be MORE AGGRESSIVE
- If ANY logo trace remains - OBLITERATE IT COMPLETELY
- Fill areas with ULTRA-PRECISE texture matching
- ZERO TOLERANCE for any brand remnants
` : ''}

OUTPUT: A ${productCategory} with ALL brand elements COMPLETELY OBLITERATED with FORENSIC-LEVEL precision.
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
- Nike swoosh logos (even faint traces)
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
Be EXTREMELY STRICT.`;

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

async function testUltraAggressiveV2(): Promise<void> {
  console.log('🔥 TEST ULTRA AGGRESSIVE V2 - Prompts Ultra-Agressivos\n');
  console.log('💥 Múltiplas passagens automáticas (até 3x)');
  console.log('🎯 OBLITERATE, DESTROY, ANNIHILATE\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < TEST_PRODUCTS.length; i++) {
    const analysisFile = TEST_PRODUCTS[i];
    const analysisPath = path.join(DETECTED_DIR, analysisFile);

    console.log(`\n[${i + 1}/3] 🔥 ${analysisFile}`);
    console.log('─'.repeat(80));

    try {
      const analysisContent = await fs.readFile(analysisPath, 'utf-8');
      const analysis: DetectionAnalysis = JSON.parse(analysisContent);

      const imageFilename = analysis.filename;
      const imagePath = path.join(DETECTED_DIR, imageFilename);

      console.log(`   📦 Produto: ${imageFilename}`);
      console.log(`   📊 Risk Original: ${analysis.detection.riskScore}`);
      console.log(`   🏷️  Marcas: ${analysis.detection.brands.join(', ')}`);

      // Categorizar com estratégias V2
      const strategies = categorizeDetectedElementsV2(analysis.detection.detected_elements);
      console.log(`   🎯 Estratégias V2: ${strategies.length}`);
      strategies.forEach(s => {
        if (s.approach !== 'ignore') {
          console.log(`      • ${s.type} (${s.priority}) - ${s.approach.toUpperCase()}`);
        }
      });

      let category = 'sneaker';
      if (imageFilename.includes('Yeezy')) category = 'Yeezy sneaker';
      else if (imageFilename.includes('Jordan')) category = 'Air Jordan sneaker';

      let currentBase64 = await fileToBase64(imagePath);
      let currentRisk = analysis.detection.riskScore;
      let passResults: any[] = [];

      // MÚLTIPLAS PASSAGENS (até 3x)
      for (let pass = 1; pass <= 3; pass++) {
        console.log(`\n   ${'🔥'.repeat(pass)} PASSAGEM ${pass}/3 ${'🔥'.repeat(pass)}`);

        const ultraPrompt = buildUltraAggressivePrompt(
          analysis.detection.brands,
          strategies,
          category,
          pass
        );

        console.log(`   📝 Prompt (${ultraPrompt.length} chars): ${intensityLabels[pass - 1]}`);
        console.log(`   ✨ Aplicando edição ULTRA AGRESSIVA...`);

        const editedBase64 = await editImageWithCustomPrompt(currentBase64, ultraPrompt);

        console.log(`   🔎 Verificando resultado da passagem ${pass}...`);
        const verification = await verifyWithGemini(editedBase64);

        console.log(`   📈 Pass ${pass}: Risk ${currentRisk} → ${verification.riskScore}`);
        console.log(`      Melhoria: ${currentRisk - verification.riskScore} pontos`);
        console.log(`      Marcas: ${verification.brands.length > 0 ? verification.brands.join(', ') : 'NENHUMA!'}`);

        passResults.push({
          pass,
          risk_before: currentRisk,
          risk_after: verification.riskScore,
          improvement: currentRisk - verification.riskScore,
          brands_remaining: verification.brands
        });

        currentBase64 = editedBase64;
        currentRisk = verification.riskScore;

        // Se ficou limpo (risk < 30), parar
        if (verification.brands.length === 0 || verification.riskScore < 30) {
          console.log(`   ✅ SUCESSO! Produto limpo na passagem ${pass}!`);
          break;
        }

        // Se é a última passagem e ainda tem marcas
        if (pass === 3 && (verification.brands.length > 0 || verification.riskScore >= 30)) {
          console.log(`   ⚠️  Ainda detectado após 3 passagens - produto difícil`);
        }

        if (pass < 3) {
          console.log(`   ⏭️  Risk ainda alto (${verification.riskScore}) - iniciando passagem ${pass + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Salvar resultado final
      const finalBuffer = Buffer.from(
        currentBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );
      await fs.writeFile(path.join(TEST_OUTPUT_DIR, imageFilename), finalBuffer);

      const totalImprovement = analysis.detection.riskScore - currentRisk;
      const finalStatus = currentRisk < 30 ? '✅ LIMPO!' : '⚠️  Ainda detectado';

      console.log(`\n   📊 RESULTADO FINAL:`);
      console.log(`      Risk Original: ${analysis.detection.riskScore}`);
      console.log(`      Risk Final: ${currentRisk}`);
      console.log(`      Melhoria Total: ${totalImprovement} pontos`);
      console.log(`      Passagens usadas: ${passResults.length}`);
      console.log(`      Status: ${finalStatus}`);

      console.log(`\n   💾 Salvo: debug/test-ultra-aggressive-v2/${imageFilename}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ TESTE V2 ULTRA-AGRESSIVO CONCLUÍDO!');
  console.log('📁 Verificar resultados em: debug/test-ultra-aggressive-v2/');
  console.log('📊 Comparar com V1 em: debug/test-smart-reprocess/');
  console.log('='.repeat(80));
}

const intensityLabels = [
  '⚡ AGGRESSIVE',
  '💥 ULTRA AGGRESSIVE',
  '🔥 MAXIMUM AGGRESSIVE'
];

testUltraAggressiveV2().catch(console.error);
