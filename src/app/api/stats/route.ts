import { NextResponse } from 'next/server';
import * as storageService from '@/services/storage.service';
import { getStorageStats } from '@/utils/file-storage';

/**
 * GET /api/stats
 * Get analysis and storage statistics
 */
export async function GET() {
  try {
    const analysisStats = storageService.getAnalysisStats();
    const storageStatsData = getStorageStats();

    return NextResponse.json({
      success: true,
      analysis: {
        total: analysisStats.total,
        clean: analysisStats.clean,
        blurApplied: analysisStats.blurApplied,
        failed: analysisStats.failed,
        avgRiskScore: analysisStats.avgRiskScore,
        topBrands: analysisStats.topBrands
      },
      storage: {
        imagesCount: storageStatsData.count,
        totalSizeMB: storageStatsData.totalSizeMB
      }
    });

  } catch (error) {
    console.error('API /stats error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
