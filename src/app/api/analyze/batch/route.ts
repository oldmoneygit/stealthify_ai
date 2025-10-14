import { NextResponse } from 'next/server';
import { getLocalProducts } from '@/services/woocommerce.service';
import { analyzeBatch } from '@/services/orchestrator.service';

/**
 * POST /api/analyze/batch
 *
 * Analyze multiple products
 *
 * Body: { productIds: number[] } or { all: true }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { productIds?: number[]; all?: boolean };

    let products;

    if (body.all) {
      // Analyze all products
      products = getLocalProducts();
    } else if (body.productIds && Array.isArray(body.productIds)) {
      // Analyze specific products
      const allProducts = getLocalProducts();
      products = allProducts.filter(p => body.productIds!.includes(p.id));
    } else {
      return NextResponse.json(
        { error: 'Either productIds or all=true is required' },
        { status: 400 }
      );
    }

    if (products.length === 0) {
      return NextResponse.json(
        { error: 'No products found' },
        { status: 404 }
      );
    }

    // Run batch pipeline
    const results = await analyzeBatch(products);

    return NextResponse.json({
      success: true,
      count: results.length,
      results: results.map((result, i) => ({
        product: {
          id: products[i]!.id,
          sku: products[i]!.sku,
          name: products[i]!.name
        },
        result
      }))
    });

  } catch (error) {
    console.error('API /analyze/batch error:', error);

    return NextResponse.json(
      {
        error: 'Batch analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
