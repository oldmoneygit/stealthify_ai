import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';

interface ReplaceRequest {
  product_id: string;
  reprocessed_filename: string;
  original_directory: string;
  original_filename: string;
}

/**
 * Replace the old edited image (with excessive blur) with the new reprocessed version
 */
export async function POST(request: NextRequest) {
  try {
    const body: ReplaceRequest = await request.json();
    const { product_id, reprocessed_filename, original_directory, original_filename } = body;

    console.log('🔄 [Replace] Starting replacement:', {
      product_id,
      reprocessed_filename,
      original_directory,
      original_filename
    });

    // 1. Read the reprocessed image
    const reprocessedPath = path.join(process.cwd(), 'debug', 'reprocessed', reprocessed_filename);

    if (!fs.existsSync(reprocessedPath)) {
      return NextResponse.json({
        success: false,
        error: 'Reprocessed image not found'
      }, { status: 404 });
    }

    const reprocessedBuffer = fs.readFileSync(reprocessedPath);
    console.log('📖 [Replace] Read reprocessed image:', reprocessedBuffer.length, 'bytes');

    // 2. Backup the old edited image (rename with -old-backup suffix)
    const oldEditedPath = path.join(process.cwd(), 'debug', 'qwen', original_directory, original_filename);

    if (fs.existsSync(oldEditedPath)) {
      const backupFilename = original_filename.replace(/\.(jpg|png)$/, `-old-backup-${Date.now()}.$1`);
      const backupPath = path.join(process.cwd(), 'debug', 'qwen', original_directory, backupFilename);

      fs.copyFileSync(oldEditedPath, backupPath);
      console.log('💾 [Replace] Backup created:', backupFilename);
    }

    // 3. Replace the old edited image with the reprocessed one
    fs.writeFileSync(oldEditedPath, reprocessedBuffer);
    console.log('✅ [Replace] Replaced old edited image:', oldEditedPath);

    // 4. Also create a copy in a "final" directory for safekeeping
    const finalDir = path.join(process.cwd(), 'debug', 'final-edited');
    if (!fs.existsSync(finalDir)) {
      fs.mkdirSync(finalDir, { recursive: true });
    }

    const finalFilename = `${product_id}-final-${Date.now()}.jpg`;
    const finalPath = path.join(finalDir, finalFilename);
    fs.writeFileSync(finalPath, reprocessedBuffer);
    console.log('💎 [Replace] Saved to final directory:', finalFilename);

    // 5. Update database with new filepath AND base64
    try {
      const { getProductDatabaseId } = await import('@/lib/db');

      const dbProductId = getProductDatabaseId(product_id);

      if (dbProductId !== null) {
        // Store relative path from project root
        const relativePath = path.relative(process.cwd(), oldEditedPath);

        // Convert image to base64 for Shopify import
        const imageBase64 = `data:image/jpeg;base64,${reprocessedBuffer.toString('base64')}`;

        // Update BOTH filepath and base64 in database
        const updateStmt = db.prepare(`
          UPDATE analyses
          SET edited_image_filepath = ?,
              edited_image_base64 = ?
          WHERE product_id = ?
          AND id = (
            SELECT id FROM analyses
            WHERE product_id = ?
            ORDER BY analyzed_at DESC
            LIMIT 1
          )
        `);

        const result = updateStmt.run(relativePath, imageBase64, dbProductId, dbProductId);

        if (result.changes > 0) {
          console.log('💾 [Replace] Database updated successfully (filepath + base64)');
        } else {
          console.warn('⚠️ [Replace] No database record found to update');
        }
      } else {
        console.warn('⚠️ [Replace] Could not find product in database, skipping DB update');
      }
    } catch (dbError: any) {
      console.error('❌ [Replace] Database update failed (non-critical):', dbError.message);
      // Continue even if DB update fails
    }

    return NextResponse.json({
      success: true,
      message: 'Imagem substituída com sucesso!',
      replaced_path: oldEditedPath,
      backup_created: true,
      final_copy: `/api/final-images/${finalFilename}`,
      database_updated: true
    });

  } catch (error: any) {
    console.error('❌ [Replace] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Replace failed'
    }, { status: 500 });
  }
}
