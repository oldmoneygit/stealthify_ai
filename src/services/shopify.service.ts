import type { Product, AnalysisResult, ShopifyProduct } from "@/lib/types";
import { db } from "@/lib/db";

const SHOPIFY_API_VERSION = '2024-01';

/**
 * Create product in Shopify with camouflaged title and edited image
 *
 * REGRAS ESPECÍFICAS:
 * - SKU IGUAL ao WooCommerce (CRÍTICO para redirecionamento)
 * - Título camuflado
 * - Imagem editada (sem marcas)
 * - SEM descrição (body_html vazio)
 * - Impostos: NÃO cobrar (taxable: false)
 * - Continuar vendendo sem stock (inventory_policy: continue)
 * - Stock inicial: 100 unidades
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
          title: analysis.title, // Título camuflado
          body_html: '', // SEM descrição (conforme solicitado)
          status: 'active',
          variants: [{
            sku: product.sku, // ⚠️ CRÍTICO: SKU IGUAL ao WooCommerce
            price: product.price.toString(), // Mesmo preço
            taxable: false, // NÃO cobrar impostos
            inventory_management: 'shopify',
            inventory_policy: 'continue', // Continuar vendendo sem stock
            inventory_quantity: 100, // Stock inicial: 100
            requires_shipping: true
          }],
          images: [{
            attachment: analysis.image // Imagem editada (base64)
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
 * Import ALL analyzed products to Shopify (batch)
 * Processes one at a time with 2s delay to avoid rate limiting
 */
export async function importBatch(
  onProgress?: (current: number, total: number, sku: string) => void
): Promise<{ success: number; failed: number; errors: string[] }> {
  console.log('\n🚀 Iniciando importação EM MASSA para Shopify...\n');

  // Get all analyzed products from database
  const stmt = db.prepare(`
    SELECT p.*, a.camouflaged_title, a.edited_image_base64
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.status IN ('clean', 'blur_applied')
    AND a.shopify_product_id IS NULL
    ORDER BY p.id
  `);

  const products = stmt.all() as Array<Product & { camouflaged_title: string; edited_image_base64: string }>;

  if (products.length === 0) {
    console.log('⚠️ Nenhum produto analisado encontrado para importar');
    return { success: 0, failed: 0, errors: [] };
  }

  console.log(`📦 Total de produtos a importar: ${products.length}\n`);

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    const current = i + 1;

    try {
      console.log(`\n[${current}/${products.length}] Importando: ${product.sku}`);

      if (onProgress) {
        onProgress(current, products.length, product.sku);
      }

      await createProduct(product, {
        title: product.camouflaged_title,
        image: product.edited_image_base64,
        brands_detected: [],
        risk_score: 0,
        status: 'clean'
      });

      success++;
      console.log(`✅ [${current}/${products.length}] Sucesso: ${product.sku}`);

    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${product.sku}: ${errorMsg}`);
      console.error(`❌ [${current}/${products.length}] Falhou: ${product.sku} - ${errorMsg}`);
    }

    // Delay 2s between products (avoid rate limiting)
    if (i < products.length - 1) {
      console.log('⏳ Aguardando 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 IMPORTAÇÃO EM MASSA COMPLETA!');
  console.log('='.repeat(60));
  console.log(`📊 Estatísticas:`);
  console.log(`   Total: ${products.length}`);
  console.log(`   ✅ Sucesso: ${success}`);
  console.log(`   ❌ Falhou: ${failed}`);
  console.log('');

  return { success, failed, errors };
}

/**
 * Generate Shopify CSV for manual import
 * Format: https://help.shopify.com/en/manual/products/import-export/using-csv
 */
export function generateShopifyCSV(): string {
  console.log('📄 Gerando CSV para importação Shopify...');

  // Get all analyzed products
  const stmt = db.prepare(`
    SELECT p.*, a.camouflaged_title, a.edited_image_filepath
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.status IN ('clean', 'blur_applied')
    ORDER BY p.id
  `);

  const products = stmt.all() as Array<Product & { camouflaged_title: string; edited_image_filepath: string }>;

  // CSV Header (Shopify format)
  const header = [
    'Handle',
    'Title',
    'Body (HTML)',
    'Vendor',
    'Type',
    'Tags',
    'Published',
    'Option1 Name',
    'Option1 Value',
    'Variant SKU',
    'Variant Grams',
    'Variant Inventory Tracker',
    'Variant Inventory Policy',
    'Variant Fulfillment Service',
    'Variant Price',
    'Variant Compare At Price',
    'Variant Requires Shipping',
    'Variant Taxable',
    'Variant Barcode',
    'Image Src',
    'Image Position',
    'Image Alt Text',
    'Gift Card',
    'SEO Title',
    'SEO Description',
    'Google Shopping / Google Product Category',
    'Google Shopping / Gender',
    'Google Shopping / Age Group',
    'Google Shopping / MPN',
    'Google Shopping / AdWords Grouping',
    'Google Shopping / AdWords Labels',
    'Google Shopping / Condition',
    'Google Shopping / Custom Product',
    'Google Shopping / Custom Label 0',
    'Google Shopping / Custom Label 1',
    'Google Shopping / Custom Label 2',
    'Google Shopping / Custom Label 3',
    'Google Shopping / Custom Label 4',
    'Variant Image',
    'Variant Weight Unit',
    'Variant Tax Code',
    'Cost per item',
    'Status'
  ].join(',');

  // CSV Rows
  const rows = products.map((p) => {
    const handle = p.sku.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const imagePath = p.edited_image_filepath ? `file://${p.edited_image_filepath}` : '';

    return [
      handle,                    // Handle
      p.camouflaged_title,       // Title
      '',                        // Body (HTML) - VAZIO
      '',                        // Vendor
      '',                        // Type
      '',                        // Tags
      'true',                    // Published
      'Title',                   // Option1 Name
      'Default Title',           // Option1 Value
      p.sku,                     // Variant SKU - IGUAL WooCommerce
      '0',                       // Variant Grams
      'shopify',                 // Variant Inventory Tracker
      'continue',                // Variant Inventory Policy - CONTINUAR SEM STOCK
      'manual',                  // Variant Fulfillment Service
      p.price.toString(),        // Variant Price - MESMO PREÇO
      '',                        // Variant Compare At Price
      'true',                    // Variant Requires Shipping
      'false',                   // Variant Taxable - NÃO COBRAR IMPOSTOS
      '',                        // Variant Barcode
      imagePath,                 // Image Src - IMAGEM EDITADA
      '1',                       // Image Position
      p.camouflaged_title,       // Image Alt Text
      'false',                   // Gift Card
      '',                        // SEO Title
      '',                        // SEO Description
      '',                        // Google Shopping fields...
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      imagePath,                 // Variant Image
      'kg',                      // Variant Weight Unit
      '',                        // Variant Tax Code
      '',                        // Cost per item
      'active'                   // Status
    ].map(field => {
      // Escape CSV fields
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    }).join(',');
  });

  const csv = [header, ...rows].join('\n');

  console.log(`✅ CSV gerado: ${products.length} produtos`);
  return csv;
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
