import { NextResponse } from 'next/server';

/**
 * 🔍 DEBUG: Verificar variáveis de ambiente no Vercel
 *
 * GET /api/debug-env
 *
 * IMPORTANTE: Este endpoint deve ser REMOVIDO em produção!
 */
export async function GET() {
  const envVars = {
    // WooCommerce
    WOOCOMMERCE_URL: process.env.WOOCOMMERCE_URL ? '✅ Configurado' : '❌ NÃO configurado',
    WOOCOMMERCE_CONSUMER_KEY: process.env.WOOCOMMERCE_CONSUMER_KEY
      ? `✅ ${process.env.WOOCOMMERCE_CONSUMER_KEY.substring(0, 10)}...`
      : '❌ NÃO configurado',
    WOOCOMMERCE_CONSUMER_SECRET: process.env.WOOCOMMERCE_CONSUMER_SECRET
      ? `✅ ${process.env.WOOCOMMERCE_CONSUMER_SECRET.substring(0, 10)}...`
      : '❌ NÃO configurado',

    // Shopify
    SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL ? '✅ Configurado' : '❌ NÃO configurado',
    SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN
      ? `✅ ${process.env.SHOPIFY_ACCESS_TOKEN.substring(0, 10)}...`
      : '❌ NÃO configurado',
    SHOPIFY_WEBHOOK_SECRET: process.env.SHOPIFY_WEBHOOK_SECRET
      ? `✅ ${process.env.SHOPIFY_WEBHOOK_SECRET.substring(0, 10)}...`
      : '❌ NÃO configurado',

    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? '✅ Configurado' : '❌ NÃO configurado',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? `✅ ${process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10)}...`
      : '❌ NÃO configurado',
  };

  return NextResponse.json({
    message: '🔍 Variáveis de Ambiente no Vercel',
    env: envVars,
    node_env: process.env.NODE_ENV,
    vercel: process.env.VERCEL ? 'Rodando no Vercel' : 'Não é Vercel'
  });
}
