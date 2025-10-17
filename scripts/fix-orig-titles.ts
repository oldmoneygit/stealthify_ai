/**
 * 🔧 Fix "orig Title" issue in database
 *
 * Alguns produtos têm "orig Title" ao invés do título camuflado correto.
 * Este script vai:
 * 1. Identificar produtos com esse problema
 * 2. Gerar títulos camuflados corretos
 * 3. Atualizar no banco de dados
 */

import Database from 'better-sqlite3';
import path from 'path';
import { camouflage } from '../src/services/title.service';

const dbPath = path.join(process.cwd(), 'database', 'products.db');
const db = new Database(dbPath);

interface Product {
  product_id: number;
  sku: string;
  name: string;
  camouflaged_title: string | null;
}

async function fixOrigTitles() {
  console.log('\n🔧 Starting to fix "orig Title" issue...\n');

  // Buscar produtos com "orig Title" ou sem título camuflado na tabela analyses
  const stmt = db.prepare(`
    SELECT
      p.id as product_id,
      p.sku,
      p.name,
      a.camouflaged_title,
      a.id as analysis_id
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.camouflaged_title IS NULL
       OR a.camouflaged_title = ''
       OR a.camouflaged_title LIKE '%orig%'
    ORDER BY p.id
  `);

  const products = stmt.all() as (Product & { analysis_id: number })[];

  console.log(`📊 Found ${products.length} products with title issues\n`);

  if (products.length === 0) {
    console.log('✅ No products to fix!\n');
    return;
  }

  let fixed = 0;
  let errors = 0;

  // Preparar statement de update (atualizar tabela analyses, não products!)
  const updateStmt = db.prepare(`
    UPDATE analyses
    SET camouflaged_title = ?
    WHERE id = ?
  `);

  for (const product of products) {
    try {
      console.log(`[${fixed + errors + 1}/${products.length}] Processing: ${product.sku}`);
      console.log(`   Original: "${product.name}"`);
      console.log(`   Current:  "${product.camouflaged_title || 'NULL'}"`);

      // Gerar título camuflado correto
      const camouflagedTitle = camouflage(product.name);

      console.log(`   New:      "${camouflagedTitle}"`);

      // Atualizar no banco (usando analysis_id, não product_id!)
      updateStmt.run(camouflagedTitle, (product as any).analysis_id);

      fixed++;
      console.log(`   ✅ Fixed!\n`);

    } catch (error: any) {
      errors++;
      console.error(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('🎉 FIXING COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📊 Statistics:`);
  console.log(`   Total:  ${products.length}`);
  console.log(`   ✅ Fixed: ${fixed}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('');
}

// Execute
fixOrigTitles()
  .then(() => {
    console.log('✅ Script completed successfully\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
