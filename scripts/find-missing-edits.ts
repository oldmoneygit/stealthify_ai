/**
 * 🔍 FIND MISSING EDITS - Identifica produtos que ainda não foram editados
 *
 * Compara debug/originais com debug/edited e identifica produtos faltantes
 * baseado nos primeiros 5 dígitos (ID único do produto)
 *
 * Uso:
 *   npx tsx scripts/find-missing-edits.ts
 */

import fs from 'fs/promises';
import path from 'path';

const EDITED_DIR = 'debug/edited';
const ORIGINALS_DIR = 'debug/originais';
const PENDING_DIR = 'debug/pending-edit';

async function findMissingEdits(): Promise<void> {
  console.log('🔍 PROCURANDO PRODUTOS FALTANTES\n');

  // 1. Ler arquivos editados
  console.log('📁 Lendo arquivos editados...');
  const editedFiles = await fs.readdir(EDITED_DIR);
  const editedImages = editedFiles.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  // 2. Ler arquivos originais
  console.log('📁 Lendo arquivos originais...');
  const originalFiles = await fs.readdir(ORIGINALS_DIR);
  const originalImages = originalFiles.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  console.log(`\n📊 Estatísticas:`);
  console.log(`   📝 Editados: ${editedImages.length} arquivos`);
  console.log(`   📦 Originais: ${originalImages.length} arquivos`);
  console.log(`   ❓ Faltantes: ${originalImages.length - editedImages.length} arquivos`);

  // 3. Extrair IDs dos editados (primeiros 5 dígitos)
  const editedIds = new Set<string>();
  for (const file of editedImages) {
    const match = file.match(/^(\d{5})/);
    if (match) {
      editedIds.add(match[1]);
    }
  }

  // 4. Extrair IDs dos originais e comparar
  const missingProducts: { id: string; file: string }[] = [];

  for (const file of originalImages) {
    const match = file.match(/^(\d{5})/);
    if (!match) {
      console.log(`⚠️  Arquivo sem ID numérico: ${file}`);
      continue;
    }

    const id = match[1];

    if (!editedIds.has(id)) {
      missingProducts.push({ id, file });
    }
  }

  // 5. Exibir produtos faltantes
  console.log(`\n🔍 PRODUTOS FALTANTES (${missingProducts.length}):\n`);

  if (missingProducts.length === 0) {
    console.log('✅ Nenhum produto faltante! Todos foram editados.\n');
    return;
  }

  for (const product of missingProducts) {
    console.log(`   ID ${product.id}: ${product.file}`);
  }

  // 6. Criar pasta para produtos faltantes
  console.log(`\n📂 Criando pasta: ${PENDING_DIR}`);
  await fs.mkdir(PENDING_DIR, { recursive: true });

  // 7. Copiar produtos faltantes
  console.log('\n📦 Copiando produtos faltantes...\n');

  for (const product of missingProducts) {
    const sourcePath = path.join(ORIGINALS_DIR, product.file);
    const destPath = path.join(PENDING_DIR, product.file);

    await fs.copyFile(sourcePath, destPath);
    console.log(`   ✅ Copiado: ${product.file}`);
  }

  // 8. Resumo
  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ PROCESSO CONCLUÍDO!');
  console.log('─'.repeat(80));
  console.log(`   📦 ${missingProducts.length} produtos faltantes identificados`);
  console.log(`   📁 Copiados para: ${PENDING_DIR}`);
  console.log('─'.repeat(80));

  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('   1. Revisar produtos em debug/pending-edit/');
  console.log('   2. Executar pipeline de edição nesses produtos');
  console.log('   3. Mover editados de volta para debug/edited/\n');

  // 9. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    total_originals: originalImages.length,
    total_edited: editedImages.length,
    missing_count: missingProducts.length,
    missing_products: missingProducts.map(p => ({
      id: p.id,
      filename: p.file
    }))
  };

  await fs.writeFile(
    'debug/missing-edits-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Relatório salvo: debug/missing-edits-report.json\n');
}

// Execute
findMissingEdits().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
