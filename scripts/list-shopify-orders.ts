#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  created_at: string;
  line_items: Array<{
    variant_id: number;
    name: string;
    quantity: number;
  }>;
}

async function listRecentOrders(limit: number = 10): Promise<void> {
  console.log('');
  console.log('📋 PEDIDOS RECENTES NA SHOPIFY');
  console.log('━'.repeat(80));
  console.log('');

  const url = `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?status=any&limit=${limit}&order=created_at desc`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar pedidos: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const orders: ShopifyOrder[] = data.orders;

  if (orders.length === 0) {
    console.log('ℹ️  Nenhum pedido encontrado');
    return;
  }

  console.log(`✅ ${orders.length} pedidos encontrados\n`);

  for (const order of orders) {
    const date = new Date(order.created_at);
    const dateStr = date.toLocaleString('pt-BR');

    console.log('━'.repeat(80));
    console.log(`📦 Pedido #${order.order_number} (ID: ${order.id})`);
    console.log('━'.repeat(80));
    console.log(`   📅 Data: ${dateStr}`);
    console.log(`   👤 Email: ${order.email}`);
    console.log(`   💰 Total: R$ ${order.total_price}`);
    console.log(`   💳 Pagamento: ${order.financial_status}`);
    console.log(`   📦 Entrega: ${order.fulfillment_status || 'unfulfilled'}`);
    console.log(`   🛍️  Items: ${order.line_items.length}`);
    console.log('');
    console.log('   Produtos:');
    for (const item of order.line_items) {
      console.log(`   - ${item.name} (Variant ID: ${item.variant_id}) × ${item.quantity}`);
    }
    console.log('');
    console.log(`   🔗 Para sincronizar este pedido, execute:`);
    console.log(`      npx tsx scripts/sync-existing-order.ts ${order.id}`);
    console.log('');
  }

  console.log('━'.repeat(80));
  console.log('');
}

async function main() {
  try {
    const limit = parseInt(process.argv[2]) || 10;
    await listRecentOrders(limit);
  } catch (error: any) {
    console.error('');
    console.error('❌ ERRO:');
    console.error(error.message);
    console.error('');
    process.exit(1);
  }
}

main();
