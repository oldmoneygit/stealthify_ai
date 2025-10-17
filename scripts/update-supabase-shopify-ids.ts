// Load environment variables first
import { config } from 'dotenv';
import path from 'path';

// Try .env first (Node.js standard), then .env.local (Next.js convention)
config({ path: path.join(process.cwd(), '.env') });
config({ path: path.join(process.cwd(), '.env.local') });

import Database from 'better-sqlite3';
import { supabase } from '../src/lib/supabase';

interface AnalysisWithShopify {
  id: number;
  product_id: number;
  shopify_product_id: string;
  shopify_variant_id: string;
  imported_at: string;
}

async function main() {
  console.log('🔄 Iniciando atualização de Shopify IDs no Supabase...\n');

  // 1. Connect to SQLite
  const dbPath = path.join(process.cwd(), 'database', 'products.db');
  const db = new Database(dbPath, { readonly: true });

  // 2. Get all analyses with Shopify IDs from SQLite
  const sqliteAnalyses = db.prepare(`
    SELECT
      a.id,
      a.product_id,
      a.shopify_product_id,
      a.shopify_variant_id,
      a.imported_at,
      p.woo_product_id
    FROM analyses a
    INNER JOIN products p ON a.product_id = p.id
    WHERE a.shopify_product_id IS NOT NULL
      AND a.shopify_variant_id IS NOT NULL
  `).all() as any[];

  console.log(`📦 [SQLite] Found ${sqliteAnalyses.length} analyses with Shopify IDs\n`);

  if (sqliteAnalyses.length === 0) {
    console.log('❌ No Shopify IDs to migrate');
    process.exit(0);
  }

  // 3. Update Supabase analyses with Shopify IDs
  let updated = 0;
  let errors = 0;

  for (const analysis of sqliteAnalyses) {
    try {
      // Get the Supabase product ID using woo_product_id
      const { data: products, error: productError } = await supabase
        .from('products')
        .select('id')
        .eq('woo_product_id', analysis.woo_product_id)
        .single();

      if (productError || !products) {
        console.log(`⚠️  Product not found in Supabase: woo_product_id=${analysis.woo_product_id}`);
        errors++;
        continue;
      }

      const supabaseProductId = products.id;

      // Update the analysis with Shopify IDs
      const { error: updateError } = await supabase
        .from('analyses')
        .update({
          shopify_product_id: analysis.shopify_product_id,
          shopify_variant_id: analysis.shopify_variant_id,
          imported_at: analysis.imported_at
        })
        .eq('product_id', supabaseProductId);

      if (updateError) {
        console.log(`❌ Error updating analysis for product ${supabaseProductId}:`, updateError.message);
        errors++;
      } else {
        updated++;
        if (updated % 50 === 0) {
          console.log(`   Progresso: ${updated}/${sqliteAnalyses.length} ✅`);
        }
      }
    } catch (error: any) {
      console.error(`❌ Error processing analysis:`, error.message);
      errors++;
    }
  }

  db.close();

  console.log(`\n✅ Atualização concluída!`);
  console.log(`   Total: ${sqliteAnalyses.length}`);
  console.log(`   Atualizados: ${updated}`);
  console.log(`   Erros: ${errors}`);

  // 4. Verify the update
  console.log('\n🔍 Verificando atualização...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('analyses')
    .select('shopify_product_id, shopify_variant_id')
    .not('shopify_product_id', 'is', null)
    .not('shopify_variant_id', 'is', null);

  if (!verifyError && verifyData) {
    console.log(`✅ Verificação: ${verifyData.length} analyses com Shopify IDs no Supabase`);
  }

  console.log('\n🎉 Pronto! O sistema de redirecionamento está pronto para usar.');
}

main().catch(console.error);
