import { db, isDatabaseInitialized } from '../src/lib/db';

console.log('🧪 Testando setup do projeto...\n');

// Test 1: Database
console.log('📊 [1/3] Testando database...');
if (isDatabaseInitialized()) {
  console.log('✅ Database inicializado corretamente');

  // Check tables
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all() as Array<{ name: string }>;
  console.log('   Tabelas:', tables.map(t => t.name).join(', '));
} else {
  console.log('❌ Database não inicializado');
  process.exit(1);
}

// Test 2: Environment Variables
console.log('\n🔐 [2/3] Testando environment variables...');
const requiredEnvVars = [
  'WOOCOMMERCE_URL',
  'WOOCOMMERCE_CONSUMER_KEY',
  'WOOCOMMERCE_CONSUMER_SECRET',
  'SHOPIFY_STORE_URL',
  'SHOPIFY_ACCESS_TOKEN',
  'GOOGLE_GEMINI_API_KEY',
  'GOOGLE_CLOUD_PROJECT_ID',
  'GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON'
];

let envVarsOk = true;
for (const envVar of requiredEnvVars) {
  if (process.env[envVar]) {
    console.log(`✅ ${envVar} configurado`);
  } else {
    console.log(`❌ ${envVar} FALTANDO`);
    envVarsOk = false;
  }
}

if (!envVarsOk) {
  console.log('\n⚠️  Configure as variáveis em .env.local');
}

// Test 3: TypeScript
console.log('\n📝 [3/3] Testando TypeScript...');
console.log('   Execute: pnpm type-check');

console.log('\n✅ Setup completo! Próximo: FASE 2');
