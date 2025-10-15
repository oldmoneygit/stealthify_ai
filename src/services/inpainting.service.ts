import { retryWithBackoff } from '@/utils/retry';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
const REPLICATE_API_URL = 'https://api.replicate.com/v1';

// BRIA Eraser model (surgical object removal with mask)
const BRIA_ERASER_MODEL = 'bria/eraser';

// FLUX Fill Pro model (professional inpainting with prompt + mask)
const FLUX_FILL_PRO_MODEL = 'black-forest-labs/flux-fill-pro';

/**
 * FLUX Fill Pro Prompt - Ultra-simple inpainting (ZERO creativity)
 *
 * Estratégia: Minimal prompt para EVITAR que FLUX "crie" conteúdo
 * FLUX tende a "imaginar" coisas se o prompt for muito descritivo
 */
const FLUX_REMOVAL_PROMPT = `Fill the white masked areas with matching texture from surrounding area. No logos, no text.`;

/**
 * QWEN STANDALONE PROMPT - ULTRA CONSERVATIVE VERSION
 *
 * Estratégia: MÁXIMA preservação de estrutura - apenas pintar logos
 * Problema anterior: Qwen estava removendo caixas inteiras
 */
const BRAND_REMOVAL_PROMPT = `TASK: Paint over brand logos with matching colors. DO NOT remove any objects.

CRITICAL RULE #1: NEVER REMOVE BOXES OR OBJECTS
The image has product boxes in the background. These boxes MUST stay in the image. Only paint over logos ON the boxes.

CRITICAL RULE #2: NEVER ADD NEW LOGOS
Do not create new swoosh shapes or brand symbols. Only erase existing ones.

WHAT TO PAINT OVER:
• Nike swoosh (the checkmark symbol) - paint it with matching surface color
• Jordan Jumpman (jumping person) - paint it with matching surface color
• Brand text like "NIKE", "AIR", "JORDAN" - paint over with matching color

HOW TO PAINT:
1. Find a Nike swoosh on a shoe → paint over it with the shoe's color (keep the shoe)
2. Find Nike text on a box → paint over it with the box's color (keep the box)
3. Find Jumpman logo → paint over it with matching color (keep the object underneath)

WHAT TO KEEP (DO NOT REMOVE):
• ALL boxes and packaging (even if they have logos - just paint over the logos)
• BOTH shoes in the photo
• Background, floor, shadows
• Product tags and laces

SUCCESS = Image looks the same but logos are painted over. Nothing is removed or deleted.`;



/**
 * Gera contexto do Gemini para o Qwen (Pipeline Híbrido)
 * Converte coordenadas do Gemini em instruções claras para o Qwen
 */
function generateGeminiContextForQwen(
  regions: DetectionRegion[],
  brands: string[]
): string {
  if (!regions || regions.length === 0) return '';

  const locationDescriptions: string[] = [];

  regions.forEach((region, index) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;

    // Converter coordenadas normalizadas (0-1000) para porcentagens
    const topPercent = (ymin / 1000) * 100;
    const leftPercent = (xmin / 1000) * 100;
    const widthPercent = ((xmax - xmin) / 1000) * 100;
    const heightPercent = ((ymax - ymin) / 1000) * 100;

    // Determinar posição (top/middle/bottom + left/center/right)
    let verticalPos = 'middle';
    if (topPercent < 33) verticalPos = 'top';
    else if (topPercent > 66) verticalPos = 'bottom';

    let horizontalPos = 'center';
    if (leftPercent < 33) horizontalPos = 'left';
    else if (leftPercent > 66) horizontalPos = 'right';

    const position = `${verticalPos}-${horizontalPos}`;

    // Determinar tamanho
    const avgSize = (widthPercent + heightPercent) / 2;
    let sizeDesc = 'medium';
    if (avgSize < 5) sizeDesc = 'small';
    else if (avgSize > 15) sizeDesc = 'large';

    const brandName = brands[index] || 'brand logo';

    locationDescriptions.push(
      `Location ${index + 1}: ${brandName} at ${position} (${sizeDesc} size, ~${Math.round(topPercent)}% from top, ~${Math.round(leftPercent)}% from left)`
    );
  });

  return `\n\n🔍 GEMINI DETECTION RESULTS:
Google Vision AI detected ${regions.length} brand element(s) in this image:

${locationDescriptions.join('\n')}

Focus your editing on these detected areas. Make sure to remove ALL brand elements in these locations completely.`;
}

/**
 * SECOND PASS: Even more emphasis on preserving boxes
 */
const AGGRESSIVE_BRAND_REMOVAL_PROMPT = (remainingBrands: string[]) => `
⚠️⚠️⚠️ SECOND PASS - MAXIMUM CAUTION REQUIRED ⚠️⚠️⚠️

ABSOLUTE RULE #1: PRODUCT BOXES AND PACKAGING ARE UNTOUCHABLE
Even though brands are still detected, you MUST NOT remove or modify any product boxes or packaging.

DETECTED BRANDS STILL VISIBLE: ${remainingBrands.join(', ')}

YOUR MISSION: Remove these logos ONLY from the SHOE SURFACE (not from boxes or packaging)

SPECIFIC TARGETS (on shoes only):
${remainingBrands.map(brand => {
  if (brand.toLowerCase().includes('nike')) {
    return `- ${brand}: Remove swoosh logos ON THE SHOE (sides, tongue, heel) - NOT on the box`;
  }
  if (brand.toLowerCase().includes('adidas')) {
    return `- ${brand}: Remove three stripes ON THE SHOE - NOT on the box`;
  }
  if (brand.toLowerCase().includes('jordan')) {
    return `- ${brand}: Remove Jumpman logos ON THE SHOE - NOT on the box`;
  }
  return `- ${brand}: Remove logos ON THE SHOE ONLY - NOT on packaging`;
}).join('\n')}

⛔ FORBIDDEN ACTIONS:
1. Removing product boxes or packaging (NEVER DO THIS)
2. Editing box artwork, text, or logos (LEAVE BOX INTACT)
3. Modifying backgrounds or surfaces
4. Changing shoe colors or textures
5. Altering any element that is NOT a logo ON THE SHOE

✅ ALLOWED ACTIONS:
- Remove brand logos that are ON the shoe surface
- Fill logo areas with matching shoe texture
- Make surgical edits ONLY on the shoe itself

REMEMBER: The box in the background is PART OF THE PRODUCT PHOTO. Do not remove it. Only edit the shoe.
`.trim();

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string[];
  error?: string;
  urls: {
    get: string;
    cancel: string;
  };
}

interface DetectionRegion {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalizado 0-1000
  brand?: string;
}

/**
 * Gera prompt personalizado com localização ESPECÍFICA dos logos
 *
 * Estratégia: Descrever EXATAMENTE onde cada logo está na imagem
 * para o Qwen saber onde editar com precisão cirúrgica
 */
function generateLocationSpecificPrompt(
  regions: DetectionRegion[],
  brands: string[]
): string {
  if (regions.length === 0) {
    return ''; // Sem regiões, sem localização específica
  }

  const locations: string[] = [];

  regions.forEach((region, index) => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;

    // Normalizar para percentual da imagem (0-100%)
    const topPercent = (ymin / 1000) * 100;
    const leftPercent = (xmin / 1000) * 100;
    const widthPercent = ((xmax - xmin) / 1000) * 100;
    const heightPercent = ((ymax - ymin) / 1000) * 100;

    // Determinar posição descritiva
    let verticalPos = 'center';
    if (topPercent < 33) verticalPos = 'top';
    else if (topPercent > 66) verticalPos = 'bottom';

    let horizontalPos = 'center';
    if (leftPercent < 33) horizontalPos = 'left';
    else if (leftPercent > 66) horizontalPos = 'right';

    const position = `${verticalPos}${horizontalPos !== 'center' ? '-' + horizontalPos : ''}`;

    // Determinar tamanho
    const avgSize = (widthPercent + heightPercent) / 2;
    let sizeDesc = 'medium';
    if (avgSize < 5) sizeDesc = 'small';
    else if (avgSize > 15) sizeDesc = 'large';

    const brandName = brands[index] || 'brand logo';

    locations.push(`- Brand element #${index + 1} (${brandName}): ${position} area, ${sizeDesc} size → Remove ONLY logo/text, keep object`);
  });

  return `\n\n🎯 SPECIFIC LOCATIONS:\n${locations.join('\n')}\n\n💡 IMPORTANT: These are locations of logos/text to remove. If a logo is ON a box, remove the logo but KEEP the box with its original color.`;
}

/**
 * Remove brand logos from image using Qwen Image Edit Plus (Replicate)
 *
 * This is a MUCH better approach than Vertex AI Imagen for surgical logo removal.
 * Qwen maintains 100% image fidelity while precisely removing only brand elements.
 *
 * @param imageBase64 - Base64-encoded source image
 * @param maskBase64 - DEPRECATED: Qwen não usa máscara (mantido para compatibilidade)
 * @param brands - Array of detected brand names (for logging)
 * @param regions - OPTIONAL: Regiões detectadas pelo Gemini para prompt personalizado
 * @returns Base64-encoded edited image with logos removed
 */
export async function remove(
  imageBase64: string,
  maskBase64: string,
  brands: string[],
  regions?: DetectionRegion[]
): Promise<string> {
  console.log('🎨 Removendo logos com Qwen Image Edit Plus:', brands.join(', '));

  try {
    return await retryWithBackoff(
      async () => {
        // Convert base64 to data URL
        const imageDataUrl = `data:image/jpeg;base64,${imageBase64}`;

        // Criar prompt com contexto do Gemini (se disponível)
        let fullPrompt = BRAND_REMOVAL_PROMPT;

        if (regions && regions.length > 0) {
          // Pipeline HÍBRIDO: Gemini detectou, Qwen edita com contexto
          const geminiContext = generateGeminiContextForQwen(regions, brands);
          fullPrompt = BRAND_REMOVAL_PROMPT + geminiContext;

          console.log('📝 Usando prompt HÍBRIDO - Gemini detectou, Qwen edita com contexto');
          console.log(`   🎯 ${regions.length} região(ões) detectada(s) pelo Gemini`);
        } else {
          // Fallback: Qwen analisa sozinho
          console.log('📝 Usando prompt STANDALONE - Qwen vai analisar e editar autonomamente');
          console.log('   ⚠️  Nenhuma região fornecida pelo Gemini');
        }

        // Create prediction with Qwen
        const predictionResponse = await fetch(
          `${REPLICATE_API_URL}/models/qwen/qwen-image-edit-plus/predictions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait=60' // Wait up to 60 seconds for result
            },
            body: JSON.stringify({
              input: {
                image: [imageDataUrl],
                prompt: fullPrompt,
                output_format: 'png',
                output_quality: 100, // Máxima qualidade para preservar fidelidade
                go_fast: false // Desativado para máxima precisão (prioriza qualidade sobre velocidade)
              }
            })
          }
        );

        if (!predictionResponse.ok) {
          const error = await predictionResponse.text();
          throw new Error(`Replicate API error: ${predictionResponse.status} - ${error}`);
        }

        let prediction: ReplicatePrediction = await predictionResponse.json();

        // Poll for completion if still processing (optimized for speed)
        let pollCount = 0;
        while (prediction.status === 'starting' || prediction.status === 'processing') {
          pollCount++;
          console.log(`⏳ Status: ${prediction.status}... (poll ${pollCount})`);

          // Faster polling: 500ms for first 10 attempts, then 1s
          const pollDelay = pollCount < 10 ? 500 : 1000;
          await new Promise(resolve => setTimeout(resolve, pollDelay));

          if (!prediction.urls?.get) {
            throw new Error('No prediction URL available');
          }

          const statusResponse = await fetch(prediction.urls.get, {
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
            }
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
          }

          prediction = await statusResponse.json();
        }

        // Check final status
        if (prediction.status === 'failed') {
          throw new Error(`Qwen prediction failed: ${prediction.error || 'Unknown error'}`);
        }

        if (prediction.status === 'canceled') {
          throw new Error('Qwen prediction was canceled');
        }

        if (!prediction.output || prediction.output.length === 0) {
          throw new Error('No output image from Qwen');
        }

        // Get the edited image URL
        const editedImageUrl = prediction.output[0];
        if (!editedImageUrl) {
          throw new Error('No output URL in Qwen response');
        }

        console.log('✅ Imagem editada gerada:', editedImageUrl);

        // Download and convert to base64
        const imageResponse = await fetch(editedImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download edited image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const editedBase64 = Buffer.from(imageBuffer).toString('base64');

        console.log('✅ Remoção de logos completa com Qwen');

        return editedBase64;
      },
      {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.log(`⚠️ Qwen falhou (tentativa ${attempt}):`, error.message);
        }
      }
    );
  } catch (error) {
    console.error('❌ Qwen falhou completamente:', error);
    throw new Error(
      `Failed to remove logos with Qwen: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Re-edit image with AGGRESSIVE prompt when brands are still detected
 *
 * @param imageBase64 - Base64-encoded image that still has brands
 * @param remainingBrands - Array of brand names still detected
 * @returns Base64-encoded re-edited image
 */
export async function removeAggressively(
  imageBase64: string,
  remainingBrands: string[]
): Promise<string> {
  console.log('🔥 RE-EDITANDO COM PROMPT AGRESSIVO:', remainingBrands.join(', '));

  try {
    return await retryWithBackoff(
      async () => {
        const imageDataUrl = `data:image/png;base64,${imageBase64}`;

        // Use aggressive prompt
        const aggressivePrompt = AGGRESSIVE_BRAND_REMOVAL_PROMPT(remainingBrands);

        const predictionResponse = await fetch(
          `${REPLICATE_API_URL}/models/qwen/qwen-image-edit-plus/predictions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait=60'
            },
            body: JSON.stringify({
              input: {
                image: [imageDataUrl],
                prompt: aggressivePrompt,
                output_format: 'png',
                output_quality: 100, // Máxima qualidade para preservar fidelidade
                go_fast: false // Desativado para máxima precisão
              }
            })
          }
        );

        if (!predictionResponse.ok) {
          const error = await predictionResponse.text();
          throw new Error(`Replicate API error: ${predictionResponse.status} - ${error}`);
        }

        let prediction: ReplicatePrediction = await predictionResponse.json();

        // Fast polling
        let pollCount = 0;
        while (prediction.status === 'starting' || prediction.status === 'processing') {
          pollCount++;
          console.log(`⏳ Re-edição status: ${prediction.status}... (poll ${pollCount})`);

          const pollDelay = pollCount < 10 ? 500 : 1000;
          await new Promise(resolve => setTimeout(resolve, pollDelay));

          if (!prediction.urls?.get) {
            throw new Error('No prediction URL available');
          }

          const statusResponse = await fetch(prediction.urls.get, {
            headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` }
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
          }

          prediction = await statusResponse.json();
        }

        if (prediction.status === 'failed') {
          throw new Error(`Qwen re-edit failed: ${prediction.error || 'Unknown error'}`);
        }

        if (!prediction.output || prediction.output.length === 0) {
          throw new Error('No output from Qwen re-edit');
        }

        const editedImageUrl = prediction.output[0];
        if (!editedImageUrl) {
          throw new Error('No output URL in Qwen re-edit response');
        }

        console.log('✅ Re-edição completa:', editedImageUrl);

        const imageResponse = await fetch(editedImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download re-edited image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const editedBase64 = Buffer.from(imageBuffer).toString('base64');

        console.log('✅ Re-remoção agressiva completa');

        return editedBase64;
      },
      {
        maxRetries: 1, // Only 1 retry for aggressive mode
        onRetry: (attempt, error) => {
          console.log(`⚠️ Re-edição agressiva falhou (tentativa ${attempt}):`, error.message);
        }
      }
    );
  } catch (error) {
    console.error('❌ Re-edição agressiva falhou:', error);
    throw new Error(
      `Failed to re-edit aggressively: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Remove brands using rectangular blur regions (NOT NEEDED with Qwen)
 *
 * @deprecated Qwen handles brand removal intelligently without blur
 */
export async function removeWithBlur(
  imageBase64: string,
  blurRegions: Array<{ x: number; y: number; width: number; height: number }>
): Promise<string> {
  console.log('⚠️ removeWithBlur chamado - mas não deveria ser necessário com Qwen');
  return imageBase64;
}

/**
 * 🆕 Remove brand logos using BRIA Eraser (mask-based surgical removal)
 *
 * BRIA Eraser is the BEST solution for logo removal:
 * - Uses binary mask (precise control)
 * - Preserves 100% of structure (no accidental removals)
 * - Removes ONLY masked areas (white pixels in mask)
 * - Fast (~6-8 seconds)
 * - High quality inpainting
 *
 * @param imageBase64 - Base64-encoded source image (without data URI prefix)
 * @param maskBase64 - Base64-encoded mask in data URI format (white = remove, black = keep)
 * @param brands - Array of detected brand names (for logging)
 * @returns Base64-encoded edited image with logos removed
 */
export async function removeWithBRIA(
  imageBase64: string,
  maskBase64: string,
  brands: string[]
): Promise<string> {
  console.log('✨ Removendo logos com BRIA Eraser (mask-based):', brands.join(', '));
  console.log('   🎯 Vantagem: Controle TOTAL com máscara - preserva estrutura 100%');

  try {
    return await retryWithBackoff(
      async () => {
        // Ensure both image and mask have data URI prefix
        const imageDataUrl = imageBase64.startsWith('data:')
          ? imageBase64
          : `data:image/jpeg;base64,${imageBase64}`;

        const maskDataUrl = maskBase64.startsWith('data:')
          ? maskBase64
          : `data:image/png;base64,${maskBase64}`;

        console.log('📤 Enviando para BRIA Eraser...');
        console.log(`   → Imagem: ${imageDataUrl.substring(0, 50)}...`);
        console.log(`   → Máscara: ${maskDataUrl.substring(0, 50)}...`);

        // Create prediction with BRIA Eraser
        const predictionResponse = await fetch(
          `${REPLICATE_API_URL}/models/${BRIA_ERASER_MODEL}/predictions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait=60' // Wait up to 60 seconds for result
            },
            body: JSON.stringify({
              input: {
                image: imageDataUrl,
                mask: maskDataUrl
              }
            })
          }
        );

        if (!predictionResponse.ok) {
          const error = await predictionResponse.text();
          throw new Error(`BRIA Eraser API error: ${predictionResponse.status} - ${error}`);
        }

        let prediction: ReplicatePrediction = await predictionResponse.json();

        console.log(`   🆔 Prediction ID: ${prediction.id}`);

        // Poll for completion
        let pollCount = 0;
        while (prediction.status === 'starting' || prediction.status === 'processing') {
          pollCount++;
          console.log(`   ⏳ Status: ${prediction.status}... (poll ${pollCount})`);

          // Polling every 1 second
          await new Promise(resolve => setTimeout(resolve, 1000));

          if (!prediction.urls?.get) {
            throw new Error('No prediction URL available');
          }

          const statusResponse = await fetch(prediction.urls.get, {
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
            }
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
          }

          prediction = await statusResponse.json();
        }

        // Check final status
        if (prediction.status === 'failed') {
          throw new Error(`BRIA Eraser failed: ${prediction.error || 'Unknown error'}`);
        }

        if (prediction.status === 'canceled') {
          throw new Error('BRIA Eraser prediction was canceled');
        }

        // Debug: log full prediction response
        console.log('   🔍 DEBUG - Prediction completa:', JSON.stringify(prediction, null, 2));

        if (!prediction.output) {
          throw new Error('No output in BRIA Eraser response');
        }

        console.log('   🔍 DEBUG - Output type:', typeof prediction.output);
        console.log('   🔍 DEBUG - Output value:', prediction.output);

        // BRIA Eraser returns output as a string URL (not array)
        let editedImageUrl: string;

        if (typeof prediction.output === 'string') {
          editedImageUrl = prediction.output;
        } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
          const firstOutput = prediction.output[0];
          if (!firstOutput) {
            throw new Error('First output element is undefined');
          }
          editedImageUrl = firstOutput;
        } else {
          throw new Error(`Invalid output format from BRIA Eraser: ${JSON.stringify(prediction.output)}`);
        }

        if (!editedImageUrl || editedImageUrl.length < 10) {
          throw new Error(`Invalid output URL from BRIA Eraser: "${editedImageUrl}"`);
        }

        console.log('   ✅ Imagem editada gerada:', editedImageUrl);

        // Download and convert to base64
        console.log('   📥 Baixando imagem editada...');
        const imageResponse = await fetch(editedImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download edited image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const editedBase64 = Buffer.from(imageBuffer).toString('base64');

        console.log('   ✅ Remoção completa com BRIA Eraser!');
        console.log('   🎉 Estrutura preservada - logos removidos cirurgicamente');

        return editedBase64;
      },
      {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.log(`⚠️ BRIA Eraser falhou (tentativa ${attempt}):`, error.message);
        }
      }
    );
  } catch (error) {
    console.error('❌ BRIA Eraser falhou completamente:', error);
    throw new Error(
      `Failed to remove logos with BRIA Eraser: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * 🚀 Remove brand logos using FLUX Fill Pro (prompt + mask-based inpainting)
 *
 * FLUX Fill Pro is a professional inpainting model with state-of-the-art performance:
 * - Uses prompt + mask for precise control
 * - Preserves image structure 100% (conservative inpainting)
 * - High quality results with natural, seamless edits
 * - Configurable guidance/steps for fine-tuning
 * - Fast (~3-5 seconds)
 * - Price: $0.05 per image
 *
 * @param imageBase64 - Base64-encoded source image (without data URI prefix)
 * @param maskBase64 - Base64-encoded mask in data URI format (white = remove, black = keep)
 * @param brands - Array of detected brand names (for context in prompt)
 * @returns Base64-encoded edited image with logos removed
 */
export async function removeWithFLUX(
  imageBase64: string,
  maskBase64: string,
  brands: string[]
): Promise<string> {
  console.log('🚀 Removendo logos com FLUX Fill Pro (prompt + mask):', brands.join(', '));
  console.log('   🎯 Vantagem: Controle via prompt + máscara - preserva estrutura 100%');

  try {
    return await retryWithBackoff(
      async () => {
        // Ensure both image and mask have data URI prefix
        const imageDataUrl = imageBase64.startsWith('data:')
          ? imageBase64
          : `data:image/jpeg;base64,${imageBase64}`;

        const maskDataUrl = maskBase64.startsWith('data:')
          ? maskBase64
          : `data:image/png;base64,${maskBase64}`;

        // Add brand context to prompt
        const brandsContext = brands.length > 0
          ? `\n\nDetected brands to remove: ${brands.join(', ')}`
          : '';

        const fullPrompt = FLUX_REMOVAL_PROMPT + brandsContext;

        console.log('📤 Enviando para FLUX Fill Pro...');
        console.log(`   → Imagem: ${imageDataUrl.substring(0, 50)}...`);
        console.log(`   → Máscara: ${maskDataUrl.substring(0, 50)}...`);
        console.log(`   → Prompt: ${fullPrompt.substring(0, 100)}...`);

        // Create prediction with FLUX Fill Pro
        const predictionResponse = await fetch(
          `${REPLICATE_API_URL}/models/${FLUX_FILL_PRO_MODEL}/predictions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
              'Content-Type': 'application/json',
              'Prefer': 'wait=60' // Wait up to 60 seconds for result
            },
            body: JSON.stringify({
              input: {
                image: imageDataUrl,
                mask: maskDataUrl,
                prompt: fullPrompt,
                guidance: 2.5,        // MÍNIMO = máxima liberdade para copiar textura (não inventar)
                steps: 28,            // Padrão recomendado (não muito alto = menos criatividade)
                output_format: 'png', // PNG para máxima qualidade
                safety_tolerance: 6   // Máximo permissivo para editar produtos de marca (1-6)
              }
            })
          }
        );

        if (!predictionResponse.ok) {
          const error = await predictionResponse.text();
          throw new Error(`FLUX Fill Pro API error: ${predictionResponse.status} - ${error}`);
        }

        let prediction: ReplicatePrediction = await predictionResponse.json();

        console.log(`   🆔 Prediction ID: ${prediction.id}`);

        // Poll for completion
        let pollCount = 0;
        while (prediction.status === 'starting' || prediction.status === 'processing') {
          pollCount++;
          console.log(`   ⏳ Status: ${prediction.status}... (poll ${pollCount})`);

          // Polling every 1 second
          await new Promise(resolve => setTimeout(resolve, 1000));

          if (!prediction.urls?.get) {
            throw new Error('No prediction URL available');
          }

          const statusResponse = await fetch(prediction.urls.get, {
            headers: {
              'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
            }
          });

          if (!statusResponse.ok) {
            throw new Error(`Failed to check prediction status: ${statusResponse.status}`);
          }

          prediction = await statusResponse.json();
        }

        // Check final status
        if (prediction.status === 'failed') {
          throw new Error(`FLUX Fill Pro failed: ${prediction.error || 'Unknown error'}`);
        }

        if (prediction.status === 'canceled') {
          throw new Error('FLUX Fill Pro prediction was canceled');
        }

        if (!prediction.output) {
          throw new Error('No output in FLUX Fill Pro response');
        }

        console.log('   🔍 Output type:', typeof prediction.output);
        console.log('   🔍 Output value:', Array.isArray(prediction.output) ? `[${prediction.output.length} items]` : prediction.output);

        // FLUX Fill Pro returns output as a string URL or array
        let editedImageUrl: string;

        if (typeof prediction.output === 'string') {
          editedImageUrl = prediction.output;
        } else if (Array.isArray(prediction.output) && prediction.output.length > 0) {
          const firstOutput = prediction.output[0];
          if (!firstOutput) {
            throw new Error('First output element is undefined');
          }
          editedImageUrl = firstOutput;
        } else {
          throw new Error(`Invalid output format from FLUX Fill Pro: ${JSON.stringify(prediction.output)}`);
        }

        if (!editedImageUrl || editedImageUrl.length < 10) {
          throw new Error(`Invalid output URL from FLUX Fill Pro: "${editedImageUrl}"`);
        }

        console.log('   ✅ Imagem editada gerada:', editedImageUrl);

        // Download and convert to base64
        console.log('   📥 Baixando imagem editada...');
        const imageResponse = await fetch(editedImageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download edited image: ${imageResponse.status}`);
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const editedBase64 = Buffer.from(imageBuffer).toString('base64');

        console.log('   ✅ Remoção completa com FLUX Fill Pro!');
        console.log('   🎉 Estrutura preservada - logos removidos com precisão');

        return editedBase64;
      },
      {
        maxRetries: 2,
        onRetry: (attempt, error) => {
          console.log(`⚠️ FLUX Fill Pro falhou (tentativa ${attempt}):`, error.message);
        }
      }
    );
  } catch (error) {
    console.error('❌ FLUX Fill Pro falhou completamente:', error);
    throw new Error(
      `Failed to remove logos with FLUX Fill Pro: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
