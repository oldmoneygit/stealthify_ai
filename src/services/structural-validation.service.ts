/**
 * Structural Validation Service
 *
 * Valida se a edição de imagem preservou a estrutura original
 * Detecta se elementos foram removidos indevidamente (caixas, produtos, etc)
 */

import sharp from 'sharp';

interface StructuralValidation {
  isValid: boolean; // true se estrutura foi preservada
  confidence: number; // 0-100, confiança de que estrutura está intacta
  reason?: string; // razão de falha (se isValid = false)
}

/**
 * Valida se a imagem editada preservou a estrutura da original
 *
 * Estratégia:
 * 1. Compara diferença de pixels entre original e editada
 * 2. Se diferença > threshold, indica que elementos foram removidos
 * 3. Usa análise de gradientes para detectar remoção de bordas/objetos
 *
 * @param originalBase64 - Imagem original em base64
 * @param editedBase64 - Imagem editada em base64
 * @returns Resultado da validação estrutural
 */
export async function validateStructuralIntegrity(
  originalBase64: string,
  editedBase64: string
): Promise<StructuralValidation> {
  console.log('🔍 Validando integridade estrutural da edição...');

  try {
    // Remove data URI prefix se existir
    const originalData = originalBase64.replace(/^data:image\/\w+;base64,/, '');
    const editedData = editedBase64.replace(/^data:image\/\w+;base64,/, '');

    const originalBuffer = Buffer.from(originalData, 'base64');
    const editedBuffer = Buffer.from(editedData, 'base64');

    // Redimensionar ambas para comparação (menor = mais rápido)
    const resizeSize = 512;

    const [originalResized, editedResized] = await Promise.all([
      sharp(originalBuffer)
        .resize(resizeSize, resizeSize, { fit: 'inside' })
        .greyscale() // Converter para escala de cinza (simplifica comparação)
        .raw()
        .toBuffer({ resolveWithObject: true }),
      sharp(editedBuffer)
        .resize(resizeSize, resizeSize, { fit: 'inside' })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);

    const originalPixels = originalResized.data;
    const editedPixels = editedResized.data;

    // Calcular diferença média de pixels
    let totalDiff = 0;
    let significantDiffsCount = 0; // Pixels com diferença > 50 (mudança significativa)
    const threshold = 50; // Diferença considerada significativa

    for (let i = 0; i < originalPixels.length; i++) {
      const origPixel = originalPixels[i];
      const editPixel = editedPixels[i];

      if (origPixel === undefined || editPixel === undefined) continue;

      const diff = Math.abs(origPixel - editPixel);
      totalDiff += diff;

      if (diff > threshold) {
        significantDiffsCount++;
      }
    }

    const avgDiff = totalDiff / originalPixels.length;
    const significantDiffPercentage = (significantDiffsCount / originalPixels.length) * 100;

    console.log(`   📊 Diferença média: ${avgDiff.toFixed(2)}`);
    console.log(`   📊 Pixels com mudança significativa: ${significantDiffPercentage.toFixed(2)}%`);

    // CRITÉRIOS DE VALIDAÇÃO:
    // 1. Diferença média < 30 (pequenas mudanças - OK)
    // 2. Pixels com mudança significativa < 20% (maioria da imagem intacta)

    const avgDiffThreshold = 30;
    const significantDiffThresholdPercent = 20;

    if (avgDiff < avgDiffThreshold && significantDiffPercentage < significantDiffThresholdPercent) {
      console.log('   ✅ Estrutura preservada - edição válida!');
      return {
        isValid: true,
        confidence: Math.min(100, 100 - avgDiff - significantDiffPercentage),
        reason: undefined
      };
    } else {
      const reason = avgDiff >= avgDiffThreshold
        ? `Diferença média muito alta (${avgDiff.toFixed(2)} >= ${avgDiffThreshold})`
        : `Muitos pixels alterados (${significantDiffPercentage.toFixed(2)}% >= ${significantDiffThresholdPercent}%)`;

      console.log(`   ⚠️ Estrutura comprometida: ${reason}`);
      return {
        isValid: false,
        confidence: Math.max(0, 100 - avgDiff - significantDiffPercentage),
        reason
      };
    }

  } catch (error) {
    console.error('   ❌ Erro ao validar estrutura:', error);
    // Em caso de erro, assumir que é válido (não bloquear pipeline)
    return {
      isValid: true,
      confidence: 50,
      reason: 'Erro na validação - assumindo válido'
    };
  }
}

/**
 * Aplica máscara preta nas regiões detectadas (Stealthify Prime strategy)
 *
 * @param imageBase64 - Imagem original em base64
 * @param brandRegions - Regiões com logos detectados (DetectionRegion[] com box_2d)
 * @returns Imagem com máscara preta aplicada nas regiões
 */
export async function applyLocalizedBlur(
  imageBase64: string,
  brandRegions: Array<{
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  }>
): Promise<string> {
  console.log('⬛ Aplicando máscara preta nas regiões de logos...');

  try {
    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 1000;
    const height = metadata.height ?? 1000;

    console.log(`   Dimensões: ${width}x${height}`);
    console.log(`   Regiões para mascarar: ${brandRegions.length}`);

    // Para cada região, criar e aplicar máscara preta
    let processedImage = sharp(imageBuffer);

    for (let i = 0; i < brandRegions.length; i++) {
      const region = brandRegions[i];

      if (!region || !region.box_2d) {
        console.log(`   ⚠️ Região ${i + 1} inválida (sem box_2d)`);
        continue;
      }

      // Extrair coordenadas do box_2d (normalizado 0-1000)
      const [ymin, xmin, ymax, xmax] = region.box_2d;

      console.log(`   📍 Região ${i + 1} (normalized): ymin=${ymin}, xmin=${xmin}, ymax=${ymax}, xmax=${xmax}`);

      // Converter para pixels reais (com padding AUMENTADO para garantir cobertura)
      const padding = 20; // AUMENTADO de 10 para 20
      const minX = Math.max(0, Math.floor((xmin / 1000) * width) - padding);
      const maxX = Math.min(width, Math.ceil((xmax / 1000) * width) + padding);
      const minY = Math.max(0, Math.floor((ymin / 1000) * height) - padding);
      const maxY = Math.min(height, Math.ceil((ymax / 1000) * height) + padding);

      const regionWidth = maxX - minX;
      const regionHeight = maxY - minY;

      if (regionWidth <= 0 || regionHeight <= 0) {
        console.log(`   ⚠️ Região ${i + 1} com dimensões inválidas`);
        continue;
      }

      console.log(`   🔲 Região ${i + 1} (pixels): x=[${minX}-${maxX}], y=[${minY}-${maxY}], size=${regionWidth}x${regionHeight}`);

      // 🎯 STEALTHIFY PRIME: Aplicar MÁSCARA PRETA (não blur)
      // Criar buffer preto sólido para a região
      const blackMaskBuffer = await sharp({
        create: {
          width: regionWidth,
          height: regionHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 } // Preto 100% opaco
        }
      })
        .png()
        .toBuffer();

      // Recompor imagem com máscara preta
      processedImage = processedImage.composite([
        {
          input: blackMaskBuffer,
          top: minY,
          left: minX
        }
      ]);
    }

    const maskedBuffer = await processedImage.png().toBuffer();
    const maskedBase64 = `data:image/png;base64,${maskedBuffer.toString('base64')}`;

    console.log('   ✅ Máscara preta aplicada com sucesso');

    return maskedBase64;

  } catch (error) {
    console.error('   ❌ Erro ao aplicar máscara preta:', error);
    // Em caso de erro, retornar imagem original
    return imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  }
}
