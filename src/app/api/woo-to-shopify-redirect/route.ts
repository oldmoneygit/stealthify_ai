import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * 🔄 API ROUTE: Redirecionamento WooCommerce → Shopify Checkout
 *
 * POST /api/woo-to-shopify-redirect
 *
 * Body: {
 *   items: [{ sku: string, quantity: number }]
 * }
 *
 * Response: {
 *   success: boolean,
 *   checkout_url: string (URL do checkout da Shopify)
 * }
 */

const SHOPIFY_API_VERSION = '2024-01';

interface CartItem {
  sku: string;
  quantity: number;
}

interface ShopifyProduct {
  shopify_product_id: string;
  shopify_variant_id: string;
  sku: string;
  price: number;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items } = body as { items: CartItem[] };

    console.log('🔄 [WooCommerce → Shopify] Iniciando redirecionamento:', { items });

    if (!items || items.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum item no carrinho'
      }, { status: 400 });
    }

    // Validar credenciais Shopify
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Credenciais Shopify não configuradas'
      }, { status: 500 });
    }

    // Buscar produtos importados no banco de dados pelo SKU
    const skus = items.map(item => item.sku);
    const placeholders = skus.map(() => '?').join(',');

    const stmt = db.prepare(`
      SELECT
        p.sku,
        p.price,
        a.shopify_product_id,
        a.shopify_variant_id
      FROM products p
      INNER JOIN analyses a ON p.id = a.product_id
      WHERE p.sku IN (${placeholders})
      AND a.shopify_product_id IS NOT NULL
      AND a.shopify_variant_id IS NOT NULL
    `);

    const shopifyProducts = stmt.all(...skus) as ShopifyProduct[];

    console.log('📦 [Mapeamento] Produtos encontrados:', shopifyProducts.length);

    if (shopifyProducts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum produto foi importado para a Shopify ainda. Importe os produtos primeiro.'
      }, { status: 404 });
    }

    // Criar mapa SKU → Shopify Variant ID
    const skuMap = new Map<string, ShopifyProduct>();
    shopifyProducts.forEach(product => {
      skuMap.set(product.sku, product);
    });

    // Validar se todos os SKUs foram encontrados
    const notFound: string[] = [];
    items.forEach(item => {
      if (!skuMap.has(item.sku)) {
        notFound.push(item.sku);
      }
    });

    if (notFound.length > 0) {
      console.warn('⚠️ [Mapeamento] SKUs não encontrados na Shopify:', notFound);
      return NextResponse.json({
        success: false,
        error: `Produtos não encontrados na Shopify: ${notFound.join(', ')}`
      }, { status: 404 });
    }

    // Criar checkout na Shopify
    const checkoutUrl = await createShopifyCheckout(items, skuMap);

    console.log('✅ [Checkout] URL criada:', checkoutUrl);

    return NextResponse.json({
      success: true,
      checkout_url: checkoutUrl
    });

  } catch (error: any) {
    console.error('❌ [Redirecionamento] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Cria um checkout na Shopify com os produtos do carrinho WooCommerce
 */
async function createShopifyCheckout(
  items: CartItem[],
  skuMap: Map<string, ShopifyProduct>
): Promise<string> {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

  // Preparar line items para a Shopify
  const lineItems = items.map(item => {
    const shopifyProduct = skuMap.get(item.sku)!;
    return {
      variant_id: shopifyProduct.shopify_variant_id,
      quantity: item.quantity
    };
  });

  console.log('🛒 [Checkout] Line items:', lineItems);

  // Criar checkout via Shopify API
  const response = await fetch(
    `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/checkouts.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        checkout: {
          line_items: lineItems
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Shopify Checkout API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const checkout = result.checkout;

  // Retornar URL do checkout
  return checkout.web_url;
}
