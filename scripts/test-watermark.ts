/**
 * Script para testar a marca d'água em uma imagem
 */

import * as watermarkService from '../src/services/watermark.service';
import { urlToBase64 } from '../src/utils/image-converter';
import { saveEditedImage } from '../src/utils/file-storage';
import fs from 'fs';
import path from 'path';

async function testWatermark() {
  console.log('🧪 Testando marca d\'água...\n');

  // URL de exemplo (pode trocar por qualquer URL de produto)
  const imageUrl = 'https://i.imgur.com/placeholder.jpg'; // Coloque uma URL real aqui

  console.log('📥 1. Baixando imagem de teste...');
  console.log(`   URL: ${imageUrl}`);

  try {
    const imageBase64 = await urlToBase64(imageUrl);
    console.log('   ✅ Imagem baixada\n');

    // Testar marca d'água padrão
    console.log('💧 2. Aplicando marca d\'água padrão...');
    const watermarked = await watermarkService.addCopyrightWatermark(
      `data:image/png;base64,${imageBase64}`
    );
    console.log('   ✅ Marca d\'água aplicada\n');

    // Salvar imagem com marca d'água
    console.log('💾 3. Salvando imagem...');
    const filepath = await saveEditedImage(watermarked, 'test-watermark', 'png');
    console.log(`   ✅ Salvo em: ${filepath}\n`);

    // Testar marca d'água discreta
    console.log('💧 4. Testando marca d\'água discreta (25% opacidade)...');
    const discreet = await watermarkService.addDiscreetWatermark(
      `data:image/png;base64,${imageBase64}`
    );
    const filepath2 = await saveEditedImage(discreet, 'test-watermark-discreet', 'png');
    console.log(`   ✅ Salvo em: ${filepath2}\n`);

    // Testar marca d'água forte
    console.log('💧 5. Testando marca d\'água forte (60% opacidade)...');
    const strong = await watermarkService.addStrongWatermark(
      `data:image/png;base64,${imageBase64}`
    );
    const filepath3 = await saveEditedImage(strong, 'test-watermark-strong', 'png');
    console.log(`   ✅ Salvo em: ${filepath3}\n`);

    // Testar marca d'água customizada
    console.log('💧 6. Testando marca d\'água customizada...');
    const custom = await watermarkService.addCustomWatermark(
      `data:image/png;base64,${imageBase64}`,
      'PRODUTO DE TESTE\nNÃO USAR SEM AUTORIZAÇÃO',
      0.5
    );
    const filepath4 = await saveEditedImage(custom, 'test-watermark-custom', 'png');
    console.log(`   ✅ Salvo em: ${filepath4}\n`);

    console.log('🎉 Teste concluído com sucesso!');
    console.log('\n📁 Arquivos salvos em:');
    console.log(`   - ${filepath}`);
    console.log(`   - ${filepath2}`);
    console.log(`   - ${filepath3}`);
    console.log(`   - ${filepath4}`);
    console.log('\n💡 Abra essas imagens para ver as diferentes variações de marca d\'água!');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  }
}

// Verificar se URL foi fornecida
if (process.argv.length > 2) {
  const customUrl = process.argv[2];
  console.log(`📌 Usando URL fornecida: ${customUrl}\n`);
  // Você pode modificar o script para usar essa URL
}

testWatermark();
