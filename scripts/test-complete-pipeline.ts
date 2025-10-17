/**
 * Test Complete Pipeline: Qwen Edit → Vision AI Verification
 *
 * Fluxo completo:
 * 1. Edit image with Qwen (remove brands)
 * 2. Analyze edited image with Vision AI
 * 3. Save debug images with bounding boxes
 * 4. Show complete before/after report
 *
 * Usage:
 *   pnpm tsx scripts/test-complete-pipeline.ts <image-path>
 *
 * Example:
 *   pnpm tsx scripts/test-complete-pipeline.ts "debug/26193-Nike-Dunk-High-Light-Chocolate.jpg"
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { getAccessToken } from '../src/lib/vertex-auth';

// Load environment
config({ path: path.join(process.cwd(), '.env.local') });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_API_URL = 'https://api.replicate.com/v1';
const GOOGLE_CLOUD_PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID;

if (!REPLICATE_API_TOKEN) {
  console.error('❌ REPLICATE_API_TOKEN not found in .env.local');
  process.exit(1);
}

if (!GOOGLE_CLOUD_PROJECT_ID) {
  console.error('❌ GOOGLE_CLOUD_PROJECT_ID not found in .env.local');
  process.exit(1);
}

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

interface PipelineResult {
  originalPath: string;
  editedPath: string;
  comparisonPath: string;
  visionAnalysisPath: string;
  originalDetections: VisionAPIDetection;
  editedDetections: VisionAPIDetection;
  success: boolean;
  cleanPercentage: number;
}

// ============================================================================
// STEP 1: EDIT WITH QWEN
// ============================================================================

async function imageToDataUrl(imagePath: string): Promise<string> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Image not found: ${absolutePath}`);
  }

  const buffer = await sharp(absolutePath).png().toBuffer();
  const base64 = buffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

async function editImageWithQwen(
  imageDataUrl: string,
  prompt: string
): Promise<string> {
  console.log('🚀 [STEP 1] Editing with Qwen...');
  console.log('📝 Prompt:', prompt);
  console.log('');

  const response = await fetch(
    `${REPLICATE_API_URL}/models/qwen/qwen-image-edit/predictions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60'
      },
      body: JSON.stringify({
        input: {
          image: imageDataUrl,
          prompt: prompt
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Qwen API error: ${response.status} - ${errorText}`);
  }

  const initialResult = await response.json();

  // Poll for result
  let result = initialResult;
  let attempts = 0;
  const maxAttempts = 60;

  while (result.status === 'processing' || result.status === 'starting') {
    if (attempts >= maxAttempts) {
      throw new Error('Timeout: Processing took too long');
    }

    attempts++;
    console.log(`   ⏳ Processing... (${attempts}s)`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const pollResponse = await fetch(
      `${REPLICATE_API_URL}/predictions/${result.id}`,
      {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!pollResponse.ok) {
      throw new Error(`Failed to poll status: ${pollResponse.status}`);
    }

    result = await pollResponse.json();
  }

  if (result.error) {
    throw new Error(`Qwen processing error: ${result.error}`);
  }

  if (result.status !== 'succeeded' || !result.output || !result.output[0]) {
    throw new Error('Qwen failed to generate output');
  }

  console.log('   ✅ Editing complete!');
  console.log('');

  return result.output[0];
}

async function downloadAndSaveImage(imageUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await sharp(buffer).png().toFile(outputPath);
}

// ============================================================================
// STEP 2: ANALYZE WITH VISION AI
// ============================================================================

async function analyzeWithVisionAPI(imagePath: string): Promise<VisionAPIDetection> {
  console.log('🔍 [STEP 2] Analyzing with Vision AI...');

  // Read and convert to base64
  const buffer = await sharp(imagePath).png().toBuffer();
  const base64 = buffer.toString('base64');

  // Get access token
  const accessToken = await getAccessToken();

  // Call Vision API
  const response = await fetch(
    'https://vision.googleapis.com/v1/images:annotate',
    {
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
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API error: ${response.status} - ${errorText}`);
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

  console.log('   ✅ Analysis complete!');
  console.log('');

  return { logos, texts };
}

// ============================================================================
// STEP 3: SAVE DEBUG IMAGE WITH BOUNDING BOXES
// ============================================================================

async function saveImageWithBoundingBoxes(
  imagePath: string,
  detection: VisionAPIDetection,
  outputPath: string
): Promise<void> {
  console.log('🎨 [STEP 3] Creating debug visualization...');

  const imageBuffer = await fs.promises.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const allRegions = [
    ...detection.logos.map(l => ({ ...l, type: 'logo' as const })),
    ...detection.texts.map(t => ({ ...t, type: 'text' as const, brand: t.text, confidence: 100 }))
  ];

  if (allRegions.length === 0) {
    console.log('   ℹ️  No detections - saving clean image');
    await fs.promises.copyFile(imagePath, outputPath);
    return;
  }

  // Create SVG overlay
  const boxes = allRegions.map((region, idx) => {
    const vertices = region.boundingPoly.vertices;
    const x = Math.min(...vertices.map(v => v.x || 0));
    const y = Math.min(...vertices.map(v => v.y || 0));
    const maxX = Math.max(...vertices.map(v => v.x || 0));
    const maxY = Math.max(...vertices.map(v => v.y || 0));
    const boxWidth = maxX - x;
    const boxHeight = maxY - y;

    const color = region.type === 'logo' ? '#ff0000' : '#0066ff';
    const label = region.type === 'logo'
      ? `${region.brand} (${region.confidence}%)`
      : region.brand;

    return `
      <rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}"
            fill="none" stroke="${color}" stroke-width="3"/>
      <rect x="${x}" y="${y - 25}" width="${label.length * 8}" height="25"
            fill="${color}" opacity="0.8"/>
      <text x="${x + 5}" y="${y - 8}" fill="white" font-size="14" font-family="Arial">${label}</text>
    `;
  }).join('');

  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${height}">
      ${boxes}
    </svg>
  `);

  await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  console.log('   ✅ Debug image saved!');
  console.log('');
}

// ============================================================================
// STEP 4: CREATE COMPARISON
// ============================================================================

async function createComparison(
  originalPath: string,
  editedPath: string,
  outputPath: string
): Promise<void> {
  console.log('🎨 [STEP 4] Creating before/after comparison...');

  const [originalMeta, editedMeta] = await Promise.all([
    sharp(originalPath).metadata(),
    sharp(editedPath).metadata()
  ]);

  const width = Math.max(originalMeta.width || 0, editedMeta.width || 0);
  const height = Math.max(originalMeta.height || 0, editedMeta.height || 0);

  const [originalBuffer, editedBuffer] = await Promise.all([
    sharp(originalPath).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer(),
    sharp(editedPath).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer()
  ]);

  await sharp({
    create: {
      width: width * 2 + 20,
      height: height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite([
    { input: originalBuffer, top: 0, left: 0 },
    { input: editedBuffer, top: 0, left: width + 20 }
  ])
  .png()
  .toFile(outputPath);

  console.log('   ✅ Comparison saved!');
  console.log('');
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function runPipeline(imagePath: string): Promise<PipelineResult> {
  const originalName = path.basename(imagePath, path.extname(imagePath));
  const qwenDir = path.join(process.cwd(), 'debug', 'qwen');

  // Ensure output directory exists
  if (!fs.existsSync(qwenDir)) {
    fs.mkdirSync(qwenDir, { recursive: true });
  }

  // Define output paths
  const editedPath = path.join(qwenDir, `${originalName}_edited.png`);
  const comparisonPath = path.join(qwenDir, `${originalName}_comparison.png`);
  const visionAnalysisPath = path.join(qwenDir, `${originalName}_vision_analysis.png`);

  // STEP 0: Analyze original image
  console.log('🔍 [STEP 0] Analyzing ORIGINAL image with Vision AI...');
  const absoluteOriginal = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);
  const originalDetections = await analyzeWithVisionAPI(absoluteOriginal);
  console.log(`   📊 Original: ${originalDetections.logos.length} logos, ${originalDetections.texts.length} texts`);
  console.log('');

  // STEP 1: Edit with Qwen
  const imageDataUrl = await imageToDataUrl(imagePath);
  const editedUrl = await editImageWithQwen(
    imageDataUrl,
    'Remove all Nike logos, swooshes, and brand text from this product. Keep the shoe intact but completely remove branding.'
  );

  await downloadAndSaveImage(editedUrl, editedPath);

  // STEP 2: Analyze edited image
  const editedDetections = await analyzeWithVisionAPI(editedPath);
  console.log(`   📊 Edited: ${editedDetections.logos.length} logos, ${editedDetections.texts.length} texts`);
  console.log('');

  // STEP 3: Save vision analysis with bounding boxes
  await saveImageWithBoundingBoxes(editedPath, editedDetections, visionAnalysisPath);

  // STEP 4: Create comparison
  await createComparison(absoluteOriginal, editedPath, comparisonPath);

  // Calculate success metrics
  const originalTotal = originalDetections.logos.length + originalDetections.texts.length;
  const editedTotal = editedDetections.logos.length + editedDetections.texts.length;
  const removed = originalTotal - editedTotal;
  const cleanPercentage = originalTotal > 0 ? Math.round((removed / originalTotal) * 100) : 100;
  const success = editedTotal === 0;

  return {
    originalPath: absoluteOriginal,
    editedPath,
    comparisonPath,
    visionAnalysisPath,
    originalDetections,
    editedDetections,
    success,
    cleanPercentage
  };
}

// ============================================================================
// REPORT
// ============================================================================

function printReport(result: PipelineResult): void {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 COMPLETE PIPELINE REPORT');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');

  console.log('📁 FILES GENERATED:');
  console.log(`   Original:      ${result.originalPath}`);
  console.log(`   Edited:        ${result.editedPath}`);
  console.log(`   Comparison:    ${result.comparisonPath}`);
  console.log(`   Vision Debug:  ${result.visionAnalysisPath}`);
  console.log('');

  console.log('🔍 DETECTION COMPARISON:');
  console.log('');
  console.log('   BEFORE (Original Image):');
  console.log(`   ├─ Logos:  ${result.originalDetections.logos.length}`);
  if (result.originalDetections.logos.length > 0) {
    result.originalDetections.logos.forEach(logo => {
      console.log(`   │  └─ ${logo.brand} (${logo.confidence}%)`);
    });
  }
  console.log(`   └─ Texts:  ${result.originalDetections.texts.length}`);
  if (result.originalDetections.texts.length > 0) {
    result.originalDetections.texts.slice(0, 5).forEach(text => {
      console.log(`      └─ "${text.text}"`);
    });
    if (result.originalDetections.texts.length > 5) {
      console.log(`      └─ ... and ${result.originalDetections.texts.length - 5} more`);
    }
  }
  console.log('');

  console.log('   AFTER (Edited by Qwen):');
  console.log(`   ├─ Logos:  ${result.editedDetections.logos.length}`);
  if (result.editedDetections.logos.length > 0) {
    result.editedDetections.logos.forEach(logo => {
      console.log(`   │  └─ ${logo.brand} (${logo.confidence}%)`);
    });
  }
  console.log(`   └─ Texts:  ${result.editedDetections.texts.length}`);
  if (result.editedDetections.texts.length > 0) {
    result.editedDetections.texts.forEach(text => {
      console.log(`      └─ "${text.text}"`);
    });
  }
  console.log('');

  console.log('📈 METRICS:');
  const originalTotal = result.originalDetections.logos.length + result.originalDetections.texts.length;
  const editedTotal = result.editedDetections.logos.length + result.editedDetections.texts.length;
  const removed = originalTotal - editedTotal;

  console.log(`   Elements removed:  ${removed}/${originalTotal}`);
  console.log(`   Clean percentage:  ${result.cleanPercentage}%`);
  console.log(`   Status:            ${result.success ? '✅ COMPLETELY CLEAN' : '⚠️ SOME DETECTIONS REMAIN'}`);
  console.log('');

  console.log('═══════════════════════════════════════════════════════════════════════════');

  if (result.success) {
    console.log('✅ SUCCESS! Image is 100% clean - no brands detected!');
  } else {
    console.log('⚠️  WARNING: Some brand elements still detected after editing.');
    console.log('   Check the vision_analysis.png file to see what remains.');
  }

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('');
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  console.log('🧪 COMPLETE PIPELINE TEST: Qwen Edit → Vision AI Verification\n');

  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ Error: Image path not provided\n');
    console.log('Usage:');
    console.log('  pnpm tsx scripts/test-complete-pipeline.ts <image-path>\n');
    console.log('Example:');
    console.log('  pnpm tsx scripts/test-complete-pipeline.ts "debug/26193-Nike-Dunk-High-Light-Chocolate.jpg"');
    console.log('');
    process.exit(1);
  }

  try {
    const result = await runPipeline(imagePath);
    printReport(result);

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ PIPELINE FAILED:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);
      if (error.stack) {
        console.error('Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('   Unknown error:', error);
    }
    process.exit(1);
  }
}

// Run
main();
