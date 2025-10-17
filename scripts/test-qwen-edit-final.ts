/**
 * Test Qwen Image Edit API in isolation
 *
 * Reads image from debug/ folder, sends to Qwen API, saves edited result
 *
 * Usage:
 *   pnpm tsx scripts/test-qwen-edit-final.ts <image-path>
 *
 * Example:
 *   pnpm tsx scripts/test-qwen-edit-final.ts "debug/26193-Nike-Dunk-High-Light-Chocolate.jpg"
 */

import { config } from 'dotenv';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Load environment
config({ path: path.join(process.cwd(), '.env.local') });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const REPLICATE_API_URL = 'https://api.replicate.com/v1';

if (!REPLICATE_API_TOKEN) {
  console.error('❌ REPLICATE_API_TOKEN not found in .env.local');
  process.exit(1);
}

/**
 * Convert local image file to base64 data URL
 */
async function imageToDataUrl(imagePath: string): Promise<string> {
  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(process.cwd(), imagePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Image not found: ${absolutePath}`);
  }

  console.log('📂 Reading image from:', absolutePath);

  // Read and convert to PNG (normalize format)
  const buffer = await sharp(absolutePath)
    .png()
    .toBuffer();

  const base64 = buffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  console.log(`✅ Image converted to data URL (${Math.round(base64.length / 1024)} KB)\n`);

  return dataUrl;
}

/**
 * Call Qwen API to edit image
 */
async function editImageWithQwen(
  imageDataUrl: string,
  prompt: string
): Promise<string> {
  console.log('🚀 Sending request to Qwen API...');
  console.log('📝 Prompt:', prompt);
  console.log('');

  const response = await fetch(
    `${REPLICATE_API_URL}/models/qwen/qwen-image-edit/predictions`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60' // Wait up to 60s for result
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

  console.log('📊 Initial API Response:');
  console.log('   Status:', initialResult.status);
  console.log('   ID:', initialResult.id);
  console.log('');

  // If still processing, poll for result
  let result = initialResult;
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max

  while (result.status === 'processing' || result.status === 'starting') {
    if (attempts >= maxAttempts) {
      throw new Error('Timeout: Processing took too long');
    }

    attempts++;
    console.log(`⏳ Processing... (${attempts}s)`);

    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second

    // Poll for status
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

  console.log('');
  console.log('✅ Processing complete!');
  console.log('   Final status:', result.status);
  console.log('');

  if (result.error) {
    throw new Error(`Qwen processing error: ${result.error}`);
  }

  if (result.status !== 'succeeded') {
    throw new Error(`Unexpected final status: ${result.status}`);
  }

  if (!result.output || !result.output[0]) {
    throw new Error('No output image returned');
  }

  const outputUrl = result.output[0];
  console.log('   Output URL:', outputUrl);
  console.log('');

  return outputUrl;
}

/**
 * Download edited image and save to debug folder
 */
async function saveEditedImage(
  imageUrl: string,
  originalPath: string
): Promise<string> {
  console.log('⬇️ Downloading edited image...');

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Create output filename
  const originalName = path.basename(originalPath, path.extname(originalPath));
  const outputPath = path.join(
    process.cwd(),
    'debug',
    'qwen',
    `${originalName}_edited_by_qwen.png`
  );

  // Ensure qwen folder exists
  const qwenDir = path.join(process.cwd(), 'debug', 'qwen');
  if (!fs.existsSync(qwenDir)) {
    fs.mkdirSync(qwenDir, { recursive: true });
  }

  // Save image
  await sharp(buffer)
    .png()
    .toFile(outputPath);

  console.log('✅ Edited image saved to:', outputPath);
  console.log('');

  return outputPath;
}

/**
 * Create before/after comparison image
 */
async function createComparison(
  originalPath: string,
  editedPath: string
): Promise<string> {
  console.log('🎨 Creating before/after comparison...');

  const absoluteOriginal = path.isAbsolute(originalPath)
    ? originalPath
    : path.join(process.cwd(), originalPath);

  // Load images
  const [originalMeta, editedMeta] = await Promise.all([
    sharp(absoluteOriginal).metadata(),
    sharp(editedPath).metadata()
  ]);

  const width = Math.max(originalMeta.width || 0, editedMeta.width || 0);
  const height = Math.max(originalMeta.height || 0, editedMeta.height || 0);

  // Resize both to same dimensions
  const [originalBuffer, editedBuffer] = await Promise.all([
    sharp(absoluteOriginal).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer(),
    sharp(editedPath).resize(width, height, { fit: 'contain', background: '#ffffff' }).toBuffer()
  ]);

  // Create side-by-side comparison
  const comparisonPath = editedPath.replace('.png', '_comparison.png');

  await sharp({
    create: {
      width: width * 2 + 20, // 20px gap
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
  .toFile(comparisonPath);

  console.log('✅ Comparison saved to:', comparisonPath);
  console.log('');

  return comparisonPath;
}

/**
 * Main function
 */
async function main() {
  console.log('🧪 TEST QWEN IMAGE EDIT - Isolated Test\n');

  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ Error: Image path not provided\n');
    console.log('Usage:');
    console.log('  pnpm tsx scripts/test-qwen-edit-final.ts <image-path>\n');
    console.log('Example:');
    console.log('  pnpm tsx scripts/test-qwen-edit-final.ts "debug/26193-Nike-Dunk-High-Light-Chocolate.jpg"');
    console.log('');
    process.exit(1);
  }

  try {
    console.log('📸 Testing image:', imagePath);
    console.log('');

    // Convert to data URL
    const imageDataUrl = await imageToDataUrl(imagePath);

    // Edit with Qwen
    const editedUrl = await editImageWithQwen(
      imageDataUrl,
      'Remove all Nike logos, swooshes, and brand text from this product. Keep the shoe intact but completely remove branding.'
    );

    // Save edited image
    const editedPath = await saveEditedImage(editedUrl, imagePath);

    // Create comparison
    await createComparison(imagePath, editedPath);

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('✅ TEST COMPLETED SUCCESSFULLY!');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('');
    console.log('📁 Check the results in:', path.join('debug', 'qwen', '/'));
    console.log('');

  } catch (error) {
    console.error('\n❌ ERROR:');
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
