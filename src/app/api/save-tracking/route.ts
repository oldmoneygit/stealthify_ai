import { NextResponse } from 'next/server';
import { saveTracking, getTrackingByOrderId, getCacheStats } from '@/services/tracking-cache.service';

/**
 * 🎯 API ROUTE: Save Tracking Parameters
 *
 * POST /api/save-tracking
 *
 * Este endpoint recebe parâmetros de tracking (fbclid, utm_*, fbp, fbc)
 * capturados pelo Custom Pixel da Shopify no momento do checkout
 *
 * Os dados são salvos temporariamente em memória até o webhook chegar,
 * permitindo que o Facebook CAPI receba os parâmetros corretos
 *
 * Body: {
 *   order_id: number,
 *   tracking: {
 *     fbclid?: string,
 *     fbp?: string,
 *     fbc?: string,
 *     utm_source?: string,
 *     utm_medium?: string,
 *     utm_campaign?: string,
 *     utm_term?: string,
 *     utm_content?: string,
 *     landing_url?: string,
 *     referrer?: string
 *   }
 * }
 */

// ============================================================================
// TYPES
// ============================================================================

interface TrackingData {
  order_id: number | string;
  tracking: {
    // Facebook
    fbclid?: string;
    fbp?: string;  // _fbp cookie
    fbc?: string;  // _fbc cookie

    // UTMs
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    utm_id?: string;

    // Google
    gclid?: string;

    // TikTok
    ttclid?: string;

    // Microsoft
    msclkid?: string;

    // URLs
    landing_url?: string;
    referrer?: string;

    // Client info
    user_agent?: string;
    client_ip?: string;
  };
}

// ============================================================================
// API HANDLERS
// ============================================================================

// CORS headers (permitir chamadas do Custom Pixel)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * OPTIONS - CORS preflight
 */
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * POST - Salvar dados de tracking
 */
export async function POST(request: Request) {
  try {
    const data: TrackingData = await request.json();

    // Validar dados
    if (!data.order_id || !data.tracking) {
      return NextResponse.json({
        success: false,
        error: 'order_id e tracking são obrigatórios'
      }, { status: 400, headers: corsHeaders });
    }

    // Normalizar order_id para string
    const orderId = data.order_id.toString();

    // Salvar usando o service
    const storedData = saveTracking(orderId, data.tracking);

    return NextResponse.json({
      success: true,
      order_id: orderId,
      saved_at: storedData.saved_at,
      expires_at: storedData.expires_at
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('❌ [Tracking] Erro ao salvar:', error);

    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}

/**
 * GET - Buscar dados de tracking
 *
 * Query params:
 *   ?order_id=6001212096555
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (!orderId) {
      return NextResponse.json({
        success: false,
        error: 'order_id é obrigatório'
      }, { status: 400, headers: corsHeaders });
    }

    const tracking = getTrackingByOrderId(orderId);

    if (!tracking) {
      return NextResponse.json({
        success: false,
        error: 'Tracking não encontrado (pode ter expirado)'
      }, { status: 404, headers: corsHeaders });
    }

    return NextResponse.json({
      success: true,
      order_id: orderId,
      tracking
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('❌ [Tracking] Erro ao buscar:', error);

    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
