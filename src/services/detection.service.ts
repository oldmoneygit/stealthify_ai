import {
  DETECTION_PROMPT,
  SEGMENTATION_PROMPT
} from '@/lib/constants';
import { urlToBase64 } from '@/utils/image-converter';
import { retryWithBackoff } from '@/utils/retry';
import type {
  BrandDetection,
  DetectionRegion,
  Segment
} from '@/lib/types';

const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Detect brand logos and text in product image using Gemini Vision
 *
 * @param imageUrl - Product image URL
 * @returns Brand detection result with risk score and regions
 */
export async function detect(imageUrl: string): Promise<BrandDetection> {
  console.log('🔍 Detectando marcas na imagem...');

  return retryWithBackoff(async () => {
    // Convert image to base64
    const imageBase64 = await urlToBase64(imageUrl);

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: DETECTION_PROMPT },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64
                }
              }
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
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      throw new Error('No content in Gemini response');
    }

    // Parse JSON response
    const detection: BrandDetection = JSON.parse(content);

    console.log('✅ Detecção completa:', {
      brands: detection.brands,
      riskScore: detection.riskScore,
      regionsCount: detection.regions.length
    });

    return detection;

  }, {
    onRetry: (attempt, error) => {
      console.log(`⚠️ Detecção falhou (tentativa ${attempt}):`, error.message);
    }
  });
}

/**
 * Create precise segmentation masks for detected brand regions
 *
 * @param imageUrl - Product image URL
 * @param regions - Detected brand regions
 * @returns Array of precise polygon segments
 */
export async function segment(
  imageUrl: string,
  regions: DetectionRegion[]
): Promise<Segment[]> {
  console.log('🎯 Criando segmentação precisa de', regions.length, 'regiões...');

  if (regions.length === 0) {
    console.log('⚠️ Nenhuma região para segmentar');
    return [];
  }

  return retryWithBackoff(async () => {
    // Convert image to base64
    const imageBase64 = await urlToBase64(imageUrl);

    // Extract brand names
    const brands = [...new Set(regions.map(r => r.brand))];

    // Call Gemini API for segmentation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: SEGMENTATION_PROMPT(brands) },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: imageBase64
                }
              }
            ]
          }],
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
    const segmentation: { segments: Segment[] } = JSON.parse(content);

    console.log('✅ Segmentação completa:', {
      segmentsCount: segmentation.segments.length
    });

    return segmentation.segments;

  }, {
    onRetry: (attempt, error) => {
      console.log(`⚠️ Segmentação falhou (tentativa ${attempt}):`, error.message);
    }
  });
}
