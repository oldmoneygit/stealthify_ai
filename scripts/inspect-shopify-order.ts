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

  console.log('\n📍 BILLING ADDRESS:');
  console.log(JSON.stringify(order.billing_address, null, 2));

  console.log('\n📍 SHIPPING ADDRESS:');
  console.log(JSON.stringify(order.shipping_address, null, 2));

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
