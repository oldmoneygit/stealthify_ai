/**
 * 🔍 SHOW ALL DUPLICATES - Identifica e MOVE todas as duplicatas
 *
 * Mostra exatamente quais IDs têm duplicatas e MOVE (não copia)
 * todos os arquivos duplicados para uma pasta separada
 *
 * Uso:
 *   npx tsx scripts/show-all-duplicates.ts
 */

import fs from 'fs/promises';
import path from 'path';

const EDITED_DIR = 'debug/edited';
const ALL_DUPLICATES_DIR = 'debug/all-duplicates';

interface FileInfo {
  id: string;
  filename: string;
  path: string;
}

async function showAllDuplicates(): Promise<void> {
  console.log('🔍 IDENTIFICANDO TODAS AS DUPLICATAS\n');

  // 1. Ler todos os arquivos em debug/edited
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  console.log(`📁 Total de arquivos em debug/edited: ${imageFiles.length}`);

  // 2. Agrupar por ID (primeiros 5 dígitos)
  const idGroups = new Map<string, FileInfo[]>();

  for (const file of imageFiles) {
    const match = file.match(/^(\d{5})/);
    if (!match) {
      console.log(`⚠️  Arquivo sem ID numérico: ${file}`);
      continue;
    }

    const id = match[1];

    if (!idGroups.has(id)) {
      idGroups.set(id, []);
    }

    idGroups.get(id)!.push({
      id,
      filename: file,
      path: path.join(EDITED_DIR, file)
    });
  }

  // 3. Identificar IDs com duplicatas
  const duplicateGroups: Map<string, FileInfo[]> = new Map();
  let uniqueIds = 0;
  let totalDuplicates = 0;

  for (const [id, files] of idGroups.entries()) {
    if (files.length > 1) {
      duplicateGroups.set(id, files);
      totalDuplicates += files.length - 1; // -1 porque vamos manter 1
    } else {
      uniqueIds++;
    }
  }

  console.log(`\n📊 Estatísticas:`);
  console.log(`   ✅ IDs únicos (sem duplicatas): ${uniqueIds}`);
  console.log(`   🔄 IDs com duplicatas: ${duplicateGroups.size}`);
  console.log(`   📦 Total de arquivos duplicados: ${totalDuplicates}`);

  if (duplicateGroups.size === 0) {
    console.log('\n✅ Nenhuma duplicata encontrada!\n');
    return;
  }

  // 4. Mostrar TODAS as duplicatas
  console.log(`\n🔍 DUPLICATAS ENCONTRADAS (${duplicateGroups.size} IDs):\n`);

  for (const [id, files] of duplicateGroups.entries()) {
    console.log(`   ID ${id} (${files.length} arquivos):`);
    files.forEach((file, index) => {
      const marker = index === 0 ? '✅ MANTER' : '📤 MOVER';
      console.log(`      ${marker}: ${file.filename}`);
    });
    console.log('');
  }

  // 5. Criar pasta para duplicatas
  console.log(`📂 Criando pasta: ${ALL_DUPLICATES_DIR}\n`);
  await fs.mkdir(ALL_DUPLICATES_DIR, { recursive: true });

  // 6. MOVER duplicatas (mantém o primeiro, move os outros)
  console.log('📦 MOVENDO duplicatas...\n');

  let movedCount = 0;

  for (const [id, files] of duplicateGroups.entries()) {
    const [keep, ...toMove] = files;

    console.log(`   ID ${id}:`);
    console.log(`      ✅ Mantido: ${keep.filename}`);

    for (const file of toMove) {
      const destPath = path.join(ALL_DUPLICATES_DIR, file.filename);
      await fs.rename(file.path, destPath);
      console.log(`      📤 Movido: ${file.filename}`);
      movedCount++;
    }
  }

  // 7. Verificar resultado final
  const remainingFiles = await fs.readdir(EDITED_DIR);
  const remainingImages = remainingFiles.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ PROCESSO CONCLUÍDO!');
  console.log('─'.repeat(80));
  console.log(`   📤 ${movedCount} arquivos duplicados movidos`);
  console.log(`   📁 Movidos para: ${ALL_DUPLICATES_DIR}`);
  console.log(`   ✅ ${remainingImages.length} arquivos únicos restantes em debug/edited`);
  console.log('─'.repeat(80));

  // 8. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    original_count: imageFiles.length,
    unique_ids: uniqueIds,
    duplicate_ids: duplicateGroups.size,
    files_moved: movedCount,
    remaining_files: remainingImages.length,
    duplicate_groups: Array.from(duplicateGroups.entries()).map(([id, files]) => ({
      id,
      total_files: files.length,
      kept_file: files[0].filename,
      moved_files: files.slice(1).map(f => f.filename)
    }))
  };

  await fs.writeFile(
    'debug/all-duplicates-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n📄 Relatório detalhado salvo: debug/all-duplicates-report.json\n');
}

// Execute
showAllDuplicates().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
