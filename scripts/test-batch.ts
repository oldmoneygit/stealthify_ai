import './load-env';
import { getLocalProducts } from '@/services/woocommerce.service';
import { analyzeBatch } from '@/services/orchestrator.service';

async function testBatch() {
  console.log('🧪 Testando Batch Processing...\n');

  try {
    // Get first 3 products
    const allProducts = getLocalProducts();

    if (allProducts.length === 0) {
      console.log('⚠️ Nenhum produto no banco.');
      console.log('Execute: pnpm test:woo para sincronizar produtos\n');
      process.exit(1);
    }

    const products = allProducts.slice(0, 3);

    console.log(`📦 Selecionados ${products.length} produtos:`);
    products.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.sku} - ${p.name}`);
    });

    // Run batch
    console.log('\n🚀 Iniciando batch...\n');

    const results = await analyzeBatch(products, (current, total, result) => {
      console.log(`\n📊 Progresso: ${current}/${total}`);
      console.log(`   Status: ${result.status}`);
      console.log(`   Risk Score: ${result.risk_score}`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DO BATCH');
    console.log('='.repeat(60));
    console.log(`Total: ${results.length}`);
    console.log(`✅ Clean: ${results.filter(r => r.status === 'clean').length}`);
    console.log(`⚠️ Blur: ${results.filter(r => r.status === 'blur_applied').length}`);
    console.log(`❌ Failed: ${results.filter(r => r.status === 'failed').length}`);

    console.log('\n✅ Batch testado com sucesso!\n');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error);
    process.exit(1);
  }
}

testBatch();
