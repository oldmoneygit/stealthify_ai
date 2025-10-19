#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';
import { createWooCommerceAuthUrl } from '../src/lib/woo-oauth';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const WOOCOMMERCE_URL = process.env.WOOCOMMERCE_URL!;
const CONSUMER_KEY = process.env.WOOCOMMERCE_CONSUMER_KEY!;
const CONSUMER_SECRET = process.env.WOOCOMMERCE_CONSUMER_SECRET!;

console.log('\n🔐 TESTANDO GERAÇÃO DE ASSINATURA OAUTH');
console.log('━'.repeat(60));
console.log('');

console.log('📋 Configuração:');
console.log(`   URL Base: ${WOOCOMMERCE_URL}`);
console.log(`   Consumer Key: ${CONSUMER_KEY.substring(0, 15)}...`);
console.log(`   Consumer Secret: ${CONSUMER_SECRET.substring(0, 15)}...`);
console.log('');

// Teste simples: GET /orders
const getUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`;
console.log('🧪 TESTE 1: GET /orders (deve funcionar)');
console.log('');

const authenticatedGetUrl = createWooCommerceAuthUrl(
  'GET',
  getUrl,
  CONSUMER_KEY,
  CONSUMER_SECRET
);

console.log('🔗 URL autenticada gerada:');
console.log(authenticatedGetUrl);
console.log('');

// Fazer requisição GET
console.log('📤 Fazendo requisição GET...');
fetch(authenticatedGetUrl)
  .then(async response => {
    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Sucesso! ${data.length || 0} pedidos retornados`);
      console.log('');

      // Se GET funciona, testar POST
      testPost();
    } else {
      const errorText = await response.text();
      console.log('❌ Erro no GET:');
      console.log(errorText);
      console.log('');
    }
  })
  .catch(error => {
    console.error('❌ Erro na requisição:', error.message);
  });

async function testPost() {
  console.log('🧪 TESTE 2: POST /orders (criar pedido mínimo)');
  console.log('');

  const postUrl = `${WOOCOMMERCE_URL}/wp-json/wc/v3/orders`;

  const authenticatedPostUrl = createWooCommerceAuthUrl(
    'POST',
    postUrl,
    CONSUMER_KEY,
    CONSUMER_SECRET
  );

  const minimalOrder = {
    payment_method: 'bacs',
    payment_method_title: 'Direct Bank Transfer',
    billing: {
      first_name: 'Teste',
      last_name: 'OAuth',
      address_1: 'Rua Teste 123',
      city: 'São Paulo',
      state: 'SP',
      postcode: '01234-567',
      country: 'BR',
      email: 'teste@oauth.com',
      phone: '11999999999'
    },
    line_items: [
      {
        product_id: 26417,
        quantity: 1
      }
    ]
  };

  console.log('📤 Enviando POST com pedido mínimo...');
  console.log('📦 Payload:', JSON.stringify(minimalOrder, null, 2));
  console.log('');

  try {
    const response = await fetch(authenticatedPostUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(minimalOrder)
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);

    const responseText = await response.text();

    if (response.ok) {
      console.log('📋 Resposta WooCommerce (raw text):');
      console.log(responseText);
      console.log('');

      const order = JSON.parse(responseText);
      console.log('📋 Resposta WooCommerce (parsed):');
      console.log(JSON.stringify(order, null, 2));
      console.log('');

      if (Array.isArray(order)) {
        console.log('⚠️  WooCommerce retornou ARRAY (não objeto)!');
        console.log(`   Length: ${order.length}`);
        if (order.length > 0) {
          console.log(`   Primeiro item:`, JSON.stringify(order[0], null, 2));
        }
      } else if (order && order.id) {
        console.log('✅ PEDIDO CRIADO COM SUCESSO!');
        console.log(`   ID: ${order.id}`);
        console.log(`   Status: ${order.status}`);
        console.log(`   Total: R$ ${order.total}`);
        console.log('');
        console.log('🎉 OAuth está funcionando corretamente!');
      } else {
        console.log('⚠️  Resposta inesperada (não é array nem objeto válido)');
      }
    } else {
      console.log('❌ Erro no POST:');
      console.log(responseText);

      try {
        const errorData = JSON.parse(responseText);
        console.log('');
        console.log('📋 Erro formatado:');
        console.log(JSON.stringify(errorData, null, 2));
      } catch (e) {
        // Já mostrou o texto bruto
      }
    }
  } catch (error: any) {
    console.error('❌ Erro na requisição POST:', error.message);
  }

  console.log('');
  console.log('━'.repeat(60));
}
