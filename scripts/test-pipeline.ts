import './load-env';
import { getLocalProducts } from '@/services/woocommerce.service';
import { analyzeSingleProduct } from '@/services/orchestrator.service';

async function testPipeline() {
  console.log('🧪 Testando Pipeline Completo...\n');

  try {
    // Get first product from database
    const products = getLocalProducts();

    if (products.length === 0) {
      console.log('⚠️ Nenhum produto no banco.');
      console.log('Execute: pnpm test:woo para sincronizar produtos\n');
      process.exit(1);
    }

    const product = products[0]!;

    console.log('📦 Produto selecionado:');
    console.log(`   ID: ${product.id}`);
    console.log(`   SKU: ${product.sku}`);
    console.log(`   Nome: ${product.name}`);
    console.log(`   Preço: R$ ${product.price}`);
    console.log(`   Imagem: ${product.image_url.substring(0, 50)}...`);

    // Run pipeline
    console.log('\n🚀 Iniciando pipeline...\n');
    const result = await analyzeSingleProduct(product);

    // Show results
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESULTADO FINAL');
    console.log('='.repeat(60));
    console.log(`Status: ${result.status}`);
    console.log(`Título Camuflado: ${result.title}`);
    console.log(`Marcas Detectadas: ${result.brands_detected.join(', ') || 'nenhuma'}`);
    console.log(`Risk Score: ${result.risk_score}`);
    console.log(`Imagem: ${result.image.substring(0, 50)}...`);

    if (result.error) {
      console.log(`Erro: ${result.error}`);
    }

    console.log('\n✅ Pipeline testado com sucesso!\n');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error);
    process.exit(1);
  }
}

testPipeline();
