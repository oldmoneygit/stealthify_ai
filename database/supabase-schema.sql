-- 🗄️ Schema para Supabase Postgres
-- Execute este SQL no SQL Editor do Supabase

-- Drop tables if exist (cuidado em produção!)
DROP TABLE IF EXISTS analyses CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- Create products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  woo_product_id INTEGER UNIQUE NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  regular_price DECIMAL(10, 2),
  sale_price DECIMAL(10, 2),
  image_url TEXT NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create analyses table
CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL,

  -- Título
  original_title TEXT NOT NULL,
  camouflaged_title TEXT NOT NULL,

  -- Imagem
  original_image_url TEXT NOT NULL,
  edited_image_base64 TEXT NOT NULL,
  edited_image_filepath TEXT,

  -- Metadata
  brands_detected TEXT NOT NULL, -- JSON array como texto
  risk_score INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('clean', 'blur_applied', 'failed')),

  -- Shopify
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  imported_at TIMESTAMP,

  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_woo_id ON products(woo_product_id);
CREATE INDEX idx_analyses_product_id ON analyses(product_id);
CREATE INDEX idx_analyses_shopify_product_id ON analyses(shopify_product_id);
CREATE INDEX idx_analyses_status ON analyses(status);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Create policies to allow service role full access
CREATE POLICY "Enable all access for service role" ON products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Enable all access for service role" ON analyses
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Grant permissions to service role
GRANT ALL ON products TO service_role;
GRANT ALL ON analyses TO service_role;
GRANT USAGE, SELECT ON SEQUENCE products_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE analyses_id_seq TO service_role;

-- Create a function to update synced_at timestamp
CREATE OR REPLACE FUNCTION update_synced_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.synced_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for products
CREATE TRIGGER update_products_synced_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_synced_at();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Schema criado com sucesso!';
END $$;
