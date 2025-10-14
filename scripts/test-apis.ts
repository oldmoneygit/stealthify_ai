import { testConnection as testWooCommerce } from '../src/services/woocommerce.service';
import { testConnection as testShopify } from '../src/services/shopify.service';
import { testVertexAuth } from '../src/lib/vertex-auth';

async function testAllAPIs() {
  console.log('🧪 Testando conexões com APIs...\n');

  let allPassed = true;

  // Test 1: WooCommerce
  console.log('📦 [1/4] WooCommerce REST API...');
  try {
    const wooOk = await testWooCommerce();
    if (!wooOk) {
      allPassed = false;
      console.log('   ⚠️  Verifique WOOCOMMERCE_URL, CONSUMER_KEY e CONSUMER_SECRET\n');
    } else {
      console.log('');
    }
  } catch (error) {
    allPassed = false;
    console.log('   ❌ Erro:', error);
    console.log('');
  }

  // Test 2: Shopify
  console.log('🛍️ [2/4] Shopify Admin API...');
  try {
    const shopifyOk = await testShopify();
    if (!shopifyOk) {
      allPassed = false;
      console.log('   ⚠️  Verifique SHOPIFY_STORE_URL e SHOPIFY_ACCESS_TOKEN\n');
    } else {
      console.log('');
    }
  } catch (error) {
    allPassed = false;
    console.log('   ❌ Erro:', error);
    console.log('');
  }

  // Test 3: Vertex AI Auth
  console.log('🔐 [3/4] Google Vertex AI Authentication...');
  try {
    const vertexOk = await testVertexAuth();
    if (!vertexOk) {
      allPassed = false;
      console.log('   ⚠️  Verifique GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON e PROJECT_ID\n');
    } else {
      console.log('');
    }
  } catch (error) {
    allPassed = false;
    console.log('   ❌ Erro:', error);
    console.log('');
  }

  // Test 4: Gemini API
  console.log('🤖 [4/4] Google Gemini API...');
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: 'Hello' }]
          }]
        })
      }
    );

    if (response.ok) {
      console.log('✅ Gemini: Conexão OK\n');
    } else {
      allPassed = false;
      console.log('❌ Gemini: Falha na conexão');
      console.log('   ⚠️  Verifique GOOGLE_GEMINI_API_KEY\n');
    }
  } catch (error) {
    allPassed = false;
    console.log('❌ Gemini: Erro na conexão:', error);
    console.log('');
  }

  // Summary
  console.log('━'.repeat(50));
  if (allPassed) {
    console.log('✅ Todas as APIs estão funcionando!\n');
    console.log('🎯 Próximo passo: FASE 3 - Serviços de IA\n');
  } else {
    console.log('⚠️  Algumas APIs falharam. Verifique as credenciais em .env.local\n');
    process.exit(1);
  }
}

testAllAPIs().catch(console.error);
