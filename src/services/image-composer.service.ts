/**
 * Image Composer Service
 *
 * Compõe imagem final usando edição do Qwen + regiões preservadas da original
 * Estratégia: Qwen edita sneakers (perfeito), mas restauramos caixas da original
 */

import sharp from 'sharp';

interface DetectionRegion {
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalizado 0-1000
  brand?: string;
}

interface BoxRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Detecta se há CAIXAS DE PRODUTO na imagem
 *
 * Heurística: Caixas são elementos GRANDES (>20%) no FUNDO/TOPO (<60%)
 */
function detectBoxRegions(
  regions: DetectionRegion[],
  imageWidth: number,
  imageHeight: number
): BoxRegion[] {
  const boxRegions: BoxRegion[] = [];

  for (const region of regions) {
    const [ymin, xmin, ymax, xmax] = region.box_2d;

    // Converter para pixels
    const top = Math.floor((ymin / 1000) * imageHeight);
    const left = Math.floor((xmin / 1000) * imageWidth);
    const bottom = Math.ceil((ymax / 1000) * imageHeight);
    const right = Math.ceil((xmax / 1000) * imageWidth);

    const width = right - left;
    const height = bottom - top;

    // Calcular tamanho relativo
    const widthPercent = (width / imageWidth) * 100;
    const heightPercent = (height / imageHeight) * 100;
    const avgSize = (widthPercent + heightPercent) / 2;

    // Calcular posição vertical
    const topPercent = (top / imageHeight) * 100;

    // Detectar caixa: elemento GRANDE (>20%) no FUNDO (<60%)
    if (avgSize > 20 && topPercent < 60) {
      console.log(`   📦 Caixa detectada: top=${topPercent.toFixed(1)}%, size=${avgSize.toFixed(1)}%`);

      // Adicionar margem de segurança (10px) para garantir cobertura completa
      boxRegions.push({
        left: Math.max(0, left - 10),
        top: Math.max(0, top - 10),
        width: Math.min(imageWidth - left + 10, width + 20),
        height: Math.min(imageHeight - top + 10, height + 20)
      });
    }
  }

  return boxRegions;
}

/**
 * Compõe imagem final: Qwen editado + caixas da original
 *
 * @param originalBase64 - Imagem original (base64)
 * @param editedBase64 - Imagem editada pelo Qwen (base64)
 * @param regions - Regiões detectadas pelo Gemini
 * @param imageWidth - Largura da imagem
 * @param imageHeight - Altura da imagem
 * @returns Imagem composta (base64)
 */
export async function composeImageWithPreservedBoxes(
  originalBase64: string,
  editedBase64: string,
  regions: DetectionRegion[],
  imageWidth: number,
  imageHeight: number
): Promise<string> {
  console.log('🎨 Compondo imagem final: Qwen (sneakers) + Original (caixas)...');

  try {
    // Detectar regiões de caixas
    const boxRegions = detectBoxRegions(regions, imageWidth, imageHeight);

    if (boxRegions.length === 0) {
      console.log('   ℹ️  Nenhuma caixa detectada - usando imagem editada completa');
      return editedBase64;
    }

    console.log(`   ✅ ${boxRegions.length} caixa(s) detectada(s) - restaurando da original`);

    // Converter base64 para buffer
    const originalBuffer = Buffer.from(
      originalBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const editedBuffer = Buffer.from(
      editedBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );

    // Começar com imagem editada (Qwen)
    let composedImage = sharp(editedBuffer);

    // Para cada caixa detectada, extrair da original e colar na editada
    for (let i = 0; i < boxRegions.length; i++) {
      const box = boxRegions[i];

      // Type guard
      if (!box) continue;

      console.log(`   🔄 Restaurando caixa #${i + 1}: (${box.left},${box.top}) ${box.width}x${box.height}px`);

      // Extrair região da caixa da imagem ORIGINAL
      const boxFromOriginal = await sharp(originalBuffer)
        .extract({
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height
        })
        .toBuffer();

      // Colar caixa original na imagem editada
      composedImage = composedImage.composite([
        {
          input: boxFromOriginal,
          top: box.top,
          left: box.left
        }
      ]);
    }

    // Converter resultado para base64
    const composedBuffer = await composedImage.png().toBuffer();
    const composedBase64 = composedBuffer.toString('base64');

    console.log('   ✅ Composição completa - caixas restauradas!');
    console.log('   🎯 Resultado: Sneakers editados (Qwen) + Caixas originais');

    return composedBase64;
  } catch (error) {
    console.error('❌ Erro na composição de imagem:', error);
    console.log('   → Fallback: usando imagem editada sem composição');
    return editedBase64;
  }
}
