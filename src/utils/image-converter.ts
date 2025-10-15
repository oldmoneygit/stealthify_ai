import sharp from 'sharp';

/**
 * Convert image URL to base64 string
 *
 * @param url - Image URL to fetch and convert
 * @returns Base64-encoded image string (without data URL prefix)
 */
export async function urlToBase64(url: string): Promise<string> {
  console.log('🖼️ Convertendo URL para base64...');
  console.log('   URL:', url.substring(0, 100) + '...');

  try {
    // Fetch image with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    console.log('   Baixando imagem...');
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log('   Tamanho original:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');

    // Resize if too large (max 5MB for API)
    console.log('   Processando com Sharp...');
    const resized = await sharp(buffer)
      .resize(2048, 2048, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log('   Convertendo para base64...');
    const base64 = resized.toString('base64');

    console.log('✅ Conversão completa:', {
      originalSize: (buffer.length / 1024).toFixed(2) + ' KB',
      resizedSize: (resized.length / 1024).toFixed(2) + ' KB',
      base64Length: base64.length
    });

    return base64;

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('❌ Timeout ao baixar imagem (30s)');
      throw new Error('Image download timeout after 30 seconds');
    }

    console.error('❌ Erro na conversão:', error);
    throw new Error(
      `Failed to convert URL to base64: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Convert base64 string to data URL
 *
 * @param base64 - Base64-encoded image
 * @param mimeType - Image MIME type (default: image/jpeg)
 * @returns Data URL string
 */
export function base64ToDataUrl(
  base64: string,
  mimeType: string = 'image/jpeg'
): string {
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Extract base64 from data URL
 *
 * @param dataUrl - Data URL string
 * @returns Base64-encoded image
 */
export function dataUrlToBase64(dataUrl: string): string {
  const parts = dataUrl.split(',');
  if (parts.length !== 2) {
    throw new Error('Invalid data URL format');
  }
  return parts[1]!;
}

/**
 * Convert base64 to Buffer
 *
 * @param base64 - Base64-encoded image
 * @returns Buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

/**
 * Get image dimensions from base64
 *
 * @param base64 - Base64-encoded image
 * @returns Width and height in pixels
 */
export async function getImageDimensions(
  base64: string
): Promise<{ width: number; height: number }> {
  const buffer = base64ToBuffer(base64);
  const metadata = await sharp(buffer).metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not determine image dimensions');
  }

  return {
    width: metadata.width,
    height: metadata.height
  };
}
