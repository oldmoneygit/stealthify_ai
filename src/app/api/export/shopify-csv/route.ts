import { NextResponse } from 'next/server';
import * as shopifyService from '@/services/shopify.service';

/**
 * GET /api/export/shopify-csv
 *
 * Gera CSV no formato Shopify para importação manual
 * Inclui todos os produtos analisados com:
 * - SKU igual
 * - Título camuflado
 * - Imagem editada
 * - Stock=100, impostos=false, continuar vendendo=true
 */
export async function GET() {
  try {
    const csv = shopifyService.generateShopifyCSV();

    // Return CSV file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="shopify-products.csv"'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao gerar CSV:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
