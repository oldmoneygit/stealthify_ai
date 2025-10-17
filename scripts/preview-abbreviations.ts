import { db } from '../src/lib/db';

/**
 * Preview das abreviações que serão aplicadas
 */

async function previewAbbreviations() {
  console.log('🔍 PREVIEW: Abreviações de Nomes\n');

  const stmt = db.prepare(`
    SELECT
      a.camouflaged_title,
      p.sku
    FROM analyses a
    INNER JOIN products p ON a.product_id = p.id
    WHERE a.camouflaged_title IS NOT NULL
    AND a.camouflaged_title != ''
    AND (
      a.camouflaged_title LIKE '%Dunk%'
      OR a.camouflaged_title LIKE '%Yeezy%'
      OR a.camouflaged_title LIKE '%Travis Scott%'
      OR a.camouflaged_title LIKE '%Kanye%'
      OR a.camouflaged_title LIKE '%Pharrell%'
      OR a.camouflaged_title LIKE '%Virgil%'
      OR a.camouflaged_title LIKE '%Supreme%'
      OR a.camouflaged_title LIKE '%Off-White%'
      OR a.camouflaged_title LIKE '%Staple%'
      OR a.camouflaged_title LIKE '%Sean Cliver%'
      OR a.camouflaged_title LIKE '%Parra%'
    )
    ORDER BY p.id
    LIMIT 20
  `);

  const products = stmt.all() as Array<{
    camouflaged_title: string;
    sku: string;
  }>;

  console.log(`📊 Mostrando até 20 exemplos de produtos que serão alterados:\n`);
  console.log('='.repeat(80));

  let count = 0;
  for (const product of products) {
    const originalTitle = product.camouflaged_title;
    let newTitle = originalTitle;

    // Aplicar substituições (mesma ordem do script principal)
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

    if (newTitle !== originalTitle) {
      count++;
      console.log(`\n[${count}] SKU: ${product.sku}`);
      console.log(`    Antes:  ${originalTitle}`);
      console.log(`    Depois: ${newTitle}`);
    }
  }

  console.log('\n' + '='.repeat(80));

  // Contar total
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total
    FROM analyses a
    WHERE a.camouflaged_title IS NOT NULL
    AND a.camouflaged_title != ''
    AND (
      a.camouflaged_title LIKE '%Dunk%'
      OR a.camouflaged_title LIKE '%Yeezy%'
      OR a.camouflaged_title LIKE '%Travis Scott%'
      OR a.camouflaged_title LIKE '%Kanye%'
      OR a.camouflaged_title LIKE '%Pharrell%'
      OR a.camouflaged_title LIKE '%Virgil%'
      OR a.camouflaged_title LIKE '%Supreme%'
      OR a.camouflaged_title LIKE '%Off-White%'
      OR a.camouflaged_title LIKE '%Staple%'
      OR a.camouflaged_title LIKE '%Sean Cliver%'
      OR a.camouflaged_title LIKE '%Parra%'
    )
  `);

  const { total } = countStmt.get() as { total: number };

  console.log(`\n📈 TOTAL de produtos que serão alterados: ${total}`);
  console.log('\n✅ Preview concluído! Se estiver satisfeito, execute:');
  console.log('   npx tsx scripts/abbreviate-product-names.ts\n');
}

previewAbbreviations();
