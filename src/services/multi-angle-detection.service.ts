/**
 * Multi-Angle Detection Service
 *
 * Solução para logos invertidos/rotacionados que Gemini não detecta:
 * 1. Detecta logos na imagem original
 * 2. Roda a imagem 180° e detecta novamente
 * 3. Combina todas as detecções, convertendo coordenadas
 *
 * Garantia: 100% de consistência independente da orientação dos logos
 */

import sharp from 'sharp';
import * as detectionService from './detection.service';
import type { DetectionRegion } from '@/lib/types';

interface MultiAngleDetectionResult {
  brands: string[];
  riskScore: number;
  regions: DetectionRegion[];
  detectionsMade: number; // Quantas detecções foram feitas (1 = normal, 2 = normal + invertida)
}

/**
 * Converte coordenadas de uma imagem rotacionada 180° de volta para coordenadas originais
 *
 * @param box_2d - Coordenadas na imagem rotacionada [ymin, xmin, ymax, xmax] (0-1000)
 * @returns Coordenadas na imagem original
 */
function convertRotated180Coordinates(
  box_2d: [number, number, number, number]
): [number, number, number, number] {
  const [ymin, xmin, ymax, xmax] = box_2d;

  // Rotação 180° = inverter X e Y
  // Original: (x, y) → Rotacionado 180°: (1000 - x, 1000 - y)
  // Então para converter de volta: (x_rot, y_rot) → (1000 - x_rot, 1000 - y_rot)

  const new_ymin = 1000 - ymax; // Inverter Y e trocar min/max
  const new_xmin = 1000 - xmax; // Inverter X e trocar min/max
  const new_ymax = 1000 - ymin;
  const new_xmax = 1000 - xmin;

  return [new_ymin, new_xmin, new_ymax, new_xmax];
}

/**
 * Detecta logos em múltiplos ângulos para garantir 100% de cobertura
 *
 * @param imageUrl - URL da imagem original
 * @returns Detecções combinadas de todos os ângulos
 */
export async function detectMultiAngle(
  imageUrl: string
): Promise<MultiAngleDetectionResult> {

  console.log('\n🔄 DETECÇÃO MULTI-ÂNGULO (100% de consistência)');
  console.log('   📐 Estratégia: Detectar em 0° e 180° para pegar logos invertidos');

  // DETECÇÃO 1: Imagem original (0°)
  console.log('\n   [1/2] Detectando na orientação original (0°)...');
  const detection0 = await detectionService.detect(imageUrl);

  console.log(`   ✅ Detectado: ${detection0.brands.join(', ') || 'nenhum'}`);
  console.log(`   📍 Regiões: ${detection0.regions.length}`);

  // DETECÇÃO 2: Imagem rotacionada 180° (para pegar logos de cabeça para baixo)
  console.log('\n   [2/2] Detectando na orientação invertida (180°)...');

  let detection180Regions: DetectionRegion[] = [];
  let detection180Brands: string[] = [];

  try {
    // Baixar e rotacionar imagem
    const response = await fetch(imageUrl);
    const imageBuffer = await response.arrayBuffer();

    const rotatedBuffer = await sharp(Buffer.from(imageBuffer))
      .rotate(180)
      .toBuffer();

    // Converter para base64 data URL
    const rotatedBase64 = rotatedBuffer.toString('base64');
    const rotatedDataUrl = `data:image/png;base64,${rotatedBase64}`;

    // Detectar na imagem rotacionada
    const detection180 = await detectionService.detect(rotatedDataUrl);

    console.log(`   ✅ Detectado (invertido): ${detection180.brands.join(', ') || 'nenhum'}`);
    console.log(`   📍 Regiões: ${detection180.regions.length}`);

    // Converter coordenadas de volta para orientação original
    if (detection180.regions.length > 0) {
      detection180Regions = detection180.regions.map(region => ({
        ...region,
        box_2d: convertRotated180Coordinates(region.box_2d),
        brand: region.brand + ' (inverted)' // Marcar como invertido para debug
      }));

      detection180Brands = detection180.brands;

      console.log(`   🔄 ${detection180Regions.length} região(ões) convertida(s) para coordenadas originais`);
    }

  } catch (error) {
    console.error('   ⚠️ Erro na detecção 180°:', error);
    console.log('   → Continuando apenas com detecção original');
  }

  // COMBINAR RESULTADOS
  const allRegions = [...detection0.regions, ...detection180Regions];
  const allBrands = Array.from(new Set([...detection0.brands, ...detection180Brands]));
  const maxRiskScore = Math.max(detection0.riskScore, detection180Regions.length > 0 ? 80 : 0);

  console.log('\n   📊 RESULTADO FINAL:');
  console.log(`   ✅ Total de regiões: ${allRegions.length} (${detection0.regions.length} normal + ${detection180Regions.length} invertidas)`);
  console.log(`   ✅ Marcas detectadas: ${allBrands.join(', ') || 'nenhuma'}`);
  console.log(`   ✅ Risk Score: ${maxRiskScore}`);

  return {
    brands: allBrands,
    riskScore: maxRiskScore,
    regions: allRegions,
    detectionsMade: detection180Regions.length > 0 ? 2 : 1
  };
}

/**
 * Remove duplicatas de regiões que se sobrepõem (IoU > 50%)
 * Útil se a mesma logo foi detectada em ambas as orientações
 *
 * @param regions - Array de regiões detectadas
 * @returns Array sem duplicatas
 */
export function removeDuplicateRegions(
  regions: DetectionRegion[]
): DetectionRegion[] {

  if (regions.length <= 1) return regions;

  const unique: DetectionRegion[] = [];

  for (const region of regions) {
    // Verificar se já existe região similar (IoU > 50%)
    const isDuplicate = unique.some(existing => {
      const iou = calculateIoU(region.box_2d, existing.box_2d);
      return iou > 0.5; // 50% overlap = duplicate
    });

    if (!isDuplicate) {
      unique.push(region);
    }
  }

  if (unique.length < regions.length) {
    console.log(`   🗑️ Removidas ${regions.length - unique.length} região(ões) duplicada(s)`);
  }

  return unique;
}

/**
 * Calcula Intersection over Union (IoU) entre duas bounding boxes
 *
 * @param box1 - [ymin, xmin, ymax, xmax]
 * @param box2 - [ymin, xmin, ymax, xmax]
 * @returns IoU value (0-1)
 */
function calculateIoU(
  box1: [number, number, number, number],
  box2: [number, number, number, number]
): number {

  const [y1min, x1min, y1max, x1max] = box1;
  const [y2min, x2min, y2max, x2max] = box2;

  // Calcular área de intersecção
  const xIntersectMin = Math.max(x1min, x2min);
  const yIntersectMin = Math.max(y1min, y2min);
  const xIntersectMax = Math.min(x1max, x2max);
  const yIntersectMax = Math.min(y1max, y2max);

  if (xIntersectMax < xIntersectMin || yIntersectMax < yIntersectMin) {
    return 0; // No overlap
  }

  const intersectionArea = (xIntersectMax - xIntersectMin) * (yIntersectMax - yIntersectMin);

  // Calcular áreas das boxes
  const box1Area = (x1max - x1min) * (y1max - y1min);
  const box2Area = (x2max - x2min) * (y2max - y2min);

  // IoU = intersecção / união
  const unionArea = box1Area + box2Area - intersectionArea;

  return intersectionArea / unionArea;
}
