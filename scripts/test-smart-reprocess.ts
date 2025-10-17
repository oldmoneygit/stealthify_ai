/**
 * 🧪 TEST SMART REPROCESS - Testar com 3 produtos
 *
 * Valida a estratégia inteligente antes de processar os 67 produtos
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editImageWithCustomPrompt } from '@/services/qwen-edit.service';

const DETECTED_DIR = 'debug/detected';
const TEST_OUTPUT_DIR = 'debug/test-smart-reprocess';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Testar 3 produtos com diferentes desafios:
// 1. Nike swoosh (mais comum)
// 2. Yeezy texto SPLY-350 (texto)
// 3. Jordan Wings logo (logo no colarinho)
const TEST_PRODUCTS = [
  '25899-Nike-Air-Jordan-1-High-Bred-Banned-2016_analysis.json',  // Nike swoosh
  '25819-Adidas-Yeezy-Boost-350-V2-Semi-Frozen-Yellow_analysis.json',  // Yeezy SPLY-350
  '26061-Nike-Air-Jordan-1-Retro-High-Fragment_analysis.json'  // Nike swoosh + Wings logo
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
  approach: 'remove' | 'subtle' | 'ignore';
  prompt_modifier: string;
}

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

function buildSmartEditPrompt(
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

async function testSmartReprocess(): Promise<void> {
  console.log('🧪 TEST SMART REPROCESS - Validação com 3 Produtos\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < TEST_PRODUCTS.length; i++) {
    const analysisFile = TEST_PRODUCTS[i];
    const analysisPath = path.join(DETECTED_DIR, analysisFile);

    console.log(`\n[${i + 1}/3] 🔍 ${analysisFile}`);
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
      console.log(`   📋 Elementos detectados:`);
      analysis.detection.detected_elements.forEach(el => {
        console.log(`      • ${el}`);
      });

      // Categorizar estratégias
      const strategies = categorizeDetectedElements(analysis.detection.detected_elements);
      console.log(`\n   🎯 Estratégias identificadas: ${strategies.length}`);
      strategies.forEach(s => {
        if (s.approach !== 'ignore') {
          console.log(`      • ${s.type} (${s.priority} priority) - ${s.approach}`);
        }
      });

      // Determinar categoria
      let category = 'sneaker';
      if (imageFilename.includes('Yeezy')) category = 'Yeezy sneaker';
      else if (imageFilename.includes('Jordan')) category = 'Air Jordan sneaker';

      // Criar prompt customizado
      const customPrompt = buildSmartEditPrompt(
        analysis.detection.brands,
        strategies,
        category
      );

      console.log(`\n   📝 Prompt customizado:`);
      console.log('   ' + '─'.repeat(76));
      console.log(`   ${customPrompt.substring(0, 200)}...`);
      console.log('   ' + '─'.repeat(76));

      // Aplicar edição
      console.log(`\n   ✨ Aplicando edição inteligente...`);
      const imageBase64 = await fileToBase64(imagePath);
      const editedBase64 = await editImageWithCustomPrompt(imageBase64, customPrompt);

      // Verificar
      console.log(`   🔎 Verificando resultado...`);
      const verification = await verifyWithGemini(editedBase64);

      console.log(`\n   📈 Resultados:`);
      console.log(`      Risk Original: ${analysis.detection.riskScore}`);
      console.log(`      Risk Final: ${verification.riskScore}`);
      console.log(`      Melhoria: ${analysis.detection.riskScore - verification.riskScore} pontos`);
      console.log(`      Status: ${verification.brands.length === 0 ? '✅ LIMPO!' : '⚠️  Ainda detectado: ' + verification.brands.join(', ')}`);

      // Salvar
      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );
      await fs.writeFile(path.join(TEST_OUTPUT_DIR, imageFilename), editedBuffer);

      console.log(`\n   💾 Salvo: debug/test-smart-reprocess/${imageFilename}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ TESTE CONCLUÍDO!');
  console.log('📁 Verificar resultados em: debug/test-smart-reprocess/');
  console.log('='.repeat(80));
}

testSmartReprocess().catch(console.error);
