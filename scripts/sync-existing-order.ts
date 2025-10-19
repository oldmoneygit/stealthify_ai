#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET!;
const WEBHOOK_URL = 'https://redirect-woo-shopify.vercel.app/api/shopify-order-webhook';

interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  line_items: Array<{
    variant_id: number;
    quantity: number;
    price: string;
    name: string;
  }>;
  billing_address: any;
  shipping_address: any;
  created_at: string;
}

/**
 * Gera HMAC SHA256 para validar webhook
 */
function generateHMAC(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');
}

/**
 * Busca pedido específico da Shopify
 */
async function fetchShopifyOrder(orderIdOrNumber: string): Promise<ShopifyOrder> {
  console.log(`📥 Buscando pedido #${orderIdOrNumber} na Shopify...`);

  // Tentar buscar por ID direto
  let url = `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders/${orderIdOrNumber}.json`;

  let response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  // Se não encontrou por ID, tentar buscar por order_number
  if (!response.ok) {
    console.log('   ⚠️  Não encontrado por ID, buscando por order_number...');

    url = `${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?name=%23${orderIdOrNumber}&status=any`;

    response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Erro ao buscar pedido: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.orders || data.orders.length === 0) {
      throw new Error(`Pedido #${orderIdOrNumber} não encontrado na Shopify`);
    }

    return data.orders[0];
  }

  const data = await response.json();
  return data.order;
}

/**
 * Envia pedido para o webhook
 */
async function sendToWebhook(order: ShopifyOrder): Promise<void> {
  console.log('');
  console.log('📤 Enviando para o webhook...');

  const bodyText = JSON.stringify(order);
  const hmac = generateHMAC(bodyText, SHOPIFY_WEBHOOK_SECRET);

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'orders/create',
      'X-Shopify-Hmac-Sha256': hmac,
      'X-Shopify-Shop-Domain': SHOPIFY_STORE_URL.replace('https://', ''),
      'X-Shopify-API-Version': '2024-01'
    },
    body: bodyText
  });

  console.log(`📊 Status: ${response.status} ${response.statusText}`);

  const result = await response.json();

  if (response.ok && result.success) {
    console.log('');
    console.log('✅ PEDIDO SINCRONIZADO COM SUCESSO!');
    console.log('');
    console.log('📋 Resultado:');
    console.log(`   Ação: ${result.action}`);
    console.log(`   WooCommerce ID: ${result.woo_order_id}`);
    console.log(`   Shopify ID: ${result.shopify_order_id}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Tempo: ${result.duration_ms}ms`);
    console.log('');
    console.log('🔗 Ver no WooCommerce:');
    console.log(`   https://www.snkhouse.com/wp-admin/post.php?post=${result.woo_order_id}&action=edit`);
  } else {
    console.error('');
    console.error('❌ ERRO ao sincronizar:');
    console.error(JSON.stringify(result, null, 2));
  }
}

/**
 * Main
 */
async function main() {
  console.log('');
  console.log('🔄 SINCRONIZAR PEDIDO SHOPIFY → WOOCOMMERCE');
  console.log('━'.repeat(60));
  console.log('');

  // Pegar ID do pedido dos argumentos
  const orderIdOrNumber = process.argv[2];

  if (!orderIdOrNumber) {
    console.error('❌ Erro: Forneça o ID ou número do pedido!');
    console.error('');
    console.error('Uso:');
    console.error('   npx tsx scripts/sync-existing-order.ts <ORDER_ID>');
    console.error('');
    console.error('Exemplos:');
    console.error('   npx tsx scripts/sync-existing-order.ts 6247736320299');
    console.error('   npx tsx scripts/sync-existing-order.ts 1001');
    console.error('');
    process.exit(1);
  }

  try {
    // 1. Buscar pedido na Shopify
    const order = await fetchShopifyOrder(orderIdOrNumber);

    console.log('');
    console.log('✅ Pedido encontrado na Shopify!');
    console.log('');
    console.log('📦 Detalhes:');
    console.log(`   ID: ${order.id}`);
    console.log(`   Número: #${order.order_number}`);
    console.log(`   Email: ${order.email}`);
    console.log(`   Total: ${order.total_price}`);
    console.log(`   Status pagamento: ${order.financial_status}`);
    console.log(`   Status entrega: ${order.fulfillment_status || 'unfulfilled'}`);
    console.log(`   Items: ${order.line_items.length}`);
    console.log(`   Criado em: ${order.created_at}`);
    console.log('');

    // Mostrar produtos
    console.log('📋 Produtos:');
    for (const item of order.line_items) {
      console.log(`   - ${item.name} (Variant ID: ${item.variant_id})`);
      console.log(`     Qtd: ${item.quantity} × ${item.price}`);
    }

    // 2. Enviar para webhook
    await sendToWebhook(order);

  } catch (error: any) {
    console.error('');
    console.error('❌ ERRO:');
    console.error(error.message);
    console.error('');
    process.exit(1);
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('');
}

main();
