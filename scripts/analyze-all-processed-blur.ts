/**
 * Analyze Blur in ALL Processed Images (from directories)
 *
 * Scans all processed-*-v2 directories and analyzes blur levels
 */

import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const BASE_DIR = path.join(process.cwd(), 'debug', 'qwen');

interface BlurAnalysis {
  woo_product_id: number;
  filename: string;
  filepath: string;
  blur_score: number;
  sharpness_score: number;
  has_significant_blur: boolean;
  directory: string;
}

async function calculateSharpness(imagePath: string): Promise<number> {
  try {
    const { data, info } = await sharp(imagePath)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    let laplacianSum = 0;
    let count = 0;

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

    return laplacianSum / count;
  } catch (error) {
    console.error(`Error analyzing ${imagePath}:`, error);
    return 0;
  }
}

function calculateBlurScore(sharpness: number): number {
  if (sharpness < 50) return 100;
  if (sharpness < 100) return 80;
  if (sharpness < 150) return 60;
  if (sharpness < 200) return 40;
  if (sharpness < 300) return 20;
  return 0;
}

function extractWooProductId(filename: string): number {
  const match = filename.match(/STFY-(\d+)-/);
  return match ? parseInt(match[1]) : 0;
}

async function main() {
  console.log('🔍 Analisando blur em TODAS as imagens processadas...\n');

  // Find all processed-*-v2 directories
  const dirs = fs.readdirSync(BASE_DIR)
    .filter(d => d.startsWith('processed-') && d.endsWith('-v2'))
    .map(d => path.join(BASE_DIR, d));

  console.log(`📁 Encontrados ${dirs.length} diretórios para analisar\n`);

  const results: BlurAnalysis[] = [];
  let totalAnalyzed = 0;

  for (const dir of dirs) {
    const dirName = path.basename(dir);
    console.log(`\n📂 Analisando diretório: ${dirName}`);

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'));

    console.log(`   ${files.length} imagens encontradas`);

    for (const file of files) {
      totalAnalyzed++;
      const filepath = path.join(dir, file);
      const wooProductId = extractWooProductId(file);

      if (totalAnalyzed % 20 === 0) {
        console.log(`   📊 Progresso: ${totalAnalyzed} imagens analisadas...`);
      }

      const sharpness = await calculateSharpness(filepath);
      const blurScore = calculateBlurScore(sharpness);
      const hasSignificantBlur = blurScore >= 50;

      results.push({
        woo_product_id: wooProductId,
        filename: file,
        filepath,
        blur_score: blurScore,
        sharpness_score: sharpness,
        has_significant_blur: hasSignificantBlur,
        directory: dirName
      });
    }
  }

  // Save results
  const outputPath = path.join(process.cwd(), 'debug', 'blur-analysis-all.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // Statistics
  console.log('\n\n📊 ESTATÍSTICAS COMPLETAS:\n');
  console.log('━'.repeat(60));

  const withSignificantBlur = results.filter(r => r.has_significant_blur);
  const blurRate = Math.round((withSignificantBlur.length / results.length) * 100);

  console.log(`Total analisado: ${results.length} produtos`);
  console.log(`Com blur significativo (≥50): ${withSignificantBlur.length} (${blurRate}%)`);
  console.log(`Com blur leve (<50): ${results.length - withSignificantBlur.length}`);

  const veryHighBlur = results.filter(r => r.blur_score >= 80).length;
  const highBlur = results.filter(r => r.blur_score >= 60 && r.blur_score < 80).length;
  const moderateBlur = results.filter(r => r.blur_score >= 40 && r.blur_score < 60).length;
  const lowBlur = results.filter(r => r.blur_score < 40).length;

  console.log('\n📈 Distribuição por Intensidade:');
  console.log(`   🔴 Muito Alto (80-100): ${veryHighBlur} produtos`);
  console.log(`   🟠 Alto (60-79): ${highBlur} produtos`);
  console.log(`   🟡 Moderado (40-59): ${moderateBlur} produtos`);
  console.log(`   🟢 Baixo (0-39): ${lowBlur} produtos`);

  // Top 20 most blurred
  console.log('\n🏆 TOP 20 Produtos com MAIOR Blur:');
  console.log('━'.repeat(60));
  const topBlurred = [...results]
    .sort((a, b) => b.blur_score - a.blur_score)
    .slice(0, 20);

  topBlurred.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.filename}`);
    console.log(`   WooID: ${r.woo_product_id} | Blur: ${r.blur_score}/100 | Sharpness: ${r.sharpness_score.toFixed(2)}`);
    console.log(`   Dir: ${r.directory}`);
  });

  console.log('\n\n✅ Análise completa!');
  console.log(`📁 Resultados salvos em: ${outputPath}`);
  console.log(`\n💾 Total: ${results.length} imagens analisadas`);
  console.log(`⚠️ Com blur significativo: ${withSignificantBlur.length} imagens`);
}

main().catch(console.error);
