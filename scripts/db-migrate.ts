/**
 * Run database migrations
 *
 * Usage: pnpm db:migrate
 */

import { db } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

console.log('\n🔄 Running database migrations...\n');

// Check if migrations table exists
const createMigrationsTable = `
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

db.exec(createMigrationsTable);

// Get applied migrations
const appliedMigrations = db
  .prepare('SELECT name FROM migrations')
  .all() as Array<{ name: string }>;

const appliedSet = new Set(appliedMigrations.map(m => m.name));

// Get migration files
const migrationsDir = path.join(process.cwd(), 'database', 'migrations');

if (!fs.existsSync(migrationsDir)) {
  console.log('No migrations directory found. Creating...');
  fs.mkdirSync(migrationsDir, { recursive: true });
  console.log('✅ Migrations directory created.\n');
  process.exit(0);
}

const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No migration files found.\n');
  process.exit(0);
}

console.log(`Found ${files.length} migration file(s).\n`);

// Run pending migrations
let appliedCount = 0;

for (const file of files) {
  const migrationName = file.replace('.sql', '');

  if (appliedSet.has(migrationName)) {
    console.log(`⏭️  Skipping ${file} (already applied)`);
    continue;
  }

  console.log(`🔄 Applying ${file}...`);

  try {
    // Read migration file
    const filepath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filepath, 'utf-8');

    // Execute migration in transaction
    db.exec('BEGIN TRANSACTION');

    // Run the migration SQL
    db.exec(sql);

    // Record migration
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);

    db.exec('COMMIT');

    console.log(`✅ Applied ${file}`);
    appliedCount++;

  } catch (error) {
    db.exec('ROLLBACK');
    console.error(`❌ Failed to apply ${file}:`, error);
    process.exit(1);
  }
}

if (appliedCount === 0) {
  console.log('\n✅ All migrations are up to date.\n');
} else {
  console.log(`\n✅ Successfully applied ${appliedCount} migration(s).\n`);
}
