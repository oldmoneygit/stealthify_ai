/**
 * Mask Generator Service
 *
 * Gera máscaras precisas para remoção de logos usando BRIA Eraser
 * Máscaras são imagens PNG onde:
 * - BRANCO (#FFFFFF) = área para remover (logos)
 * - PRETO (#000000) = área para preservar (resto da imagem)
 */

import sharp from 'sharp';
import type { DetectionRegion } from '@/lib/types';

interface MaskGenerationResult {
  maskBase64: string; // Máscara em base64 (data URI)
  regionsCount: number; // Número de regiões marcadas
  coverage: number; // Porcentagem da imagem coberta pela máscara (0-100)
}

/**
 * Gera máscara PNG a partir das regiões detectadas pelo Gemini
 *
 * @param regions - Regiões com logos detectados (box_2d normalizado 0-1000)
 * @param imageWidth - Largura da imagem original
 * @param imageHeight - Altura da imagem original
 * @returns Máscara em base64 e metadados
 */
export async function generateMaskFromRegions(
  regions: DetectionRegion[],
  imageWidth: number,
  imageHeight: number
): Promise<MaskGenerationResult> {
  console.log('🎨 Gerando máscara automática para BRIA Eraser...');
  console.log(`   Dimensões: ${imageWidth}x${imageHeight}`);
  console.log(`   Regiões detectadas: ${regions.length}`);

  try {
    // Criar canvas preto (tudo preservado)
    const blackCanvas = Buffer.alloc(imageWidth * imageHeight * 4);
    for (let i = 0; i < blackCanvas.length; i += 4) {
      blackCanvas[i] = 0;     // R
      blackCanvas[i + 1] = 0; // G
      blackCanvas[i + 2] = 0; // B
      blackCanvas[i + 3] = 255; // A (opaco)
    }

    // Criar imagem base preta
    let maskImage = sharp(blackCanvas, {
      raw: {
        width: imageWidth,
        height: imageHeight,
        channels: 4
      }
    });

    let totalMaskArea = 0;

    // Para cada região detectada, adicionar retângulo branco
    const maskOverlays: Array<{ input: Buffer; top: number; left: number }> = [];

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];

      if (!region || !region.box_2d) {
        console.log(`   ⚠️ Região ${i + 1} inválida ou sem box_2d (pulando)`);
        continue;
      }

      // Extrair coordenadas (normalizado 0-1000)
      const [ymin, xmin, ymax, xmax] = region.box_2d;

      // Converter para pixels reais com padding MÍNIMO (cirúrgico)
      const padding = 5; // Padding REDUZIDO para evitar pegar cores adjacentes do produto
      const left = Math.max(0, Math.floor((xmin / 1000) * imageWidth) - padding);
      const top = Math.max(0, Math.floor((ymin / 1000) * imageHeight) - padding);
      const right = Math.min(imageWidth, Math.ceil((xmax / 1000) * imageWidth) + padding);
      const bottom = Math.min(imageHeight, Math.ceil((ymax / 1000) * imageHeight) + padding);

      const width = right - left;
      const height = bottom - top;

      if (width <= 0 || height <= 0) {
        console.log(`   ⚠️ Região ${i + 1} com dimensões inválidas (pulando)`);
        continue;
      }

      console.log(`   📍 Região ${i + 1} [${region.brand}]: (${left}, ${top}) → (${right}, ${bottom}) = ${width}x${height}px`);

      // Criar retângulo branco para esta região
      const whiteRect = Buffer.alloc(width * height * 4);
      for (let j = 0; j < whiteRect.length; j += 4) {
        whiteRect[j] = 255;     // R
        whiteRect[j + 1] = 255; // G
        whiteRect[j + 2] = 255; // B
        whiteRect[j + 3] = 255; // A
      }

      const whiteRectImage = await sharp(whiteRect, {
        raw: {
          width,
          height,
          channels: 4
        }
      })
        .png()
        .toBuffer();

      maskOverlays.push({
        input: whiteRectImage,
        top,
        left
      });

      totalMaskArea += width * height;
    }

    // Aplicar todas as regiões brancas na máscara
    if (maskOverlays.length > 0) {
      maskImage = maskImage.composite(maskOverlays);
    }

    // Converter para PNG
    const maskBuffer = await maskImage.png().toBuffer();
    const maskBase64 = `data:image/png;base64,${maskBuffer.toString('base64')}`;

    // Calcular cobertura
    const totalImageArea = imageWidth * imageHeight;
    const coverage = (totalMaskArea / totalImageArea) * 100;

    console.log(`   ✅ Máscara gerada com sucesso!`);
    console.log(`   📊 Regiões marcadas: ${maskOverlays.length}`);
    console.log(`   📊 Cobertura: ${coverage.toFixed(2)}% da imagem`);

    return {
      maskBase64,
      regionsCount: maskOverlays.length,
      coverage
    };

  } catch (error) {
    console.error('   ❌ Erro ao gerar máscara:', error);
    throw new Error(`Failed to generate mask: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Valida se a máscara é válida para uso com BRIA Eraser
 *
 * @param maskResult - Resultado da geração de máscara
 * @returns true se máscara é válida
 */
export function validateMask(maskResult: MaskGenerationResult): boolean {
  // Verificar se há pelo menos 1 região
  if (maskResult.regionsCount === 0) {
    console.log('   ⚠️ Máscara inválida: nenhuma região marcada');
    return false;
  }

  // Verificar se cobertura não é excessiva (indicaria problema)
  if (maskResult.coverage > 50) {
    console.log(`   ⚠️ Máscara suspeita: cobertura muito alta (${maskResult.coverage.toFixed(2)}%)`);
    console.log('   → Isso pode indicar detecção incorreta');
    return false;
  }

  console.log('   ✅ Máscara válida!');
  return true;
}

/**
 * Cria máscara simples para testes (retângulo no centro)
 *
 * @param width - Largura da imagem
 * @param height - Altura da imagem
 * @returns Máscara de teste em base64
 */
export async function createTestMask(
  width: number,
  height: number
): Promise<string> {
  console.log('🧪 Criando máscara de teste...');

  // Criar canvas preto
  const blackCanvas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < blackCanvas.length; i += 4) {
    blackCanvas[i] = 0;
    blackCanvas[i + 1] = 0;
    blackCanvas[i + 2] = 0;
    blackCanvas[i + 3] = 255;
  }

  // Retângulo branco no centro (20% da imagem)
  const rectWidth = Math.floor(width * 0.2);
  const rectHeight = Math.floor(height * 0.2);
  const left = Math.floor((width - rectWidth) / 2);
  const top = Math.floor((height - rectHeight) / 2);

  const whiteRect = Buffer.alloc(rectWidth * rectHeight * 4);
  for (let i = 0; i < whiteRect.length; i += 4) {
    whiteRect[i] = 255;
    whiteRect[i + 1] = 255;
    whiteRect[i + 2] = 255;
    whiteRect[i + 3] = 255;
  }

  const whiteRectImage = await sharp(whiteRect, {
    raw: {
      width: rectWidth,
      height: rectHeight,
      channels: 4
    }
  })
    .png()
    .toBuffer();

  const maskBuffer = await sharp(blackCanvas, {
    raw: {
      width,
      height,
      channels: 4
    }
  })
    .composite([
      {
        input: whiteRectImage,
        top,
        left
      }
    ])
    .png()
    .toBuffer();

  const maskBase64 = `data:image/png;base64,${maskBuffer.toString('base64')}`;

  console.log('   ✅ Máscara de teste criada');

  return maskBase64;
}
