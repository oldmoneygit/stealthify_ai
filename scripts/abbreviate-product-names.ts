import { db } from '../src/lib/db';

/**
 * Script para abreviar nomes de produtos
 * - Dunk → DK
 * - Yeezy → YZ
 */

interface Analysis {
  id: number;
  product_id: number;
  camouflaged_title: string;
}

async function abbreviateProductNames() {
  console.log('🔄 Abreviando nomes de produtos...\n');

  try {
    // Buscar todas as análises com títulos camuflados
    const stmt = db.prepare(`
      SELECT
        a.id,
        a.product_id,
        a.camouflaged_title,
        p.sku
      FROM analyses a
      INNER JOIN products p ON a.product_id = p.id
      WHERE a.camouflaged_title IS NOT NULL
      AND a.camouflaged_title != ''
    `);

    const analyses = stmt.all() as Array<{
      id: number;
      product_id: number;
      camouflaged_title: string;
      sku: string;
    }>;

    console.log(`📦 Total de produtos encontrados: ${analyses.length}\n`);

    let updated = 0;
    let skipped = 0;

    const updateStmt = db.prepare(`
      UPDATE analyses
      SET camouflaged_title = ?
      WHERE id = ?
    `);

    for (const analysis of analyses) {
      const originalTitle = analysis.camouflaged_title;
      let newTitle = originalTitle;

      // Aplicar substituições (case-insensitive)
      const replacements = [
        // Modelos de tênis
        { from: /\bDunk\b/gi, to: 'DK' },
        { from: /\bYeezy\b/gi, to: 'YZ' },

        // Artistas e celebridades
        { from: /\bTravis Scott\b/gi, to: 'TS' },
        { from: /\bKanye West\b/gi, to: 'KW' },
        { from: /\bPharrell Williams\b/gi, to: 'PW' },
        { from: /\bPharrell\b/gi, to: 'PW' },
        { from: /\bVirgil Abloh\b/gi, to: 'VA' },
        { from: /\bJerry Lorenzo\b/gi, to: 'JL' },
        { from: /\bSean Wotherspoon\b/gi, to: 'SW' },
        { from: /\bDon C\b/gi, to: 'DC' },
        { from: /\bHiroshi Fujiwara\b/gi, to: 'HF' },
        { from: /\bSean Cliver\b/gi, to: 'SC' },
        { from: /\bJeff Staple\b/gi, to: 'JS' },
        { from: /\bStaple\b/gi, to: 'SP' },

        // Designers/Marcas colaboradoras conhecidas
        { from: /\bOff-White\b/gi, to: 'OW' },
        { from: /\bSupreme\b/gi, to: 'SPR' },
        { from: /\bFear of God\b/gi, to: 'FOG' },
        { from: /\bParra\b/gi, to: 'PR' }
      ];

      for (const replacement of replacements) {
        newTitle = newTitle.replace(replacement.from, replacement.to);
      }

      // Verificar se houve mudança
      if (newTitle !== originalTitle) {
        updateStmt.run(newTitle, analysis.id);
        console.log(`✅ [${updated + 1}] ${analysis.sku}`);
        console.log(`   Antes:  ${originalTitle}`);
        console.log(`   Depois: ${newTitle}\n`);
        updated++;
      } else {
        skipped++;
      }
    }

    console.log('='.repeat(60));
    console.log('🎉 ATUALIZAÇÃO COMPLETA!');
    console.log('='.repeat(60));
    console.log(`   ✅ Atualizados: ${updated}`);
    console.log(`   ⚠️  Pulados:    ${skipped} (sem alterações necessárias)`);
    console.log(`   📦 Total:       ${analyses.length}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

// Executar
abbreviateProductNames();
