import { NextResponse } from 'next/server';
import { createWooCommerceOrder } from '@/services/woocommerce.service';
import { getProductByShopifyVariantId } from '@/lib/supabase';

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
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  line_items: Array<{
    id: number;
    variant_id: number;
    title: string;
    quantity: number;
    price: string;
    sku: string;
  }>;
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

      lineItems.push({
        product_id: mapping.woo_product_id,
        quantity: item.quantity,
        total: (parseFloat(item.price) * item.quantity).toFixed(2)
      });
    }

    if (lineItems.length === 0) {
      console.error(`❌ Nenhum produto mapeado para pedido #${order.order_number}`);
      return { success: false, error: 'No mapped products' };
    }

    // 3. Extrair dados do cliente de note_attributes
    const firstName = getNoteAttribute(order.note_attributes, 'billing_first_name') ||
                      order.customer?.first_name ||
                      order.billing_address?.first_name ||
                      'Cliente';  // Fallback se vazio

    const lastName = getNoteAttribute(order.note_attributes, 'billing_last_name') ||
                     order.customer?.last_name ||
                     order.billing_address?.last_name ||
                     'Shopify';  // Fallback se vazio

    const email = order.customer?.email ||
                  order.email ||
                  `pedido-${order.order_number}@shopify.snkhouse.com`;  // ✅ Email padrão (WooCommerce exige)

    const phone = getNoteAttribute(order.note_attributes, 'billing_phone') ||
                  order.billing_address?.phone ||
                  '0000000000';  // Fallback se vazio

    // 4. Construir endereços
    const streetName = getNoteAttribute(order.note_attributes, 'billing_street_name');
    const streetNumber = getNoteAttribute(order.note_attributes, 'billing_street_number');

    const billingAddress = {
      first_name: firstName,
      last_name: lastName,
      company: '',
      address_1: streetName && streetNumber ? `${streetName}, ${streetNumber}` : (order.billing_address?.address1 || 'Endereço não informado'),
      address_2: getNoteAttribute(order.note_attributes, 'billing_street_complement') || (order.billing_address?.address2 || ''),
      city: getNoteAttribute(order.note_attributes, 'billing_city') || (order.billing_address?.city || 'Cidade não informada'),
      state: getNoteAttribute(order.note_attributes, 'billing_state') || (order.billing_address?.province_code || 'SP'),
      postcode: getNoteAttribute(order.note_attributes, 'billing_postcode') || (order.billing_address?.zip || '00000-000'),
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

    // 6. Adicionar tag no Shopify
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
