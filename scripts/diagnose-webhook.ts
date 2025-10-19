#!/usr/bin/env tsx

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

interface ShopifyWebhook {
  id: number;
  address: string;
  topic: string;
  created_at: string;
  updated_at: string;
  format: string;
  fields: string[];
  api_version: string;
}

/**
 * 🔍 DIAGNÓSTICO COMPLETO DO WEBHOOK SHOPIFY → WOOCOMMERCE
 */
async function diagnoseWebhook() {
  console.log('\n🔍 DIAGNÓSTICO DE WEBHOOK SHOPIFY → WOOCOMMERCE');
  console.log('━'.repeat(60));
  console.log('');

  let hasErrors = false;

  // ============================================================
  // 1. VERIFICAR VARIÁVEIS DE AMBIENTE
  // ============================================================
  console.log('📋 ETAPA 1/6: Verificando variáveis de ambiente...\n');

  const envChecks = [
    { name: 'SHOPIFY_STORE_URL', value: SHOPIFY_STORE_URL },
    { name: 'SHOPIFY_ACCESS_TOKEN', value: SHOPIFY_ACCESS_TOKEN },
    { name: 'SHOPIFY_WEBHOOK_SECRET', value: SHOPIFY_WEBHOOK_SECRET },
    { name: 'NEXT_PUBLIC_SUPABASE_URL', value: NEXT_PUBLIC_SUPABASE_URL },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', value: SUPABASE_SERVICE_ROLE_KEY }
  ];

  for (const check of envChecks) {
    if (check.value) {
      const maskedValue = check.value.substring(0, 10) + '...';
      console.log(`   ✅ ${check.name}: ${maskedValue}`);
    } else {
      console.log(`   ❌ ${check.name}: NÃO CONFIGURADO`);
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.log('\n❌ Variáveis de ambiente faltando! Configure .env.local primeiro.\n');
    return;
  }

  console.log('\n✅ Todas as variáveis de ambiente estão configuradas!\n');

  // ============================================================
  // 2. TESTAR CONEXÃO COM SHOPIFY ADMIN API
  // ============================================================
  console.log('📡 ETAPA 2/6: Testando conexão com Shopify Admin API...\n');

  try {
    const shopResponse = await fetch(`${SHOPIFY_STORE_URL}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!shopResponse.ok) {
      console.log(`   ❌ Erro ao conectar: ${shopResponse.status} ${shopResponse.statusText}`);
      hasErrors = true;
    } else {
      const shopData = await shopResponse.json();
      console.log(`   ✅ Conectado à loja: ${shopData.shop.name}`);
      console.log(`   📧 Email: ${shopData.shop.email}`);
      console.log(`   🌐 Domínio: ${shopData.shop.domain}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Erro de conexão: ${error.message}`);
    hasErrors = true;
  }

  console.log('');

  // ============================================================
  // 3. LISTAR WEBHOOKS REGISTRADOS
  // ============================================================
  console.log('🔗 ETAPA 3/6: Verificando webhooks registrados na Shopify...\n');

  try {
    const webhooksResponse = await fetch(`${SHOPIFY_STORE_URL}/admin/api/2024-01/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!webhooksResponse.ok) {
      console.log(`   ❌ Erro ao listar webhooks: ${webhooksResponse.status}`);
      hasErrors = true;
    } else {
      const webhooksData = await webhooksResponse.json();
      const webhooks: ShopifyWebhook[] = webhooksData.webhooks || [];

      if (webhooks.length === 0) {
        console.log('   ⚠️  NENHUM WEBHOOK REGISTRADO!\n');
        console.log('   💡 Você precisa registrar um webhook para orders/create');
        hasErrors = true;
      } else {
        console.log(`   📊 Total de webhooks: ${webhooks.length}\n`);

        // Procurar pelo webhook orders/create
        const orderCreateWebhook = webhooks.find(w => w.topic === 'orders/create');

        if (orderCreateWebhook) {
          console.log('   ✅ WEBHOOK orders/create ENCONTRADO!\n');
          console.log(`      ID: ${orderCreateWebhook.id}`);
          console.log(`      URL: ${orderCreateWebhook.address}`);
          console.log(`      Formato: ${orderCreateWebhook.format}`);
          console.log(`      API Version: ${orderCreateWebhook.api_version}`);
          console.log(`      Criado em: ${orderCreateWebhook.created_at}`);
          console.log('');

          // Verificar se URL é pública
          if (orderCreateWebhook.address.includes('localhost') || orderCreateWebhook.address.includes('127.0.0.1')) {
            console.log('   ⚠️  PROBLEMA: Webhook aponta para localhost!');
            console.log('   💡 Shopify não consegue acessar URLs locais.');
            console.log('   💡 Opções:');
            console.log('      1. Fazer deploy no Vercel');
            console.log('      2. Usar ngrok para expor localhost');
            console.log('');
            hasErrors = true;
          } else {
            console.log('   ✅ URL do webhook é pública!');
          }
        } else {
          console.log('   ❌ WEBHOOK orders/create NÃO ENCONTRADO!\n');
          console.log('   💡 Webhooks registrados:');
          webhooks.forEach(w => {
            console.log(`      - ${w.topic}: ${w.address}`);
          });
          console.log('');
          hasErrors = true;
        }

        // Verificar outros webhooks relevantes
        const orderUpdateWebhook = webhooks.find(w => w.topic === 'orders/updated');
        if (orderUpdateWebhook) {
          console.log('   ℹ️  Webhook orders/updated também encontrado');
          console.log(`      URL: ${orderUpdateWebhook.address}\n`);
        }
      }
    }
  } catch (error: any) {
    console.log(`   ❌ Erro ao verificar webhooks: ${error.message}`);
    hasErrors = true;
  }

  // ============================================================
  // 4. VERIFICAR PRODUTOS COM SHOPIFY VARIANT IDS
  // ============================================================
  console.log('📦 ETAPA 4/6: Verificando produtos com Shopify variant IDs...\n');

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Contar produtos totais
    const { count: totalProducts, error: totalError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    if (totalError) {
      console.log(`   ❌ Erro ao contar produtos: ${totalError.message}`);
      hasErrors = true;
    } else {
      console.log(`   📊 Total de produtos no banco: ${totalProducts}`);
    }

    // Contar produtos com variant_id
    const { count: productsWithVariant, error: variantError } = await supabase
      .from('analyses')
      .select('*', { count: 'exact', head: true })
      .not('shopify_variant_id', 'is', null);

    if (variantError) {
      console.log(`   ❌ Erro ao contar variant IDs: ${variantError.message}`);
      hasErrors = true;
    } else {
      console.log(`   📊 Produtos com shopify_variant_id: ${productsWithVariant}`);

      if (totalProducts && productsWithVariant) {
        const percentage = ((productsWithVariant / totalProducts) * 100).toFixed(1);
        console.log(`   📊 Cobertura: ${percentage}%`);

        if (productsWithVariant === 0) {
          console.log('\n   ❌ NENHUM PRODUTO TEM VARIANT ID!');
          console.log('   💡 Execute: npx tsx scripts/update-supabase-shopify-ids.ts\n');
          hasErrors = true;
        } else if (productsWithVariant < totalProducts!) {
          console.log('\n   ⚠️  Alguns produtos não têm variant ID');
          console.log('   💡 Execute: npx tsx scripts/update-supabase-shopify-ids.ts\n');
        } else {
          console.log('\n   ✅ Todos os produtos têm variant ID!\n');
        }
      }
    }

    // Mostrar alguns exemplos de mapeamento
    const { data: sampleMappings, error: sampleError } = await supabase
      .from('analyses')
      .select('shopify_variant_id, products(sku, name, woo_product_id)')
      .not('shopify_variant_id', 'is', null)
      .limit(3);

    if (sampleMappings && sampleMappings.length > 0) {
      console.log('   📋 Exemplos de mapeamento:\n');
      sampleMappings.forEach((mapping: any) => {
        const product = Array.isArray(mapping.products) ? mapping.products[0] : mapping.products;
        console.log(`      • Variant ID ${mapping.shopify_variant_id}`);
        console.log(`        → WooCommerce Product ${product.woo_product_id}`);
        console.log(`        → SKU: ${product.sku}`);
        console.log('');
      });
    }

  } catch (error: any) {
    console.log(`   ❌ Erro ao verificar Supabase: ${error.message}`);
    hasErrors = true;
  }

  // ============================================================
  // 5. VERIFICAR LOGS DE ERRO DO WEBHOOK
  // ============================================================
  console.log('📝 ETAPA 5/6: Verificando logs de erro do webhook...\n');

  try {
    // Tentar acessar o endpoint de logs (se estiver rodando)
    const logsUrl = 'http://localhost:3000/api/shopify-order-webhook';

    console.log('   ℹ️  Para ver logs de erro, acesse:');
    console.log(`   GET ${logsUrl}`);
    console.log('   (somente se servidor estiver rodando)\n');

  } catch (error: any) {
    console.log(`   ℹ️  Não foi possível acessar logs localmente\n`);
  }

  // ============================================================
  // 6. RESUMO E PRÓXIMOS PASSOS
  // ============================================================
  console.log('━'.repeat(60));
  console.log('\n📊 RESUMO DO DIAGNÓSTICO\n');

  if (hasErrors) {
    console.log('❌ PROBLEMAS ENCONTRADOS!\n');
    console.log('🔧 PRÓXIMOS PASSOS:\n');

    // Verificar qual é o problema principal
    console.log('1. Se webhook não está registrado ou URL errada:');
    console.log('   → Execute: npx tsx scripts/register-webhook.ts\n');

    console.log('2. Se variant IDs estão faltando:');
    console.log('   → Execute: npx tsx scripts/update-supabase-shopify-ids.ts\n');

    console.log('3. Se sistema está rodando local:');
    console.log('   → Faça deploy no Vercel OU use ngrok\n');

    console.log('4. Após corrigir, teste com:');
    console.log('   → Execute: npx tsx scripts/test-webhook-locally.ts\n');

  } else {
    console.log('✅ TUDO CONFIGURADO CORRETAMENTE!\n');
    console.log('🔧 PRÓXIMOS PASSOS:\n');
    console.log('1. Fazer pedido de teste na Shopify');
    console.log('2. Verificar se pedido aparece no WooCommerce');
    console.log('3. Monitorar logs do webhook\n');
  }

  console.log('━'.repeat(60));
  console.log('');
}

// Executar diagnóstico
diagnoseWebhook().catch(error => {
  console.error('\n❌ Erro fatal no diagnóstico:', error);
  process.exit(1);
});
