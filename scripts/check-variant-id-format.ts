import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.join(process.cwd(), '.env') });
config({ path: path.join(process.cwd(), '.env.local') });

import { supabase } from '../src/lib/supabase';

async function main() {
  console.log('🔍 Verificando formato dos Shopify variant IDs no Supabase...\n');

  // Get sample of analyses with Shopify variant IDs
  const { data: analyses, error } = await supabase
    .from('analyses')
    .select('id, shopify_product_id, shopify_variant_id')
    .not('shopify_variant_id', 'is', null)
    .limit(10);

  if (error) {
    console.error('❌ Erro ao buscar analyses:', error);
    return;
  }

  if (!analyses || analyses.length === 0) {
    console.log('⚠️  Nenhum produto com shopify_variant_id encontrado');
    return;
  }

  console.log(`📊 Encontrados ${analyses.length} exemplos:\n`);

  let hasGid = 0;
  let noGid = 0;

  for (const analysis of analyses) {
    const variantId = analysis.shopify_variant_id;
    const isGidFormat = variantId.startsWith('gid://shopify/ProductVariant/');

    if (isGidFormat) {
      hasGid++;
      console.log(`✅ [GID Format] ${variantId}`);
    } else {
      noGid++;
      console.log(`⚠️  [Numeric] ${variantId}`);
    }
  }

  console.log('\n📈 Estatísticas:');
  console.log(`   GID format (gid://shopify/...): ${hasGid}`);
  console.log(`   Numeric format: ${noGid}`);

  // Get total count
  const { count } = await supabase
    .from('analyses')
    .select('*', { count: 'exact', head: true })
    .not('shopify_variant_id', 'is', null);

  console.log(`   Total de produtos com variant ID: ${count}\n`);

  // Check what the webhook is sending
  console.log('🔍 Testando variantes do webhook:\n');

  const testVariantId = 42412393496619;

  // Test 1: Search with GID format
  const { data: test1 } = await supabase
    .from('analyses')
    .select('shopify_variant_id')
    .eq('shopify_variant_id', `gid://shopify/ProductVariant/${testVariantId}`)
    .limit(1);

  console.log(`   Procurando por "gid://shopify/ProductVariant/${testVariantId}": ${test1 && test1.length > 0 ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO'}`);

  // Test 2: Search with numeric format
  const { data: test2 } = await supabase
    .from('analyses')
    .select('shopify_variant_id')
    .eq('shopify_variant_id', testVariantId.toString())
    .limit(1);

  console.log(`   Procurando por "${testVariantId}": ${test2 && test2.length > 0 ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO'}`);

  // Test 3: Search by SKU to see what format is stored
  const testSku = 'STFY-8792-0831AAA3-26423';
  const { data: test3 } = await supabase
    .from('analyses')
    .select(`
      shopify_variant_id,
      products (
        sku
      )
    `)
    .eq('products.sku', testSku)
    .limit(1)
    .single();

  if (test3) {
    console.log(`\n   Produto com SKU "${testSku}":`);
    console.log(`   Variant ID armazenado: "${test3.shopify_variant_id}"`);
  }

  console.log('\n✅ Verificação completa!');
}

main().catch(console.error);
