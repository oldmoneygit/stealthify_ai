/**
 * 🔄 REPROCESS BATCH 5 - Próximos 20 produtos
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editWithBrandRemoval } from '@/services/qwen-edit.service';

const EDITED_DIR = 'debug/edited';
const REPROCESSED_DIR = 'debug/reprocessed-batch-5';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

const ALREADY_PROCESSED = new Set([
  // Batch 1 (10 produtos)
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

  // Batch 2 (20 produtos)
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
  '26034-Nike-Air-Jordan-1-Mid-SE-Space-Jam.jpg',
  '26047-Nike-Air-Jordan-1-Retro-High-OG-Dark-Mocha.jpg',
  '26065-Nike-Air-Jordan-1-Retro-High-OG-Hyper-Royal.jpg',
  '26069-Nike-Air-Jordan-1-Retro-High-OG-Obsidian.jpg',
  '26072-Nike-Air-Jordan-1-Retro-High-OG-Pine-Green.jpg',
  '26076-Nike-Air-Jordan-1-Retro-High-OG-Shattered-Backboard-3.0.jpg',
  '26078-Nike-Air-Jordan-1-Retro-High-OG-Turbo-Green.jpg',
  '26079-Nike-Air-Jordan-1-Retro-High-OG-University-Blue.jpg',
  '26087-Nike-Air-Jordan-1-Retro-High-OG-Bordeaux.jpg',

  // Batch 3 (20 produtos)
  '26050-Nike-Air-Jordan-1-Retro-Shattered-Backboard.jpg',
  '26052-Nike-Air-Jordan-1-Retro-High-Element-Gore-Tex-Black-Particle-Grey.jpg',
  '26059-Nike-Air-Jordan-1-Retro-High-Court-Purple-2.0.jpg',
  '26061-Nike-Air-Jordan-1-Retro-High-Fragment.jpg',
  '26065-Nike-Air-Jordan-1-Retro-High-Top-3.jpg',
  '26067-Nike-Air-Jordan-1-Retro-High-Black-White.jpg',
  '26070-Nike-Air-Jordan-1-Retro-High-J.-Balvin.jpg',
  '26156-Nike-Air-Jordan-4-Retro-White-Cement.jpg',
  '26198-Nike-Dunk-High-Dark-Sulfur-Turmeric.jpg',
  '26209-Nike-Dunk-High-Championship-White-Red.jpg',
  '26210-Nike-Dunk-High-Sports-Specialties.jpg',
  '26228-Nike-Dunk-Low-Halloween.jpg',
  '26253-Nike-Dunk-Low-Community-Garden.jpg',
  '26291-Nike-Dunk-Low-SB-Bordeaux.jpg',
  '26307-Nike-Dunk-Low-x-Dover-Street-Market.jpg',
  '26316-Nike-Dunk-Low-x-Off-White-THE-50-0750.jpg',
  '26336-Nike-Dunk-Low-x-Off-White-THE-50-3250.jpg',
  '26384-Nike-SB-Dunk-Low-Pro-Heineken.jpg',
  '26397-Nike-SB-Dunk-Low-Wheat-Mocha.jpg',
  '26420-Nike-x-Sean-Cliver-SB-Dunk-Low-Holiday-Special.jpg',

  // Batch 4 (20 produtos)
  '25803-Adidas-Yeezy-Boost-350-Pirate-Black.jpg',
  '25805-Adidas-Yeezy-Boost-350-V2-Beluga.jpg',
  '25807-Adidas-Yeezy-Boost-350-V2-Bred.jpg',
  '25808-Adidas-Yeezy-Boost-350-V2-Cream-White.jpg',
  '25831-Adidas-Yeezy-Boost-350-V2-Static.jpg',
  '25835-Adidas-Yeezy-Boost-380-Blue-Oat-Reflective.jpg',
  '25836-Adidas-Yeezy-Boost-380-Calcite-Glow.jpg',
  '25839-Adidas-Yeezy-Boost-380-Mist.jpg',
  '25840-Adidas-Yeezy-Boost-380-Pepper.jpg',
  '25842-Adidas-Yeezy-Boost-700-Analog.jpg',
  '25843-Adidas-Yeezy-Boost-700-Carbon-Blue.jpg',
  '25844-Adidas-Yeezy-Boost-700-Enflame-Amber.jpg',
  '25845-Adidas-Yeezy-Boost-700-Inertia.jpg',
  '25847-Adidas-Yeezy-Boost-700-Mauve.jpg',
  '25850-Adidas-Yeezy-Boost-700-Sun.jpg',
  '25851-Adidas-Yeezy-Boost-700-Teal-Blue.jpg',
  '25852-Adidas-Yeezy-Boost-700-V2-Cream.jpg',
  '25853-Adidas-Yeezy-Boost-700-V2-Static.jpg',
  '25854-Adidas-Yeezy-Boost-700-V2-Vanta.jpg',
  '25856-Adidas-Yeezy-Boost-700-Wave-Runner.jpg'
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
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return resized.toString('base64');
}

async function detectBrands(imageBase64: string): Promise<BrandDetection> {
  const prompt = `Analyze this sneaker product image and identify ALL visible commercial brand elements.

IMPORTANT: Focus ONLY on the SNEAKERS/SHOES themselves, NOT on any boxes or packaging.

Return ONLY a JSON object:
{
  "brands": ["Brand1", "Brand2"],
  "riskScore": 0-100,
  "regions": [{"brand": "Brand1", "type": "logo|text|symbol", "description": "brief", "location": "where"}]
}

Look for logos, text, symbols ONLY on the actual footwear.
riskScore: 0-30 clean, 30-60 minor, 60+ major branding.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const result = await response.json();
  return JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function verifyShopifyCompliance(imageBase64: string): Promise<VerificationResult> {
  const prompt = `You are an AI verification system for Shopify.

Analyze this product image to detect ANY remaining brand elements.

Focus ONLY on the ACTUAL PRODUCT (shoes/sneakers), IGNORE any boxes or packaging.

Return ONLY a JSON object:
{
  "brands_detected": ["Brand1"],
  "risk_score": 0-100,
  "detected_elements": ["description"],
  "confidence": 0-100,
  "will_pass_shopify": true/false
}

Risk scale: 0-20 clean, 21-40 minor, 41-60 moderate, 61-100 fail.
Be VERY STRICT about logos/text ON THE ACTUAL FOOTWEAR.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const result = await response.json();
  return JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
}

async function findNextProducts(count: number): Promise<string[]> {
  console.log('🔍 Buscando próximos produtos...\n');

  const reportPath = 'debug/shopify-compliance-report.json';
  const reportContent = await fs.readFile(reportPath, 'utf-8');
  const report = JSON.parse(reportContent);

  const riskyProducts = report.risky_products
    .filter((p: any) => !ALREADY_PROCESSED.has(p.filename))
    .sort((a: any, b: any) => b.risk_score - a.risk_score);

  const selected: string[] = [];

  for (const product of riskyProducts) {
    if (selected.length >= count) break;

    const filePath = path.join(EDITED_DIR, product.filename);
    try {
      await fs.access(filePath);
      selected.push(product.filename);
      console.log(`   ✓ ${product.filename} (Risk: ${product.risk_score})`);
    } catch {
      console.log(`   ✗ ${product.filename} (não encontrado)`);
    }
  }

  console.log(`\n📋 Total: ${selected.length} produtos\n`);
  return selected;
}

async function reprocessBatch5(): Promise<void> {
  console.log('🔄 BATCH 5 - PRÓXIMOS 20 PRODUTOS\n');
  console.log('='.repeat(80) + '\n');

  const productsToProcess = await findNextProducts(20);
  if (productsToProcess.length === 0) {
    console.log('⚠️  Nenhum produto disponível!');
    return;
  }

  await fs.mkdir(REPROCESSED_DIR, { recursive: true });

  const results: any[] = [];

  for (let i = 0; i < productsToProcess.length; i++) {
    const filename = productsToProcess[i];
    const filePath = path.join(EDITED_DIR, filename);

    console.log(`[${i + 1}/${productsToProcess.length}] ${filename}`);

    try {
      const imageBase64 = await fileToBase64(filePath);
      const detection = await detectBrands(imageBase64);

      console.log(`   Risk: ${detection.riskScore} | Marcas: ${detection.brands.join(', ') || 'Nenhuma'}`);

      if (detection.brands.length === 0 || detection.riskScore < 40) {
        await fs.copyFile(filePath, path.join(REPROCESSED_DIR, filename));
        results.push({ filename, action: 'copied', final_risk: detection.riskScore, status: 'already_clean' });
        console.log(`   ✅ Já limpo\n`);
        continue;
      }

      const editedBase64 = await editWithBrandRemoval(imageBase64, detection.brands, 'sneaker');
      const verification = await verifyShopifyCompliance(editedBase64);

      const editedBuffer = Buffer.from(editedBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      await fs.writeFile(path.join(REPROCESSED_DIR, filename), editedBuffer);

      results.push({
        filename,
        action: 'reprocessed',
        original_risk: detection.riskScore,
        final_risk: verification.risk_score,
        status: verification.will_pass_shopify ? 'approved' : 'needs_more_work'
      });

      console.log(`   ${verification.will_pass_shopify ? '✅' : '⚠️'} Final: ${verification.risk_score}\n`);

      await new Promise(resolve => setTimeout(resolve, 1500));

    } catch (error) {
      console.error(`   ❌ Erro: ${error}\n`);
      results.push({ filename, action: 'failed', error: String(error) });
    }
  }

  const approved = results.filter(r => r.status === 'approved').length;
  const alreadyClean = results.filter(r => r.status === 'already_clean').length;

  console.log('='.repeat(80));
  console.log(`📊 BATCH 5: ${approved + alreadyClean}/${productsToProcess.length} aprovados (${((approved + alreadyClean) / productsToProcess.length * 100).toFixed(1)}%)\n`);

  await fs.writeFile('debug/reprocess-batch-5-report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    batch: 5,
    summary: { total_processed: productsToProcess.length, approved, already_clean: alreadyClean },
    results
  }, null, 2));

  console.log('💾 debug/reprocess-batch-5-report.json');
  console.log('📁 debug/reprocessed-batch-5/\n');
}

reprocessBatch5().catch(console.error);
