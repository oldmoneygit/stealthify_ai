import { VERIFICATION_PROMPT } from '@/lib/constants';
import { retryWithBackoff } from '@/utils/retry';
import type { VerificationResult } from '@/lib/types';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.0-flash-exp'; // Modelo experimental mais leve e menos congestionado

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
