/**
 * Debug Service
 *
 * Salva imagens intermediárias do pipeline para debug
 * Desenha bounding boxes nas imagens para visualizar detecções
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const DEBUG_DIR = path.join(process.cwd(), 'debug');

// Garantir que a pasta debug existe
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
}

/**
 * Salva uma imagem base64 em arquivo local
 */
export async function saveDebugImage(
  imageBase64: string,
  filename: string
): Promise<string> {
  try {
    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const filepath = path.join(DEBUG_DIR, filename);
    await sharp(imageBuffer).toFile(filepath);

    console.log(`   💾 Debug: Imagem salva em ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`   ❌ Erro ao salvar imagem debug:`, error);
    throw error;
  }
}

/**
 * Desenha bounding boxes na imagem para visualizar detecções do Vision API
 *
 * @param imageBase64 - Imagem em base64
 * @param regions - Regiões detectadas com box_2d e boundingPoly
 * @param filename - Nome do arquivo para salvar
 * @returns Caminho do arquivo salvo
 */
export async function saveImageWithBoundingBoxes(
  imageBase64: string,
  regions: Array<{
    brand: string;
    type: 'logo' | 'text';
    confidence: number;
    boundingPoly: {
      vertices: Array<{ x: number; y: number }>;
    };
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  }>,
  filename: string
): Promise<string> {
  try {
    console.log(`   🎨 Desenhando ${regions.length} bounding boxes na imagem...`);

    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 1000;
    const height = metadata.height ?? 1000;

    console.log(`   📐 Dimensões da imagem: ${width}x${height}`);

    // Carregar imagem como base
    let image = sharp(imageBuffer);

    // Para cada região, criar um retângulo colorido
    const overlays = [];

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];

      // USAR COORDENADAS DO BOUNDING POLY (pixels reais do Vision API)
      const vertices = region.boundingPoly.vertices;
      const xCoords = vertices.map(v => v.x || 0);
      const yCoords = vertices.map(v => v.y || 0);

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minY = Math.min(...yCoords);
      const maxY = Math.max(...yCoords);

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

      if (boxWidth <= 0 || boxHeight <= 0) {
        console.log(`   ⚠️ Região ${i + 1} com dimensões inválidas`);
        continue;
      }

      console.log(`   📦 Região ${i + 1}: ${region.brand} (${region.type})`);
      console.log(`      Pixels do Vision API: x=[${minX}-${maxX}], y=[${minY}-${maxY}]`);
      console.log(`      box_2d normalizado: [${region.box_2d.join(', ')}]`);

      // Criar retângulo com borda (vermelho para logos, azul para textos)
      const borderColor = region.type === 'logo'
        ? { r: 255, g: 0, b: 0, alpha: 1 }    // Vermelho para logos
        : { r: 0, g: 0, b: 255, alpha: 1 };   // Azul para textos

      // Criar SVG com retângulo
      const svg = `
        <svg width="${boxWidth}" height="${boxHeight}">
          <rect
            x="0"
            y="0"
            width="${boxWidth}"
            height="${boxHeight}"
            fill="none"
            stroke="${region.type === 'logo' ? 'red' : 'blue'}"
            stroke-width="5"
          />
          <text
            x="5"
            y="20"
            font-family="Arial"
            font-size="16"
            font-weight="bold"
            fill="white"
            stroke="black"
            stroke-width="1"
          >
            ${region.brand} (${(region.confidence).toFixed(0)}%)
          </text>
        </svg>
      `;

      const svgBuffer = Buffer.from(svg);

      overlays.push({
        input: svgBuffer,
        top: Math.round(minY),
        left: Math.round(minX)
      });
    }

    // Aplicar todos os overlays de uma vez
    if (overlays.length > 0) {
      image = image.composite(overlays);
    }

    // Salvar imagem com bounding boxes
    const filepath = path.join(DEBUG_DIR, filename);
    await image.toFile(filepath);

    console.log(`   ✅ Imagem com bounding boxes salva em ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`   ❌ Erro ao desenhar bounding boxes:`, error);
    throw error;
  }
}

/**
 * Desenha as máscaras que serão aplicadas (para comparação)
 */
export async function saveImageWithMaskPreview(
  imageBase64: string,
  regions: Array<{
    brand: string;
    type: 'logo' | 'text';
    box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  }>,
  filename: string
): Promise<string> {
  try {
    console.log(`   🎨 Desenhando preview das máscaras pretas...`);

    // Remove data URI prefix se existir
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width ?? 1000;
    const height = metadata.height ?? 1000;

    // Carregar imagem como base
    let image = sharp(imageBuffer);

    // Para cada região, criar um retângulo preto SEMI-TRANSPARENTE (para preview)
    const overlays = [];

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const [ymin, xmin, ymax, xmax] = region.box_2d;

      // Converter para pixels (com padding de 20px)
      const padding = 20;
      const minX = Math.max(0, Math.floor((xmin / 1000) * width) - padding);
      const maxX = Math.min(width, Math.ceil((xmax / 1000) * width) + padding);
      const minY = Math.max(0, Math.floor((ymin / 1000) * height) - padding);
      const maxY = Math.min(height, Math.ceil((ymax / 1000) * height) + padding);

      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;

      if (boxWidth <= 0 || boxHeight <= 0) {
        continue;
      }

      console.log(`   🟥 Máscara ${i + 1}: ${region.brand} - x=[${minX}-${maxX}], y=[${minY}-${maxY}]`);

      // Criar retângulo preto semi-transparente (50% opacidade para preview)
      const blackRect = await sharp({
        create: {
          width: boxWidth,
          height: boxHeight,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 } // 50% transparente para preview
        }
      })
        .png()
        .toBuffer();

      overlays.push({
        input: blackRect,
        top: Math.round(minY),
        left: Math.round(minX)
      });
    }

    // Aplicar todos os overlays
    if (overlays.length > 0) {
      image = image.composite(overlays);
    }

    // Salvar imagem com preview das máscaras
    const filepath = path.join(DEBUG_DIR, filename);
    await image.toFile(filepath);

    console.log(`   ✅ Preview das máscaras salvo em ${filepath}`);
    return filepath;
  } catch (error) {
    console.error(`   ❌ Erro ao criar preview das máscaras:`, error);
    throw error;
  }
}

/**
 * Limpa arquivos antigos da pasta debug (manter apenas os 10 mais recentes)
 */
export function cleanupDebugFolder(): void {
  try {
    const files = fs.readdirSync(DEBUG_DIR);

    // Ordenar por data de modificação (mais antigos primeiro)
    const filesWithStats = files.map(file => {
      const filepath = path.join(DEBUG_DIR, file);
      const stats = fs.statSync(filepath);
      return { file, filepath, mtime: stats.mtime };
    });

    filesWithStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    // Manter apenas os 10 mais recentes
    const filesToDelete = filesWithStats.slice(0, Math.max(0, filesWithStats.length - 10));

    filesToDelete.forEach(({ filepath }) => {
      fs.unlinkSync(filepath);
    });

    if (filesToDelete.length > 0) {
      console.log(`   🗑️ Removidos ${filesToDelete.length} arquivos antigos da pasta debug/`);
    }
  } catch (error) {
    console.error('   ⚠️ Erro ao limpar pasta debug:', error);
  }
}
