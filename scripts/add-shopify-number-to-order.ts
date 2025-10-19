#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET!;

async function addShopifyNumberToOrder(wooOrderId: number, shopifyOrderNumber: number, shopifyOrderId: number) {
  const url = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders/${wooOrderId}?consumer_key=${encodeURIComponent(CONSUMER_KEY)}&consumer_secret=${encodeURIComponent(CONSUMER_SECRET)}`;

  console.log(`📝 Atualizando pedido WooCommerce #${wooOrderId}...`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      meta_data: [
        {
          key: 'Pedido Shopify',
          value: `#${shopifyOrderNumber} (ID: ${shopifyOrderId})`
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Erro:', errorText);
    throw new Error(`Erro ao atualizar pedido: ${response.status}`);
  }

  const updatedOrder = await response.json();

  console.log('✅ Pedido atualizado!');
  console.log('');
  console.log('📋 Metadados:');

  const shopifyMeta = updatedOrder.meta_data.find((m: any) => m.key === 'Pedido Shopify');
  if (shopifyMeta) {
    console.log(`   ${shopifyMeta.key}: ${shopifyMeta.value}`);
  }

  console.log('');
  console.log('🔗 Agora ao abrir o pedido no WooCommerce, você verá:');
  console.log(`   "Pedido Shopify: #${shopifyOrderNumber} (ID: ${shopifyOrderId})"`);
  console.log('');
  console.log(`   Link: ${WOOCOMMERCE_URL}/wp-admin/post.php?post=${wooOrderId}&action=edit`);
}

// Adicionar ao pedido existente
addShopifyNumberToOrder(27755, 1002, 6000796074027)
  .then(() => console.log('✅ Concluído!'))
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
