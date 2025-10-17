/**
 * Watermark Service
 *
 * Adiciona marca d'água de direitos autorais nas imagens editadas
 * - Texto semi-transparente no centro
 * - Múltiplas linhas para melhor legibilidade
 * - Fundo escurecido sutil para destaque
 */

import sharp from 'sharp';

interface WatermarkOptions {
  text?: string;
  opacity?: number; // 0-1
  fontSize?: number;
  fontColor?: string;
}

const DEFAULT_OPTIONS: WatermarkOptions = {
  text: '© IMAGEM PROTEGIDA\nDIREITOS AUTORAIS RESERVADOS',
  opacity: 0.4, // 40% de opacidade (bem sutil)
  fontSize: 48,
  fontColor: 'white'
};

/**
 * Adiciona marca d'água de direitos autorais em uma imagem
 *
 * @param imageBase64 - Imagem em base64 (com ou sem data URI)
 * @param options - Opções de customização da marca d'água
 * @returns Imagem com marca d'água em base64 (data URI)
 */
export async function addCopyrightWatermark(
  imageBase64: string,
  options: WatermarkOptions = {}
): Promise<string> {
  console.log('💧 Adicionando marca d\'água de direitos autorais...');

  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    console.log(`   Dimensões: ${width}x${height}`);

    // Calcular tamanho da fonte baseado no tamanho da imagem
    // Para imagens grandes, fonte maior; para pequenas, fonte menor
    const adaptiveFontSize = Math.max(
      32, // Mínimo
      Math.min(
        80, // Máximo
        Math.floor(width / 15) // Proporcional à largura
      )
    );

    console.log(`   Tamanho da fonte: ${adaptiveFontSize}px`);

    // Criar SVG com a marca d'água
    // Usamos múltiplas linhas para melhor legibilidade
    const lines = opts.text!.split('\n');
    const lineHeight = adaptiveFontSize * 1.3;
    const totalHeight = lines.length * lineHeight;
    const startY = (height - totalHeight) / 2;

    // SVG com texto centralizado e semi-transparente (sem fundo)
    const svgWatermark = `
      <svg width="${width}" height="${height}">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700&amp;display=swap');
            .watermark-text {
              font-family: 'Inter', 'Arial Black', sans-serif;
              font-size: ${adaptiveFontSize}px;
              font-weight: 700;
              fill: ${opts.fontColor};
              opacity: ${opts.opacity};
              text-anchor: middle;
              letter-spacing: 2px;
            }
          </style>
        </defs>

        <!-- Texto da marca d'água (múltiplas linhas, sem fundo) -->
        ${lines.map((line, idx) => `
          <text
            x="${width / 2}"
            y="${startY + (idx + 1) * lineHeight}"
            class="watermark-text"
          >
            ${line.trim()}
          </text>
        `).join('')}
      </svg>
    `;

    // Aplicar marca d'água na imagem
    const watermarkedBuffer = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(svgWatermark),
          top: 0,
          left: 0
        }
      ])
      .png() // Manter qualidade
      .toBuffer();

    // Convert back to base64 with data URI
    const watermarkedBase64 = `data:image/png;base64,${watermarkedBuffer.toString('base64')}`;

    console.log('   ✅ Marca d\'água adicionada com sucesso');

    return watermarkedBase64;

  } catch (error) {
    console.error('   ❌ Erro ao adicionar marca d\'água:', error);
    console.log('   ⚠️ Retornando imagem original sem marca d\'água');
    // Se falhar, retorna a imagem original
    return imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  }
}

/**
 * Adiciona marca d'água personalizada com texto customizado
 */
export async function addCustomWatermark(
  imageBase64: string,
  customText: string,
  opacity: number = 0.4
): Promise<string> {
  return addCopyrightWatermark(imageBase64, {
    text: customText,
    opacity
  });
}

/**
 * Adiciona marca d'água discreta (menor opacidade)
 */
export async function addDiscreetWatermark(
  imageBase64: string
): Promise<string> {
  return addCopyrightWatermark(imageBase64, {
    text: '© Imagem Protegida\nDireitos Autorais',
    opacity: 0.25, // Mais discreto (25%)
    fontSize: 40
  });
}

/**
 * Adiciona marca d'água forte (maior opacidade)
 */
export async function addStrongWatermark(
  imageBase64: string
): Promise<string> {
  return addCopyrightWatermark(imageBase64, {
    text: '⚠️ IMAGEM PROTEGIDA ⚠️\nDIREITOS AUTORAIS RESERVADOS\nPROIBIDO USO NÃO AUTORIZADO',
    opacity: 0.6, // Bem visível (60%)
    fontSize: 52
  });
}

/**
 * Adiciona marca d'água customizável com todas as opções do usuário
 */
export async function addCustomizableWatermark(
  imageBase64: string,
  settings: {
    text?: string;
    opacity?: number;
    fontSize?: number;
    fontColor?: string;
    fontFamily?: string;
    position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'custom';
    customX?: number;
    customY?: number;
    logoUrl?: string;
    logoOpacity?: number;
    logoSize?: number;
    logoPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'custom';
    logoCustomX?: number;
    logoCustomY?: number;
    useLogoOnly?: boolean;
  }
): Promise<string> {
  console.log('🎨 Adicionando marca d\'água customizada...');

  try {
    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width!;
    const height = metadata.height!;

    console.log(`   Dimensões: ${width}x${height}`);

    const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [];

    // ============================================
    // PARTE 1: LOGO (se fornecido)
    // ============================================
    if (settings.logoUrl) {
      console.log('   🖼️ Processando logo...');

      const logoBase64 = settings.logoUrl.replace(/^data:image\/\w+;base64,/, '');
      const logoBuffer = Buffer.from(logoBase64, 'base64');

      // Resize logo
      const logoSize = settings.logoSize || 150;
      const resizedLogo = await sharp(logoBuffer)
        .resize(logoSize, logoSize, { fit: 'inside' })
        .png()
        .toBuffer();

      // Calculate logo position based on settings (use logoPosition if provided, fallback to position)
      const logoPosition = settings.logoPosition || settings.position || 'center';
      let logoX = 0;
      let logoY = 0;

      if (logoPosition === 'custom') {
        // Custom positioning: use logoCustomX and logoCustomY as percentages (0-100)
        const customX = settings.logoCustomX ?? 50; // Default to center
        const customY = settings.logoCustomY ?? 50;

        // Convert percentage to pixel coordinates
        // Center the logo at the specified percentage point
        logoX = Math.floor((width * customX / 100) - (logoSize / 2));
        logoY = Math.floor((height * customY / 100) - (logoSize / 2));

        console.log(`   🎯 Posição personalizada: ${customX}%, ${customY}% (${logoX}px, ${logoY}px)`);
      } else {
        switch (logoPosition) {
          case 'center':
            logoX = Math.floor((width - logoSize) / 2);
            logoY = Math.floor((height - logoSize) / 2);
            break;
          case 'top-left':
            logoX = 20;
            logoY = 20;
            break;
          case 'top-center':
            logoX = Math.floor((width - logoSize) / 2);
            logoY = 20;
            break;
          case 'top-right':
            logoX = width - logoSize - 20;
            logoY = 20;
            break;
          case 'bottom-left':
            logoX = 20;
            logoY = height - logoSize - 20;
            break;
          case 'bottom-center':
            logoX = Math.floor((width - logoSize) / 2);
            logoY = height - logoSize - 20;
            break;
          case 'bottom-right':
            logoX = width - logoSize - 20;
            logoY = height - logoSize - 20;
            break;
          default:
            logoX = Math.floor((width - logoSize) / 2);
            logoY = Math.floor((height - logoSize) / 2);
        }
      }

      // Create SVG overlay for logo opacity
      const logoOpacity = settings.logoOpacity || 0.5;
      const logoSvg = `
        <svg width="${width}" height="${height}">
          <image
            href="data:image/png;base64,${resizedLogo.toString('base64')}"
            x="${logoX}"
            y="${logoY}"
            width="${logoSize}"
            height="${logoSize}"
            opacity="${logoOpacity}"
          />
        </svg>
      `;

      compositeInputs.push({
        input: Buffer.from(logoSvg),
        top: 0,
        left: 0
      });
    }

    // ============================================
    // PARTE 2: TEXTO (se não for logo-only)
    // ============================================
    if (!settings.useLogoOnly && settings.text) {
      console.log('   📝 Processando texto...');

      const text = settings.text;
      const opacity = settings.opacity || 0.4;
      const fontSize = settings.fontSize || 48;
      const fontColor = settings.fontColor || '#FFFFFF';
      const fontFamily = settings.fontFamily || 'Inter';

      const lines = text.split('\n');
      const lineHeight = fontSize * 1.3;
      const totalHeight = lines.length * lineHeight;

      // Calculate text position based on settings
      const textPosition = settings.position || 'center';
      let textStartY = (height - totalHeight) / 2;
      let textAnchor = 'middle';
      let textX = width / 2;

      if (textPosition === 'custom') {
        // Custom positioning: use customX and customY as percentages (0-100)
        const customX = settings.customX ?? 50; // Default to center
        const customY = settings.customY ?? 50;

        // Convert percentage to pixel coordinates
        textX = Math.floor(width * customX / 100);
        textStartY = Math.floor(height * customY / 100);

        // Default to middle anchor for custom positioning
        textAnchor = 'middle';

        console.log(`   🎯 Posição de texto personalizada: ${customX}%, ${customY}% (${textX}px, ${textStartY}px)`);
      } else {
        switch (textPosition) {
          case 'top-left':
          case 'top-center':
          case 'top-right':
            textStartY = 50;
            break;
          case 'bottom-left':
          case 'bottom-center':
          case 'bottom-right':
            textStartY = height - totalHeight - 50;
            break;
          case 'center':
          default:
            textStartY = (height - totalHeight) / 2;
        }

        // Text alignment based on position
        if (textPosition === 'top-left' || textPosition === 'bottom-left') {
          textAnchor = 'start';
          textX = 50;
        } else if (textPosition === 'top-right' || textPosition === 'bottom-right') {
          textAnchor = 'end';
          textX = width - 50;
        } else if (textPosition === 'center' || textPosition === 'top-center' || textPosition === 'bottom-center') {
          textAnchor = 'middle';
          textX = width / 2;
        }
      }

      const textSvg = `
        <svg width="${width}" height="${height}">
          <defs>
            <style>
              @import url('https://fonts.googleapis.com/css2?family=${fontFamily.replace(' ', '+')}:wght@700&amp;display=swap');
              .watermark-text {
                font-family: '${fontFamily}', 'Arial Black', sans-serif;
                font-size: ${fontSize}px;
                font-weight: 700;
                fill: ${fontColor};
                opacity: ${opacity};
                text-anchor: ${textAnchor};
                letter-spacing: 2px;
              }
            </style>
          </defs>

          <!-- Texto (sem fundo) -->
          ${lines.map((line, idx) => `
            <text
              x="${textX}"
              y="${textStartY + (idx + 1) * lineHeight}"
              class="watermark-text"
            >
              ${line.trim()}
            </text>
          `).join('')}
        </svg>
      `;

      compositeInputs.push({
        input: Buffer.from(textSvg),
        top: 0,
        left: 0
      });
    }

    // ============================================
    // PARTE 3: APLICAR MARCA D'ÁGUA
    // ============================================
    if (compositeInputs.length === 0) {
      console.log('   ⚠️ Nenhuma marca d\'água para aplicar');
      return imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    }

    const watermarkedBuffer = await sharp(imageBuffer)
      .composite(compositeInputs)
      .png()
      .toBuffer();

    const watermarkedBase64 = `data:image/png;base64,${watermarkedBuffer.toString('base64')}`;

    console.log('   ✅ Marca d\'água customizada adicionada com sucesso');

    return watermarkedBase64;

  } catch (error) {
    console.error('   ❌ Erro ao adicionar marca d\'água customizada:', error);
    console.log('   ⚠️ Retornando imagem original sem marca d\'água');
    return imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  }
}
