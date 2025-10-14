import { NextResponse } from 'next/server';
import {
  getAnalysis,
  getAllAnalyses
} from '@/services/orchestrator.service';

/**
 * GET /api/analyses
 *
 * Get all analyses or specific analysis
 *
 * Query: ?productId=123 (optional)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');

    if (productId) {
      // Get specific analysis
      const analysis = getAnalysis(parseInt(productId));

      if (!analysis) {
        return NextResponse.json(
          { error: 'Analysis not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        analysis
      });
    }

    // Get all analyses
    const analyses = getAllAnalyses();

    return NextResponse.json({
      success: true,
      count: analyses.length,
      analyses
    });

  } catch (error) {
    console.error('API /analyses error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch analyses',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
