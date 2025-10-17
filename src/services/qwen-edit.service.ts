/**
 * 🎯 QWEN IMAGE EDIT - STEALTHIFY PRIME STRATEGY
 *
 * Implementação da estratégia testada e comprovada da Stealthify Prime.
 *
 * DIFERENÇA FUNDAMENTAL:
 * - Qwen Image Edit NÃO é inpainting tradicional (que remove objetos)
 * - É "image-to-image editing" com prompt guidance
 * - MANTÉM estrutura/textura/cores originais
 * - Remove APENAS elementos de marca sem deformar
 * - Preenche com textura matching do próprio produto
 *
 * Modelo: qwen/qwen-image-edit (Replicate)
 * Custo: $0.0025 por imagem
 * Tempo: ~3-6 segundos
 */

import { retryWithBackoff } from '@/utils/retry';

// Get token dynamically to ensure dotenv has loaded
function getReplicateToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error('REPLICATE_API_TOKEN not found in environment variables. Make sure .env.local is loaded.');
  }
  return token;
}

const REPLICATE_API_URL = 'https://api.replicate.com/v1';

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
  urls: {
    get: string;
    cancel: string;
  };
}

/**
 * Gera prompt otimizado para remoção de marcas
 * Baseado na estratégia Stealthify Prime (linhas 26-90 do qwen-image-edit)
 */
function generateBrandRemovalPrompt(
  brands: string[],
  productCategory: string = 'product',
  attemptNumber: number = 0
): string {
  console.log('🎯 Generating brand removal prompt:', {
    brands,
    category: productCategory,
    attempt: attemptNumber
  });

  // Base prompt focado em REMOVAL + PRESERVATION
  let basePrompt = 'Remove all commercial brand elements including logos, text, and symbols while maintaining perfect image quality; ';
  basePrompt += 'seamlessly fill removed areas with matching textures and patterns from surrounding material; ';
  basePrompt += 'preserve original lighting, shadows, colors, and surface details; ';

  // CRITICAL: Remove branding from shoe BOX as well - KEEP ORIGINAL COLOR
  basePrompt += 'IMPORTANT: also remove ALL logos, text, and brand elements from the product box/packaging if visible; ';
  basePrompt += 'when removing box branding, MAINTAIN THE EXACT ORIGINAL BOX COLOR - do not change the box color; ';
  basePrompt += 'only remove the logos/text and fill with the SAME color as the box already has; ';

  // Instruções específicas por categoria
  if (productCategory.toLowerCase().includes('shoe')) {
    basePrompt += 'maintain shoe material authenticity (leather, fabric, rubber, mesh textures); ';
  } else if (productCategory.toLowerCase().includes('clothing')) {
    basePrompt += 'preserve fabric weave, textile patterns, and garment structure; ';
  } else if (productCategory.toLowerCase().includes('accessory')) {
    basePrompt += 'maintain accessory material properties and surface finish; ';
  }

  // Instruções específicas por marca
  if (brands.length > 0) {
    const brandInstructions = brands.map(brand => {
      const brandLower = brand.toLowerCase();
      if (brandLower.includes('nike')) {
        return 'completely eliminate Nike swoosh logo and any Nike text or symbols';
      } else if (brandLower.includes('adidas')) {
        return 'fully remove Adidas three stripes, trefoil logo, and Adidas text';
      } else if (brandLower.includes('supreme')) {
        return 'erase all Supreme box logos and text completely';
      } else if (brandLower.includes('jordan')) {
        return 'remove Jordan jumpman logo and brand text entirely';
      } else {
        return `completely eliminate all ${brand} logos, text, and brand identifiers`;
      }
    }).join('; ');

    basePrompt += `Specific brand removal: ${brandInstructions}; `;
  } else {
    basePrompt += 'remove any visible brand logos, text, symbols, or commercial identifiers; ';
  }

  // Intensidade baseada na tentativa (multi-pass strategy)
  const intensityMap = [
    'apply careful brand removal with subtle inpainting',
    'use stronger brand elimination with enhanced texture matching',
    'execute aggressive brand removal ensuring complete elimination'
  ];

  basePrompt += intensityMap[Math.min(attemptNumber, 2)] + '; ';

  // Instruções finais de qualidade
  basePrompt += 'result must be indistinguishable from original except for complete absence of all brand elements.';

  console.log('✨ Brand removal prompt generated:', {
    promptLength: basePrompt.length,
    brandCount: brands.length,
    preview: basePrompt.substring(0, 150) + '...'
  });

  return basePrompt;
}

/**
 * Remove marcas usando Qwen Image Edit com multi-pass strategy
 *
 * Pipeline de 3 passagens com intensidade crescente (igual Stealthify Prime):
 * - Passagem 1: "careful brand removal with subtle inpainting"
 * - Passagem 2: "stronger brand elimination with enhanced texture matching"
 * - Passagem 3: "aggressive brand removal ensuring complete elimination"
 */
export async function editWithBrandRemoval(
  imageBase64: string,
  brands: string[],
  productCategory: string = 'sneaker'
): Promise<string> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    console.log(`\n🔄 Brand removal attempt ${attempt + 1}/${maxAttempts}...`);

    try {
      const result = await editImageWithQwen(imageBase64, brands, productCategory, attempt);

      console.log(`✅ Brand removal attempt ${attempt + 1} completed`);

      // Na Stealthify Prime, sempre retorna o primeiro resultado bem-sucedido
      // A verificação pós-edição decide se precisa de mais tentativas
      return result;
    } catch (error) {
      console.log(`❌ Attempt ${attempt + 1} failed:`, error);

      // Se for a última tentativa, relançar o erro
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      // Caso contrário, tentar próxima passagem
      console.log(`⏭️ Moving to next attempt with increased intensity...`);
    }
  }

  throw new Error('All brand removal attempts failed');
}

/**
 * Edita imagem usando Qwen Image Edit
 * Implementação baseada na Stealthify Prime
 */
async function editImageWithQwen(
  imageBase64: string,
  brands: string[],
  productCategory: string,
  attemptNumber: number
): Promise<string> {
  console.log('🎨 Starting Qwen Image Edit...');
  console.log(`   📝 Attempt: ${attemptNumber + 1}`);
  console.log(`   🏷️ Category: ${productCategory}`);
  console.log(`   🎯 Brands: ${brands.join(', ')}`);

  return await retryWithBackoff(
    async () => {
      // Gerar prompt otimizado
      const customPrompt = generateBrandRemovalPrompt(brands, productCategory, attemptNumber);

      // Garantir formato data URI
      const imageDataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      console.log('📤 Calling Qwen Image Edit model...');
      console.log(`   → Image: ${imageDataUrl.substring(0, 50)}...`);
      console.log(`   → Prompt: ${customPrompt.substring(0, 100)}...`);

      // Criar predição com Qwen Image Edit
      const predictionResponse = await fetch(
        `${REPLICATE_API_URL}/models/qwen/qwen-image-edit/predictions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getReplicateToken()}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=60' // Wait up to 60 seconds
          },
          body: JSON.stringify({
            input: {
              image: imageDataUrl,
              prompt: customPrompt,
              output_format: 'png',
              output_quality: 90
            }
          })
        }
      );

      if (!predictionResponse.ok) {
        const error = await predictionResponse.text();
        throw new Error(`Qwen API error: ${predictionResponse.status} - ${error}`);
      }

      let prediction: ReplicatePrediction = await predictionResponse.json();

      console.log(`   🆔 Prediction ID: ${prediction.id}`);

      // Poll para completar
      let pollCount = 0;
      while (prediction.status === 'starting' || prediction.status === 'processing') {
        pollCount++;
        console.log(`   ⏳ Status: ${prediction.status}... (poll ${pollCount})`);

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!prediction.urls?.get) {
          throw new Error('No prediction URL available');
        }

        const statusResponse = await fetch(prediction.urls.get, {
          headers: {
            'Authorization': `Bearer ${getReplicateToken()}`
          }
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
        }

        prediction = await statusResponse.json();
      }

      // Verificar status final
      if (prediction.status === 'failed') {
        throw new Error(`Qwen prediction failed: ${prediction.error || 'Unknown error'}`);
      }

      if (prediction.status === 'canceled') {
        throw new Error('Qwen prediction was canceled');
      }

      // Extrair URL da imagem editada
      let editedImageUrl: string | undefined;

      if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        editedImageUrl = prediction.output[0];
      } else if (typeof prediction.output === 'string') {
        editedImageUrl = prediction.output;
      }

      if (!editedImageUrl) {
        throw new Error('No edited image URL in Qwen response');
      }

      console.log('   ✅ Edited image generated:', editedImageUrl.substring(0, 50) + '...');

      // Baixar e converter para base64
      console.log('   📥 Downloading edited image...');
      const imageResponse = await fetch(editedImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download edited image: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const editedBase64 = Buffer.from(imageBuffer).toString('base64');

      console.log('   🎉 Qwen editing successful!');

      return editedBase64;
    },
    {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.log(`⚠️ Qwen failed (retry ${attempt}):`, error.message);
      }
    }
  );
}

/**
 * Edit image with custom user prompt (for manual editing)
 * Allows user to specify exactly what they want to edit
 */
export async function editImageWithCustomPrompt(
  imageBase64: string,
  customPrompt: string
): Promise<string> {
  console.log('✏️ Starting Custom Prompt Edit...');
  console.log(`   📝 Custom Prompt: ${customPrompt.substring(0, 100)}...`);

  return await retryWithBackoff(
    async () => {
      // Garantir formato data URI
      const imageDataUrl = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;

      console.log('📤 Calling Qwen Image Edit with custom prompt...');

      // Criar predição com Qwen Image Edit
      const predictionResponse = await fetch(
        `${REPLICATE_API_URL}/models/qwen/qwen-image-edit/predictions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${getReplicateToken()}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait=60'
          },
          body: JSON.stringify({
            input: {
              image: imageDataUrl,
              prompt: customPrompt,
              output_format: 'png',
              output_quality: 90
            }
          })
        }
      );

      if (!predictionResponse.ok) {
        const error = await predictionResponse.text();
        throw new Error(`Qwen API error: ${predictionResponse.status} - ${error}`);
      }

      let prediction: ReplicatePrediction = await predictionResponse.json();
      console.log(`   🆔 Prediction ID: ${prediction.id}`);

      // Poll para completar
      let pollCount = 0;
      while (prediction.status === 'starting' || prediction.status === 'processing') {
        pollCount++;
        console.log(`   ⏳ Status: ${prediction.status}... (poll ${pollCount})`);

        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!prediction.urls?.get) {
          throw new Error('No prediction URL available');
        }

        const statusResponse = await fetch(prediction.urls.get, {
          headers: {
            'Authorization': `Bearer ${getReplicateToken()}`
          }
        });

        if (!statusResponse.ok) {
          throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
        }

        prediction = await statusResponse.json();
      }

      // Verificar status final
      if (prediction.status === 'failed') {
        throw new Error(`Qwen prediction failed: ${prediction.error || 'Unknown error'}`);
      }

      if (prediction.status === 'canceled') {
        throw new Error('Qwen prediction was canceled');
      }

      // Extrair URL da imagem editada
      let editedImageUrl: string | undefined;

      if (Array.isArray(prediction.output) && prediction.output.length > 0) {
        editedImageUrl = prediction.output[0];
      } else if (typeof prediction.output === 'string') {
        editedImageUrl = prediction.output;
      }

      if (!editedImageUrl) {
        throw new Error('No edited image URL in Qwen response');
      }

      console.log('   ✅ Custom edit completed:', editedImageUrl.substring(0, 50) + '...');

      // Baixar e converter para base64
      console.log('   📥 Downloading edited image...');
      const imageResponse = await fetch(editedImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download edited image: ${imageResponse.status}`);
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const editedBase64 = Buffer.from(imageBuffer).toString('base64');

      console.log('   🎉 Custom editing successful!');

      return editedBase64;
    },
    {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.log(`⚠️ Custom edit failed (retry ${attempt}):`, error.message);
      }
    }
  );
}
