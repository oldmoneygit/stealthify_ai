/**
 * Script to view stored products and analyses
 *
 * Usage: npx tsx scripts/view-storage.ts [command]
 *
 * Commands:
 *   stats       - Show analysis statistics
 *   clean       - List all clean products
 *   failed      - List failed analyses
 *   search      - Search products by SKU/name
 *   export-json - Export clean products to JSON
 *   export-csv  - Export clean products to CSV (Shopify format)
 *   recent      - Show recent analyses
 *   brand       - Show products by brand
 */

import * as storageService from '../src/services/storage.service';
import { getStorageStats } from '../src/utils/file-storage';

const command = process.argv[2] || 'stats';
const arg = process.argv[3];

console.log(`\n📊 Brand Camouflage System - Storage Viewer\n`);
console.log(`=`.repeat(60));

switch (command) {
  case 'stats': {
    console.log('\n📈 ESTATÍSTICAS GERAIS\n');

    const stats = storageService.getAnalysisStats();

    console.log(`Total de análises: ${stats.total}`);
    console.log(`  ✅ Limpas: ${stats.clean} (${Math.round(stats.clean / stats.total * 100)}%)`);
    console.log(`  ⚠️ Com blur: ${stats.blurApplied} (${Math.round(stats.blurApplied / stats.total * 100)}%)`);
    console.log(`  ❌ Falhadas: ${stats.failed} (${Math.round(stats.failed / stats.total * 100)}%)`);
    console.log(`\nRisk Score médio: ${stats.avgRiskScore}`);

    console.log(`\n🏷️ Top 10 Marcas Detectadas:\n`);
    stats.topBrands.forEach((item, index) => {
      console.log(`${index + 1}. ${item.brand}: ${item.count} produtos`);
    });

    console.log(`\n💾 ARMAZENAMENTO LOCAL\n`);
    const fileStats = getStorageStats();
    console.log(`Imagens salvas: ${fileStats.count}`);
    console.log(`Espaço total: ${fileStats.totalSizeMB} MB`);
    break;
  }

  case 'clean': {
    console.log('\n✅ PRODUTOS LIMPOS\n');

    const products = storageService.getCleanProducts();

    if (products.length === 0) {
      console.log('Nenhum produto limpo encontrado.');
      break;
    }

    console.log(`Total: ${products.length} produtos\n`);

    products.slice(0, 20).forEach((item, index) => {
      console.log(`${index + 1}. ${item.product.sku}`);
      console.log(`   Original: ${item.product.name}`);
      console.log(`   Camuflado: ${item.analysis.title}`);
      console.log(`   Marcas: ${item.analysis.brands_detected.join(', ') || 'nenhuma'}`);
      console.log(`   Risk Score: ${item.analysis.risk_score}`);
      console.log(`   Arquivo: ${item.localImagePath || 'não salvo'}`);
      console.log(`   Analisado: ${item.analyzedAt}`);
      console.log('');
    });

    if (products.length > 20) {
      console.log(`... e mais ${products.length - 20} produtos.`);
    }
    break;
  }

  case 'failed': {
    console.log('\n❌ PRODUTOS COM FALHA\n');

    const products = storageService.getFailedProducts();

    if (products.length === 0) {
      console.log('Nenhuma falha encontrada. ✅');
      break;
    }

    console.log(`Total: ${products.length} produtos\n`);

    products.forEach((item, index) => {
      console.log(`${index + 1}. ${item.product.sku} - ${item.product.name}`);
      console.log(`   Erro: ${item.error}`);
      console.log(`   Tentado em: ${item.analyzedAt}\n`);
    });
    break;
  }

  case 'search': {
    if (!arg) {
      console.log('❌ Uso: npx tsx scripts/view-storage.ts search <termo>');
      break;
    }

    console.log(`\n🔍 BUSCA: "${arg}"\n`);

    const results = storageService.searchProducts(arg);

    if (results.length === 0) {
      console.log('Nenhum resultado encontrado.');
      break;
    }

    console.log(`Encontrados: ${results.length} produtos\n`);

    results.forEach((item, index) => {
      console.log(`${index + 1}. ${item.product.sku} - ${item.product.name}`);
      if (item.analysis) {
        console.log(`   ✅ Analisado: ${item.analysis.title}`);
        console.log(`   Status: ${item.analysis.status}`);
        console.log(`   Risk Score: ${item.analysis.risk_score}`);
      } else {
        console.log(`   ⏳ Ainda não analisado`);
      }
      console.log('');
    });
    break;
  }

  case 'export-json': {
    console.log('\n📦 EXPORTANDO PARA JSON...\n');

    const filename = storageService.exportCleanProductsToJSON();
    console.log(`\n✅ Exportado com sucesso!`);
    console.log(`📁 Arquivo: ${filename}`);
    break;
  }

  case 'export-csv': {
    console.log('\n📦 EXPORTANDO PARA SHOPIFY (CSV)...\n');

    const filename = storageService.exportForShopify();
    console.log(`\n✅ Exportado com sucesso!`);
    console.log(`📁 Arquivo: ${filename}`);
    break;
  }

  case 'recent': {
    const limit = arg ? parseInt(arg) : 10;

    console.log(`\n⏰ ANÁLISES RECENTES (últimas ${limit})\n`);

    const recent = storageService.getRecentAnalyses(limit);

    if (recent.length === 0) {
      console.log('Nenhuma análise encontrada.');
      break;
    }

    recent.forEach((item, index) => {
      console.log(`${index + 1}. ${item.product.sku} - ${item.analysis.status}`);
      console.log(`   ${item.product.name} → ${item.analysis.title}`);
      console.log(`   Marcas: ${item.analysis.brands_detected.join(', ') || 'nenhuma'}`);
      console.log(`   ${item.analyzedAt}\n`);
    });
    break;
  }

  case 'brand': {
    if (!arg) {
      console.log('❌ Uso: npx tsx scripts/view-storage.ts brand <nome>');
      break;
    }

    console.log(`\n🏷️ PRODUTOS COM MARCA: "${arg}"\n`);

    const products = storageService.getProductsByBrand(arg);

    if (products.length === 0) {
      console.log(`Nenhum produto encontrado com a marca "${arg}".`);
      break;
    }

    console.log(`Total: ${products.length} produtos\n`);

    products.forEach((item, index) => {
      console.log(`${index + 1}. ${item.product.sku}`);
      console.log(`   Original: ${item.product.name}`);
      console.log(`   Camuflado: ${item.analysis.title}`);
      console.log(`   Status: ${item.analysis.status}`);
      console.log(`   Risk Score: ${item.analysis.risk_score}\n`);
    });
    break;
  }

  default:
    console.log('\n❌ Comando desconhecido.\n');
    console.log('Comandos disponíveis:');
    console.log('  stats       - Estatísticas gerais');
    console.log('  clean       - Listar produtos limpos');
    console.log('  failed      - Listar falhas');
    console.log('  search      - Buscar por SKU/nome');
    console.log('  export-json - Exportar para JSON');
    console.log('  export-csv  - Exportar para CSV (Shopify)');
    console.log('  recent      - Análises recentes');
    console.log('  brand       - Produtos por marca\n');
    break;
}

console.log(`=`.repeat(60));
console.log('');
