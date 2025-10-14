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
  polygon: Array<{ x: number; y: number }>;
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
}

// Verification result
export interface VerificationResult {
  isClean: boolean;
  riskScore: number;
  blurRegions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
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
