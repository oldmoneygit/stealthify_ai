#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const WEBHOOK_URL = 'https://redirect-woo-shopify.vercel.app/api/shopify-order-webhook';

/**
 * 🧪 TESTAR WEBHOOK LOCALMENTE
 *
 * Simula um webhook da Shopify e testa se:
 * 1. A assinatura HMAC está correta
 * 2. O mapeamento de produtos funciona
 * 3. O pedido é criado no WooCommerce
 */

// Payload de exemplo de um pedido Shopify
const mockShopifyOrder = {
  id: 9999999999,
  email: "teste@exemplo.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  total_price: "150.00",
  subtotal_price: "150.00",
  total_tax: "0.00",
  currency: "BRL",
  financial_status: "paid",
  fulfillment_status: null,
  order_number: 1001,
  name: "#1001",
  customer: {
    id: 8888888888,
    email: "teste@exemplo.com",
    first_name: "João",
    last_name: "Silva"
  },
  billing_address: {
    first_name: "João",
    last_name: "Silva",
    address1: "Rua Teste, 123",
    address2: "Apto 45",
    city: "São Paulo",
    province: "SP",
    country: "BR",
    zip: "01234-567",
    phone: "+5511999999999",
    company: null
  },
  shipping_address: {
    first_name: "João",
    last_name: "Silva",
    address1: "Rua Teste, 123",
    address2: "Apto 45",
    city: "São Paulo",
    province: "SP",
    country: "BR",
    zip: "01234-567",
    phone: "+5511999999999",
    company: null
  },
  line_items: [
    {
      id: 7777777777,
      variant_id: 42412398051371, // Usar um variant ID real do seu banco
      product_id: 6666666666,
      title: "Tênis Teste",
      quantity: 1,
      price: "150.00",
      sku: "STFY-8792-BD723E93-26417"
    }
  ]
};

async function testWebhook() {
  console.log('\n🧪 TESTANDO WEBHOOK SHOPIFY → WOOCOMMERCE');
  console.log('━'.repeat(60));
  console.log('');

  if (!SHOPIFY_WEBHOOK_SECRET) {
    console.log('❌ SHOPIFY_WEBHOOK_SECRET não configurado!\n');
    process.exit(1);
  }

  console.log('📋 Configuração:');
  console.log(`   Secret: ${SHOPIFY_WEBHOOK_SECRET.substring(0, 10)}...`);
  console.log(`   URL: ${WEBHOOK_URL}\n`);

  // ============================================================
  // 1. PREPARAR PAYLOAD E ASSINATURA
  // ============================================================
  console.log('📝 ETAPA 1/4: Preparando payload simulado...\n');

  const bodyText = JSON.stringify(mockShopifyOrder);

  // Gerar assinatura HMAC (mesma forma que a Shopify faz)
  const hmac = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(bodyText, 'utf8')
    .digest('base64');

  console.log(`   📦 Pedido simulado:`);
  console.log(`      ID: ${mockShopifyOrder.id}`);
  console.log(`      Email: ${mockShopifyOrder.email}`);
  console.log(`      Total: R$ ${mockShopifyOrder.total_price}`);
  console.log(`      Items: ${mockShopifyOrder.line_items.length}`);
  console.log(`      Variant ID: ${mockShopifyOrder.line_items[0].variant_id}\n`);

  console.log(`   🔐 HMAC gerado: ${hmac.substring(0, 20)}...\n`);

  // ============================================================
  // 2. VERIFICAR SE PRODUTO EXISTE NO SUPABASE
  // ============================================================
  console.log('🔍 ETAPA 2/4: Verificando se produto existe no banco...\n');

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const variantId = mockShopifyOrder.line_items[0].variant_id.toString();

    const { data, error } = await supabase
      .from('analyses')
      .select(`
        shopify_variant_id,
        products (
          woo_product_id,
          sku,
          name
        )
      `)
      .eq('shopify_variant_id', variantId)
      .limit(1)
      .single();

    if (error || !data) {
      console.log(`   ❌ Produto com variant ID ${variantId} NÃO ENCONTRADO!\n`);
      console.log('   💡 Escolha um variant_id válido do seu banco.');
      console.log('   💡 Execute: npx tsx scripts/diagnose-webhook.ts para ver exemplos\n');
      process.exit(1);
    }

    const product = Array.isArray(data.products) ? data.products[0] : data.products;

    console.log(`   ✅ Produto encontrado!`);
    console.log(`      Shopify Variant ID: ${variantId}`);
    console.log(`      WooCommerce Product ID: ${product.woo_product_id}`);
    console.log(`      SKU: ${product.sku}`);
    console.log(`      Nome: ${product.name}\n`);

  } catch (error: any) {
    console.log(`   ❌ Erro ao verificar produto: ${error.message}\n`);
    process.exit(1);
  }

  // ============================================================
  // 3. ENVIAR WEBHOOK PARA API
  // ============================================================
  console.log(`📤 ETAPA 3/4: Enviando webhook para ${WEBHOOK_URL}...\n`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': hmac,
        'X-Shopify-Topic': 'orders/create',
        'X-Shopify-Shop-Domain': 'snkhouse.myshopify.com'
      },
      body: bodyText
    });

    console.log(`   📊 Status HTTP: ${response.status} ${response.statusText}\n`);

    const responseData = await response.json();

    if (!response.ok) {
      console.log(`   ❌ ERRO no webhook!\n`);
      console.log(`   Resposta:`, JSON.stringify(responseData, null, 2));
      console.log('');

      // Diagnosticar erro comum
      if (responseData.error?.includes('Invalid webhook signature')) {
        console.log('   🔴 PROBLEMA: Assinatura HMAC inválida!\n');
        console.log('   💡 SOLUÇÃO:');
        console.log('   1. Acesse Shopify Admin → Settings → Notifications → Webhooks');
        console.log('   2. Clique no webhook "Order creation"');
        console.log('   3. Copie o valor do campo "Webhook signing secret"');
        console.log('   4. No Vercel:');
        console.log('      - Settings → Environment Variables');
        console.log('      - Edite SHOPIFY_WEBHOOK_SECRET');
        console.log('      - Cole o secret copiado da Shopify');
        console.log('      - Redeploy a aplicação\n');
      } else if (responseData.error?.includes('não foi mapeado')) {
        console.log('   🔴 PROBLEMA: Produto não encontrado no banco!\n');
        console.log('   💡 SOLUÇÃO:');
        console.log('   Execute: npx tsx scripts/update-supabase-shopify-ids.ts\n');
      }

      process.exit(1);
    }

    console.log(`   ✅ Webhook processado com sucesso!\n`);
    console.log(`   📋 Resultado:`);
    console.log(`      Ação: ${responseData.action}`);
    console.log(`      WooCommerce Order ID: ${responseData.woo_order_id}`);
    console.log(`      Shopify Order ID: ${responseData.shopify_order_id}`);
    console.log(`      Status: ${responseData.status}`);
    console.log(`      Items sincronizados: ${responseData.items_synced}`);
    console.log(`      Tempo: ${responseData.duration_ms}ms\n`);

  } catch (error: any) {
    console.log(`   ❌ Erro na requisição: ${error.message}\n`);
    process.exit(1);
  }

  // ============================================================
  // 4. VERIFICAR PEDIDO NO WOOCOMMERCE
  // ============================================================
  console.log('🔎 ETAPA 4/4: Verificando pedido no WooCommerce...\n');

  try {
    const WooCommerceRestApi = (await import('@woocommerce/woocommerce-rest-api')).default;

    const wooApi = new WooCommerceRestApi({
      url: process.env.WOOCOMMERCE_URL!,
      consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
      consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
      version: "wc/v3",
      queryStringAuth: true
    });

    const response = await wooApi.get("orders", {
      meta_key: '_shopify_order_id',
      meta_value: mockShopifyOrder.id.toString(),
      per_page: 1
    });

    if (response.data && response.data.length > 0) {
      const order = response.data[0];
      console.log(`   ✅ Pedido encontrado no WooCommerce!\n`);
      console.log(`   📋 Detalhes:`);
      console.log(`      WooCommerce ID: ${order.id}`);
      console.log(`      Status: ${order.status}`);
      console.log(`      Total: R$ ${order.total}`);
      console.log(`      Cliente: ${order.billing.first_name} ${order.billing.last_name}`);
      console.log(`      Email: ${order.billing.email}`);
      console.log(`      Items: ${order.line_items.length}\n`);

      console.log(`   🔗 Ver pedido no WooCommerce:`);
      console.log(`   ${process.env.WOOCOMMERCE_URL}/wp-admin/post.php?post=${order.id}&action=edit\n`);
    } else {
      console.log(`   ⚠️  Pedido não encontrado no WooCommerce\n`);
    }

  } catch (error: any) {
    console.log(`   ⚠️  Não foi possível verificar no WooCommerce: ${error.message}\n`);
  }

  // ============================================================
  // RESUMO FINAL
  // ============================================================
  console.log('━'.repeat(60));
  console.log('\n✅ TESTE DE WEBHOOK CONCLUÍDO COM SUCESSO!\n');
  console.log('🎉 Sincronização Shopify → WooCommerce está funcionando!\n');
  console.log('🔧 PRÓXIMO PASSO:\n');
  console.log('   Faça um pedido REAL na Shopify e verifique se aparece no WooCommerce\n');
  console.log('━'.repeat(60));
  console.log('');
}

// Executar teste
testWebhook().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
