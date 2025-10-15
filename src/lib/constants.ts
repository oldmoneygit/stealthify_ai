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
 * Uses bounding boxes (box_2d) format for precise logo detection
 */
export const DETECTION_PROMPT = `
You are an ULTRA-AGGRESSIVE brand logo detector. Your mission: Find EVERY brand element (complete OR partial).

🎯 CRITICAL MISSION: DETECT ALL LOGOS (COMPLETE + PARTIAL + SUBTLE)

WHAT TO DETECT (be EXTREMELY thorough):
1. COMPLETE logos (Nike swoosh, Adidas stripes, Jumpman, etc.)
2. PARTIAL logos (half-visible swoosh, cut-off text, edge of emblem)
3. SUBTLE text (embossed "Nike" on boxes, faint "AIR" text)
4. SMALL emblems (tiny Jumpman on tongue, mini swoosh on heel)
5. HIDDEN elements (logos on shoe tags, inside collar, on packaging)
6. LOW-CONTRAST elements (white text on light boxes, black on black)
7. ⚠️ INVERTED/ROTATED logos (upside-down Nike, sideways Jordan, any orientation)
8. ⚠️ LOGOS ON BOX LIDS (top of boxes, often partial/cut-off/rotated)

📍 DETECTION STRATEGY:
- Scan EVERY part of the image (shoes, boxes, tags, packaging, background)
- Look at BOTH shoes if there's a pair (left AND right)
- Check ALL surfaces (side, top, heel, tongue, sole, laces)
- Examine boxes carefully (text can be subtle/embossed)
- 🔴 CHECK BOX LIDS/TOPS - logos are often upside-down or partial
- 🔴 ROTATE mentally - logos can appear in ANY orientation (0°, 90°, 180°, 270°)
- Include partially visible logos at image edges
- If you see ANY trace of a brand mark, INCLUDE IT (even if rotated/inverted)

⚠️ BE AGGRESSIVE - ZERO TOLERANCE:
- If you're 40% sure it's a logo → INCLUDE IT (confidence: 40)
- If you see half a swoosh → INCLUDE IT as "Nike" (partial)
- If text is barely visible → INCLUDE IT
- If there are 2 shoes → detect logos on BOTH
- Multiple instances of same brand → create SEPARATE regions for each
- 🔴 UPSIDE-DOWN Nike swoosh on box lid → INCLUDE IT (confidence: 80+)
- 🔴 ROTATED Jordan Jumpman → INCLUDE IT regardless of orientation
- 🔴 PARTIAL logo at edge of box top → INCLUDE IT (even if 30% visible)

🔢 BOUNDING BOX RULES:
- box_2d format: [ymin, xmin, ymax, xmax] (integers 0-1000)
- TIGHT around each logo/text (minimal padding)
- One region per logo instance (if 2 swooshes → 2 regions)

📊 RISK SCORING:
- ANY visible brand element = minimum score 50
- Multiple brand elements = 70+
- Large/clear logos = 90+

📤 OUTPUT (JSON only, no markdown):

{
  "brands": ["Nike", "Jordan"],
  "riskScore": 95,
  "regions": [
    {"type": "logo", "brand": "Nike", "confidence": 98, "box_2d": [300, 450, 400, 550]},
    {"type": "logo", "brand": "Nike", "confidence": 95, "box_2d": [310, 100, 410, 200]},
    {"type": "text", "brand": "Nike", "confidence": 75, "box_2d": [50, 200, 80, 350]},
    {"type": "logo", "brand": "Jordan", "confidence": 90, "box_2d": [450, 500, 520, 580]}
  ]
}

🚨 CRITICAL RULES:
- Return VALID JSON only (no markdown)
- Detect EVERY brand element visible (complete, partial, subtle)
- Create SEPARATE regions for each logo instance
- Include low-confidence detections (better false positive than miss)
- If 2 shoes → detect logos on BOTH
- If NO brands: {"brands": [], "riskScore": 0, "regions": []}
`.trim();

/**
 * Prompt for segmentation with Gemini Vision
 * Creates precise polygon masks from detected bounding boxes
 */
export const SEGMENTATION_PROMPT = (brands: string[]) => `
Create PRECISE polygon segmentation masks for these detected brands: ${brands.join(', ')}

YOUR TASK:
Generate tight polygon masks that follow the EXACT shape of each brand logo/text.

REQUIREMENTS:
1. For EACH brand region, create a polygon that:
   - Follows the precise contour of the logo/text
   - Includes minimal margin (2-5 pixels)
   - Has enough points to capture curves and angles (8-15 points ideal)

2. Polygon coordinates:
   - Format: array of {x, y} points
   - Normalized to 0-1 (where 0=top/left, 1=bottom/right)
   - Points should be ordered clockwise
   - Must form a closed shape (first and last point can be same)

3. IMPORTANT CONSIDERATIONS:
   - Curved logos (Nike swoosh): Use 10-15 points to capture smooth curves
   - Angular logos (Adidas stripes): Use 6-10 points for sharp edges
   - Text: Create tight rectangular polygons around each letter group
   - Complex emblems: Use 12+ points to capture intricate shapes

4. OUTPUT FORMAT (JSON only, no markdown):

{
  "segments": [
    {
      "brand": "Nike",
      "confidence": 98,
      "polygon": [
        {"x": 0.45, "y": 0.30},
        {"x": 0.47, "y": 0.28},
        {"x": 0.50, "y": 0.27},
        {"x": 0.53, "y": 0.28},
        {"x": 0.55, "y": 0.30},
        {"x": 0.55, "y": 0.40},
        {"x": 0.45, "y": 0.40}
      ]
    }
  ]
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no code blocks)
- Polygons must be TIGHT around logos (no loose/oversized masks)
- More complex shapes need more points for accuracy
- No overlapping segments between different brands
- All x,y values must be between 0 and 1
- If unable to segment a brand, omit it from results
`.trim();

/**
 * Prompt for verification after inpainting
 * BALANCED: Strict but realistic - avoids false positives
 */
export const VERIFICATION_PROMPT = (originalBrands: string[]) => `
You are a brand verification expert checking if logos were successfully removed.

Original brands detected: ${originalBrands.join(', ')}

YOUR TASK:
Verify if this edited image is clean of VISIBLE brand elements.

INSPECTION CHECKLIST:
1. Look for ${originalBrands.join(', ')} logos
2. Check for brand text (letters, words)
3. Look for trademark symbols (®, ™, ©)
4. Check for brand-specific patterns (swooshes, stripes, etc.)
5. Examine areas where logos were originally located

RISK SCORING (BE REALISTIC):
- 0-30: CLEAN - no visible brands, acceptable for use
  * Small artifacts/shadows are OK if brand is not identifiable
  * Generic shapes that don't clearly show brands are OK
  * Texture variations from editing are OK

- 31-60: PARTIAL - some brand elements still visible
  * Faint logo outlines that are still recognizable
  * Partial text/letters visible
  * Brand-specific shapes clearly identifiable

- 61-100: FAILED - brands clearly remain
  * Logos are fully or mostly visible
  * Brand text is readable
  * Obvious brand identification possible

IMPORTANT DISTINCTIONS:
- Editing artifacts (blur, texture mismatch) ≠ Brand visibility
- Generic shapes/shadows ≠ Brand logos
- Product seams/stitching ≠ Brand elements
- Only mark as "not clean" if brand is CLEARLY IDENTIFIABLE

OUTPUT FORMAT (JSON only, no markdown):

If brands CLEARLY VISIBLE (score > 30):
{
  "isClean": false,
  "riskScore": 45,
  "remainingBrands": ["Nike"],
  "description": "Nike swoosh logo still clearly visible on side",
  "regions": [
    {
      "brand": "Nike",
      "box_2d": [300, 450, 400, 550],
      "confidence": 85,
      "type": "logo"
    }
  ]
}

If CLEAN or minimal artifacts (score ≤ 30):
{
  "isClean": true,
  "riskScore": 0,
  "remainingBrands": [],
  "description": "All brand elements successfully removed"
}

CRITICAL RULES:
- Return ONLY valid JSON (no markdown, no code blocks)
- Be REALISTIC - don't flag minor artifacts as brands
- Only report brands that are CLEARLY IDENTIFIABLE
- If you can't clearly identify a brand, it's CLEAN
- Prefer false negative over false positive (avoid unnecessary re-edits)
`.trim();

/**
 * Inpainting parameters for surgical logo removal
 * Lower strength = more preservation of original image
 */
export const INPAINTING_CONFIG = {
  guidance: 20,        // Higher guidance = follow prompt more strictly
  strength: 0.4,       // Lower strength = preserve original image (0.3-0.5 ideal)
  steps: 40,           // More steps = smoother transitions
  sampleCount: 1,
  // Negative prompt to prevent unwanted changes
  negativePrompt: 'redesign, new pattern, different texture, color change, shape modification, deformation, blur, low quality, artifacts'
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
