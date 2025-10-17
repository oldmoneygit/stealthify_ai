import fs from 'fs';
import path from 'path';

const SOURCE_DIR = path.join(process.cwd(), 'debug', 'qwen');
const PROCESSED_DIRS = [
  path.join(process.cwd(), 'debug', 'qwen', 'processed-31-40-v2'),
  path.join(process.cwd(), 'debug', 'qwen', 'processed-41-60-v2')
];

console.log('🗑️  EXCLUSÃO DE ORIGINAIS - PRODUTOS 31-60\n');
console.log('📂 Diretório de origem:', SOURCE_DIR);
console.log('📁 Diretórios processados:');
PROCESSED_DIRS.forEach(dir => console.log('   -', dir));
console.log('\n' + '='.repeat(80) + '\n');

// Coletar todos os arquivos processados
const processedFiles = new Set<string>();

for (const dir of PROCESSED_DIRS) {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir)
      .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
      .filter(f => !f.startsWith('temp_'));

    files.forEach(f => processedFiles.add(f));
    console.log(`📊 ${path.basename(dir)}: ${files.length} imagens processadas`);
  } else {
    console.log(`⚠️  ${path.basename(dir)}: diretório não encontrado`);
  }
}

console.log('\n' + '-'.repeat(80) + '\n');
console.log(`📦 Total de imagens processadas: ${processedFiles.size}\n`);

// Deletar originais
let deletedCount = 0;
let notFoundCount = 0;

for (const filename of Array.from(processedFiles).sort()) {
  const originalPath = path.join(SOURCE_DIR, filename);

  if (fs.existsSync(originalPath)) {
    try {
      fs.unlinkSync(originalPath);
      console.log(`   ✅ ${filename} - DELETADO`);
      deletedCount++;
    } catch (error) {
      console.error(`   ❌ ${filename} - ERRO: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    console.log(`   ⚠️  ${filename} - NÃO ENCONTRADO (já foi deletado)`);
    notFoundCount++;
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 RESUMO DA EXCLUSÃO\n');
console.log(`Total processados:        ${processedFiles.size}`);
console.log(`✅ Deletados com sucesso: ${deletedCount}`);
console.log(`⚠️  Não encontrados:       ${notFoundCount}`);
console.log(`❌ Erros:                 ${processedFiles.size - deletedCount - notFoundCount}`);

// Contar quantos originais restam
const remainingFiles = fs.readdirSync(SOURCE_DIR)
  .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
  .filter(f => !f.startsWith('temp_'));

console.log(`\n📁 Originais restantes: ${remainingFiles.length}`);
console.log(`📈 Progresso: ${476 - remainingFiles.length}/476 produtos processados (${Math.round((476 - remainingFiles.length) / 476 * 100)}%)`);

console.log('\n✅ EXCLUSÃO CONCLUÍDA!\n');
