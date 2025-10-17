/**
 * 🔍 REVIEW DUPLICATES - Analisa e sugere melhor versão
 *
 * Analisa duplicatas e sugere qual versão manter baseado em:
 * - Prioridade 1: Arquivos com "final" no nome
 * - Prioridade 2: Arquivos mais recentes
 * - Prioridade 3: Arquivos maiores (melhor qualidade)
 *
 * Uso:
 *   npx tsx scripts/review-duplicates.ts
 */

import fs from 'fs/promises';
import path from 'path';

const EDITED_DIR = 'debug/edited';
const DUPLICATES_DIR = 'debug/edited/duplicatas';

interface FileInfo {
  name: string;
  size: number;
  mtime: Date;
  path: string;
  isFinal: boolean;
  isOldBackup: boolean;
  score: number;
}

interface DuplicateGroup {
  id: string;
  kept: FileInfo;
  duplicates: FileInfo[];
  suggestion: FileInfo;
}

async function getFileInfo(dir: string, filename: string): Promise<FileInfo> {
  const filePath = path.join(dir, filename);
  const stats = await fs.stat(filePath);

  const isFinal = filename.includes('final');
  const isOldBackup = filename.includes('old-backup');

  // Score: quanto maior, melhor
  let score = 0;
  if (isFinal) score += 100;
  if (isOldBackup) score -= 50;
  score += stats.size / 1000; // Adiciona tamanho em KB
  score += stats.mtime.getTime() / 1000000; // Adiciona timestamp (mais recente = maior)

  return {
    name: filename,
    size: stats.size,
    mtime: stats.mtime,
    path: filePath,
    isFinal,
    isOldBackup,
    score
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(date: Date): string {
  return date.toLocaleString('pt-BR');
}

async function reviewDuplicates(): Promise<void> {
  console.log('🔍 REVISÃO DE DUPLICATAS\n');

  // 1. Ler arquivos mantidos em edited/
  const editedFiles = await fs.readdir(EDITED_DIR);
  const editedImages = editedFiles.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('duplicatas')
  );

  // 2. Ler arquivos duplicados
  const duplicateFiles = await fs.readdir(DUPLICATES_DIR);

  // 3. Agrupar por ID (primeiros 5 dígitos)
  const groups = new Map<string, DuplicateGroup>();

  for (const file of editedImages) {
    const match = file.match(/^(\d{5})/);
    if (!match) continue;

    const id = match[1];
    const info = await getFileInfo(EDITED_DIR, file);

    if (!groups.has(id)) {
      groups.set(id, {
        id,
        kept: info,
        duplicates: [],
        suggestion: info
      });
    }
  }

  // 4. Adicionar duplicatas aos grupos
  for (const file of duplicateFiles) {
    const match = file.match(/^(\d{5})/);
    if (!match) continue;

    const id = match[1];
    if (!groups.has(id)) continue;

    const info = await getFileInfo(DUPLICATES_DIR, file);
    groups.get(id)!.duplicates.push(info);
  }

  // 5. Determinar melhor versão para cada grupo
  for (const group of groups.values()) {
    const allFiles = [group.kept, ...group.duplicates];
    allFiles.sort((a, b) => b.score - a.score);
    group.suggestion = allFiles[0];
  }

  // 6. Mostrar análise
  console.log('📊 ANÁLISE DE DUPLICATAS:\n');

  let needsAction = 0;

  for (const group of groups.values()) {
    if (group.duplicates.length === 0) continue;

    console.log(`\n${'='.repeat(80)}`);
    console.log(`ID: ${group.id}`);
    console.log('─'.repeat(80));

    // Mostrar arquivo mantido em edited/
    console.log(`\n📁 MANTIDO em edited/:`);
    console.log(`   Nome: ${group.kept.name}`);
    console.log(`   Tamanho: ${formatSize(group.kept.size)}`);
    console.log(`   Data: ${formatDate(group.kept.mtime)}`);
    console.log(`   Tipo: ${group.kept.isFinal ? '✅ FINAL' : group.kept.isOldBackup ? '⚠️ OLD BACKUP' : '📄 NORMAL'}`);
    console.log(`   Score: ${group.kept.score.toFixed(2)}`);

    // Mostrar duplicatas em duplicatas/
    console.log(`\n📦 DUPLICATAS (${group.duplicates.length}):`);
    for (const dup of group.duplicates) {
      console.log(`   → ${dup.name}`);
      console.log(`     Tamanho: ${formatSize(dup.size)}`);
      console.log(`     Data: ${formatDate(dup.mtime)}`);
      console.log(`     Tipo: ${dup.isFinal ? '✅ FINAL' : dup.isOldBackup ? '⚠️ OLD BACKUP' : '📄 NORMAL'}`);
      console.log(`     Score: ${dup.score.toFixed(2)}`);
    }

    // Sugestão
    console.log(`\n💡 SUGESTÃO:`);
    if (group.suggestion.name === group.kept.name) {
      console.log(`   ✅ Manter atual: ${group.kept.name}`);
      console.log(`   📝 Razão: Já é a melhor versão`);
    } else {
      console.log(`   🔄 TROCAR por: ${group.suggestion.name}`);
      console.log(`   📝 Razão: ${
        group.suggestion.isFinal ? 'É versão FINAL' :
        group.suggestion.size > group.kept.size ? 'Maior tamanho (melhor qualidade)' :
        group.suggestion.mtime > group.kept.mtime ? 'Mais recente' :
        'Score mais alto'
      }`);
      needsAction++;
    }
  }

  // 7. Resumo
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 RESUMO:');
  console.log('─'.repeat(80));
  console.log(`   Total de IDs com duplicatas: ${groups.size}`);
  console.log(`   ✅ Versão correta já mantida: ${groups.size - needsAction}`);
  console.log(`   🔄 Precisam troca: ${needsAction}`);
  console.log('─'.repeat(80));

  if (needsAction > 0) {
    console.log('\n📋 PRÓXIMOS PASSOS:');
    console.log('   1. Revisar sugestões acima');
    console.log('   2. Executar: npx tsx scripts/swap-duplicates.ts');
    console.log('   3. Script vai trocar automaticamente para melhor versão\n');
  } else {
    console.log('\n✅ Todas as versões corretas já estão em uso!\n');
  }

  // 8. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    total_groups: groups.size,
    needs_swap: needsAction,
    groups: Array.from(groups.values()).map(g => ({
      id: g.id,
      kept_file: g.kept.name,
      duplicates: g.duplicates.map(d => d.name),
      suggestion: g.suggestion.name,
      needs_swap: g.suggestion.name !== g.kept.name
    }))
  };

  await fs.writeFile(
    'debug/duplicates-review-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Relatório salvo: debug/duplicates-review-report.json\n');
}

// Execute
reviewDuplicates().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
