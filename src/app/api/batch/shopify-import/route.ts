import { NextResponse } from 'next/server';
import * as shopifyService from '@/services/shopify.service';

/**
 * POST /api/batch/shopify-import
 *
 * Importa TODOS os produtos analisados para Shopify
 * - 1 produto de cada vez (sequencial)
 * - Delay de 2s entre cada produto
 * - SKU igual, título/imagem camuflados
 * - Stock=100, impostos=false, continuar vendendo=true
 */
export async function POST() {
  console.log('\n🛍️ Iniciando importação SHOPIFY EM MASSA...\n');

  try {
    const result = await shopifyService.importBatch((current, total, sku) => {
      console.log(`📊 Progresso: ${current}/${total} - ${sku}`);
    });

    return NextResponse.json({
      success: true,
      stats: {
        success: result.success,
        failed: result.failed,
        total: result.success + result.failed
      },
      errors: result.errors,
      message: `${result.success} produtos importados com sucesso!`
    });

  } catch (error) {
    console.error('❌ Erro na importação:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
