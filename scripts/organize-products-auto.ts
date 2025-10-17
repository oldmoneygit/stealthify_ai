/**
 * 📁 ORGANIZE PRODUCTS - Sistema Automático de Organização
 *
 * Organiza produtos editados em categorias para upload estratégico no Shopify
 *
 * Categorias:
 * - ready-to-upload/batch-X: Produtos seguros (risk < 40)
 * - needs-review: Produtos na zona de risco (40-60)
 * - failed: Falhas críticas
 * - archived: Já importados no Shopify
 *
 * Uso:
 *   npx tsx scripts/organize-products-auto.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';

interface ProductAnalysis {
  id: number;
  product_id: number;
  sku: string;
  name: string;
  risk_score: number;
  status: 'clean' | 'blur_applied' | 'failed';
  edited_image_filepath: string | null;
  shopify_product_id: string | null;
  brands_detected: string;
  analyzed_at: string;
}

interface OrganizationStats {
  readyToUpload: number;
  needsReview: number;
  failed: number;
  archived: number;
  totalBatches: number;
}

const BATCH_SIZE = 20; // Produtos por batch
const BASE_DIR = 'public/products';

async function organizeProducts(): Promise<void> {
  console.log('📁 SISTEMA DE ORGANIZAÇÃO AUTOMÁTICA');
  console.log('=====================================\n');

  // 1. Buscar todas as análises do banco
  console.log('📊 Buscando produtos analisados...');

  const analyses = db.prepare(`
    SELECT
      a.id,
      a.product_id,
      p.sku,
      p.name,
      a.risk_score,
      a.status,
      a.edited_image_filepath,
      a.shopify_product_id,
      a.brands_detected,
      a.analyzed_at
    FROM analyses a
    JOIN products p ON a.product_id = p.id
    ORDER BY a.analyzed_at DESC
  `).all() as ProductAnalysis[];

  console.log(`   ✅ Total de análises: ${analyses.length}`);

  if (analyses.length === 0) {
    console.log('\n⚠️  Nenhum produto analisado encontrado.');
    console.log('   Execute o pipeline de análise primeiro: pnpm analyze');
    return;
  }

  // 2. Categorizar produtos
  console.log('\n🔍 Categorizando produtos...');

  const categories = {
    readyToUpload: [] as ProductAnalysis[],
    needsReview: [] as ProductAnalysis[],
    failed: [] as ProductAnalysis[],
    archived: [] as ProductAnalysis[]
  };

  for (const analysis of analyses) {
    if (analysis.shopify_product_id) {
      // Já importado no Shopify
      categories.archived.push(analysis);
    } else if (analysis.status === 'failed') {
      // Falha crítica
      categories.failed.push(analysis);
    } else if (analysis.risk_score >= 40 && analysis.risk_score < 60) {
      // Zona de risco - precisa revisão manual
      categories.needsReview.push(analysis);
    } else if (analysis.risk_score < 40) {
      // Seguro para upload
      categories.readyToUpload.push(analysis);
    } else {
      // Risk Score >= 60 - muito arriscado
      categories.failed.push(analysis);
    }
  }

  // 3. Exibir estatísticas
  const totalBatches = Math.ceil(categories.readyToUpload.length / BATCH_SIZE);

  console.log('\n📊 ESTATÍSTICAS:');
  console.log('─────────────────────────────────────');
  console.log(`   ✅ Prontos para upload: ${categories.readyToUpload.length}`);
  console.log(`      └─ Divididos em ${totalBatches} batches de ${BATCH_SIZE}`);
  console.log(`   ⚠️  Precisam revisão: ${categories.needsReview.length}`);
  console.log(`   ❌ Falhas: ${categories.failed.length}`);
  console.log(`   📦 Já arquivados: ${categories.archived.length}`);
  console.log('─────────────────────────────────────');

  // 4. Criar estrutura de pastas
  console.log('\n📂 Criando estrutura de pastas...');

  const folders = [
    path.join(BASE_DIR, 'needs-review'),
    path.join(BASE_DIR, 'failed'),
    path.join(BASE_DIR, 'archived')
  ];

  // Criar pastas de batches
  for (let i = 1; i <= totalBatches; i++) {
    folders.push(path.join(BASE_DIR, `ready-to-upload/batch-${i}`));
  }

  for (const folder of folders) {
    await fs.mkdir(folder, { recursive: true });
  }

  console.log(`   ✅ ${folders.length} pastas criadas/verificadas`);

  // 5. Mover/copiar arquivos
  console.log('\n📦 Organizando arquivos...\n');

  let movedCount = 0;
  let skippedCount = 0;

  // 5.1 Ready to upload (dividir em batches)
  console.log('✅ PRONTOS PARA UPLOAD:');
  for (let i = 0; i < categories.readyToUpload.length; i++) {
    const product = categories.readyToUpload[i];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchDir = path.join(BASE_DIR, `ready-to-upload/batch-${batchNum}`);

    if (product.edited_image_filepath) {
      try {
        // Verificar se arquivo fonte existe
        await fs.access(product.edited_image_filepath);

        const dest = path.join(batchDir, `${product.sku}.jpg`);
        await fs.copyFile(product.edited_image_filepath, dest);

        console.log(`   ✅ ${product.sku} → batch-${batchNum} (risk: ${product.risk_score})`);
        movedCount++;
      } catch (error) {
        console.log(`   ⚠️  ${product.sku} → arquivo não encontrado`);
        skippedCount++;
      }
    } else {
      console.log(`   ⚠️  ${product.sku} → sem filepath no banco`);
      skippedCount++;
    }
  }

  // 5.2 Needs review
  if (categories.needsReview.length > 0) {
    console.log('\n⚠️  PRECISAM REVISÃO MANUAL:');
    for (const product of categories.needsReview) {
      if (product.edited_image_filepath) {
        try {
          await fs.access(product.edited_image_filepath);

          const brands = JSON.parse(product.brands_detected).join('_');
          const dest = path.join(
            BASE_DIR,
            'needs-review',
            `${product.sku}-risk${product.risk_score}-${brands}.jpg`
          );
          await fs.copyFile(product.edited_image_filepath, dest);

          console.log(`   ⚠️  ${product.sku} → needs-review (risk: ${product.risk_score}, brands: ${brands})`);
          movedCount++;
        } catch (error) {
          console.log(`   ❌ ${product.sku} → arquivo não encontrado`);
          skippedCount++;
        }
      }
    }
  }

  // 5.3 Failed
  if (categories.failed.length > 0) {
    console.log('\n❌ FALHAS:');
    for (const product of categories.failed) {
      if (product.edited_image_filepath) {
        try {
          await fs.access(product.edited_image_filepath);

          const dest = path.join(BASE_DIR, 'failed', `${product.sku}-${product.status}.jpg`);
          await fs.copyFile(product.edited_image_filepath, dest);

          console.log(`   ❌ ${product.sku} → failed (status: ${product.status})`);
          movedCount++;
        } catch (error) {
          console.log(`   ⚠️  ${product.sku} → arquivo não encontrado`);
          skippedCount++;
        }
      }
    }
  }

  // 5.4 Archived (já importados)
  if (categories.archived.length > 0) {
    console.log('\n📦 ARQUIVADOS (já no Shopify):');
    const today = new Date().toISOString().split('T')[0];
    const archiveDir = path.join(BASE_DIR, 'archived', today);
    await fs.mkdir(archiveDir, { recursive: true });

    for (const product of categories.archived) {
      if (product.edited_image_filepath) {
        try {
          await fs.access(product.edited_image_filepath);

          const dest = path.join(
            archiveDir,
            `${product.sku}-shopify-${product.shopify_product_id}.jpg`
          );
          await fs.copyFile(product.edited_image_filepath, dest);

          console.log(`   📦 ${product.sku} → archived (Shopify: ${product.shopify_product_id})`);
          movedCount++;
        } catch (error) {
          skippedCount++;
        }
      }
    }
  }

  // 6. Resumo final
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMO DA ORGANIZAÇÃO:');
  console.log('='.repeat(50));
  console.log(`   ✅ Arquivos organizados: ${movedCount}`);
  console.log(`   ⚠️  Arquivos não encontrados: ${skippedCount}`);
  console.log(`   📁 Total de batches: ${totalBatches}`);
  console.log('='.repeat(50));

  // 7. Próximos passos
  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('─────────────────────────────────────');

  if (categories.needsReview.length > 0) {
    console.log(`\n1. 🔍 REVISAR MANUALMENTE:`);
    console.log(`   → ${categories.needsReview.length} produtos em: public/products/needs-review/`);
    console.log(`   → Produtos com risk score 40-60 precisam validação visual`);
    console.log(`   → Abrir no navegador e verificar se logos estão visíveis`);
  }

  if (categories.readyToUpload.length > 0) {
    console.log(`\n2. 📤 UPLOAD ESTRATÉGICO (Anti-Detecção Shopify):`);
    console.log(`   → Batch 1: ${Math.min(BATCH_SIZE, categories.readyToUpload.length)} produtos`);
    console.log(`   → Localização: public/products/ready-to-upload/batch-1/`);
    console.log(`   → Aguardar 1 semana antes de batch 2`);
    console.log(`   → IMPORTANTE: Rate limiting de 2-5 min entre uploads`);
  }

  if (categories.failed.length > 0) {
    console.log(`\n3. 🔄 RE-PROCESSAR FALHAS:`);
    console.log(`   → ${categories.failed.length} produtos falharam`);
    console.log(`   → Localização: public/products/failed/`);
    console.log(`   → Executar re-análise com parâmetros ajustados`);
  }

  console.log('\n─────────────────────────────────────\n');

  // 8. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    total_analyzed: analyses.length,
    categories: {
      ready_to_upload: categories.readyToUpload.length,
      needs_review: categories.needsReview.length,
      failed: categories.failed.length,
      archived: categories.archived.length
    },
    batches: totalBatches,
    files_organized: movedCount,
    files_skipped: skippedCount,
    ready_products: categories.readyToUpload.map(p => ({
      sku: p.sku,
      name: p.name,
      risk_score: p.risk_score,
      status: p.status,
      brands: JSON.parse(p.brands_detected)
    })),
    review_products: categories.needsReview.map(p => ({
      sku: p.sku,
      name: p.name,
      risk_score: p.risk_score,
      brands: JSON.parse(p.brands_detected)
    }))
  };

  const reportPath = path.join(BASE_DIR, 'organization-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`✅ Relatório gerado: ${reportPath}\n`);
}

// Execute
organizeProducts().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
