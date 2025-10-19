#!/usr/bin/env tsx

/**
 * 📝 VERIFICAR LOGS DE ERRO DO WEBHOOK
 *
 * Este script acessa o endpoint GET /api/shopify-order-webhook
 * que retorna os últimos erros do webhook
 */

const WEBHOOK_URL = 'https://redirect-woo-shopify.vercel.app/api/shopify-order-webhook';

async function checkLogs() {
  console.log('\n📝 VERIFICANDO LOGS DE ERRO DO WEBHOOK');
  console.log('━'.repeat(60));
  console.log('');
  console.log(`🔗 URL: ${WEBHOOK_URL}\n`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log(`❌ Erro ao acessar logs: ${response.status} ${response.statusText}\n`);
      process.exit(1);
    }

    const data = await response.json();

    console.log(`📊 Total de erros registrados: ${data.total_errors}\n`);

    if (data.errors && data.errors.length > 0) {
      console.log('🔴 ÚLTIMOS ERROS:\n');

      data.errors.forEach((error: any, index: number) => {
        console.log(`━━━ ERRO #${index + 1} ━━━`);
        console.log(`⏰ Timestamp: ${error.timestamp}`);
        console.log(`❌ Erro: ${error.error}`);

        if (error.shopify_order_id) {
          console.log(`📦 Shopify Order ID: ${error.shopify_order_id}`);
        }

        if (error.details) {
          console.log(`📋 Detalhes:`, JSON.stringify(error.details, null, 2));
        }

        console.log('');
      });
    } else {
      console.log('✅ Nenhum erro registrado!\n');
    }

    console.log('━'.repeat(60));
    console.log('');

  } catch (error: any) {
    console.log(`❌ Erro ao verificar logs: ${error.message}\n`);
    process.exit(1);
  }
}

checkLogs();
