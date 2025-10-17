import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'database', 'products.db');

export async function GET() {
  try {
    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');

    // Get products with blur_applied status and high risk score (aggressive blur)
    // Risk score > 60 indicates significant blur was needed
    const products = db.prepare(`
      SELECT
        p.id,
        p.woo_product_id,
        p.sku,
        p.name,
        p.price,
        p.image_url as original_image,
        a.edited_image_base64 as edited_image,
        a.edited_image_filepath,
        a.brands_detected,
        a.risk_score,
        a.status,
        a.analyzed_at
      FROM products p
      INNER JOIN analyses a ON p.id = a.product_id
      WHERE a.status = 'blur_applied' AND a.risk_score >= 60
      ORDER BY a.risk_score DESC, a.analyzed_at DESC
    `).all();

    db.close();

    return NextResponse.json({
      success: true,
      count: products.length,
      products: products.map((p: any) => ({
        id: p.id,
        woo_product_id: p.woo_product_id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        original_image: p.original_image,
        edited_image: p.edited_image,
        edited_image_filepath: p.edited_image_filepath,
        brands_detected: JSON.parse(p.brands_detected || '[]'),
        risk_score: p.risk_score,
        status: p.status,
        analyzed_at: p.analyzed_at
      }))
    });

  } catch (error) {
    console.error('Error fetching products with blur:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
