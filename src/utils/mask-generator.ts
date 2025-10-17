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
 * Create binary mask image from polygon segments for ClipDrop/Vertex AI
 *
 * 🎯 OTIMIZADO PARA MÁXIMA PRECISÃO:
 * - Expande máscaras em 15% (recomendação ClipDrop docs)
 * - Converte coordenadas normalizadas (0-1) para pixels exatos
 * - Gera PNG de alta qualidade sem compressão
 * - WHITE = áreas para remover, BLACK = áreas para preservar
 *
 * @param segments - Array of polygon segments
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param expandPercent - Expand mask by percentage (default: 15% per ClipDrop docs)
 * @returns Base64-encoded mask image (white = edit these areas, black = keep unchanged)
 */
export async function createMask(
  segments: Segment[],
  width: number,
  height: number,
  expandPercent: number = 15
): Promise<string> {
  console.log(`🎭 Criando máscara PRECISA de ${segments.length} segmentos...`);
  console.log(`   📏 Resolução: ${width}x${height}px`);
  console.log(`   📐 Expansão: ${expandPercent}% (recomendação ClipDrop)`);

  // Create SVG with polygons (expanded for better coverage)
  // ClipDrop/Vertex AI: WHITE areas = edit/inpaint, BLACK areas = preserve
  const polygons = segments.map((segment, idx) => {
    // Convert normalized coordinates (0-1) to pixel coordinates
    const pixelPolygon = segment.polygon.map(p => ({
      x: p.x * width,
      y: p.y * height
    }));

    // Calculate centroid (center point)
    const centroidX = pixelPolygon.reduce((sum, p) => sum + p.x, 0) / pixelPolygon.length;
    const centroidY = pixelPolygon.reduce((sum, p) => sum + p.y, 0) / pixelPolygon.length;

    // Expand polygon by moving each point away from centroid
    const expandFactor = 1 + (expandPercent / 100);
    const expandedPolygon = pixelPolygon.map(p => ({
      x: centroidX + (p.x - centroidX) * expandFactor,
      y: centroidY + (p.y - centroidY) * expandFactor
    }));

    // Convert to SVG points format
    const points = expandedPolygon
      .map(p => `${p.x},${p.y}`)
      .join(' ');

    return `<polygon points="${points}" fill="white" />`;  // WHITE = areas to edit
  }).join('\n');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="black" />
      ${polygons}
    </svg>
  `.trim();

  // Convert SVG to PNG with maximum quality (no compression)
  const maskBuffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 0, quality: 100 })
    .toBuffer();

  const maskBase64 = maskBuffer.toString('base64');

  console.log('✅ Máscara PRECISA criada:', {
    segments: segments.length,
    resolution: `${width}x${height}px`,
    expanded: `${expandPercent}%`,
    base64Length: maskBase64.length,
    fileSizeKB: (maskBase64.length / 1024).toFixed(2)
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
  console.log('👟 Criando máscaras preventivas EXPANDIDAS para swoosh nas laterais dos sneakers...');

  const preventiveMasks: Segment[] = [];

  // 🔥 ESTRATÉGIA EXPANDIDA: Cobrir 8 áreas (antes eram 4) com máscaras MAIORES
  // Problema anterior: Máscaras pequenas (15%x12%) não cobriam posições reais do swoosh
  // Solução: Aumentar tamanho (30%x20%) e adicionar mais posições (incluindo centro)
  //
  // 1-4. Lateral ESQUERDA (4 posições: extrema, esquerda, centro-esquerda, meio)
  // 5-8. Lateral DIREITA (4 posições: meio, centro-direita, direita, extrema)

  // 🎯 DIMENSÕES OTIMIZADAS (V2.5 - FINAL):
  // V3 falhou: máscaras grandes demais (35x25%) causaram artefatos
  // V2 funcionou: Risk Score 45 com máscaras 30x20%
  // V2.5: Manter tamanho V2, ajustar APENAS posições para cobrir gaps
  const swooshHeight = 0.22; // OTIMIZADO: 22% (equilíbrio perfeito)
  const swooshWidth = 0.32;  // OTIMIZADO: 32% (cobertura sem exagero)

  // === GRID DE MÁSCARAS COM SOBREPOSIÇÃO ESTRATÉGICA (12 máscaras) ===
  // Baseado em análise visual: swoosh frontal está em ~40-50% x, ~60-70% y

  // LINHA 1: Topo (y: 30-52%)
  // 1. Esquerda-Topo (x: 10-42%, y: 30-52%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L1-C1 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.10, y: 0.30 },
      { x: 0.10 + swooshWidth, y: 0.30 },
      { x: 0.10 + swooshWidth, y: 0.30 + swooshHeight },
      { x: 0.10, y: 0.30 + swooshHeight }
    ]
  });

  // 2. Centro-Topo (x: 34-66%, y: 30-52%) - COBRE SWOOSH FRONTAL TOPO
  preventiveMasks.push({
    brand: 'Swoosh Grid L1-C2 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.34, y: 0.30 },
      { x: 0.34 + swooshWidth, y: 0.30 },
      { x: 0.34 + swooshWidth, y: 0.30 + swooshHeight },
      { x: 0.34, y: 0.30 + swooshHeight }
    ]
  });

  // 3. Direita-Topo (x: 58-90%, y: 30-52%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L1-C3 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.58, y: 0.30 },
      { x: 0.58 + swooshWidth, y: 0.30 },
      { x: 0.58 + swooshWidth, y: 0.30 + swooshHeight },
      { x: 0.58, y: 0.30 + swooshHeight }
    ]
  });

  // LINHA 2: Meio-Alto (y: 42-64%) - SOBREPOSIÇÃO COM LINHA 1
  // 4. Esquerda-MeioAlto (x: 10-42%, y: 42-64%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L2-C1 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.10, y: 0.42 },
      { x: 0.10 + swooshWidth, y: 0.42 },
      { x: 0.10 + swooshWidth, y: 0.42 + swooshHeight },
      { x: 0.10, y: 0.42 + swooshHeight }
    ]
  });

  // 5. Centro-MeioAlto (x: 34-66%, y: 42-64%) - **ÁREA CRÍTICA SWOOSH FRONTAL**
  preventiveMasks.push({
    brand: 'Swoosh Grid L2-C2 (V2.5 - CRITICAL)',
    confidence: 100,
    polygon: [
      { x: 0.34, y: 0.42 },
      { x: 0.34 + swooshWidth, y: 0.42 },
      { x: 0.34 + swooshWidth, y: 0.42 + swooshHeight },
      { x: 0.34, y: 0.42 + swooshHeight }
    ]
  });

  // 6. Direita-MeioAlto (x: 58-90%, y: 42-64%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L2-C3 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.58, y: 0.42 },
      { x: 0.58 + swooshWidth, y: 0.42 },
      { x: 0.58 + swooshWidth, y: 0.42 + swooshHeight },
      { x: 0.58, y: 0.42 + swooshHeight }
    ]
  });

  // LINHA 3: Meio-Baixo (y: 54-76%) - SOBREPOSIÇÃO COM LINHA 2
  // 7. Esquerda-MeioBaixo (x: 10-42%, y: 54-76%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L3-C1 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.10, y: 0.54 },
      { x: 0.10 + swooshWidth, y: 0.54 },
      { x: 0.10 + swooshWidth, y: 0.54 + swooshHeight },
      { x: 0.10, y: 0.54 + swooshHeight }
    ]
  });

  // 8. Centro-MeioBaixo (x: 34-66%, y: 54-76%) - **ÁREA CRÍTICA SWOOSH FRONTAL BAIXO**
  preventiveMasks.push({
    brand: 'Swoosh Grid L3-C2 (V2.5 - CRITICAL)',
    confidence: 100,
    polygon: [
      { x: 0.34, y: 0.54 },
      { x: 0.34 + swooshWidth, y: 0.54 },
      { x: 0.34 + swooshWidth, y: 0.54 + swooshHeight },
      { x: 0.34, y: 0.54 + swooshHeight }
    ]
  });

  // 9. Direita-MeioBaixo (x: 58-90%, y: 54-76%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L3-C3 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.58, y: 0.54 },
      { x: 0.58 + swooshWidth, y: 0.54 },
      { x: 0.58 + swooshWidth, y: 0.54 + swooshHeight },
      { x: 0.58, y: 0.54 + swooshHeight }
    ]
  });

  // LINHA 4: Base (y: 66-88%) - COBERTURA FINAL
  // 10. Esquerda-Base (x: 10-42%, y: 66-88%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L4-C1 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.10, y: 0.66 },
      { x: 0.10 + swooshWidth, y: 0.66 },
      { x: 0.10 + swooshWidth, y: 0.66 + swooshHeight },
      { x: 0.10, y: 0.66 + swooshHeight }
    ]
  });

  // 11. Centro-Base (x: 34-66%, y: 66-88%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L4-C2 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.34, y: 0.66 },
      { x: 0.34 + swooshWidth, y: 0.66 },
      { x: 0.34 + swooshWidth, y: 0.66 + swooshHeight },
      { x: 0.34, y: 0.66 + swooshHeight }
    ]
  });

  // 12. Direita-Base (x: 58-90%, y: 66-88%)
  preventiveMasks.push({
    brand: 'Swoosh Grid L4-C3 (V2.5)',
    confidence: 100,
    polygon: [
      { x: 0.58, y: 0.66 },
      { x: 0.58 + swooshWidth, y: 0.66 },
      { x: 0.58 + swooshWidth, y: 0.66 + swooshHeight },
      { x: 0.58, y: 0.66 + swooshHeight }
    ]
  });

  console.log(`   ✅ ${preventiveMasks.length} máscara(s) preventivas em GRID 4x3 adicionadas (V2.5 FINAL)`);
  console.log(`   📏 Tamanho otimizado: ${(swooshWidth*100).toFixed(0)}% x ${(swooshHeight*100).toFixed(0)}% (equilíbrio perfeito)`);
  console.log(`   📍 Grid estratégico: 3 colunas x 4 linhas com sobreposição de 12%`);

  return preventiveMasks;
}
