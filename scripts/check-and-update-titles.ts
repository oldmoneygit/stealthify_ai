/**
 * 🔍 CHECK AND UPDATE TITLES - Verificar e atualizar títulos camuflados
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '@/lib/db';
import { camouflage } from '@/services/title.service';

interface AnalysisRow {
  id: number;
  product_id: number;
  original_title: string;
  camouflaged_title: string;
}

async function checkAndUpdateTitles(): Promise<void> {
  console.log('🔍 CHECK AND UPDATE TITLES\n');
  console.log('📊 Verificando títulos camuflados no banco de dados...\n');
  console.log('='.repeat(80) + '\n');

  // Buscar primeiros 10 para análise
  const sample = db.prepare(`
    SELECT id, product_id, original_title, camouflaged_title
    FROM analyses
    LIMIT 10
  `).all() as AnalysisRow[];

  console.log('📋 AMOSTRA (primeiros 10):');
  console.log('─'.repeat(80));

  let needsUpdate = 0;

  for (const row of sample) {
    const isIdentical = row.original_title === row.camouflaged_title;

    console.log(`\n${isIdentical ? '❌' : '✅'} ID: ${row.id}`);
    console.log(`   Original: ${row.original_title}`);
    console.log(`   Camuflado: ${row.camouflaged_title}`);

    if (isIdentical) {
      needsUpdate++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`📊 Resultado: ${needsUpdate}/${sample.length} precisam camuflagem\n`);

  if (needsUpdate > 0) {
    console.log('⚠️  TÍTULOS NÃO FORAM CAMUFLADOS!\n');
    console.log('🔄 Atualizando TODOS os títulos com camuflagem...\n');
    console.log('='.repeat(80) + '\n');

    // Buscar TODAS as análises
    const allAnalyses = db.prepare(`
      SELECT id, product_id, original_title
      FROM analyses
    `).all() as AnalysisRow[];

    console.log(`📊 Total a processar: ${allAnalyses.length}\n`);

    let updated = 0;
    let errors = 0;

    for (let i = 0; i < allAnalyses.length; i++) {
      const analysis = allAnalyses[i];

      if ((i + 1) % 50 === 0) {
        console.log(`   Processando: ${i + 1}/${allAnalyses.length}...`);
      }

      try {
        // Camuflar título
        const camouflagedTitle = camouflage(analysis.original_title);

        // Atualizar no DB
        db.prepare(`
          UPDATE analyses
          SET camouflaged_title = ?
          WHERE id = ?
        `).run(camouflagedTitle, analysis.id);

        updated++;
      } catch (error) {
        console.error(`   ❌ Erro no ID ${analysis.id}: ${error}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTADO DA ATUALIZAÇÃO\n');
    console.log(`   Total processado: ${allAnalyses.length}`);
    console.log(`   ✅ Atualizados: ${updated}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log('\n' + '='.repeat(80));

    // Mostrar amostra após atualização
    console.log('\n📋 AMOSTRA APÓS ATUALIZAÇÃO (primeiros 10):');
    console.log('─'.repeat(80));

    const sampleAfter = db.prepare(`
      SELECT id, original_title, camouflaged_title
      FROM analyses
      LIMIT 10
    `).all() as AnalysisRow[];

    for (const row of sampleAfter) {
      console.log(`\n✅ ID: ${row.id}`);
      console.log(`   Original: ${row.original_title}`);
      console.log(`   Camuflado: ${row.camouflaged_title}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ TÍTULOS CAMUFLADOS COM SUCESSO!');
    console.log('='.repeat(80));

  } else {
    console.log('✅ Todos os títulos já estão camuflados!');
    console.log('='.repeat(80));
  }
}

checkAndUpdateTitles().catch(console.error);
