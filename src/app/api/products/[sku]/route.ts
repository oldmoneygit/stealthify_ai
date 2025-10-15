import { NextResponse } from 'next/server';
import * as storageService from '@/services/storage.service';

/**
 * DELETE /api/products/[sku]
 * Delete analysis and edited image for a product by SKU
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;

    if (!sku) {
      return NextResponse.json(
        {
          success: false,
          error: 'SKU is required'
        },
        { status: 400 }
      );
    }

    // Delete from database and file system
    const deleted = storageService.deleteAnalysisBySku(sku);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Product not found or already deleted'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Analysis for SKU ${sku} deleted successfully`
    });

  } catch (error) {
    console.error('API /products/[sku] DELETE error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
