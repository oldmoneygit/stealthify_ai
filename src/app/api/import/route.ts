import { NextResponse } from 'next/server';
import { getLocalProduct } from '@/services/woocommerce.service';
import { getAnalysis } from '@/services/orchestrator.service';
import { createProduct } from '@/services/shopify.service';

/**
 * POST /api/import
 *
 * Import analyzed product to Shopify
 *
 * Body: { productId: number }
 */
export async function POST(request: Request) {
  try {
    const { productId } = await request.json() as { productId: number };

    if (!productId) {
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400 }
      );
    }

    // Get product
    const product = getLocalProduct(productId);

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Get analysis
    const analysis = getAnalysis(productId);

    if (!analysis) {
      return NextResponse.json(
        { error: 'Product not analyzed yet' },
        { status: 400 }
      );
    }

    if (analysis.status === 'failed') {
      return NextResponse.json(
        { error: 'Cannot import failed analysis' },
        { status: 400 }
      );
    }

    // Import to Shopify
    const shopifyProduct = await createProduct(product, analysis);

    return NextResponse.json({
      success: true,
      shopifyProduct
    });

  } catch (error) {
    console.error('API /import error:', error);

    return NextResponse.json(
      {
        error: 'Import failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
