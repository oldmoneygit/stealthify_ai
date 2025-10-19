#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: true
});

/**
 * 🧪 TESTAR CRIAÇÃO DE PEDIDO NO WOOCOMMERCE
 */
async function testOrderCreation() {
  console.log('\n🧪 TESTANDO CRIAÇÃO DE PEDIDO NO WOOCOMMERCE');
  console.log('━'.repeat(60));
  console.log('');

  console.log('📋 Configuração:');
  console.log(`   URL: ${process.env.WOOCOMMERCE_URL}`);
  console.log(`   Consumer Key: ${process.env.WOOCOMMERCE_CONSUMER_KEY?.substring(0, 10)}...`);
  console.log('');

  // Payload de teste (mínimo necessário)
  const testOrder = {
    status: 'processing',
    customer_id: 0, // Guest checkout
    billing: {
      first_name: 'João',
      last_name: 'Teste',
      address_1: 'Rua Teste, 123',
      address_2: '',
      city: 'São Paulo',
      state: 'SP',
      postcode: '01234-567',
      country: 'BR',
      email: 'teste@exemplo.com',
      phone: '+5511999999999'
    },
    shipping: {
      first_name: 'João',
      last_name: 'Teste',
      address_1: 'Rua Teste, 123',
      address_2: '',
      city: 'São Paulo',
      state: 'SP',
      postcode: '01234-567',
      country: 'BR'
    },
    line_items: [
      {
        product_id: 26417, // Usar um product_id real
        quantity: 1
      }
    ],
    meta_data: [
      {
        key: '_shopify_order_id',
        value: '9999999999'
      },
      {
        key: '_test_order',
        value: 'true'
      }
    ]
  };

  console.log('📤 Enviando pedido de teste para WooCommerce...\n');
  console.log('📋 Payload:', JSON.stringify(testOrder, null, 2));
  console.log('');

  try {
    const response = await wooApi.post("orders", testOrder);

    console.log('✅ SUCESSO!\n');
    console.log('📊 Status HTTP:', response.status);
    console.log('📊 Tipo de response.data:', typeof response.data);
    console.log('📊 É array?:', Array.isArray(response.data));
    console.log('');
    console.log('📋 RESPOSTA COMPLETA:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    // Extrair o pedido
    let order = response.data;
    if (Array.isArray(response.data)) {
      order = response.data[0];
    }

    if (order && order.id) {
      console.log('📦 Pedido criado:');
      console.log(`   ID: ${order.id}`);
      console.log(`   Order Number: ${order.number}`);
      console.log(`   Status: ${order.status}`);
      console.log(`   Total: R$ ${order.total}`);
      console.log(`   Customer: ${order.billing.first_name} ${order.billing.last_name}`);
      console.log('');
      console.log(`🔗 Ver pedido: ${process.env.WOOCOMMERCE_URL}/wp-admin/post.php?post=${order.id}&action=edit`);
      console.log('');

      // Deletar pedido de teste
      console.log('🗑️  Deletando pedido de teste...');
      await wooApi.delete(`orders/${order.id}`, { force: true });
      console.log('✅ Pedido deletado!\n');
    } else {
      console.log('⚠️  Resposta não contém um pedido válido!\n');
    }

  } catch (error: any) {
    console.log('❌ ERRO AO CRIAR PEDIDO!\n');

    console.log('📊 Status:', error.response?.status);
    console.log('📊 Status Text:', error.response?.statusText);
    console.log('');

    if (error.response?.data) {
      console.log('📋 Resposta da API WooCommerce:');
      console.log(JSON.stringify(error.response.data, null, 2));
      console.log('');

      // Diagnóstico de erros comuns
      if (error.response.status === 401) {
        console.log('🔴 ERRO DE AUTENTICAÇÃO!');
        console.log('   As credenciais WooCommerce estão incorretas.');
        console.log('   Verifique WOOCOMMERCE_CONSUMER_KEY e WOOCOMMERCE_CONSUMER_SECRET\n');
      } else if (error.response.status === 404) {
        console.log('🔴 ENDPOINT NÃO ENCONTRADO!');
        console.log('   Verifique se a URL do WooCommerce está correta.');
        console.log(`   URL atual: ${process.env.WOOCOMMERCE_URL}\n`);
      } else if (error.response.data?.code === 'woocommerce_rest_shop_order_invalid_id') {
        console.log('🔴 PRODUCT ID INVÁLIDO!');
        console.log('   O product_id 26417 não existe no WooCommerce.');
        console.log('   Use um product_id válido da sua loja.\n');
      }
    } else {
      console.log('📋 Erro:', error.message);
      console.log('');
    }

    process.exit(1);
  }

  console.log('━'.repeat(60));
  console.log('\n✅ TESTE CONCLUÍDO COM SUCESSO!\n');
  console.log('A API do WooCommerce está funcionando corretamente.');
  console.log('O problema do webhook deve ser outra coisa.\n');
  console.log('━'.repeat(60));
  console.log('');
}

testOrderCreation();
