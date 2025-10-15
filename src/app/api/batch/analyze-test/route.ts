import { NextRequest, NextResponse } from 'next/server';
import * as orchestrator from '@/services/orchestrator.service';
import { getLocalProducts } from '@/services/woocommerce.service';

/**
 * POST /api/batch/analyze-test
 *
 * Processa APENAS os primeiros 5 produtos (para teste)
 * - 1 produto de cada vez (sequencial)
 * - Delay de 2s entre cada produto
 */
export async function POST(request: NextRequest) {
  console.log('\n🧪 Iniciando processamento de TESTE (5 produtos)...\n');

  // Get all products from database
  const allProducts = getLocalProducts();

  if (allProducts.length === 0) {
    return NextResponse.json(
      { error: 'Nenhum produto encontrado. Execute /api/sync primeiro.' },
      { status: 400 }
    );
  }

  // Get only first 5 products
  const products = allProducts.slice(0, 5);

  console.log(`📦 Total de produtos a processar (TESTE): ${products.length}\n`);
  console.log('Produtos selecionados:');
  products.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.sku} - ${p.name}`);
  });
  console.log('');

  // Process products sequentially with 2s delay
  const results = await orchestrator.analyzeBatch(products, (current, total, result) => {
    // Progress callback
    const percentage = Math.round((current / total) * 100);
    console.log(`\n📊 Progresso: ${current}/${total} (${percentage}%) - Status: ${result.status}`);
  });

  // Count results
  const stats = {
    total: results.length,
    clean: results.filter(r => r.status === 'clean').length,
    blurApplied: results.filter(r => r.status === 'blur_applied').length,
    failed: results.filter(r => r.status === 'failed').length
  };

  console.log('\n' + '='.repeat(60));
  console.log('🎉 TESTE COMPLETO!');
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
    products: results.map((r, i) => ({
      sku: products[i]?.sku,
      status: r.status,
      brands_detected: r.brands_detected,
      risk_score: r.risk_score
    })),
    message: `${stats.total} produtos de teste processados!`
  });
}
