import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env.local') });

import fs from 'fs';
import Database from 'better-sqlite3';

const dbPath = path.join(process.cwd(), 'database', 'products.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

const PROCESSED_DIRS = [
  { dir: path.join(process.cwd(), 'debug', 'qwen', 'processed-10-v2'), range: '1-10' },
  { dir: path.join(process.cwd(), 'debug', 'qwen', 'processed-11-20-v2'), range: '11-20' },
  { dir: path.join(process.cwd(), 'debug', 'qwen', 'processed-21-30-v2'), range: '21-30' }
];

interface UpdateResult {
  filename: string;
  productId: string;
  status: 'inserted' | 'updated' | 'error' | 'not_found';
  error?: string;
}

/**
 * Extract product ID from filename
 * Example: "25867-Air-Jordan-1-High-OG-Stage-Haze.jpg" -> "25867"
 */
function extractProductId(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '';
}

/**
 * Convert image file to base64
 */
function imageToBase64(imagePath: string): string {
  const buffer = fs.readFileSync(imagePath);
  return buffer.toString('base64');
}

/**
 * Find or create product in database by WooCommerce product ID
 */
function findOrCreateProduct(wooProductId: number): number | null {
  // Try to find existing product
  const existing = db.prepare('SELECT id FROM products WHERE woo_product_id = ?').get(wooProductId) as { id: number } | undefined;

  if (existing) {
    return existing.id;
  }

  // If not found, create a placeholder product
  // (In real scenario, this would be synced from WooCommerce first)
  try {
    const result = db.prepare(`
      INSERT INTO products (woo_product_id, sku, name, price, image_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      wooProductId,
      `SKU-${wooProductId}`, // Placeholder SKU
      `Product ${wooProductId}`, // Placeholder name
      0, // Placeholder price
      '' // Will be updated with edited image
    );

    return result.lastInsertRowid as number;
  } catch (error) {
    console.error(`Error creating product ${wooProductId}:`, error);
    return null;
  }
}

/**
 * Insert or update analysis record
 */
function upsertAnalysis(
  productId: number,
  editedImageBase64: string,
  editedImageFilepath: string,
  status: 'clean' | 'blur_applied'
): boolean {
  try {
    // Check if analysis already exists
    const existing = db.prepare('SELECT id FROM analyses WHERE product_id = ?').get(productId) as { id: number } | undefined;

    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE analyses
        SET edited_image_base64 = ?,
            edited_image_filepath = ?,
            status = ?,
            analyzed_at = CURRENT_TIMESTAMP
        WHERE product_id = ?
      `).run(editedImageBase64, editedImageFilepath, status, productId);

      return true;
    } else {
      // Insert new
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
        'Original Title', // Placeholder
        'Camouflaged Title', // Placeholder
        '', // Placeholder
        editedImageBase64,
        editedImageFilepath,
        JSON.stringify(['Nike', 'Jordan', 'Adidas']), // Default brands
        0, // Default risk score (0 = clean)
        status
      );

      return true;
    }
  } catch (error) {
    console.error(`Error upserting analysis for product ${productId}:`, error);
    return false;
  }
}

async function main() {
  console.log('💾 ATUALIZAÇÃO DO BANCO DE DADOS COM IMAGENS EDITADAS\n');
  console.log('=' .repeat(80) + '\n');

  const results: UpdateResult[] = [];

  for (const { dir, range } of PROCESSED_DIRS) {
    console.log(`\n📂 Processando: ${path.basename(dir)} (Produtos ${range})\n`);

    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Diretório não encontrado: ${dir}\n`);
      continue;
    }

    const files = fs.readdirSync(dir)
      .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
      .filter(f => !f.startsWith('temp_'))
      .sort();

    for (const filename of files) {
      const imagePath = path.join(dir, filename);
      const productIdStr = extractProductId(filename);

      if (!productIdStr) {
        results.push({
          filename,
          productId: '',
          status: 'error',
          error: 'Não foi possível extrair ID do produto'
        });
        console.log(`❌ ${filename}: Não foi possível extrair ID`);
        continue;
      }

      const wooProductId = parseInt(productIdStr, 10);

      try {
        // Find or create product
        const productId = findOrCreateProduct(wooProductId);

        if (!productId) {
          results.push({
            filename,
            productId: productIdStr,
            status: 'error',
            error: 'Falha ao criar/encontrar produto no banco'
          });
          console.log(`❌ ${filename}: Falha ao criar produto`);
          continue;
        }

        // Convert image to base64
        const editedImageBase64 = imageToBase64(imagePath);

        // Determine status (check filename or assume clean)
        const status: 'clean' | 'blur_applied' = 'clean'; // Default to clean

        // Update analysis
        const success = upsertAnalysis(
          productId,
          editedImageBase64,
          imagePath,
          status
        );

        if (success) {
          results.push({
            filename,
            productId: productIdStr,
            status: 'updated'
          });
          console.log(`✅ ${filename}: Atualizado (ID: ${wooProductId})`);
        } else {
          results.push({
            filename,
            productId: productIdStr,
            status: 'error',
            error: 'Falha ao atualizar análise'
          });
          console.log(`❌ ${filename}: Falha ao atualizar análise`);
        }

      } catch (error) {
        results.push({
          filename,
          productId: productIdStr,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
        console.log(`❌ ${filename}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DA ATUALIZAÇÃO\n');

  const updated = results.filter(r => r.status === 'updated').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log(`Total processado:              ${results.length}`);
  console.log(`✅ Atualizados com sucesso:    ${updated}`);
  console.log(`❌ Erros:                      ${errors}`);

  if (errors > 0) {
    console.log('\nErros encontrados:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`   - ${r.filename}: ${r.error}`);
    });
  }

  // Check database
  const totalAnalyses = db.prepare('SELECT COUNT(*) as count FROM analyses').get() as { count: number };
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

  console.log('\n📊 ESTADO DO BANCO DE DADOS:');
  console.log(`   Total de produtos: ${totalProducts.count}`);
  console.log(`   Total de análises: ${totalAnalyses.count}`);

  db.close();

  console.log('\n✅ ATUALIZAÇÃO CONCLUÍDA!\n');
  console.log('💡 As imagens editadas agora estão disponíveis no banco de dados.');
  console.log('💡 A interface web irá exibir as imagens editadas.');
  console.log('💡 A importação para Shopify usará as imagens editadas.\n');
}

main().catch(console.error);
