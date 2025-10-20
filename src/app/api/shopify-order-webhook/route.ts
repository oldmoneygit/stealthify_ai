import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getProductByShopifyVariantId } from '@/lib/supabase';
import { createWooCommerceOrder, checkIfOrderExists, updateOrderStatus } from '@/services/woocommerce.service';
import { sendPurchaseEvent } from '@/services/facebook-capi.service';
import { getTrackingByOrderId } from '@/services/tracking-cache.service';

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
  price: string;  // Preço unitário SEM desconto
  sku: string;
  product_id: number;
  total_discount: string;  // Desconto total aplicado a este item
  discount_allocations?: Array<{
    amount: string;
    discount_application_index: number;
  }>;
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
    console.error('   Secret first 10:', secret.substring(0, 10));
    console.error('   Secret last 10:', secret.substring(secret.length - 10));
    console.error('   Body length:', body.length);
    console.error('   Body first 100:', body.substring(0, 100));
    console.error('   Body last 100:', body.substring(body.length - 100));
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
 * Extrai parâmetros de tracking do pedido Shopify
 *
 * Busca em:
 * 1. Cache (salvo pelo Custom Pixel via /api/save-tracking)
 * 2. note_attributes do pedido (se Custom Pixel salvou lá)
 *
 * @param order - Pedido Shopify
 * @returns Objeto com parâmetros de tracking (fbclid, utm_*, fbp, fbc)
 */
function extractTrackingFromOrder(order: ShopifyOrder): {
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;
  landing_url?: string;
  referrer?: string;
} {
  // 1. Tentar buscar do cache (salvo pelo Custom Pixel)
  const cachedTracking = getTrackingByOrderId(order.id.toString());

  if (cachedTracking) {
    console.log('📊 [Tracking] Dados encontrados no cache:', {
      order_id: order.id,
      has_fbclid: !!cachedTracking.fbclid,
      has_fbp: !!cachedTracking.fbp,
      utm_source: cachedTracking.utm_source
    });

    return {
      fbp: cachedTracking.fbp,
      fbc: cachedTracking.fbc,
      fbclid: cachedTracking.fbclid,
      utm_source: cachedTracking.utm_source,
      utm_campaign: cachedTracking.utm_campaign,
      utm_medium: cachedTracking.utm_medium,
      utm_term: cachedTracking.utm_term,
      utm_content: cachedTracking.utm_content,
      landing_url: cachedTracking.landing_url,
      referrer: cachedTracking.referrer
    };
  }

  // 2. Fallback: Tentar extrair de note_attributes
  const attrs = order.note_attributes || [];

  const tracking = {
    fbp: getNoteAttribute(attrs, '_tracking_fbp'),
    fbc: getNoteAttribute(attrs, '_tracking_fbc'),
    fbclid: getNoteAttribute(attrs, '_tracking_fbclid'),
    utm_source: getNoteAttribute(attrs, '_tracking_utm_source'),
    utm_campaign: getNoteAttribute(attrs, '_tracking_utm_campaign'),
    utm_medium: getNoteAttribute(attrs, '_tracking_utm_medium'),
    utm_term: getNoteAttribute(attrs, '_tracking_utm_term'),
    utm_content: getNoteAttribute(attrs, '_tracking_utm_content'),
    landing_url: getNoteAttribute(attrs, '_tracking_landing_url'),
    referrer: getNoteAttribute(attrs, '_tracking_referrer')
  };

  // Remover valores vazios
  Object.keys(tracking).forEach(key => {
    if (!tracking[key as keyof typeof tracking]) {
      delete tracking[key as keyof typeof tracking];
    }
  });

  if (Object.keys(tracking).length > 0) {
    console.log('📊 [Tracking] Dados encontrados em note_attributes:', {
      order_id: order.id,
      ...tracking
    });
  } else {
    console.warn('⚠️ [Tracking] Nenhum parâmetro de tracking encontrado para pedido:', order.id);
  }

  return tracking;
}

/**
 * Adiciona tag no pedido Shopify para evitar reprocessamento
 */
async function addShopifyOrderTag(orderId: number, tag: string): Promise<void> {
  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
  const SHOPIFY_API_VERSION = '2024-01';

  const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;

  try {
    // Primeiro, buscar tags atuais
    const getResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!getResponse.ok) {
      console.error('❌ [Webhook] Erro ao buscar pedido da Shopify:', orderId);
      return;
    }

    const { order } = await getResponse.json();
    const currentTags = order.tags ? order.tags.split(', ').filter((t: string) => t.trim()) : [];

    // Adicionar nova tag se ainda não existir
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);

      const updateResponse = await fetch(url, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          order: {
            id: orderId,
            tags: currentTags.join(', ')
          }
        })
      });

      if (!updateResponse.ok) {
        console.error('❌ [Webhook] Erro ao adicionar tag no pedido Shopify:', orderId);
      } else {
        console.log(`✅ [Webhook] Tag "${tag}" adicionada ao pedido Shopify #${orderId}`);
      }
    } else {
      console.log(`ℹ️ [Webhook] Tag "${tag}" já existe no pedido #${orderId}`);
    }
  } catch (error) {
    console.error('❌ [Webhook] Erro ao processar tag:', error);
  }
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

      // Calcular total COM desconto aplicado
      const itemSubtotal = parseFloat(item.price) * item.quantity;
      const itemDiscount = parseFloat(item.total_discount || '0');
      const itemTotal = itemSubtotal - itemDiscount;

      console.log(`   💰 Item: ${item.title}`);
      console.log(`      Subtotal: ${itemSubtotal}, Desconto: ${itemDiscount}, Total: ${itemTotal}`);

      lineItems.push({
        product_id: wooProduct.woo_product_id,
        quantity: item.quantity,
        subtotal: itemSubtotal.toFixed(2),  // Preço sem desconto
        total: itemTotal.toFixed(2)         // Preço COM desconto
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

    // 9. Disparar Facebook Purchase Event (CAPI)
    try {
      const trackingData = extractTrackingFromOrder(shopifyOrder);

      await sendPurchaseEvent({
        // User data
        email: customerEmail,
        phone: customerPhone,
        first_name: firstName,
        last_name: lastName,
        city: billingParsed.city,
        state: billingParsed.state,
        country: billingParsed.country,
        zip: billingParsed.postcode,

        // Tracking
        fbp: trackingData.fbp,
        fbc: trackingData.fbc,
        fbclid: trackingData.fbclid,
        utm_source: trackingData.utm_source,
        utm_campaign: trackingData.utm_campaign,
        utm_medium: trackingData.utm_medium,
        utm_term: trackingData.utm_term,
        utm_content: trackingData.utm_content,

        // Order
        order_id: shopifyOrder.id.toString(),
        value: parseFloat(shopifyOrder.total_price),
        currency: shopifyOrder.currency,
        content_ids: lineItems.map(item => item.product_id.toString()),
        content_type: 'product',
        num_items: lineItems.reduce((sum, item) => sum + item.quantity, 0),

        // URLs
        event_source_url: trackingData.landing_url || `https://dq3gzg-a6.myshopify.com/orders/${shopifyOrder.id}`,
        referrer_url: trackingData.referrer
      });

      console.log('✅ [Facebook CAPI] Evento Purchase enviado com sucesso');
    } catch (error: any) {
      console.error('⚠️ [Facebook CAPI] Erro ao enviar evento:', error.message);
      // NÃO bloquear a criação do pedido se CAPI falhar
      // Apenas logar o erro e continuar
    }

    // 10. Adicionar tag no Shopify para evitar reprocessamento
    await addShopifyOrderTag(shopifyOrder.id, 'woocommerce-sync');

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
