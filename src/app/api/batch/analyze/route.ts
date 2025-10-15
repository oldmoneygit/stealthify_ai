import { NextRequest, NextResponse } from 'next/server';
import * as orchestrator from '@/services/orchestrator.service';
import { getLocalProducts } from '@/services/woocommerce.service';

/**
 * POST /api/batch/analyze
 *
 * Processa TODOS os produtos em massa (batch)
 * - 1 produto de cada vez (sequencial)
 * - Delay de 2s entre cada produto
 * - Retorna progresso em tempo real via Server-Sent Events (SSE)
 */
export async function POST(request: NextRequest) {
  console.log('\n🚀 Iniciando processamento EM MASSA...\n');

  // Get all products from database
  const products = getLocalProducts();

  if (products.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum produto encontrado. Execute /api/sync primeiro.' },
      { status: 400 }
    );
  }

  console.log(`📦 Total de produtos a processar: ${products.length}\n`);

  // Process products sequentially with 2s delay
  const results = await orchestrator.analyzeBatch(products, (current, total, result) => {
    // Progress callback
    const percentage = Math.round((current / total) * 100);
    console.log(`\n📊 Progresso: ${current}/${total} (${percentage}%) - SKU: ${result.title}`);
  });

  // Count results
  const stats = {
    total: results.length,
    clean: results.filter(r => r.status === 'clean').length,
    blurApplied: results.filter(r => r.status === 'blur_applied').length,
    failed: results.filter(r => r.status === 'failed').length
  };

  console.log('\n' + '='.repeat(60));
  console.log('🎉 BATCH PROCESSAMENTO COMPLETO!');
  console.log('='.repeat(60));
  console.log(`📊 Estatísticas:`);
  console.log(`   Total: ${stats.total}`);
  console.log(`   ✅ Clean: ${stats.clean}`);
  console.log(`   ⚠️ Blur aplicado: ${stats.blurApplied}`);
  console.log(`   ❌ Falhou: ${stats.failed}`);
  console.log('');

  return NextResponse.json({
    success: true,
    stats,
    message: `${stats.total} produtos processados com sucesso!`
  });
}
