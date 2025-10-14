import { config } from 'dotenv';
import path from 'path';

// Load .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');
config({ path: envPath });

console.log('📝 Carregando variáveis de ambiente de .env.local...');

// Validate required environment variables
const requiredVars = [
  'WOOCOMMERCE_URL',
  'WOOCOMMERCE_CONSUMER_KEY',
  'WOOCOMMERCE_CONSUMER_SECRET',
  'SHOPIFY_STORE_URL',
  'SHOPIFY_ACCESS_TOKEN',
  'GOOGLE_GEMINI_API_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('\n❌ ERRO: Variáveis de ambiente faltando:\n');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n💡 Solução:');
  console.error('   1. Copie .env.example para .env.local');
  console.error('   2. Edite .env.local com suas credenciais');
  console.error('   3. Veja SETUP_ENV.md para instruções\n');
  process.exit(1);
}

console.log('✅ Todas as variáveis de ambiente carregadas!\n');
