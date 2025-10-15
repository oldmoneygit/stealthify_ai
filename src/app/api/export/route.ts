import { NextResponse } from 'next/server';
import * as storageService from '@/services/storage.service';
import fs from 'fs';

/**
 * GET /api/export?format=csv|json
 * Export clean products to CSV or JSON
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';

    let filename: string;
    let content: string;
    let contentType: string;

    if (format === 'json') {
      // Export to JSON
      filename = storageService.exportCleanProductsToJSON();
      content = fs.readFileSync(filename, 'utf-8');
      contentType = 'application/json';

    } else {
      // Export to CSV (Shopify format)
      filename = storageService.exportForShopify();
      content = fs.readFileSync(filename, 'utf-8');
      contentType = 'text/csv';
    }

    // Return file
    const response = new NextResponse(content);
    response.headers.set('Content-Type', contentType);
    response.headers.set('Content-Disposition', `attachment; filename="${filename.split('/').pop()}"`);

    return response;

  } catch (error) {
    console.error('API /export error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
