import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getProductByShopifyVariantId } from '@/lib/supabase';
import { createWooCommerceOrder, checkIfOrderExists, updateOrderStatus } from '@/services/woocommerce.service';

/**
 * 🔄 API ROUTE: Shopify Order Webhook → WooCommerce Order Sync
 *
 * POST /api/shopify-order-webhook
 *
 * Este endpoint recebe webhooks da Shopify quando um pedido é criado ou atualizado
 * e sincroniza automaticamente com o WooCommerce
 *
 * Shopify Webhook Events:
 * - orders/create: Cria novo pedido no WooCommerce
 * - orders/updated: Atualiza status do pedido no WooCommerce
 */

// ⚠️ CRITICAL: Disable automatic body parsing for HMAC verification
// Next.js automatically parses JSON bodies, which corrupts the raw bytes needed for HMAC
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  email?: string;
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
  note: string | null;
  note_attributes?: Array<{ name: string; value: string }>;
  gateway?: string;
  payment_gateway_names?: string[];
}

interface WebhookError {
  timestamp: string;
  error: string;
  shopify_order_id?: number;
  details?: any;
}

// In-memory error log (últimos 100 erros)
const errorLog: WebhookError[] = [];

function logWebhookError(error: string, shopifyOrderId?: number, details?: any) {
  const entry: WebhookError = {
    timestamp: new Date().toISOString(),
    error,
    shopify_order_id: shopifyOrderId,
    details
  };

  errorLog.unshift(entry);
  if (errorLog.length > 100) {
    errorLog.pop();
  }

  console.error('❌ [Webhook Error Log]', entry);
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

  // Calculate HMAC using raw body bytes
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  const isValid = hash === hmacHeader;

  if (!isValid) {
    console.error('❌ [Webhook] HMAC verification failed');
    console.error('   Expected (Shopify):', hmacHeader);
    console.error('   Calculated (Server):', hash);
    console.error('   Secret length:', secret.length);
    console.error('   Body length:', body.length);
  } else {
    console.log('✅ [Webhook] HMAC verification successful');
  }

  return isValid;
}

/**
 * Helper: Extrai valor de note_attributes
 */
function getNoteAttribute(noteAttributes: Array<{ name: string; value: string }> | undefined, key: string): string {
  if (!noteAttributes) return '';
  const attr = noteAttributes.find(a => a.name === key);
  return attr?.value || '';
}

/**
 * Helper: Parseia note_attributes e monta endereço completo
 */
function parseAddressFromNoteAttributes(
  noteAttributes: Array<{ name: string; value: string }> | undefined,
  type: 'billing' | 'shipping',
  fallbackAddress: ShopifyAddress
): {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
} {
  const streetName = getNoteAttribute(noteAttributes, `${type}_street_name`);
  const streetNumber = getNoteAttribute(noteAttributes, `${type}_street_number`);
  const streetComplement = getNoteAttribute(noteAttributes, `${type}_street_complement`);
  const neighborhood = getNoteAttribute(noteAttributes, `${type}_neighborhood`);
  const fullAddress = getNoteAttribute(noteAttributes, `${type}_full_address`);

  // Construir address_1 e address_2
  let address_1 = '';
  let address_2 = '';

  if (streetName && streetNumber) {
    address_1 = `${streetName}, ${streetNumber}`;
    if (streetComplement) {
      address_2 = `${streetComplement}${neighborhood ? ' - ' + neighborhood : ''}`;
    } else if (neighborhood && neighborhood !== 'Bairro Não Informado') {
      address_2 = neighborhood;
    }
  } else if (fullAddress) {
    // Usar fullAddress se disponível
    const parts = fullAddress.split(' - ');
    address_1 = parts[0] || '';
    address_2 = parts.slice(1, -1).join(' - ') || '';
  } else {
    // Fallback para dados do billing/shipping_address
    address_1 = fallbackAddress.address1 || '';
    address_2 = fallbackAddress.address2 || '';
  }

  // Extrair cidade e CEP do fullAddress (formato: "rua, numero - bairro - cidade/estado - cep")
  let city = '';
  let postcode = '';
  if (fullAddress) {
    // Cidade (antes da barra)
    const cityMatch = fullAddress.match(/- ([^/]+)\//);
    if (cityMatch && cityMatch[1]) {
      city = cityMatch[1].trim();
    }
    // CEP (após último hífen)
    const postcodeMatch = fullAddress.match(/- (\d+)$/);
    if (postcodeMatch && postcodeMatch[1]) {
      postcode = postcodeMatch[1];
    }
  }

  return {
    first_name: '',  // Será preenchido depois com customer data
    last_name: '',
    company: '',
    address_1,
    address_2,
    city: city || fallbackAddress.city || '',
    state: fallbackAddress.province || '',
    postcode: postcode || fallbackAddress.zip || '',
    country: fallbackAddress.country || 'BR',
    phone: ''
  };
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

/**
 * GET /api/shopify-order-webhook/errors
 * Retorna log de erros dos webhooks
 */
export async function GET() {
  return NextResponse.json({
    total_errors: errorLog.length,
    errors: errorLog.slice(0, 20) // Últimos 20 erros
  });
}

/**
 * POST /api/shopify-order-webhook
 * Processa webhooks de criação/atualização de pedidos
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    console.log('📥 [Webhook] Recebendo webhook da Shopify...');

    // 1. Ler body como texto para verificação HMAC
    const bodyText = await request.text();
    const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
    const topic = request.headers.get('x-shopify-topic');

    console.log('📋 [Webhook] Topic:', topic);

    // 2. Verificar assinatura do webhook
    if (!verifyWebhookSignature(bodyText, hmacHeader)) {
      logWebhookError('Invalid HMAC signature');
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
      items: shopifyOrder.line_items.length,
      topic
    });

    // 4. IDEMPOTÊNCIA: Verificar se pedido já existe
    const existingOrder = await checkIfOrderExists(shopifyOrder.id.toString());

    if (existingOrder) {
      // Se topic for "orders/updated", atualizar status
      if (topic === 'orders/updated') {
        const newStatus = mapFulfillmentStatus(
          shopifyOrder.financial_status,
          shopifyOrder.fulfillment_status
        );

        // Atualizar apenas se status for diferente
        if (existingOrder.status !== newStatus) {
          console.log(`🔄 [Webhook] Atualizando status: ${existingOrder.status} → ${newStatus}`);

          await updateOrderStatus(existingOrder.id, newStatus);

          const duration = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            action: 'updated',
            woo_order_id: existingOrder.id,
            shopify_order_id: shopifyOrder.id,
            old_status: existingOrder.status,
            new_status: newStatus,
            duration_ms: duration
          });
        } else {
          console.log(`ℹ️ [Webhook] Status já está correto (${existingOrder.status}), nada a fazer`);

          const duration = Date.now() - startTime;
          return NextResponse.json({
            success: true,
            action: 'skipped',
            reason: 'Status already up to date',
            woo_order_id: existingOrder.id,
            shopify_order_id: shopifyOrder.id,
            status: existingOrder.status,
            duration_ms: duration
          });
        }
      }

      // Se for orders/create mas pedido já existe, retornar sucesso (idempotência)
      console.log('ℹ️ [Webhook] Pedido já existe, retornando sucesso (idempotente)');

      const duration = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        action: 'exists',
        woo_order_id: existingOrder.id,
        shopify_order_id: shopifyOrder.id,
        status: existingOrder.status,
        duration_ms: duration
      });
    }

    // 5. Mapear line items Shopify → WooCommerce
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
        quantity: item.quantity
        // Note: 'total' is calculated automatically by WooCommerce based on product price
      });
    }

    // 6. Se algum produto não foi encontrado, avisar mas continuar
    if (notFound.length > 0) {
      console.warn('⚠️ [Webhook] Produtos não mapeados:', notFound);
      logWebhookError('Produtos não encontrados', shopifyOrder.id, notFound);
      // Continuar com os produtos que foram encontrados
    }

    if (lineItems.length === 0) {
      const error = 'Nenhum produto foi mapeado para WooCommerce';
      logWebhookError(error, shopifyOrder.id, { not_found: notFound });

      return NextResponse.json({
        success: false,
        error,
        not_found: notFound
      }, { status: 404 });
    }

    // 7. Determinar status do pedido
    const orderStatus = mapFulfillmentStatus(
      shopifyOrder.financial_status,
      shopifyOrder.fulfillment_status
    );

    console.log('📝 [Webhook] Status mapeado:', {
      shopify_financial: shopifyOrder.financial_status,
      shopify_fulfillment: shopifyOrder.fulfillment_status,
      woo_status: orderStatus
    });

    // 8. Criar pedido no WooCommerce
    console.log('🛒 [Webhook] Criando pedido no WooCommerce...');

    // Parsear endereços de note_attributes (onde estão os dados REAIS)
    const billingAddressRaw = shopifyOrder.billing_address || shopifyOrder.shipping_address || {} as ShopifyAddress;
    const shippingAddressRaw = shopifyOrder.shipping_address || shopifyOrder.billing_address || {} as ShopifyAddress;

    const billingParsed = parseAddressFromNoteAttributes(
      shopifyOrder.note_attributes,
      'billing',
      billingAddressRaw
    );
    const shippingParsed = parseAddressFromNoteAttributes(
      shopifyOrder.note_attributes,
      'shipping',
      shippingAddressRaw
    );

    // Nome do cliente (priorizar customer, depois billing_address)
    const firstName = shopifyOrder.customer?.first_name ||
                     billingAddressRaw.first_name ||
                     'Cliente';
    const lastName = shopifyOrder.customer?.last_name ||
                    billingAddressRaw.last_name ||
                    'Shopify';

    // Email: tentar pegar do pedido, customer ou billing
    const customerEmail = shopifyOrder.email ||
                         shopifyOrder.customer?.email ||
                         billingAddressRaw.email ||
                         'sem-email@shopify.com';

    // Telefone (pode estar em billing_address ou default_address do customer)
    const customerPhone = billingAddressRaw.phone ||
                         shippingAddressRaw.phone ||
                         '';

    const wooOrder = await createWooCommerceOrder({
      status: orderStatus,
      customer_id: 0, // Guest checkout
      billing: {
        first_name: firstName,
        last_name: lastName,
        company: billingAddressRaw.company || '',
        address_1: billingParsed.address_1,
        address_2: billingParsed.address_2,
        city: billingParsed.city,
        state: billingParsed.state,
        postcode: billingParsed.postcode,
        country: billingParsed.country,
        email: customerEmail,
        phone: customerPhone
      },
      shipping: {
        first_name: firstName,
        last_name: lastName,
        company: shippingAddressRaw.company || '',
        address_1: shippingParsed.address_1,
        address_2: shippingParsed.address_2,
        city: shippingParsed.city,
        state: shippingParsed.state,
        postcode: shippingParsed.postcode,
        country: shippingParsed.country
      },
      line_items: lineItems,
      shipping_lines: [
        {
          method_id: 'shopify_shipping',
          method_title: 'Frete Shopify',
          total: '0.00'
        }
      ],
      payment_method: 'shopify',
      payment_method_title: 'Pagamento via Shopify',
      customer_note: shopifyOrder.note || '',
      meta_data: [
        // IDs e identificadores
        {
          key: '_shopify_order_id',
          value: shopifyOrder.id.toString()
        },
        {
          key: '_shopify_order_number',
          value: shopifyOrder.order_number.toString()
        },
        {
          key: 'Pedido Shopify',  // Campo VISÍVEL no admin
          value: `#${shopifyOrder.order_number} (ID: ${shopifyOrder.id})`
        },
        {
          key: '_shopify_order_name',
          value: shopifyOrder.name || `#${shopifyOrder.order_number}`
        },

        // Informações do cliente
        {
          key: '_shopify_customer_id',
          value: shopifyOrder.customer?.id?.toString() || '0'
        },
        {
          key: '_shopify_customer_email',
          value: customerEmail
        },
        {
          key: 'Cliente Shopify',
          value: `${shopifyOrder.customer?.first_name || ''} ${shopifyOrder.customer?.last_name || ''}`.trim() || 'Guest'
        },

        // Valores e moeda
        {
          key: '_shopify_total_price',
          value: shopifyOrder.total_price
        },
        {
          key: '_shopify_subtotal_price',
          value: shopifyOrder.subtotal_price
        },
        {
          key: '_shopify_total_tax',
          value: shopifyOrder.total_tax
        },
        {
          key: '_shopify_currency',
          value: shopifyOrder.currency
        },

        // Status
        {
          key: '_shopify_financial_status',
          value: shopifyOrder.financial_status
        },
        {
          key: '_shopify_fulfillment_status',
          value: shopifyOrder.fulfillment_status || 'unfulfilled'
        },

        // Datas
        {
          key: '_shopify_created_at',
          value: shopifyOrder.created_at
        },
        {
          key: '_shopify_updated_at',
          value: shopifyOrder.updated_at
        },

        // Payment gateway
        {
          key: 'Gateway Pagamento',
          value: shopifyOrder.payment_gateway_names?.join(', ') || shopifyOrder.gateway || 'N/A'
        },
        {
          key: '_shopify_payment_gateway',
          value: shopifyOrder.gateway || ''
        },

        // Note attributes (dados adicionais do checkout Shopify)
        ...(shopifyOrder.note_attributes || []).map(attr => ({
          key: `Shopify: ${attr.name}`,
          value: attr.value
        })),

        // Sync metadata
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

    const duration = Date.now() - startTime;

    console.log('✅ [Webhook] Pedido criado no WooCommerce:', {
      woo_order_id: wooOrder.id,
      shopify_order_id: shopifyOrder.id,
      status: wooOrder.status,
      duration_ms: duration
    });

    return NextResponse.json({
      success: true,
      action: 'created',
      woo_order_id: wooOrder.id,
      shopify_order_id: shopifyOrder.id,
      status: wooOrder.status,
      items_synced: lineItems.length,
      items_not_found: notFound.length,
      duration_ms: duration
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error('❌ [Webhook] Erro ao processar webhook:', error);
    logWebhookError(error.message, undefined, {
      stack: error.stack,
      duration_ms: duration
    });

    return NextResponse.json({
      success: false,
      error: error.message,
      duration_ms: duration
    }, { status: 500 });
  }
}
