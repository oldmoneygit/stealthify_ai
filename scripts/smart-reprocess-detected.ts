/**
 * 🎯 SMART REPROCESS - Estratégia inteligente baseada em análises JSON
 *
 * Usa os JSONs de detecção para criar edições PRECISAS e SUTIS
 * mantendo fidelidade ao design original
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editImageWithCustomPrompt } from '@/services/qwen-edit.service';

const DETECTED_DIR = 'debug/detected';
const SMART_REPROCESSED_DIR = 'debug/smart-reprocessed';
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
 * Categoriza elementos detectados e define estratégia específica
 */
function categorizeDetectedElements(elements: string[]): EditStrategy[] {
  const strategies: EditStrategy[] = [];

  for (const element of elements) {
    const lower = element.toLowerCase();

    // Nike Swoosh - Edição SUTIL (manter contorno, remover logo)
    if (lower.includes('swoosh')) {
      strategies.push({
        type: 'swoosh',
        priority: 'high',
        approach: 'subtle',
        prompt_modifier: 'SUBTLY blend the Nike swoosh into the surrounding material. Maintain the panel shape and stitching lines, but COMPLETELY remove the swoosh logo itself. Match the exact color and texture of the surrounding leather/material.'
      });
    }

    // Wings Logo / Jumpman - REMOVER COMPLETAMENTE
    else if (lower.includes('wings') || lower.includes('jumpman')) {
      strategies.push({
        type: 'logo',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'COMPLETELY REMOVE the Jordan Wings/Jumpman logo. Fill the area with matching leather texture and color. Ensure NO traces of the logo remain.'
      });
    }

    // Texto (SPLY-350, NIKE AIR, etc.) - REMOVER COMPLETAMENTE
    else if (lower.includes('text') || lower.includes('wordmark') || lower.includes('sply') || lower.includes('nike air')) {
      strategies.push({
        type: 'text',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'COMPLETELY REMOVE all visible text and wordmarks. Replace with matching material texture. NO text should remain visible.'
      });
    }

    // Padrão LV Monogram - REMOVER mas manter textura
    else if (lower.includes('louis vuitton') || lower.includes('monogram') || lower.includes('lv')) {
      strategies.push({
        type: 'pattern',
        priority: 'high',
        approach: 'remove',
        prompt_modifier: 'REMOVE the Louis Vuitton monogram pattern (LV symbols, flowers, stars). Replace with solid color matching the base material. Maintain material texture but REMOVE all brand patterns.'
      });
    }

    // Silhueta / Design - NÃO EDITAR (é design do produto, não marca)
    else if (lower.includes('silhouette') || lower.includes('design') || lower.includes('shape')) {
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
 * Cria prompt customizado baseado nas estratégias
 */
function buildSmartEditPrompt(
  brands: string[],
  strategies: EditStrategy[],
  productCategory: string
): string {
  // Filtrar apenas estratégias ativas (não ignore)
  const activeStrategies = strategies.filter(s => s.approach !== 'ignore');

  if (activeStrategies.length === 0) {
    return `Remove all brand elements from this ${productCategory} while maintaining design integrity.`;
  }

  // Ordenar por prioridade
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

async function smartReprocess(): Promise<void> {
  console.log('🎯 SMART REPROCESS - Estratégia Inteligente\n');
  console.log('📋 Baseado em análises JSON individuais');
  console.log('✨ Edições precisas e sutis mantendo fidelidade ao design\n');
  console.log('='.repeat(80) + '\n');

  await fs.mkdir(SMART_REPROCESSED_DIR, { recursive: true });

  // Buscar todos os JSONs de análise
  const files = await fs.readdir(DETECTED_DIR);
  const analysisFiles = files.filter(f => f.endsWith('_analysis.json'));

  console.log(`📁 Total de análises: ${analysisFiles.length}\n`);
  console.log('='.repeat(80) + '\n');

  const results: any[] = [];
  let cleanCount = 0;

  for (let i = 0; i < analysisFiles.length; i++) {
    const analysisFile = analysisFiles[i];
    const analysisPath = path.join(DETECTED_DIR, analysisFile);

    // Ler análise
    const analysisContent = await fs.readFile(analysisPath, 'utf-8');
    const analysis: DetectionAnalysis = JSON.parse(analysisContent);

    const imageFilename = analysis.filename;
    const imagePath = path.join(DETECTED_DIR, imageFilename);

    console.log(`[${i + 1}/${analysisFiles.length}] 🔍 ${imageFilename}`);
    console.log(`   📊 Risk Original: ${analysis.detection.riskScore}`);
    console.log(`   🏷️  Marcas: ${analysis.detection.brands.join(', ')}`);

    try {
      // 1. Categorizar elementos detectados
      const strategies = categorizeDetectedElements(analysis.detection.detected_elements);

      console.log(`   🎯 Estratégias identificadas: ${strategies.length}`);
      strategies.forEach(s => {
        if (s.approach !== 'ignore') {
          console.log(`      • ${s.type} (${s.priority} priority) - ${s.approach}`);
        }
      });

      // 2. Determinar categoria do produto
      let category = 'sneaker';
      if (imageFilename.includes('Yeezy')) category = 'Yeezy sneaker';
      else if (imageFilename.includes('Jordan')) category = 'Air Jordan sneaker';
      else if (imageFilename.includes('Dunk')) category = 'Nike Dunk sneaker';
      else if (imageFilename.includes('Air-Force')) category = 'Air Force 1 sneaker';

      // 3. Criar prompt customizado
      const customPrompt = buildSmartEditPrompt(
        analysis.detection.brands,
        strategies,
        category
      );

      console.log(`   📝 Prompt customizado criado (${customPrompt.length} chars)`);

      // 4. Aplicar edição inteligente
      console.log(`   ✨ Aplicando edição inteligente com Qwen Prime...`);

      const imageBase64 = await fileToBase64(imagePath);
      const editedBase64 = await editImageWithCustomPrompt(
        imageBase64,
        customPrompt // Prompt customizado baseado nas detecções específicas
      );

      // 5. Verificar resultado
      console.log(`   🔎 Verificando resultado...`);
      const verification = await verifyWithGemini(editedBase64);

      console.log(`   📈 Risk Final: ${verification.riskScore}`);

      const isClean = verification.brands.length === 0 || verification.riskScore < 30;
      console.log(`   ${isClean ? '✅ LIMPO!' : '⚠️  Ainda detectado: ' + verification.brands.join(', ')}\n`);

      // 6. Salvar
      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );
      await fs.writeFile(path.join(SMART_REPROCESSED_DIR, imageFilename), editedBuffer);

      if (isClean) cleanCount++;

      results.push({
        filename: imageFilename,
        original_risk: analysis.detection.riskScore,
        final_risk: verification.riskScore,
        brands_original: analysis.detection.brands,
        brands_remaining: verification.brands,
        strategies_used: strategies.filter(s => s.approach !== 'ignore').map(s => s.type),
        status: isClean ? 'clean' : 'needs_review',
        improvement: analysis.detection.riskScore - verification.riskScore
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename: imageFilename,
        status: 'error',
        error: String(error)
      });
    }
  }

  // Resumo
  console.log('='.repeat(80));
  console.log('📊 RESUMO DO SMART REPROCESS\n');
  console.log(`   Total processado: ${analysisFiles.length}`);
  console.log(`   ✅ Limpos: ${cleanCount} (${(cleanCount / analysisFiles.length * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  Precisam revisão: ${analysisFiles.length - cleanCount}\n`);

  // Top melhorias
  const improved = results
    .filter(r => r.improvement !== undefined)
    .sort((a, b) => b.improvement - a.improvement)
    .slice(0, 10);

  if (improved.length > 0) {
    console.log('📈 TOP 10 MAIORES MELHORIAS:\n');
    improved.forEach((r, idx) => {
      console.log(`   ${idx + 1}. ${r.filename}`);
      console.log(`      Risk: ${r.original_risk} → ${r.final_risk} (melhoria: ${r.improvement})`);
      console.log(`      Estratégias: ${r.strategies_used.join(', ')}\n`);
    });
  }

  // Salvar relatório
  await fs.writeFile('debug/smart-reprocess-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total_processed: analysisFiles.length,
      clean: cleanCount,
      success_rate: `${(cleanCount / analysisFiles.length * 100).toFixed(1)}%`
    },
    results
  }, null, 2));

  console.log('='.repeat(80));
  console.log('💾 Relatório: debug/smart-reprocess-report.json');
  console.log('📁 Imagens: debug/smart-reprocessed/');
  console.log('='.repeat(80));
  console.log(`\n✅ SMART REPROCESS CONCLUÍDO! (${cleanCount}/${analysisFiles.length} limpos)`);
}

smartReprocess().catch(console.error);
