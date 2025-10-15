/**
 * Test database schema - verify analyses table has edited_image_filepath column
 */

import { db } from '../src/lib/db';

console.log('\n📊 Checking database schema...\n');

// Get table info
const tableInfo = db.prepare(`PRAGMA table_info(analyses)`).all();

console.log('analyses table columns:\n');

for (const column of tableInfo as any[]) {
  console.log(`  ${column.cid}. ${column.name} (${column.type})${column.notnull ? ' NOT NULL' : ''}`);
}

// Check if edited_image_filepath exists
const hasFilepath = (tableInfo as any[]).some(
  col => col.name === 'edited_image_filepath'
);

if (hasFilepath) {
  console.log('\n✅ Column "edited_image_filepath" exists!\n');
} else {
  console.log('\n❌ Column "edited_image_filepath" NOT FOUND!\n');
  console.log('Run: pnpm db:migrate\n');
  process.exit(1);
}
