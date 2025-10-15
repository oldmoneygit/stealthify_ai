import { NextResponse } from 'next/server';
import * as storageService from '@/services/storage.service';

/**
 * GET /api/products/edited
 * Get all edited products with their analyses
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'clean', 'blur_applied', 'failed'
    const brand = searchParams.get('brand');
    const limit = searchParams.get('limit');

    let products;

    if (brand) {
      // Filter by brand
      products = storageService.getProductsByBrand(brand);
    } else if (status === 'failed') {
      // Get failed products
      const failedProducts = storageService.getFailedProducts();
      products = failedProducts.map(item => ({
        product: item.product,
        analysis: {
          title: item.product.name,
          image: item.product.image_url,
          brands_detected: [],
          risk_score: 100,
          status: 'failed' as const
        },
        localImagePath: null,
        analyzedAt: item.analyzedAt
      }));
    } else {
      // Get ALL products with analyses (not just clean)
      if (status === 'clean') {
        products = storageService.getCleanProducts();
      } else {
        // Get all products (clean + blur_applied)
        products = storageService.getAllAnalyzedProducts();

        // Filter by status if specified
        if (status && status !== 'all') {
          products = products.filter(p => p.analysis.status === status);
        }
      }
    }

    // Apply limit if specified
    if (limit) {
      const limitNum = parseInt(limit);
      products = products.slice(0, limitNum);
    }

    const mappedProducts = products.map((item, index) => {
      const result = {
        sku: item.product.sku,
        originalName: item.product.name,
        camouflagedName: item.analysis.title,
        price: item.product.price,
        originalImage: item.product.image_url,
        editedImage: item.analysis.image,
        localImagePath: ('localImagePath' in item) ? item.localImagePath : null,
        brandsDetected: item.analysis.brands_detected,
        riskScore: item.analysis.risk_score,
        status: item.analysis.status,
        analyzedAt: item.analyzedAt
      };

      // Debug first few
      if (index < 3) {
        console.log(`📦 Product ${result.sku}:`, {
          hasEditedImage: !!result.editedImage,
          editedImageStart: result.editedImage?.substring(0, 30),
          hasLocalPath: !!result.localImagePath
        });
      }

      return result;
    });

    console.log(`✅ Returning ${mappedProducts.length} products to frontend`);

    return NextResponse.json({
      success: true,
      count: mappedProducts.length,
      products: mappedProducts
    });

  } catch (error) {
    console.error('API /products/edited error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
