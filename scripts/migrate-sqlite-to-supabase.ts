import Database from 'better-sqlite3';
import path from 'path';
import { supabase, upsertProduct, insertAnalysis } from '../src/lib/supabase';

/**
 * 🔄 Script de Migração: SQLite → Supabase
 *
 * Copia todos os dados do SQLite local para o Supabase Postgres
 */

interface SQLiteProduct {
  id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  price: number;
  regular_price?: number;
  sale_price?: number;
  image_url: string;
  synced_at: string;
}

interface SQLiteAnalysis {
  id: number;
  product_id: number;
  original_title: string;
  camouflaged_title: string;
  original_image_url: string;
  edited_image_base64: string;
  edited_image_filepath?: string;
  brands_detected: string;
  risk_score: number;
  status: string;
  shopify_product_id?: string;
  shopify_variant_id?: string;
  imported_at?: string;
  analyzed_at: string;
}

async function main() {
  console.log('🔄 Iniciando migração SQLite → Supabase...\n');

  // Conectar ao SQLite
  const dbPath = path.join(process.cwd(), 'database', 'products.db');
  const db = new Database(dbPath, { readonly: true });

  try {
    // ETAPA 1: Migrar Produtos
    console.log('📦 [1/2] Migrando produtos...');
    const products = db.prepare('SELECT * FROM products').all() as SQLiteProduct[];
    console.log(`   Encontrados: ${products.length} produtos\n`);

    let productsSuccess = 0;
    let productsError = 0;

    for (const product of products) {
      try {
        await upsertProduct({
          woo_product_id: product.woo_product_id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          regular_price: product.regular_price,
          sale_price: product.sale_price,
          image_url: product.image_url
        });

        productsSuccess++;
        process.stdout.write(`\r   Progresso: ${productsSuccess}/${products.length} ✅`);
      } catch (error: any) {
        productsError++;
        console.error(`\n   ❌ Erro no produto ${product.sku}:`, error.message);
      }
    }

    console.log(`\n   ✅ Produtos migrados: ${productsSuccess}`);
    if (productsError > 0) {
      console.log(`   ❌ Erros: ${productsError}`);
    }
    console.log('');

    // ETAPA 2: Migrar Análises
    console.log('🔍 [2/2] Migrando análises...');
    const analyses = db.prepare('SELECT * FROM analyses').all() as SQLiteAnalysis[];
    console.log(`   Encontradas: ${analyses.length} análises\n`);

    let analysesSuccess = 0;
    let analysesError = 0;

    // Criar mapa de product_id antigo → novo
    const productIdMap = new Map<number, number>();

    for (const product of products) {
      // Buscar o novo ID no Supabase
      const { data } = await supabase
        .from('products')
        .select('id')
        .eq('woo_product_id', product.woo_product_id)
        .single();

      if (data) {
        productIdMap.set(product.id, data.id);
      }
    }

    console.log(`   Mapeamento: ${productIdMap.size} produtos mapeados\n`);

    for (const analysis of analyses) {
      try {
        const newProductId = productIdMap.get(analysis.product_id);

        if (!newProductId) {
          throw new Error(`Product ID ${analysis.product_id} não encontrado no Supabase`);
        }

        await insertAnalysis({
          product_id: newProductId,
          original_title: analysis.original_title,
          camouflaged_title: analysis.camouflaged_title,
          original_image_url: analysis.original_image_url,
          edited_image_base64: analysis.edited_image_base64,
          edited_image_filepath: analysis.edited_image_filepath,
          brands_detected: analysis.brands_detected,
          risk_score: analysis.risk_score,
          status: analysis.status as 'clean' | 'blur_applied' | 'failed',
          shopify_product_id: analysis.shopify_product_id,
          shopify_variant_id: analysis.shopify_variant_id,
          imported_at: analysis.imported_at
        });

        analysesSuccess++;
        process.stdout.write(`\r   Progresso: ${analysesSuccess}/${analyses.length} ✅`);
      } catch (error: any) {
        analysesError++;
        console.error(`\n   ❌ Erro na análise ID ${analysis.id}:`, error.message);
      }
    }

    console.log(`\n   ✅ Análises migradas: ${analysesSuccess}`);
    if (analysesError > 0) {
      console.log(`   ❌ Erros: ${analysesError}`);
    }
    console.log('');

    // Resumo Final
    console.log('═'.repeat(50));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('═'.repeat(50));
    console.log(`✅ Produtos:  ${productsSuccess}/${products.length}`);
    console.log(`✅ Análises:  ${analysesSuccess}/${analyses.length}`);
    console.log(`❌ Erros:     ${productsError + analysesError}`);
    console.log('═'.repeat(50));

    if (productsError + analysesError === 0) {
      console.log('\n🎉 Migração concluída com sucesso!');
      console.log('\n📋 Próximos passos:');
      console.log('   1. Verifique os dados no Supabase dashboard');
      console.log('   2. Configure as variáveis no Vercel');
      console.log('   3. Faça deploy do projeto');
    } else {
      console.log('\n⚠️  Migração concluída com alguns erros. Verifique os logs acima.');
    }

  } catch (error) {
    console.error('\n❌ Erro fatal na migração:', error);
    throw error;
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error('Erro:', error);
  process.exit(1);
});
