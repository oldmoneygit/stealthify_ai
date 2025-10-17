import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-loaded Supabase client
let supabaseInstance: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  // Load credentials at runtime (after dotenv has loaded)
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error('⚠️  Supabase credentials not set. Please check your .env or .env.local file.');
    } else {
      throw new Error('Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }
  }

  // Create Supabase client with service role (bypasses RLS)
  supabaseInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return supabaseInstance;
}

// Export lazy-loaded client
export const supabase = new Proxy({} as SupabaseClient, {
  get(target, prop) {
    const client = getSupabaseClient();
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

// Types
export interface Product {
  id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  price: number;
  regular_price?: number;
  sale_price?: number;
  image_url: string;
  synced_at?: string;
}

export interface Analysis {
  id: number;
  product_id: number;
  original_title: string;
  camouflaged_title: string;
  original_image_url: string;
  edited_image_base64: string;
  edited_image_filepath?: string;
  brands_detected: string; // JSON string
  risk_score: number;
  status: 'clean' | 'blur_applied' | 'failed';
  shopify_product_id?: string;
  shopify_variant_id?: string;
  imported_at?: string;
  analyzed_at?: string;
}

export interface ProductWithAnalysis extends Product {
  analysis_id?: number;
  camouflaged_title?: string;
  edited_image_base64?: string;
  brands_detected?: string;
  risk_score?: number;
  status?: string;
  analyzed_at?: string;
  shopify_product_id?: string;
  shopify_variant_id?: string;
}

/**
 * Get all products with their latest analysis
 */
export async function getAllAnalysesWithProducts(): Promise<ProductWithAnalysis[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      analyses (
        id,
        camouflaged_title,
        edited_image_base64,
        brands_detected,
        risk_score,
        status,
        analyzed_at,
        shopify_product_id,
        shopify_variant_id
      )
    `)
    .order('id', { ascending: false });

  if (error) {
    console.error('❌ Error fetching products with analyses:', error);
    throw error;
  }

  // Flatten the response to match old SQLite structure
  return (data || []).map(product => {
    const latestAnalysis = Array.isArray(product.analyses) && product.analyses.length > 0
      ? product.analyses[0]
      : null;

    return {
      id: product.id,
      woo_product_id: product.woo_product_id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      image_url: product.image_url,
      synced_at: product.synced_at,
      analysis_id: latestAnalysis?.id,
      camouflaged_title: latestAnalysis?.camouflaged_title,
      edited_image_base64: latestAnalysis?.edited_image_base64,
      brands_detected: latestAnalysis?.brands_detected,
      risk_score: latestAnalysis?.risk_score,
      status: latestAnalysis?.status,
      analyzed_at: latestAnalysis?.analyzed_at,
      shopify_product_id: latestAnalysis?.shopify_product_id,
      shopify_variant_id: latestAnalysis?.shopify_variant_id
    };
  });
}

/**
 * Get latest analysis for a specific product
 */
export async function getLatestAnalysisForProduct(productId: number): Promise<Analysis | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .eq('product_id', productId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('❌ Error fetching analysis:', error);
    throw error;
  }

  return data;
}

/**
 * Get product database ID from SKU or product ID string
 */
export async function getProductDatabaseId(productIdString: string): Promise<number | null> {
  // Try to find by SKU first
  let { data, error } = await supabase
    .from('products')
    .select('id')
    .ilike('sku', `%${productIdString}%`)
    .limit(1)
    .single();

  if (data) return data.id;

  // Try by woo_product_id
  const numericId = parseInt(productIdString, 10);
  if (!isNaN(numericId)) {
    const result = await supabase
      .from('products')
      .select('id')
      .eq('woo_product_id', numericId)
      .limit(1)
      .single();

    if (result.data) return result.data.id;
  }

  // Try by id directly
  if (!isNaN(numericId)) {
    const result = await supabase
      .from('products')
      .select('id')
      .eq('id', numericId)
      .limit(1)
      .single();

    if (result.data) return result.data.id;
  }

  console.warn(`⚠️ Product not found in database: ${productIdString}`);
  return null;
}

/**
 * Update edited image filepath for a product
 */
export async function updateEditedImagePath(productId: number, newFilepath: string): Promise<void> {
  // Get the latest analysis for this product
  const latestAnalysis = await getLatestAnalysisForProduct(productId);

  if (!latestAnalysis) {
    console.warn(`⚠️ No analysis found for product ${productId}`);
    return;
  }

  const { error } = await supabase
    .from('analyses')
    .update({ edited_image_filepath: newFilepath })
    .eq('id', latestAnalysis.id);

  if (error) {
    console.error(`❌ Error updating image path:`, error);
    throw error;
  }

  console.log(`✅ Database updated: edited_image_filepath for product ${productId} → ${newFilepath}`);
}

/**
 * Save or update a product
 */
export async function upsertProduct(product: Omit<Product, 'id' | 'synced_at'>): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .upsert(
      {
        woo_product_id: product.woo_product_id,
        sku: product.sku,
        name: product.name,
        price: product.price,
        regular_price: product.regular_price,
        sale_price: product.sale_price,
        image_url: product.image_url
      },
      {
        onConflict: 'woo_product_id',
        ignoreDuplicates: false
      }
    )
    .select()
    .single();

  if (error) {
    console.error('❌ Error upserting product:', error);
    throw error;
  }

  return data;
}

/**
 * Save an analysis
 */
export async function insertAnalysis(analysis: Omit<Analysis, 'id' | 'analyzed_at'>): Promise<Analysis> {
  const { data, error } = await supabase
    .from('analyses')
    .insert({
      product_id: analysis.product_id,
      original_title: analysis.original_title,
      camouflaged_title: analysis.camouflaged_title,
      original_image_url: analysis.original_image_url,
      edited_image_base64: analysis.edited_image_base64,
      edited_image_filepath: analysis.edited_image_filepath,
      brands_detected: analysis.brands_detected,
      risk_score: analysis.risk_score,
      status: analysis.status,
      shopify_product_id: analysis.shopify_product_id,
      shopify_variant_id: analysis.shopify_variant_id,
      imported_at: analysis.imported_at
    })
    .select()
    .single();

  if (error) {
    console.error('❌ Error inserting analysis:', error);
    throw error;
  }

  return data;
}

/**
 * Get products by SKUs (for redirect API)
 */
export async function getProductsBySKUs(skus: string[]): Promise<ProductWithAnalysis[]> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      analyses (
        id,
        camouflaged_title,
        edited_image_base64,
        brands_detected,
        risk_score,
        status,
        shopify_product_id,
        shopify_variant_id
      )
    `)
    .in('sku', skus);

  if (error) {
    console.error('❌ Error fetching products by SKUs:', error);
    throw error;
  }

  // Flatten the response
  return (data || []).map(product => {
    const latestAnalysis = Array.isArray(product.analyses) && product.analyses.length > 0
      ? product.analyses[0]
      : null;

    return {
      id: product.id,
      woo_product_id: product.woo_product_id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      regular_price: product.regular_price,
      sale_price: product.sale_price,
      image_url: product.image_url,
      synced_at: product.synced_at,
      analysis_id: latestAnalysis?.id,
      camouflaged_title: latestAnalysis?.camouflaged_title,
      edited_image_base64: latestAnalysis?.edited_image_base64,
      brands_detected: latestAnalysis?.brands_detected,
      risk_score: latestAnalysis?.risk_score,
      status: latestAnalysis?.status,
      analyzed_at: latestAnalysis?.analyzed_at,
      shopify_product_id: latestAnalysis?.shopify_product_id,
      shopify_variant_id: latestAnalysis?.shopify_variant_id
    };
  });
}

/**
 * Get product by Shopify variant ID (reverse mapping for order sync)
 *
 * This function is used by the webhook to map Shopify products back to WooCommerce
 */
export async function getProductByShopifyVariantId(shopifyVariantId: string): Promise<ProductWithAnalysis | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select(`
      shopify_product_id,
      shopify_variant_id,
      product_id,
      products (
        id,
        woo_product_id,
        sku,
        name,
        price,
        regular_price,
        sale_price,
        image_url
      )
    `)
    .eq('shopify_variant_id', shopifyVariantId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    console.error('❌ Error fetching product by Shopify variant ID:', error);
    throw error;
  }

  if (!data || !data.products) {
    return null;
  }

  const product = Array.isArray(data.products) ? data.products[0] : data.products;

  if (!product) {
    return null;
  }

  return {
    id: product.id,
    woo_product_id: product.woo_product_id,
    sku: product.sku,
    name: product.name,
    price: product.price,
    regular_price: product.regular_price,
    sale_price: product.sale_price,
    image_url: product.image_url,
    shopify_product_id: data.shopify_product_id,
    shopify_variant_id: data.shopify_variant_id
  };
}
