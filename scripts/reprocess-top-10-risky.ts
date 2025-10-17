/**
 * 🔄 REPROCESS TOP 10 RISKY - Reprocessar os 10 produtos mais arriscados
 *
 * Aplica Qwen Prime com prompts ultra-agressivos para garantir remoção completa
 */

// ⚠️ IMPORTANTE: Carregar variáveis de ambiente ANTES de importar qualquer coisa
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editWithBrandRemoval } from '@/services/qwen-edit.service';

const EDITED_DIR = 'debug/edited';
const REPROCESSED_DIR = 'debug/reprocessed-top-10';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Top 10 produtos com Risk Score 100 (segundo o relatório)
const TOP_10_RISKY = [
  '25819-Adidas-Yeezy-Boost-350-V2-Semi-Frozen-Yellow.jpg',
  '25833-Adidas-Yeezy-Boost-350-V2-Zebra.jpg',
  '25863-Adidas-Yeezy-Boost-700-Magnet.jpg',
  '25872-Air-Jordan-1-Retro-High-Smoke-Grey.jpg',
  '25873-Air-Jordan-1-Retro-High-OG-Heirloom.jpg',
  '25881-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Black-White.jpg',
  '25882-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Coffee.jpg',
  '25886-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Triple-White.jpg',
  '25888-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Yellow.jpg',
  '25890-Nike-Air-Force-1-x-Louis-Vuitton-Low-By-Virgil-Abloh-Black.jpg'
];

interface BrandDetection {
  brands: string[];
  riskScore: number;
  regions: any[];
}

interface VerificationResult {
  brands_detected: string[];
  risk_score: number;
  will_pass_shopify: boolean;
  detected_elements: string[];
  confidence: number;
}

async function fileToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  const resized = await sharp(buffer)
    .resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return resized.toString('base64');
}

async function detectBrands(imageBase64: string, filename: string): Promise<BrandDetection> {
  console.log(`   🔍 Analisando com Gemini Vision...`);

  const prompt = `Analyze this sneaker product image and identify ALL visible commercial brand elements.

IMPORTANT: Focus ONLY on the SNEAKERS/SHOES themselves, NOT on any boxes or packaging.

Return ONLY a JSON object with this exact structure:
{
  "brands": ["Brand1", "Brand2"],
  "riskScore": 0-100,
  "regions": [
    {
      "brand": "Brand1",
      "type": "logo|text|symbol",
      "description": "brief description",
      "location": "where on the shoe"
    }
  ]
}

Look for logos, text, symbols ONLY on the actual footwear.
riskScore: 0-30 clean, 30-60 minor, 60+ major branding.`;

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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No content in Gemini response');
  }

  const detection = JSON.parse(content);

  console.log(`   📊 Risk Score: ${detection.riskScore}`);
  console.log(`   🎯 Marcas: ${detection.brands.length > 0 ? detection.brands.join(', ') : 'Nenhuma'}`);

  return detection;
}

async function verifyShopifyCompliance(imageBase64: string): Promise<VerificationResult> {
  console.log(`   ✅ Verificando conformidade Shopify...`);

  const prompt = `You are an AI verification system for Shopify.

Analyze this product image with EXTREME SCRUTINY to detect ANY remaining brand elements.

Focus ONLY on the ACTUAL PRODUCT (shoes/sneakers), IGNORE any boxes or packaging.

Look for:
- Brand logos (Nike swoosh, Jordan jumpman, Adidas stripes, etc.)
- Brand text/wordmarks (even partial or faded)
- Brand symbols or icons ON THE SHOES

Return ONLY a JSON object:
{
  "brands_detected": ["Brand1", "Brand2"],
  "risk_score": 0-100,
  "detected_elements": ["description of what was found ON THE SHOES"],
  "confidence": 0-100,
  "will_pass_shopify": true/false
}

Risk scale:
- 0-20: Clean, will definitely pass
- 21-40: Minor traces, might pass
- 41-60: Moderate branding, likely will fail
- 61-100: Strong branding, will definitely fail

Be VERY STRICT about logos/text ON THE ACTUAL FOOTWEAR.`;

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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No content in Gemini response');
  }

  const analysis = JSON.parse(content);

  console.log(`   📈 Risk após edição: ${analysis.risk_score}`);
  console.log(`   ${analysis.will_pass_shopify ? '✅ PASSA' : '❌ NÃO PASSA'} na Shopify`);

  return analysis;
}

async function reprocessTopRisky(): Promise<void> {
  console.log('🔄 REPROCESSANDO TOP 10 PRODUTOS MAIS ARRISCADOS\n');
  console.log('🎯 Estratégia: Qwen Prime com prompts ultra-agressivos');
  console.log('📋 Foco: Remover APENAS marcas no produto (ignorar caixas)\n');
  console.log('='.repeat(80) + '\n');

  // Criar pasta de reprocessados
  await fs.mkdir(REPROCESSED_DIR, { recursive: true });

  const results: any[] = [];

  for (let i = 0; i < TOP_10_RISKY.length; i++) {
    const filename = TOP_10_RISKY[i];
    const filePath = path.join(EDITED_DIR, filename);

    console.log(`\n[${i + 1}/${TOP_10_RISKY.length}] 📦 Processando: ${filename}`);
    console.log('─'.repeat(80));

    try {
      // 1. Converter para base64
      const imageBase64 = await fileToBase64(filePath);

      // 2. Detectar marcas com foco no PRODUTO (não na caixa)
      const detection = await detectBrands(imageBase64, filename);

      if (detection.brands.length === 0 || detection.riskScore < 40) {
        console.log(`   ℹ️  Produto já está limpo (Risk ${detection.riskScore})`);
        console.log(`   💾 Copiando para pasta reprocessed...`);

        // Copiar original
        const destPath = path.join(REPROCESSED_DIR, filename);
        await fs.copyFile(filePath, destPath);

        results.push({
          filename,
          action: 'copied',
          original_risk: detection.riskScore,
          final_risk: detection.riskScore,
          brands_removed: [],
          status: 'already_clean'
        });

        continue;
      }

      // 3. Aplicar Qwen Prime com prompt ULTRA agressivo
      console.log(`   ✨ Aplicando Qwen Prime (remoção ultra-agressiva)...`);

      const category = filename.includes('Yeezy') ? 'sneaker' :
                      filename.includes('Jordan') ? 'sneaker' :
                      filename.includes('Dunk') ? 'sneaker' : 'sneaker';

      const editedBase64 = await editWithBrandRemoval(
        imageBase64,
        detection.brands,
        category
      );

      // 4. Verificar com Gemini (foco no produto)
      const verification = await verifyShopifyCompliance(editedBase64);

      // 5. Salvar imagem reprocessada
      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );

      const destPath = path.join(REPROCESSED_DIR, filename);
      await fs.writeFile(destPath, editedBuffer);

      console.log(`   💾 Salvo em: debug/reprocessed-top-10/${filename}`);

      results.push({
        filename,
        action: 'reprocessed',
        original_risk: detection.riskScore,
        final_risk: verification.risk_score,
        brands_removed: detection.brands,
        brands_remaining: verification.brands_detected,
        status: verification.will_pass_shopify ? 'approved' : 'needs_more_work',
        improvement: detection.riskScore - verification.risk_score
      });

      // Pequeno delay
      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}`);
      results.push({
        filename,
        action: 'failed',
        error: String(error)
      });
    }
  }

  // Resumo final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DO REPROCESSAMENTO\n');

  const approved = results.filter(r => r.status === 'approved').length;
  const alreadyClean = results.filter(r => r.status === 'already_clean').length;
  const needsWork = results.filter(r => r.status === 'needs_more_work').length;
  const failed = results.filter(r => r.action === 'failed').length;

  console.log(`   ✅ Aprovados (passam Shopify): ${approved}`);
  console.log(`   🟢 Já estavam limpos: ${alreadyClean}`);
  console.log(`   ⚠️  Precisam mais trabalho: ${needsWork}`);
  console.log(`   ❌ Falharam: ${failed}\n`);

  // Top melhorias
  const reprocessed = results.filter(r => r.action === 'reprocessed');
  if (reprocessed.length > 0) {
    console.log('📈 MAIORES MELHORIAS:\n');

    reprocessed
      .sort((a, b) => (b.improvement || 0) - (a.improvement || 0))
      .slice(0, 5)
      .forEach((r, idx) => {
        console.log(`   ${idx + 1}. ${r.filename}`);
        console.log(`      Risk: ${r.original_risk} → ${r.final_risk} (melhoria: ${r.improvement})`);
        console.log(`      Status: ${r.status === 'approved' ? '✅ PASSA' : '⚠️ Precisa mais'}\n`);
      });
  }

  // Produtos que ainda precisam trabalho
  const needsMoreWork = results.filter(r => r.status === 'needs_more_work');
  if (needsMoreWork.length > 0) {
    console.log('⚠️  PRODUTOS QUE AINDA PRECISAM ATENÇÃO:\n');

    needsMoreWork.forEach((r) => {
      console.log(`   • ${r.filename}`);
      console.log(`     Risk final: ${r.final_risk}`);
      console.log(`     Marcas restantes: ${r.brands_remaining?.join(', ') || 'N/A'}\n`);
    });
  }

  // Salvar relatório
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_processed: TOP_10_RISKY.length,
      approved,
      already_clean: alreadyClean,
      needs_more_work: needsWork,
      failed
    },
    results
  };

  await fs.writeFile(
    'debug/reprocess-top-10-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('='.repeat(80));
  console.log('💾 Relatório salvo: debug/reprocess-top-10-report.json');
  console.log('📁 Imagens salvas: debug/reprocessed-top-10/');
  console.log('='.repeat(80));
  console.log('\n✅ REPROCESSAMENTO CONCLUÍDO!');
}

// Execute
reprocessTopRisky().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
