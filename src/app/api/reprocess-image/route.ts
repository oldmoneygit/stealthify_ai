import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as qwenEditService from '@/services/qwen-edit.service';

interface ReprocessRequest {
  product_id: string;
  original_filename: string;
}

/**
 * Reprocess image using ORIGINAL as base to reduce blur
 */
export async function POST(request: NextRequest) {
  try {
    const body: ReprocessRequest = await request.json();
    const { product_id, original_filename } = body;

    console.log('🔄 [Reprocess] Starting reprocessing:', { product_id, original_filename });

    // 1. Read the ORIGINAL image (not the edited one)
    const originalPath = path.join(process.cwd(), 'debug', 'Originais', original_filename);

    if (!fs.existsSync(originalPath)) {
      return NextResponse.json({
        success: false,
        error: 'Original image not found'
      }, { status: 404 });
    }

    console.log('📖 [Reprocess] Reading ORIGINAL image from:', originalPath);

    // 2. Convert to base64 for Qwen
    const imageBuffer = fs.readFileSync(originalPath);
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64Image}`;

    console.log('🎨 [Reprocess] Running Qwen Edit on ORIGINAL image...');

    // 3. Run Qwen Image Edit using the same service as batch processing
    const brands = ['Nike', 'Jordan', 'Adidas'];
    const editedBase64 = await qwenEditService.editWithBrandRemoval(
      dataUri,
      brands,
      'sneaker'
    );

    console.log('✅ [Reprocess] Qwen completed!');

    // 4. Convert edited image to buffer
    const qwenImageBuffer = Buffer.from(editedBase64, 'base64');
    console.log('💾 [Reprocess] Qwen output:', qwenImageBuffer.length, 'bytes');

    // 5. Verify with Google Vision API (check if logos still present)
    console.log('🔍 [Reprocess] Verifying with Google Vision API...');

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: qwenImageBuffer.toString('base64') },
            features: [
              { type: 'LOGO_DETECTION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 10 }
            ]
          }]
        })
      }
    );

    const visionData = await visionResponse.json();

    // Fix: Check if responses array exists and has elements
    const response = visionData.responses?.[0];
    const logos = response?.logoAnnotations || [];
    const texts = response?.textAnnotations || [];

    console.log('🔍 [Reprocess] Vision results:', {
      logos: logos.length,
      texts: texts.length
    });

    // 6. If still has logos/text, apply smart blur ONLY to those regions
    let finalImage = qwenImageBuffer;
    let needsBlur = false;
    let blurRegions: Array<{ x: number; y: number; width: number; height: number }> = [];

    if (logos.length > 0 || texts.length > 0) {
      console.log('⚠️ [Reprocess] Still has logos/text, applying smart blur...');
      needsBlur = true;

      // Get image dimensions
      const metadata = await sharp(qwenImageBuffer).metadata();
      const imgWidth = metadata.width!;
      const imgHeight = metadata.height!;

      // Collect all regions that need blur
      [...logos, ...texts].forEach((detection: any) => {
        if (detection.boundingPoly && detection.boundingPoly.vertices) {
          const vertices = detection.boundingPoly.vertices;
          const xs = vertices.map((v: any) => v.x || 0);
          const ys = vertices.map((v: any) => v.y || 0);

          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);

          const width = maxX - minX;
          const height = maxY - minY;

          // Add padding (10%)
          const padding = 0.1;
          const paddedWidth = Math.round(width * (1 + padding));
          const paddedHeight = Math.round(height * (1 + padding));
          const paddedX = Math.max(0, Math.round(minX - (width * padding / 2)));
          const paddedY = Math.max(0, Math.round(minY - (height * padding / 2)));

          blurRegions.push({
            x: paddedX,
            y: paddedY,
            width: Math.min(paddedWidth, imgWidth - paddedX),
            height: Math.min(paddedHeight, imgHeight - paddedY)
          });
        }
      });

      // Apply blur to each region (LIGHTER blur than before - intensity 20 instead of 30)
      let sharpInstance = sharp(qwenImageBuffer);

      for (const region of blurRegions) {
        // Extract region
        const regionBuffer = await sharp(qwenImageBuffer)
          .extract({
            left: region.x,
            top: region.y,
            width: region.width,
            height: region.height
          })
          .blur(20) // REDUCED from 30 to 20 for less aggressive blur
          .toBuffer();

        // Composite blurred region back
        sharpInstance = sharpInstance.composite([{
          input: regionBuffer,
          top: region.y,
          left: region.x
        }]);
      }

      finalImage = await sharpInstance.toBuffer();
      console.log('✅ [Reprocess] Applied smart blur to', blurRegions.length, 'regions');
    } else {
      console.log('✅ [Reprocess] Image is clean! No blur needed.');
    }

    // 7. Save the reprocessed image (in a dedicated "reprocessed" folder)
    const reprocessedDir = path.join(process.cwd(), 'debug', 'reprocessed');

    // Create directory if it doesn't exist
    if (!fs.existsSync(reprocessedDir)) {
      fs.mkdirSync(reprocessedDir, { recursive: true });
    }

    const reprocessedFilename = `${product_id}-reprocessed-${Date.now()}.jpg`;
    const reprocessedPath = path.join(reprocessedDir, reprocessedFilename);

    fs.writeFileSync(reprocessedPath, finalImage);
    console.log('💾 [Reprocess] Saved reprocessed image:', reprocessedPath);

    // 8. Calculate new blur score
    const { data, info } = await sharp(finalImage)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    let laplacianSum = 0;
    let count = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const center = data[idx] ?? 0;
        const top = data[(y - 1) * width + x] ?? 0;
        const bottom = data[(y + 1) * width + x] ?? 0;
        const left = data[y * width + (x - 1)] ?? 0;
        const right = data[y * width + (x + 1)] ?? 0;

        const laplacian = Math.abs(top + bottom + left + right - 4 * center);
        laplacianSum += laplacian * laplacian;
        count++;
      }
    }

    const sharpnessScore = laplacianSum / count;

    let blurScore = 0;
    if (sharpnessScore < 50) blurScore = 100;
    else if (sharpnessScore < 100) blurScore = 80;
    else if (sharpnessScore < 150) blurScore = 60;
    else if (sharpnessScore < 200) blurScore = 40;
    else if (sharpnessScore < 300) blurScore = 20;
    else blurScore = 0;

    console.log('📊 [Reprocess] New blur score:', blurScore, '(sharpness:', sharpnessScore, ')');

    return NextResponse.json({
      success: true,
      reprocessed_filename: reprocessedFilename,
      reprocessed_url: `/api/reprocessed-images/${reprocessedFilename}`,
      blur_score: blurScore,
      sharpness_score: sharpnessScore,
      needed_blur: needsBlur,
      blur_regions_count: blurRegions.length,
      message: needsBlur
        ? `Image reprocessed with smart blur on ${blurRegions.length} regions`
        : 'Image reprocessed successfully - completely clean!'
    });

  } catch (error: any) {
    console.error('❌ [Reprocess] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Reprocessing failed'
    }, { status: 500 });
  }
}
