/**
 * 📦 MOVE DUPLICATES TO EDITED - Move duplicatas aprovadas para pasta final
 *
 * Move todas as imagens de debug/all-duplicates/editado/ para debug/edited/
 */

import fs from 'fs/promises';
import path from 'path';

const SOURCE_DIR = 'debug/all-duplicates/editado';
const DEST_DIR = 'debug/edited';

async function moveDuplicatesToEdited(): Promise<void> {
  console.log('📦 MOVENDO DUPLICATAS EDITADAS PARA PASTA FINAL\n');

  // 1. Ler arquivos da pasta editado
  const files = await fs.readdir(SOURCE_DIR);
  const imageFiles = files.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  console.log(`📁 Total de duplicatas editadas: ${imageFiles.length}`);
  console.log(`📂 Origem: ${SOURCE_DIR}`);
  console.log(`📂 Destino: ${DEST_DIR}\n`);

  console.log('='.repeat(80) + '\n');

  let movedCount = 0;

  // 2. Mover cada arquivo
  for (const file of imageFiles) {
    const sourcePath = path.join(SOURCE_DIR, file);
    const destPath = path.join(DEST_DIR, file);

    try {
      // Verificar se arquivo já existe no destino
      try {
        await fs.access(destPath);
        console.log(`   ⚠️  ${file} - Já existe, substituindo...`);
        await fs.unlink(destPath);
      } catch {
        // Arquivo não existe, tudo bem
      }

      // Mover arquivo
      await fs.rename(sourcePath, destPath);
      movedCount++;
      console.log(`   ✅ ${file} - Movido`);

    } catch (error) {
      console.error(`   ❌ ${file} - Erro: ${error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ MOVIMENTAÇÃO CONCLUÍDA!');
  console.log('─'.repeat(80));
  console.log(`   📤 ${movedCount} arquivos movidos para debug/edited/`);
  console.log('─'.repeat(80));

  // 3. Limpar pasta editado (se vazia)
  const remainingFiles = await fs.readdir(SOURCE_DIR);
  const remainingImages = remainingFiles.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  if (remainingImages.length === 0) {
    console.log('\n✨ Pasta debug/all-duplicates/editado/ está vazia');
  } else {
    console.log(`\n⚠️  ${remainingImages.length} arquivos restantes em editado/`);
  }

  console.log('\n📋 PRÓXIMO PASSO:');
  console.log('   Processar os 34 produtos faltantes em debug/pending-edit/\n');
}

// Execute
moveDuplicatesToEdited().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
