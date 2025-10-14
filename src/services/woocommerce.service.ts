import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { db } from "@/lib/db";
import type { Product } from "@/lib/types";

// Initialize WooCommerce API client
const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: true // Use query string for auth (more compatible)
});

/**
 * Fetch all products from WooCommerce and save to database
 * @returns Array of products
 */
export async function syncProducts(): Promise<Product[]> {
  console.log('🔄 Sincronizando produtos do WooCommerce...');

  try {
    const response = await wooApi.get("products", {
      per_page: 100,
      status: "publish"
    });

    const products: Product[] = response.data
      .filter((p: any) => p.images && p.images.length > 0) // Apenas produtos com imagem
      .map((p: any) => ({
        id: 0, // Will be set by database
        woo_product_id: p.id,
        sku: p.sku || `product-${p.id}`,
        name: p.name,
        price: parseFloat(p.price) || 0,
        image_url: p.images[0]?.src || ''
      }));

    // Save to database
    const stmt = db.prepare(`
      INSERT INTO products (woo_product_id, sku, name, price, image_url)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(woo_product_id) DO UPDATE SET
        name = excluded.name,
        price = excluded.price,
        image_url = excluded.image_url,
        synced_at = CURRENT_TIMESTAMP
    `);

    for (const product of products) {
      stmt.run(
        product.woo_product_id,
        product.sku,
        product.name,
        product.price,
        product.image_url
      );
    }

    console.log(`✅ ${products.length} produtos sincronizados`);
    return products;

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
