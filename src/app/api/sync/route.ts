import { NextResponse } from 'next/server';
import * as woocommerceService from '@/services/woocommerce.service';

/**
 * POST /api/sync
 *
 * Sincroniza TODOS os produtos do WooCommerce
 * - Busca com paginação automática
 * - Salva no banco de dados local
 * - Retorna total de produtos sincronizados
 */
export async function POST() {
  try {
    console.log('\n🔄 Endpoint /api/sync chamado\n');

    const products = await woocommerceService.syncProducts();

    return NextResponse.json({
      success: true,
      total: products.length,
      products: products.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        price: p.price
      })),
      message: `${products.length} produtos sincronizados com sucesso!`
    });

  } catch (error) {
    console.error('❌ Erro no endpoint /api/sync:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
