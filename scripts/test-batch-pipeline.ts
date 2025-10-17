/**
 * Batch Pipeline Test: Process multiple images
 *
 * Processes all images in a folder through the complete pipeline:
 * 1. Edit with Qwen
 * 2. Analyze with Vision AI
 * 3. Generate organized output folders
 * 4. Create comprehensive report
 *
 * Usage:
 *   pnpm tsx scripts/test-batch-pipeline.ts <input-folder>
 *
 * Example:
 *   pnpm tsx scripts/test-batch-pipeline.ts "debug"
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

// ============================================================================
// TYPES
// ============================================================================

interface Detection {
  brand: string;
  confidence: number;
  boundingPoly: { vertices: Array<{ x: number; y: number }> };
}

interface VisionAPIDetection {
  logos: Detection[];
  texts: Array<{
    text: string;
    boundingPoly: { vertices: Array<{ x: number; y: number }> };
  }>;
}

interface ProcessResult {
  filename: string;
  success: boolean;
  originalDetections: {
    logoCount: number;
    textCount: number;
    total: number;
  };
  editedDetections: {
    logoCount: number;
    textCount: number;
    total: number;
    logos: Detection[];
    texts: string[];
  };
  cleanPercentage: number;
  processingTime: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function imageToDataUrl(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath).png().toBuffer();
  const base64 = buffer.toString('base64');
  return `data:image/png;base64,${base64}`;
}

async function editImageWithQwen(imageDataUrl: string, prompt: string): Promise<string> {
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
        input: { image: imageDataUrl, prompt }
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Qwen API error: ${response.status}`);
  }

  let result = await response.json();
  let attempts = 0;

  while ((result.status === 'processing' || result.status === 'starting') && attempts < 60) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pollResponse = await fetch(`${REPLICATE_API_URL}/predictions/${result.id}`, {
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    result = await pollResponse.json();
  }

  if (result.status !== 'succeeded' || !result.output || !result.output[0]) {
    throw new Error('Qwen failed');
  }

  return result.output[0];
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

async function downloadImage(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await sharp(buffer).png().toFile(outputPath);
}

async function createComparison(original: string, edited: string, output: string): Promise<void> {
  const [originalMeta, editedMeta] = await Promise.all([
    sharp(original).metadata(),
    sharp(edited).metadata()
  ]);

  const width = Math.max(originalMeta.width || 0, editedMeta.width || 0);
  const height = Math.max(originalMeta.height || 0, editedMeta.height || 0);

  const [originalBuffer, editedBuffer] = await Promise.all([
    sharp(original).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer(),
    sharp(edited).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer()
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
  .toFile(output);
}

async function createVisionDebugImage(imagePath: string, detection: VisionAPIDetection, outputPath: string): Promise<void> {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  const allRegions = [
    ...detection.logos.map(l => ({ ...l, type: 'logo' as const })),
    ...detection.texts.map(t => ({ ...t, type: 'text' as const, brand: t.text, confidence: 100 }))
  ];

  if (allRegions.length === 0) {
    await fs.promises.copyFile(imagePath, outputPath);
    return;
  }

  const boxes = allRegions.map(region => {
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

  const svgOverlay = Buffer.from(`<svg width="${width}" height="${height}">${boxes}</svg>`);

  await sharp(imageBuffer)
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png()
    .toFile(outputPath);
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processImage(imagePath: string, outputDirs: any): Promise<ProcessResult> {
  const startTime = Date.now();
  const filename = path.basename(imagePath);
  const nameWithoutExt = path.basename(imagePath, path.extname(imagePath));

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📸 Processing: ${filename}`);
  console.log('='.repeat(80));

  try {
    // Step 1: Analyze original
    console.log('   [1/5] Analyzing original...');
    const originalDetections = await analyzeWithVisionAPI(imagePath);
    const originalTotal = originalDetections.logos.length + originalDetections.texts.length;
    console.log(`         ├─ Logos: ${originalDetections.logos.length}`);
    console.log(`         └─ Texts: ${originalDetections.texts.length}`);

    // Step 2: Edit with Qwen
    console.log('   [2/5] Editing with Qwen...');
    const imageDataUrl = await imageToDataUrl(imagePath);
    const editedUrl = await editImageWithQwen(
      imageDataUrl,
      'Remove all Nike logos, swooshes, and brand text from this product. Keep the shoe intact but completely remove branding.'
    );

    const editedPath = path.join(outputDirs.edited, `${nameWithoutExt}_edited.png`);
    await downloadImage(editedUrl, editedPath);
    console.log(`         └─ Saved to edited/`);

    // Step 3: Analyze edited
    console.log('   [3/5] Analyzing edited...');
    const editedDetections = await analyzeWithVisionAPI(editedPath);
    const editedTotal = editedDetections.logos.length + editedDetections.texts.length;
    console.log(`         ├─ Logos: ${editedDetections.logos.length}`);
    console.log(`         └─ Texts: ${editedDetections.texts.length}`);

    // Step 4: Create comparison
    console.log('   [4/5] Creating comparison...');
    const comparisonPath = path.join(outputDirs.edited, `${nameWithoutExt}_comparison.png`);
    await createComparison(imagePath, editedPath, comparisonPath);
    console.log(`         └─ Saved to edited/`);

    // Step 5: Create vision debug
    console.log('   [5/5] Creating Vision AI analysis...');
    const visionDebugPath = path.join(outputDirs.vision, `${nameWithoutExt}_vision_analysis.png`);
    await createVisionDebugImage(editedPath, editedDetections, visionDebugPath);
    console.log(`         └─ Saved to vision_analysis/`);

    const cleanPercentage = originalTotal > 0 ? Math.round(((originalTotal - editedTotal) / originalTotal) * 100) : 100;
    const success = editedTotal === 0;
    const processingTime = Date.now() - startTime;

    const status = success ? '✅ CLEAN' : '⚠️ DETECTIONS REMAIN';
    console.log(`\n   Result: ${status} (${cleanPercentage}% clean) - ${Math.round(processingTime / 1000)}s`);

    return {
      filename,
      success,
      originalDetections: {
        logoCount: originalDetections.logos.length,
        textCount: originalDetections.texts.length,
        total: originalTotal
      },
      editedDetections: {
        logoCount: editedDetections.logos.length,
        textCount: editedDetections.texts.length,
        total: editedTotal,
        logos: editedDetections.logos,
        texts: editedDetections.texts.map(t => t.text)
      },
      cleanPercentage,
      processingTime
    };
  } catch (error) {
    console.error(`   ❌ ERROR: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(results: ProcessResult[]): string {
  const totalImages = results.length;
  const successCount = results.filter(r => r.success).length;
  const successRate = Math.round((successCount / totalImages) * 100);

  const totalOriginalDetections = results.reduce((sum, r) => sum + r.originalDetections.total, 0);
  const totalEditedDetections = results.reduce((sum, r) => sum + r.editedDetections.total, 0);
  const totalRemoved = totalOriginalDetections - totalEditedDetections;
  const removalRate = totalOriginalDetections > 0 ? Math.round((totalRemoved / totalOriginalDetections) * 100) : 100;

  const avgCleanPercentage = Math.round(results.reduce((sum, r) => sum + r.cleanPercentage, 0) / totalImages);
  const avgProcessingTime = Math.round(results.reduce((sum, r) => sum + r.processingTime, 0) / totalImages / 1000);

  let report = `
${'═'.repeat(80)}
📊 BATCH PROCESSING REPORT
${'═'.repeat(80)}

📈 OVERALL METRICS
─────────────────────────────────────────────────────────────────────────────
Total Images Processed:        ${totalImages}
Completely Clean (100%):       ${successCount} (${successRate}%)
Partial Detections Remain:     ${totalImages - successCount} (${100 - successRate}%)

Average Clean Percentage:      ${avgCleanPercentage}%
Average Processing Time:       ${avgProcessingTime}s per image

📊 DETECTION STATISTICS
─────────────────────────────────────────────────────────────────────────────
Total Detections (Before):     ${totalOriginalDetections}
Total Detections (After):      ${totalEditedDetections}
Total Elements Removed:        ${totalRemoved}
Removal Rate:                  ${removalRate}%

📋 DETAILED RESULTS
─────────────────────────────────────────────────────────────────────────────
`;

  // Sort by success status and clean percentage
  const sortedResults = [...results].sort((a, b) => {
    if (a.success !== b.success) return a.success ? -1 : 1;
    return b.cleanPercentage - a.cleanPercentage;
  });

  sortedResults.forEach((result, idx) => {
    const statusIcon = result.success ? '✅' : '⚠️';
    const status = result.success ? 'CLEAN' : 'PARTIAL';

    report += `\n[${idx + 1}] ${statusIcon} ${result.filename}\n`;
    report += `    Status: ${status} (${result.cleanPercentage}% clean)\n`;
    report += `    Before: ${result.originalDetections.logoCount} logos, ${result.originalDetections.textCount} texts (${result.originalDetections.total} total)\n`;
    report += `    After:  ${result.editedDetections.logoCount} logos, ${result.editedDetections.textCount} texts (${result.editedDetections.total} total)\n`;

    if (!result.success) {
      if (result.editedDetections.logos.length > 0) {
        report += `    Remaining Logos: ${result.editedDetections.logos.map(l => `${l.brand} (${l.confidence}%)`).join(', ')}\n`;
      }
      if (result.editedDetections.texts.length > 0) {
        report += `    Remaining Texts: ${result.editedDetections.texts.map(t => `"${t}"`).join(', ')}\n`;
      }
    }
    report += `    Time: ${Math.round(result.processingTime / 1000)}s\n`;
  });

  report += `\n${'═'.repeat(80)}
✅ CONCLUSION
─────────────────────────────────────────────────────────────────────────────
`;

  if (successRate === 100) {
    report += `🎉 PERFECT! All images are 100% clean!\n`;
  } else if (successRate >= 80) {
    report += `✅ EXCELLENT! ${successRate}% success rate with ${avgCleanPercentage}% average cleanliness.\n`;
  } else if (successRate >= 50) {
    report += `👍 GOOD! ${successRate}% success rate. Some images need additional processing.\n`;
  } else {
    report += `⚠️  NEEDS IMPROVEMENT. ${successRate}% success rate. Consider using preventive masks.\n`;
  }

  report += `\nQwen Edit Image Performance: ${removalRate}% of brand elements successfully removed.\n`;
  report += `${'═'.repeat(80)}\n`;

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🚀 BATCH PIPELINE TEST - Multiple Images Processing\n');

  const inputFolder = process.argv[2] || 'debug';
  const inputPath = path.isAbsolute(inputFolder)
    ? inputFolder
    : path.join(process.cwd(), inputFolder);

  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Folder not found: ${inputPath}`);
    process.exit(1);
  }

  // Find all image files (excluding already processed ones)
  const allFiles = fs.readdirSync(inputPath);
  const imageFiles = allFiles.filter(f =>
    /\.(jpg|jpeg|png)$/i.test(f) &&
    !f.includes('_edited') &&
    !f.includes('_comparison') &&
    !f.includes('_vision') &&
    !f.includes('_analyzed')
  );

  if (imageFiles.length === 0) {
    console.error(`❌ No images found in: ${inputPath}`);
    process.exit(1);
  }

  console.log(`📂 Input folder: ${inputPath}`);
  console.log(`📸 Found ${imageFiles.length} images to process\n`);

  // Create output directories
  const comparisonBase = path.join(process.cwd(), 'debug', 'comparison');
  const outputDirs = {
    edited: path.join(comparisonBase, 'edited'),
    vision: path.join(comparisonBase, 'vision_analysis')
  };

  for (const dir of Object.values(outputDirs)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  console.log(`📁 Output folders created:`);
  console.log(`   ├─ ${outputDirs.edited}`);
  console.log(`   └─ ${outputDirs.vision}`);

  // Process all images
  const results: ProcessResult[] = [];
  let successCount = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const imageFile = imageFiles[i];
    const imagePath = path.join(inputPath, imageFile);

    try {
      const result = await processImage(imagePath, outputDirs);
      results.push(result);
      if (result.success) successCount++;
    } catch (error) {
      console.error(`Failed to process ${imageFile}`);
      // Continue with next image
    }

    // Progress
    console.log(`\n📊 Progress: ${i + 1}/${imageFiles.length} (${successCount} clean)\n`);
  }

  // Generate and save report
  const report = generateReport(results);
  const reportPath = path.join(comparisonBase, 'BATCH_REPORT.txt');
  fs.writeFileSync(reportPath, report);

  console.log(report);
  console.log(`\n💾 Report saved to: ${reportPath}`);
  console.log(`\n✅ Batch processing complete!\n`);

  process.exit(results.every(r => r.success) ? 0 : 1);
}

main();
