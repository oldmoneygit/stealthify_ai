import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface UpdateTitlesRequest {
  titles: {
    [product_id: string]: string; // product_id -> camouflaged_title
  };
}

/**
 * Atualiza títulos camuflados de produtos no banco de dados
 *
 * Cria ou atualiza registros na tabela analyses com os novos títulos
 */
export async function POST(request: NextRequest) {
  try {
    const body: UpdateTitlesRequest = await request.json();
    const { titles } = body;

    console.log('📝 [Update Titles] Starting update...');
    console.log(`   ${Object.keys(titles).length} titles to update`);

    let updatedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const [productId, camouflagedTitle] of Object.entries(titles)) {
      try {
        // First, try to find the product in the products table
        const product = db.prepare(`
          SELECT id FROM products
          WHERE sku LIKE ? OR woo_product_id = ? OR CAST(id AS TEXT) = ?
          LIMIT 1
        `).get(`%${productId}%`, productId, productId) as { id: number } | undefined;

        if (!product) {
          console.warn(`⚠️ Product not found in DB: ${productId}`);
          errorCount++;
          errors.push(`Product ${productId} not found`);
          continue;
        }

        // Check if an analysis record exists for this product
        const existingAnalysis = db.prepare(`
          SELECT id FROM analyses
          WHERE product_id = ?
          ORDER BY analyzed_at DESC
          LIMIT 1
        `).get(product.id) as { id: number } | undefined;

        if (existingAnalysis) {
          // Update existing analysis record
          db.prepare(`
            UPDATE analyses
            SET camouflaged_title = ?
            WHERE id = ?
          `).run(camouflagedTitle, existingAnalysis.id);

          console.log(`✅ Updated analysis ${existingAnalysis.id} for product ${productId}: "${camouflagedTitle}"`);
        } else {
          // Create new analysis record with minimal data
          // Get original product name
          const productData = db.prepare(`
            SELECT name, image_url FROM products
            WHERE id = ?
          `).get(product.id) as { name: string; image_url: string } | undefined;

          if (productData) {
            db.prepare(`
              INSERT INTO analyses (
                product_id,
                original_title,
                camouflaged_title,
                original_image_url,
                edited_image_base64,
                brands_detected,
                risk_score,
                status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              product.id,
              productData.name,
              camouflagedTitle,
              productData.image_url,
              '', // Empty for now
              '[]', // Empty array
              0,
              'clean'
            );

            console.log(`✅ Created new analysis for product ${productId}: "${camouflagedTitle}"`);
          } else {
            errorCount++;
            errors.push(`Product data not found for ${productId}`);
            continue;
          }
        }

        updatedCount++;

      } catch (error: any) {
        console.error(`❌ Error updating product ${productId}:`, error.message);
        errorCount++;
        errors.push(`${productId}: ${error.message}`);
      }
    }

    console.log(`\n✅ [Update Titles] Complete!`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      message: `${updatedCount} titles updated successfully`,
      updated_count: updatedCount,
      error_count: errorCount,
      errors: errorCount > 0 ? errors : undefined
    });

  } catch (error: any) {
    console.error('❌ [Update Titles] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Update titles failed'
    }, { status: 500 });
  }
}
