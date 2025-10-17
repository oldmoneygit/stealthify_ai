/**
 * Analyze Blur Levels in Edited Images
 *
 * Computationally analyzes all edited images to detect blur intensity
 * Uses Laplacian variance to measure image sharpness
 *
 * Low variance = More blur
 * High variance = Sharp/Clear image
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const DB_PATH = path.join(process.cwd(), 'database', 'products.db');

interface Product {
  id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  edited_image_base64: string;
  edited_image_filepath: string;
  status: string;
}

interface BlurAnalysis {
  product_id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  filepath: string;
  blur_score: number; // 0-100 (higher = more blur detected)
  sharpness_score: number; // Laplacian variance
  has_significant_blur: boolean;
}

/**
 * Calculate Laplacian variance (measure of image sharpness)
 * Lower values = more blur
 */
async function calculateSharpness(imagePath: string): Promise<number> {
  try {
    // Load image and convert to grayscale
    const { data, info } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    // Apply Laplacian kernel to detect edges
    // Sharp edges = high variance = less blur
    // Smooth areas = low variance = more blur
    let laplacianSum = 0;
    let count = 0;

    // Laplacian kernel 3x3:
    // [ 0  1  0 ]
    // [ 1 -4  1 ]
    // [ 0  1  0 ]

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const center = data[idx];
        const top = data[(y - 1) * width + x];
        const bottom = data[(y + 1) * width + x];
        const left = data[y * width + (x - 1)];
        const right = data[y * width + (x + 1)];

        const laplacian = Math.abs(
          top + bottom + left + right - 4 * center
        );

        laplacianSum += laplacian * laplacian;
        count++;
      }
    }

    // Calculate variance
    const variance = laplacianSum / count;
    return variance;

  } catch (error) {
    console.error(`   ❌ Error calculating sharpness:`, error);
    return 0;
  }
}

/**
 * Analyze blur in a region by comparing edge strength
 */
async function analyzeBlurLevel(imagePath: string): Promise<number> {
  const sharpness = await calculateSharpness(imagePath);

  // Convert sharpness to blur score (0-100)
  // Typical sharpness values:
  // - Very sharp: 500+
  // - Normal: 200-500
  // - Slightly blurred: 100-200
  // - Moderately blurred: 50-100
  // - Heavily blurred: 0-50

  let blurScore = 0;

  if (sharpness < 50) {
    blurScore = 100; // Very high blur
  } else if (sharpness < 100) {
    blurScore = 80; // High blur
  } else if (sharpness < 150) {
    blurScore = 60; // Moderate blur
  } else if (sharpness < 200) {
    blurScore = 40; // Some blur
  } else if (sharpness < 300) {
    blurScore = 20; // Slight blur
  } else {
    blurScore = 0; // Sharp/no blur
  }

  return blurScore;
}

async function main() {
  console.log('🔍 Analisando níveis de blur em imagens editadas...\n');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Get all products with blur_applied status
  const products = db.prepare(`
    SELECT
      p.id,
      p.woo_product_id,
      p.sku,
      p.name,
      a.edited_image_base64,
      a.edited_image_filepath,
      a.status
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.status = 'blur_applied'
    ORDER BY p.id ASC
  `).all() as Product[];

  console.log(`📊 Encontrados ${products.length} produtos com blur aplicado\n`);

  const results: BlurAnalysis[] = [];
  let analyzed = 0;

  for (const product of products) {
    analyzed++;
    console.log(`\n[${analyzed}/${products.length}] Analisando: ${product.name}`);
    console.log(`   SKU: ${product.sku}`);

    // Check if file exists
    const filepath = product.edited_image_filepath;
    if (!filepath || !fs.existsSync(filepath)) {
      console.log(`   ⚠️ Arquivo não encontrado: ${filepath}`);
      continue;
    }

    console.log(`   📁 Arquivo: ${path.basename(filepath)}`);

    // Calculate blur level
    const sharpness = await calculateSharpness(filepath);
    const blurScore = await analyzeBlurLevel(filepath);

    const hasSignificantBlur = blurScore >= 50; // 50+ = significant blur

    console.log(`   🔬 Sharpness: ${sharpness.toFixed(2)}`);
    console.log(`   🌫️ Blur Score: ${blurScore}/100`);
    console.log(`   ${hasSignificantBlur ? '⚠️ BLUR SIGNIFICATIVO DETECTADO' : '✅ Blur leve'}`);

    results.push({
      product_id: product.id,
      woo_product_id: product.woo_product_id,
      sku: product.sku,
      name: product.name,
      filepath,
      blur_score: blurScore,
      sharpness_score: sharpness,
      has_significant_blur: hasSignificantBlur
    });
  }

  db.close();

  // Save results to JSON
  const outputPath = path.join(process.cwd(), 'debug', 'blur-analysis-results.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // Generate statistics
  console.log('\n\n📊 ESTATÍSTICAS DE BLUR:\n');
  console.log('━'.repeat(60));

  const withSignificantBlur = results.filter(r => r.has_significant_blur);
  const blurRate = Math.round((withSignificantBlur.length / results.length) * 100);

  console.log(`Total analisado: ${results.length} produtos`);
  console.log(`Com blur significativo (≥50): ${withSignificantBlur.length} (${blurRate}%)`);
  console.log(`Com blur leve (<50): ${results.length - withSignificantBlur.length}`);

  // Calculate average blur scores by category
  const veryHighBlur = results.filter(r => r.blur_score >= 80).length;
  const highBlur = results.filter(r => r.blur_score >= 60 && r.blur_score < 80).length;
  const moderateBlur = results.filter(r => r.blur_score >= 40 && r.blur_score < 60).length;
  const lowBlur = results.filter(r => r.blur_score < 40).length;

  console.log('\n📈 Distribuição por Intensidade:');
  console.log(`   🔴 Muito Alto (80-100): ${veryHighBlur} produtos`);
  console.log(`   🟠 Alto (60-79): ${highBlur} produtos`);
  console.log(`   🟡 Moderado (40-59): ${moderateBlur} produtos`);
  console.log(`   🟢 Baixo (0-39): ${lowBlur} produtos`);

  // Top 10 products with most blur
  console.log('\n🏆 TOP 10 Produtos com MAIOR Blur:');
  console.log('━'.repeat(60));
  const topBlurred = [...results]
    .sort((a, b) => b.blur_score - a.blur_score)
    .slice(0, 10);

  topBlurred.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.name}`);
    console.log(`   SKU: ${r.sku} | Blur: ${r.blur_score}/100 | Sharpness: ${r.sharpness_score.toFixed(2)}`);
  });

  console.log('\n\n✅ Análise completa!');
  console.log(`📁 Resultados salvos em: ${outputPath}`);
  console.log('\n💡 Use esses dados para atualizar a página de revisão de blur');
}

main().catch(console.error);
