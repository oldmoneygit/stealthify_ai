import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

import fs from 'fs';
import sharp from 'sharp';
import { getAccessToken } from '../src/lib/vertex-auth';
import * as qwenEditService from '../src/services/qwen-edit.service';

const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

// Directories
const SOURCE_DIR = path.join(process.cwd(), 'debug', 'qwen');
const BASE_OUTPUT_DIR = path.join(process.cwd(), 'debug', 'qwen');

// Batch configuration
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds delay between batches

interface VisionAPIDetection {
  hasBrands: boolean;
  brandLogos: Array<{
    description: string;
    score: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  hasBrandTexts: boolean;
  brandTexts: Array<{
    text: string;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
}

interface ProcessResult {
  filename: string;
  status: 'success' | 'error';
  step: string;
  qwenEditUrl?: string;
  visionDetection?: VisionAPIDetection;
  needsBlur?: boolean;
  finalPath?: string;
  error?: string;
}

interface BatchResult {
  batchNumber: number;
  startIndex: number;
  endIndex: number;
  totalProcessed: number;
  successful: number;
  withBlur: number;
  withoutBlur: number;
  failed: number;
  outputDir: string;
}

const BRAND_KEYWORDS = [
  'nike', 'adidas', 'puma', 'reebok', 'converse', 'vans', 'jordan',
  'swoosh', 'jumpman', 'stripes', 'trefoil', 'logo', 'brand'
];

async function editImageWithQwen(imagePath: string): Promise<string> {
  console.log('   🎨 Iniciando edição com Qwen (mantendo cor original da caixa)...');

  const buffer = await sharp(imagePath).png().toBuffer();
  const imageBase64 = buffer.toString('base64');
  const imageDataUri = `data:image/png;base64,${imageBase64}`;

  const brands = ['Nike', 'Jordan', 'Adidas'];

  const editedBase64 = await qwenEditService.editWithBrandRemoval(
    imageDataUri,
    brands,
    'sneaker'
  );

  console.log('   ✅ Qwen editou a imagem (caixa com cor preservada)');

  return `data:image/png;base64,${editedBase64}`;
}

async function analyzeWithVisionAPI(imagePath: string): Promise<VisionAPIDetection> {
  console.log('   🔍 Analisando com Vision AI...');

  const buffer = await sharp(imagePath).png().toBuffer();
  const imageBase64 = buffer.toString('base64');
  const accessToken = await getAccessToken();

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': GOOGLE_CLOUD_PROJECT_ID!
    },
    body: JSON.stringify({
      requests: [{
        image: { content: imageBase64 },
        features: [
          { type: 'LOGO_DETECTION', maxResults: 20 },
          { type: 'TEXT_DETECTION', maxResults: 10 }
        ]
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const annotations = result.responses[0];

  const logoAnnotations = annotations.logoAnnotations || [];
  const brandLogos = logoAnnotations
    .filter((logo: any) => {
      const desc = logo.description.toLowerCase();
      return BRAND_KEYWORDS.some(keyword => desc.includes(keyword));
    })
    .map((logo: any) => {
      const vertices = logo.boundingPoly?.vertices || [];
      const xs = vertices.map((v: any) => v.x || 0);
      const ys = vertices.map((v: any) => v.y || 0);
      return {
        description: logo.description,
        score: logo.score,
        boundingBox: {
          x: Math.min(...xs),
          y: Math.min(...ys),
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys)
        }
      };
    });

  const textAnnotations = annotations.textAnnotations || [];
  const fullText = textAnnotations[0]?.description?.toLowerCase() || '';
  const hasBrandTexts = BRAND_KEYWORDS.some(keyword => fullText.includes(keyword));

  const brandTexts = hasBrandTexts && textAnnotations.length > 1
    ? textAnnotations.slice(1).filter((text: any) => {
        const t = text.description.toLowerCase();
        return BRAND_KEYWORDS.some(keyword => t.includes(keyword));
      }).map((text: any) => {
        const vertices = text.boundingPoly?.vertices || [];
        const xs = vertices.map((v: any) => v.x || 0);
        const ys = vertices.map((v: any) => v.y || 0);
        return {
          text: text.description,
          boundingBox: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
          }
        };
      })
    : [];

  const detection = {
    hasBrands: brandLogos.length > 0,
    brandLogos,
    hasBrandTexts,
    brandTexts
  };

  console.log(`   📊 Detecção: ${brandLogos.length} logos, ${brandTexts.length} textos de marca`);

  return detection;
}

async function applySmartBlur(
  imagePath: string,
  detection: VisionAPIDetection,
  outputPath: string
): Promise<void> {
  console.log('   🌫️  Aplicando smart blur INTENSO nas regiões detectadas...');

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const { width, height } = metadata;

  if (!width || !height) {
    throw new Error('Unable to get image dimensions');
  }

  const regionsToBlur = [
    ...detection.brandLogos.map(logo => logo.boundingBox),
    ...detection.brandTexts.map(text => text.boundingBox)
  ];

  if (regionsToBlur.length === 0) {
    await sharp(imagePath).toFile(outputPath);
    return;
  }

  const svgRects = regionsToBlur
    .map(box => `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="white"/>`)
    .join('');

  const svgMask = Buffer.from(`
    <svg width="${width}" height="${height}">
      ${svgRects}
    </svg>
  `);

  const maskBuffer = await sharp(svgMask).png().toBuffer();

  const blurredImage = await sharp(imagePath)
    .blur(30)
    .toBuffer();

  await sharp(imagePath)
    .composite([{
      input: await sharp(blurredImage)
        .composite([{
          input: maskBuffer,
          blend: 'dest-in'
        }])
        .toBuffer(),
      blend: 'over'
    }])
    .toFile(outputPath);

  console.log(`   ✅ Smart blur INTENSO aplicado em ${regionsToBlur.length} regiões (blur=30)`);
}

async function processImage(
  imagePath: string,
  filename: string,
  outputDir: string
): Promise<ProcessResult> {
  const result: ProcessResult = {
    filename,
    status: 'success',
    step: 'start'
  };

  try {
    result.step = 'qwen_edit';
    const qwenEditDataUri = await editImageWithQwen(imagePath);
    result.qwenEditUrl = qwenEditDataUri.substring(0, 50) + '...';

    const base64Data = qwenEditDataUri.replace(/^data:image\/\w+;base64,/, '');
    const editedBuffer = Buffer.from(base64Data, 'base64');
    const tempEditedPath = path.join(outputDir, `temp_${filename}`);
    await fs.promises.writeFile(tempEditedPath, editedBuffer);

    result.step = 'vision_verification';
    const detection = await analyzeWithVisionAPI(tempEditedPath);
    result.visionDetection = detection;

    const needsBlur = detection.hasBrands || detection.hasBrandTexts;
    result.needsBlur = needsBlur;

    const finalPath = path.join(outputDir, filename);

    if (needsBlur) {
      result.step = 'smart_blur';
      await applySmartBlur(tempEditedPath, detection, finalPath);
      console.log('   ⚠️  Smart blur INTENSO aplicado (marcas ainda detectadas)');
    } else {
      await fs.promises.copyFile(tempEditedPath, finalPath);
      console.log('   ✅ Imagem limpa (sem blur necessário)');
    }

    await fs.promises.unlink(tempEditedPath);

    result.finalPath = finalPath;
    result.step = 'completed';
    result.status = 'success';

  } catch (error) {
    result.status = 'error';
    result.error = error instanceof Error ? error.message : String(error);
    console.error('   ❌ Erro:', result.error);
  }

  return result;
}

async function processBatch(
  files: string[],
  batchNumber: number,
  startIndex: number
): Promise<BatchResult> {
  const endIndex = startIndex + files.length;
  const outputDir = path.join(BASE_OUTPUT_DIR, `processed-${startIndex + 1}-${endIndex}-v2`);

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🚀 LOTE ${batchNumber} - PRODUTOS ${startIndex + 1}-${endIndex}`);
  console.log('='.repeat(80) + '\n');
  console.log(`📂 Origem: ${SOURCE_DIR}`);
  console.log(`📁 Destino: ${outputDir}\n`);

  const results: ProcessResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const imagePath = path.join(SOURCE_DIR, filename);
    const globalIndex = startIndex + i + 1;

    console.log(`\n[${globalIndex}/476] 🖼️  ${filename}`);
    console.log('-'.repeat(80));

    const result = await processImage(imagePath, filename, outputDir);
    results.push(result);

    if (result.status === 'success') {
      const blurStatus = result.needsBlur ? '⚠️  COM BLUR INTENSO' : '✅ SEM BLUR';
      console.log(`\n✅ Sucesso: ${blurStatus}`);
    } else {
      console.log(`\n❌ Erro: ${result.error}`);
    }
  }

  const successful = results.filter(r => r.status === 'success').length;
  const withBlur = results.filter(r => r.status === 'success' && r.needsBlur).length;
  const withoutBlur = results.filter(r => r.status === 'success' && !r.needsBlur).length;
  const failed = results.filter(r => r.status === 'error').length;

  console.log('\n' + '='.repeat(80));
  console.log(`📊 RESUMO DO LOTE ${batchNumber}\n`);
  console.log(`Total Processado:              ${results.length}`);
  console.log(`✅ Sucesso:                    ${successful}`);
  console.log(`   └─ Sem blur (limpo):        ${withoutBlur} (${Math.round(withoutBlur/results.length*100)}%)`);
  console.log(`   └─ Com smart blur INTENSO:  ${withBlur} (${Math.round(withBlur/results.length*100)}%)`);
  console.log(`❌ Falhas:                     ${failed}`);
  console.log('='.repeat(80) + '\n');

  return {
    batchNumber,
    startIndex,
    endIndex,
    totalProcessed: results.length,
    successful,
    withBlur,
    withoutBlur,
    failed,
    outputDir
  };
}

async function deleteProcessedOriginals(batchResult: BatchResult): Promise<number> {
  console.log(`\n🗑️  Deletando originais do lote ${batchResult.batchNumber}...`);

  const processedFiles = fs.readdirSync(batchResult.outputDir)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
    .filter(f => !f.startsWith('temp_'));

  let deletedCount = 0;

  for (const filename of processedFiles) {
    const originalPath = path.join(SOURCE_DIR, filename);
    if (fs.existsSync(originalPath)) {
      try {
        fs.unlinkSync(originalPath);
        deletedCount++;
      } catch (error) {
        console.error(`   ❌ Erro ao deletar ${filename}: ${error}`);
      }
    }
  }

  console.log(`   ✅ ${deletedCount} originais deletados\n`);
  return deletedCount;
}

async function main() {
  console.log('\n' + '█'.repeat(80));
  console.log('█'.repeat(80));
  console.log('███');
  console.log('███  🤖 PROCESSAMENTO AUTOMATIZADO EM LOTES');
  console.log('███  Brand Camouflage System v2');
  console.log('███');
  console.log('█'.repeat(80));
  console.log('█'.repeat(80) + '\n');

  console.log('✨ MELHORIAS ATIVAS:\n');
  console.log('   1️⃣  Qwen remove logos/textos da CAIXA do produto');
  console.log('   2️⃣  🎨 Mantém cor ORIGINAL da caixa (não muda a cor!)');
  console.log('   3️⃣  Smart blur INTENSO (blur=30)');
  console.log('   4️⃣  Processamento em lotes de 20 produtos');
  console.log('   5️⃣  Exclusão automática dos originais após cada lote\n');
  console.log('📋 Pipeline: Qwen Edit → Vision AI → Smart Blur (se necessário)\n');

  // Get all remaining files
  const allFiles = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
    .filter(f => !f.startsWith('temp_'))
    .sort();

  console.log(`📦 Total de produtos restantes: ${allFiles.length}`);
  console.log(`📊 Serão processados em ${Math.ceil(allFiles.length / BATCH_SIZE)} lotes de ${BATCH_SIZE} produtos\n`);

  const batchResults: BatchResult[] = [];
  let totalDeleted = 0;

  // Process in batches
  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batchFiles = allFiles.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    const batchResult = await processBatch(batchFiles, batchNumber, i + 60); // +60 porque já processamos 60
    batchResults.push(batchResult);

    // Delete originals
    const deleted = await deleteProcessedOriginals(batchResult);
    totalDeleted += deleted;

    // Delay between batches (except last batch)
    if (i + BATCH_SIZE < allFiles.length) {
      console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES / 1000}s antes do próximo lote...\n`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  // Final summary
  console.log('\n' + '█'.repeat(80));
  console.log('█'.repeat(80));
  console.log('███');
  console.log('███  📊 RESUMO FINAL DO PROCESSAMENTO');
  console.log('███');
  console.log('█'.repeat(80));
  console.log('█'.repeat(80) + '\n');

  const totalProcessed = batchResults.reduce((sum, b) => sum + b.totalProcessed, 0);
  const totalSuccessful = batchResults.reduce((sum, b) => sum + b.successful, 0);
  const totalWithBlur = batchResults.reduce((sum, b) => sum + b.withBlur, 0);
  const totalWithoutBlur = batchResults.reduce((sum, b) => sum + b.withoutBlur, 0);
  const totalFailed = batchResults.reduce((sum, b) => sum + b.failed, 0);

  console.log(`📊 ESTATÍSTICAS GERAIS:\n`);
  console.log(`   Total de lotes:               ${batchResults.length}`);
  console.log(`   Total processado:             ${totalProcessed}`);
  console.log(`   ✅ Sucesso:                   ${totalSuccessful} (${Math.round(totalSuccessful/totalProcessed*100)}%)`);
  console.log(`      └─ Sem blur (limpo):       ${totalWithoutBlur} (${Math.round(totalWithoutBlur/totalProcessed*100)}%)`);
  console.log(`      └─ Com blur INTENSO:       ${totalWithBlur} (${Math.round(totalWithBlur/totalProcessed*100)}%)`);
  console.log(`   ❌ Falhas:                    ${totalFailed} (${Math.round(totalFailed/totalProcessed*100)}%)`);
  console.log(`   🗑️  Originais deletados:      ${totalDeleted}\n`);

  console.log(`📈 PROGRESSO TOTAL:\n`);
  console.log(`   Processados antes:            60/476 (13%)`);
  console.log(`   Processados agora:            ${totalProcessed}/476`);
  console.log(`   Total processado:             ${60 + totalProcessed}/476 (${Math.round((60 + totalProcessed)/476*100)}%)`);
  console.log(`   Restantes:                    ${476 - 60 - totalProcessed}/476\n`);

  console.log('📁 DIRETÓRIOS CRIADOS:\n');
  batchResults.forEach(b => {
    console.log(`   Lote ${b.batchNumber}: ${path.basename(b.outputDir)}`);
  });

  console.log('\n' + '█'.repeat(80));
  console.log('✅ PROCESSAMENTO AUTOMATIZADO CONCLUÍDO!');
  console.log('█'.repeat(80) + '\n');
}

main().catch(error => {
  console.error('\n❌ ERRO FATAL:', error);
  process.exit(1);
});
