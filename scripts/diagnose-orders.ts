/**
 * Script de diagnóstico para investigar bug de duplicação de pedidos
 *
 * Problema: 3 pedidos Shopify diferentes estão retornando o mesmo WooCommerce ID #27757
 *
 * IDs afetados:
 * - Shopify #6001212096555 → WooCommerce #27757
 * - Shopify #6000796074027 → WooCommerce #27757
 * - Shopify #5960373796907 → WooCommerce #27757
 */

import 'dotenv/config';
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3"
});

async function diagnoseOrders() {
  console.log('🔍 Iniciando diagnóstico de pedidos...\n');

  const shopifyIds = [
    '6001212096555',
    '6000796074027',
    '5960373796907'
  ];

  // 1. Verificar pedido WooCommerce #27757
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 INVESTIGANDO PEDIDO WOOCOMMERCE #27757');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const order = await wooApi.get('orders/27757');
    console.log('✅ Pedido encontrado:');
    console.log(`   ID: ${order.data.id}`);
    console.log(`   Status: ${order.data.status}`);
    console.log(`   Total: ${order.data.total}`);
    console.log(`   Criado em: ${order.data.date_created}`);
    console.log(`\n📋 METADADOS:`);

    const shopifyMeta = order.data.meta_data.filter((m: any) =>
      m.key.includes('shopify') || m.key.includes('sync')
    );

    shopifyMeta.forEach((meta: any) => {
      console.log(`   ${meta.key}: ${meta.value}`);
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar pedido #27757:', error.message);
  }

  // 2. Buscar cada Shopify ID individualmente
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 BUSCANDO POR SHOPIFY ORDER IDS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const shopifyId of shopifyIds) {
    console.log(`\n📦 Buscando Shopify ID: ${shopifyId}`);
    console.log('─'.repeat(50));

    try {
      const response = await wooApi.get("orders", {
        meta_key: '_shopify_order_id',
        meta_value: shopifyId,
        per_page: 10
      });

      if (response.data && response.data.length > 0) {
        console.log(`✅ Encontrados ${response.data.length} pedido(s):\n`);

        response.data.forEach((order: any) => {
          console.log(`   📦 WooCommerce ID: #${order.id}`);
          console.log(`      Status: ${order.status}`);
          console.log(`      Total: ${order.total}`);
          console.log(`      Criado: ${order.date_created}`);

          const shopifyMeta = order.meta_data.find((m: any) => m.key === '_shopify_order_id');
          const shopifyNumber = order.meta_data.find((m: any) => m.key === '_shopify_order_number');
          const syncSource = order.meta_data.find((m: any) => m.key === '_sync_source');

          console.log(`      _shopify_order_id: ${shopifyMeta?.value || 'NÃO ENCONTRADO'}`);
          console.log(`      _shopify_order_number: ${shopifyNumber?.value || 'NÃO ENCONTRADO'}`);
          console.log(`      _sync_source: ${syncSource?.value || 'NÃO ENCONTRADO'}`);
          console.log('');
        });
      } else {
        console.log('❌ Nenhum pedido encontrado com este Shopify ID');
      }
    } catch (error: any) {
      console.error(`❌ Erro ao buscar Shopify ID ${shopifyId}:`, error.message);
    }
  }

  // 3. Listar TODOS os pedidos com metadado _shopify_order_id
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TODOS OS PEDIDOS COM _shopify_order_id');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const allOrders = await wooApi.get("orders", {
      per_page: 50,
      orderby: 'date',
      order: 'desc'
    });

    const ordersWithShopify = allOrders.data.filter((order: any) =>
      order.meta_data.some((m: any) => m.key === '_shopify_order_id')
    );

    console.log(`✅ Total de pedidos com Shopify ID: ${ordersWithShopify.length}\n`);

    ordersWithShopify.forEach((order: any) => {
      const shopifyId = order.meta_data.find((m: any) => m.key === '_shopify_order_id')?.value;
      const shopifyNumber = order.meta_data.find((m: any) => m.key === '_shopify_order_number')?.value;

      console.log(`WooCommerce #${order.id} ← Shopify #${shopifyNumber} (ID: ${shopifyId})`);
    });

    // Verificar duplicatas
    console.log('\n\n🔍 VERIFICANDO DUPLICATAS...\n');

    const shopifyIdMap = new Map<string, number[]>();

    ordersWithShopify.forEach((order: any) => {
      const shopifyId = order.meta_data.find((m: any) => m.key === '_shopify_order_id')?.value;
      if (shopifyId) {
        if (!shopifyIdMap.has(shopifyId)) {
          shopifyIdMap.set(shopifyId, []);
        }
        shopifyIdMap.get(shopifyId)!.push(order.id);
      }
    });

    const duplicates = Array.from(shopifyIdMap.entries()).filter(([_, wooIds]) => wooIds.length > 1);

    if (duplicates.length > 0) {
      console.log('⚠️ DUPLICATAS ENCONTRADAS:\n');
      duplicates.forEach(([shopifyId, wooIds]) => {
        console.log(`🚨 Shopify ID ${shopifyId} está em múltiplos pedidos WooCommerce:`);
        console.log(`   → ${wooIds.join(', ')}`);
      });
    } else {
      console.log('✅ Nenhuma duplicata encontrada');
    }

  } catch (error: any) {
    console.error('❌ Erro ao listar pedidos:', error.message);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ DIAGNÓSTICO CONCLUÍDO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

diagnoseOrders().catch(console.error);
