/**
 * Badge Overlay Service
 *
 * Aplica badges da SNKF HOUSE sobre logos detectados
 * Estratégia: Badge para logos grandes, blur para logos pequenos
 */

import sharp from 'sharp';
import path from 'path';
import type { DetectionRegion } from '@/lib/types';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tipo de badge disponível
 */
type BadgeType = 'gold' | 'black-matte' | 'silver';

/**
 * Selecionar badge baseado no contexto do logo
 */
function selectBadgeType(
  region: DetectionRegion,
  logoSize: number
): BadgeType {
  // Lógica de seleção:
  // - Gold: Logos em caixas escuras (Jordan boxes), produtos premium
  // - Black Matte: Logos em tênis claros, fundos brancos
  // - Silver: Alternativa neutra

  // Por enquanto: usar gold para logos grandes (mais visível)
  // e black-matte para médios (mais discreto)

  if (logoSize >= 0.06) {
    // Logo muito grande (≥6%): gold (destaque máximo)
    return 'gold';
  } else if (logoSize >= 0.03) {
    // Logo médio (3-6%): black-matte (discreto)
    return 'black-matte';
  } else {
    // Logo pequeno (< 3%): silver (neutro, não chama atenção)
    return 'silver';
  }
}

/**
 * Aplicar badge overlay sobre logos detectados
 *
 * @param imageBase64 - Imagem base64 editada (após Qwen/FLUX)
 * @param logoRegions - Regiões de logos detectadas pelo Gemini
 * @returns Imagem com badges aplicadas (base64)
 */
export async function applyBadgeOverlay(
  imageBase64: string,
  logoRegions: DetectionRegion[]
): Promise<string> {

  console.log(`\n🏷️  Iniciando badge overlay em ${logoRegions.length} região(ões)...`);

  // Carregar imagem
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not get image dimensions');
  }

  const { width, height } = metadata;
  const overlays: sharp.OverlayOptions[] = [];

  // Processar cada região de logo
  for (let i = 0; i < logoRegions.length; i++) {
    const region = logoRegions[i];
    if (!region) continue;

    const [ymin, xmin, ymax, xmax] = region.box_2d;

    // Converter coordenadas normalizadas (0-1000) para pixels
    const logoX = Math.round((xmin / 1000) * width);
    const logoY = Math.round((ymin / 1000) * height);
    const logoW = Math.round(((xmax - xmin) / 1000) * width);
    const logoH = Math.round(((ymax - ymin) / 1000) * height);

    // Calcular tamanho do logo em % da imagem total
    const logoSize = (logoW * logoH) / (width * height);

    console.log(`\n   [${i + 1}/${logoRegions.length}] ${region.brand} (${region.type})`);
    console.log(`      Tamanho: ${logoW}x${logoH}px (${(logoSize * 100).toFixed(2)}% da imagem)`);
    console.log(`      Posição: x=${logoX}px, y=${logoY}px`);

    // ESTRATÉGIA: Badge para logos ≥2%, blur para < 2%
    const BADGE_THRESHOLD = 0.02; // 2% da imagem

    if (logoSize >= BADGE_THRESHOLD) {
      // Logo grande/médio: aplicar BADGE
      const badgeType = selectBadgeType(region, logoSize);

      // Mapeamento para nomes reais das badges na pasta /badges
      const badgeFileMap: Record<BadgeType, string> = {
        'gold': 'tmpcoxpx894.png',           // Badge dourada
        'black-matte': 'Adobe Express - file (1).png',  // Badge preta fosca
        'silver': 'Adobe Express - file.png'  // Badge prateada
      };

      const badgePath = path.join(process.cwd(), 'badges', badgeFileMap[badgeType]);

      console.log(`      ✅ Aplicando badge: ${badgeType} (${badgeFileMap[badgeType]})`);

      try {
        // Calcular tamanho da badge: 130% do logo (margem para garantir cobertura)
        const badgeSize = Math.round(Math.max(logoW, logoH) * 1.3);

        // Redimensionar badge
        const badge = await sharp(badgePath)
          .resize(badgeSize, badgeSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparente
          })
          .toBuffer();

        // Calcular posição para centralizar badge sobre logo
        const badgeX = Math.round(logoX + logoW / 2 - badgeSize / 2);
        const badgeY = Math.round(logoY + logoH / 2 - badgeSize / 2);

        // Garantir que badge não saia da imagem
        const finalX = Math.max(0, Math.min(badgeX, width - badgeSize));
        const finalY = Math.max(0, Math.min(badgeY, height - badgeSize));

        overlays.push({
          input: badge,
          left: finalX,
          top: finalY,
          blend: 'over'
        });

        console.log(`      📍 Badge ${badgeType} posicionada: ${badgeSize}x${badgeSize}px em (${finalX}, ${finalY})`);

      } catch (error) {
        console.error(`      ⚠️ Erro ao aplicar badge ${badgeType}:`, error);
        console.log(`      ℹ️ Continuando sem badge nesta região...`);
      }

    } else {
      // Logo pequeno: aplicar BLUR (mais discreto que badge pequena)
      console.log(`      🌫️  Logo muito pequeno - aplicar blur seria mais apropriado`);
      console.log(`      ℹ️ (Blur localizado será implementado em próxima fase)`);
    }
  }

  if (overlays.length === 0) {
    console.log('\n   ℹ️ Nenhuma badge aplicada (todos os logos eram muito pequenos)');
    return imageBase64;
  }

  // Aplicar todas as badges de uma vez
  console.log(`\n   🎨 Compondo ${overlays.length} badge(s) na imagem...`);
  const finalImage = await image
    .composite(overlays)
    .png()
    .toBuffer();

  const finalBase64 = `data:image/png;base64,${finalImage.toString('base64')}`;

  console.log(`   ✅ Badge overlay concluído!`);
  console.log(`   📊 ${overlays.length} badge(s) aplicada(s) de ${logoRegions.length} região(ões) detectadas\n`);

  return finalBase64;
}

/**
 * Aplicar blur localizado em logos pequenos
 * (Alternativa à badge para logos < 2%)
 *
 * NOTA: Sharp não suporta blur localizado facilmente
 * Estratégia: extract → blur → composite
 */
export async function applyLocalizedBlur(
  imageBase64: string,
  boundingBoxes: BoundingBox[]
): Promise<string> {

  console.log(`\n🌫️  Aplicando blur localizado em ${boundingBoxes.length} região(ões)...`);

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not get image dimensions');
  }

  const { width, height } = metadata;
  const overlays: sharp.OverlayOptions[] = [];

  for (let i = 0; i < boundingBoxes.length; i++) {
    const box = boundingBoxes[i];
    if (!box) continue;

    const x = Math.round(box.x * width);
    const y = Math.round(box.y * height);
    const boxWidth = Math.round(box.width * width);
    const boxHeight = Math.round(box.height * height);

    // Extrair região, aplicar blur forte, e compor de volta
    const extractX = Math.max(0, x);
    const extractY = Math.max(0, y);
    const extractWidth = Math.min(width - extractX, boxWidth);
    const extractHeight = Math.min(height - extractY, boxHeight);

    try {
      const blurredRegion = await sharp(imageBuffer)
        .extract({
          left: extractX,
          top: extractY,
          width: extractWidth,
          height: extractHeight
        })
        .blur(18) // Gaussian blur forte (sigma=18)
        .toBuffer();

      overlays.push({
        input: blurredRegion,
        left: extractX,
        top: extractY,
        blend: 'over'
      });

      console.log(`   🌫️  [${i + 1}/${boundingBoxes.length}] Blur aplicado: ${extractWidth}x${extractHeight}px em (${extractX}, ${extractY})`);

    } catch (error) {
      console.error(`   ⚠️ Erro ao aplicar blur na região ${i + 1}:`, error);
    }
  }

  if (overlays.length === 0) {
    return imageBase64;
  }

  const finalImage = await image.composite(overlays).png().toBuffer();
  const finalBase64 = `data:image/png;base64,${finalImage.toString('base64')}`;

  console.log(`   ✅ Blur localizado concluído! (${overlays.length} região(ões))\n`);

  return finalBase64;
}
