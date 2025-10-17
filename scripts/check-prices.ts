import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import fs from 'fs';
import path from 'path';

// Load env
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

const api = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: 'wc/v3',
  queryStringAuth: true
});

async function checkPrices() {
  console.log('\n🔍 Verificando preços atuais no WooCommerce...\n');

  const response = await api.get('products', { per_page: 10 });

  console.log('📊 Amostra de 10 produtos:\n');

  response.data.forEach((p: any, idx: number) => {
    const price = parseFloat(p.price);
    const name = p.name.substring(0, 60);

    // Detectar se é MXN (valores baixos) ou ARS (valores altos)
    const currency = price > 10000 ? 'ARS' : 'MXN';
    const flag = currency === 'ARS' ? '✅' : '⚠️ ';

    console.log(`${flag} [${idx + 1}] ${p.sku}`);
    console.log(`   ${name}`);
    console.log(`   Preço: $${price.toFixed(2)} ${currency}\n`);
  });

  const avgPrice = response.data.reduce((sum: number, p: any) => sum + parseFloat(p.price), 0) / response.data.length;
  console.log(`📈 Preço médio: $${avgPrice.toFixed(2)}`);
  console.log(`\n${avgPrice > 10000 ? '✅ Preços em ARS!' : '⚠️  Preços ainda em MXN'}\n`);
}

checkPrices().catch(e => console.error('❌ Erro:', e.message));
