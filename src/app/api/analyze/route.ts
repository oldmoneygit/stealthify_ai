import { NextResponse } from 'next/server';
import { getLocalProduct } from '@/services/woocommerce.service';
import { analyzeSingleProduct } from '@/services/orchestrator.service';
import { createLogger, generateRequestId } from '@/lib/browser-logger';

/**
 * POST /api/analyze
 *
 * Analyze a single product through AI pipeline
 *
 * Body: { productId: number }
 */
export async function POST(request: Request) {
  const requestId = generateRequestId();
  const logger = createLogger(requestId);

  try {
    logger.info('🎯 Iniciando análise de produto');

    const { productId } = await request.json() as { productId: number };

    if (!productId) {
      logger.error('productId não fornecido');
      return NextResponse.json(
        { error: 'productId is required' },
        { status: 400 }
      );
    }

    logger.info('📦 Buscando produto no banco de dados', { productId });

    // Get product from database
    const product = getLocalProduct(productId);

    if (!product) {
      logger.error('Produto não encontrado', { productId });
      return NextResponse.json(
        { error: 'Product not found', requestId },
        { status: 404 }
      );
    }

    logger.success('✅ Produto encontrado', {
      sku: product.sku,
      name: product.name
    });

    logger.info('🚀 Iniciando pipeline de IA');

    // Run pipeline
    const result = await analyzeSingleProduct(product);

    logger.success('🎉 Análise concluída com sucesso', {
      status: result.status,
      riskScore: result.risk_score
    });

    return NextResponse.json({
      success: true,
      requestId, // Incluir requestId na resposta
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name
      },
      analysis: result,
      logs: logger.getLogs() // Incluir logs na resposta
    });

  } catch (error) {
    logger.error('❌ Erro na análise', {
      message: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      {
        error: 'Analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId,
        logs: logger.getLogs() // Incluir logs mesmo em erro
      },
      { status: 500 }
    );
  } finally {
    // Não limpar logs imediatamente - permitir que cliente busque via polling
    // Logs serão limpos automaticamente após 10 minutos
  }
}
