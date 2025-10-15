/**
 * Warp Service - Localized geometric deformation to distort brand logos
 *
 * Uses Vision AI to detect precise bounding boxes of remaining logos,
 * then applies mesh warping to distort only those specific regions.
 *
 * This is a fallback strategy when inpainting fails to fully remove logos.
 */

import sharp from 'sharp';
import { retryWithBackoff } from '@/utils/retry';
import path from 'path';
import fs from 'fs/promises';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

interface BoundingBox {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  width: number; // normalized 0-1
  height: number; // normalized 0-1
}

interface LogoDetection {
  brand: string;
  confidence: number;
  boundingBox: BoundingBox;
}

/**
 * Save debug image with bounding boxes drawn (for visual debugging)
 */
async function saveDebugImageWithBoxes(
  imageBase64: string,
  detections: LogoDetection[]
): Promise<void> {
  const imageBuffer = Buffer.from(imageBase64, 'base64');
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return;
  }

  const { width, height } = metadata;

  // Create SVG overlay with bounding boxes
  const boxes = detections.map((det, idx) => {
    const x = Math.round(det.boundingBox.x * width);
    const y = Math.round(det.boundingBox.y * height);
    const w = Math.round(det.boundingBox.width * width);
    const h = Math.round(det.boundingBox.height * height);

    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
            fill="none" stroke="red" stroke-width="3" />
      <text x="${x}" y="${y - 5}" font-size="20" fill="red" font-weight="bold">
        ${idx + 1}: ${det.brand}
      </text>
    `;
  }).join('');

  const svgOverlay = `
    <svg width="${width}" height="${height}">
      ${boxes}
    </svg>
  `;

  // Composite SVG overlay onto image
  const debugImage = await image
    .composite([{
      input: Buffer.from(svgOverlay),
      top: 0,
      left: 0
    }])
    .png()
    .toBuffer();

  // Save to public/debug folder
  const debugDir = path.join(process.cwd(), 'public', 'debug');
  await fs.mkdir(debugDir, { recursive: true });

  const timestamp = Date.now();
  const filename = `warp-detection-${timestamp}.png`;
  const filepath = path.join(debugDir, filename);

  await fs.writeFile(filepath, debugImage);

  console.log(`🔍 DEBUG: Imagem com bounding boxes salva em: /debug/${filename}`);
}

/**
 * Detect remaining logos with precise bounding boxes using Vision AI
 *
 * @param imageBase64 - Base64-encoded image (with or without data URI prefix)
 * @param targetBrands - Array of brand names to look for
 * @returns Array of detected logos with bounding boxes
 */
export async function detectLogosWithBoxes(
  imageBase64: string,
  targetBrands: string[]
): Promise<LogoDetection[]> {
  console.log('🎯 Detectando logos com bounding boxes para:', targetBrands.join(', '));

  // Remove data URI prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const prompt = `
You are a SURGICAL brand logo detector. Find ONLY the actual logo graphics/symbols/text - NOT product areas.

TARGET BRANDS: ${targetBrands.join(', ')}

🎯 WHAT TO DETECT:
- Nike: ONLY the SWOOSH symbol (checkmark ✓ shape) - usually 2-5cm on product
- Nike: ONLY "NIKE" text (letters) - NOT the product itself
- Adidas: ONLY the 3 stripes or trefoil symbol - NOT the product
- Jordan: ONLY the Jumpman silhouette - NOT the product

❌ DO NOT DETECT:
- General product areas (shoes, clothing, boxes)
- Areas where logo MIGHT be but you can't see it clearly
- Blurred/unclear regions unless you can clearly identify the logo shape
- Background or packaging (unless logo is clearly visible there)

📏 BOUNDING BOX RULES:
1. Box MUST be TINY and TIGHT around ONLY the logo symbol itself
2. For Nike swoosh: Usually 0.03-0.08 in width, 0.02-0.05 in height
3. For brand text: Usually 0.05-0.15 in width, 0.02-0.05 in height
4. If box is larger than 0.20 in width/height, you're probably detecting too much area

🔍 PRECISION REQUIRED:
- Swoosh on shoe side → Box covers ONLY the swoosh (≈3-5cm)
- "NIKE" text on box → Box covers ONLY the letters
- Multiple swooshes → Return EACH ONE separately with tight box

COORDINATES (normalized 0-1):
- x, y = top-left corner of LOGO ONLY
- width, height = LOGO dimensions (NOT product dimensions)

Example Nike swoosh (small, on side of shoe):
{
  "brand": "Nike",
  "confidence": 90,
  "boundingBox": {
    "x": 0.32,
    "y": 0.58,
    "width": 0.05,
    "height": 0.03
  }
}

Return JSON only:
{
  "detections": [
    // ... array of logo detections with TIGHT bounding boxes
  ]
}

If NO clear logos: {"detections": []}
`.trim();

  return retryWithBackoff(async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vision AI error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in Vision AI response');
    }

    const parsed = JSON.parse(content);
    let detections: LogoDetection[] = parsed.detections || [];

    console.log(`✅ Detectados ${detections.length} logos com bounding boxes (antes de filtrar):`);

    // Filter out bounding boxes that are too large (probably detecting product area, not logo)
    // Nike swoosh is typically 3-8% of image width, 2-5% of image height
    const MAX_LOGO_WIDTH = 0.25; // 25% of image width (anything larger is likely product area)
    const MAX_LOGO_HEIGHT = 0.25; // 25% of image height

    const filteredDetections = detections.filter((det, idx) => {
      const box = det.boundingBox;
      const isValid = box.width <= MAX_LOGO_WIDTH && box.height <= MAX_LOGO_HEIGHT;

      if (!isValid) {
        console.log(`   ❌ [${idx + 1}] ${det.brand} FILTRADO (box muito grande)`);
        console.log(`       Size: w=${box.width.toFixed(3)} (max ${MAX_LOGO_WIDTH}), h=${box.height.toFixed(3)} (max ${MAX_LOGO_HEIGHT})`);
      } else {
        console.log(`   ✅ [${idx + 1}] ${det.brand} (${det.confidence}%)`);
        console.log(`       Position: x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}`);
        console.log(`       Size: w=${box.width.toFixed(3)}, h=${box.height.toFixed(3)}`);
      }

      return isValid;
    });

    detections = filteredDetections;
    console.log(`\n📊 Total após filtrar boxes grandes: ${detections.length} logo(s) válido(s)`);

    // DEBUG: Save image with bounding boxes drawn (para debug visual)
    if (detections.length > 0) {
      try {
        await saveDebugImageWithBoxes(base64Data, detections);
      } catch (error) {
        console.log('⚠️ Não foi possível salvar imagem de debug:', error);
      }
    }

    return detections;
  }, {
    onRetry: (attempt, error) => {
      console.log(`⚠️ Detecção de bounding boxes falhou (tentativa ${attempt}):`, error.message);
    }
  });
}

/**
 * Apply BLACK MASK to specific regions (hide remaining logos completely)
 *
 * @param imageBase64 - Base64-encoded image
 * @param boundingBoxes - Array of regions to blacken
 * @returns Base64-encoded image with black masks
 */
export async function applyBlackMask(
  imageBase64: string,
  boundingBoxes: BoundingBox[]
): Promise<string> {
  console.log(`⬛ Aplicando máscaras pretas em ${boundingBoxes.length} região(ões)`);

  // Remove data URI prefix
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Load image with sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not get image dimensions');
  }

  const { width, height } = metadata;

  console.log(`📐 Dimensões da imagem: ${width}x${height}`);

  // Create composites array for all black masks
  const blackMasks: sharp.OverlayOptions[] = [];

  for (let i = 0; i < boundingBoxes.length; i++) {
    const box = boundingBoxes[i];

    if (!box) {
      console.warn(`⚠️ Box ${i} is undefined, skipping...`);
      continue;
    }

    console.log(`⬛ Criando máscara preta ${i + 1}/${boundingBoxes.length}:`);
    console.log(`   Normalized: x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, w=${box.width.toFixed(3)}, h=${box.height.toFixed(3)}`);

    // Convert normalized coordinates to pixels
    // 🎯 AJUSTE FINO: Offset para corrigir deslocamento observado
    // Observação do usuário: máscaras ainda aparecem "um pouco acima e à esquerda"
    // Solução: aumentar offset Y e X para posicionamento mais preciso
    const offsetY = 0.015; // ~1.5% offset para baixo (aumentado de 0.008)
    const offsetX = 0.008; // ~0.8% offset para direita (aumentado de 0.003)

    const x = Math.round((box.x + offsetX) * width);
    const y = Math.round((box.y + offsetY) * height);
    const boxWidth = Math.round(box.width * width);
    const boxHeight = Math.round(box.height * height);

    console.log(`   Pixels (ajustado): x=${x}px (+${Math.round(offsetX * width)}px), y=${y}px (+${Math.round(offsetY * height)}px), w=${boxWidth}px, h=${boxHeight}px`);

    // Add padding to ensure full logo coverage (increased from 2px to 5px)
    const padding = 5; // pixels - para garantir que cubra todo o logo
    const extractX = Math.max(0, x - padding);
    const extractY = Math.max(0, y - padding);
    const extractWidth = Math.min(width - extractX, boxWidth + 2 * padding);
    const extractHeight = Math.min(height - extractY, boxHeight + 2 * padding);

    // Create solid black rectangle
    const blackRect = await sharp({
      create: {
        width: extractWidth,
        height: extractHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 1 } // Solid black
      }
    }).png().toBuffer();

    blackMasks.push({
      input: blackRect,
      left: extractX,
      top: extractY
    });

    console.log(`✅ Máscara preta ${i + 1} criada`);
  }

  // Apply all black masks in one composite operation
  const maskedImage = await image
    .composite(blackMasks)
    .png()
    .toBuffer();

  const finalBase64 = maskedImage.toString('base64');
  const dataUri = `data:image/png;base64,${finalBase64}`;

  console.log('✅ Máscaras pretas aplicadas');

  return dataUri;
}

/**
 * Apply geometric distortion to specific regions of an image
 *
 * Uses a mesh warp technique to deform the image in specific bounding boxes
 * while preserving the rest of the image intact.
 *
 * @param imageBase64 - Base64-encoded image
 * @param boundingBoxes - Array of regions to distort
 * @param distortionStrength - How much to distort (0.1-0.5, default 0.3)
 * @returns Base64-encoded distorted image
 */
export async function applyLocalizedWarp(
  imageBase64: string,
  boundingBoxes: BoundingBox[],
  distortionStrength: number = 0.3
): Promise<string> {
  console.log(`🌀 Aplicando deformação em ${boundingBoxes.length} região(ões)`);

  // Remove data URI prefix
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Load image with sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not get image dimensions');
  }

  const { width, height } = metadata;

  console.log(`📐 Dimensões da imagem: ${width}x${height}`);

  // For each bounding box, apply localized distortion
  let processedImage: Buffer = imageBuffer;

  for (let i = 0; i < boundingBoxes.length; i++) {
    const box = boundingBoxes[i];

    if (!box) {
      console.warn(`⚠️ Box ${i} is undefined, skipping...`);
      continue;
    }

    console.log(`🎨 Deformando região ${i + 1}/${boundingBoxes.length}:`);
    console.log(`   Normalized: x=${box.x.toFixed(3)}, y=${box.y.toFixed(3)}, w=${box.width.toFixed(3)}, h=${box.height.toFixed(3)}`);

    // Convert normalized coordinates to pixels
    const x = Math.round(box.x * width);
    const y = Math.round(box.y * height);
    const boxWidth = Math.round(box.width * width);
    const boxHeight = Math.round(box.height * height);

    console.log(`   Pixels: x=${x}px, y=${y}px, w=${boxWidth}px, h=${boxHeight}px`);

    // Add padding to ensure we catch the entire logo
    const padding = 25; // pixels (aumentado de 15 para 25 - área maior)
    const extractX = Math.max(0, x - padding);
    const extractY = Math.max(0, y - padding);
    const extractWidth = Math.min(width - extractX, boxWidth + 2 * padding);
    const extractHeight = Math.min(height - extractY, boxHeight + 2 * padding);

    try {
      // Extract the region
      const region = await sharp(processedImage)
        .extract({
          left: extractX,
          top: extractY,
          width: extractWidth,
          height: extractHeight
        })
        .toBuffer();

      // Apply blur to distort the logo (preserves colors/textures but makes unreadable)
      // We use a pixelate effect followed by slight blur for a "warped" look

      // For small logos, increase distortion
      const isSmallLogo = extractWidth < 100 || extractHeight < 100;
      const effectiveStrength = isSmallLogo ? Math.min(distortionStrength * 1.8, 0.6) : distortionStrength; // Mais agressivo
      const pixelateRatio = isSmallLogo ? 0.12 : 0.20; // Muito mais pixelado (era 0.2/0.3)

      console.log(`   Distortion: ${isSmallLogo ? 'SMALL logo (aggressive)' : 'NORMAL'} - strength: ${effectiveStrength.toFixed(2)}`);

      const distortedRegion = await sharp(region)
        .resize(
          Math.max(10, Math.round(extractWidth * pixelateRatio)), // Downscale heavily (min 10px)
          Math.max(10, Math.round(extractHeight * pixelateRatio)),
          { fit: 'fill', kernel: 'nearest' } // Pixelate effect
        )
        .resize(extractWidth, extractHeight, { fit: 'fill' }) // Scale back up (blurry)
        .blur(4 + Math.round(effectiveStrength * 12)) // Additional blur MUITO mais forte (era 3 + strength*8)
        .toBuffer();

      // Composite the distorted region back onto the original
      processedImage = Buffer.from(
        await sharp(processedImage)
          .composite([
            {
              input: distortedRegion,
              left: extractX,
              top: extractY
            }
          ])
          .toBuffer()
      );

      console.log(`✅ Região ${i + 1} deformada com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao deformar região ${i + 1}:`, error);
      // Continue with other regions even if one fails
    }
  }

  // Convert final result to base64
  const finalBase64 = processedImage.toString('base64');
  const dataUri = `data:image/png;base64,${finalBase64}`;

  console.log('✅ Deformação localizada completa');

  return dataUri;
}

/**
 * Check if a logo is still visible in a specific region of the image
 *
 * @param imageBase64 - Full image
 * @param boundingBox - Region to check
 * @param brand - Expected brand name
 * @returns True if logo is still visible in that region
 */
async function isLogoVisibleInRegion(
  imageBase64: string,
  boundingBox: BoundingBox,
  brand: string
): Promise<boolean> {
  try {
    // Extract just the region
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return false;
    }

    const { width, height } = metadata;

    // Convert normalized coords to pixels with padding
    const padding = 30;
    const x = Math.max(0, Math.round(boundingBox.x * width) - padding);
    const y = Math.max(0, Math.round(boundingBox.y * height) - padding);
    const w = Math.min(width - x, Math.round(boundingBox.width * width) + 2 * padding);
    const h = Math.min(height - y, Math.round(boundingBox.height * height) + 2 * padding);

    // Extract region
    const regionBuffer = await image
      .extract({ left: x, top: y, width: w, height: h })
      .toBuffer();

    const regionBase64 = regionBuffer.toString('base64');

    // Ask Vision AI if logo is visible in this specific region
    const prompt = `
Look at this small image region extracted from a product photo.

Question: Is there a visible ${brand} logo/symbol in this region?

For Nike: Look for the SWOOSH symbol (✓ checkmark shape) or "NIKE" text
For Adidas: Look for 3 STRIPES or trefoil logo or "ADIDAS" text
For Jordan: Look for Jumpman silhouette or "JORDAN" text

Answer with JSON only:
{
  "logoVisible": true/false,
  "confidence": 0-100,
  "reason": "brief explanation"
}

If the region is blurred, pixelated, or the logo was removed, answer false.
If you can clearly see the logo shape/text, answer true.
`.trim();

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/jpeg', data: regionBase64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      return true; // If check fails, assume logo is visible (safer)
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      return true;
    }

    const parsed = JSON.parse(content);
    console.log(`   🔎 Verificação de região: ${brand} → ${parsed.logoVisible ? '❌ VISÍVEL' : '✅ REMOVIDO'} (${parsed.confidence}% - ${parsed.reason})`);

    return parsed.logoVisible;
  } catch (error) {
    console.log(`   ⚠️ Erro ao verificar região, assumindo logo visível`);
    return true; // If check fails, assume logo is visible (safer)
  }
}

/**
 * Main function: Detect remaining logos and warp them
 *
 * This is the high-level function that combines detection + warping
 *
 * @param imageBase64 - Image with remaining logos
 * @param targetBrands - Brands to look for
 * @param distortionStrength - How much to distort (0.1-0.5)
 * @returns Warped image with distorted logos
 */
export async function detectAndWarp(
  imageBase64: string,
  targetBrands: string[],
  distortionStrength: number = 0.3
): Promise<{
  warpedImage: string;
  detectedLogos: LogoDetection[];
}> {
  console.log('🌀 Iniciando detecção e deformação de logos...');

  // Step 1: Detect logos with bounding boxes
  const detections = await detectLogosWithBoxes(imageBase64, targetBrands);

  if (detections.length === 0) {
    console.log('✅ Nenhum logo detectado, imagem já está limpa');
    return {
      warpedImage: imageBase64,
      detectedLogos: []
    };
  }

  // Step 2: Extract bounding boxes
  const boundingBoxes = detections.map(d => d.boundingBox);

  // Step 3: Apply warping
  const warpedImage = await applyLocalizedWarp(
    imageBase64,
    boundingBoxes,
    distortionStrength
  );

  console.log(`✅ ${detections.length} logo(s) deformado(s) com sucesso`);

  return {
    warpedImage,
    detectedLogos: detections
  };
}

/**
 * Verify regions from original detection and warp only visible logos
 *
 * This uses the FASE 2 detection coordinates but verifies each region
 * in the edited image before applying warp.
 *
 * @param editedImageBase64 - Image after inpainting
 * @param originalRegions - Regions detected in Fase 2 (box_2d format [ymin, xmin, ymax, xmax] 0-1000)
 * @param distortionStrength - Warp strength
 * @returns Warped image
 */
export async function verifyAndWarpFromOriginalDetection(
  editedImageBase64: string,
  originalRegions: Array<{ brand: string; box_2d: [number, number, number, number] }>,
  distortionStrength: number = 0.55
): Promise<{
  warpedImage: string;
  warpedRegions: number;
}> {
  console.log(`🔍 Verificando ${originalRegions.length} região(ões) da detecção original...`);

  // Convert Fase 2 regions to normalized bounding boxes
  const regionsToCheck = originalRegions.map(region => {
    const [ymin, xmin, ymax, xmax] = region.box_2d;
    return {
      brand: region.brand,
      boundingBox: {
        x: xmin / 1000,
        y: ymin / 1000,
        width: (xmax - xmin) / 1000,
        height: (ymax - ymin) / 1000
      }
    };
  });

  // Check each region to see if logo is still visible
  const visibleRegions: BoundingBox[] = [];

  for (let i = 0; i < regionsToCheck.length; i++) {
    const region = regionsToCheck[i]!;
    console.log(`\n📍 Verificando região ${i + 1}/${regionsToCheck.length}: ${region.brand}`);
    console.log(`   Box: x=${region.boundingBox.x.toFixed(3)}, y=${region.boundingBox.y.toFixed(3)}, w=${region.boundingBox.width.toFixed(3)}, h=${region.boundingBox.height.toFixed(3)}`);

    const isVisible = await isLogoVisibleInRegion(
      editedImageBase64,
      region.boundingBox,
      region.brand
    );

    if (isVisible) {
      console.log(`   ❌ Logo ainda visível → será deformado`);
      visibleRegions.push(region.boundingBox);
    } else {
      console.log(`   ✅ Logo foi removido → não precisa deformar`);
    }
  }

  console.log(`\n📊 Resultado: ${visibleRegions.length}/${originalRegions.length} logo(s) ainda visível(veis)`);

  if (visibleRegions.length === 0) {
    console.log('✅ Todos os logos foram removidos pelo inpainting!');
    return {
      warpedImage: editedImageBase64,
      warpedRegions: 0
    };
  }

  // Apply warp only to visible regions
  console.log(`\n🌀 Aplicando deformação em ${visibleRegions.length} região(ões)...`);
  const warpedImage = await applyLocalizedWarp(
    editedImageBase64,
    visibleRegions,
    distortionStrength
  );

  return {
    warpedImage,
    warpedRegions: visibleRegions.length
  };
}
