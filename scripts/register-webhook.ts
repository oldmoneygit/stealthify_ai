#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';

// URL pública do webhook (Vercel)
const WEBHOOK_URL = 'https://redirect-woo-shopify.vercel.app/api/shopify-order-webhook';

interface WebhookRegistration {
  webhook: {
    topic: string;
    address: string;
    format: string;
  };
}

/**
 * 🔗 REGISTRAR WEBHOOKS NA SHOPIFY
 */
async function registerWebhooks() {
  console.log('\n🔗 REGISTRANDO WEBHOOKS NA SHOPIFY');
  console.log('━'.repeat(60));
  console.log('');

  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.log('❌ Variáveis de ambiente não configuradas!');
    console.log('   Verifique SHOPIFY_STORE_URL e SHOPIFY_ACCESS_TOKEN\n');
    process.exit(1);
  }

  console.log(`📍 Loja: ${SHOPIFY_STORE_URL}`);
  console.log(`🌐 URL do webhook: ${WEBHOOK_URL}\n`);

  // ============================================================
  // 1. VERIFICAR WEBHOOKS EXISTENTES
  // ============================================================
  console.log('🔍 ETAPA 1/3: Verificando webhooks existentes...\n');

  try {
    const listResponse = await fetch(`${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!listResponse.ok) {
      console.log(`❌ Erro ao listar webhooks: ${listResponse.status}`);
      process.exit(1);
    }

    const { webhooks } = await listResponse.json();
    console.log(`   📊 Webhooks existentes: ${webhooks.length}\n`);

    // Verificar se já existe
    const ordersCreateWebhook = webhooks.find((w: any) => w.topic === 'orders/create');
    const ordersUpdatedWebhook = webhooks.find((w: any) => w.topic === 'orders/updated');

    if (ordersCreateWebhook) {
      console.log('   ⚠️  Webhook orders/create já existe!');
      console.log(`   ID: ${ordersCreateWebhook.id}`);
      console.log(`   URL: ${ordersCreateWebhook.address}\n`);

      // Perguntar se quer deletar e recriar
      console.log('   ℹ️  Se a URL estiver errada, delete e rode este script novamente.\n');
      console.log(`   Para deletar, rode:`);
      console.log(`   curl -X DELETE "${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks/${ordersCreateWebhook.id}.json" \\`);
      console.log(`     -H "X-Shopify-Access-Token: ${SHOPIFY_ACCESS_TOKEN}"\n`);
    }

    if (ordersUpdatedWebhook) {
      console.log('   ℹ️  Webhook orders/updated também existe');
      console.log(`   ID: ${ordersUpdatedWebhook.id}`);
      console.log(`   URL: ${ordersUpdatedWebhook.address}\n`);
    }

  } catch (error: any) {
    console.log(`❌ Erro ao verificar webhooks: ${error.message}`);
    process.exit(1);
  }

  // ============================================================
  // 2. REGISTRAR WEBHOOK orders/create
  // ============================================================
  console.log('📝 ETAPA 2/3: Registrando webhook orders/create...\n');

  try {
    const createPayload: WebhookRegistration = {
      webhook: {
        topic: 'orders/create',
        address: WEBHOOK_URL,
        format: 'json'
      }
    };

    const createResponse = await fetch(`${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createPayload)
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json();
      console.log(`❌ Erro ao criar webhook: ${createResponse.status}`);
      console.log(`   Detalhes:`, JSON.stringify(errorData, null, 2));

      // Se o erro for que já existe, não é um problema
      if (errorData.errors?.address?.includes('has already been taken')) {
        console.log('\n   ℹ️  Webhook já existe! Tudo OK.\n');
      } else {
        process.exit(1);
      }
    } else {
      const { webhook } = await createResponse.json();
      console.log('   ✅ Webhook orders/create registrado com sucesso!\n');
      console.log(`   📋 Detalhes:`);
      console.log(`      ID: ${webhook.id}`);
      console.log(`      Topic: ${webhook.topic}`);
      console.log(`      URL: ${webhook.address}`);
      console.log(`      Formato: ${webhook.format}`);
      console.log(`      API Version: ${webhook.api_version}`);
      console.log(`      Criado em: ${webhook.created_at}\n`);
    }
  } catch (error: any) {
    console.log(`❌ Erro ao criar webhook: ${error.message}`);
    process.exit(1);
  }

  // ============================================================
  // 3. REGISTRAR WEBHOOK orders/updated (OPCIONAL)
  // ============================================================
  console.log('📝 ETAPA 3/3: Registrando webhook orders/updated (opcional)...\n');

  try {
    const updatePayload: WebhookRegistration = {
      webhook: {
        topic: 'orders/updated',
        address: WEBHOOK_URL,
        format: 'json'
      }
    };

    const updateResponse = await fetch(`${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.log(`   ⚠️  Não foi possível criar webhook orders/updated: ${updateResponse.status}`);

      if (errorData.errors?.address?.includes('has already been taken')) {
        console.log('   ℹ️  Webhook já existe! Tudo OK.\n');
      }
    } else {
      const { webhook } = await updateResponse.json();
      console.log('   ✅ Webhook orders/updated registrado com sucesso!\n');
      console.log(`   📋 Detalhes:`);
      console.log(`      ID: ${webhook.id}`);
      console.log(`      Topic: ${webhook.topic}`);
      console.log(`      URL: ${webhook.address}\n`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Erro ao criar webhook orders/updated: ${error.message}`);
    console.log('   ℹ️  Webhook principal (orders/create) já foi criado, você pode continuar.\n');
  }

  // ============================================================
  // RESUMO FINAL
  // ============================================================
  console.log('━'.repeat(60));
  console.log('\n✅ WEBHOOKS CONFIGURADOS COM SUCESSO!\n');
  console.log('🔧 PRÓXIMOS PASSOS:\n');
  console.log('1. Verificar se o webhook está ativo:');
  console.log('   → Execute: npx tsx scripts/diagnose-webhook.ts\n');
  console.log('2. Testar com pedido simulado:');
  console.log('   → Execute: npx tsx scripts/test-webhook-locally.ts\n');
  console.log('3. Ou fazer pedido real na Shopify e verificar WooCommerce\n');
  console.log('━'.repeat(60));
  console.log('');
}

// Executar registro
registerWebhooks().catch(error => {
  console.error('\n❌ Erro fatal:', error);
  process.exit(1);
});
