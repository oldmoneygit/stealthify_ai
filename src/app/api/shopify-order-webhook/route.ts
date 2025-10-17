import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getProductByShopifyVariantId } from '@/lib/supabase';
import { createWooCommerceOrder } from '@/services/woocommerce.service';

/**
 * 🔄 API ROUTE: Shopify Order Webhook → WooCommerce Order Sync
 *
 * POST /api/shopify-order-webhook
 *
 * Este endpoint recebe webhooks da Shopify quando um pedido é criado
 * e cria automaticamente o pedido correspondente no WooCommerce
 *
 * Shopify Webhook Event: orders/create
 */

interface ShopifyLineItem {
  id: number;
  variant_id: number;
  title: string;
  quantity: number;
  price: string;
  sku: string;
  product_id: number;
}

interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  address2: string | null;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string | null;
  company: string | null;
}

interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  customer: ShopifyCustomer;
  billing_address: ShopifyAddress;
  shipping_address: ShopifyAddress;
  line_items: ShopifyLineItem[];
  order_number: number;
  name: string;
}

/**
 * Verifica a assinatura HMAC do webhook da Shopify
 */
function verifyWebhookSignature(
  body: string,
  hmacHeader: string | null
): boolean {
  if (!hmacHeader) {
    console.error('❌ [Webhook] Missing HMAC header');
    return false;
  }

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('❌ [Webhook] SHOPIFY_WEBHOOK_SECRET not configured');
    return false;
  }

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  const isValid = hash === hmacHeader;

  if (!isValid) {
    console.error('❌ [Webhook] Invalid HMAC signature');
  }

  return isValid;
}

/**
 * Mapeia status de pagamento Shopify → WooCommerce
 */
function mapPaymentStatus(financialStatus: string): string {
  const statusMap: Record<string, string> = {
    'pending': 'pending',
    'authorized': 'on-hold',
    'paid': 'processing',
    'partially_paid': 'on-hold',
    'refunded': 'refunded',
    'voided': 'cancelled',
    'partially_refunded': 'processing'
  };

  return statusMap[financialStatus] || 'pending';
}

/**
 * Mapeia status de fulfillment Shopify → WooCommerce
 */
function mapFulfillmentStatus(
  financialStatus: string,
  fulfillmentStatus: string | null
): string {
  if (fulfillmentStatus === 'fulfilled') {
    return 'completed';
  }

  return mapPaymentStatus(financialStatus);
}

export async function POST(request: Request) {
  try {
    console.log('📥 [Webhook] Recebendo webhook da Shopify...');

    // 1. Ler body como texto para verificação HMAC
    const bodyText = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

    // 2. Verificar assinatura do webhook
    if (!verifyWebhookSignature(bodyText, hmacHeader)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid webhook signature'
      }, { status: 401 });
    }

    console.log('✅ [Webhook] Assinatura verificada');

    // 3. Parse do body
    const shopifyOrder: ShopifyOrder = JSON.parse(bodyText);

    console.log('📦 [Webhook] Pedido Shopify recebido:', {
      shopify_order_id: shopifyOrder.id,
      order_number: shopifyOrder.order_number,
      email: shopifyOrder.email,
      total: shopifyOrder.total_price,
      items: shopifyOrder.line_items.length
    });

    // 4. Mapear line items Shopify → WooCommerce
    console.log('🔄 [Webhook] Mapeando produtos...');

    const lineItems = [];
    const notFound = [];

    for (const item of shopifyOrder.line_items) {
      // Buscar produto WooCommerce pelo Shopify variant ID
      // O banco armazena apenas o ID numérico, então usar diretamente
      const variantIdStr = item.variant_id.toString();
      const wooProduct = await getProductByShopifyVariantId(variantIdStr);

      if (!wooProduct) {
        console.warn(`⚠️ [Webhook] Produto não encontrado: Shopify variant ${item.variant_id}`);
        notFound.push({
          shopify_variant_id: item.variant_id,
          title: item.title,
          sku: item.sku
        });
        continue;
      }

      console.log(`✅ [Webhook] Mapeado: ${item.title} → WooCommerce product ${wooProduct.woo_product_id}`);

      lineItems.push({
        product_id: wooProduct.woo_product_id,
        quantity: item.quantity,
        total: (parseFloat(item.price) * item.quantity).toFixed(2)
      });
    }

    // 5. Se algum produto não foi encontrado, avisar mas continuar
    if (notFound.length > 0) {
      console.warn('⚠️ [Webhook] Produtos não mapeados:', notFound);
      // Continuar com os produtos que foram encontrados
    }

    if (lineItems.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhum produto foi mapeado para WooCommerce',
        not_found: notFound
      }, { status: 404 });
    }

    // 6. Determinar status do pedido
    const orderStatus = mapFulfillmentStatus(
      shopifyOrder.financial_status,
      shopifyOrder.fulfillment_status
    );

    console.log('📝 [Webhook] Status mapeado:', {
      shopify_financial: shopifyOrder.financial_status,
      shopify_fulfillment: shopifyOrder.fulfillment_status,
      woo_status: orderStatus
    });

    // 7. Criar pedido no WooCommerce
    console.log('🛒 [Webhook] Criando pedido no WooCommerce...');

    const wooOrder = await createWooCommerceOrder({
      status: orderStatus,
      customer_id: 0, // Guest checkout
      billing: {
        first_name: shopifyOrder.billing_address.first_name,
        last_name: shopifyOrder.billing_address.last_name,
        address_1: shopifyOrder.billing_address.address1,
        address_2: shopifyOrder.billing_address.address2 || '',
        city: shopifyOrder.billing_address.city,
        state: shopifyOrder.billing_address.province,
        postcode: shopifyOrder.billing_address.zip,
        country: shopifyOrder.billing_address.country,
        email: shopifyOrder.email,
        phone: shopifyOrder.billing_address.phone || ''
      },
      shipping: {
        first_name: shopifyOrder.shipping_address.first_name,
        last_name: shopifyOrder.shipping_address.last_name,
        address_1: shopifyOrder.shipping_address.address1,
        address_2: shopifyOrder.shipping_address.address2 || '',
        city: shopifyOrder.shipping_address.city,
        state: shopifyOrder.shipping_address.province,
        postcode: shopifyOrder.shipping_address.zip,
        country: shopifyOrder.shipping_address.country
      },
      line_items: lineItems,
      meta_data: [
        {
          key: '_shopify_order_id',
          value: shopifyOrder.id.toString()
        },
        {
          key: '_shopify_order_number',
          value: shopifyOrder.order_number.toString()
        },
        {
          key: '_synced_from_shopify',
          value: 'true'
        },
        {
          key: '_sync_date',
          value: new Date().toISOString()
        }
      ]
    });

    console.log('✅ [Webhook] Pedido criado no WooCommerce:', {
      woo_order_id: wooOrder.id,
      shopify_order_id: shopifyOrder.id,
      status: wooOrder.status
    });

    return NextResponse.json({
      success: true,
      woo_order_id: wooOrder.id,
      shopify_order_id: shopifyOrder.id,
      status: wooOrder.status,
      items_synced: lineItems.length,
      items_not_found: notFound.length
    });

  } catch (error: any) {
    console.error('❌ [Webhook] Erro ao processar webhook:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
