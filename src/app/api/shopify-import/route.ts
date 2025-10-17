import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';

/**
 * 🛍️ API ROUTE: Importar produtos para Shopify
 *
 * GET  /api/shopify-import?mode=test  - Testa conexão com Shopify
 * GET  /api/shopify-import              - Lista produtos prontos para importar
 * POST /api/shopify-import              - Importa produtos selecionados
 */

const SHOPIFY_API_VERSION = '2024-01';

/**
 * GET - Listar produtos prontos para importar ou testar conexão
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode');

    // Modo de teste de conexão
    if (mode === 'test') {
      const isConnected = await testShopifyConnection();
      return NextResponse.json({
        success: isConnected,
        message: isConnected ? 'Conexão com Shopify OK' : 'Falha ao conectar com Shopify'
      });
    }

    // Modo de sincronização com Shopify
    if (mode === 'sync') {
      const result = await syncWithShopify();
      return NextResponse.json(result);
    }

    // Listar produtos prontos para importar
    const stmt = db.prepare(`
      SELECT
        p.id as product_id,
        p.sku,
        p.name as original_name,
        p.price,
        p.image_url as original_image,
        a.camouflaged_title,
        a.edited_image_filepath,
        a.edited_image_base64,
        a.status,
        a.shopify_product_id,
        a.analyzed_at
      FROM products p
      INNER JOIN analyses a ON p.id = a.product_id
      WHERE a.status IN ('clean', 'blur_applied')
      ORDER BY p.id DESC
    `);

    const products = stmt.all();

    // Separar produtos já importados vs não importados
    const notImported = products.filter((p: any) => !p.shopify_product_id);
    const alreadyImported = products.filter((p: any) => p.shopify_product_id);

    return NextResponse.json({
      success: true,
      total: products.length,
      not_imported: notImported.length,
      already_imported: alreadyImported.length,
      products: notImported
    });

  } catch (error: any) {
    console.error('❌ Error listing products:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * POST - Importar produtos para Shopify
 *
 * Body:
 * - mode: 'single' | 'batch'
 * - product_ids: string[] (para mode single) ou vazio (para mode batch)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode = 'batch', product_ids = [] } = body;

    console.log('🛍️ [Shopify Import] Starting import:', { mode, count: product_ids.length || 'all' });

    // Validar credenciais
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return NextResponse.json({
        success: false,
        error: 'Shopify credentials not configured in .env'
      }, { status: 500 });
    }

    // Buscar produtos para importar
    let query = `
      SELECT
        p.id as product_id,
        p.sku,
        p.name as original_name,
        p.price,
        a.camouflaged_title,
        a.edited_image_filepath,
        a.edited_image_base64,
        a.shopify_product_id
      FROM products p
      INNER JOIN analyses a ON p.id = a.product_id
      WHERE a.status IN ('clean', 'blur_applied')
      AND a.shopify_product_id IS NULL
    `;

    let params: any[] = [];

    if (mode === 'single' && product_ids.length > 0) {
      const placeholders = product_ids.map(() => '?').join(',');
      query += ` AND p.id IN (${placeholders})`;
      params = product_ids;
    }

    query += ' ORDER BY p.id';

    const stmt = db.prepare(query);
    const products = stmt.all(...params) as any[];

    if (products.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No products to import',
        imported: 0,
        failed: 0
      });
    }

    console.log(`📦 [Shopify Import] Found ${products.length} products to import`);

    // Importar produtos
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];
    const importedProducts: any[] = [];

    for (const product of products) {
      try {
        console.log(`\n🔄 [${imported + failed + 1}/${products.length}] Importing: ${product.sku}`);

        // Preparar imagem (base64)
        let imageBase64 = product.edited_image_base64;

        // Se não tiver base64, tentar ler do filepath
        if (!imageBase64 && product.edited_image_filepath) {
          const imagePath = path.join(process.cwd(), product.edited_image_filepath);
          if (fs.existsSync(imagePath)) {
            const buffer = fs.readFileSync(imagePath);
            imageBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
          }
        }

        if (!imageBase64) {
          throw new Error('No edited image available');
        }

        // Importar para Shopify
        const result = await importProductToShopify({
          sku: product.sku,
          title: product.camouflaged_title,
          price: product.price,
          image: imageBase64
        });

        if (!result.success) {
          throw new Error(result.error || 'Import failed');
        }

        // Atualizar banco de dados
        const updateStmt = db.prepare(`
          UPDATE analyses
          SET shopify_product_id = ?,
              shopify_variant_id = ?,
              imported_at = datetime('now')
          WHERE product_id = ?
          AND id = (SELECT id FROM analyses WHERE product_id = ? ORDER BY analyzed_at DESC LIMIT 1)
        `);

        updateStmt.run(
          result.shopify_product_id,
          result.shopify_variant_id,
          product.product_id,
          product.product_id
        );

        imported++;
        importedProducts.push({
          sku: product.sku,
          title: product.camouflaged_title,
          shopify_product_id: result.shopify_product_id,
          shopify_url: result.shopify_url
        });

        console.log(`✅ [${imported + failed}/${products.length}] Success: ${product.sku} → ${result.shopify_product_id}`);

        // Delay entre produtos (evitar rate limit)
        if (imported + failed < products.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error: any) {
        failed++;
        const errorMsg = `${product.sku}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ [${imported + failed}/${products.length}] Failed: ${errorMsg}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 [Shopify Import] Complete!');
    console.log(`   Total: ${products.length}`);
    console.log(`   ✅ Imported: ${imported}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    return NextResponse.json({
      success: true,
      total: products.length,
      imported,
      failed,
      errors,
      products: importedProducts
    });

  } catch (error: any) {
    console.error('❌ [Shopify Import] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Helper: Importar produto individual para Shopify
 */
async function importProductToShopify(product: {
  sku: string;
  title: string;
  price: number;
  image: string; // data URI
}): Promise<{
  success: boolean;
  shopify_product_id?: string;
  shopify_variant_id?: string;
  shopify_url?: string;
  error?: string;
}> {

  const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
  const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

  try {
    // Remover prefix do base64
    const imageBase64 = product.image.includes(',')
      ? product.image.split(',')[1]
      : product.image;

    const payload = {
      product: {
        title: product.title,
        body_html: '', // Sem descrição
        status: 'active',
        variants: [
          {
            sku: product.sku, // ⚠️ CRITICAL: SKU original
            price: product.price.toFixed(2),
            taxable: false,
            inventory_management: 'shopify',
            inventory_policy: 'continue',
            inventory_quantity: 100,
            requires_shipping: true
          }
        ],
        images: [
          {
            attachment: imageBase64
          }
        ]
      }
    };

    const response = await fetch(
      `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const shopifyProduct = result.product;

    return {
      success: true,
      shopify_product_id: String(shopifyProduct.id),
      shopify_variant_id: String(shopifyProduct.variants[0]?.id),
      shopify_url: `${SHOPIFY_STORE_URL}/admin/products/${shopifyProduct.id}`
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Helper: Testar conexão com Shopify
 */
async function testShopifyConnection(): Promise<boolean> {
  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return false;
  }

  try {
    const response = await fetch(
      `${process.env.SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ [Shopify] Connection OK:', data.shop.name);
      return true;
    }

    console.error('❌ [Shopify] Connection failed:', response.status);
    return false;

  } catch (error) {
    console.error('❌ [Shopify] Connection error:', error);
    return false;
  }
}

/**
 * Helper: Sincronizar com Shopify
 * Busca todos os produtos na Shopify e verifica quais ainda existem
 * Remove do DB os produtos que foram deletados da Shopify
 */
async function syncWithShopify(): Promise<{
  success: boolean;
  message?: string;
  synced?: number;
  removed?: number;
  error?: string;
}> {
  if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
    return {
      success: false,
      error: 'Shopify credentials not configured'
    };
  }

  try {
    console.log('🔄 [Shopify Sync] Starting sync...');

    // Buscar todos os produtos com shopify_product_id no banco
    const stmt = db.prepare(`
      SELECT
        a.id as analysis_id,
        a.shopify_product_id,
        p.sku
      FROM analyses a
      INNER JOIN products p ON a.product_id = p.id
      WHERE a.shopify_product_id IS NOT NULL
    `);

    const localProducts = stmt.all() as Array<{
      analysis_id: number;
      shopify_product_id: string;
      sku: string;
    }>;

    console.log(`📦 [Shopify Sync] Found ${localProducts.length} products in local DB with Shopify IDs`);

    if (localProducts.length === 0) {
      return {
        success: true,
        message: 'No products to sync',
        synced: 0,
        removed: 0
      };
    }

    // Buscar todos os produtos na Shopify
    const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
    const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

    let allShopifyProducts: any[] = [];
    let pageInfo: string | null = null;
    let hasMore = true;

    while (hasMore) {
      let url = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250&fields=id`;

      if (pageInfo) {
        url += `&page_info=${pageInfo}`;
      }

      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      allShopifyProducts.push(...data.products);

      // Check for pagination link in headers
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextMatch = linkHeader.match(/<([^>]+page_info=([^&>]+)[^>]*)>;\s*rel="next"/);
        if (nextMatch && nextMatch[2]) {
          pageInfo = nextMatch[2];
          hasMore = true;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`🛍️ [Shopify Sync] Found ${allShopifyProducts.length} products in Shopify`);

    // Criar set de IDs que existem na Shopify
    const shopifyProductIds = new Set(
      allShopifyProducts.map(p => String(p.id))
    );

    // Verificar quais produtos locais não existem mais na Shopify
    let removed = 0;
    const updateStmt = db.prepare(`
      UPDATE analyses
      SET shopify_product_id = NULL,
          shopify_variant_id = NULL,
          imported_at = NULL
      WHERE id = ?
    `);

    for (const localProduct of localProducts) {
      if (!shopifyProductIds.has(localProduct.shopify_product_id)) {
        console.log(`🗑️  [Shopify Sync] Product ${localProduct.sku} (ID: ${localProduct.shopify_product_id}) not found in Shopify - removing from DB`);
        updateStmt.run(localProduct.analysis_id);
        removed++;
      }
    }

    const synced = localProducts.length - removed;

    console.log('✅ [Shopify Sync] Complete!');
    console.log(`   Synced: ${synced}`);
    console.log(`   Removed: ${removed}`);

    return {
      success: true,
      message: `Sync complete: ${synced} products synced, ${removed} removed`,
      synced,
      removed
    };

  } catch (error: any) {
    console.error('❌ [Shopify Sync] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
