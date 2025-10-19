import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Erro: SHOPIFY_STORE_URL e SHOPIFY_ACCESS_TOKEN devem estar definidos no .env.local');
  process.exit(1);
}

async function getCustomerData(customerId: string) {
  console.log(`\n🔍 Buscando dados do customer ${customerId}...\n`);

  const response = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Erro ao buscar customer: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  console.log('👤 CUSTOMER COMPLETO:');
  console.log(JSON.stringify(data.customer, null, 2));

  console.log('\n📋 RESUMO:');
  console.log('   ID:', data.customer.id);
  console.log('   First Name:', data.customer.first_name);
  console.log('   Last Name:', data.customer.last_name);
  console.log('   Email:', data.customer.email);
  console.log('   Phone:', data.customer.phone);
  console.log('   Total Orders:', data.customer.orders_count);

  console.log('\n📍 DEFAULT ADDRESS:');
  if (data.customer.default_address) {
    console.log('   Name:', data.customer.default_address.name);
    console.log('   First Name:', data.customer.default_address.first_name);
    console.log('   Last Name:', data.customer.default_address.last_name);
    console.log('   Address1:', data.customer.default_address.address1);
    console.log('   Address2:', data.customer.default_address.address2);
    console.log('   City:', data.customer.default_address.city);
    console.log('   Province:', data.customer.default_address.province);
    console.log('   Zip:', data.customer.default_address.zip);
    console.log('   Phone:', data.customer.default_address.phone);
  }

  console.log('\n');
}

// Usage: npx tsx scripts/get-customer-data.ts <customer_id>
const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Erro: Forneça o ID do customer');
  console.log('Uso: npx tsx scripts/get-customer-data.ts <customer_id>');
  console.log('Exemplo: npx tsx scripts/get-customer-data.ts 7905451474987');
  process.exit(1);
}

getCustomerData(customerId).catch(console.error);
