/**
 * 🎯 PROCESS SINGLE PRODUCT - Processar produto individual
 *
 * Processa 25900-Nike-Air-Jordan-1-High-Bred-Patent.jpg
 */

// ⚠️ IMPORTANTE: Carregar variáveis de ambiente ANTES de importar qualquer coisa
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { editWithBrandRemoval } from '@/services/qwen-edit.service';

const PRODUCT_FILE = '25900-Nike-Air-Jordan-1-High-Bred-Patent.jpg';
const ORIGINALS_DIR = 'debug/originais';
const EDITED_DIR = 'debug/edited';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

interface BrandDetection {
  brands: string[];
  riskScore: number;
  regions: any[];
}

async function fileToBase64(filePath: string): Promise<string> {
  console.log('   🖼️ Processando imagem com Sharp...');

  const buffer = await fs.readFile(filePath);
  console.log('   📊 Tamanho original:', (buffer.length / 1024).toFixed(2), 'KB');

  const resized = await sharp(buffer)
    .resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  console.log('   ✅ Tamanho processado:', (resized.length / 1024).toFixed(2), 'KB');

  return resized.toString('base64');
}

async function detectBrands(imageBase64: string): Promise<BrandDetection> {
  const prompt = `Analyze this product image and identify ALL visible commercial brand elements.

Return ONLY a JSON object with this exact structure:
{
  "brands": ["Brand1", "Brand2"],
  "riskScore": 0-100,
  "regions": [
    {
      "brand": "Brand1",
      "type": "logo|text|symbol",
      "description": "brief description",
      "boundingBox": {
        "x": 0.0-1.0,
        "y": 0.0-1.0,
        "width": 0.0-1.0,
        "height": 0.0-1.0
      }
    }
  ]
}

Focus on Nike, Adidas, Jordan, Supreme, and other major brands.
riskScore: 0-30 clean, 30-60 minor, 60+ major branding.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No content in Gemini response');
  }

  return JSON.parse(content);
}

async function processSingleProduct(): Promise<void> {
  console.log('🎯 PROCESSANDO PRODUTO INDIVIDUAL\n');
  console.log(`📄 Produto: ${PRODUCT_FILE}`);
  console.log('='.repeat(80) + '\n');

  const filePath = path.join(ORIGINALS_DIR, PRODUCT_FILE);

  try {
    // 1. Processar imagem com Sharp e converter para base64
    console.log('🔍 [1/3] Processando e detectando logos com Gemini Vision...');
    const imageBase64 = await fileToBase64(filePath);

    // 2. Detectar logos com Gemini Vision
    const detection = await detectBrands(imageBase64);

    console.log(`📊 Marcas detectadas: ${detection.brands.length > 0 ? detection.brands.join(', ') : 'Nenhuma'}`);
    console.log(`📈 Risk Score: ${detection.riskScore}\n`);

    if (detection.brands.length === 0 || detection.riskScore < 40) {
      console.log('✅ Imagem limpa - não precisa editar');

      // Copiar original para pasta edited
      const destPath = path.join(EDITED_DIR, PRODUCT_FILE);
      await fs.copyFile(filePath, destPath);

      console.log('💾 Original copiado para: debug/edited/\n');
      console.log('='.repeat(80));
      console.log('✅ PROCESSAMENTO CONCLUÍDO!');
      return;
    }

    // 3. Aplicar Qwen Image Edit (MÁXIMA FIDELIDADE)
    console.log('✨ [2/3] Removendo logos com Qwen Prime (alta fidelidade)...');
    console.log('🎯 Estratégia: Mantém textura, cores e estrutura originais');
    console.log('🎯 Remove APENAS elementos de marca sem deformar\n');

    const editedBase64 = await editWithBrandRemoval(
      imageBase64,
      detection.brands,
      'sneaker'
    );

    // 4. Salvar imagem editada
    console.log('💾 [3/3] Salvando resultado...');

    const editedBuffer = Buffer.from(
      editedBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );

    const destPath = path.join(EDITED_DIR, PRODUCT_FILE);
    await fs.writeFile(destPath, editedBuffer);

    console.log(`✅ Editado e salvo em: debug/edited/${PRODUCT_FILE}`);
    console.log('🎉 Edição com alta fidelidade concluída!\n');

    console.log('='.repeat(80));
    console.log('✅ PROCESSAMENTO CONCLUÍDO!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error(`❌ Erro ao processar: ${error}`);
    throw error;
  }
}

// Execute
processSingleProduct().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
