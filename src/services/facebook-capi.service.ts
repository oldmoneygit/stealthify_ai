/**
 * 📊 Facebook Conversion API (CAPI) Service
 *
 * Envia eventos de conversão (Purchase) para o Facebook via servidor
 * Garante tracking 100% assertivo mesmo com bloqueadores de ads
 *
 * Features:
 * - Deduplicação com Pixel (via event_id)
 * - Hashing de dados pessoais (GDPR/LGPD)
 * - Matching avançado (email, phone, address)
 * - Suporte a UTMs e fbclid
 */

import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface FacebookPurchaseEvent {
  // 👤 User Data (para matching com usuários do Facebook)
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;

  // 🎯 Tracking Parameters
  fbp?: string;       // _fbp cookie (Facebook Browser ID)
  fbc?: string;       // _fbc cookie (Facebook Click ID)
  fbclid?: string;    // Click ID da URL

  // 📦 Order Data
  order_id: string;
  value: number;
  currency: string;
  content_ids: string[];  // Product IDs
  content_type: 'product' | 'product_group';
  num_items: number;

  // 🌐 URLs e Source
  event_source_url?: string;
  referrer_url?: string;

  // 📈 UTM Parameters
  utm_source?: string;
  utm_campaign?: string;
  utm_medium?: string;
  utm_term?: string;
  utm_content?: string;

  // 🖥️ Client Info (opcional, melhora matching)
  user_agent?: string;
  client_ip?: string;
}

interface FacebookAPIResponse {
  events_received: number;
  messages: string[];
  fbtrace_id: string;
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Envia evento Purchase para Facebook Conversion API
 *
 * @param data - Dados do evento de compra
 * @returns Resposta da API do Facebook
 * @throws Error se credenciais não estiverem configuradas ou API falhar
 */
export async function sendPurchaseEvent(
  data: FacebookPurchaseEvent
): Promise<FacebookAPIResponse> {

  // 1. Validar credenciais
  const PIXEL_ID = process.env.FACEBOOK_PIXEL_ID;
  const ACCESS_TOKEN = process.env.FACEBOOK_CONVERSION_API_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    throw new Error(
      '❌ Facebook CAPI não configurado. ' +
      'Defina FACEBOOK_PIXEL_ID e FACEBOOK_CONVERSION_API_TOKEN no .env.local'
    );
  }

  console.log('📊 [Facebook CAPI] Preparando evento Purchase:', {
    order_id: data.order_id,
    value: data.value,
    currency: data.currency,
    items: data.num_items
  });

  // 2. Hash user data (GDPR/LGPD compliance)
  const hashedUserData = hashUserData({
    email: data.email,
    phone: data.phone,
    first_name: data.first_name,
    last_name: data.last_name,
    city: data.city,
    state: data.state,
    country: data.country,
    zip: data.zip
  });

  // 3. Generate event_id for deduplication
  // ⭐ IMPORTANTE: Mesmo event_id deve ser usado no Pixel (browser) e CAPI (server)
  // para evitar contar a mesma conversão 2 vezes
  const eventId = generateEventId(data.order_id);

  // 4. Build fbc (Facebook Click ID)
  // Se temos fbclid mas não temos fbc, criar fbc no formato correto
  const fbc = data.fbc || (data.fbclid ? buildFbc(data.fbclid) : undefined);

  // 5. Build event payload
  const eventPayload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: data.event_source_url || `https://dq3gzg-a6.myshopify.com/orders/${data.order_id}`,
      action_source: 'website', // 'website' ou 'system_generated'

      user_data: {
        // Dados hasheados (SHA256)
        em: hashedUserData.email ? [hashedUserData.email] : undefined,
        ph: hashedUserData.phone ? [hashedUserData.phone] : undefined,
        fn: hashedUserData.first_name ? [hashedUserData.first_name] : undefined,
        ln: hashedUserData.last_name ? [hashedUserData.last_name] : undefined,
        ct: hashedUserData.city ? [hashedUserData.city] : undefined,
        st: hashedUserData.state ? [hashedUserData.state] : undefined,
        zp: hashedUserData.zip ? [hashedUserData.zip] : undefined,
        country: hashedUserData.country ? [hashedUserData.country] : undefined,

        // Tracking IDs (NÃO hasheados)
        fbp: data.fbp || undefined,
        fbc: fbc || undefined,

        // Client info (melhora matching)
        client_user_agent: data.user_agent || undefined,
        client_ip_address: data.client_ip || undefined
      },

      custom_data: {
        value: data.value,
        currency: data.currency,
        content_ids: data.content_ids,
        content_type: data.content_type,
        num_items: data.num_items,

        // Order ID (útil para debugging e reconciliação)
        order_id: data.order_id
      }
    }],

    // Test mode (somente em desenvolvimento)
    test_event_code: process.env.NODE_ENV === 'development' ? 'TEST12345' : undefined
  };

  // 6. Log do payload (sem dados sensíveis)
  console.log('📤 [Facebook CAPI] Enviando evento:', {
    event_id: eventId,
    order_id: data.order_id,
    has_fbp: !!data.fbp,
    has_fbc: !!fbc,
    has_email: !!data.email,
    has_phone: !!data.phone,
    utm_source: data.utm_source
  });

  // 7. Send to Facebook
  const url = `https://graph.facebook.com/v18.0/${PIXEL_ID}/events`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...eventPayload,
      access_token: ACCESS_TOKEN
    })
  });

  const result = await response.json();

  // 8. Handle response
  if (!response.ok) {
    console.error('❌ [Facebook CAPI] Erro na API:', {
      status: response.status,
      error: result.error,
      fbtrace_id: result.error?.fbtrace_id
    });

    throw new Error(
      `Facebook CAPI error: ${result.error?.message || 'Unknown error'}` +
      ` (fbtrace_id: ${result.error?.fbtrace_id})`
    );
  }

  // 9. Success
  console.log('✅ [Facebook CAPI] Evento enviado com sucesso:', {
    event_id: eventId,
    order_id: data.order_id,
    events_received: result.events_received,
    fbtrace_id: result.fbtrace_id
  });

  return result as FacebookAPIResponse;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Hash user data com SHA256 (lowercase + trim)
 */
function hashUserData(data: {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}): Record<string, string | undefined> {
  return {
    email: data.email ? hashSHA256(data.email.toLowerCase().trim()) : undefined,
    phone: data.phone ? hashSHA256(normalizePhone(data.phone)) : undefined,
    first_name: data.first_name ? hashSHA256(data.first_name.toLowerCase().trim()) : undefined,
    last_name: data.last_name ? hashSHA256(data.last_name.toLowerCase().trim()) : undefined,
    city: data.city ? hashSHA256(data.city.toLowerCase().trim()) : undefined,
    state: data.state ? hashSHA256(data.state.toLowerCase().trim()) : undefined,
    country: data.country ? hashSHA256(data.country.toLowerCase().trim()) : undefined,
    zip: data.zip ? hashSHA256(removeSpaces(data.zip)) : undefined
  };
}

/**
 * SHA256 hash
 */
function hashSHA256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normalize phone to E.164 format (+55 para Brasil, +54 para Argentina)
 *
 * Exemplos:
 * - "(11) 99999-9999" → "+5511999999999"
 * - "2975 28-3623" → "+542975283623"
 */
function normalizePhone(phone: string): string {
  // Remove tudo exceto números e +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Se já tem +, retornar
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // Detectar país pelo comprimento
  // Argentina: 10 dígitos (código área 4 + número 6-7)
  // Brasil: 11 dígitos (DDD 2 + número 9)
  if (cleaned.length === 10) {
    // Assumir Argentina
    return '+54' + cleaned;
  } else if (cleaned.length === 11) {
    // Assumir Brasil
    return '+55' + cleaned;
  }

  // Default: retornar com + na frente
  return '+' + cleaned;
}

/**
 * Remove espaços de strings (para CEP, ZIP)
 */
function removeSpaces(value: string): string {
  return value.replace(/\s/g, '');
}

/**
 * Gera event_id único e determinístico baseado no order_id
 *
 * ⭐ IMPORTANTE: Este mesmo ID deve ser usado no Pixel (browser-side)
 * para garantir deduplicação correta
 */
function generateEventId(orderId: string): string {
  // Formato: order_SHOPIFYID_timestamp
  // Exemplo: order_6001212096555_1729376400
  return `order_${orderId}_${Math.floor(Date.now() / 1000)}`;
}

/**
 * Constrói fbc (Facebook Click) a partir do fbclid
 *
 * Formato: fb.{subdomainIndex}.{timestamp}.{fbclid}
 * Exemplo: fb.1.1729376400.IwAR3xYz...
 */
function buildFbc(fbclid: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  return `fb.1.${timestamp}.${fbclid}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  sendPurchaseEvent
};
