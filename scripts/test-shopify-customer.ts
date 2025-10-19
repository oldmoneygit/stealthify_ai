import 'dotenv/config';

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';

// IDs dos clientes dos logs
const customerIds = [
  7905850392619,  // Pedido #1003
  7905451474987   // Pedido #1002
];

async function testCustomerAPI() {
  console.log('🧪 Testando Shopify Customers API\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const customerId of customerIds) {
    console.log(`\n👤 Buscando cliente ID: ${customerId}`);
    console.log('─'.repeat(50));

    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/customers/${customerId}.json`;

    console.log(`📡 URL: ${url}\n`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📊 Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        console.error(`❌ Erro: ${response.status}`);
        const errorText = await response.text();
        console.error(errorText);
        continue;
      }

      const data = await response.json();

      console.log('\n📦 RESPOSTA COMPLETA:');
      console.log(JSON.stringify(data, null, 2));

      console.log('\n🔍 CAMPOS IMPORTANTES:');
      console.log(`   customer.id: ${data.customer?.id}`);
      console.log(`   customer.email: ${data.customer?.email}`);
      console.log(`   customer.first_name: ${data.customer?.first_name}`);
      console.log(`   customer.last_name: ${data.customer?.last_name}`);
      console.log(`   customer.phone: ${data.customer?.phone}`);
      console.log(`   customer.default_address: ${data.customer?.default_address ? 'EXISTS' : 'NULL'}`);

      if (data.customer?.default_address) {
        console.log('\n📍 ENDEREÇO PADRÃO:');
        console.log(`   address1: ${data.customer.default_address.address1}`);
        console.log(`   address2: ${data.customer.default_address.address2}`);
        console.log(`   city: ${data.customer.default_address.city}`);
        console.log(`   province: ${data.customer.default_address.province}`);
        console.log(`   province_code: ${data.customer.default_address.province_code}`);
        console.log(`   zip: ${data.customer.default_address.zip}`);
        console.log(`   country: ${data.customer.default_address.country}`);
        console.log(`   country_code: ${data.customer.default_address.country_code}`);
        console.log(`   phone: ${data.customer.default_address.phone}`);
      }

    } catch (error: any) {
      console.error(`❌ Erro na requisição:`, error.message);
    }

    console.log('\n');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Diagnóstico concluído\n');
}

testCustomerAPI();
