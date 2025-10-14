import { syncProducts, getLocalProducts } from '../src/services/woocommerce.service';

async function testWooCommerce() {
  console.log('🧪 Testando WooCommerce...\n');

  // Sync products
  console.log('📥 Sincronizando produtos...');
  const products = await syncProducts();

  console.log(`✅ ${products.length} produtos sincronizados\n`);

  // Show first 3 products
  console.log('📦 Primeiros 3 produtos:\n');
  products.slice(0, 3).forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   SKU: ${p.sku}`);
    console.log(`   Preço: R$ ${p.price}`);
    console.log(`   Imagem: ${p.image_url.substring(0, 50)}...`);
    console.log('');
  });

  // Check local database
  const localProducts = getLocalProducts();
  console.log(`✅ ${localProducts.length} produtos no banco local\n`);
}

testWooCommerce().catch(console.error);
