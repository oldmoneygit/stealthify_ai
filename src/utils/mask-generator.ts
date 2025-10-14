import sharp from 'sharp';
import type { Segment } from '@/lib/types';

/**
 * Create binary mask image from polygon segments
 *
 * @param segments - Array of polygon segments
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Base64-encoded mask image (white = keep, black = remove)
 */
export async function createMask(
  segments: Segment[],
  width: number,
  height: number
): Promise<string> {
  console.log('🎭 Criando máscara de', segments.length, 'segmentos...');

  // Create SVG with polygons
  const polygons = segments.map(segment => {
    const points = segment.polygon
      .map(p => `${p.x * width},${p.y * height}`)
      .join(' ');

    return `<polygon points="${points}" fill="black" />`;
  }).join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white" />
      ${polygons}
    </svg>
  `.trim();

  // Convert SVG to PNG
  const maskBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  const maskBase64 = maskBuffer.toString('base64');

  console.log('✅ Máscara criada:', {
    segments: segments.length,
    size: `${width}x${height}`,
    base64Length: maskBase64.length
  });

  return maskBase64;
}

/**
 * Create blur mask from rectangular regions
 *
 * @param regions - Array of rectangular blur regions
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Base64-encoded mask image
 */
export async function createBlurMask(
  regions: Array<{ x: number; y: number; width: number; height: number }>,
  width: number,
  height: number
): Promise<string> {
  console.log('🎭 Criando máscara de blur com', regions.length, 'regiões...');

  // Create SVG with rectangles
  const rectangles = regions.map(region => {
    const x = region.x * width;
    const y = region.y * height;
    const w = region.width * width;
    const h = region.height * height;

    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black" />`;
  }).join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white" />
      ${rectangles}
    </svg>
  `.trim();

  // Convert SVG to PNG
  const maskBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  return maskBuffer.toString('base64');
}

/**
 * Apply blur to specific regions of an image
 *
 * @param imageBase64 - Base64-encoded source image
 * @param maskBase64 - Base64-encoded mask (black = blur regions)
 * @param blurAmount - Blur intensity (default: 50)
 * @returns Base64-encoded blurred image
 */
export async function applyBlurWithMask(
  imageBase64: string,
  maskBase64: string,
  blurAmount: number = 50
): Promise<string> {
  console.log('🌫️ Aplicando blur com máscara...');

  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const maskBuffer = Buffer.from(maskBase64, 'base64');

  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Create blurred version
  const blurred = await sharp(imageBuffer)
    .blur(blurAmount)
    .toBuffer();

  // Composite: original where mask is white, blurred where mask is black
  const result = await sharp(imageBuffer)
    .composite([
      {
        input: blurred,
        blend: 'over'
      },
      {
        input: maskBuffer,
        blend: 'dest-in'
      }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log('✅ Blur aplicado');

  return result.toString('base64');
}
