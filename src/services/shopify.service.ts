import type { Product, AnalysisResult, ShopifyProduct } from "@/lib/types";
import { db } from "@/lib/db";

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Create product in Shopify with camouflaged title and edited image
 * CRITICAL: Maintains original SKU for redirect functionality
 */
export async function createProduct(
  product: Product,
  analysis: AnalysisResult
): Promise<ShopifyProduct> {
  console.log(`🛍️ Importando produto para Shopify: ${product.sku}`);

  const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: analysis.title, // Camouflaged title
          body_html: `<p>Produto importado via Brand Camouflage System</p>`,
          vendor: 'Sua Loja',
          product_type: 'Sneakers',
          status: 'active',
          variants: [{
            sku: product.sku, // ⚠️ CRITICAL: Keep original SKU
            price: product.price.toString(),
            inventory_management: 'shopify',
            inventory_quantity: 10
          }],
          images: [{
            attachment: analysis.image // Base64 edited image
          }]
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const shopifyProduct = data.product as ShopifyProduct;

    // Update database with Shopify IDs
    const stmt = db.prepare(`
      UPDATE analyses
      SET shopify_product_id = ?,
          shopify_variant_id = ?,
          imported_at = CURRENT_TIMESTAMP
      WHERE product_id = ?
    `);

    stmt.run(
      shopifyProduct.id,
      shopifyProduct.variants[0]?.id,
      product.id
    );

    console.log(`✅ Produto importado: ${shopifyProduct.id}`);
    return shopifyProduct;

  } catch (error) {
    console.error('❌ Erro ao criar produto no Shopify:', error);
    throw new Error(
      `Failed to create Shopify product: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Update existing Shopify product
 */
export async function updateProduct(
  shopifyProductId: string,
  analysis: AnalysisResult
): Promise<ShopifyProduct> {
  const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products/${shopifyProductId}.json`;

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: analysis.title,
          images: [{
            attachment: analysis.image
          }]
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.product as ShopifyProduct;

  } catch (error) {
    console.error('❌ Erro ao atualizar produto no Shopify:', error);
    throw error;
  }
}

/**
 * Get product from Shopify by SKU
 */
export async function getProductBySku(sku: string): Promise<ShopifyProduct | null> {
  const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?fields=id,title,variants&limit=1`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    const products = data.products as ShopifyProduct[];

    // Find product with matching SKU
    const product = products.find(p =>
      p.variants.some(v => v.sku === sku)
    );

    return product || null;

  } catch (error) {
    console.error('❌ Erro ao buscar produto no Shopify:', error);
    return null;
  }
}

/**
 * Test Shopify connection
 */
export async function testConnection(): Promise<boolean> {
  const url = `${process.env.SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/shop.json`;

  try {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Shopify: Conexão OK -', data.shop.name);
      return true;
    }

    console.error('❌ Shopify: Falha na conexão:', response.status);
    return false;

  } catch (error) {
    console.error('❌ Shopify: Falha na conexão:', error);
    return false;
  }
}
