/**
 * 🔄 MOVE DUPLICATES - Identifica e move imagens duplicadas
 *
 * Baseado nos primeiros 5 números do nome do arquivo (ID único do produto),
 * identifica duplicatas e as move para a pasta duplicatas/
 *
 * Uso:
 *   npx tsx scripts/move-duplicates.ts
 */

import fs from 'fs/promises';
import path from 'path';

const EDITED_DIR = 'debug/edited';
const DUPLICATES_DIR = 'debug/edited/duplicatas';

interface FileGroup {
  id: string;
  files: string[];
}

async function moveDuplicates(): Promise<void> {
  console.log('🔍 Procurando duplicatas...\n');

  // 1. Ler todos os arquivos de debug/edited
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.jpeg')
  );

  console.log(`📁 Total de arquivos: ${imageFiles.length}`);

  // 2. Agrupar por ID (primeiros 5 dígitos)
  const groups = new Map<string, string[]>();

  for (const file of imageFiles) {
    // Extrair primeiros 5 dígitos
    const match = file.match(/^(\d{5})/);
    if (!match) {
      console.log(`⚠️  Arquivo sem ID numérico: ${file}`);
      continue;
    }

    const id = match[1];

    if (!groups.has(id)) {
      groups.set(id, []);
    }
    groups.get(id)!.push(file);
  }

  // 3. Identificar duplicatas (IDs com mais de 1 arquivo)
  const duplicates: FileGroup[] = [];

  for (const [id, files] of groups.entries()) {
    if (files.length > 1) {
      duplicates.push({ id, files });
    }
  }

  console.log(`\n📊 Estatísticas:`);
  console.log(`   ✅ IDs únicos: ${groups.size}`);
  console.log(`   🔄 IDs com duplicatas: ${duplicates.length}`);

  if (duplicates.length === 0) {
    console.log('\n✅ Nenhuma duplicata encontrada!');
    return;
  }

  // 4. Mostrar duplicatas encontradas
  console.log(`\n🔍 Duplicatas encontradas:\n`);

  for (const dup of duplicates) {
    console.log(`   ID ${dup.id}:`);
    for (const file of dup.files) {
      console.log(`      - ${file}`);
    }
    console.log('');
  }

  // 5. Mover duplicatas (mantém o primeiro, move os outros)
  console.log('📦 Movendo duplicatas...\n');

  let movedCount = 0;

  for (const dup of duplicates) {
    // Manter o primeiro arquivo, mover os outros
    const [keep, ...toMove] = dup.files;

    console.log(`   ID ${dup.id}:`);
    console.log(`      ✅ Mantido: ${keep}`);

    for (const file of toMove) {
      const sourcePath = path.join(EDITED_DIR, file);
      const destPath = path.join(DUPLICATES_DIR, file);

      await fs.rename(sourcePath, destPath);
      console.log(`      📤 Movido: ${file}`);
      movedCount++;
    }
    console.log('');
  }

  console.log(`\n✅ Processo concluído!`);
  console.log(`   📦 ${movedCount} arquivos movidos para duplicatas/`);
  console.log(`   ✅ ${groups.size - duplicates.length} arquivos únicos mantidos em edited/`);
}

// Execute
moveDuplicates().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
