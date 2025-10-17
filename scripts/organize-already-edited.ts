import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const ALL_IMAGES_DIR = path.join(process.cwd(), 'debug', 'qwen', 'all-images');
const ALREADY_EDITED_DIR = path.join(process.cwd(), 'debug', 'qwen', 'all-images', 'editado');

// Pastas com imagens já editadas
const EDITED_FOLDERS = [
  path.join(process.cwd(), 'debug', 'comparison', 'edited'),
  path.join(process.cwd(), 'debug', 'comparison', 'blur-edited-smart'),
  path.join(process.cwd(), 'debug', 'processed', 'edited'),
  path.join(process.cwd(), 'debug', 'processed', 'blur-smart'),
];

// ============================================================================
// FUNÇÕES
// ============================================================================

function extractProductId(filename: string): string {
  // Extrai o ID do produto (números no início do nome)
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '';
}

function getAllEditedProductIds(): Set<string> {
  const editedIds = new Set<string>();

  for (const folder of EDITED_FOLDERS) {
    if (!fs.existsSync(folder)) {
      console.log(`   ⚠️  Pasta não encontrada: ${folder}`);
      continue;
    }

    const files = fs.readdirSync(folder);
    console.log(`   📂 ${path.basename(folder)}: ${files.length} arquivos`);

    for (const file of files) {
      const productId = extractProductId(file);
      if (productId) {
        editedIds.add(productId);
      }
    }
  }

  return editedIds;
}

function moveAlreadyEditedImages(): void {
  console.log(`🚀 ORGANIZAR IMAGENS JÁ EDITADAS\n`);
  console.log(`📂 Pasta de entrada: ${ALL_IMAGES_DIR}`);
  console.log(`📁 Pasta de destino: ${ALREADY_EDITED_DIR}\n`);

  // Verificar se a pasta de entrada existe
  if (!fs.existsSync(ALL_IMAGES_DIR)) {
    console.error(`❌ Pasta não encontrada: ${ALL_IMAGES_DIR}`);
    process.exit(1);
  }

  // Criar pasta de destino se não existir
  if (!fs.existsSync(ALREADY_EDITED_DIR)) {
    fs.mkdirSync(ALREADY_EDITED_DIR, { recursive: true });
    console.log(`✅ Pasta criada: ${ALREADY_EDITED_DIR}\n`);
  }

  // Obter todos os IDs de produtos já editados
  console.log(`🔍 Buscando IDs de produtos já editados...\n`);
  const editedIds = getAllEditedProductIds();
  console.log(`\n✅ Total de IDs únicos editados: ${editedIds.size}\n`);

  // Listar todas as imagens na pasta all-images
  const allImages = fs.readdirSync(ALL_IMAGES_DIR)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return (ext === '.jpg' || ext === '.jpeg' || ext === '.png') && fs.statSync(path.join(ALL_IMAGES_DIR, f)).isFile();
    });

  console.log(`📸 Total de imagens na pasta: ${allImages.length}\n`);
  console.log(`${'='.repeat(80)}\n`);

  let movedCount = 0;
  let skippedCount = 0;

  // Processar cada imagem
  for (let i = 0; i < allImages.length; i++) {
    const filename = allImages[i];
    const productId = extractProductId(filename);

    if (!productId) {
      console.log(`⚠️  [${i + 1}/${allImages.length}] ${filename} - SEM ID (mantendo)`);
      skippedCount++;
      continue;
    }

    const sourcePath = path.join(ALL_IMAGES_DIR, filename);
    const destPath = path.join(ALREADY_EDITED_DIR, filename);

    if (editedIds.has(productId)) {
      // Imagem já foi editada - mover para pasta "editado"
      try {
        fs.renameSync(sourcePath, destPath);
        console.log(`✅ [${i + 1}/${allImages.length}] ID: ${productId} - ${filename} → MOVIDO`);
        movedCount++;
      } catch (error) {
        console.error(`❌ [${i + 1}/${allImages.length}] Erro ao mover ${filename}:`, error);
      }
    } else {
      // Imagem ainda não foi editada - manter na pasta original
      console.log(`⏭️  [${i + 1}/${allImages.length}] ID: ${productId} - ${filename} - NÃO EDITADO (mantendo)`);
      skippedCount++;
    }
  }

  // Relatório final
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RELATÓRIO FINAL\n`);
  console.log(`Total de imagens processadas:     ${allImages.length}`);
  console.log(`Movidas (já editadas):            ${movedCount}`);
  console.log(`Mantidas (não editadas):          ${skippedCount}`);
  console.log(`\n✅ Organização concluída!`);
  console.log(`\n📂 Imagens já editadas em: ${ALREADY_EDITED_DIR}`);
  console.log(`📂 Imagens para editar em: ${ALL_IMAGES_DIR}`);
}

// ============================================================================
// MAIN
// ============================================================================

moveAlreadyEditedImages();
