import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
  console.error('❌ Erro: SHOPIFY_STORE_URL e SHOPIFY_ACCESS_TOKEN devem estar definidos no .env.local');
  process.exit(1);
}

async function getOrderAllFields(orderId: string) {
  console.log(`\n🔍 Buscando TODOS os campos do pedido ${orderId}...\n`);

  const response = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();
  const order = data.order;

  // Salvar JSON completo em arquivo
  const debugDir = path.join(process.cwd(), 'debug');
  fs.mkdirSync(debugDir, { recursive: true });

  const fullJsonPath = path.join(debugDir, `order-${orderId}-full.json`);
  fs.writeFileSync(fullJsonPath, JSON.stringify(order, null, 2), 'utf8');
  console.log(`📄 JSON completo salvo em: ${fullJsonPath}\n`);

  // Campos que podem conter nome/telefone
  console.log('🔍 CAMPOS POSSIVELMENTE RELEVANTES:\n');

  console.log('contact_email:', order.contact_email);
  console.log('phone:', order.phone);
  console.log('name:', order.name);
  console.log('customer_locale:', order.customer_locale);

  console.log('\nbilling_address:');
  if (order.billing_address) {
    console.log('  name:', order.billing_address.name);
    console.log('  first_name:', order.billing_address.first_name);
    console.log('  last_name:', order.billing_address.last_name);
    console.log('  phone:', order.billing_address.phone);
    console.log('  email:', order.billing_address.email);
    console.log('  address1:', order.billing_address.address1);
    console.log('  address2:', order.billing_address.address2);
    console.log('  city:', order.billing_address.city);
    console.log('  zip:', order.billing_address.zip);
  }

  console.log('\nshipping_address:');
  if (order.shipping_address) {
    console.log('  name:', order.shipping_address.name);
    console.log('  first_name:', order.shipping_address.first_name);
    console.log('  last_name:', order.shipping_address.last_name);
    console.log('  phone:', order.shipping_address.phone);
    console.log('  address1:', order.shipping_address.address1);
    console.log('  address2:', order.shipping_address.address2);
    console.log('  city:', order.shipping_address.city);
    console.log('  zip:', order.shipping_address.zip);
  }

  console.log('\ncustomer:');
  if (order.customer) {
    console.log('  id:', order.customer.id);
    console.log('  first_name:', order.customer.first_name);
    console.log('  last_name:', order.customer.last_name);
    console.log('  email:', order.customer.email);
    console.log('  phone:', order.customer.phone);
  }

  console.log('\nnote_attributes (campos personalizados):');
  if (order.note_attributes && order.note_attributes.length > 0) {
    order.note_attributes.forEach((attr: any) => {
      console.log(`  ${attr.name}: ${attr.value}`);
    });
  }

  console.log('\nshipping_lines:');
  if (order.shipping_lines && order.shipping_lines.length > 0) {
    order.shipping_lines.forEach((line: any) => {
      console.log('  title:', line.title);
      console.log('  phone:', line.phone);
      console.log('  requested_fulfillment_service_id:', line.requested_fulfillment_service_id);
    });
  }

  // Verificar se há metafields
  console.log('\nmetafields:');
  const metafieldsResponse = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}/metafields.json`,
    {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    }
  );
  const metafieldsData = await metafieldsResponse.json();
  console.log(JSON.stringify(metafieldsData, null, 2));

  console.log('\n\n═════════════════════════════════════════════════════════');
  console.log('\n📝 Procure por "benjamin" ou "rapetti" no arquivo salvo!\n');
}

const orderId = process.argv[2];

if (!orderId) {
  console.error('❌ Erro: Forneça o ID do pedido');
  console.log('Uso: npx tsx scripts/get-order-all-fields.ts <order_id>');
  console.log('Exemplo: npx tsx scripts/get-order-all-fields.ts 6000796074027');
  process.exit(1);
}

getOrderAllFields(orderId).catch(console.error);
