/**
 * Script de teste: Gerar e visualizar máscara automática (COM DADOS MOCK)
 *
 * Uso: npx tsx scripts/test-mask-generation-mock.ts
 *
 * O que faz:
 * 1. Busca um produto não editado do banco
 * 2. Usa regiões MOCKADAS (simulando detecção Gemini)
 * 3. Gera máscara precisa
 * 4. Salva imagem original + máscara + overlay na pasta debug/
 */

import { db } from '../src/lib/db';
import { createMask } from '../src/utils/mask-generator';
import { urlToBase64, getImageDimensions } from '../src/utils/image-converter';
import type { Segment, DetectionRegion } from '../src/lib/types';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

async function testMaskGenerationWithMock() {
  console.log('\n🧪 === TESTE DE GERAÇÃO DE MÁSCARA (COM DADOS MOCK) ===\n');

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

  // 3. Criar regiões MOCKADAS (simulando detecção Gemini)
  console.log('\n🎭 Criando regiões MOCKADAS para teste...');
  console.log('   (Simulando detecção de logos Nike/Jordan em posições típicas)');

  const mockRegions: DetectionRegion[] = [
    // Logo Nike (swoosh) - lateral esquerda
    {
      brand: 'Nike',
      type: 'logo',
      confidence: 95,
      box_2d: [400, 150, 500, 250]  // [ymin, xmin, ymax, xmax] em escala 0-1000
    },
    // Logo Jordan (jumpman) - lateral direita
    {
      brand: 'Jordan',
      type: 'logo',
      confidence: 92,
      box_2d: [420, 650, 520, 750]
    },
    // Texto Nike - caixa (topo)
    {
      brand: 'Nike',
      type: 'text',
      confidence: 88,
      box_2d: [50, 350, 120, 550]
    },
    // Logo Nike - caixa (lateral)
    {
      brand: 'Nike',
      type: 'logo',
      confidence: 85,
      box_2d: [200, 100, 300, 180]
    },
    // Texto Jordan - língua do tênis
    {
      brand: 'Jordan',
      type: 'text',
      confidence: 90,
      box_2d: [300, 400, 380, 500]
    }
  ];

  console.log(`   ✅ ${mockRegions.length} regiões mockadas criadas`);

  mockRegions.forEach((region, idx) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    console.log(`   [${idx + 1}] ${region.brand} (${region.type}) - box: [${ymin}, ${xmin}, ${ymax}, ${xmax}] (0-1000 scale)`);
  });

  // 4. Converter regiões em segmentos (com polígonos)
  console.log('\n🔄 Convertendo regiões em segmentos...');

  const logoSegments: Segment[] = mockRegions.map(region => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;

    return {
      brand: region.brand,
      confidence: region.confidence,
      polygon: [
        { x: xmin / 1000, y: ymin / 1000 },  // Top-left
        { x: xmax / 1000, y: ymin / 1000 },  // Top-right
        { x: xmax / 1000, y: ymax / 1000 },  // Bottom-right
        { x: xmin / 1000, y: ymax / 1000 }   // Bottom-left
      ]
    };
  });

  console.log(`   ✅ ${logoSegments.length} segmentos criados`);

  // 5. Gerar máscara precisa
  console.log('\n🎭 Gerando máscara PRECISA...');
  const maskBase64 = await createMask(logoSegments, dimensions.width, dimensions.height);

  // 6. Criar pasta debug se não existir
  const debugDir = path.join(process.cwd(), 'debug');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
    console.log(`   📁 Pasta criada: ${debugDir}`);
  }

  // 7. Salvar imagens
  console.log('\n💾 Salvando arquivos de debug...');

  // 7.1. Imagem original
  const originalPath = path.join(debugDir, `${product.sku}_original.jpg`);
  const originalBuffer = Buffer.from(imageBase64, 'base64');
  fs.writeFileSync(originalPath, originalBuffer);
  console.log(`   ✅ Original: ${originalPath}`);

  // 7.2. Máscara
  const maskPath = path.join(debugDir, `${product.sku}_mask.png`);
  const maskBuffer = Buffer.from(maskBase64, 'base64');
  fs.writeFileSync(maskPath, maskBuffer);
  console.log(`   ✅ Máscara: ${maskPath}`);

  // 7.3. Overlay (imagem + máscara sobreposta em vermelho transparente)
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

  // 8. Estatísticas da máscara
  console.log('\n📊 Estatísticas da Máscara:');
  console.log(`   Resolução: ${dimensions.width}x${dimensions.height}px`);
  console.log(`   Regiões mascaradas: ${mockRegions.length}`);
  console.log(`   Tamanho máscara: ${(maskBase64.length / 1024).toFixed(2)} KB`);
  console.log(`   Expansão aplicada: 15% (recomendação ClipDrop)`);

  // 9. Calcular cobertura aproximada
  const totalPixels = dimensions.width * dimensions.height;
  const maskPixels = mockRegions.reduce((sum, region) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    const width = (xmax - xmin) / 1000 * dimensions.width;
    const height = (ymax - ymin) / 1000 * dimensions.height;
    // Aplicar expansão de 15%
    return sum + (width * height * 1.15 * 1.15);
  }, 0);
  const coverage = (maskPixels / totalPixels) * 100;

  console.log(`   Cobertura aproximada: ${coverage.toFixed(2)}%`);

  console.log('\n✅ Teste concluído! Verifique os arquivos na pasta debug/');
  console.log(`   📁 ${debugDir}`);
  console.log('\n🎯 Análise do resultado:');
  console.log(`   ✅ VERMELHO no overlay = áreas que serão removidas pelo ClipDrop`);
  console.log(`   ✅ Máscara expandida 15% para garantir remoção completa dos logos`);
  console.log(`   ✅ Áreas pretas preservadas 100% (estrutura do produto)`);
}

// Executar teste
testMaskGenerationWithMock()
  .then(() => {
    console.log('\n👋 Finalizando...');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro no teste:', error);
    process.exit(1);
  });
