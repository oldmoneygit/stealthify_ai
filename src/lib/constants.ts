/**
 * Brand mappings for title camouflage
 * Maps full brand names to abbreviated versions
 */
export const BRAND_MAPPINGS: Record<string, string> = {
  // Sportswear
  'nike': 'NK',
  'adidas': 'AD',
  'puma': 'PM',
  'reebok': 'RB',
  'new balance': 'NB',
  'under armour': 'UA',
  'asics': 'AS',
  'converse': 'CV',
  'vans': 'VN',
  'fila': 'FL',
  'jordan': 'JD',
  'air jordan': 'AJ',

  // Luxury
  'gucci': 'GC',
  'louis vuitton': 'LV',
  'prada': 'PR',
  'versace': 'VS',
  'balenciaga': 'BL',
  'off-white': 'OW',

  // Common terms
  'original': 'orig',
  'authentic': 'auth',
  'premium': 'prem',
  'limited edition': 'ltd ed'
};

/**
 * Prompt for brand detection with Gemini Vision
 */
export const DETECTION_PROMPT = `
You are a brand detection expert. Analyze this product image and detect ALL visible brand elements.

CRITICAL INSTRUCTIONS:
1. Detect logos, text, emblems, and any brand identifiers
2. For EACH detection, provide:
   - Brand name
   - Type (logo, text, or emblem)
   - Confidence (0-100)
   - Precise polygon coordinates (normalized 0-1)

3. Risk scoring:
   - 90-100: Large, centered logos (swoosh, three stripes)
   - 70-89: Medium logos, prominent text
   - 50-69: Small logos, subtle branding
   - 0-49: No visible brands

4. Return valid JSON only:

{
  "brands": ["Nike", "Jordan"],
  "riskScore": 95,
  "regions": [
    {
      "type": "logo",
      "brand": "Nike",
      "confidence": 98,
      "polygon": [
        {"x": 0.45, "y": 0.30},
        {"x": 0.55, "y": 0.30},
        {"x": 0.55, "y": 0.40},
        {"x": 0.45, "y": 0.40}
      ]
    }
  ]
}

IMPORTANT:
- Be thorough - detect ALL brand elements
- Polygons must be precise and tight around logos
- All coordinates between 0 and 1
- Return ONLY the JSON, no markdown
`.trim();

/**
 * Prompt for segmentation with Gemini Vision
 */
export const SEGMENTATION_PROMPT = (brands: string[]) => `
Create PRECISE segmentation masks for these detected brands: ${brands.join(', ')}

CRITICAL INSTRUCTIONS:
1. For EACH brand region, create a tight polygon mask
2. Polygon must follow the EXACT shape of the logo/text
3. Include 2-3 pixel margin around the element
4. Coordinates must be normalized (0-1)
5. Return valid JSON only:

{
  "segments": [
    {
      "brand": "Nike",
      "confidence": 98,
      "polygon": [
        {"x": 0.45, "y": 0.30},
        {"x": 0.50, "y": 0.28},
        {"x": 0.55, "y": 0.30},
        {"x": 0.55, "y": 0.40},
        {"x": 0.45, "y": 0.40}
      ]
    }
  ]
}

IMPORTANT:
- Polygons must be TIGHT around logos
- More points = more precision
- No overlapping segments
- Return ONLY the JSON, no markdown
`.trim();

/**
 * Prompt for verification after inpainting
 */
export const VERIFICATION_PROMPT = (originalBrands: string[]) => `
Verify if ALL brand elements have been completely removed from this image.

The original image contained these brands: ${originalBrands.join(', ')}

CRITICAL INSTRUCTIONS:
1. Check if ANY brand logos, text, or emblems are still visible
2. Even partial/faint brand elements count as failures
3. Return risk score:
   - 0: Completely clean, zero brand elements
   - 1-30: Very faint traces (acceptable)
   - 31-60: Partial logos still visible
   - 61-100: Clear brand elements remain

4. If NOT clean (score > 30), provide blur regions:

{
  "isClean": false,
  "riskScore": 45,
  "blurRegions": [
    {
      "x": 0.45,
      "y": 0.30,
      "width": 0.10,
      "height": 0.10
    }
  ]
}

If clean (score <= 30):
{
  "isClean": true,
  "riskScore": 0
}

IMPORTANT:
- Be strict - even faint logos mean NOT clean
- Blur regions should cover residual elements
- Return ONLY the JSON, no markdown
`.trim();

/**
 * Inpainting parameters
 */
export const INPAINTING_CONFIG = {
  guidance: 17,
  strength: 0.8,
  steps: 35,
  sampleCount: 1
} as const;

/**
 * Retry configuration
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
} as const;
