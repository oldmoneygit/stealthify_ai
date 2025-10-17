/**
 * Apply Preventive Masks - Blur or Black Mask on remaining detections
 *
 * Reads Vision AI analysis results and applies blur/black masks
 * to regions where Nike brands were still detected after Qwen editing
 *
 * Usage:
 *   pnpm tsx scripts/apply-preventive-masks.ts
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { getAccessToken } from '../src/lib/vertex-auth';

// Load environment
config({ path: path.join(process.cwd(), '.env.local') });

const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

// ============================================================================
// TYPES
// ============================================================================

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

interface BlurResult {
  filename: string;
  originalDetections: number;
  blurredRegions: number;
  success: boolean;
}

// ============================================================================
// VISION AI ANALYSIS
// ============================================================================

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

  if (!response.ok) {
    throw new Error(`Vision API error: ${response.status}`);
  }

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

// ============================================================================
// MASK APPLICATION
// ============================================================================

/**
 * Apply black mask or blur to detected regions
 */
async function applyMaskToRegions(
  imagePath: string,
  detection: VisionAPIDetection,
  outputPath: string,
  useBlur: boolean = true
): Promise<void> {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // Filter Nike-related detections
  const nikeLogos = detection.logos.filter(logo =>
    logo.brand.toLowerCase().includes('nike') ||
    logo.confidence > 70
  );

  const nikeTexts = detection.texts.filter(text => {
    const t = text.text.toLowerCase();
    return t.includes('nike') ||
           t.includes('swoosh') ||
           t === 'sb' ||
           t.includes('air') ||
           t.length >= 4; // Only significant texts
  });

  const allRegions = [
    ...nikeLogos.map(l => l.boundingPoly),
    ...nikeTexts.map(t => t.boundingPoly)
  ];

  if (allRegions.length === 0) {
    // No detections, just copy the image
    await fs.promises.copyFile(imagePath, outputPath);
    return;
  }

  console.log(`   Found ${allRegions.length} regions to mask (${nikeLogos.length} logos, ${nikeTexts.length} texts)`);

  // Load original image
  let image = sharp(imageBuffer);

  // Create masks for each region
  const masks: Array<{ input: Buffer; top: number; left: number }> = [];

  for (const region of allRegions) {
    const vertices = region.vertices;
    const x = Math.max(0, Math.min(...vertices.map(v => v.x || 0)) - 10); // 10px padding
    const y = Math.max(0, Math.min(...vertices.map(v => v.y || 0)) - 10);
    const maxX = Math.min(width, Math.max(...vertices.map(v => v.x || 0)) + 10);
    const maxY = Math.min(height, Math.max(...vertices.map(v => v.y || 0)) + 10);
    const boxWidth = maxX - x;
    const boxHeight = maxY - y;

    if (boxWidth <= 0 || boxHeight <= 0) continue;

    if (useBlur) {
      // Extract region and apply heavy blur
      const regionBuffer = await sharp(imageBuffer)
        .extract({ left: Math.floor(x), top: Math.floor(y), width: Math.floor(boxWidth), height: Math.floor(boxHeight) })
        .blur(50) // Heavy blur
        .toBuffer();

      masks.push({
        input: regionBuffer,
        top: Math.floor(y),
        left: Math.floor(x)
      });
    } else {
      // Create black rectangle
      const blackRect = await sharp({
        create: {
          width: Math.floor(boxWidth),
          height: Math.floor(boxHeight),
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 }
        }
      })
      .png()
      .toBuffer();

      masks.push({
        input: blackRect,
        top: Math.floor(y),
        left: Math.floor(x)
      });
    }
  }

  // Apply all masks
  await image
    .composite(masks)
    .png()
    .toFile(outputPath);

  console.log(`   Applied ${useBlur ? 'blur' : 'black mask'} to ${masks.length} regions`);
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processImage(
  editedImagePath: string,
  outputDir: string,
  useBlur: boolean
): Promise<BlurResult> {
  const filename = path.basename(editedImagePath);
  const nameWithoutExt = path.basename(editedImagePath, path.extname(editedImagePath));

  // Remove "_edited" suffix if present
  const cleanName = nameWithoutExt.replace(/_edited$/, '');
  const outputFilename = `${cleanName}_edited-blur.png`;
  const outputPath = path.join(outputDir, outputFilename);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📸 Processing: ${filename}`);
  console.log('='.repeat(80));

  try {
    // Analyze edited image
    console.log('   [1/2] Analyzing with Vision AI...');
    const detection = await analyzeWithVisionAPI(editedImagePath);

    const totalDetections = detection.logos.length + detection.texts.length;
    console.log(`   Found: ${detection.logos.length} logos, ${detection.texts.length} texts (${totalDetections} total)`);

    if (totalDetections === 0) {
      console.log('   ✅ Image is clean - no mask needed');
      return {
        filename,
        originalDetections: 0,
        blurredRegions: 0,
        success: true
      };
    }

    // Apply mask
    console.log('   [2/2] Applying preventive mask...');
    await applyMaskToRegions(editedImagePath, detection, outputPath, useBlur);

    console.log(`   ✅ Saved to: ${outputFilename}`);

    return {
      filename,
      originalDetections: totalDetections,
      blurredRegions: totalDetections,
      success: true
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : error}`);
    return {
      filename,
      originalDetections: 0,
      blurredRegions: 0,
      success: false
    };
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

async function main() {
  console.log('🎭 PREVENTIVE MASKS APPLICATION - Blur/Black Mask for Remaining Detections\n');

  const editedDir = path.join(process.cwd(), 'debug', 'comparison', 'edited');
  const outputDir = path.join(process.cwd(), 'debug', 'comparison', 'blur-edited');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ Created output directory: ${outputDir}\n`);
  }

  // Find all edited images
  const allFiles = fs.readdirSync(editedDir);
  const editedImages = allFiles.filter(f =>
    f.endsWith('_edited.png') &&
    !f.includes('comparison')
  );

  console.log(`📂 Input folder: ${editedDir}`);
  console.log(`📸 Found ${editedImages.length} edited images to process`);
  console.log(`📁 Output folder: ${outputDir}\n`);

  const useBlur = true; // Set to false for black masks instead of blur

  const results: BlurResult[] = [];
  let processedCount = 0;
  let cleanCount = 0;
  let maskedCount = 0;

  for (let i = 0; i < editedImages.length; i++) {
    const imageFile = editedImages[i];
    const imagePath = path.join(editedDir, imageFile);

    try {
      const result = await processImage(imagePath, outputDir, useBlur);
      results.push(result);

      if (result.success) {
        processedCount++;
        if (result.originalDetections === 0) {
          cleanCount++;
        } else {
          maskedCount++;
        }
      }
    } catch (error) {
      console.error(`Failed to process ${imageFile}`);
    }

    console.log(`\n📊 Progress: ${i + 1}/${editedImages.length} (${cleanCount} clean, ${maskedCount} masked)\n`);
  }

  // Generate summary report
  const reportPath = path.join(outputDir, 'MASK_APPLICATION_REPORT.txt');
  const report = generateReport(results, cleanCount, maskedCount);
  fs.writeFileSync(reportPath, report);

  console.log('\n' + '='.repeat(80));
  console.log(report);
  console.log('='.repeat(80));
  console.log(`\n💾 Report saved to: ${reportPath}`);
  console.log(`\n✅ Mask application complete!\n`);

  process.exit(0);
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(
  results: BlurResult[],
  cleanCount: number,
  maskedCount: number
): string {
  const totalProcessed = results.length;
  const successCount = results.filter(r => r.success).length;
  const totalDetectionsRemoved = results.reduce((sum, r) => sum + r.blurredRegions, 0);

  let report = `
${'═'.repeat(80)}
📊 PREVENTIVE MASKS APPLICATION REPORT
${'═'.repeat(80)}

📈 OVERALL METRICS
${'─'.repeat(80)}
Total Images Processed:        ${totalProcessed}
Successfully Processed:        ${successCount}
Images Already Clean:          ${cleanCount} (${Math.round((cleanCount / totalProcessed) * 100)}%)
Images with Masks Applied:     ${maskedCount} (${Math.round((maskedCount / totalProcessed) * 100)}%)
Total Regions Masked:          ${totalDetectionsRemoved}

📋 DETAILED RESULTS
${'─'.repeat(80)}

`;

  // Sort: masked images first, then clean images
  const sortedResults = [...results].sort((a, b) => {
    if (a.blurredRegions !== b.blurredRegions) {
      return b.blurredRegions - a.blurredRegions;
    }
    return a.filename.localeCompare(b.filename);
  });

  sortedResults.forEach((result, idx) => {
    const status = result.blurredRegions === 0 ? '✅ CLEAN' : '🎭 MASKED';
    report += `[${idx + 1}] ${status} ${result.filename}\n`;
    if (result.blurredRegions > 0) {
      report += `    Detections found: ${result.originalDetections}\n`;
      report += `    Regions masked: ${result.blurredRegions}\n`;
    }
    report += `\n`;
  });

  report += `${'═'.repeat(80)}
✅ CONCLUSION
${'─'.repeat(80)}
${maskedCount} images had remaining brand detections and received preventive masks.
${cleanCount} images were already completely clean.

All images are now saved in the blur-edited/ folder.
${'═'.repeat(80)}
`;

  return report;
}

// Run
main();
