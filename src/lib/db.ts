import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'database', 'products.db');
const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema if database is new
export function initializeDatabase(): void {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
  console.log('✅ Database initialized');
}

// Helper to check if database is initialized
export function isDatabaseInitialized(): boolean {
  try {
    const result = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
    ).get();
    return !!result;
  } catch {
    return false;
  }
}

// Auto-initialize on first import
if (!isDatabaseInitialized()) {
  initializeDatabase();
}
