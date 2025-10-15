/**
 * Script to clean up duplicate/old analyses from database
 *
 * Keeps only the LATEST analysis for each product
 * Deletes all older analyses
 */

import { db } from '../src/lib/db';

console.log('🧹 Starting cleanup of duplicate analyses...\n');

// Get count before cleanup
const beforeStmt = db.prepare(`
  SELECT COUNT(*) as count FROM analyses
`);
const before = beforeStmt.get() as { count: number };
console.log(`📊 Total analyses before cleanup: ${before.count}`);

// Get count of unique products
const uniqueStmt = db.prepare(`
  SELECT COUNT(DISTINCT product_id) as count FROM analyses
`);
const unique = uniqueStmt.get() as { count: number };
console.log(`📦 Unique products with analyses: ${unique.count}`);
console.log(`🗑️  Duplicates to remove: ${before.count - unique.count}\n`);

if (before.count === unique.count) {
  console.log('✅ No duplicates found! Database is clean.');
  process.exit(0);
}

// Get all analyses grouped by product
const allAnalyses = db.prepare(`
  SELECT
    product_id,
    id,
    analyzed_at
  FROM analyses
  ORDER BY product_id, analyzed_at DESC
`).all() as Array<{
  product_id: number;
  id: number;
  analyzed_at: string;
}>;

// Group by product_id
const byProduct = new Map<number, Array<{ id: number; analyzed_at: string }>>();

for (const analysis of allAnalyses) {
  if (!byProduct.has(analysis.product_id)) {
    byProduct.set(analysis.product_id, []);
  }
  byProduct.get(analysis.product_id)!.push({
    id: analysis.id,
    analyzed_at: analysis.analyzed_at
  });
}

// Identify duplicates to delete
const idsToDelete: number[] = [];

for (const [productId, analyses] of byProduct.entries()) {
  if (analyses.length > 1) {
    // Keep the first (most recent), delete the rest
    const [latest, ...duplicates] = analyses;

    if (latest) {
      console.log(`📦 Product ${productId}:`);
      console.log(`   ✅ Keeping:  ID ${latest.id} (${latest.analyzed_at})`);

      for (const dup of duplicates) {
        console.log(`   🗑️  Deleting: ID ${dup.id} (${dup.analyzed_at})`);
        idsToDelete.push(dup.id);
      }
      console.log('');
    }
  }
}

// Delete duplicates
if (idsToDelete.length > 0) {
  console.log(`\n🗑️  Deleting ${idsToDelete.length} duplicate analyses...\n`);

  const deleteStmt = db.prepare(`
    DELETE FROM analyses WHERE id = ?
  `);

  const deleteMany = db.transaction((ids: number[]) => {
    for (const id of ids) {
      deleteStmt.run(id);
    }
  });

  deleteMany(idsToDelete);

  // Get count after cleanup
  const after = beforeStmt.get() as { count: number };

  console.log('✅ Cleanup complete!\n');
  console.log(`📊 Statistics:`);
  console.log(`   Before: ${before.count} analyses`);
  console.log(`   After:  ${after.count} analyses`);
  console.log(`   Deleted: ${before.count - after.count} duplicates`);
  console.log(`   Kept:    ${after.count} (1 per product)`);

} else {
  console.log('✅ No duplicates to delete!');
}

console.log('\n🎉 Done!');
