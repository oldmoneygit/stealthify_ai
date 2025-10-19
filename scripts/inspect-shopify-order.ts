#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

async function inspectOrder(orderId: string) {
  const url = `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderId}.json`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erro: ${response.status}`);
  }

  const data = await response.json();
  const order = data.order;

  console.log('\n📦 PEDIDO SHOPIFY COMPLETO\n');
  console.log('═'.repeat(80));
  console.log('\n📋 INFORMAÇÕES BÁSICAS:');
  console.log('   ID:', order.id);
  console.log('   Order Number:', order.order_number);
  console.log('   Name:', order.name);
  console.log('   Email:', order.email || '(undefined)');
  console.log('   Created:', order.created_at);

  console.log('\n👤 CUSTOMER:');
  console.log(JSON.stringify(order.customer, null, 2));

  console.log('\n📍 BILLING ADDRESS (COMPLETO):');
  if (order.billing_address) {
    console.log('   Name:', order.billing_address.name);
    console.log('   First Name:', order.billing_address.first_name);
    console.log('   Last Name:', order.billing_address.last_name);
    console.log('   Company:', order.billing_address.company);
    console.log('   Address1:', order.billing_address.address1);
    console.log('   Address2:', order.billing_address.address2);
    console.log('   City:', order.billing_address.city);
    console.log('   Province:', order.billing_address.province);
    console.log('   Zip:', order.billing_address.zip);
    console.log('   Country:', order.billing_address.country);
    console.log('   Phone:', order.billing_address.phone);
    console.log('   Email:', order.billing_address.email);
    console.log('   JSON completo:', JSON.stringify(order.billing_address, null, 2));
  } else {
    console.log('   (vazio)');
  }

  console.log('\n📍 SHIPPING ADDRESS (COMPLETO):');
  if (order.shipping_address) {
    console.log('   Name:', order.shipping_address.name);
    console.log('   First Name:', order.shipping_address.first_name);
    console.log('   Last Name:', order.shipping_address.last_name);
    console.log('   Company:', order.shipping_address.company);
    console.log('   Address1:', order.shipping_address.address1);
    console.log('   Address2:', order.shipping_address.address2);
    console.log('   City:', order.shipping_address.city);
    console.log('   Province:', order.shipping_address.province);
    console.log('   Zip:', order.shipping_address.zip);
    console.log('   Country:', order.shipping_address.country);
    console.log('   Phone:', order.shipping_address.phone);
    console.log('   Email:', order.shipping_address.email);
    console.log('   JSON completo:', JSON.stringify(order.shipping_address, null, 2));
  } else {
    console.log('   (vazio)');
  }

  console.log('\n💰 VALORES:');
  console.log('   Total:', order.total_price, order.currency);
  console.log('   Subtotal:', order.subtotal_price);
  console.log('   Tax:', order.total_tax);

  console.log('\n📦 LINE ITEMS:');
  order.line_items.forEach((item: any, i: number) => {
    console.log(`\n   Item ${i + 1}:`);
    console.log('      Name:', item.name);
    console.log('      Variant ID:', item.variant_id);
    console.log('      Quantity:', item.quantity);
    console.log('      Price:', item.price);
  });

  console.log('\n📝 NOTES:');
  console.log('   Note:', order.note || '(empty)');
  console.log('   Customer Note:', order.note_attributes || '(empty)');

  console.log('\n💳 PAYMENT:');
  console.log('   Gateway:', order.gateway || '(empty)');
  console.log('   Payment Gateway Names:', order.payment_gateway_names);

  console.log('\n═'.repeat(80));
  console.log('\n');
}

inspectOrder('6000796074027')
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
