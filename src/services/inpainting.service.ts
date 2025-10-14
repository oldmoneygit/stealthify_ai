import { getAccessToken } from '@/lib/vertex-auth';
import { INPAINTING_CONFIG } from '@/lib/constants';
import { getImageDimensions } from '@/utils/image-converter';
import { createBlurMask, applyBlurWithMask } from '@/utils/mask-generator';
import { retryWithBackoff } from '@/utils/retry';

const VERTEX_PROJECT_ID = process.env.GOOGLE_VERTEX_PROJECT_ID!;
const VERTEX_LOCATION = 'us-central1';
const IMAGEN_MODEL = 'imagen-3.0-generate-001';

/**
 * Remove brand logos from image using Vertex AI Imagen inpainting
 *
 * @param imageBase64 - Base64-encoded source image
 * @param maskBase64 - Base64-encoded mask (black = regions to inpaint)
 * @param brands - Array of detected brand names
 * @returns Base64-encoded edited image with logos removed
 */
export async function remove(
  imageBase64: string,
  maskBase64: string,
  brands: string[]
): Promise<string> {
  console.log('🎨 Removendo logos de marcas:', brands.join(', '));

  try {
    return await retryWithBackoff(
      async () => {
        // Get access token
        const accessToken = await getAccessToken();

        // Prepare inpainting request
        const prompt = `Remove all visible brand logos, text, and emblems from this product image. Keep the product intact and natural-looking. Fill removed areas with appropriate textures matching the surrounding context.`;

        const requestBody = {
          instances: [
            {
              prompt: prompt,
              image: {
                bytesBase64Encoded: imageBase64
              },
              mask: {
                image: {
                  bytesBase64Encoded: maskBase64
                }
              }
            }
          ],
          parameters: {
            sampleCount: INPAINTING_CONFIG.sampleCount,
            guidance: INPAINTING_CONFIG.guidance,
            strength: INPAINTING_CONFIG.strength,
            steps: INPAINTING_CONFIG.steps
          }
        };

        // Call Vertex AI Imagen API
        const response = await fetch(
          `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${IMAGEN_MODEL}:predict`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          }
        );

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Vertex AI error: ${response.status} - ${error}`);
        }

        const result = await response.json();
        const editedImage = result.predictions?.[0]?.bytesBase64Encoded;

        if (!editedImage) {
          throw new Error('No edited image in Vertex AI response');
        }

        console.log('✅ Inpainting completo');

        return editedImage;
      },
      {
        maxRetries: 2, // Fewer retries for expensive API
        onRetry: (attempt, error) => {
          console.log(`⚠️ Inpainting falhou (tentativa ${attempt}):`, error.message);
        }
      }
    );
  } catch (error) {
    console.error('❌ Inpainting falhou completamente:', error);
    console.log('🌫️ Aplicando blur como fallback...');

    // Fallback: Apply blur to regions
    return await applyBlur(imageBase64, maskBase64);
  }
}

/**
 * Apply blur to specific regions as fallback when inpainting fails
 *
 * @param imageBase64 - Base64-encoded source image
 * @param maskBase64 - Base64-encoded mask (black = regions to blur)
 * @returns Base64-encoded blurred image
 */
export async function applyBlur(
  imageBase64: string,
  maskBase64: string
): Promise<string> {
  console.log('🌫️ Aplicando blur como método alternativo...');

  try {
    const blurredImage = await applyBlurWithMask(
      imageBase64,
      maskBase64,
      50 // Blur intensity
    );

    console.log('✅ Blur aplicado com sucesso');

    return blurredImage;
  } catch (error) {
    console.error('❌ Erro ao aplicar blur:', error);
    throw new Error(
      `Failed to apply blur fallback: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Remove brands using rectangular blur regions (simpler fallback)
 *
 * @param imageBase64 - Base64-encoded source image
 * @param blurRegions - Array of rectangular regions to blur
 * @returns Base64-encoded blurred image
 */
export async function removeWithBlur(
  imageBase64: string,
  blurRegions: Array<{ x: number; y: number; width: number; height: number }>
): Promise<string> {
  console.log('🌫️ Removendo marcas com blur (', blurRegions.length, 'regiões)...');

  // Get image dimensions
  const { width, height } = await getImageDimensions(imageBase64);

  // Create blur mask from rectangular regions
  const maskBase64 = await createBlurMask(blurRegions, width, height);

  // Apply blur
  const blurredImage = await applyBlurWithMask(imageBase64, maskBase64, 50);

  console.log('✅ Blur aplicado');

  return blurredImage;
}
