import sharp from 'sharp';
import type { Segment, DetectionRegion } from '@/lib/types';

/**
 * Convert bounding box (box_2d) to polygon coordinates
 * box_2d format: [ymin, xmin, ymax, xmax] normalized to 0-1000
 *
 * @param box_2d - Bounding box coordinates
 * @returns Polygon with 4 corner points (normalized 0-1)
 */
export function boxToPolygon(box_2d: [number, number, number, number]): Array<{ x: number; y: number }> {
  const [ymin, xmin, ymax, xmax] = box_2d;

  // Convert from 0-1000 to 0-1
  return [
    { x: xmin / 1000, y: ymin / 1000 },  // Top-left
    { x: xmax / 1000, y: ymin / 1000 },  // Top-right
    { x: xmax / 1000, y: ymax / 1000 },  // Bottom-right
    { x: xmin / 1000, y: ymax / 1000 }   // Bottom-left
  ];
}

/**
 * Convert detection regions (with box_2d) to segments (with polygons)
 *
 * @param regions - Detection regions with bounding boxes
 * @returns Segments with polygon coordinates
 */
export function regionsToSegments(regions: DetectionRegion[]): Segment[] {
  return regions.map(region => ({
    brand: region.brand,
    confidence: region.confidence,
    polygon: region.polygon || boxToPolygon(region.box_2d)
  }));
}

/**
 * Create binary mask image from polygon segments for Vertex AI Imagen
 *
 * @param segments - Array of polygon segments
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Base64-encoded mask image (white = edit these areas, black = keep unchanged)
 */
export async function createMask(
  segments: Segment[],
  width: number,
  height: number
): Promise<string> {
  console.log('🎭 Criando máscara de', segments.length, 'segmentos...');

  // Create SVG with polygons
  // Vertex AI Imagen: WHITE areas = edit/inpaint, BLACK areas = preserve
  const polygons = segments.map(segment => {
    const points = segment.polygon
      .map(p => `${p.x * width},${p.y * height}`)
      .join(' ');

    return `<polygon points="${points}" fill="white" />`;  // WHITE = areas to edit
  }).join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black" />
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

/**
 * 🎯 MÁSCARA PREVENTIVA: Detectar e mascarar topo de caixas
 *
 * Estratégia: Logos em tampas de caixas são frequentemente perdidos pelo Gemini
 * porque estão de cabeça para baixo, cortados, ou parcialmente visíveis.
 *
 * Solução: Adicionar máscara preventiva em TODAS as tampas detectadas,
 * independente se há logo detectado ou não.
 *
 * @param imageWidth - Largura da imagem
 * @param imageHeight - Altura da imagem
 * @param boxRegions - Regiões de caixas detectadas (se disponível)
 * @returns Array de regiões para adicionar às máscaras
 */
export function createPreventiveBoxLidMasks(
  imageWidth: number,
  imageHeight: number,
  boxRegions?: DetectionRegion[]
): Segment[] {
  console.log('🎯 Criando máscaras preventivas para tampas de caixas...');

  const preventiveMasks: Segment[] = [];

  if (boxRegions && boxRegions.length > 0) {
    // ESTRATÉGIA 1: Se temos boxes detectados, mascarar topo de cada box
    console.log(`   📦 ${boxRegions.length} caixa(s) detectada(s) - mascarando topos`);

    for (const box of boxRegions) {
      const [ymin, xmin, ymax, xmax] = box.box_2d;

      // Calcular altura do topo (15% da altura da caixa)
      const boxHeight = ymax - ymin;
      const lidHeight = boxHeight * 0.15; // Tampa = 15% superior da caixa

      // Criar polygon para o topo da caixa
      const lidPolygon = [
        { x: xmin / 1000, y: ymin / 1000 },                    // Top-left
        { x: xmax / 1000, y: ymin / 1000 },                    // Top-right
        { x: xmax / 1000, y: (ymin + lidHeight) / 1000 },      // Bottom-right do topo
        { x: xmin / 1000, y: (ymin + lidHeight) / 1000 }       // Bottom-left do topo
      ];

      preventiveMasks.push({
        brand: 'Box Lid (Preventive)',
        confidence: 100, // Máscara preventiva sempre 100%
        polygon: lidPolygon
      });

      console.log(`   ✅ Tampa mascarada: ${box.brand || 'Box'} (${lidHeight.toFixed(0)}px height)`);
    }
  } else {
    // ESTRATÉGIA 2: Se não há boxes detectados, assumir box na região central-superior
    // (comum em fotos de produtos: box atrás, tênis na frente)
    console.log('   ⚠️ Nenhuma caixa detectada - usando máscara preventiva genérica');
    console.log('   📍 Assumindo box na região superior-central da imagem');

    // Região genérica: topo-central (onde boxes costumam aparecer)
    // 🔥 MELHORADO: Área aumentada para cobrir logos na tampa da caixa
    // x: 15% - 85% (mais amplo horizontalmente)
    // y: 2% - 32% (mais amplo verticalmente - era 5-25%, agora 2-32%)
    const genericLidMask: Segment = {
      brand: 'Generic Box Lid (Preventive - ENHANCED)',
      confidence: 100,
      polygon: [
        { x: 0.15, y: 0.02 },  // Top-left (era 0.20, 0.05 → agora 0.15, 0.02)
        { x: 0.85, y: 0.02 },  // Top-right (era 0.80, 0.05 → agora 0.85, 0.02)
        { x: 0.85, y: 0.32 },  // Bottom-right (era 0.80, 0.25 → agora 0.85, 0.32)
        { x: 0.15, y: 0.32 }   // Bottom-left (era 0.20, 0.25 → agora 0.15, 0.32)
      ]
    };

    preventiveMasks.push(genericLidMask);
    console.log('   ✅ Máscara genérica MELHORADA criada na região superior (15-85% x, 2-32% y)');
  }

  console.log(`   🎯 Total: ${preventiveMasks.length} máscara(s) preventiva(s) de tampa`);

  return preventiveMasks;
}

/**
 * 👟 MÁSCARA PREVENTIVA: Detectar e mascarar lateral de sneakers (onde swoosh aparece)
 *
 * Estratégia: Nike swoosh aparece SEMPRE na lateral dos tênis
 * Problema: Pode estar em diferentes posições (esquerda/direita, alto/baixo)
 *
 * Solução: Criar 2-4 máscaras preventivas nas regiões laterais
 * onde swoosh costuma aparecer (35-45% da altura, laterais do tênis)
 *
 * @param imageWidth - Largura da imagem
 * @param imageHeight - Altura da imagem
 * @returns Array de regiões para adicionar às máscaras
 */
export function createPreventiveSneakerSwooshMasks(
  imageWidth: number,
  imageHeight: number
): Segment[] {
  console.log('👟 Criando máscaras preventivas para swoosh nas laterais dos sneakers...');

  const preventiveMasks: Segment[] = [];

  // ESTRATÉGIA: Cobrir 4 áreas onde o swoosh Nike tipicamente aparece:
  // 1. Lateral ESQUERDA superior (tênis à esquerda)
  // 2. Lateral ESQUERDA inferior (tênis à esquerda)
  // 3. Lateral DIREITA superior (tênis à direita)
  // 4. Lateral DIREITA inferior (tênis à direita)

  // Dimensões típicas de um sneaker em fotos de produto:
  // - Altura do swoosh: ~10-15% da altura da imagem
  // - Posição vertical: 40-55% (meio do tênis)
  // - Posição horizontal: 15-35% (esquerda) ou 65-85% (direita)

  const swooshHeight = 0.12; // 12% da altura da imagem
  const swooshWidth = 0.15;  // 15% da largura da imagem

  // 1. LATERAL ESQUERDA - SUPERIOR (tênis à esquerda, swoosh alto)
  preventiveMasks.push({
    brand: 'Sneaker Swoosh Left-Top (Preventive)',
    confidence: 100,
    polygon: [
      { x: 0.15, y: 0.35 },  // Top-left
      { x: 0.15 + swooshWidth, y: 0.35 },  // Top-right
      { x: 0.15 + swooshWidth, y: 0.35 + swooshHeight },  // Bottom-right
      { x: 0.15, y: 0.35 + swooshHeight }   // Bottom-left
    ]
  });

  // 2. LATERAL ESQUERDA - INFERIOR (tênis à esquerda, swoosh baixo)
  preventiveMasks.push({
    brand: 'Sneaker Swoosh Left-Bottom (Preventive)',
    confidence: 100,
    polygon: [
      { x: 0.15, y: 0.50 },  // Top-left
      { x: 0.15 + swooshWidth, y: 0.50 },  // Top-right
      { x: 0.15 + swooshWidth, y: 0.50 + swooshHeight },  // Bottom-right
      { x: 0.15, y: 0.50 + swooshHeight }   // Bottom-left
    ]
  });

  // 3. LATERAL DIREITA - SUPERIOR (tênis à direita, swoosh alto)
  preventiveMasks.push({
    brand: 'Sneaker Swoosh Right-Top (Preventive)',
    confidence: 100,
    polygon: [
      { x: 0.70, y: 0.35 },  // Top-left
      { x: 0.70 + swooshWidth, y: 0.35 },  // Top-right
      { x: 0.70 + swooshWidth, y: 0.35 + swooshHeight },  // Bottom-right
      { x: 0.70, y: 0.35 + swooshHeight }   // Bottom-left
    ]
  });

  // 4. LATERAL DIREITA - INFERIOR (tênis à direita, swoosh baixo)
  preventiveMasks.push({
    brand: 'Sneaker Swoosh Right-Bottom (Preventive)',
    confidence: 100,
    polygon: [
      { x: 0.70, y: 0.50 },  // Top-left
      { x: 0.70 + swooshWidth, y: 0.50 },  // Top-right
      { x: 0.70 + swooshWidth, y: 0.50 + swooshHeight },  // Bottom-right
      { x: 0.70, y: 0.50 + swooshHeight }   // Bottom-left
    ]
  });

  console.log(`   ✅ ${preventiveMasks.length} máscara(s) preventiva(s) de swoosh adicionadas`);
  console.log(`   📍 Cobrindo: laterais esquerda e direita (onde swoosh costuma aparecer)`);

  return preventiveMasks;
}
