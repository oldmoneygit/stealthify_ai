import fs from 'fs';
import path from 'path';

// Directories
const SOURCE_DIR = path.join(process.cwd(), 'debug', 'qwen');
const PROCESSED_DIRS = [
  path.join(process.cwd(), 'debug', 'qwen', 'processed-10-v2'),
  path.join(process.cwd(), 'debug', 'qwen', 'processed-11-20-v2'),
  path.join(process.cwd(), 'debug', 'qwen', 'processed-21-30-v2')
];

interface DeleteResult {
  filename: string;
  deleted: boolean;
  reason?: string;
}

async function main() {
  console.log('🗑️  EXCLUSÃO DE IMAGENS ORIGINAIS PROCESSADAS\n');
  console.log('=' .repeat(80) + '\n');

  // Collect all processed filenames
  const processedFilenames = new Set<string>();

  for (const dir of PROCESSED_DIRS) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
        .filter(f => !f.startsWith('temp_')); // Ignore temp files

      console.log(`📂 ${path.basename(dir)}: ${files.length} arquivos processados`);

      files.forEach(f => processedFilenames.add(f));
    }
  }

  console.log(`\n✅ Total de arquivos únicos processados: ${processedFilenames.size}\n`);
  console.log('=' .repeat(80) + '\n');

  // Delete originals
  const results: DeleteResult[] = [];

  for (const filename of processedFilenames) {
    const originalPath = path.join(SOURCE_DIR, filename);

    if (fs.existsSync(originalPath)) {
      try {
        fs.unlinkSync(originalPath);
        results.push({
          filename,
          deleted: true
        });
        console.log(`✅ Deletado: ${filename}`);
      } catch (error) {
        results.push({
          filename,
          deleted: false,
          reason: error instanceof Error ? error.message : String(error)
        });
        console.log(`❌ Erro ao deletar: ${filename}`);
      }
    } else {
      results.push({
        filename,
        deleted: false,
        reason: 'Arquivo não encontrado no diretório original'
      });
      console.log(`⚠️  Não encontrado: ${filename}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DA EXCLUSÃO\n');

  const deleted = results.filter(r => r.deleted).length;
  const notDeleted = results.filter(r => !r.deleted).length;

  console.log(`Total processado:              ${results.length}`);
  console.log(`✅ Deletados com sucesso:      ${deleted}`);
  console.log(`❌ Não deletados:              ${notDeleted}`);

  if (notDeleted > 0) {
    console.log('\nArquivos não deletados:');
    results.filter(r => !r.deleted).forEach(r => {
      console.log(`   - ${r.filename}: ${r.reason}`);
    });
  }

  // Check remaining files in source
  const remainingFiles = fs.readdirSync(SOURCE_DIR)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i));

  console.log(`\n📂 Arquivos restantes em debug/qwen/: ${remainingFiles.length}`);
  console.log(`📊 Progresso: ${processedFilenames.size}/${processedFilenames.size + remainingFiles.length} processados`);

  console.log('\n✅ EXCLUSÃO CONCLUÍDA!\n');
}

main().catch(console.error);
