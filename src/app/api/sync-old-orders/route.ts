import { NextResponse } from 'next/server';
import { createWooCommerceOrder } from '@/services/woocommerce.service';
import { getProductByShopifyVariantId } from '@/lib/supabase';
import { sendPurchaseEvent } from '@/services/facebook-capi.service';
import { getTrackingByOrderId } from '@/services/tracking-cache.service';

/**
 * 🔄 API ROUTE: Sync Old Shopify Orders → WooCommerce
 *
 * POST /api/sync-old-orders
 *
 * Este endpoint busca pedidos antigos da Shopify e sincroniza com WooCommerce
 * Usa tags no Shopify para evitar duplicação
 *
 * Execução:
 * - Manual: POST /api/sync-old-orders
 * - Automática: Vercel Cron (a cada hora)
 */

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;
const SHOPIFY_API_VERSION = '2024-01';

interface ShopifyOrderResponse {
  orders: ShopifyOrder[];
}

interface ShopifyOrder {
  id: number;
  order_number: number;
  email: string;
  created_at: string;
  total_price: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  line_items: Array<{
    id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;  // Preço unitário SEM desconto
    sku: string;
    total_discount: string;  // Desconto total aplicado a este item
    discount_allocations?: Array<{
      amount: string;
      discount_application_index: number;
    }>;
  }>;
  total_discounts: string;  // Desconto total do pedido
  subtotal_price: string;   // Subtotal (sem shipping/taxas)
  customer: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
  billing_address: any;
  shipping_address: any;
  note_attributes?: Array<{ name: string; value: string }>;
}

/**
 * Busca pedidos da Shopify
 */
async function fetchShopifyOrders(limit = 250): Promise<ShopifyOrder[]> {
  const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders.json?status=any&limit=${limit}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const data: ShopifyOrderResponse = await response.json();
  return data.orders || [];
}


/**
 * Busca nome e telefone REAIS do cliente nos EVENTS do pedido
 * (onde está registrado quem fez o pedido e recebeu SMS)
 */
async function fetchCustomerDataFromEvents(orderId: number): Promise<{
  first_name: string;
  last_name: string;
  phone: string | null;
} | null> {
  try {
    const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}/events.json`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Não foi possível buscar events do pedido ${orderId}`);
      return null;
    }

    const data = await response.json();
    const events = data.events || [];

    let fullName: string | null = null;
    let phone: string | null = null;

    // Procurar nome e telefone nos events
    for (const event of events) {
      const message = event.message || '';

      // Padrão 1: "SMS was sent to [NOME] ([TELEFONE])"
      const smsMatch = message.match(/SMS was sent to (.+?) \(([+\d\s\-]+)\)/i);
      if (smsMatch) {
        fullName = smsMatch[1].trim();
        phone = smsMatch[2].trim();
        console.log(`   📱 SMS enviado para: "${fullName}" (${phone})`);
        break;
      }

      // Padrão 2: "[NOME] placed this order"
      const placedMatch = message.match(/^(.+?) placed this order/i);
      if (placedMatch) {
        fullName = placedMatch[1].trim();
        console.log(`   📦 Pedido feito por: "${fullName}"`);
        // Continuar procurando por SMS para pegar telefone
      }
    }

    if (!fullName) {
      console.warn(`   ⚠️ Nome do cliente não encontrado nos events`);
      return null;
    }

    // Parsear nome completo em first_name e last_name
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Shopify';

    console.log(`   ✅ Nome extraído dos events: "${fullName}" → ${firstName} ${lastName}`);

    return {
      first_name: firstName,
      last_name: lastName,
      phone: phone
    };

  } catch (error) {
    console.error(`❌ Erro ao buscar events:`, error);
    return null;
  }
}

/**
 * Adiciona tag no pedido Shopify
 */
async function addShopifyOrderTag(orderId: number, tag: string): Promise<void> {
  const url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/orders/${orderId}.json`;

  // Primeiro, buscar tags atuais
  const getResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!getResponse.ok) {
    console.error('❌ Erro ao buscar pedido da Shopify:', orderId);
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
      console.error('❌ Erro ao adicionar tag no pedido Shopify:', orderId);
    } else {
      console.log(`✅ Tag "${tag}" adicionada ao pedido Shopify #${orderId}`);
    }
  }
}

/**
 * Verifica se pedido tem tag específica
 */
function hasTag(order: ShopifyOrder, tag: string): boolean {
  if (!order.tags) return false;
  const tags = order.tags.split(',').map(t => t.trim().toLowerCase());
  return tags.includes(tag.toLowerCase());
}

/**
 * Helper: Extrai valor de note_attributes
 */
function getNoteAttribute(
  noteAttributes: Array<{ name: string; value: string }> | undefined,
  key: string
): string {
  if (!noteAttributes) return '';
  const attr = noteAttributes.find(a => a.name === key);
  return attr?.value || '';
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
 * Processa um pedido da Shopify
 *
 * ✅ LÓGICA SIMPLES:
 * 1. Se pedido JÁ TEM tag 'woocommerce-sync' → PULAR (já sincronizado)
 * 2. Se pedido NÃO TEM tag → CRIAR no WooCommerce + ADICIONAR tag
 *
 * A TAG é a fonte da verdade! Não precisa verificar WooCommerce.
 */
async function processShopifyOrder(order: ShopifyOrder): Promise<{
  success: boolean;
  orderId?: number;
  error?: string;
  skipped?: boolean;
}> {
  try {
    console.log(`📦 Processando pedido Shopify #${order.order_number} (ID: ${order.id})`);

    // 1. Verificar se pedido JÁ TEM tag (fonte da verdade)
    if (hasTag(order, 'woocommerce-sync')) {
      console.log(`⏭️ Pedido #${order.order_number} já tem tag 'woocommerce-sync', pulando...`);
      return { success: true, skipped: true };
    }

    console.log(`✅ Pedido #${order.order_number} SEM tag, criando no WooCommerce...`);

    // 2. Mapear produtos
    const lineItems = [];
    for (const item of order.line_items) {
      const mapping = await getProductByShopifyVariantId(item.variant_id.toString());

      if (!mapping) {
        console.warn(`⚠️ Produto não mapeado: SKU ${item.sku} (Variant ID: ${item.variant_id})`);
        continue;
      }

      // Calcular total COM desconto aplicado
      const itemSubtotal = parseFloat(item.price) * item.quantity;
      const itemDiscount = parseFloat(item.total_discount || '0');
      const itemTotal = itemSubtotal - itemDiscount;

      console.log(`   💰 Item: ${item.title} - Subtotal: ${itemSubtotal}, Desconto: ${itemDiscount}, Total: ${itemTotal}`);

      lineItems.push({
        product_id: mapping.woo_product_id,
        quantity: item.quantity,
        subtotal: itemSubtotal.toFixed(2),  // Preço sem desconto
        total: itemTotal.toFixed(2)         // Preço COM desconto
      });
    }

    if (lineItems.length === 0) {
      console.error(`❌ Nenhum produto mapeado para pedido #${order.order_number}`);
      return { success: false, error: 'No mapped products' };
    }

    // 3. 🎯 DADOS DO CLIENTE
    // ✅ PRIORIDADE ATUALIZADA:
    // 1º Events (quem fez o pedido e recebeu SMS) - NOME e TELEFONE REAIS
    // 2º order.customer
    // 3º order.billing_address
    // 4º fallback

    console.log(`👤 Extraindo dados do cliente do pedido #${order.order_number}...`);

    // ✅ BUSCAR NOME e TELEFONE NOS EVENTS (mensagens do sistema)
    const eventsData = await fetchCustomerDataFromEvents(order.id);

    // Nome do cliente (PRIORIZAR events!)
    const firstName = eventsData?.first_name ||
                     order.customer?.first_name ||
                     order.billing_address?.first_name ||
                     'Cliente';
    const lastName = eventsData?.last_name ||
                    order.customer?.last_name ||
                    order.billing_address?.last_name ||
                    'Shopify';

    // Email: tentar pegar do pedido, customer ou billing
    const email = order.email ||
                 order.customer?.email ||
                 order.billing_address?.email ||
                 `pedido-${order.order_number}@shopify.snkhouse.com`;

    // Telefone (PRIORIZAR events, depois billing/shipping)
    const phone = eventsData?.phone ||
                 order.billing_address?.phone ||
                 order.shipping_address?.phone ||
                 '';

    console.log(`   ✅ Cliente: ${firstName} ${lastName}`);
    console.log(`   ✅ Email: ${email}`);
    console.log(`   ✅ Telefone: ${phone || '(não informado)'}`);

    // 4. Construir endereços a partir de note_attributes (dados brasileiros)
    const streetName = getNoteAttribute(order.note_attributes, 'billing_street_name');
    const streetNumber = getNoteAttribute(order.note_attributes, 'billing_street_number');
    const streetComplement = getNoteAttribute(order.note_attributes, 'billing_street_complement');
    const neighborhood = getNoteAttribute(order.note_attributes, 'billing_neighborhood');
    const city = getNoteAttribute(order.note_attributes, 'billing_city');
    const state = getNoteAttribute(order.note_attributes, 'billing_state');
    const postcode = getNoteAttribute(order.note_attributes, 'billing_postcode');

    // Construir address_1 e address_2
    const address_1 = (streetName && streetNumber)
      ? `${streetName}, ${streetNumber}`
      : (order.billing_address?.address1 || 'Endereço não informado');

    const address_2 = streetComplement ||
                     (neighborhood && neighborhood !== 'Bairro Não Informado' ? neighborhood : '') ||
                     order.billing_address?.address2 ||
                     '';

    const billingAddress = {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1,
      address_2,
      city: city || order.billing_address?.city || 'Cidade não informada',
      state: state || order.billing_address?.province_code || 'SP',
      postcode: postcode || order.billing_address?.zip || '00000-000',
      country: order.billing_address?.country_code || 'BR',
      email: email,
      phone: phone
    };

    const shippingAddress = { ...billingAddress };

    // 5. Criar pedido no WooCommerce
    const wooOrder = await createWooCommerceOrder({
      status: 'processing',
      customer_id: 0,
      billing: billingAddress,
      shipping: shippingAddress,
      line_items: lineItems,
      payment_method: 'shopify_sync',
      payment_method_title: 'Pedido Shopify (Sincronização Automática)',
      customer_note: `Pedido Shopify #${order.order_number}`,
      meta_data: [
        { key: '_shopify_order_id', value: order.id.toString() },
        { key: '_shopify_order_number', value: order.order_number.toString() },
        { key: '_sync_source', value: 'periodic_sync' }
      ]
    });

    console.log(`✅ Pedido WooCommerce criado: #${wooOrder.id}`);

    // 6. Disparar Facebook Purchase Event (CAPI)
    try {
      const trackingData = extractTrackingFromOrder(order);

      await sendPurchaseEvent({
        // User data
        email,
        phone,
        first_name: firstName,
        last_name: lastName,
        city: billingAddress.city,
        state: billingAddress.state,
        country: billingAddress.country,
        zip: billingAddress.postcode,

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
        order_id: order.id.toString(),
        value: parseFloat(order.total_price),
        currency: order.currency,
        content_ids: lineItems.map(item => item.product_id.toString()),
        content_type: 'product',
        num_items: lineItems.reduce((sum, item) => sum + item.quantity, 0),

        // URLs
        event_source_url: trackingData.landing_url || `https://dq3gzg-a6.myshopify.com/orders/${order.id}`,
        referrer_url: trackingData.referrer
      });

      console.log('✅ [Facebook CAPI] Evento Purchase enviado');
    } catch (error: any) {
      console.error('⚠️ [Facebook CAPI] Erro:', error.message);
      // Não bloquear se CAPI falhar
    }

    // 7. Adicionar tag no Shopify
    await addShopifyOrderTag(order.id, 'woocommerce-sync');

    return { success: true, orderId: wooOrder.id };

  } catch (error) {
    console.error(`❌ Erro ao processar pedido #${order.order_number}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Main sync logic (shared between GET and POST)
 */
async function executeSyncLogic(authHeader: string | null) {
  const startTime = Date.now();

  try {
    console.log('🔄 [Sync] Iniciando sincronização de pedidos antigos...');

    // Validar autenticação
    const CRON_SECRET = process.env.CRON_SECRET || 'your-secret-here';

    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      console.warn('⚠️ Tentativa de acesso não autorizado');
      return NextResponse.json({
        success: false,
        error: 'Unauthorized'
      }, { status: 401 });
    }

    // 1. Buscar pedidos da Shopify
    console.log('📥 Buscando pedidos da Shopify...');
    const orders = await fetchShopifyOrders(250);
    console.log(`✅ ${orders.length} pedidos encontrados na Shopify`);

    // 2. Filtrar pedidos que NÃO têm a tag 'woocommerce-sync'
    const ordersToSync = orders.filter(order => !hasTag(order, 'woocommerce-sync'));
    console.log(`📋 ${ordersToSync.length} pedidos precisam ser sincronizados`);

    if (ordersToSync.length === 0) {
      const duration = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        message: 'All orders are already synced',
        stats: {
          total_orders: orders.length,
          already_synced: orders.length,
          synced_now: 0,
          failed: 0,
          duration_ms: duration
        }
      });
    }

    // 3. Processar cada pedido
    const results = {
      synced: [] as number[],
      failed: [] as { order_id: number; error: string }[]
    };

    for (const order of ordersToSync) {
      const result = await processShopifyOrder(order);

      if (result.success) {
        results.synced.push(order.id);
      } else {
        results.failed.push({
          order_id: order.id,
          error: result.error || 'Unknown error'
        });
      }

      // Pequeno delay para não sobrecarregar APIs
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const duration = Date.now() - startTime;

    console.log('✅ [Sync] Sincronização concluída!');
    console.log(`   Sincronizados: ${results.synced.length}`);
    console.log(`   Falharam: ${results.failed.length}`);
    console.log(`   Duração: ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Sync completed',
      stats: {
        total_orders: orders.length,
        already_synced: orders.length - ordersToSync.length,
        synced_now: results.synced.length,
        failed: results.failed.length,
        duration_ms: duration
      },
      results
    });

  } catch (error) {
    console.error('❌ [Sync] Erro fatal:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST handler (manual calls)
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  return executeSyncLogic(authHeader);
}

/**
 * GET handler (Vercel Cron calls)
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  return executeSyncLogic(authHeader);
}
