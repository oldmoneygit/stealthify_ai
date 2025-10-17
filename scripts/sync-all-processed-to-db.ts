import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH = path.join(process.cwd(), 'database', 'products.db');
const BASE_DIR = path.join(process.cwd(), 'debug', 'qwen');

console.log('🔄 SINCRONIZAÇÃO DE PRODUTOS EDITADOS COM O BANCO DE DADOS\n');
console.log('📂 Base directory:', BASE_DIR);
console.log('💾 Database:', DB_PATH);
console.log('\n' + '='.repeat(80) + '\n');

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

interface SyncResult {
  productId: number;
  filename: string;
  status: 'updated' | 'inserted' | 'not_found' | 'error';
  error?: string;
}

function getProductIdFromFilename(filename: string): number | null {
  const match = filename.match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function getProductByWooId(wooId: number): any {
  const row = db.prepare('SELECT * FROM products WHERE woo_product_id = ?').get(wooId);
  return row;
}

function upsertAnalysis(
  productId: number,
  editedImageBase64: string,
  editedImageFilepath: string,
  status: 'clean' | 'blur_applied'
): boolean {
  try {
    // Get product details
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);

    if (!product) {
      console.error(`   ❌ Produto ID ${productId} não encontrado no banco`);
      return false;
    }

    // Check if analysis already exists
    const existing = db.prepare('SELECT id FROM analyses WHERE product_id = ?').get(productId);

    if (existing) {
      // Update existing analysis
      db.prepare(`
        UPDATE analyses
        SET edited_image_base64 = ?,
            edited_image_filepath = ?,
            status = ?,
            analyzed_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(editedImageBase64, editedImageFilepath, status, productId);
    } else {
      // Insert new analysis record
      db.prepare(`
        INSERT INTO analyses (
          product_id,
          original_title,
          camouflaged_title,
          original_image_url,
          edited_image_base64,
          edited_image_filepath,
          brands_detected,
          risk_score,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        product.name,
        product.name, // For now, keeping same title
        product.image_url,
        editedImageBase64,
        editedImageFilepath,
        JSON.stringify(['Nike', 'Jordan', 'Adidas']),
        status === 'clean' ? 0 : 50,
        status
      );
    }

    return true;
  } catch (error) {
    console.error(`   ❌ Erro ao atualizar produto ${productId}:`, error);
    return false;
  }
}

async function processDirectory(dirPath: string): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  if (!fs.existsSync(dirPath)) {
    console.log(`⚠️  Diretório não encontrado: ${dirPath}`);
    return results;
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
    .filter(f => !f.startsWith('temp_'))
    .sort();

  console.log(`\n📁 ${path.basename(dirPath)}: ${files.length} imagens`);
  console.log('-'.repeat(80));

  for (const filename of files) {
    const filePath = path.join(dirPath, filename);
    const wooProductId = getProductIdFromFilename(filename);

    if (!wooProductId) {
      console.log(`   ⚠️  ${filename} - ID não identificado`);
      results.push({
        productId: 0,
        filename,
        status: 'error',
        error: 'Could not extract product ID from filename'
      });
      continue;
    }

    // Get product from database
    const product = getProductByWooId(wooProductId);

    if (!product) {
      console.log(`   ⚠️  ${filename} - Produto ${wooProductId} não encontrado no DB`);
      results.push({
        productId: wooProductId,
        filename,
        status: 'not_found',
        error: 'Product not found in database'
      });
      continue;
    }

    try {
      // Read image and convert to base64
      const imageBuffer = fs.readFileSync(filePath);
      const base64 = imageBuffer.toString('base64');
      const dataUri = `data:image/png;base64,${base64}`;

      // Determine status based on directory name or filename patterns
      // For simplicity, we'll check if the image has "blur" in metadata or just default to 'clean'
      // In a more sophisticated version, you could re-analyze or store metadata
      const status: 'clean' | 'blur_applied' = 'clean'; // Default assumption

      // Upsert analysis
      const success = upsertAnalysis(
        product.id,
        dataUri,
        filePath,
        status
      );

      if (success) {
        console.log(`   ✅ ${filename} - Atualizado (Product DB ID: ${product.id})`);
        results.push({
          productId: product.id,
          filename,
          status: 'updated'
        });
      } else {
        console.log(`   ❌ ${filename} - Erro ao atualizar`);
        results.push({
          productId: product.id,
          filename,
          status: 'error',
          error: 'Failed to upsert analysis'
        });
      }
    } catch (error) {
      console.log(`   ❌ ${filename} - Erro: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        productId: product.id,
        filename,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return results;
}

async function main() {
  // Find all processed-* directories
  const allDirs = fs.readdirSync(BASE_DIR)
    .filter(name => name.startsWith('processed-') && name.endsWith('-v2'))
    .map(name => path.join(BASE_DIR, name))
    .filter(dirPath => fs.statSync(dirPath).isDirectory())
    .sort();

  console.log(`📊 Diretórios encontrados: ${allDirs.length}\n`);

  const allResults: SyncResult[] = [];

  for (const dir of allDirs) {
    const results = await processDirectory(dir);
    allResults.push(...results);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DA SINCRONIZAÇÃO\n');

  const updated = allResults.filter(r => r.status === 'updated').length;
  const inserted = allResults.filter(r => r.status === 'inserted').length;
  const notFound = allResults.filter(r => r.status === 'not_found').length;
  const errors = allResults.filter(r => r.status === 'error').length;

  console.log(`Total processado:           ${allResults.length}`);
  console.log(`✅ Atualizados com sucesso: ${updated}`);
  console.log(`➕ Inseridos:               ${inserted}`);
  console.log(`⚠️  Produtos não encontrados: ${notFound}`);
  console.log(`❌ Erros:                   ${errors}`);

  if (notFound > 0) {
    console.log('\n⚠️  PRODUTOS NÃO ENCONTRADOS NO BANCO:');
    console.log('   Estes produtos precisam ser sincronizados do WooCommerce primeiro.');
    console.log('   Execute: POST /api/sync para sincronizar produtos do WooCommerce.\n');
  }

  // Check database stats
  const totalAnalyses = db.prepare('SELECT COUNT(*) as count FROM analyses').get() as { count: number };
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

  console.log('\n📈 ESTATÍSTICAS DO BANCO:\n');
  console.log(`   Total de produtos:  ${totalProducts.count}`);
  console.log(`   Total de análises:  ${totalAnalyses.count}`);
  console.log(`   Taxa de cobertura:  ${Math.round((totalAnalyses.count / totalProducts.count) * 100)}%`);

  console.log('\n✅ SINCRONIZAÇÃO CONCLUÍDA!\n');

  db.close();
}

main().catch(error => {
  console.error('\n❌ ERRO FATAL:', error);
  db.close();
  process.exit(1);
});
