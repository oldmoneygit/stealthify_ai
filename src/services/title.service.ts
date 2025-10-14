import { BRAND_MAPPINGS } from '@/lib/constants';

/**
 * Camouflage product title by replacing brand names with abbreviations
 *
 * @param title - Original product title
 * @returns Camouflaged title with brands abbreviated
 *
 * @example
 * camouflage("Nike Air Jordan 1 Retro High")
 * // Returns: "NK Air JD 1 Retro High"
 */
export function camouflage(title: string): string {
  console.log('🔤 Camuflando título:', title);

  let camouflagedTitle = title;

  // Sort brands by length (longest first) to avoid partial replacements
  const sortedBrands = Object.keys(BRAND_MAPPINGS).sort(
    (a, b) => b.length - a.length
  );

  // Replace each brand with its abbreviation (case-insensitive)
  for (const brand of sortedBrands) {
    const abbreviation = BRAND_MAPPINGS[brand];
    if (!abbreviation) continue;
    const regex = new RegExp(`\\b${brand}\\b`, 'gi');
    camouflagedTitle = camouflagedTitle.replace(regex, abbreviation);
  }

  console.log('✅ Título camuflado:', camouflagedTitle);

  return camouflagedTitle;
}

/**
 * Detect which brands are present in a title
 *
 * @param title - Product title to analyze
 * @returns Array of detected brand names
 */
export function detectBrandsInTitle(title: string): string[] {
  const detected: string[] = [];
  const lowerTitle = title.toLowerCase();

  for (const brand of Object.keys(BRAND_MAPPINGS)) {
    if (lowerTitle.includes(brand)) {
      detected.push(brand);
    }
  }

  return detected;
}

/**
 * Reverse camouflage (for testing/debugging)
 *
 * @param camouflagedTitle - Camouflaged title
 * @returns Original title with full brand names
 */
export function reverse(camouflagedTitle: string): string {
  let originalTitle = camouflagedTitle;

  for (const [brand, abbreviation] of Object.entries(BRAND_MAPPINGS)) {
    if (!abbreviation) continue;
    const regex = new RegExp(`\\b${abbreviation}\\b`, 'g');
    originalTitle = originalTitle.replace(regex, brand);
  }

  return originalTitle;
}
