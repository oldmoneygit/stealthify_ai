/**
 * 🎯 TEST HYBRID V3 - Estratégia Inteligente Adaptativa
 *
 * Escolhe automaticamente a melhor abordagem:
 * - 1 tipo de elemento → V1 Moderada (1 passagem)
 * - 2+ tipos de elementos → V2 Ultra-Agressiva (até 3 passagens)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editImageWithCustomPrompt } from '@/services/qwen-edit.service';

const DETECTED_DIR = 'debug/detected';
const TEST_OUTPUT_DIR = 'debug/test-hybrid-v3';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

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
  approach: 'moderate' | 'obliterate' | 'ignore';
  prompt_modifier: string;
}

/**
 * Categoriza elementos e decide intensidade baseado na quantidade de TIPOS
 */
function categorizeWithAdaptiveStrategy(elements: string[]): {
  strategies: EditStrategy[];
  elementTypes: Set<string>;
  recommendedApproach: 'moderate' | 'ultra-aggressive';
} {
  const strategies: EditStrategy[] = [];
  const elementTypes = new Set<string>();

  for (const element of elements) {
    const lower = element.toLowerCase();

    if (lower.includes('swoosh')) {
      elementTypes.add('swoosh');
      strategies.push({
        type: 'swoosh',
        priority: 'high',
        approach: 'moderate', // Será ajustado depois
        prompt_modifier: '' // Será preenchido depois
      });
    } else if (lower.includes('wings') || lower.includes('jumpman')) {
      elementTypes.add('logo');
      strategies.push({
        type: 'logo',
        priority: 'high',
        approach: 'moderate',
        prompt_modifier: ''
      });
    } else if (lower.includes('text') || lower.includes('wordmark') || lower.includes('sply') || lower.includes('nike air')) {
      elementTypes.add('text');
      strategies.push({
        type: 'text',
        priority: 'high',
        approach: 'moderate',
        prompt_modifier: ''
      });
    } else if (lower.includes('louis vuitton') || lower.includes('monogram') || lower.includes('lv')) {
      elementTypes.add('pattern');
      strategies.push({
        type: 'pattern',
        priority: 'high',
        approach: 'moderate',
        prompt_modifier: ''
      });
    } else if (lower.includes('silhouette') || lower.includes('design') || lower.includes('shape')) {
      elementTypes.add('silhouette');
      strategies.push({
        type: 'silhouette',
        priority: 'low',
        approach: 'ignore',
        prompt_modifier: 'PRESERVE shoe silhouette - this is design, not branding.'
      });
    }
  }

  // DECISÃO: 1 tipo = moderada, 2+ tipos = ultra-agressiva
  const uniqueTypes = Array.from(elementTypes).filter(t => t !== 'silhouette');
  const recommendedApproach = uniqueTypes.length >= 2 ? 'ultra-aggressive' : 'moderate';

  return { strategies, elementTypes, recommendedApproach };
}

/**
 * Cria prompt baseado na abordagem recomendada
 */
function buildAdaptivePrompt(
  brands: string[],
  strategies: EditStrategy[],
  productCategory: string,
  approach: 'moderate' | 'ultra-aggressive',
  passNumber: number = 1
): string {
  const activeStrategies = strategies.filter(s => s.approach !== 'ignore');

  if (approach === 'moderate') {
    // V1 Moderada - 1 passagem focada
    const modifiers: string[] = [];

    for (const s of activeStrategies) {
      if (s.type === 'swoosh') {
        modifiers.push('Carefully blend the Nike swoosh into surrounding material. Maintain panel shape and stitching, remove logo cleanly. Match exact color and texture.');
      } else if (s.type === 'logo') {
        modifiers.push('Remove Jordan Wings/Jumpman logo completely. Fill with matching leather texture and color.');
      } else if (s.type === 'text') {
        modifiers.push('Remove all visible text and wordmarks. Replace with matching material texture.');
      } else if (s.type === 'pattern') {
        modifiers.push('Remove Louis Vuitton monogram pattern. Replace with solid matching color.');
      }
    }

    return `
Remove brand elements from ${productCategory} with precision and subtlety.

Detected brands: ${brands.join(', ')}

FOCUSED EDITS:
${modifiers.map((m, i) => `${i + 1}. ${m}`).join('\n')}

RULES:
- Maintain overall design and silhouette
- Match exact colors and textures
- Preserve construction details
- Result must look natural

OUTPUT: ${productCategory} with brand elements removed, design preserved.
    `.trim();
  } else {
    // V2 Ultra-Agressiva - múltiplas passagens
    const intensityPrefix = [
      '⚡ AGGRESSIVE MULTI-ELEMENT REMOVAL',
      '💥 ULTRA AGGRESSIVE CLEANUP - 2ND PASS',
      '🔥 MAXIMUM AGGRESSIVE FINAL SWEEP'
    ][passNumber - 1];

    const modifiers: string[] = [];

    for (const s of activeStrategies) {
      if (s.type === 'swoosh') {
        modifiers.push(`[SWOOSH] OBLITERATE Nike swoosh completely. ERASE with zero trace. Fill with EXACT matching material color and texture from surrounding panel. NO outline, NO shadow whatsoever.`);
      } else if (s.type === 'logo') {
        modifiers.push(`[LOGO] DESTROY Jordan Wings/Jumpman logo entirely. ERASE all traces. Replace with precise matching leather texture and color. ABSOLUTE removal required.`);
      } else if (s.type === 'text') {
        modifiers.push(`[TEXT] OBLITERATE all text/wordmarks with zero trace. ERASE letters completely. Fill with EXACT material texture. NO ghosting, NO outline.`);
      } else if (s.type === 'pattern') {
        modifiers.push(`[PATTERN] DESTROY Louis Vuitton monogram. ERASE ALL symbols completely. Replace with solid uniform color. ZERO pattern remnants.`);
      }
    }

    return `
${intensityPrefix} from ${productCategory}:

TARGET: ${brands.join(', ')} - MULTIPLE BRAND ELEMENTS DETECTED

AGGRESSIVE MULTI-ELEMENT STRATEGY (Pass ${passNumber}/3):

${modifiers.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}

🔥 CRITICAL RULES (MULTI-ELEMENT MODE):
- OBLITERATE each brand type separately and completely
- Match EXACT colors using surrounding pixel analysis
- Preserve overall design - ONLY destroy brand elements
- Result must be FORENSICALLY undetectable
- ZERO tolerance for any brand remnants

${passNumber > 1 ? `
⚠️ ENHANCED PASS ${passNumber} (MULTI-ELEMENT):
- Previous pass incomplete - be MORE AGGRESSIVE
- Each element type requires separate obliteration
- ZERO traces of ANY brand elements acceptable
` : ''}

OUTPUT: ${productCategory} with ALL brand elements COMPLETELY removed.
    `.trim();
  }
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

async function testHybridV3(): Promise<void> {
  console.log('🎯 TEST HYBRID V3 - Estratégia Adaptativa Inteligente\n');
  console.log('📊 Escolhe automaticamente:');
  console.log('   • 1 tipo de elemento → V1 Moderada (1 passagem)');
  console.log('   • 2+ tipos de elementos → V2 Ultra-Agressiva (até 3 passagens)\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });

  const results: any[] = [];

  for (let i = 0; i < TEST_PRODUCTS.length; i++) {
    const analysisFile = TEST_PRODUCTS[i];
    const analysisPath = path.join(DETECTED_DIR, analysisFile);

    console.log(`\n[${i + 1}/3] 🎯 ${analysisFile}`);
    console.log('─'.repeat(80));

    try {
      const analysisContent = await fs.readFile(analysisPath, 'utf-8');
      const analysis: DetectionAnalysis = JSON.parse(analysisContent);

      const imageFilename = analysis.filename;
      const imagePath = path.join(DETECTED_DIR, imageFilename);

      console.log(`   📦 Produto: ${imageFilename}`);
      console.log(`   📊 Risk Original: ${analysis.detection.riskScore}`);
      console.log(`   🏷️  Marcas: ${analysis.detection.brands.join(', ')}`);

      // Análise adaptativa
      const { strategies, elementTypes, recommendedApproach } = categorizeWithAdaptiveStrategy(
        analysis.detection.detected_elements
      );

      const uniqueTypes = Array.from(elementTypes).filter(t => t !== 'silhouette');

      console.log(`\n   🔍 Elementos detectados: ${uniqueTypes.join(', ')}`);
      console.log(`   📈 Tipos únicos: ${uniqueTypes.length}`);
      console.log(`   🎯 Abordagem escolhida: ${recommendedApproach.toUpperCase()}`);

      if (recommendedApproach === 'moderate') {
        console.log(`   ℹ️  Razão: Apenas 1 tipo de elemento - edição focada é melhor`);
      } else {
        console.log(`   ℹ️  Razão: ${uniqueTypes.length} tipos de elementos - remoção agressiva necessária`);
      }

      let category = 'sneaker';
      if (imageFilename.includes('Yeezy')) category = 'Yeezy sneaker';
      else if (imageFilename.includes('Jordan')) category = 'Air Jordan sneaker';

      let currentBase64 = await fileToBase64(imagePath);
      let currentRisk = analysis.detection.riskScore;
      const passResults: any[] = [];

      // Executar baseado na abordagem
      if (recommendedApproach === 'moderate') {
        // V1 Moderada - 1 passagem
        console.log(`\n   ✨ Aplicando V1 MODERADA (1 passagem)...`);

        const moderatePrompt = buildAdaptivePrompt(
          analysis.detection.brands,
          strategies,
          category,
          'moderate',
          1
        );

        const editedBase64 = await editImageWithCustomPrompt(currentBase64, moderatePrompt);
        const verification = await verifyWithGemini(editedBase64);

        console.log(`\n   📈 Resultado:`);
        console.log(`      Risk: ${currentRisk} → ${verification.riskScore}`);
        console.log(`      Melhoria: ${currentRisk - verification.riskScore} pontos`);
        console.log(`      Marcas: ${verification.brands.length > 0 ? verification.brands.join(', ') : 'NENHUMA!'}`);

        currentBase64 = editedBase64;
        currentRisk = verification.riskScore;

        passResults.push({
          pass: 1,
          approach: 'moderate',
          risk_before: analysis.detection.riskScore,
          risk_after: verification.riskScore,
          improvement: analysis.detection.riskScore - verification.riskScore,
          brands_remaining: verification.brands
        });

      } else {
        // V2 Ultra-Agressiva - até 3 passagens
        console.log(`\n   🔥 Aplicando V2 ULTRA-AGRESSIVA (múltiplas passagens)...`);

        for (let pass = 1; pass <= 3; pass++) {
          console.log(`\n   ${'🔥'.repeat(pass)} PASSAGEM ${pass}/3`);

          const aggressivePrompt = buildAdaptivePrompt(
            analysis.detection.brands,
            strategies,
            category,
            'ultra-aggressive',
            pass
          );

          const editedBase64 = await editImageWithCustomPrompt(currentBase64, aggressivePrompt);
          const verification = await verifyWithGemini(editedBase64);

          console.log(`   📈 Pass ${pass}: Risk ${currentRisk} → ${verification.riskScore}`);
          console.log(`      Melhoria: ${currentRisk - verification.riskScore} pontos`);
          console.log(`      Marcas: ${verification.brands.length > 0 ? verification.brands.join(', ') : 'NENHUMA!'}`);

          passResults.push({
            pass,
            approach: 'ultra-aggressive',
            risk_before: currentRisk,
            risk_after: verification.riskScore,
            improvement: currentRisk - verification.riskScore,
            brands_remaining: verification.brands
          });

          currentBase64 = editedBase64;
          currentRisk = verification.riskScore;

          // Se limpo, parar
          if (verification.brands.length === 0 || verification.riskScore < 30) {
            console.log(`   ✅ SUCESSO! Produto limpo na passagem ${pass}!`);
            break;
          }

          if (pass === 3 && (verification.brands.length > 0 || verification.riskScore >= 30)) {
            console.log(`   ⚠️  Ainda detectado após 3 passagens`);
          }

          if (pass < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
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
      console.log(`      Abordagem: ${recommendedApproach}`);
      console.log(`      Passagens: ${passResults.length}`);
      console.log(`      Status: ${finalStatus}`);

      results.push({
        filename: imageFilename,
        original_risk: analysis.detection.riskScore,
        final_risk: currentRisk,
        improvement: totalImprovement,
        approach_used: recommendedApproach,
        element_types: uniqueTypes,
        passes: passResults,
        status: finalStatus
      });

      console.log(`\n   💾 Salvo: debug/test-hybrid-v3/${imageFilename}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename: TEST_PRODUCTS[i],
        status: 'error',
        error: String(error)
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO V3 HÍBRIDA\n');

  const cleanProducts = results.filter(r => r.final_risk < 30).length;
  console.log(`   ✅ Produtos limpos: ${cleanProducts}/3`);
  console.log(`   📈 Taxa de sucesso: ${(cleanProducts / 3 * 100).toFixed(1)}%\n`);

  // Comparação por abordagem
  const moderateResults = results.filter(r => r.approach_used === 'moderate');
  const aggressiveResults = results.filter(r => r.approach_used === 'ultra-aggressive');

  if (moderateResults.length > 0) {
    console.log(`   📋 Produtos com abordagem MODERADA (${moderateResults.length}):`);
    moderateResults.forEach(r => {
      console.log(`      • ${r.filename}: ${r.original_risk} → ${r.final_risk} (${r.improvement > 0 ? '+' : ''}${r.improvement})`);
    });
    console.log('');
  }

  if (aggressiveResults.length > 0) {
    console.log(`   📋 Produtos com abordagem ULTRA-AGRESSIVA (${aggressiveResults.length}):`);
    aggressiveResults.forEach(r => {
      console.log(`      • ${r.filename}: ${r.original_risk} → ${r.final_risk} (${r.improvement > 0 ? '+' : ''}${r.improvement})`);
    });
    console.log('');
  }

  // Salvar relatório
  await fs.writeFile('debug/hybrid-v3-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    version: 'V3 Hybrid Adaptive',
    summary: {
      total: 3,
      clean: cleanProducts,
      success_rate: `${(cleanProducts / 3 * 100).toFixed(1)}%`
    },
    results
  }, null, 2));

  console.log('='.repeat(80));
  console.log('💾 Relatório: debug/hybrid-v3-report.json');
  console.log('📁 Imagens: debug/test-hybrid-v3/');
  console.log('='.repeat(80));
  console.log(`\n✅ TESTE V3 HÍBRIDA CONCLUÍDO! (${cleanProducts}/3 limpos)`);
}

testHybridV3().catch(console.error);
