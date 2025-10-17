/**
 * 🔄 NORMALIZE EDITED FILES - Normalizar nomes e converter para JPG
 *
 * 1. Remove sufixos (_edited, _edited-blur, etc.)
 * 2. Converte PNG para JPG com alta qualidade
 * 3. Mantém apenas arquivos .jpg padronizados
 */

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const EDITED_DIR = 'debug/edited';

interface FileNormalization {
  original: string;
  normalized: string;
  needsConversion: boolean;
  action: 'rename' | 'convert' | 'skip';
}

async function normalizeEditedFiles(): Promise<void> {
  console.log('🔄 NORMALIZANDO ARQUIVOS EDITADOS\n');
  console.log('📂 Diretório:', EDITED_DIR);
  console.log('='.repeat(80) + '\n');

  // 1. Ler todos os arquivos
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  console.log(`📊 Total de arquivos: ${imageFiles.length}`);
  console.log(`   JPG: ${imageFiles.filter(f => f.endsWith('.jpg')).length}`);
  console.log(`   PNG: ${imageFiles.filter(f => f.endsWith('.png')).length}\n`);

  // 2. Analisar cada arquivo
  const normalizations: FileNormalization[] = [];

  for (const file of imageFiles) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);

    // Remover sufixos conhecidos
    let normalized = basename
      .replace(/_edited-blur$/, '')
      .replace(/_edited$/, '')
      .replace(/_comparison$/, '')
      .replace(/_vision_analysis$/, '');

    normalized = normalized + '.jpg'; // Sempre .jpg

    // Determinar ação necessária
    let action: 'rename' | 'convert' | 'skip';
    let needsConversion = false;

    if (file === normalized) {
      action = 'skip'; // Já está correto
    } else if (ext === '.png') {
      action = 'convert'; // PNG precisa converter para JPG
      needsConversion = true;
    } else if (ext === '.jpg') {
      action = 'rename'; // JPG só precisa renomear
    } else {
      action = 'skip';
    }

    // Verificar se já existe arquivo com nome normalizado
    if (action !== 'skip') {
      const normalizedExists = imageFiles.includes(normalized) && normalized !== file;
      if (normalizedExists) {
        console.log(`   ⚠️  Conflito: ${file} → ${normalized} (já existe)`);
        action = 'skip'; // Não sobrescrever
      }
    }

    normalizations.push({
      original: file,
      normalized,
      needsConversion,
      action
    });
  }

  // 3. Executar normalizações
  console.log('🔄 Processando arquivos...\n');

  const toConvert = normalizations.filter(n => n.action === 'convert');
  const toRename = normalizations.filter(n => n.action === 'rename');
  const toSkip = normalizations.filter(n => n.action === 'skip');

  console.log(`   📋 Ações planejadas:`);
  console.log(`      Converter PNG → JPG: ${toConvert.length}`);
  console.log(`      Renomear JPG: ${toRename.length}`);
  console.log(`      Manter como está: ${toSkip.length}\n`);

  // 3.1. Converter PNG para JPG
  if (toConvert.length > 0) {
    console.log('🎨 Convertendo PNG para JPG...\n');

    for (let i = 0; i < toConvert.length; i++) {
      const item = toConvert[i];
      const sourcePath = path.join(EDITED_DIR, item.original);
      const tempPath = path.join(EDITED_DIR, `temp_${item.normalized}`);
      const finalPath = path.join(EDITED_DIR, item.normalized);

      try {
        // Converter PNG para JPG com Sharp
        await sharp(sourcePath)
          .jpeg({ quality: 95, mozjpeg: true })
          .toFile(tempPath);

        // Renomear temporário para final
        await fs.rename(tempPath, finalPath);

        // Remover PNG original
        await fs.unlink(sourcePath);

        console.log(`   ✅ [${i + 1}/${toConvert.length}] ${item.original} → ${item.normalized}`);

      } catch (error) {
        console.error(`   ❌ Erro ao converter ${item.original}:`, error);

        // Limpar arquivo temporário se existir
        try {
          await fs.unlink(tempPath);
        } catch {}
      }
    }
    console.log('');
  }

  // 3.2. Renomear JPG
  if (toRename.length > 0) {
    console.log('📝 Renomeando arquivos JPG...\n');

    for (let i = 0; i < toRename.length; i++) {
      const item = toRename[i];
      const sourcePath = path.join(EDITED_DIR, item.original);
      const finalPath = path.join(EDITED_DIR, item.normalized);

      try {
        await fs.rename(sourcePath, finalPath);
        console.log(`   ✅ [${i + 1}/${toRename.length}] ${item.original} → ${item.normalized}`);
      } catch (error) {
        console.error(`   ❌ Erro ao renomear ${item.original}:`, error);
      }
    }
    console.log('');
  }

  // 4. Verificar resultado final
  console.log('='.repeat(80));
  console.log('📊 VERIFICANDO RESULTADO FINAL\n');

  const finalFiles = await fs.readdir(EDITED_DIR);
  const finalImages = finalFiles.filter(f =>
    f.endsWith('.jpg') || f.endsWith('.png')
  );

  const finalJpg = finalImages.filter(f => f.endsWith('.jpg')).length;
  const finalPng = finalImages.filter(f => f.endsWith('.png')).length;

  console.log(`   Total de arquivos: ${finalImages.length}`);
  console.log(`   JPG: ${finalJpg}`);
  console.log(`   PNG: ${finalPng}\n`);

  // 5. Salvar relatório
  const report = {
    timestamp: new Date().toISOString(),
    before: {
      total: imageFiles.length,
      jpg: imageFiles.filter(f => f.endsWith('.jpg')).length,
      png: imageFiles.filter(f => f.endsWith('.png')).length
    },
    after: {
      total: finalImages.length,
      jpg: finalJpg,
      png: finalPng
    },
    actions: {
      converted: toConvert.length,
      renamed: toRename.length,
      skipped: toSkip.length
    },
    normalizations: normalizations.map(n => ({
      original: n.original,
      normalized: n.normalized,
      action: n.action
    }))
  };

  await fs.writeFile(
    'debug/normalization-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('='.repeat(80));
  console.log('✅ NORMALIZAÇÃO CONCLUÍDA!');
  console.log('─'.repeat(80));
  console.log(`   📄 Relatório: debug/normalization-report.json`);
  console.log('─'.repeat(80));

  if (finalPng === 0) {
    console.log('\n🎉 Todos os arquivos foram convertidos para JPG e normalizados!\n');
  } else {
    console.log(`\n⚠️  Ainda restam ${finalPng} arquivos PNG (possíveis conflitos)\n`);
  }
}

// Execute
normalizeEditedFiles().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
