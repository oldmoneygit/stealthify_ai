import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';

interface ProductWithTitle {
  product_id: string;
  sku: string;
  original_name: string;
  camouflaged_title: string | null;
  is_saved_in_db: boolean;
  price: number;
  original_image: string | null;
  edited_image: string | null;
  directory: string | null;
  analysis_id: number | null;
}

/**
 * Carrega todos os produtos com títulos salvos do banco de dados
 * Combina dados de produtos sincronizados com análises salvas
 */
export async function GET() {
  try {
    console.log('📦 [Products With Titles] Loading products...');

    // 1. Get all products from database with their latest analysis
    const productsFromDB = db.prepare(`
      SELECT
        p.id as db_id,
        p.sku,
        p.name as original_name,
        p.price,
        p.image_url,
        a.id as analysis_id,
        a.camouflaged_title,
        a.analyzed_at
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          id,
          camouflaged_title,
          analyzed_at,
          ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY analyzed_at DESC) as rn
        FROM analyses
      ) a ON p.id = a.product_id AND a.rn = 1
      ORDER BY p.id DESC
    `).all() as Array<{
      db_id: number;
      sku: string;
      original_name: string;
      price: number;
      image_url: string;
      analysis_id: number | null;
      camouflaged_title: string | null;
      analyzed_at: string | null;
    }>;

    console.log(`📊 Found ${productsFromDB.length} products in database`);

    // 2. Get synced images from filesystem
    const originalsDir = path.join(process.cwd(), 'debug', 'Originais');
    const qwenDir = path.join(process.cwd(), 'debug', 'qwen');

    const syncedImagesMap = new Map<string, { original: string | null; edited: string | null; directory: string | null }>();

    // Map original images
    if (fs.existsSync(originalsDir)) {
      const originalFiles = fs.readdirSync(originalsDir)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

      originalFiles.forEach(filename => {
        const match = filename.match(/^(\d{5})-/);
        if (match) {
          const productId = match[1];
          syncedImagesMap.set(productId, {
            original: `/api/original-images/${filename}`,
            edited: null,
            directory: null
          });
        }
      });
    }

    // Map edited images
    if (fs.existsSync(qwenDir)) {
      const subdirs = fs.readdirSync(qwenDir)
        .filter(f => fs.statSync(path.join(qwenDir, f)).isDirectory());

      for (const subdir of subdirs) {
        const subdirPath = path.join(qwenDir, subdir);
        const files = fs.readdirSync(subdirPath)
          .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
          .filter(f => !f.includes('-old-backup'));

        files.forEach(filename => {
          const match = filename.match(/^(\d{5})-/);
          if (match) {
            const productId = match[1];
            const existing = syncedImagesMap.get(productId) || { original: null, edited: null, directory: null };

            // Get file modification time for cache busting
            const filePath = path.join(subdirPath, filename);
            const stats = fs.statSync(filePath);
            const timestamp = stats.mtimeMs;

            existing.edited = `/api/blur-images/${subdir}/${filename}?t=${timestamp}`;
            existing.directory = subdir;
            syncedImagesMap.set(productId, existing);
          }
        });
      }
    }

    console.log(`📂 Found ${syncedImagesMap.size} products with synced images`);

    // 3. Combine database products with synced images
    const combinedProducts: ProductWithTitle[] = [];

    // Add products from database
    productsFromDB.forEach(dbProduct => {
      // Try to extract product_id from SKU or use db_id
      const productId = dbProduct.sku.match(/\d{5}/)?.[0] || dbProduct.db_id.toString();
      const syncedImages = syncedImagesMap.get(productId);

      combinedProducts.push({
        product_id: productId,
        sku: dbProduct.sku,
        original_name: dbProduct.original_name,
        camouflaged_title: dbProduct.camouflaged_title,
        is_saved_in_db: !!dbProduct.camouflaged_title,
        price: dbProduct.price,
        original_image: syncedImages?.original || null,
        edited_image: syncedImages?.edited || null,
        directory: syncedImages?.directory || null,
        analysis_id: dbProduct.analysis_id
      });
    });

    // Add products that are only in filesystem (not in DB yet)
    syncedImagesMap.forEach((images, productId) => {
      const alreadyAdded = combinedProducts.some(p => p.product_id === productId);
      if (!alreadyAdded) {
        // Extract name from original image filename
        const originalName = images.original
          ? images.original.split('/').pop()?.split('.')[0]?.replace(/^\d{5}-/, '').replace(/-/g, ' ') || ''
          : '';

        combinedProducts.push({
          product_id: productId,
          sku: productId,
          original_name: originalName,
          camouflaged_title: null,
          is_saved_in_db: false,
          price: 0,
          original_image: images.original,
          edited_image: images.edited,
          directory: images.directory,
          analysis_id: null
        });
      }
    });

    // Sort by product_id
    combinedProducts.sort((a, b) => a.product_id.localeCompare(b.product_id));

    const savedCount = combinedProducts.filter(p => p.is_saved_in_db).length;
    const notSavedCount = combinedProducts.length - savedCount;

    console.log('✅ [Products With Titles] Summary:');
    console.log(`   Total: ${combinedProducts.length}`);
    console.log(`   With saved titles: ${savedCount}`);
    console.log(`   Without titles: ${notSavedCount}`);

    return NextResponse.json({
      success: true,
      total: combinedProducts.length,
      saved_count: savedCount,
      not_saved_count: notSavedCount,
      products: combinedProducts
    });

  } catch (error: any) {
    console.error('❌ [Products With Titles] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to load products'
    }, { status: 500 });
  }
}
