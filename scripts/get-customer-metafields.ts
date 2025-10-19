import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Erro: SHOPIFY_STORE_URL e SHOPIFY_ACCESS_TOKEN devem estar definidos no .env.local');
  process.exit(1);
}

async function getCustomerWithMetafields(customerId: string) {
  console.log(`\n🔍 Buscando customer ${customerId} com TODOS os campos possíveis...\n`);

  // 1. Buscar customer completo
  const customerResponse = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const customerData = await customerResponse.json();
  console.log('👤 CUSTOMER COMPLETO (JSON):');
  console.log(JSON.stringify(customerData.customer, null, 2));

  // 2. Buscar metafields do customer
  console.log('\n\n🏷️ METAFIELDS DO CUSTOMER:');
  const metafieldsResponse = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}/metafields.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const metafieldsData = await metafieldsResponse.json();
  console.log(JSON.stringify(metafieldsData, null, 2));

  // 3. Buscar addresses do customer
  console.log('\n\n📍 ADDRESSES DO CUSTOMER:');
  const addressesResponse = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}/addresses.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const addressesData = await addressesResponse.json();
  console.log(JSON.stringify(addressesData, null, 2));

  // 4. Verificar GraphQL (pode ter mais dados)
  console.log('\n\n🔮 Tentando via GraphQL Admin API:');
  const graphqlQuery = `
    query {
      customer(id: "gid://shopify/Customer/${customerId}") {
        id
        firstName
        lastName
        email
        phone
        displayName
        note
        tags
        addresses {
          firstName
          lastName
          name
          address1
          address2
          city
          province
          zip
          country
          phone
        }
        defaultAddress {
          firstName
          lastName
          name
          address1
          address2
          city
          province
          zip
          country
          phone
        }
        metafields(first: 50) {
          edges {
            node {
              namespace
              key
              value
            }
          }
        }
      }
    }
  `;

  const graphqlResponse = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: graphqlQuery })
    }
  );

  const graphqlData = await graphqlResponse.json();
  console.log(JSON.stringify(graphqlData, null, 2));

  console.log('\n\n═════════════════════════════════════════════════════════\n');
}

// Usage: npx tsx scripts/get-customer-metafields.ts <customer_id>
const customerId = process.argv[2];

if (!customerId) {
  console.error('❌ Erro: Forneça o ID do customer');
  console.log('Uso: npx tsx scripts/get-customer-metafields.ts <customer_id>');
  console.log('Exemplo: npx tsx scripts/get-customer-metafields.ts 7905451474987');
  process.exit(1);
}

getCustomerWithMetafields(customerId).catch(console.error);
