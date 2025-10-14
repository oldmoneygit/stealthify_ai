import './load-env';

console.log('🔍 Validando credenciais...\n');

// Test 1: WooCommerce
console.log('📦 WooCommerce:');
console.log(`   URL: ${process.env.WOOCOMMERCE_URL}`);
console.log(`   Consumer Key: ${process.env.WOOCOMMERCE_CONSUMER_KEY?.substring(0, 10)}...`);
console.log(`   Consumer Secret: ${process.env.WOOCOMMERCE_CONSUMER_SECRET?.substring(0, 10)}...\n`);

// Test 2: Shopify
console.log('🛍️ Shopify:');
console.log(`   Store URL: ${process.env.SHOPIFY_STORE_URL}`);
console.log(`   Access Token: ${process.env.SHOPIFY_ACCESS_TOKEN?.substring(0, 15)}...\n`);

// Test 3: Gemini
console.log('🤖 Gemini:');
console.log(`   API Key: ${process.env.GOOGLE_GEMINI_API_KEY?.substring(0, 15)}...\n`);

// Test 4: Vertex AI
console.log('🔐 Vertex AI:');
console.log(`   Project ID: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`);

const serviceAccountJson = process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON;
if (serviceAccountJson) {
  try {
    const parsed = JSON.parse(serviceAccountJson);
    console.log(`   ✅ Service Account JSON é válido`);
    console.log(`   Email: ${parsed.client_email}`);
    console.log(`   Project ID: ${parsed.project_id}\n`);
  } catch (error) {
    console.log(`   ❌ Service Account JSON é INVÁLIDO`);
    console.log(`   Erro: ${error instanceof Error ? error.message : 'Unknown'}`);
    console.log('\n💡 Dica: O JSON deve estar em UMA ÚNICA LINHA, sem quebras.');
    console.log('   Exemplo correto: {"type":"service_account","project_id":"...","private_key":"..."}');
    console.log('\n   Caracteres iniciais do seu JSON:');
    console.log(`   ${serviceAccountJson.substring(0, 100)}...\n`);
  }
} else {
  console.log('   ❌ GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON não configurado\n');
}
