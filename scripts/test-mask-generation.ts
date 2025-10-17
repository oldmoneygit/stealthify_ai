/**
 * Script de teste: Gerar e visualizar máscara automática
 *
 * Uso: npx tsx scripts/test-mask-generation.ts
 *
 * O que faz:
 * 1. Busca um produto não editado do banco
 * 2. Detecta logos com Gemini (multi-ângulo)
 * 3. Gera máscara precisa
 * 4. Salva imagem original + máscara + overlay na pasta debug/
 */

import { db } from '../src/lib/db';
import * as multiAngleDetectionService from '../src/services/multi-angle-detection.service';
import { createMask, regionsToSegments } from '../src/utils/mask-generator';
import { urlToBase64, getImageDimensions } from '../src/utils/image-converter';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

async function testMaskGeneration() {
  console.log('\n🧪 === TESTE DE GERAÇÃO DE MÁSCARA ===\n');

  // 1. Buscar produto não editado
  console.log('📦 Buscando produto não editado...');

  const product = db.prepare(`
    SELECT p.* FROM products p
    LEFT JOIN analyses a ON p.id = a.product_id
    WHERE a.id IS NULL
    LIMIT 1
  `).get() as any;

  if (!product) {
    console.log('⚠️ Nenhum produto não editado encontrado!');
    console.log('💡 Dica: Sincronize produtos do WooCommerce primeiro');
    return;
  }

  console.log(`✅ Produto encontrado: ${product.sku}`);
  console.log(`   Nome: ${product.name}`);
  console.log(`   Imagem: ${product.image_url}`);

  // 2. Converter imagem para base64
  console.log('\n🖼️ Convertendo imagem...');
  const imageBase64 = await urlToBase64(product.image_url);
  const dimensions = await getImageDimensions(imageBase64);
  console.log(`   Dimensões: ${dimensions.width}x${dimensions.height}px`);

  // 3. Detectar logos com Gemini (multi-ângulo)
  console.log('\n🔍 Detectando logos com Gemini (multi-ângulo)...');
  const detection = await multiAngleDetectionService.detectMultiAngle(product.image_url);

  // Remover duplicatas
  detection.regions = multiAngleDetectionService.removeDuplicateRegions(detection.regions);

  console.log(`   Marcas: ${detection.brands.join(', ')}`);
  console.log(`   Risk Score: ${detection.riskScore}`);
  console.log(`   Regiões detectadas: ${detection.regions.length}`);

  // Log detalhado
  detection.regions.forEach((region, idx) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    console.log(`   [${idx + 1}] ${region.brand} (${region.type}) - box: [${ymin}, ${xmin}, ${ymax}, ${xmax}]`);
  });

  if (detection.regions.length === 0) {
    console.log('\n⚠️ Nenhuma região detectada! Nada para mascarar.');
    return;
  }

  // 4. Gerar máscara precisa
  console.log('\n🎭 Gerando máscara PRECISA...');
  const logoSegments = regionsToSegments(detection.regions);
  const maskBase64 = await createMask(logoSegments, dimensions.width, dimensions.height);

  // 5. Criar pasta debug se não existir
  const debugDir = path.join(process.cwd(), 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
    console.log(`   📁 Pasta criada: ${debugDir}`);
  }

  // 6. Salvar imagens
  console.log('\n💾 Salvando arquivos de debug...');

  // 6.1. Imagem original
  const originalPath = path.join(debugDir, `${product.sku}_original.jpg`);
  const originalBuffer = Buffer.from(imageBase64, 'base64');
  fs.writeFileSync(originalPath, originalBuffer);
  console.log(`   ✅ Original: ${originalPath}`);

  // 6.2. Máscara
  const maskPath = path.join(debugDir, `${product.sku}_mask.png`);
  const maskBuffer = Buffer.from(maskBase64, 'base64');
  fs.writeFileSync(maskPath, maskBuffer);
  console.log(`   ✅ Máscara: ${maskPath}`);

  // 6.3. Overlay (imagem + máscara sobreposta em vermelho transparente)
  const overlayPath = path.join(debugDir, `${product.sku}_overlay.png`);

  // Criar máscara vermelha transparente
  const redMask = await sharp(maskBuffer)
    .composite([{
      input: Buffer.from(
        `<svg width="${dimensions.width}" height="${dimensions.height}">
          <rect width="100%" height="100%" fill="rgba(255, 0, 0, 0.5)" />
        </svg>`
      ),
      blend: 'multiply'
    }])
    .png()
    .toBuffer();

  // Sobrepor máscara vermelha na imagem original
  const overlayBuffer = await sharp(originalBuffer)
    .composite([{
      input: redMask,
      blend: 'over'
    }])
    .png()
    .toBuffer();

  fs.writeFileSync(overlayPath, overlayBuffer);
  console.log(`   ✅ Overlay: ${overlayPath}`);

  // 7. Estatísticas da máscara
  console.log('\n📊 Estatísticas da Máscara:');
  console.log(`   Resolução: ${dimensions.width}x${dimensions.height}px`);
  console.log(`   Regiões mascaradas: ${detection.regions.length}`);
  console.log(`   Tamanho máscara: ${(maskBase64.length / 1024).toFixed(2)} KB`);
  console.log(`   Expansão aplicada: 15% (recomendação ClipDrop)`);

  // 8. Calcular cobertura aproximada
  const totalPixels = dimensions.width * dimensions.height;
  const maskPixels = detection.regions.reduce((sum, region) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    const width = (xmax - xmin) / 1000 * dimensions.width;
    const height = (ymax - ymin) / 1000 * dimensions.height;
    return sum + (width * height);
  }, 0);
  const coverage = (maskPixels / totalPixels) * 100;

  console.log(`   Cobertura aproximada: ${coverage.toFixed(2)}%`);

  console.log('\n✅ Teste concluído! Verifique os arquivos na pasta debug/');
  console.log(`   📁 ${debugDir}`);
  console.log('\n🎯 Próximo passo: Analise o overlay para verificar precisão da máscara');
}

// Executar teste
testMaskGeneration()
  .then(() => {
    console.log('\n👋 Finalizando...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro no teste:', error);
    process.exit(1);
  });
