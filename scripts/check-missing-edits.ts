/**
 * 🔍 CHECK MISSING EDITS - Verificar quais produtos faltam ser editados
 *
 * Compara originais vs editados considerando variações de nomes
 */

import fs from 'fs/promises';
import path from 'path';

const ORIGINALS_DIR = 'debug/originais';
const EDITED_DIR = 'debug/edited';

interface MissingProduct {
  original: string;
  id: string;
  hasVariation: boolean;
  variations?: string[];
}

async function checkMissingEdits(): Promise<void> {
  console.log('🔍 VERIFICANDO PRODUTOS FALTANTES\n');
  console.log('📂 Originais:', ORIGINALS_DIR);
  console.log('📂 Editados:', EDITED_DIR);
  console.log('='.repeat(80) + '\n');

  // 1. Ler arquivos
  const originals = await fs.readdir(ORIGINALS_DIR);
  const edited = await fs.readdir(EDITED_DIR);

  const originalImages = originals.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  console.log(`📊 Total de originais: ${originalImages.length}`);
  console.log(`📊 Total de editados: ${edited.length}\n`);

  // 2. Extrair IDs dos editados (considerando variações)
  const editedIds = new Set<string>();
  const editedMap = new Map<string, string[]>();

  edited.forEach(file => {
    // Extrair ID do produto (primeiros dígitos antes do hífen)
    const match = file.match(/^(\d+)-/);
    if (match) {
      const id = match[1];
      editedIds.add(id);

      if (!editedMap.has(id)) {
        editedMap.set(id, []);
      }
      editedMap.get(id)!.push(file);
    }
  });

  // 3. Verificar quais originais faltam
  const missing: MissingProduct[] = [];
  const found: MissingProduct[] = [];

  originalImages.forEach(original => {
    const match = original.match(/^(\d+)-/);
    if (match) {
      const id = match[1];

      if (editedIds.has(id)) {
        const variations = editedMap.get(id)!;

        // Verificar se tem match exato ou variação
        const exactMatch = variations.some(v => v === original);

        found.push({
          original,
          id,
          hasVariation: !exactMatch,
          variations
        });
      } else {
        missing.push({
          original,
          id,
          hasVariation: false
        });
      }
    }
  });

  // 4. Relatório
  console.log('='.repeat(80));
  console.log('📋 RESULTADO DA VERIFICAÇÃO\n');

  console.log(`✅ Produtos editados: ${found.length}`);
  console.log(`❌ Produtos faltando: ${missing.length}\n`);

  if (missing.length > 0) {
    console.log('🚨 PRODUTOS QUE FALTAM EDITAR:\n');
    missing.forEach((item, index) => {
      console.log(`   ${index + 1}. [ID ${item.id}] ${item.original}`);
    });
    console.log('');
  }

  // 5. Produtos com variações (nomes diferentes)
  const withVariations = found.filter(f => f.hasVariation);

  if (withVariations.length > 0) {
    console.log('⚠️  PRODUTOS COM NOMES DIFERENTES:\n');
    withVariations.slice(0, 10).forEach((item) => {
      console.log(`   📄 Original: ${item.original}`);
      console.log(`      Editado:  ${item.variations?.join(', ')}`);
      console.log('');
    });

    if (withVariations.length > 10) {
      console.log(`   ... e mais ${withVariations.length - 10} variações\n`);
    }
  }

  // 6. Salvar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    total_originals: originalImages.length,
    total_edited: edited.length,
    found: found.length,
    missing: missing.length,
    with_variations: withVariations.length,
    missing_products: missing.map(m => ({
      id: m.id,
      filename: m.original
    })),
    products_with_variations: withVariations.map(v => ({
      id: v.id,
      original: v.original,
      edited: v.variations
    }))
  };

  await fs.writeFile(
    'debug/missing-edits-check.json',
    JSON.stringify(report, null, 2)
  );

  console.log('='.repeat(80));
  console.log('💾 Relatório salvo: debug/missing-edits-check.json');
  console.log('='.repeat(80) + '\n');

  // 7. Resumo final
  if (missing.length === 0) {
    console.log('🎉 TODOS OS PRODUTOS FORAM EDITADOS!\n');
  } else {
    console.log(`⚠️  Ainda faltam ${missing.length} produtos para editar.\n`);
    console.log('📋 Lista completa dos faltantes:');
    missing.forEach(m => console.log(`   - ${m.original}`));
    console.log('');
  }
}

// Execute
checkMissingEdits().catch((error) => {
  console.error('❌ Erro:', error);
  process.exit(1);
});
