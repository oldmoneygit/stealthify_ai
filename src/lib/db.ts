import path from 'path';
import fs from 'fs';

// Lazy-loaded Database instance
let dbInstance: any = null;

// Check if we're in build time (Vercel)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || process.env.SKIP_DB_INIT === 'true';

function getDb() {
  if (isBuildTime) {
    // During build, return a mock that throws helpful errors
    return {
      prepare: () => {
        throw new Error('Database not available during build time');
      },
      pragma: () => {},
      exec: () => {}
    };
  }

  if (!dbInstance) {
    try {
      // Lazy import better-sqlite3 only when actually needed
      const Database = require('better-sqlite3');

      const dbPath = path.join(process.cwd(), 'database', 'products.db');
      const dbDir = path.dirname(dbPath);

      // Ensure database directory exists
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      dbInstance = new Database(dbPath);

      // Enable WAL mode for better concurrency
      dbInstance.pragma('journal_mode = WAL');

      // Auto-initialize if needed
      if (!isDatabaseInitializedInternal(dbInstance)) {
        const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        dbInstance.exec(schema);
        console.log('✅ Database initialized');
      }
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw error;
    }
  }

  return dbInstance;
}

// Export db as a getter
export const db = new Proxy({} as any, {
  get(target, prop) {
    const database = getDb();
    const value = database[prop];
    return typeof value === 'function' ? value.bind(database) : value;
  }
});

function isDatabaseInitializedInternal(database: any): boolean {
  try {
    const result = database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='products'"
    ).get();
    return !!result;
  } catch {
    return false;
  }
}

// Helper to check if database is initialized
export function isDatabaseInitialized(): boolean {
  if (isBuildTime) return false;
  try {
    return isDatabaseInitializedInternal(getDb());
  } catch {
    return false;
  }
}

// Initialize database manually
export function initializeDatabase(): void {
  if (isBuildTime) {
    console.log('⏭️ Skipping database initialization during build');
    return;
  }

  const database = getDb();
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
  console.log('✅ Database initialized');
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

/**
 * Get product database ID from the product_id string (from filenames)
 */
export function getProductDatabaseId(productIdString: string): number | null {
  // Try to find product by SKU or woo_product_id
  const stmt = db.prepare(`
    SELECT id FROM products
    WHERE sku LIKE ? OR woo_product_id = ? OR CAST(id AS TEXT) = ?
    LIMIT 1
  `);

  const result = stmt.get(`%${productIdString}%`, productIdString, productIdString) as { id: number } | undefined;

  if (result) {
    return result.id;
  }

  console.warn(`⚠️ Product not found in database: ${productIdString}`);
  return null;
}

/**
 * Update edited image filepath for a product (when replacing with reprocessed version)
 */
export function updateEditedImagePath(productId: number, newFilepath: string): void {
  const stmt = db.prepare(`
    UPDATE analyses
    SET edited_image_filepath = ?
    WHERE product_id = ?
    AND id = (
      SELECT id FROM analyses
      WHERE product_id = ?
      ORDER BY analyzed_at DESC
      LIMIT 1
    )
  `);

  const result = stmt.run(newFilepath, productId, productId);

  if (result.changes > 0) {
    console.log(`✅ Database updated: edited_image_filepath for product ${productId} → ${newFilepath}`);
  } else {
    console.warn(`⚠️ No database update: product ${productId} not found in analyses table`);
  }
}
