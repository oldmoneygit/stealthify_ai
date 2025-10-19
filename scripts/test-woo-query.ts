import 'dotenv/config';
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3"
});

async function testQuery() {
  console.log('🧪 Testando query com meta_key e meta_value...\n');

  const shopifyId = '6001212096555';

  console.log(`Buscando pedidos com:`);
  console.log(`  meta_key: '_shopify_order_id'`);
  console.log(`  meta_value: ${shopifyId}`);
  console.log(`  per_page: 1\n`);

  try {
    const response = await wooApi.get("orders", {
      meta_key: '_shopify_order_id',
      meta_value: shopifyId,
      per_page: 1
    });

    console.log('📊 Resposta da API:');
    console.log(`  Status: ${response.status}`);
    console.log(`  Tipo: ${typeof response.data}`);
    console.log(`  É array?: ${Array.isArray(response.data)}`);
    console.log(`  Length: ${response.data.length}\n`);

    if (response.data && response.data.length > 0) {
      console.log('✅ Pedidos encontrados:');
      response.data.forEach((order: any, index: number) => {
        console.log(`\n  [${index}] Pedido #${order.id}`);
        console.log(`      Status: ${order.status}`);
        console.log(`      Total: ${order.total}`);

        const shopifyMeta = order.meta_data.find((m: any) => m.key === '_shopify_order_id');
        console.log(`      _shopify_order_id: ${shopifyMeta?.value || 'NÃO ENCONTRADO'}`);
      });
    } else {
      console.log('❌ Nenhum pedido encontrado');
    }

    // Listar todos os pedidos sem filtro
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Listando últimos 5 pedidos (SEM FILTRO)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const allOrders = await wooApi.get("orders", {
      per_page: 5,
      orderby: 'id',
      order: 'desc'
    });

    allOrders.data.forEach((order: any) => {
      const shopifyMeta = order.meta_data.find((m: any) => m.key === '_shopify_order_id');
      console.log(`Pedido #${order.id} - Status: ${order.status} - Shopify ID: ${shopifyMeta?.value || 'N/A'}`);
    });

  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testQuery();
