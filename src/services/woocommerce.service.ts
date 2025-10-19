import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { db } from "@/lib/db";
import type { Product } from "@/lib/types";
import { wooCommerceAuthenticatedPost } from "@/lib/woo-oauth";

// Initialize WooCommerce API client
const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: true // Use query string for auth (more compatible)
});

/**
 * Fetch ALL products from WooCommerce with pagination and save to database
 * @returns Array of all products
 */
export async function syncProducts(): Promise<Product[]> {
  console.log('🔄 Sincronizando TODOS os produtos do WooCommerce...');

  try {
    const allProducts: Product[] = [];
    let page = 1;
    let hasMore = true;
    const perPage = 100; // Max per page

    while (hasMore) {
      console.log(`   📄 Buscando página ${page}...`);

      const response = await wooApi.get("products", {
        per_page: perPage,
        page: page,
        status: "publish"
      });

      const pageProducts: Product[] = response.data
        .filter((p: any) => p.images && p.images.length > 0) // Apenas produtos com imagem
        .map((p: any) => ({
          id: 0, // Will be set by database
          woo_product_id: p.id,
          sku: p.sku || `product-${p.id}`,
          name: p.name,
          price: parseFloat(p.price) || 0,
          image_url: p.images[0]?.src || ''
        }));

      allProducts.push(...pageProducts);

      console.log(`   ✅ Página ${page}: ${pageProducts.length} produtos`);

      // Check if there are more pages
      if (pageProducts.length < perPage) {
        hasMore = false;
      } else {
        page++;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log(`\n📊 Total encontrado: ${allProducts.length} produtos`);

    // Save all products to database
    console.log('💾 Salvando no banco de dados...');

    const stmt = db.prepare(`
      INSERT INTO products (woo_product_id, sku, name, price, image_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(woo_product_id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        image_url = excluded.image_url,
        synced_at = CURRENT_TIMESTAMP
    `);

    for (const product of allProducts) {
      stmt.run(
        product.woo_product_id,
        product.sku,
        product.name,
        product.price,
        product.image_url
      );
    }

    console.log(`✅ ${allProducts.length} produtos sincronizados com sucesso!\n`);
    return allProducts;

  } catch (error) {
    console.error('❌ Erro ao sincronizar produtos:', error);
    throw new Error(
      `Failed to sync WooCommerce products: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get a single product from WooCommerce
 * @param productId - WooCommerce product ID
 */
export async function getProduct(productId: number): Promise<any> {
  try {
    const response = await wooApi.get(`products/${productId}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Erro ao buscar produto ${productId}:`, error);
    throw error;
  }
}

/**
 * Get all products from local database
 */
export function getLocalProducts(): Product[] {
  const stmt = db.prepare('SELECT * FROM products ORDER BY synced_at DESC');
  return stmt.all() as Product[];
}

/**
 * Get single product from local database
 */
export function getLocalProduct(id: number): Product | undefined {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
  return stmt.get(id) as Product | undefined;
}

/**
 * Test WooCommerce connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    await wooApi.get("products", { per_page: 1 });
    console.log('✅ WooCommerce: Conexão OK');
    return true;
  } catch (error) {
    console.error('❌ WooCommerce: Falha na conexão:', error);
    return false;
  }
}

// Types for WooCommerce Order creation
export interface WooCommerceAddress {
  first_name: string;
  last_name: string;
  address_1: string;
  address_2?: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface WooCommerceLineItem {
  product_id: number;
  quantity: number;
  total?: string;
}

export interface WooCommerceOrderData {
  status: string;
  customer_id?: number;
  billing: WooCommerceAddress;
  shipping: WooCommerceAddress;
  line_items: WooCommerceLineItem[];
  meta_data?: Array<{ key: string; value: string }>;
}

export interface WooCommerceOrder {
  id: number;
  status: string;
  order_key: string;
  currency: string;
  total: string;
  date_created: string;
  billing: WooCommerceAddress;
  shipping: WooCommerceAddress;
  line_items: any[];
  meta_data: any[];
}

/**
 * Check if order already exists by Shopify order ID (idempotency)
 */
export async function checkIfOrderExists(shopifyOrderId: string): Promise<WooCommerceOrder | null> {
  try {
    const response = await wooApi.get("orders", {
      meta_key: '_shopify_order_id',
      meta_value: shopifyOrderId,
      per_page: 1
    });

    if (response.data && response.data.length > 0) {
      console.log(`✅ [WooCommerce] Pedido já existe com Shopify ID ${shopifyOrderId}:`, {
        woo_order_id: response.data[0].id,
        status: response.data[0].status
      });
      return response.data[0];
    }

    return null;
  } catch (error: any) {
    console.error('❌ [WooCommerce] Erro ao verificar pedido existente:', error.message);
    return null;
  }
}

/**
 * Update order status in WooCommerce
 */
export async function updateOrderStatus(
  orderId: number,
  status: string
): Promise<WooCommerceOrder> {
  try {
    console.log(`🔄 [WooCommerce] Atualizando status do pedido ${orderId} para "${status}"...`);

    const response = await wooApi.put(`orders/${orderId}`, { status });

    console.log(`✅ [WooCommerce] Status atualizado:`, {
      id: response.data.id,
      old_status: response.data.status,
      new_status: status
    });

    return response.data;
  } catch (error: any) {
    console.error(`❌ [WooCommerce] Erro ao atualizar status do pedido ${orderId}:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create an order in WooCommerce
 *
 * This function is used by the Shopify webhook to sync orders back to WooCommerce
 *
 * @param orderData - Order data from Shopify
 * @returns Created WooCommerce order
 */
export async function createWooCommerceOrder(
  orderData: WooCommerceOrderData
): Promise<WooCommerceOrder> {
  try {
    console.log('🛒 [WooCommerce] Criando pedido...', {
      status: orderData.status,
      items: orderData.line_items.length,
      customer: `${orderData.billing.first_name} ${orderData.billing.last_name}`
    });

    console.log('📤 [WooCommerce] Payload enviado:', JSON.stringify(orderData, null, 2));

    // Log full request details
    console.log('🔧 [WooCommerce] Request details:', {
      url: `${process.env.WOOCOMMERCE_URL}/wp-json/wc/v3/orders`,
      method: 'POST',
      consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY?.substring(0, 10) + '...',
      hasSecret: !!process.env.WOOCOMMERCE_CONSUMER_SECRET
    });

    // Usar implementação OAuth manual ao invés da biblioteca
    // A biblioteca @woocommerce/woocommerce-rest-api tem bug com POST (retorna array vazio)
    console.log('🔐 [WooCommerce] Usando implementação OAuth manual...');

    const orderCreated = await wooCommerceAuthenticatedPost<WooCommerceOrder>(
      'orders',
      orderData,
      process.env.WOOCOMMERCE_CONSUMER_KEY!,
      process.env.WOOCOMMERCE_CONSUMER_SECRET!,
      process.env.WOOCOMMERCE_URL!
    );

    // Validate response
    if (!orderCreated || !orderCreated.id) {
      console.error('❌ [WooCommerce] Resposta inválida:', orderCreated);
      throw new Error('WooCommerce API retornou resposta inválida (sem ID)');
    }

    console.log('✅ [WooCommerce] Pedido criado:', {
      id: orderCreated.id,
      order_key: orderCreated.order_key,
      total: orderCreated.total,
      status: orderCreated.status
    });

    return orderCreated as WooCommerceOrder;
  } catch (error: any) {
    console.error('❌ [WooCommerce] Erro ao criar pedido:', error.response?.data || error.message);

    // Log detailed error for debugging
    if (error.response?.data) {
      console.error('   Detalhes do erro:', JSON.stringify(error.response.data, null, 2));
    }

    throw new Error(
      `Failed to create WooCommerce order: ${
        error.response?.data?.message || error.message || 'Unknown error'
      }`
    );
  }
}
