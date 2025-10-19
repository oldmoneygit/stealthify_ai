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
 * 🔍 TESTAR PERMISSÕES DA API KEY DO WOOCOMMERCE
 */
async function testPermissions() {
  console.log('\n🔍 TESTANDO PERMISSÕES DA API KEY');
  console.log('━'.repeat(60));
  console.log('');

  // ============================================================
  // 1. TESTAR LEITURA (GET)
  // ============================================================
  console.log('📖 TESTE 1/4: Leitura de produtos (GET)...\n');

  try {
    const response = await wooApi.get("products", { per_page: 1 });
    console.log('   ✅ LEITURA OK - Consegue ler produtos');
    console.log(`   📦 Exemplo: ${response.data[0]?.name || 'N/A'}\n`);
  } catch (error: any) {
    console.log('   ❌ FALHOU - Sem permissão de leitura');
    console.log(`   Erro: ${error.message}\n`);
  }

  // ============================================================
  // 2. TESTAR LEITURA DE PEDIDOS
  // ============================================================
  console.log('📖 TESTE 2/4: Leitura de pedidos (GET orders)...\n');

  try {
    const response = await wooApi.get("orders", { per_page: 1 });
    console.log('   ✅ LEITURA DE PEDIDOS OK');
    console.log(`   📦 Total de pedidos: ${response.headers['x-wp-total'] || 'N/A'}\n`);
  } catch (error: any) {
    console.log('   ❌ FALHOU - Sem permissão de leitura de pedidos');
    console.log(`   Erro: ${error.message}\n`);
    return; // Se não consegue ler, não conseguirá criar
  }

  // ============================================================
  // 3. TESTAR CRIAÇÃO MÍNIMA
  // ============================================================
  console.log('📝 TESTE 3/4: Criação de pedido (POST) - Payload MÍNIMO...\n');

  const minimalOrder = {
    billing: {
      first_name: 'Teste',
      last_name: 'API',
      email: 'teste@api.com'
    }
  };

  console.log('   Payload:', JSON.stringify(minimalOrder, null, 2));
  console.log('');

  try {
    const response = await wooApi.post("orders", minimalOrder);

    if (Array.isArray(response.data)) {
      if (response.data.length === 0) {
        console.log('   ❌ ARRAY VAZIO - Pedido não foi criado');
        console.log('   🔴 PROBLEMA CONFIRMADO: WooCommerce está bloqueando criação via API\n');
      } else {
        console.log('   ✅ CRIAÇÃO OK (retornou array)');
        console.log(`   📦 Pedido ID: ${response.data[0].id}\n`);

        // Deletar
        await wooApi.delete(`orders/${response.data[0].id}`, { force: true });
        console.log('   🗑️  Pedido de teste deletado\n');
      }
    } else if (response.data && response.data.id) {
      console.log('   ✅ CRIAÇÃO OK');
      console.log(`   📦 Pedido ID: ${response.data.id}\n`);

      // Deletar
      await wooApi.delete(`orders/${response.data.id}`, { force: true });
      console.log('   🗑️  Pedido de teste deletado\n');
    } else {
      console.log('   ⚠️  Resposta inesperada:', response.data);
      console.log('');
    }
  } catch (error: any) {
    console.log('   ❌ FALHOU - Sem permissão de escrita de pedidos');
    console.log(`   Status: ${error.response?.status}`);
    console.log(`   Erro: ${error.response?.data?.message || error.message}\n`);

    if (error.response?.data) {
      console.log('   📋 Detalhes:', JSON.stringify(error.response.data, null, 2));
      console.log('');
    }
  }

  // ============================================================
  // 4. VERIFICAR PERMISSÕES DAS CREDENCIAIS
  // ============================================================
  console.log('🔐 TESTE 4/4: Verificando tipo de credencial...\n');

  console.log('   💡 PARA CORRIGIR O PROBLEMA:\n');
  console.log('   1. Acesse WooCommerce Admin');
  console.log('   2. WooCommerce → Settings → Advanced → REST API');
  console.log('   3. Encontre a API Key: ck_4c2b449...');
  console.log('   4. Verifique se as permissões são "Read/Write"\n');
  console.log('   Se estiver como "Read", MUDE para "Read/Write" e regenere a chave\n');

  console.log('━'.repeat(60));
  console.log('');
}

testPermissions();
