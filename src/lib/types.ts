// Product from WooCommerce
export interface Product {
  id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  price: number;
  image_url: string;
}

// Brand detection result
export interface BrandDetection {
  brands: string[];
  riskScore: number;
  regions: DetectionRegion[];
}

export interface DetectionRegion {
  type: 'logo' | 'text' | 'emblem';
  brand: string;
  confidence: number;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  polygon?: Array<{ x: number; y: number }>; // Optional: precise polygon for complex shapes
}

// Segmentation result
export interface Segment {
  polygon: Array<{ x: number; y: number }>;
  brand: string;
  confidence: number;
}

// Analysis result
export interface AnalysisResult {
  title: string;
  image: string; // base64
  brands_detected: string[];
  risk_score: number;
  status: 'clean' | 'blur_applied' | 'failed';
  error?: string;
  mask?: string; // Máscara gerada (para debug/visualização) - base64 data URI
}

// Verification result (ultra-strict verification)
export interface VerificationResult {
  isClean: boolean;
  riskScore: number;
  remainingBrands: string[];
  description: string;
  regions?: Array<{
    brand: string;
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
    confidence: number;
    type: 'logo' | 'text' | 'emblem';
  }>;
}

// Shopify product
export interface ShopifyProduct {
  id: string;
  title: string;
  variants: Array<{
    id: string;
    sku: string;
    price: string;
  }>;
}
