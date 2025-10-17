/**
 * Script de Teste do Qwen Edit Image
 *
 * Edita uma imagem usando Qwen (via FLUX inpainting) e salva o resultado
 * para análise isolada da qualidade da edição.
 *
 * USO:
 *   pnpm tsx scripts/test-qwen-edit.ts <caminho-da-imagem>
 *
 * EXEMPLO:
 *   pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/nike-original.jpg"
 *   pnpm tsx scripts/test-qwen-edit.ts "https://exemplo.com/produto.jpg"
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Carregar variáveis de ambiente
config({ path: path.join(process.cwd(), '.env.local') });

// Importar serviços
import * as detectionService from '../src/services/detection.service';
import * as qwenEditService from '../src/services/qwen-edit.service';
import { urlToBase64, getImageDimensions } from '../src/utils/image-converter';
import { createPreventiveBoxLidMasks, createPreventiveSneakerSwooshMasks } from '../src/utils/mask-generator';

interface EditResult {
  originalImage: string;
  editedImage: string;
  brandsDetected: string[];
  masksUsed: Array<{
    type: string;
    box_2d: [number, number, number, number];
  }>;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Converter imagem para base64 (normaliza para PNG)
 */
async function imageToBase64(imagePath: string): Promise<string> {
  let buffer: Buffer;

  // Se for URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('📥 Baixando imagem da URL...');
    const response = await fetch(imagePath);
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    // Se for arquivo local
    console.log('📂 Lendo arquivo local...');
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(process.cwd(), imagePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Arquivo não encontrado: ${absolutePath}`);
    }

    buffer = fs.readFileSync(absolutePath);
  }

  // Converter para PNG usando Sharp (garante formato suportado)
  console.log('🔄 Normalizando imagem para PNG...');
  const pngBuffer = await sharp(buffer)
    .png()
    .toBuffer();

  return pngBuffer.toString('base64');
}

/**
 * Salvar imagem editada
 */
async function saveEditedImage(
  base64Image: string,
  outputFilename: string
): Promise<string> {
  const outputDir = path.join(process.cwd(), 'debug', 'qwen');

  // Garantir que a pasta existe
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, outputFilename);

  // Remover prefixo data:image se houver
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  // Salvar arquivo
  fs.writeFileSync(outputPath, buffer);

  return outputPath;
}

/**
 * Editar imagem com Qwen (pipeline completo)
 */
async function editImageWithQwen(imageBase64: string): Promise<EditResult> {
  console.log('\n🔍 [1/4] Detectando marcas na imagem original...');

  // Garantir que o base64 tenha o prefixo correto
  const imageDataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`;

  // Obter dimensões
  const dimensions = await getImageDimensions(imageDataUrl);
  console.log(`   Dimensões: ${dimensions.width}x${dimensions.height}`);

  // FASE 1: Detecção de marcas com Gemini
  const detection = await detectionService.detect(imageDataUrl);

  console.log(`   ✅ Marcas detectadas: ${detection.brands.join(', ')}`);
  console.log(`   📊 Risk Score: ${detection.riskScore}`);
  console.log(`   📍 Regiões detectadas: ${detection.regions.length}`);

  // FASE 2: Criar máscaras preventivas (box lids + swooshes laterais)
  console.log('\n🎭 [2/4] Criando máscaras preventivas...');

  const boxLidMasks = createPreventiveBoxLidMasks(dimensions.width, dimensions.height);
  const swooshMasks = createPreventiveSneakerSwooshMasks(dimensions.width, dimensions.height);

  const preventiveMasks = [...boxLidMasks, ...swooshMasks];

  console.log(`   ✅ Máscaras preventivas criadas: ${preventiveMasks.length}`);
  preventiveMasks.forEach((mask, i) => {
    const [ymin, xmin, ymax, xmax] = mask.box_2d;
    console.log(`      [${i + 1}] ${mask.type}: box_2d=[${ymin}, ${xmin}, ${ymax}, ${xmax}]`);
  });

  // FASE 3: Combinar regiões detectadas + máscaras preventivas
  const allRegions = [
    ...detection.regions.map(r => ({
      brand: r.brand,
      type: r.type,
      box_2d: r.box_2d
    })),
    ...preventiveMasks
  ];

  console.log(`\n   📦 Total de regiões para edição: ${allRegions.length}`);
  console.log(`      ${detection.regions.length} detectadas + ${preventiveMasks.length} preventivas`);

  // FASE 4: Editar com Qwen
  console.log('\n✨ [3/4] Editando imagem com Qwen/FLUX...');
  console.log('   ⏳ Isso pode demorar 10-15 segundos...');

  const editedImageBase64 = await qwenEditService.editImageWithMasks(
    imageDataUrl,
    allRegions,
    detection.brands
  );

  console.log('   ✅ Edição concluída!');

  // FASE 5: Re-detectar marcas na imagem editada
  console.log('\n🔎 [4/4] Re-detectando marcas na imagem editada...');

  const verificationDetection = await detectionService.detect(editedImageBase64);

  console.log(`   📊 Risk Score APÓS edição: ${verificationDetection.riskScore}`);
  console.log(`   📍 Marcas ainda detectadas: ${verificationDetection.brands.length > 0 ? verificationDetection.brands.join(', ') : 'NENHUMA'}`);

  // Extrair base64 limpo (sem prefixo) para salvar arquivos
  const cleanOriginalBase64 = imageBase64.startsWith('data:')
    ? imageBase64.replace(/^data:image\/\w+;base64,/, '')
    : imageBase64;

  const cleanEditedBase64 = editedImageBase64.replace(/^data:image\/\w+;base64,/, '');

  return {
    originalImage: cleanOriginalBase64,
    editedImage: cleanEditedBase64,
    brandsDetected: detection.brands,
    masksUsed: allRegions,
    dimensions
  };
}

/**
 * Criar relatório visual comparando antes vs depois
 */
async function createComparisonImage(
  originalBase64: string,
  editedBase64: string,
  outputFilename: string
): Promise<string> {
  console.log('\n🎨 Criando imagem de comparação (antes vs depois)...');

  const originalBuffer = Buffer.from(originalBase64, 'base64');
  const editedBuffer = Buffer.from(editedBase64, 'base64');

  // Redimensionar ambas para mesmo tamanho (800px largura)
  const resizedOriginal = await sharp(originalBuffer)
    .resize(800, null, { fit: 'inside' })
    .toBuffer();

  const resizedEdited = await sharp(editedBuffer)
    .resize(800, null, { fit: 'inside' })
    .toBuffer();

  // Obter dimensões
  const { height: originalHeight } = await sharp(resizedOriginal).metadata();
  const { height: editedHeight } = await sharp(resizedEdited).metadata();

  const maxHeight = Math.max(originalHeight || 0, editedHeight || 0);

  // Criar canvas com as duas imagens lado a lado
  const comparisonBuffer = await sharp({
    create: {
      width: 1600 + 40, // 2 imagens de 800px + 40px de espaçamento
      height: maxHeight,
      channels: 4,
      background: { r: 50, g: 50, b: 50, alpha: 1 }
    }
  })
    .composite([
      {
        input: resizedOriginal,
        top: 0,
        left: 0
      },
      {
        input: resizedEdited,
        top: 0,
        left: 840 // 800 + 40 de espaçamento
      }
    ])
    .png()
    .toBuffer();

  // Salvar
  const outputPath = path.join(process.cwd(), 'debug', 'qwen', outputFilename);
  fs.writeFileSync(outputPath, comparisonBuffer);

  console.log(`   ✅ Comparação salva em: ${outputPath}`);

  return outputPath;
}

/**
 * Main
 */
async function main() {
  console.log('✨ TEST QWEN EDIT IMAGE - Teste Isolado de Edição\n');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Validar argumentos
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ Erro: Caminho da imagem não fornecido\n');
    console.log('USO:');
    console.log('  pnpm tsx scripts/test-qwen-edit.ts <caminho-da-imagem>\n');
    console.log('EXEMPLOS:');
    console.log('  pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/nike-original.jpg"');
    console.log('  pnpm tsx scripts/test-qwen-edit.ts "https://exemplo.com/produto.jpg"');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`📸 Imagem: ${imagePath}\n`);

    // Converter para base64
    const originalBase64 = await imageToBase64(imagePath);
    console.log(`✅ Imagem carregada (${Math.round(originalBase64.length / 1024)} KB)\n`);

    // Editar com Qwen
    const result = await editImageWithQwen(originalBase64);

    // Salvar imagens
    console.log('\n💾 Salvando resultados...\n');

    const timestamp = Date.now();
    const baseName = path.basename(imagePath, path.extname(imagePath)).replace(/[^a-zA-Z0-9]/g, '_');

    // Salvar original
    const originalPath = await saveEditedImage(
      result.originalImage,
      `${baseName}_${timestamp}_1_original.png`
    );
    console.log(`   ✅ Original: ${originalPath}`);

    // Salvar editada
    const editedPath = await saveEditedImage(
      result.editedImage,
      `${baseName}_${timestamp}_2_edited.png`
    );
    console.log(`   ✅ Editada: ${editedPath}`);

    // Criar comparação lado a lado
    const comparisonPath = await createComparisonImage(
      result.originalImage,
      result.editedImage,
      `${baseName}_${timestamp}_3_comparison.png`
    );

    // Relatório final
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 RESUMO DA EDIÇÃO');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log(`📐 Dimensões: ${result.dimensions.width} x ${result.dimensions.height} pixels`);
    console.log(`🎯 Marcas detectadas: ${result.brandsDetected.join(', ')}`);
    console.log(`🎭 Máscaras aplicadas: ${result.masksUsed.length}`);
    console.log('');
    console.log('📁 Arquivos salvos em debug/qwen/:');
    console.log(`   1️⃣ ${path.basename(originalPath)} (original)`);
    console.log(`   2️⃣ ${path.basename(editedPath)} (editada pelo Qwen)`);
    console.log(`   3️⃣ ${path.basename(comparisonPath)} (comparação lado a lado)`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log('✅ Teste concluído com sucesso!\n');
    console.log('💡 Dica: Abra a imagem de comparação para ver antes vs depois lado a lado.\n');
  } catch (error) {
    console.error('\n❌ ERRO:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      if (error.stack) {
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('   Erro desconhecido:', error);
    }
    process.exit(1);
  }
}

// Executar
main();
