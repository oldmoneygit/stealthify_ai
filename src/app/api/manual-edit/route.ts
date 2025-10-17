import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import * as qwenEditService from '@/services/qwen-edit.service';

interface ManualEditRequest {
  product_id: string;
  image_url: string; // URL da imagem a ser editada (pode ser original, reeditada, etc)
  custom_prompt: string; // Prompt personalizado do usuário
}

/**
 * Manual image editing with custom prompt
 * Allows user to edit any image with their own instructions
 */
export async function POST(request: NextRequest) {
  try {
    const body: ManualEditRequest = await request.json();
    const { product_id, image_url, custom_prompt } = body;

    console.log('✏️ [Manual Edit] Starting manual edit:', {
      product_id,
      custom_prompt: custom_prompt.substring(0, 100) + '...'
    });

    if (!custom_prompt || custom_prompt.trim().length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Prompt personalizado é obrigatório'
      }, { status: 400 });
    }

    // 1. Determine the source image path
    let imageBuffer: Buffer;

    if (image_url.startsWith('/api/original-images/')) {
      // Original image
      const filename = image_url.split('/').pop();
      const imagePath = path.join(process.cwd(), 'debug', 'Originais', filename!);
      imageBuffer = fs.readFileSync(imagePath);
      console.log('📖 [Manual Edit] Reading from Originais:', filename);
    } else if (image_url.startsWith('/api/reprocessed-images/')) {
      // Reprocessed image
      const filename = image_url.split('/').pop();
      const imagePath = path.join(process.cwd(), 'debug', 'reprocessed', filename!);
      imageBuffer = fs.readFileSync(imagePath);
      console.log('📖 [Manual Edit] Reading from reprocessed:', filename);
    } else if (image_url.startsWith('/api/blur-images/')) {
      // Edited image from qwen directory
      const parts = image_url.split('/');
      const directory = parts[parts.length - 2];
      const filename = parts[parts.length - 1];

      if (!directory || !filename) {
        return NextResponse.json({
          success: false,
          error: 'Invalid blur image URL'
        }, { status: 400 });
      }

      const imagePath = path.join(process.cwd(), 'debug', 'qwen', directory, filename);
      imageBuffer = fs.readFileSync(imagePath);
      console.log('📖 [Manual Edit] Reading from qwen:', directory, filename);
    } else if (image_url.startsWith('/api/manual-edits/')) {
      // Previous manual edit
      const filename = image_url.split('/').pop();
      const imagePath = path.join(process.cwd(), 'debug', 'manual-edits', filename!);
      imageBuffer = fs.readFileSync(imagePath);
      console.log('📖 [Manual Edit] Reading from manual-edits:', filename);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid image URL'
      }, { status: 400 });
    }

    // 2. Convert to base64 for Qwen
    const base64Image = imageBuffer.toString('base64');
    const dataUri = `data:image/jpeg;base64,${base64Image}`;

    console.log('✏️ [Manual Edit] Running Qwen with custom prompt...');
    console.log('📝 [Manual Edit] User prompt:', custom_prompt);

    // 3. Run Qwen Edit with custom prompt
    const editedBase64 = await qwenEditService.editImageWithCustomPrompt(
      dataUri,
      custom_prompt
    );

    console.log('✅ [Manual Edit] Qwen completed!');

    const editedBuffer = Buffer.from(editedBase64, 'base64');

    // 4. Verify with Google Vision API (check if logos still present)
    console.log('🔍 [Manual Edit] Verifying with Google Vision API...');

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            image: { content: editedBuffer.toString('base64') },
            features: [
              { type: 'LOGO_DETECTION', maxResults: 10 },
              { type: 'TEXT_DETECTION', maxResults: 10 }
            ]
          }]
        })
      }
    );

    const visionData = await visionResponse.json();
    const response = visionData.responses?.[0];
    const logos = response?.logoAnnotations || [];
    const texts = response?.textAnnotations || [];

    console.log('🔍 [Manual Edit] Vision results:', {
      logos: logos.length,
      texts: texts.length
    });

    // 5. Calculate blur score
    const { data, info } = await sharp(editedBuffer)
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

    // 6. Save the manually edited image
    const manualEditDir = path.join(process.cwd(), 'debug', 'manual-edits');

    if (!fs.existsSync(manualEditDir)) {
      fs.mkdirSync(manualEditDir, { recursive: true });
    }

    const manualFilename = `${product_id}-manual-${Date.now()}.jpg`;
    const manualPath = path.join(manualEditDir, manualFilename);

    fs.writeFileSync(manualPath, editedBuffer);
    console.log('💾 [Manual Edit] Saved manual edit:', manualPath);

    // 7. Save edit metadata (prompt + results)
    const metadataFilename = `${product_id}-manual-${Date.now()}.json`;
    const metadataPath = path.join(manualEditDir, metadataFilename);

    const metadata = {
      product_id,
      custom_prompt,
      timestamp: new Date().toISOString(),
      source_image: image_url,
      result_image: `/api/manual-edits/${manualFilename}`,
      blur_score: blurScore,
      sharpness_score: sharpnessScore,
      logos_detected: logos.length,
      texts_detected: texts.length
    };

    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log('📝 [Manual Edit] Saved metadata:', metadataPath);

    return NextResponse.json({
      success: true,
      manual_filename: manualFilename,
      manual_url: `/api/manual-edits/${manualFilename}`,
      blur_score: blurScore,
      sharpness_score: sharpnessScore,
      logos_detected: logos.length,
      texts_detected: texts.length,
      custom_prompt,
      has_brands: logos.length > 0 || texts.length > 0,
      message: logos.length === 0 && texts.length === 0
        ? 'Edição manual concluída - imagem limpa!'
        : `Edição concluída - detectados ${logos.length} logos e ${texts.length} textos`
    });

  } catch (error: any) {
    console.error('❌ [Manual Edit] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Manual edit failed'
    }, { status: 500 });
  }
}
