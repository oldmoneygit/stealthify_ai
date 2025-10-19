import { NextResponse } from 'next/server';
import { getProductsBySKUs } from '@/lib/supabase';
import { getActiveDiscountCode } from '@/services/shopify.service';

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

interface TrackingParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  utm_id?: string;
  fbclid?: string;
  gclid?: string;
  msclkid?: string;
  ttclid?: string;
}

interface ShopifyProduct {
  shopify_product_id: string;
  shopify_variant_id: string;
  sku: string;
  price: number;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { items, tracking_params } = body as { items: CartItem[], tracking_params?: TrackingParams };

    console.log('🔄 [WooCommerce → Shopify] Iniciando redirecionamento:', {
      items,
      has_tracking: !!tracking_params
    });

    if (tracking_params) {
      console.log('🎯 [Tracking] UTMs recebidas:', tracking_params);
    }

    if (!items || items.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum item no carrinho'
      }, { status: 400, headers: corsHeaders });
    }

    // Validar credenciais Shopify
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Credenciais Shopify não configuradas'
      }, { status: 500, headers: corsHeaders });
    }

    // Buscar produtos importados no Supabase pelo SKU
    const skus = items.map(item => item.sku);
    const products = await getProductsBySKUs(skus);

    console.log('📦 [Mapeamento] Produtos encontrados:', products.length);

    if (products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum produto foi importado para a Shopify ainda. Importe os produtos primeiro.'
      }, { status: 404, headers: corsHeaders });
    }

    // Filtrar apenas produtos com Shopify IDs
    const shopifyProducts = products.filter(p =>
      p.shopify_product_id && p.shopify_variant_id
    );

    if (shopifyProducts.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Produtos encontrados mas não foram importados para Shopify.'
      }, { status: 404, headers: corsHeaders });
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
      }, { status: 404, headers: corsHeaders });
    }

    // Buscar desconto ativo (não bloqueia se falhar)
    const discountCode = await getActiveDiscountCode().catch(() => null);

    // Criar checkout na Shopify (com UTMs)
    const checkoutUrl = await createShopifyCheckout(items, skuMap, discountCode, tracking_params);

    console.log('✅ [Checkout] URL criada:', checkoutUrl);

    return NextResponse.json({
      success: true,
      checkout_url: checkoutUrl,
      discount_applied: discountCode || undefined
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('❌ [Redirecionamento] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

/**
 * Cria um checkout na Shopify com os produtos do carrinho WooCommerce
 *
 * @param items - Itens do carrinho
 * @param skuMap - Mapa de SKUs para produtos Shopify
 * @param discountCode - Código de desconto (opcional)
 * @param trackingParams - Parâmetros de tracking (UTMs, fbclid, etc)
 * @returns URL do carrinho com desconto e UTMs aplicados
 */
async function createShopifyCheckout(
  items: CartItem[],
  skuMap: Map<string, ShopifyProduct>,
  discountCode: string | null = null,
  trackingParams?: TrackingParams
): Promise<string> {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;

  // Preparar line items como variant_id:quantity
  const cartItems = items.map(item => {
    const shopifyProduct = skuMap.get(item.sku)!;
    // Remover 'gid://shopify/ProductVariant/' prefix se existir
    const variantId = shopifyProduct.shopify_variant_id.replace('gid://shopify/ProductVariant/', '');
    return `${variantId}:${item.quantity}`;
  });

  // Criar URL do carrinho Shopify (não requer API, funciona sempre)
  // Formato: https://loja.myshopify.com/cart/VARIANT_ID:QUANTITY,VARIANT_ID:QUANTITY
  let cartUrl = `${SHOPIFY_STORE_URL}/cart/${cartItems.join(',')}`;

  // Preparar query parameters
  const queryParams: Record<string, string> = {};

  // Adicionar código de desconto se disponível
  if (discountCode) {
    queryParams['discount'] = discountCode;
    console.log(`🎟️ [Checkout] Desconto aplicado: ${discountCode}`);
  }

  // Adicionar parâmetros de tracking (UTMs, fbclid, etc)
  if (trackingParams) {
    const trackingKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'fbclid',
      'gclid',
      'msclkid',
      'ttclid'
    ];

    trackingKeys.forEach(key => {
      const value = trackingParams[key as keyof TrackingParams];
      if (value) {
        queryParams[key] = value;
      }
    });

    const utmCount = Object.keys(queryParams).filter(k => k.startsWith('utm_')).length;
    if (utmCount > 0) {
      console.log(`🎯 [Tracking] ${utmCount} parâmetros UTM adicionados à URL`);
    }
  }

  // Adicionar query parameters à URL
  if (Object.keys(queryParams).length > 0) {
    const queryString = new URLSearchParams(queryParams).toString();
    cartUrl += `?${queryString}`;
  }

  console.log('🛒 [Checkout] Cart URL criada:', cartUrl);

  // Retornar URL do carrinho (automaticamente redireciona para checkout)
  return cartUrl;
}
