/**
 * 🔄 REPROCESS BATCH 3 - Próximos 20 produtos
 *
 * Busca produtos com risk score alto que ainda não foram processados
 */

// ⚠️ IMPORTANTE: Carregar variáveis de ambiente ANTES de importar qualquer coisa
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editWithBrandRemoval } from '@/services/qwen-edit.service';

const EDITED_DIR = 'debug/edited';
const REPROCESSED_DIR = 'debug/reprocessed-batch-3';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Produtos já processados (para pular)
const ALREADY_PROCESSED = new Set([
  '25819-Adidas-Yeezy-Boost-350-V2-Semi-Frozen-Yellow.jpg',
  '25833-Adidas-Yeezy-Boost-350-V2-Zebra.jpg',
  '25863-Adidas-Yeezy-Boost-700-Magnet.jpg',
  '25872-Air-Jordan-1-Retro-High-Smoke-Grey.jpg',
  '25873-Air-Jordan-1-Retro-High-OG-Heirloom.jpg',
  '25881-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Black-White.jpg',
  '25882-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Coffee.jpg',
  '25886-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Triple-White.jpg',
  '25888-Nike-Air-Force-1-Low-x-Louis-Vuitton-x-Off-White-Yellow.jpg',
  '25890-Nike-Air-Force-1-x-Louis-Vuitton-Low-By-Virgil-Abloh-Black.jpg',
  '25899-Nike-Air-Jordan-1-High-Bred-Banned-2016.jpg',
  '25903-Nike-Air-Jordan-1-High-Heritage.jpg',
  '25907-Nike-Air-Jordan-1-High-UNC.jpg',
  '25909-Nike-Air-Jordan-1-High-Visionaire-Volt.jpg',
  '25915-Nike-Air-Jordan-1-High-OG-Seafoam.jpg',
  '25922-Nike-Air-Jordan-1-High-Wmns-Twist.jpg',
  '25926-Nike-Air-Jordan-1-High-Black-Metallic-Gold.jpg',
  '25940-Nike-Air-Jordan-1-Low-Black-Phantom.jpg',
  '25963-Nike-Air-Jordan-1-Low-Voodo.jpg',
  '25988-Nike-Air-Jordan-1-Mid-Diamond-Shorts.jpg',
  '25991-Nike-Air-Jordan-1-Mid-Barely-Rose.jpg',
  '26034-Nike-Air-Jordan-1-Mid-SE-Space-Jam.jpg'
]);

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

  return JSON.parse(content);
}

async function verifyShopifyCompliance(imageBase64: string): Promise<VerificationResult> {
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

  return JSON.parse(content);
}

async function findNextProducts(count: number): Promise<string[]> {
  console.log('🔍 Buscando próximos produtos para processar...\n');

  // Ler relatório de conformidade
  const reportPath = 'debug/shopify-compliance-report.json';
  const reportContent = await fs.readFile(reportPath, 'utf-8');
  const report = JSON.parse(reportContent);

  // Filtrar produtos arriscados que ainda não foram processados
  const riskyProducts = report.risky_products
    .filter((p: any) => !ALREADY_PROCESSED.has(p.filename))
    .sort((a: any, b: any) => b.risk_score - a.risk_score);

  const selected: string[] = [];

  for (const product of riskyProducts) {
    if (selected.length >= count) break;

    // Verificar se arquivo existe
    const filePath = path.join(EDITED_DIR, product.filename);
    try {
      await fs.access(filePath);
      selected.push(product.filename);
      console.log(`   ✓ ${product.filename} (Risk: ${product.risk_score})`);
    } catch {
      console.log(`   ✗ ${product.filename} (não encontrado)`);
    }
  }

  console.log(`\n📋 Total selecionado: ${selected.length} produtos\n`);
  return selected;
}

async function reprocessBatch3(): Promise<void> {
  console.log('🔄 REPROCESSANDO BATCH 3 - PRÓXIMOS 20 PRODUTOS\n');
  console.log('🎯 Estratégia: Qwen Prime com prompts ultra-agressivos');
  console.log('📋 Foco: Produtos de alto risco ainda não processados\n');
  console.log('='.repeat(80) + '\n');

  // Buscar próximos 20 produtos
  const productsToProcess = await findNextProducts(20);

  if (productsToProcess.length === 0) {
    console.log('⚠️  Nenhum produto disponível para processar!');
    return;
  }

  // Criar pasta de reprocessados
  await fs.mkdir(REPROCESSED_DIR, { recursive: true });

  const results: any[] = [];
  let approvedCount = 0;

  for (let i = 0; i < productsToProcess.length; i++) {
    const filename = productsToProcess[i];
    const filePath = path.join(EDITED_DIR, filename);

    console.log(`[${i + 1}/${productsToProcess.length}] 📦 Processando: ${filename}`);
    console.log('─'.repeat(80));

    try {
      // 1. Converter para base64
      console.log(`   🔍 Analisando com Gemini Vision...`);
      const imageBase64 = await fileToBase64(filePath);

      // 2. Detectar marcas
      const detection = await detectBrands(imageBase64, filename);
      console.log(`   📊 Risk Score: ${detection.riskScore}`);
      console.log(`   🎯 Marcas: ${detection.brands.length > 0 ? detection.brands.join(', ') : 'Nenhuma'}`);

      if (detection.brands.length === 0 || detection.riskScore < 40) {
        console.log(`   ℹ️  Produto já está limpo (Risk ${detection.riskScore})`);
        console.log(`   💾 Copiando para pasta reprocessed...\n`);

        const destPath = path.join(REPROCESSED_DIR, filename);
        await fs.copyFile(filePath, destPath);

        results.push({
          filename,
          action: 'copied',
          original_risk: detection.riskScore,
          final_risk: detection.riskScore,
          status: 'already_clean'
        });

        approvedCount++;
        continue;
      }

      // 3. Aplicar Qwen Prime
      console.log(`   ✨ Aplicando Qwen Prime (remoção ultra-agressiva)...`);

      const editedBase64 = await editWithBrandRemoval(
        imageBase64,
        detection.brands,
        'sneaker'
      );

      // 4. Verificar
      console.log(`   ✅ Verificando conformidade Shopify...`);
      const verification = await verifyShopifyCompliance(editedBase64);

      console.log(`   📈 Risk após edição: ${verification.risk_score}`);
      console.log(`   ${verification.will_pass_shopify ? '✅ PASSA' : '❌ NÃO PASSA'} na Shopify`);

      // 5. Salvar
      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );

      const destPath = path.join(REPROCESSED_DIR, filename);
      await fs.writeFile(destPath, editedBuffer);

      console.log(`   💾 Salvo em: debug/reprocessed-batch-3/${filename}\n`);

      if (verification.will_pass_shopify) {
        approvedCount++;
      }

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

      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({
        filename,
        action: 'failed',
        error: String(error)
      });
    }
  }

  // Resumo
  console.log('='.repeat(80));
  console.log('📊 RESUMO DO REPROCESSAMENTO (BATCH 3)\n');

  const approved = results.filter(r => r.status === 'approved').length;
  const alreadyClean = results.filter(r => r.status === 'already_clean').length;
  const needsWork = results.filter(r => r.status === 'needs_more_work').length;
  const failed = results.filter(r => r.action === 'failed').length;

  console.log(`   ✅ Aprovados (passam Shopify): ${approved}`);
  console.log(`   🟢 Já estavam limpos: ${alreadyClean}`);
  console.log(`   ⚠️  Precisam mais trabalho: ${needsWork}`);
  console.log(`   ❌ Falharam: ${failed}\n`);

  const totalApproved = approved + alreadyClean;
  const successRate = ((totalApproved / productsToProcess.length) * 100).toFixed(1);
  console.log(`   📈 Taxa de sucesso: ${successRate}%\n`);

  // Aprovados
  const approvedProducts = results.filter(r => r.status === 'approved' || r.status === 'already_clean');
  if (approvedProducts.length > 0) {
    console.log('✅ PRODUTOS APROVADOS:\n');
    approvedProducts.forEach((r) => {
      console.log(`   • ${r.filename} (Risk: ${r.final_risk})`);
    });
    console.log('');
  }

  // Salvar relatório
  const report = {
    timestamp: new Date().toISOString(),
    batch: 3,
    summary: {
      total_processed: productsToProcess.length,
      approved,
      already_clean: alreadyClean,
      needs_more_work: needsWork,
      failed,
      success_rate: successRate + '%'
    },
    results
  };

  await fs.writeFile(
    'debug/reprocess-batch-3-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('='.repeat(80));
  console.log('💾 Relatório: debug/reprocess-batch-3-report.json');
  console.log('📁 Imagens: debug/reprocessed-batch-3/');
  console.log('='.repeat(80));
  console.log(`\n✅ BATCH 3 CONCLUÍDO! (${totalApproved}/${productsToProcess.length} aprovados)`);
}

// Execute
reprocessBatch3().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
