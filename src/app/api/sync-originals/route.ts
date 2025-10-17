import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface SyncResult {
  product_id: string;
  original_image: string | null;
  edited_image: string | null;
  edited_filepath: string | null;
  directory: string | null;
}

/**
 * Sync original images with edited images by matching product IDs
 *
 * Matches format: XXXXX-Product-Name.jpg
 * Where XXXXX is the 5-digit product ID
 */
export async function GET() {
  try {
    console.log('🔄 [Sync Originals] Starting synchronization...');

    const originalsDir = path.join(process.cwd(), 'debug', 'Originais');
    const qwenDir = path.join(process.cwd(), 'debug', 'qwen');

    // 1. Read all original images
    if (!fs.existsSync(originalsDir)) {
      return NextResponse.json({
        success: false,
        error: 'Originals directory not found'
      }, { status: 404 });
    }

    const originalFiles = fs.readdirSync(originalsDir)
      .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

    console.log(`📂 [Sync Originals] Found ${originalFiles.length} original images`);

    // 2. Extract product IDs from original filenames
    const productsMap = new Map<string, SyncResult>();

    originalFiles.forEach(filename => {
      // Extract product ID (first 5 digits)
      const match = filename.match(/^(\d{5})-/);
      if (match) {
        const productId = match[1];
        productsMap.set(productId, {
          product_id: productId,
          original_image: `/api/original-images/${filename}`,
          edited_image: null,
          edited_filepath: null,
          directory: null
        });
      }
    });

    console.log(`🔢 [Sync Originals] Extracted ${productsMap.size} unique product IDs`);

    // 3. Find matching edited images in qwen subdirectories
    if (fs.existsSync(qwenDir)) {
      const subdirs = fs.readdirSync(qwenDir)
        .filter(f => fs.statSync(path.join(qwenDir, f)).isDirectory());

      console.log(`📁 [Sync Originals] Scanning ${subdirs.length} qwen subdirectories...`);

      for (const subdir of subdirs) {
        const subdirPath = path.join(qwenDir, subdir);
        const files = fs.readdirSync(subdirPath)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
          .filter(f => !f.includes('-reprocessed')); // Skip reprocessed versions

        files.forEach(filename => {
          // Extract product ID from edited filename
          const match = filename.match(/^(\d{5})-/);
          if (match) {
            const productId = match[1];
            const existing = productsMap.get(productId);

            if (existing) {
              // Get file modification time for cache busting
              const filePath = path.join(subdirPath, filename);
              const stats = fs.statSync(filePath);
              const timestamp = stats.mtimeMs;

              // Update with edited image info + cache buster
              existing.edited_image = `/api/blur-images/${subdir}/${filename}?t=${timestamp}`;
              existing.edited_filepath = path.join('debug', 'qwen', subdir, filename);
              existing.directory = subdir;

              console.log(`✅ [Sync] Matched ${productId}: Original + Edited (${subdir}) [mtime: ${timestamp}]`);
            }
          }
        });
      }
    }

    // 4. Convert to array and sort by product ID
    const results = Array.from(productsMap.values())
      .sort((a, b) => a.product_id.localeCompare(b.product_id));

    const withBothImages = results.filter(r => r.original_image && r.edited_image).length;
    const onlyOriginal = results.filter(r => r.original_image && !r.edited_image).length;

    console.log('📊 [Sync Originals] Summary:', {
      total: results.length,
      with_both: withBothImages,
      only_original: onlyOriginal
    });

    return NextResponse.json({
      success: true,
      total: results.length,
      with_both_images: withBothImages,
      only_original: onlyOriginal,
      products: results
    });

  } catch (error: any) {
    console.error('❌ [Sync Originals] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed'
    }, { status: 500 });
  }
}
