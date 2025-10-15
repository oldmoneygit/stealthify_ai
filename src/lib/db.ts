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

/**
 * Get all analyses with product info
 */
export function getAllAnalysesWithProducts() {
  const stmt = db.prepare(`
    SELECT
      p.id as product_id,
      p.sku,
      p.name as original_name,
      p.price,
      p.image_url as original_image_url,
      a.id as analysis_id,
      a.camouflaged_title,
      a.edited_image_base64,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM products p
    LEFT JOIN analyses a ON p.id = a.product_id
    ORDER BY p.id DESC
  `);

  return stmt.all();
}

/**
 * Get latest analysis for a specific product
 */
export function getLatestAnalysisForProduct(productId: number) {
  const stmt = db.prepare(`
    SELECT
      a.id,
      a.camouflaged_title,
      a.edited_image_base64,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM analyses a
    WHERE a.product_id = ?
    ORDER BY a.analyzed_at DESC
    LIMIT 1
  `);

  return stmt.get(productId);
}
