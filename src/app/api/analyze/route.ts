import { NextResponse } from 'next/server';
import { getLocalProduct } from '@/services/woocommerce.service';
import { analyzeSingleProduct } from '@/services/orchestrator.service';

/**
 * POST /api/analyze
 *
 * Analyze a single product through AI pipeline
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

    // Get product from database
    const product = getLocalProduct(productId);

    if (!product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Run pipeline
    const result = await analyzeSingleProduct(product);

    return NextResponse.json({
      success: true,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name
      },
      result
    });

  } catch (error) {
    console.error('API /analyze error:', error);

    return NextResponse.json(
      {
        error: 'Analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
