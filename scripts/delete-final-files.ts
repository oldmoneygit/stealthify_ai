/**
 * 🗑️ DELETE FINAL FILES - Remove arquivos com "final" no nome
 *
 * Remove arquivos que contenham "final" no nome da pasta debug/edited
 * para manter apenas arquivos com padrão de nomenclatura normal
 *
 * Uso:
 *   npx tsx scripts/delete-final-files.ts
 */

import fs from 'fs/promises';
import path from 'path';

const EDITED_DIR = 'debug/edited';

async function deleteFinalFiles(): Promise<void> {
  console.log('🗑️ REMOVENDO ARQUIVOS COM "FINAL" NO NOME\n');

  // 1. Ler arquivos da pasta edited
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  console.log(`📁 Total de arquivos em debug/edited: ${imageFiles.length}`);

  // 2. Identificar arquivos com "final" no nome
  const finalFiles = imageFiles.filter(f => f.includes('final'));
  const normalFiles = imageFiles.filter(f => !f.includes('final'));

  console.log(`\n📊 Estatísticas:`);
  console.log(`   🗑️ Arquivos com "final": ${finalFiles.length}`);
  console.log(`   ✅ Arquivos normais: ${normalFiles.length}`);

  if (finalFiles.length === 0) {
    console.log('\n✅ Nenhum arquivo com "final" encontrado!\n');
    return;
  }

  // 3. Mostrar arquivos que serão deletados
  console.log(`\n🔍 ARQUIVOS QUE SERÃO DELETADOS (${finalFiles.length}):\n`);

  finalFiles.slice(0, 10).forEach(file => {
    console.log(`   🗑️ ${file}`);
  });

  if (finalFiles.length > 10) {
    console.log(`   ... e mais ${finalFiles.length - 10} arquivos`);
  }

  // 4. Deletar arquivos
  console.log(`\n🗑️ Deletando arquivos...\n`);

  let deletedCount = 0;

  for (const file of finalFiles) {
    const filePath = path.join(EDITED_DIR, file);
    await fs.unlink(filePath);
    deletedCount++;
  }

  console.log(`✅ ${deletedCount} arquivos deletados`);

  // 5. Verificar resultado final
  const remainingFiles = await fs.readdir(EDITED_DIR);
  const remainingImages = remainingFiles.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ LIMPEZA CONCLUÍDA!');
  console.log('─'.repeat(80));
  console.log(`   🗑️ ${deletedCount} arquivos com "final" deletados`);
  console.log(`   ✅ ${remainingImages.length} arquivos restantes (padrão normal)`);
  console.log('─'.repeat(80));

  // 6. Mostrar alguns exemplos do padrão mantido
  console.log(`\n📋 EXEMPLOS DO PADRÃO MANTIDO:\n`);

  remainingImages.slice(0, 5).forEach(file => {
    console.log(`   ✅ ${file}`);
  });

  console.log(`\n✅ Todos os arquivos agora seguem o padrão: ID-Nome-Produto.jpg\n`);
}

// Execute
deleteFinalFiles().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
