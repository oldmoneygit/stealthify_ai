/**
 * Test delete functionality
 *
 * Usage: pnpm tsx scripts/test-delete.ts [SKU]
 */

import * as storageService from '../src/services/storage.service';

async function testDelete() {
  const sku = process.argv[2];

  if (!sku) {
    console.log('❌ Uso: pnpm tsx scripts/test-delete.ts [SKU]');
    console.log('\nExemplo: pnpm tsx scripts/test-delete.ts ABC123');
    process.exit(1);
  }

  console.log(`\n🗑️ Testando deleção do SKU: ${sku}\n`);

  // Check if exists
  console.log('1️⃣ Verificando se análise existe...');
  const products = storageService.getCleanProducts();
  const exists = products.find(p => p.product.sku === sku);

  if (!exists) {
    console.log('⚠️ Nenhuma análise encontrada para este SKU');
    console.log('\n📋 SKUs disponíveis:');
    const allProducts = storageService.getRecentAnalyses(10);
    allProducts.forEach(p => {
      console.log(`  - ${p.product.sku} (${p.analysis.status})`);
    });
    process.exit(1);
  }

  console.log(`✅ Análise encontrada:`);
  console.log(`   - Nome original: ${exists.product.name}`);
  console.log(`   - Nome camuflado: ${exists.analysis.title}`);
  console.log(`   - Status: ${exists.analysis.status}`);
  console.log(`   - Risk Score: ${exists.analysis.risk_score}`);
  console.log(`   - Imagem local: ${exists.localImagePath || 'N/A'}`);

  // Delete
  console.log('\n2️⃣ Deletando análise...');
  const deleted = storageService.deleteAnalysisBySku(sku);

  if (deleted) {
    console.log('✅ Análise deletada com sucesso!');

    // Verify deletion
    console.log('\n3️⃣ Verificando deleção...');
    const productsAfter = storageService.getCleanProducts();
    const stillExists = productsAfter.find(p => p.product.sku === sku);

    if (!stillExists) {
      console.log('✅ Confirmado: análise foi removida do banco de dados');
    } else {
      console.log('❌ Erro: análise ainda existe no banco de dados');
    }

    // Show stats
    console.log('\n📊 Estatísticas atualizadas:');
    const stats = storageService.getAnalysisStats();
    console.log(`   - Total: ${stats.total}`);
    console.log(`   - Limpos: ${stats.clean}`);
    console.log(`   - Com blur: ${stats.blurApplied}`);
    console.log(`   - Falhos: ${stats.failed}`);
  } else {
    console.log('❌ Falha ao deletar análise');
  }

  console.log('\n✅ Teste concluído!\n');
}

testDelete().catch(error => {
  console.error('❌ Erro no teste:', error);
  process.exit(1);
});
