/**
 * 🔍 DEBUG: Verificar Environment Variables
 *
 * GET /api/debug-env
 *
 * IMPORTANTE: DELETAR depois de verificar!
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  return NextResponse.json({
    shopify_webhook_secret_exists: !!secret,
    shopify_webhook_secret_length: secret?.length || 0,
    shopify_webhook_secret_first_10: secret?.substring(0, 10) || 'N/A',
    shopify_webhook_secret_last_10: secret?.substring(secret.length - 10) || 'N/A',

    // Verificar outras env vars importantes
    shopify_store_url_exists: !!process.env.SHOPIFY_STORE_URL,
    shopify_access_token_exists: !!process.env.SHOPIFY_ACCESS_TOKEN,
    woocommerce_url_exists: !!process.env.WOOCOMMERCE_URL,

    // Runtime info
    node_env: process.env.NODE_ENV,
    vercel_env: process.env.VERCEL_ENV
  });
}
