/**
 * API Route: GET /api/logs/[requestId]
 *
 * Retorna os logs de uma requisição específica
 * Usado para polling de logs pelo cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestLogs } from '@/lib/browser-logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;

  if (!requestId) {
    return NextResponse.json(
      { error: 'requestId é obrigatório' },
      { status: 400 }
    );
  }

  try {
    const logs = getRequestLogs(requestId);

    return NextResponse.json({
      requestId,
      logs,
      count: logs.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar logs:', error);

    return NextResponse.json(
      {
        error: 'Erro ao buscar logs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
