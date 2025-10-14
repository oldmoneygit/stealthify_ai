-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  woo_product_id INTEGER UNIQUE NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  image_url TEXT NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,

  -- Title
  original_title TEXT NOT NULL,
  camouflaged_title TEXT NOT NULL,

  -- Image
  original_image_url TEXT NOT NULL,
  edited_image_base64 TEXT NOT NULL,

  -- Metadata
  brands_detected TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('clean', 'blur_applied', 'failed')),

  -- Shopify
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  imported_at TIMESTAMP,

  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_analyses_product_id ON analyses(product_id);
