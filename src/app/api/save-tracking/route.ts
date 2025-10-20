import { NextResponse } from 'next/server';

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

interface StoredTracking {
  // Facebook
  fbclid?: string;
  fbp?: string;
  fbc?: string;

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

  // Timestamps
  saved_at: string;
  expires_at: string;
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

/**
 * Cache em memória para armazenar tracking temporariamente
 *
 * ⚠️ IMPORTANTE: Dados ficam salvos por 24h
 * Depois são automaticamente deletados para não ocupar memória
 *
 * 💡 MELHORIA FUTURA: Usar Redis ou Supabase para persistência
 */
const trackingCache = new Map<string, StoredTracking>();

// Limpar cache a cada hora (remover entradas expiradas)
setInterval(() => {
  const now = Date.now();
  let removed = 0;

  trackingCache.forEach((value, key) => {
    const expiresAt = new Date(value.expires_at).getTime();
    if (now > expiresAt) {
      trackingCache.delete(key);
      removed++;
    }
  });

  if (removed > 0) {
    console.log(`🧹 [Tracking Cache] Removidas ${removed} entradas expiradas`);
  }
}, 60 * 60 * 1000); // 1 hora

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

    // Salvar com timestamp e expiração (24h)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

    const storedData: StoredTracking = {
      ...data.tracking,
      saved_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    trackingCache.set(orderId, storedData);

    console.log('✅ [Tracking] Dados salvos para pedido:', {
      order_id: orderId,
      has_fbclid: !!data.tracking.fbclid,
      has_fbp: !!data.tracking.fbp,
      has_utm: !!data.tracking.utm_source,
      cache_size: trackingCache.size
    });

    return NextResponse.json({
      success: true,
      order_id: orderId,
      saved_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
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

    const tracking = trackingCache.get(orderId);

    if (!tracking) {
      return NextResponse.json({
        success: false,
        error: 'Tracking não encontrado (pode ter expirado)'
      }, { status: 404, headers: corsHeaders });
    }

    // Verificar se não expirou
    const now = new Date();
    const expiresAt = new Date(tracking.expires_at);

    if (now > expiresAt) {
      trackingCache.delete(orderId);
      return NextResponse.json({
        success: false,
        error: 'Tracking expirado'
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

// ============================================================================
// HELPER FUNCTIONS (para uso interno)
// ============================================================================

/**
 * Busca tracking por order_id (para uso em outros services)
 *
 * @param orderId - ID do pedido Shopify
 * @returns Dados de tracking ou null se não encontrado
 */
export function getTrackingByOrderId(orderId: string): StoredTracking | null {
  const tracking = trackingCache.get(orderId);

  if (!tracking) {
    return null;
  }

  // Verificar se não expirou
  const now = new Date();
  const expiresAt = new Date(tracking.expires_at);

  if (now > expiresAt) {
    trackingCache.delete(orderId);
    return null;
  }

  return tracking;
}

/**
 * Retorna estatísticas do cache (para debugging)
 */
export function getCacheStats() {
  return {
    total_entries: trackingCache.size,
    entries: Array.from(trackingCache.entries()).map(([orderId, data]) => ({
      order_id: orderId,
      saved_at: data.saved_at,
      expires_at: data.expires_at,
      has_fbclid: !!data.fbclid,
      has_fbp: !!data.fbp,
      utm_source: data.utm_source
    }))
  };
}
