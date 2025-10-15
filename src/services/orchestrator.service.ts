import { db } from '@/lib/db';
import * as titleService from './title.service';
import * as detectionService from './detection.service';
import * as inpaintingService from './inpainting.service';
import * as verificationService from './verification.service';
import { createMask, createBlurMask, applyBlurWithMask } from '@/utils/mask-generator';
import { urlToBase64, getImageDimensions } from '@/utils/image-converter';
import type { Product, AnalysisResult } from '@/lib/types';

/**
 * Analyze single product through complete AI pipeline
 *
 * Pipeline stages:
 * 1. Title camouflage (100-200ms)
 * 2. Brand detection (2-3s)
 * 3. Segmentation (2-3s)
 * 4. Inpainting (5-8s)
 * 5. Verification (2-3s)
 * 6. Fallback blur if needed (1s)
 *
 * Total: ~12-20s per product
 *
 * @param product - Product from WooCommerce
 * @returns Analysis result with camouflaged title and edited image
 */
export async function analyzeSingleProduct(
  product: Product
): Promise<AnalysisResult> {
  console.log('\n' + '='.repeat(60));
  console.log(`🎯 ANALISANDO PRODUTO: ${product.sku}`);
  console.log('='.repeat(60));

  try {
    // FASE 1: Camouflage Title
    console.log('\n📝 [1/6] Camuflando título...');
    const camouflagedTitle = titleService.camouflage(product.name);
    console.log(`   Original: ${product.name}`);
    console.log(`   Camuflado: ${camouflagedTitle}`);

    // Convert image to base64 ONCE (cache for all phases)
    console.log('\n🖼️ Convertendo imagem para base64 (usado em todas as fases)...');
    const imageBase64 = await urlToBase64(product.image_url);
    const dimensions = await getImageDimensions(imageBase64);
    console.log(`   Dimensões: ${dimensions.width}x${dimensions.height}`);

    // FASE 2: Detect Brands
    console.log('\n🔍 [2/6] Detectando marcas na imagem...');
    const detection = await detectionService.detect(product.image_url);
    console.log(`   Marcas: ${detection.brands.join(', ') || 'nenhuma'}`);
    console.log(`   Risk Score: ${detection.riskScore}`);
    console.log(`   Regiões: ${detection.regions.length}`);

    // Check if image is already clean
    if (detection.riskScore < 50) {
      console.log('\n✅ [6/6] Imagem já está limpa (riskScore < 50)');

      const result: AnalysisResult = {
        title: camouflagedTitle,
        image: product.image_url, // Keep original
        brands_detected: detection.brands,
        risk_score: detection.riskScore,
        status: 'clean'
      };

      // Save to database
      await saveAnalysis(product.id, product.name, product.image_url, result);

      return result;
    }

    // FASE 3: Segmentation
    console.log('\n🎯 [3/6] Criando máscaras de segmentação...');
    const segments = await detectionService.segment(
      product.image_url,
      detection.regions
    );
    console.log(`   Segmentos: ${segments.length}`);

    // Create mask from segments
    const maskBase64 = await createMask(
      segments,
      dimensions.width,
      dimensions.height
    );

    // FASE 4: Inpainting
    console.log('\n✨ [4/6] Removendo logos com IA...');
    const editedImageBase64 = await inpaintingService.remove(
      imageBase64,
      maskBase64,
      detection.brands
    );

    // FASE 5: Verification
    console.log('\n🔎 [5/6] Verificando remoção...');
    const verification = await verificationService.verify(
      editedImageBase64,
      detection.brands
    );
    console.log(`   Clean: ${verification.isClean}`);
    console.log(`   Risk Score: ${verification.riskScore}`);

    if (verification.isClean) {
      // Success - all brands removed
      console.log('\n✅ [6/6] Produto limpo! Marcas removidas com sucesso.');

      const result: AnalysisResult = {
        title: camouflagedTitle,
        image: `data:image/jpeg;base64,${editedImageBase64}`,
        brands_detected: detection.brands,
        risk_score: verification.riskScore,
        status: 'clean'
      };

      await saveAnalysis(product.id, product.name, product.image_url, result);

      return result;
    }

    // FASE 6: Fallback Blur
    console.log('\n⚠️ [6/6] Aplicando blur em regiões persistentes...');
    console.log(`   Regiões para blur: ${verification.blurRegions?.length || 0}`);

    if (!verification.blurRegions || verification.blurRegions.length === 0) {
      // No blur regions specified, use edited image as-is
      console.log('   ⚠️ Nenhuma região de blur especificada, usando imagem editada');

      const result: AnalysisResult = {
        title: camouflagedTitle,
        image: `data:image/jpeg;base64,${editedImageBase64}`,
        brands_detected: detection.brands,
        risk_score: verification.riskScore,
        status: 'blur_applied'
      };

      await saveAnalysis(product.id, product.name, product.image_url, result);

      return result;
    }

    // Create blur mask
    const blurMaskBase64 = await createBlurMask(
      verification.blurRegions,
      dimensions.width,
      dimensions.height
    );

    // Apply blur to edited image
    const finalImageBase64 = await applyBlurWithMask(
      editedImageBase64,
      blurMaskBase64,
      50
    );

    const result: AnalysisResult = {
      title: camouflagedTitle,
      image: `data:image/jpeg;base64,${finalImageBase64}`,
      brands_detected: detection.brands,
      risk_score: verification.riskScore,
      status: 'blur_applied'
    };

    await saveAnalysis(product.id, product.name, product.image_url, result);

    console.log('\n✅ Pipeline concluído com blur aplicado');

    return result;

  } catch (error) {
    console.error('\n❌ Erro no pipeline:', error);

    const result: AnalysisResult = {
      title: product.name, // Keep original on error
      image: product.image_url,
      brands_detected: [],
      risk_score: 100,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };

    await saveAnalysis(product.id, product.name, product.image_url, result);

    throw error;
  }
}

/**
 * Analyze multiple products in batch
 *
 * @param products - Array of products to analyze
 * @param onProgress - Optional callback for progress updates
 * @returns Array of analysis results
 */
export async function analyzeBatch(
  products: Product[],
  onProgress?: (current: number, total: number, result: AnalysisResult) => void
): Promise<AnalysisResult[]> {
  console.log('\n' + '█'.repeat(60));
  console.log(`🚀 INICIANDO BATCH: ${products.length} produtos`);
  console.log('█'.repeat(60));

  const results: AnalysisResult[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    const current = i + 1;

    console.log(`\n📦 [${current}/${products.length}] Processando: ${product.sku}`);

    try {
      const result = await analyzeSingleProduct(product);
      results.push(result);

      if (onProgress) {
        onProgress(current, products.length, result);
      }

      console.log(`\n✅ [${current}/${products.length}] Concluído: ${result.status}`);

    } catch (error) {
      console.error(`\n❌ [${current}/${products.length}] Falhou:`, error);

      const failedResult: AnalysisResult = {
        title: product.name,
        image: product.image_url,
        brands_detected: [],
        risk_score: 100,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      results.push(failedResult);

      if (onProgress) {
        onProgress(current, products.length, failedResult);
      }
    }

    // Delay between products to avoid rate limits
    if (i < products.length - 1) {
      console.log('\n⏳ Aguardando 2s antes do próximo produto...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n' + '█'.repeat(60));
  console.log('🎉 BATCH CONCLUÍDO');
  console.log('█'.repeat(60));
  console.log(`Total: ${results.length}`);
  console.log(`✅ Clean: ${results.filter(r => r.status === 'clean').length}`);
  console.log(`⚠️ Blur: ${results.filter(r => r.status === 'blur_applied').length}`);
  console.log(`❌ Failed: ${results.filter(r => r.status === 'failed').length}`);
  console.log('');

  return results;
}

/**
 * Save analysis result to database
 */
async function saveAnalysis(
  productId: number,
  originalTitle: string,
  originalImageUrl: string,
  result: AnalysisResult
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO analyses (
      product_id,
      original_title,
      camouflaged_title,
      original_image_url,
      edited_image_base64,
      brands_detected,
      risk_score,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    productId,
    originalTitle,
    result.title,
    originalImageUrl,
    result.image,
    JSON.stringify(result.brands_detected),
    result.risk_score,
    result.status
  );

  console.log('💾 Análise salva no banco de dados');
}

/**
 * Get analysis for a product
 */
export function getAnalysis(productId: number): AnalysisResult | null {
  const stmt = db.prepare(`
    SELECT * FROM analyses
    WHERE product_id = ?
    ORDER BY analyzed_at DESC
    LIMIT 1
  `);

  const row = stmt.get(productId) as any;

  if (!row) {
    return null;
  }

  return {
    title: row.camouflaged_title,
    image: row.edited_image_base64,
    brands_detected: JSON.parse(row.brands_detected),
    risk_score: row.risk_score,
    status: row.status
  };
}

/**
 * Get all analyses
 */
export function getAllAnalyses(): Array<{
  productId: number;
  analysis: AnalysisResult;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      product_id,
      camouflaged_title,
      edited_image_base64,
      brands_detected,
      risk_score,
      status,
      analyzed_at
    FROM analyses
    ORDER BY analyzed_at DESC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => ({
    productId: row.product_id,
    analysis: {
      title: row.camouflaged_title,
      image: row.edited_image_base64,
      brands_detected: JSON.parse(row.brands_detected),
      risk_score: row.risk_score,
      status: row.status
    },
    analyzedAt: row.analyzed_at
  }));
}
