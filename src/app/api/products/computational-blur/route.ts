import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ANALYSIS_FILE = path.join(process.cwd(), 'debug', 'blur-analysis-all.json');

export async function GET() {
  try {
    // Read the analysis results
    if (!fs.existsSync(ANALYSIS_FILE)) {
      return NextResponse.json(
        { success: false, error: 'Analysis file not found. Run analyze-all-processed-blur.ts first' },
        { status: 404 }
      );
    }

    const analysisData = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'));

    // Filter for significant blur only (blur_score >= 50)
    const productsWithBlur = analysisData
      .filter((p: any) => p.has_significant_blur)
      .sort((a: any, b: any) => b.blur_score - a.blur_score); // Sort by blur score (highest first)

    return NextResponse.json({
      success: true,
      count: productsWithBlur.length,
      total_analyzed: analysisData.length,
      blur_rate: Math.round((productsWithBlur.length / analysisData.length) * 100),
      products: productsWithBlur
    });

  } catch (error) {
    console.error('Error reading blur analysis:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
