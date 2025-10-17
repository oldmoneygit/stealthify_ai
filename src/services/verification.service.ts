import { VERIFICATION_PROMPT } from '@/lib/constants';
import { retryWithBackoff } from '@/utils/retry';
import type { VerificationResult } from '@/lib/types';
import { getAccessToken } from '@/lib/vertex-auth';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.0-flash-exp'; // Modelo experimental mais leve e menos congestionado
const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!;

/**
 * Verify if edited image is clean (no visible brand logos)
 *
 * @param imageBase64 - Base64-encoded edited image
 * @param originalBrands - Array of brands that were in original image
 * @returns Verification result with clean status and risk score
 */
export async function verify(
  imageBase64: string,
  originalBrands: string[]
): Promise<VerificationResult> {
  console.log('🔍 Verificando imagem editada para marcas:', originalBrands.join(', '));

  try {
    return await retryWithBackoff(async () => {
      // Call Gemini API for verification
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: VERIFICATION_PROMPT(originalBrands) },
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: imageBase64
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error('No content in Gemini response');
      }

      // Parse JSON response
      const verification: VerificationResult = JSON.parse(content);

      console.log('✅ Verificação completa:', {
        isClean: verification.isClean,
        riskScore: verification.riskScore,
        remainingBrands: verification.remainingBrands.length,
        description: verification.description
      });

      return verification;
    }, {
      maxRetries: 5, // Aumentado de 3 para 5 tentativas
      initialDelay: 2000, // Delay inicial maior (2s)
      maxDelay: 16000, // Delay máximo 16s
      backoffMultiplier: 2, // Dobra o delay a cada tentativa
      onRetry: (attempt, error) => {
        console.log(`⚠️ Verificação falhou (tentativa ${attempt}):`, error.message);
        if (error.message.includes('503') || error.message.includes('overloaded')) {
          console.log('   ℹ️ API sobrecarregada - aguardando mais tempo antes de tentar novamente...');
        }
      }
    });
  } catch (error) {
    // FALLBACK GRACIOSO: Se Gemini falhar após todas as tentativas, aceita a imagem
    console.error('❌ Verificação falhou após todas as tentativas:', error);
    console.log('⚠️ FALLBACK: Aceitando imagem sem verificação (assumindo riskScore moderado)');

    return {
      isClean: false,
      riskScore: 45, // Score moderado (vai trigger re-edit, mas não blur)
      remainingBrands: originalBrands,
      description: 'Verificação Gemini falhou - assumindo marcas ainda presentes (precaução)'
    };
  }
}

/**
 * Verify with detailed confidence scores for each brand
 *
 * @param imageBase64 - Base64-encoded edited image
 * @param originalBrands - Array of brands that were in original image
 * @returns Detailed verification with per-brand confidence
 */
export async function verifyDetailed(
  imageBase64: string,
  originalBrands: string[]
): Promise<{
  isClean: boolean;
  riskScore: number;
  brandChecks: Array<{
    brand: string;
    stillVisible: boolean;
    confidence: number;
  }>;
}> {
  console.log('🔍 Verificação detalhada para:', originalBrands.join(', '));

  const prompt = `
You are a brand detection verification expert. Check if these specific brands are still visible in the edited image: ${originalBrands.join(', ')}.

Analyze the image carefully and for EACH brand, determine if any logos, text, or brand elements are still visible.

Return valid JSON only (no markdown, no explanation):
{
  "isClean": boolean,
  "riskScore": number (0-100, where 100 = high risk of visible brands),
  "brandChecks": [
    {
      "brand": "brand_name",
      "stillVisible": boolean,
      "confidence": number (0-100)
    }
  ]
}
`.trim();

  return retryWithBackoff(async () => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: imageBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in Gemini response');
    }

    const verification = JSON.parse(content);

    console.log('✅ Verificação detalhada completa:', verification);

    return verification;
  }, {
    onRetry: (attempt, error) => {
      console.log(`⚠️ Verificação detalhada falhou (tentativa ${attempt}):`, error.message);
    }
  });
}

/**
 * Interface para regiões detectadas pelo Vision API
 */
export interface VisionDetectedRegion {
  brand: string;
  type: 'logo' | 'text';
  confidence: number;
  boundingPoly: {
    vertices: Array<{ x: number; y: number }>;
  };
  // Formato normalizado 0-1000 (igual ao Gemini)
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
}

/**
 * Resultado estendido da verificação com coordenadas das regiões
 */
export interface VisionVerificationResult extends VerificationResult {
  detectedRegions: VisionDetectedRegion[];
}

/**
 * Verify using Google Cloud Vision API (LOGO_DETECTION + TEXT_DETECTION)
 *
 * Muito mais preciso que Gemini para detectar logos e textos remanescentes!
 *
 * @param imageBase64 - Base64-encoded edited image (sem prefix data:image/...)
 * @param originalBrands - Array of brands that were in original image
 * @returns Verification result with clean status and risk score
 */
export async function verifyWithVisionAPI(
  imageBase64: string,
  originalBrands: string[]
): Promise<VerificationResult> {
  console.log('🔍 [VISION API] Verificando logos e texto na imagem editada...');
  console.log(`   Marcas originais: ${originalBrands.join(', ')}`);

  try {
    const accessToken = await getAccessToken();

    // Preparar imagem (remover prefix se existir)
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Chamar Vision API com LOGO_DETECTION + TEXT_DETECTION
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': GOOGLE_CLOUD_PROJECT_ID
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: cleanBase64 },
              features: [
                { type: 'LOGO_DETECTION', maxResults: 10 },
                { type: 'TEXT_DETECTION', maxResults: 10 }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vision API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const annotations = result.responses?.[0];

    // Extrair logos detectados
    const logoAnnotations = annotations?.logoAnnotations || [];
    const textAnnotations = annotations?.textAnnotations || [];

    console.log(`   📊 Logos detectados: ${logoAnnotations.length}`);
    console.log(`   📊 Textos detectados: ${textAnnotations.length}`);

    // Normalizar nomes de marcas para comparação case-insensitive
    const normalizedBrands = originalBrands.map(b => b.toLowerCase());

    // ✅ CRITICAL FIX: Detectar TODOS os logos/textos, não apenas os que estavam nas originalBrands
    // Se o Qwen não detectou Nike inicialmente, mas o Vision API detecta agora, devemos reportar!

    // Verificar TODOS os logos detectados (sem filtro de marcas originais)
    const remainingLogos = logoAnnotations; // ✅ PEGOU TODOS

    // Verificar TODOS os textos detectados (sem filtro de marcas originais)
    const remainingTexts = textAnnotations.slice(1); // ✅ PEGOU TODOS (pula o primeiro que é texto completo)

    // Logar detalhes
    if (remainingLogos.length > 0) {
      console.log('   ⚠️ Logos de marcas ainda visíveis:');
      remainingLogos.forEach((logo: any, i: number) => {
        console.log(`      [${i + 1}] ${logo.description} (confidence: ${(logo.score * 100).toFixed(1)}%)`);
      });
    }

    if (remainingTexts.length > 0) {
      console.log('   ⚠️ Textos de marcas ainda visíveis:');
      remainingTexts.slice(0, 5).forEach((text: any, i: number) => {
        console.log(`      [${i + 1}] "${text.description.substring(0, 50)}..."`);
      });
    }

    // Calcular riskScore baseado em detecções
    // - Cada logo = 40 pontos
    // - Cada texto = 20 pontos
    // - Cap em 100
    const logoRisk = Math.min(remainingLogos.length * 40, 60);
    const textRisk = Math.min(remainingTexts.length * 20, 40);
    const riskScore = Math.min(logoRisk + textRisk, 100);

    // Extrair nomes das marcas detectadas
    const detectedBrands = [
      ...remainingLogos.map((l: any) => l.description),
      ...remainingTexts.map((t: any) => t.description)
    ];
    const uniqueBrands = Array.from(new Set(detectedBrands));

    const isClean = remainingLogos.length === 0 && remainingTexts.length === 0;

    const result_verification: VerificationResult = {
      isClean,
      riskScore,
      remainingBrands: uniqueBrands,
      description: isClean
        ? 'All brand elements successfully removed (Vision API verified)'
        : `${remainingLogos.length} logo(s) + ${remainingTexts.length} text(s) still visible`
    };

    console.log('✅ [VISION API] Verificação completa:', {
      isClean: result_verification.isClean,
      riskScore: result_verification.riskScore,
      remainingBrands: result_verification.remainingBrands.length,
      description: result_verification.description
    });

    return result_verification;

  } catch (error) {
    console.error('❌ [VISION API] Erro na verificação:', error);
    console.log('⚠️ FALLBACK: Usando Gemini como backup...');

    // Fallback para Gemini se Vision API falhar
    return verify(imageBase64, originalBrands);
  }
}

/**
 * Verify using Vision API and return detected regions with coordinates
 *
 * Esta função é CRITICAL para aplicar máscaras pretas nos logos detectados!
 *
 * @param imageBase64 - Base64-encoded edited image
 * @param originalBrands - Array of brands to look for
 * @param imageWidth - Largura da imagem em pixels
 * @param imageHeight - Altura da imagem em pixels
 * @returns Verification result WITH coordinates of detected logos
 */
export async function verifyWithVisionAPIAndGetRegions(
  imageBase64: string,
  originalBrands: string[],
  imageWidth: number,
  imageHeight: number
): Promise<VisionVerificationResult> {
  console.log('🔍 [VISION API] Verificando logos e obtendo coordenadas...');
  console.log(`   Marcas originais: ${originalBrands.join(', ')}`);
  console.log(`   Dimensões da imagem: ${imageWidth}x${imageHeight}`);

  try {
    const accessToken = await getAccessToken();
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    // Chamar Vision API
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-goog-user-project': GOOGLE_CLOUD_PROJECT_ID
        },
        body: JSON.stringify({
          requests: [
            {
              image: { content: cleanBase64 },
              features: [
                { type: 'LOGO_DETECTION', maxResults: 10 },
                { type: 'TEXT_DETECTION', maxResults: 10 }
              ]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Vision API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const annotations = result.responses?.[0];

    const logoAnnotations = annotations?.logoAnnotations || [];
    const textAnnotations = annotations?.textAnnotations || [];

    console.log(`   📊 Logos detectados: ${logoAnnotations.length}`);
    console.log(`   📊 Textos detectados: ${textAnnotations.length}`);

    const normalizedBrands = originalBrands.map(b => b.toLowerCase());

    // ✅ CRITICAL FIX: Detectar TODOS os logos/textos, não apenas os que estavam nas originalBrands
    // Se o Qwen não detectou Nike inicialmente, mas o Vision API detecta agora, devemos mascarar!

    // Processar TODOS os logos detectados (sem filtro de marcas originais)
    const remainingLogos = logoAnnotations; // ✅ PEGOU TODOS

    // Processar TODOS os textos detectados (sem filtro de marcas originais)
    // Nota: Pular o primeiro elemento (textAnnotations[0]) que é o texto completo
    const remainingTexts = textAnnotations.slice(1); // ✅ PEGOU TODOS

    // Converter boundingPoly para box_2d (formato normalizado 0-1000)
    const detectedRegions: VisionDetectedRegion[] = [];

    // Adicionar logos
    remainingLogos.forEach((logo: any) => {
      const vertices = logo.boundingPoly.vertices;

      // Encontrar min/max coordinates
      const xCoords = vertices.map((v: any) => v.x || 0);
      const yCoords = vertices.map((v: any) => v.y || 0);

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minY = Math.min(...yCoords);
      const maxY = Math.max(...yCoords);

      // Normalizar para 0-1000
      const normalizedXMin = Math.round((minX / imageWidth) * 1000);
      const normalizedXMax = Math.round((maxX / imageWidth) * 1000);
      const normalizedYMin = Math.round((minY / imageHeight) * 1000);
      const normalizedYMax = Math.round((maxY / imageHeight) * 1000);

      detectedRegions.push({
        brand: logo.description,
        type: 'logo',
        confidence: logo.score * 100,
        boundingPoly: logo.boundingPoly,
        box_2d: [normalizedYMin, normalizedXMin, normalizedYMax, normalizedXMax]
      });

      console.log(`   🎯 Logo detectado: ${logo.description}`);
      console.log(`      Pixels: x=[${minX}-${maxX}], y=[${minY}-${maxY}]`);
      console.log(`      Normalized (0-1000): [${normalizedYMin}, ${normalizedXMin}, ${normalizedYMax}, ${normalizedXMax}]`);
    });

    // Adicionar textos
    remainingTexts.forEach((text: any) => {
      const vertices = text.boundingPoly.vertices;

      const xCoords = vertices.map((v: any) => v.x || 0);
      const yCoords = vertices.map((v: any) => v.y || 0);

      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minY = Math.min(...yCoords);
      const maxY = Math.max(...yCoords);

      const normalizedXMin = Math.round((minX / imageWidth) * 1000);
      const normalizedXMax = Math.round((maxX / imageWidth) * 1000);
      const normalizedYMin = Math.round((minY / imageHeight) * 1000);
      const normalizedYMax = Math.round((maxY / imageHeight) * 1000);

      detectedRegions.push({
        brand: text.description,
        type: 'text',
        confidence: 100, // TEXT_DETECTION não retorna confidence
        boundingPoly: text.boundingPoly,
        box_2d: [normalizedYMin, normalizedXMin, normalizedYMax, normalizedXMax]
      });

      console.log(`   📝 Texto detectado: "${text.description}"`);
      console.log(`      Pixels: x=[${minX}-${maxX}], y=[${minY}-${maxY}]`);
      console.log(`      Normalized (0-1000): [${normalizedYMin}, ${normalizedXMin}, ${normalizedYMax}, ${normalizedXMax}]`);
    });

    // Calcular riskScore
    const logoRisk = Math.min(remainingLogos.length * 40, 60);
    const textRisk = Math.min(remainingTexts.length * 20, 40);
    const riskScore = Math.min(logoRisk + textRisk, 100);

    const detectedBrands = [
      ...remainingLogos.map((l: any) => l.description),
      ...remainingTexts.map((t: any) => t.description)
    ];
    const uniqueBrands = Array.from(new Set(detectedBrands));

    const isClean = detectedRegions.length === 0;

    const result_verification: VisionVerificationResult = {
      isClean,
      riskScore,
      remainingBrands: uniqueBrands,
      description: isClean
        ? 'All brand elements successfully removed (Vision API verified)'
        : `${remainingLogos.length} logo(s) + ${remainingTexts.length} text(s) still visible`,
      detectedRegions // ✅ COORDENADAS PARA APLICAR MÁSCARAS PRETAS
    };

    console.log('✅ [VISION API] Verificação completa com coordenadas:', {
      isClean: result_verification.isClean,
      riskScore: result_verification.riskScore,
      detectedRegions: result_verification.detectedRegions.length,
      description: result_verification.description
    });

    return result_verification;

  } catch (error) {
    console.error('❌ [VISION API] Erro na verificação:', error);
    console.log('⚠️ FALLBACK: Retornando resultado vazio...');

    // Fallback: retornar resultado indicando falha
    return {
      isClean: false,
      riskScore: 50,
      remainingBrands: originalBrands,
      description: 'Vision API falhou - assumindo marcas presentes',
      detectedRegions: [] // Sem coordenadas disponíveis
    };
  }
}
