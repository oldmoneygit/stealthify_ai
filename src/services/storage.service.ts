import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';
import type { Product, AnalysisResult } from '@/lib/types';

/**
 * Get ALL products with analyses (clean + blur_applied)
 * Only returns the LATEST analysis for each product (no duplicates)
 */
export function getAllAnalyzedProducts(): Array<{
  product: Product;
  analysis: AnalysisResult;
  localImagePath: string | null;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.original_title,
      a.camouflaged_title,
      a.edited_image_base64,
      a.edited_image_filepath,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    INNER JOIN (
      SELECT product_id, MAX(analyzed_at) as max_analyzed_at
      FROM analyses
      WHERE status IN ('clean', 'blur_applied')
      GROUP BY product_id
    ) latest ON a.product_id = latest.product_id AND a.analyzed_at = latest.max_analyzed_at
    WHERE a.status IN ('clean', 'blur_applied')
    ORDER BY a.analyzed_at DESC
  `);

  const rows = stmt.all() as any[];

  console.log(`📊 getAllAnalyzedProducts: Found ${rows.length} analyzed products`);

  return rows.map(row => {
    const result = {
      product: {
        id: row.id,
        woo_product_id: row.woo_product_id,
        sku: row.sku,
        name: row.name,
        price: row.price,
        image_url: row.image_url
      },
      analysis: {
        title: row.camouflaged_title,
        image: row.edited_image_base64 || row.image_url, // Fallback to original if no edited
        brands_detected: JSON.parse(row.brands_detected || '[]'),
        risk_score: row.risk_score,
        status: row.status
      },
      localImagePath: row.edited_image_filepath,
      analyzedAt: row.analyzed_at
    };

    // Debug first few
    if (rows.indexOf(row) < 3) {
      console.log(`  Product ${row.sku}:`, {
        hasEditedImage: !!row.edited_image_base64,
        imageLength: row.edited_image_base64?.length || 0,
        status: row.status
      });
    }

    return result;
  });
}

/**
 * Get products with successful analyses (clean status)
 * Only returns the LATEST analysis for each product (no duplicates)
 */
export function getCleanProducts(): Array<{
  product: Product;
  analysis: AnalysisResult;
  localImagePath: string | null;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.original_title,
      a.camouflaged_title,
      a.edited_image_base64,
      a.edited_image_filepath,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    INNER JOIN (
      SELECT product_id, MAX(analyzed_at) as max_analyzed_at
      FROM analyses
      WHERE status = 'clean'
      GROUP BY product_id
    ) latest ON a.product_id = latest.product_id AND a.analyzed_at = latest.max_analyzed_at
    WHERE a.status = 'clean'
    ORDER BY a.analyzed_at DESC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => ({
    product: {
      id: row.id,
      woo_product_id: row.woo_product_id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      image_url: row.image_url
    },
    analysis: {
      title: row.camouflaged_title,
      image: row.edited_image_base64 || row.image_url, // Fallback to original if no edited
      brands_detected: JSON.parse(row.brands_detected || '[]'),
      risk_score: row.risk_score,
      status: row.status
    },
    localImagePath: row.edited_image_filepath,
    analyzedAt: row.analyzed_at
  }));
}

/**
 * Get products that failed analysis
 */
export function getFailedProducts(): Array<{
  product: Product;
  error: string;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.analyzed_at
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.status = 'failed'
    ORDER BY a.analyzed_at DESC
  `);

  const rows = stmt.all() as any[];

  return rows.map(row => ({
    product: {
      id: row.id,
      woo_product_id: row.woo_product_id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      image_url: row.image_url
    },
    error: 'Analysis failed',
    analyzedAt: row.analyzed_at
  }));
}

/**
 * Get products by brand detected
 */
export function getProductsByBrand(brandName: string): Array<{
  product: Product;
  analysis: AnalysisResult;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.camouflaged_title,
      a.edited_image_base64,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    WHERE a.brands_detected LIKE ?
    ORDER BY a.analyzed_at DESC
  `);

  const rows = stmt.all(`%"${brandName}"%`) as any[];

  return rows.map(row => ({
    product: {
      id: row.id,
      woo_product_id: row.woo_product_id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      image_url: row.image_url
    },
    analysis: {
      title: row.camouflaged_title,
      image: row.edited_image_base64,
      brands_detected: JSON.parse(row.brands_detected),
      risk_score: row.risk_score,
      status: row.status
    },
    analyzedAt: row.analyzed_at
  }));
}

/**
 * Get statistics about stored analyses
 */
export function getAnalysisStats(): {
  total: number;
  clean: number;
  blurApplied: number;
  failed: number;
  avgRiskScore: number;
  topBrands: Array<{ brand: string; count: number }>;
} {
  // Total counts by status
  const statusStmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM analyses
    GROUP BY status
  `);

  const statusRows = statusStmt.all() as Array<{ status: string; count: number }>;

  const stats = {
    total: 0,
    clean: 0,
    blurApplied: 0,
    failed: 0
  };

  for (const row of statusRows) {
    stats.total += row.count;
    if (row.status === 'clean') stats.clean = row.count;
    else if (row.status === 'blur_applied') stats.blurApplied = row.count;
    else if (row.status === 'failed') stats.failed = row.count;
  }

  // Average risk score (excluding failed)
  const avgStmt = db.prepare(`
    SELECT AVG(risk_score) as avg
    FROM analyses
    WHERE status != 'failed'
  `);

  const avgRow = avgStmt.get() as { avg: number | null };
  const avgRiskScore = avgRow.avg ? Math.round(avgRow.avg) : 0;

  // Top brands detected
  const brandsStmt = db.prepare(`
    SELECT brands_detected
    FROM analyses
    WHERE status != 'failed'
  `);

  const brandsRows = brandsStmt.all() as Array<{ brands_detected: string }>;

  const brandCounts = new Map<string, number>();

  for (const row of brandsRows) {
    const brands: string[] = JSON.parse(row.brands_detected);
    for (const brand of brands) {
      brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    }
  }

  const topBrands = Array.from(brandCounts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    ...stats,
    avgRiskScore,
    topBrands
  };
}

/**
 * Export all clean products to JSON file
 */
export function exportCleanProductsToJSON(outputPath?: string): string {
  const products = getCleanProducts();

  const exportData = products.map(item => ({
    sku: item.product.sku,
    original_name: item.product.name,
    camouflaged_name: item.analysis.title,
    original_price: item.product.price,
    brands_removed: item.analysis.brands_detected,
    risk_score: item.analysis.risk_score,
    local_image_path: item.localImagePath,
    analyzed_at: item.analyzedAt
  }));

  const filename = outputPath || path.join(
    process.cwd(),
    'output',
    `clean-products-${Date.now()}.json`
  );

  // Ensure output directory exists
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));

  console.log(`✅ ${products.length} produtos exportados para: ${filename}`);

  return filename;
}

/**
 * Export products ready for Shopify import (CSV format)
 */
export function exportForShopify(outputPath?: string): string {
  const products = getCleanProducts();

  // CSV header
  const csv: string[] = [
    'SKU,Title,Price,Image Path,Brands Removed,Risk Score'
  ];

  // CSV rows
  for (const item of products) {
    const row = [
      item.product.sku,
      `"${item.analysis.title.replace(/"/g, '""')}"`, // Escape quotes
      item.product.price,
      item.localImagePath || '',
      `"${item.analysis.brands_detected.join(', ')}"`,
      item.analysis.risk_score
    ].join(',');

    csv.push(row);
  }

  const filename = outputPath || path.join(
    process.cwd(),
    'output',
    `shopify-import-${Date.now()}.csv`
  );

  // Ensure output directory exists
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filename, csv.join('\n'));

  console.log(`✅ ${products.length} produtos exportados para Shopify: ${filename}`);

  return filename;
}

/**
 * Search products by SKU or name
 */
export function searchProducts(query: string): Array<{
  product: Product;
  analysis: AnalysisResult | null;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.camouflaged_title,
      a.edited_image_base64,
      a.brands_detected,
      a.risk_score,
      a.status
    FROM products p
    LEFT JOIN analyses a ON p.id = a.product_id
    WHERE p.sku LIKE ? OR p.name LIKE ?
    ORDER BY p.id DESC
  `);

  const searchTerm = `%${query}%`;
  const rows = stmt.all(searchTerm, searchTerm) as any[];

  return rows.map(row => ({
    product: {
      id: row.id,
      woo_product_id: row.woo_product_id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      image_url: row.image_url
    },
    analysis: row.status ? {
      title: row.camouflaged_title,
      image: row.edited_image_base64,
      brands_detected: JSON.parse(row.brands_detected || '[]'),
      risk_score: row.risk_score,
      status: row.status
    } : null
  }));
}

/**
 * Get recent analyses (last N)
 */
export function getRecentAnalyses(limit: number = 20): Array<{
  product: Product;
  analysis: AnalysisResult;
  analyzedAt: string;
}> {
  const stmt = db.prepare(`
    SELECT
      p.*,
      a.camouflaged_title,
      a.edited_image_base64,
      a.brands_detected,
      a.risk_score,
      a.status,
      a.analyzed_at
    FROM products p
    INNER JOIN analyses a ON p.id = a.product_id
    ORDER BY a.analyzed_at DESC
    LIMIT ?
  `);

  const rows = stmt.all(limit) as any[];

  return rows.map(row => ({
    product: {
      id: row.id,
      woo_product_id: row.woo_product_id,
      sku: row.sku,
      name: row.name,
      price: row.price,
      image_url: row.image_url
    },
    analysis: {
      title: row.camouflaged_title,
      image: row.edited_image_base64,
      brands_detected: JSON.parse(row.brands_detected),
      risk_score: row.risk_score,
      status: row.status
    },
    analyzedAt: row.analyzed_at
  }));
}

/**
 * Delete analysis for a product by SKU
 * Also deletes the local image file if it exists
 *
 * @param sku Product SKU
 * @returns true if deleted, false if not found
 */
export function deleteAnalysisBySku(sku: string): boolean {
  // Get product ID and local file path
  const getStmt = db.prepare(`
    SELECT a.id as analysis_id, a.edited_image_filepath, p.id as product_id
    FROM analyses a
    INNER JOIN products p ON p.id = a.product_id
    WHERE p.sku = ?
    ORDER BY a.analyzed_at DESC
    LIMIT 1
  `);

  const row = getStmt.get(sku) as { analysis_id: number; edited_image_filepath: string | null; product_id: number } | undefined;

  if (!row) {
    console.log(`⚠️ Nenhuma análise encontrada para SKU: ${sku}`);
    return false;
  }

  // Delete local image file if exists
  if (row.edited_image_filepath) {
    const filepath = path.join(process.cwd(), row.edited_image_filepath);
    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
        console.log(`🗑️ Imagem local deletada: ${row.edited_image_filepath}`);
      } catch (error) {
        console.error(`❌ Erro ao deletar imagem: ${error}`);
      }
    }
  }

  // Delete from database
  const deleteStmt = db.prepare('DELETE FROM analyses WHERE id = ?');
  const result = deleteStmt.run(row.analysis_id);

  if (result.changes > 0) {
    console.log(`✅ Análise deletada: SKU ${sku} (ID: ${row.analysis_id})`);
    return true;
  }

  return false;
}
