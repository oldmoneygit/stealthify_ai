/**
 * 🎯 Tracking Cache Service
 *
 * Gerencia cache em memória de parâmetros de tracking
 * (fbclid, utm_*, fbp, fbc) capturados pelo Custom Pixel
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StoredTracking {
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
// PUBLIC API
// ============================================================================

/**
 * Salva tracking data no cache
 */
export function saveTracking(orderId: string, tracking: Omit<StoredTracking, 'saved_at' | 'expires_at'>): StoredTracking {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 horas

  const storedData: StoredTracking = {
    ...tracking,
    saved_at: now.toISOString(),
    expires_at: expiresAt.toISOString()
  };

  trackingCache.set(orderId, storedData);

  console.log('✅ [Tracking Cache] Dados salvos para pedido:', {
    order_id: orderId,
    has_fbclid: !!tracking.fbclid,
    has_fbp: !!tracking.fbp,
    has_utm: !!tracking.utm_source,
    cache_size: trackingCache.size
  });

  return storedData;
}

/**
 * Busca tracking por order_id
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
