/**
 * Script de Teste do Vision API
 *
 * Analisa uma imagem usando Google Cloud Vision API e retorna
 * exatamente o que foi detectado (logos, textos, coordenadas).
 *
 * USO:
 *   pnpm tsx scripts/test-vision-api.ts <caminho-da-imagem>
 *
 * EXEMPLO:
 *   pnpm tsx scripts/test-vision-api.ts "debug/SKU123_1_edited_by_qwen.png"
 *   pnpm tsx scripts/test-vision-api.ts "https://exemplo.com/imagem.jpg"
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import * as debugService from '../src/services/debug.service';
import { getAccessToken } from '../src/lib/vertex-auth';

// Carregar variáveis de ambiente
config({ path: path.join(process.cwd(), '.env.local') });

interface VisionAPIResponse {
  logoAnnotations?: Array<{
    description: string;
    score: number;
    boundingPoly: {
      vertices: Array<{ x: number; y: number }>;
    };
  }>;
  textAnnotations?: Array<{
    description: string;
    score?: number;
    boundingPoly: {
      vertices: Array<{ x: number; y: number }>;
    };
  }>;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Converter imagem para base64
 */
async function imageToBase64(imagePath: string): Promise<string> {
  // Se for URL
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('📥 Baixando imagem da URL...');
    const response = await fetch(imagePath);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  }

  // Se for arquivo local
  console.log('📂 Lendo arquivo local...');
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Arquivo não encontrado: ${absolutePath}`);
  }

  const buffer = fs.readFileSync(absolutePath);
  return buffer.toString('base64');
}

/**
 * Obter dimensões da imagem
 */
async function getImageDimensions(base64Image: string): Promise<{ width: number; height: number }> {
  const buffer = Buffer.from(base64Image, 'base64');
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0
  };
}

/**
 * Analisar imagem com Vision API (usando OAuth Service Account)
 */
async function analyzeWithVisionAPI(base64Image: string): Promise<VisionAPIResponse> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

  if (!projectId) {
    throw new Error('❌ GOOGLE_CLOUD_PROJECT_ID não configurada no .env.local');
  }

  console.log('🔐 Obtendo access token do Service Account...');
  const accessToken = await getAccessToken();
  console.log('✅ Access token obtido com sucesso\n');

  console.log('🔍 Enviando imagem para Vision API...\n');

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': projectId
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'LOGO_DETECTION',
                maxResults: 50
              },
              {
                type: 'TEXT_DETECTION',
                maxResults: 50
              }
            ]
          }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data = await response.json();
  return data.responses[0];
}

/**
 * Formatar e exibir resultados
 */
function displayResults(
  result: VisionAPIResponse,
  dimensions: { width: number; height: number }
): void {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 RESULTADOS DA ANÁLISE - GOOGLE CLOUD VISION API');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  console.log(`📐 Dimensões da Imagem: ${dimensions.width} x ${dimensions.height} pixels\n`);

  // Verificar erros
  if (result.error) {
    console.log('❌ ERRO NA API:');
    console.log(`   Código: ${result.error.code}`);
    console.log(`   Status: ${result.error.status}`);
    console.log(`   Mensagem: ${result.error.message}\n`);
    return;
  }

  // ==================== LOGOS DETECTADOS ====================
  const logos = result.logoAnnotations || [];

  console.log('🎯 LOGOS DETECTADOS:');
  console.log('───────────────────────────────────────────────────────────────────────────');

  if (logos.length === 0) {
    console.log('   ✅ Nenhum logo detectado (imagem limpa)\n');
  } else {
    console.log(`   ⚠️ ${logos.length} logo(s) detectado(s):\n`);

    logos.forEach((logo, index) => {
      const vertices = logo.boundingPoly.vertices;
      const xCoords = vertices.map(v => v.x || 0);
      const yCoords = vertices.map(v => v.y || 0);

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minY = Math.min(...yCoords);
      const maxY = Math.max(...yCoords);

      const width = maxX - minX;
      const height = maxY - minY;

      // Normalizar para 0-1000
      const normalizedXMin = Math.round((minX / dimensions.width) * 1000);
      const normalizedXMax = Math.round((maxX / dimensions.width) * 1000);
      const normalizedYMin = Math.round((minY / dimensions.height) * 1000);
      const normalizedYMax = Math.round((maxY / dimensions.height) * 1000);

      console.log(`   [${index + 1}] ${logo.description}`);
      console.log(`       Confiança: ${(logo.score * 100).toFixed(1)}%`);
      console.log(`       `);
      console.log(`       📍 Coordenadas em PIXELS:`);
      console.log(`          X: [${minX} - ${maxX}] (largura: ${width}px)`);
      console.log(`          Y: [${minY} - ${maxY}] (altura: ${height}px)`);
      console.log(`          Vértices: ${JSON.stringify(vertices)}`);
      console.log(`       `);
      console.log(`       📐 Coordenadas NORMALIZADAS (0-1000):`);
      console.log(`          xmin: ${normalizedXMin}, xmax: ${normalizedXMax}`);
      console.log(`          ymin: ${normalizedYMin}, ymax: ${normalizedYMax}`);
      console.log(`          box_2d: [${normalizedYMin}, ${normalizedXMin}, ${normalizedYMax}, ${normalizedXMax}]`);
      console.log(`       `);
      console.log(`       🎨 Posição Relativa:`);
      console.log(`          Horizontal: ${((minX / dimensions.width) * 100).toFixed(1)}% - ${((maxX / dimensions.width) * 100).toFixed(1)}%`);
      console.log(`          Vertical: ${((minY / dimensions.height) * 100).toFixed(1)}% - ${((maxY / dimensions.height) * 100).toFixed(1)}%`);
      console.log('');
    });
  }

  // ==================== TEXTOS DETECTADOS ====================
  const texts = result.textAnnotations || [];

  console.log('📝 TEXTOS DETECTADOS:');
  console.log('───────────────────────────────────────────────────────────────────────────');

  if (texts.length === 0) {
    console.log('   ✅ Nenhum texto detectado\n');
  } else {
    // Primeiro elemento é o texto completo (pular)
    const textBlocks = texts.slice(1);

    if (textBlocks.length === 0) {
      console.log('   ✅ Nenhum bloco de texto individual detectado\n');
    } else {
      console.log(`   ⚠️ ${textBlocks.length} bloco(s) de texto detectado(s):\n`);

      // Mostrar apenas os primeiros 10 para não poluir o terminal
      const displayLimit = 10;
      const textsToShow = textBlocks.slice(0, displayLimit);

      textsToShow.forEach((text, index) => {
        const vertices = text.boundingPoly.vertices;
        const xCoords = vertices.map(v => v.x || 0);
        const yCoords = vertices.map(v => v.y || 0);

        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords);
        const maxY = Math.max(...yCoords);

        const width = maxX - minX;
        const height = maxY - minY;

        // Normalizar para 0-1000
        const normalizedXMin = Math.round((minX / dimensions.width) * 1000);
        const normalizedXMax = Math.round((maxX / dimensions.width) * 1000);
        const normalizedYMin = Math.round((minY / dimensions.height) * 1000);
        const normalizedYMax = Math.round((maxY / dimensions.height) * 1000);

        console.log(`   [${index + 1}] "${text.description}"`);
        console.log(`       `);
        console.log(`       📍 Coordenadas em PIXELS:`);
        console.log(`          X: [${minX} - ${maxX}] (largura: ${width}px)`);
        console.log(`          Y: [${minY} - ${maxY}] (altura: ${height}px)`);
        console.log(`       `);
        console.log(`       📐 Coordenadas NORMALIZADAS (0-1000):`);
        console.log(`          box_2d: [${normalizedYMin}, ${normalizedXMin}, ${normalizedYMax}, ${normalizedXMax}]`);
        console.log('');
      });

      if (textBlocks.length > displayLimit) {
        console.log(`   ... e mais ${textBlocks.length - displayLimit} bloco(s) de texto\n`);
      }
    }
  }

  // ==================== RESUMO ====================
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('📈 RESUMO:');
  console.log('───────────────────────────────────────────────────────────────────────────');
  console.log(`   Logos detectados: ${logos.length}`);
  console.log(`   Textos detectados: ${texts.length > 0 ? texts.length - 1 : 0}`);
  console.log(`   Status: ${logos.length === 0 && texts.length <= 1 ? '✅ LIMPA' : '⚠️ MARCAS DETECTADAS'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
}

/**
 * Main
 */
async function main() {
  console.log('🔬 TEST VISION API - Análise Detalhada\n');

  // Validar argumentos
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ Erro: Caminho da imagem não fornecido\n');
    console.log('USO:');
    console.log('  pnpm tsx scripts/test-vision-api.ts <caminho-da-imagem>\n');
    console.log('EXEMPLOS:');
    console.log('  pnpm tsx scripts/test-vision-api.ts "debug/SKU123_1_edited_by_qwen.png"');
    console.log('  pnpm tsx scripts/test-vision-api.ts "https://exemplo.com/imagem.jpg"');
    console.log('');
    process.exit(1);
  }

  try {
    console.log(`📸 Imagem: ${imagePath}\n`);

    // Converter para base64
    const base64Image = await imageToBase64(imagePath);
    console.log(`✅ Imagem convertida para base64 (${Math.round(base64Image.length / 1024)} KB)\n`);

    // Obter dimensões
    const dimensions = await getImageDimensions(base64Image);
    console.log(`✅ Dimensões: ${dimensions.width} x ${dimensions.height} pixels\n`);

    // Analisar com Vision API
    const result = await analyzeWithVisionAPI(base64Image);

    // Exibir resultados no terminal
    displayResults(result, dimensions);

    // Salvar imagem com bounding boxes na pasta debug
    const logos = result.logoAnnotations || [];
    const texts = result.textAnnotations || [];

    if (logos.length > 0 || texts.length > 1) {
      console.log('🎨 Gerando imagem com bounding boxes...\n');

      // Converter para formato que debugService espera
      const regions = [
        ...logos.map(logo => {
          const vertices = logo.boundingPoly.vertices;
          const xCoords = vertices.map(v => v.x || 0);
          const yCoords = vertices.map(v => v.y || 0);
          const minX = Math.min(...xCoords);
          const maxX = Math.max(...xCoords);
          const minY = Math.min(...yCoords);
          const maxY = Math.max(...yCoords);

          const normalizedXMin = Math.round((minX / dimensions.width) * 1000);
          const normalizedXMax = Math.round((maxX / dimensions.width) * 1000);
          const normalizedYMin = Math.round((minY / dimensions.height) * 1000);
          const normalizedYMax = Math.round((maxY / dimensions.height) * 1000);

          return {
            brand: logo.description,
            type: 'logo' as const,
            confidence: logo.score * 100,
            boundingPoly: logo.boundingPoly,
            box_2d: [normalizedYMin, normalizedXMin, normalizedYMax, normalizedXMax] as [number, number, number, number]
          };
        }),
        // Pular o primeiro texto (texto completo)
        ...texts.slice(1).map(text => {
          const vertices = text.boundingPoly.vertices;
          const xCoords = vertices.map(v => v.x || 0);
          const yCoords = vertices.map(v => v.y || 0);
          const minX = Math.min(...xCoords);
          const maxX = Math.max(...xCoords);
          const minY = Math.min(...yCoords);
          const maxY = Math.max(...yCoords);

          const normalizedXMin = Math.round((minX / dimensions.width) * 1000);
          const normalizedXMax = Math.round((maxX / dimensions.width) * 1000);
          const normalizedYMin = Math.round((minY / dimensions.height) * 1000);
          const normalizedYMax = Math.round((maxY / dimensions.height) * 1000);

          return {
            brand: text.description,
            type: 'text' as const,
            confidence: 100, // Text detection não retorna score
            boundingPoly: text.boundingPoly,
            box_2d: [normalizedYMin, normalizedXMin, normalizedYMax, normalizedXMax] as [number, number, number, number]
          };
        })
      ];

      // Salvar imagem com bounding boxes
      const timestamp = Date.now();
      const filename = `vision_api_test_${timestamp}.png`;

      const savedPath = await debugService.saveImageWithBoundingBoxes(
        `data:image/png;base64,${base64Image}`,
        regions,
        filename
      );

      console.log(`✅ Imagem com análise salva em: ${savedPath}\n`);
    } else {
      console.log('ℹ️ Nenhum logo ou texto detectado - não há bounding boxes para desenhar\n');
    }

    console.log('✅ Análise concluída com sucesso!\n');
  } catch (error) {
    console.error('\n❌ ERRO:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      if (error.stack) {
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('   Erro desconhecido:', error);
    }
    process.exit(1);
  }
}

// Executar
main();
