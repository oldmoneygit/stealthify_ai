import { NextResponse } from 'next/server';
import { getLocalProducts } from '@/services/woocommerce.service';

/**
 * GET /api/products
 *
 * Get all products from local database
 */
export async function GET() {
  try {
    const products = getLocalProducts();

    return NextResponse.json({
      success: true,
      count: products.length,
      products
    });

  } catch (error) {
    console.error('API /products error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch products',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
