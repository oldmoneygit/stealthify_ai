/**
 * Apply Smart Blur - Refined blur with better precision
 *
 * Improvements:
 * - Smaller blur radius (15 instead of 50)
 * - Tighter bounding boxes (no padding)
 * - Ignore very small texts (< 3 chars)
 * - Only blur high-confidence detections
 *
 * Usage:
 *   pnpm tsx scripts/apply-smart-blur.ts
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { getAccessToken } from '../src/lib/vertex-auth';

config({ path: path.join(process.cwd(), '.env.local') });

const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

interface VisionAPIDetection {
  logos: Array<{
    brand: string;
    confidence: number;
    boundingPoly: { vertices: Array<{ x: number; y: number }> };
  }>;
  texts: Array<{
    text: string;
    boundingPoly: { vertices: Array<{ x: number; y: number }> };
  }>;
}

async function analyzeWithVisionAPI(imagePath: string): Promise<VisionAPIDetection> {
  const buffer = await sharp(imagePath).png().toBuffer();
  const base64 = buffer.toString('base64');
  const accessToken = await getAccessToken();

  const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'x-goog-user-project': GOOGLE_CLOUD_PROJECT_ID
    },
    body: JSON.stringify({
      requests: [{
        image: { content: base64 },
        features: [
          { type: 'LOGO_DETECTION', maxResults: 50 },
          { type: 'TEXT_DETECTION', maxResults: 50 }
        ]
      }]
    })
  });

  const data = await response.json();
  const visionResponse = data.responses[0];

  const logos = (visionResponse.logoAnnotations || []).map((logo: any) => ({
    brand: logo.description,
    confidence: Math.round(logo.score * 100),
    boundingPoly: logo.boundingPoly
  }));

  const texts = (visionResponse.textAnnotations || []).slice(1).map((text: any) => ({
    text: text.description,
    boundingPoly: text.boundingPoly
  }));

  return { logos, texts };
}

/**
 * Apply SMART blur - smaller, more precise
 */
async function applySmartBlur(
  imagePath: string,
  detection: VisionAPIDetection,
  outputPath: string
): Promise<number> {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Filter with stricter criteria
  const nikeLogos = detection.logos.filter(logo =>
    (logo.brand.toLowerCase().includes('nike') && logo.confidence > 70) ||
    logo.confidence > 85 // Very high confidence
  );

  const nikeTexts = detection.texts.filter(text => {
    const t = text.text.toLowerCase();
    // Only significant Nike-related texts
    return (t.includes('nike') && text.text.length >= 3) ||
           (t === 'sb' || t === 'air') ||
           (t.length >= 6 && (t.includes('swoosh') || t.includes('jordan')));
  });

  const allRegions = [
    ...nikeLogos.map(l => l.boundingPoly),
    ...nikeTexts.map(t => t.boundingPoly)
  ];

  if (allRegions.length === 0) {
    await fs.promises.copyFile(imagePath, outputPath);
    return 0;
  }

  console.log(`   Applying smart blur to ${allRegions.length} critical regions`);

  let image = sharp(imageBuffer);
  const masks: Array<{ input: Buffer; top: number; left: number }> = [];

  for (const region of allRegions) {
    const vertices = region.vertices;
    // NO PADDING - exact bounding box
    const x = Math.max(0, Math.min(...vertices.map(v => v.x || 0)));
    const y = Math.max(0, Math.min(...vertices.map(v => v.y || 0)));
    const maxX = Math.min(width, Math.max(...vertices.map(v => v.x || 0)));
    const maxY = Math.min(height, Math.max(...vertices.map(v => v.y || 0)));
    const boxWidth = maxX - x;
    const boxHeight = maxY - y;

    if (boxWidth <= 0 || boxHeight <= 0 || boxWidth < 10 || boxHeight < 10) continue;

    // Extract region and apply LIGHT blur (15 instead of 50)
    const regionBuffer = await sharp(imageBuffer)
      .extract({
        left: Math.floor(x),
        top: Math.floor(y),
        width: Math.floor(boxWidth),
        height: Math.floor(boxHeight)
      })
      .blur(15) // Much lighter blur
      .toBuffer();

    masks.push({
      input: regionBuffer,
      top: Math.floor(y),
      left: Math.floor(x)
    });
  }

  await image.composite(masks).png().toFile(outputPath);
  return masks.length;
}

async function processImage(editedImagePath: string, outputDir: string): Promise<any> {
  const filename = path.basename(editedImagePath);
  const nameWithoutExt = path.basename(editedImagePath, path.extname(editedImagePath));
  const cleanName = nameWithoutExt.replace(/_edited$/, '');
  const outputFilename = `${cleanName}_edited-blur.png`;
  const outputPath = path.join(outputDir, outputFilename);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📸 ${filename}`);
  console.log('='.repeat(80));

  try {
    console.log('   [1/2] Analyzing...');
    const detection = await analyzeWithVisionAPI(editedImagePath);
    const totalDetections = detection.logos.length + detection.texts.length;

    if (totalDetections === 0) {
      console.log('   ✅ Clean - no processing needed');
      return { filename, detections: 0, masked: 0, success: true };
    }

    console.log(`   Found: ${detection.logos.length} logos, ${detection.texts.length} texts`);

    console.log('   [2/2] Applying smart blur...');
    const maskedRegions = await applySmartBlur(editedImagePath, detection, outputPath);

    if (maskedRegions === 0) {
      console.log('   ✅ No critical detections - skipped');
      return { filename, detections: totalDetections, masked: 0, success: true };
    }

    console.log(`   ✅ Applied blur to ${maskedRegions} regions`);
    return { filename, detections: totalDetections, masked: maskedRegions, success: true };

  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    return { filename, detections: 0, masked: 0, success: false };
  }
}

async function main() {
  console.log('🎯 SMART BLUR APPLICATION - Refined & Precise\n');

  const editedDir = path.join(process.cwd(), 'debug', 'comparison', 'edited');
  const outputDir = path.join(process.cwd(), 'debug', 'comparison', 'blur-edited-smart');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allFiles = fs.readdirSync(editedDir);
  const editedImages = allFiles.filter(f => f.endsWith('_edited.png') && !f.includes('comparison'));

  console.log(`📂 Input: ${editedDir}`);
  console.log(`📸 Images: ${editedImages.length}`);
  console.log(`📁 Output: ${outputDir}\n`);

  const results: any[] = [];
  let processedCount = 0;

  for (let i = 0; i < editedImages.length; i++) {
    const imageFile = editedImages[i];
    const imagePath = path.join(editedDir, imageFile);
    const result = await processImage(imagePath, outputDir);
    results.push(result);
    if (result.success) processedCount++;
    console.log(`\n📊 Progress: ${i + 1}/${editedImages.length}\n`);
  }

  console.log('\n✅ Smart blur application complete!');
  console.log(`📁 Results in: ${outputDir}\n`);
}

main();
