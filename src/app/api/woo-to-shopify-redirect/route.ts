import { NextResponse } from 'next/server';
import { getProductsBySKUs } from '@/lib/supabase';

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

    // Buscar produtos importados no Supabase pelo SKU
    const skus = items.map(item => item.sku);
    const products = await getProductsBySKUs(skus);

    console.log('📦 [Mapeamento] Produtos encontrados:', products.length);

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum produto foi importado para a Shopify ainda. Importe os produtos primeiro.'
      }, { status: 404 });
    }

    // Filtrar apenas produtos com Shopify IDs
    const shopifyProducts = products.filter(p =>
      p.shopify_product_id && p.shopify_variant_id
    );

    if (shopifyProducts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Produtos encontrados mas não foram importados para Shopify.'
      }, { status: 404 });
    }

    // Criar mapa SKU → Shopify data
    const skuMap = new Map<string, ShopifyProduct>();
    shopifyProducts.forEach(product => {
      skuMap.set(product.sku, {
        shopify_product_id: product.shopify_product_id!,
        shopify_variant_id: product.shopify_variant_id!,
        sku: product.sku,
        price: product.price
      });
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
