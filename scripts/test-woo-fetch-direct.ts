#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET!;

/**
 * 🧪 TESTAR CRIAÇÃO DE PEDIDO USANDO FETCH PURO
 *
 * Bypassa a biblioteca @woocommerce/woocommerce-rest-api
 * para evitar possíveis bugs ou problemas de formatting
 */
async function testDirectFetch() {
  console.log('\n🧪 TESTANDO CRIAÇÃO DE PEDIDO COM FETCH PURO');
  console.log('━'.repeat(60));
  console.log('');

  const endpoint = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`;

  // Credenciais em Base64 para Basic Auth
  const credentials = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

  // Payload do pedido
  const orderData = {
    payment_method: 'bacs',
    payment_method_title: 'Direct Bank Transfer',
    set_paid: false,
    billing: {
      first_name: 'João',
      last_name: 'Silva',
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
      last_name: 'Silva',
      address_1: 'Rua Teste, 123',
      address_2: '',
      city: 'São Paulo',
      state: 'SP',
      postcode: '01234-567',
      country: 'BR'
    },
    line_items: [
      {
        product_id: 26417,
        quantity: 1
      }
    ],
    shipping_lines: [
      {
        method_id: 'flat_rate',
        method_title: 'Flat Rate',
        total: '0.00'
      }
    ]
  };

  console.log('📋 Endpoint:', endpoint);
  console.log('');
  console.log('📤 Payload:');
  console.log(JSON.stringify(orderData, null, 2));
  console.log('');

  try {
    console.log('🔄 Enviando requisição...\n');

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
    console.log('');

    const responseText = await response.text();

    console.log('📥 Resposta (raw):');
    console.log(responseText.substring(0, 500));
    console.log('');

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.log('❌ Resposta não é JSON válido!');
      console.log('   Isso pode indicar erro no servidor ou plugin interferindo\n');
      return;
    }

    if (Array.isArray(responseData)) {
      if (responseData.length === 0) {
        console.log('❌ ARRAY VAZIO retornado!');
        console.log('');
        console.log('🔴 DIAGNÓSTICO:');
        console.log('   1. Verifique se há plugins de segurança ativos no WooCommerce');
        console.log('   2. Verifique logs do WordPress/WooCommerce para erros');
        console.log('   3. Tente criar pedido manualmente no WooCommerce Admin');
        console.log('   4. Verifique se WooCommerce está atualizado (versão 8.0+)');
        console.log('');
      } else {
        console.log(`✅ Array com ${responseData.length} item(s)`);
        console.log(JSON.stringify(responseData[0], null, 2));
      }
    } else if (responseData && responseData.id) {
      console.log('✅ PEDIDO CRIADO COM SUCESSO!\n');
      console.log(`📦 Order ID: ${responseData.id}`);
      console.log(`📦 Order Number: ${responseData.number}`);
      console.log(`📦 Order Key: ${responseData.order_key}`);
      console.log(`📦 Status: ${responseData.status}`);
      console.log(`📦 Total: ${responseData.total} ${responseData.currency}`);
      console.log(`📦 Customer: ${responseData.billing.first_name} ${responseData.billing.last_name}`);
      console.log('');

      // Deletar pedido de teste
      console.log('🗑️  Deletando pedido de teste...');

      const deleteResponse = await fetch(`${endpoint}/${responseData.id}?force=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (deleteResponse.ok) {
        console.log('✅ Pedido deletado!\n');
      } else {
        console.log(`⚠️  Não foi possível deletar (${deleteResponse.status})`);
        console.log(`   Delete manualmente: ${WOOCOMMERCE_URL}/wp-admin/post.php?post=${responseData.id}&action=edit\n`);
      }
    } else if (responseData && responseData.code) {
      console.log('❌ ERRO DA API:\n');
      console.log(`   Código: ${responseData.code}`);
      console.log(`   Mensagem: ${responseData.message}`);
      console.log('');

      if (responseData.data) {
        console.log('   Detalhes:', JSON.stringify(responseData.data, null, 2));
        console.log('');
      }
    } else {
      console.log('⚠️  Resposta inesperada:');
      console.log(JSON.stringify(responseData, null, 2));
      console.log('');
    }

  } catch (error: any) {
    console.log('❌ ERRO NA REQUISIÇÃO:\n');
    console.log(`   ${error.message}`);
    console.log('');
  }

  console.log('━'.repeat(60));
  console.log('');
}

testDirectFetch();
