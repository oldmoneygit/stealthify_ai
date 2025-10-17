/**
 * Script SIMPLES de Teste do Qwen Image Edit
 *
 * Edita imagem usando APENAS Qwen com text prompt (SEM máscaras, SEM detecção).
 * Versão minimalista para testar a qualidade pura da edição do Qwen.
 *
 * USO:
 *   pnpm tsx scripts/test-qwen-simple.ts <caminho-da-imagem>
 *
 * EXEMPLO:
 *   pnpm tsx scripts/test-qwen-simple.ts "debug/qwen/nike.jpg"
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Carregar variáveis de ambiente
config({ path: path.join(process.cwd(), '.env.local') });

// Importar apenas o Qwen service
import * as qwenEditService from '../src/services/qwen-edit.service';

/**
 * Converter imagem para base64 (normaliza para PNG)
 */
async function imageToBase64(imagePath: string): Promise<string> {
  let buffer: Buffer;

  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('📥 Baixando imagem da URL...');
    const response = await fetch(imagePath);
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else {
    console.log('📂 Lendo arquivo local...');
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(process.cwd(), imagePath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Arquivo não encontrado: ${absolutePath}`);
    }

    buffer = fs.readFileSync(absolutePath);
  }

  console.log('🔄 Normalizando imagem para PNG...');
  const pngBuffer = await sharp(buffer).png().toBuffer();

  return pngBuffer.toString('base64');
}

/**
 * Salvar imagem
 */
async function saveImage(base64Image: string, filename: string): Promise<string> {
  const outputDir = path.join(process.cwd(), 'debug', 'qwen');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, filename);
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

/**
 * Criar comparação lado a lado
 */
async function createComparison(
  originalBase64: string,
  editedBase64: string,
  filename: string
): Promise<string> {
  console.log('\n🎨 Criando comparação lado a lado...');

  const originalBuffer = Buffer.from(originalBase64, 'base64');
  const editedBuffer = Buffer.from(editedBase64, 'base64');

  const resizedOriginal = await sharp(originalBuffer).resize(800, null, { fit: 'inside' }).toBuffer();
  const resizedEdited = await sharp(editedBuffer).resize(800, null, { fit: 'inside' }).toBuffer();

  const { height: originalHeight } = await sharp(resizedOriginal).metadata();
  const { height: editedHeight } = await sharp(resizedEdited).metadata();
  const maxHeight = Math.max(originalHeight || 0, editedHeight || 0);

  const comparisonBuffer = await sharp({
    create: {
      width: 1640, // 800 + 40 + 800
      height: maxHeight,
      channels: 4,
      background: { r: 50, g: 50, b: 50, alpha: 1 }
    }
  })
    .composite([
      { input: resizedOriginal, top: 0, left: 0 },
      { input: resizedEdited, top: 0, left: 840 }
    ])
    .png()
    .toBuffer();

  const outputPath = path.join(process.cwd(), 'debug', 'qwen', filename);
  fs.writeFileSync(outputPath, comparisonBuffer);

  return outputPath;
}

/**
 * Main
 */
async function main() {
  console.log('✨ TEST QWEN SIMPLE - Teste Minimalista (Prompt Only)\n');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ Erro: Caminho da imagem não fornecido\n');
    console.log('USO:');
    console.log('  pnpm tsx scripts/test-qwen-simple.ts <caminho-da-imagem>\n');
    console.log('EXEMPLOS:');
    console.log('  pnpm tsx scripts/test-qwen-simple.ts "debug/qwen/nike.jpg"');
    console.log('  pnpm tsx scripts/test-qwen-simple.ts "https://exemplo.com/produto.jpg"');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`📸 Imagem: ${imagePath}\n`);

    // Carregar imagem
    const originalBase64 = await imageToBase64(imagePath);
    console.log(`✅ Imagem carregada (${Math.round(originalBase64.length / 1024)} KB)\n`);

    // Criar data URL
    const imageDataUrl = `data:image/png;base64,${originalBase64}`;

    // Editar com Qwen (APENAS prompt, SEM máscaras)
    console.log('✨ Editando com Qwen Image Edit...');
    console.log('   ⏳ Tempo estimado: 10-15 segundos');
    console.log('   🎯 Brands: Nike, Adidas, logos, text, swoosh');
    console.log('   📝 Category: sneaker\n');

    const editedBase64 = await qwenEditService.editWithBrandRemoval(
      imageDataUrl,
      ['Nike', 'Adidas', 'brand', 'logo', 'swoosh'],
      'sneaker'
    );

    console.log('\n✅ Edição concluída!\n');

    // Salvar resultados
    console.log('💾 Salvando resultados...\n');

    const timestamp = Date.now();
    const baseName = path.basename(imagePath, path.extname(imagePath)).replace(/[^a-zA-Z0-9]/g, '_');

    const originalPath = await saveImage(originalBase64, `${baseName}_${timestamp}_1_original.png`);
    console.log(`   ✅ Original: ${originalPath}`);

    const editedPath = await saveImage(editedBase64, `${baseName}_${timestamp}_2_qwen_edited.png`);
    console.log(`   ✅ Editada: ${editedPath}`);

    const comparisonPath = await createComparison(
      originalBase64,
      editedBase64,
      `${baseName}_${timestamp}_3_comparison.png`
    );
    console.log(`   ✅ Comparação: ${comparisonPath}`);

    // Resumo
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 RESUMO');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
    console.log('✅ Método: Qwen Image Edit (text prompt only)');
    console.log('✅ Brands removidos: Nike, Adidas, logos, text, swoosh');
    console.log('✅ Categoria: sneaker');
    console.log('');
    console.log('📁 Arquivos salvos em debug/qwen/:');
    console.log(`   1️⃣ ${path.basename(originalPath)}`);
    console.log(`   2️⃣ ${path.basename(editedPath)}`);
    console.log(`   3️⃣ ${path.basename(comparisonPath)} ⭐ ABRA ESTE!`);
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    console.log('🎉 Teste concluído! Abra a imagem de comparação para ver o resultado.\n');
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

main();
