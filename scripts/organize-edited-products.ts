import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const QWEN_DIR = path.join(process.cwd(), 'debug', 'qwen');
const EDITADO_DIR = path.join(QWEN_DIR, 'editado');

// Pastas com produtos editados
const EDITED_FOLDERS = [
  path.join(process.cwd(), 'debug', 'comparison', 'blur-edited'),
  path.join(process.cwd(), 'debug', 'comparison', 'blur-edited-smart'),
  path.join(process.cwd(), 'debug', 'comparison', 'edited'),
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

  console.log('🔍 Buscando produtos editados nas 3 pastas...\n');

  for (const folder of EDITED_FOLDERS) {
    if (!fs.existsSync(folder)) {
      console.log(`   ⚠️  Pasta não encontrada: ${folder}`);
      continue;
    }

    const files = fs.readdirSync(folder)
      .filter(f => f.match(/\.(jpg|jpeg|png)$/i));

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

function organizeProducts(): void {
  console.log(`🚀 ORGANIZAÇÃO DE PRODUTOS EDITADOS\n`);
  console.log(`📂 Pasta de produtos originais: ${QWEN_DIR}`);
  console.log(`📁 Pasta de destino: ${EDITADO_DIR}\n`);

  // Criar pasta editado se não existir
  if (!fs.existsSync(EDITADO_DIR)) {
    fs.mkdirSync(EDITADO_DIR, { recursive: true });
    console.log(`✅ Pasta criada: ${EDITADO_DIR}\n`);
  }

  // Obter todos os IDs de produtos editados
  const editedIds = getAllEditedProductIds();
  console.log(`\n✅ Total de IDs únicos editados: ${editedIds.size}\n`);

  // Listar todas as imagens na pasta qwen
  const qwenImages = fs.readdirSync(QWEN_DIR)
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      const isImage = (ext === '.jpg' || ext === '.jpeg' || ext === '.png');
      const fullPath = path.join(QWEN_DIR, f);
      const isFile = fs.statSync(fullPath).isFile();
      return isImage && isFile;
    });

  console.log(`📸 Total de imagens em debug/qwen/: ${qwenImages.length}\n`);
  console.log(`${'='.repeat(80)}\n`);

  let movedCount = 0;
  let skippedCount = 0;

  // Processar cada imagem
  for (let i = 0; i < qwenImages.length; i++) {
    const filename = qwenImages[i];
    const productId = extractProductId(filename);

    if (!productId) {
      console.log(`⚠️  [${i + 1}/${qwenImages.length}] ${filename} - SEM ID (mantendo)`);
      skippedCount++;
      continue;
    }

    const sourcePath = path.join(QWEN_DIR, filename);
    const destPath = path.join(EDITADO_DIR, filename);

    if (editedIds.has(productId)) {
      // Produto já foi editado - mover para pasta editado
      try {
        fs.renameSync(sourcePath, destPath);
        console.log(`✅ [${i + 1}/${qwenImages.length}] ID: ${productId} - ${filename} → MOVIDO`);
        movedCount++;
      } catch (error) {
        console.error(`❌ [${i + 1}/${qwenImages.length}] Erro ao mover ${filename}:`, error);
      }
    } else {
      // Produto não foi editado - manter na pasta original
      console.log(`⏭️  [${i + 1}/${qwenImages.length}] ID: ${productId} - ${filename} - NÃO EDITADO (mantendo)`);
      skippedCount++;
    }
  }

  // Relatório final
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RELATÓRIO FINAL\n`);
  console.log(`Total de imagens processadas:     ${qwenImages.length}`);
  console.log(`Movidas (já editadas):            ${movedCount}`);
  console.log(`Mantidas (não editadas):          ${skippedCount}`);
  console.log(`\n✅ Organização concluída!`);
  console.log(`\n📂 Produtos editados em: ${EDITADO_DIR}`);
  console.log(`📂 Produtos para editar em: ${QWEN_DIR}`);
}

// ============================================================================
// MAIN
// ============================================================================

organizeProducts();
