import crypto from 'crypto';

/**
 * 🔐 WooCommerce OAuth 1.0a Implementation
 *
 * A biblioteca @woocommerce/woocommerce-rest-api tem bugs com POST requests
 * retornando array vazio. Esta implementação manual resolve o problema.
 */

interface OAuthParams {
  oauth_consumer_key: string;
  oauth_timestamp: string;
  oauth_nonce: string;
  oauth_signature_method: string;
  oauth_signature: string;
  oauth_version: string;
}

/**
 * Gera nonce aleatório para OAuth
 */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Gera timestamp atual
 */
function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Cria a base string para assinatura OAuth 1.0a
 */
function createSignatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  // 1. Ordenar parametros alfabeticamente
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => {
      const value = params[key] || '';
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  // 2. Criar base string: METHOD&URL&PARAMS
  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&');

  return baseString;
}

/**
 * Gera assinatura HMAC-SHA256
 */
function generateSignature(
  baseString: string,
  consumerSecret: string
): string {
  // WooCommerce usa consumer_secret& (com & no final)
  const key = `${encodeURIComponent(consumerSecret)}&`;

  const signature = crypto
    .createHmac('sha256', key)
    .update(baseString)
    .digest('base64');

  return signature;
}

/**
 * Cria URL com parametros OAuth para query string
 */
export function createWooCommerceAuthUrl(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string
): string {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();

  // Parametros OAuth
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_version: '1.0'
  };

  // Criar base string e assinatura
  const baseString = createSignatureBaseString(method, url, oauthParams);
  const signature = generateSignature(baseString, consumerSecret);

  // Adicionar assinatura aos parametros
  oauthParams.oauth_signature = signature;

  // Criar query string
  const queryString = Object.keys(oauthParams)
    .map(key => {
      const value = oauthParams[key] || '';
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  // Adicionar à URL
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${queryString}`;
}

/**
 * Faz requisição POST autenticada para WooCommerce
 */
export async function wooCommerceAuthenticatedPost<T>(
  endpoint: string,
  data: any,
  consumerKey: string,
  consumerSecret: string,
  baseUrl: string
): Promise<T> {
  const url = `${baseUrl}/wp-json/wc/v3/${endpoint}`;

  // Criar URL com OAuth
  const authenticatedUrl = createWooCommerceAuthUrl(
    'POST',
    url,
    consumerKey,
    consumerSecret
  );

  console.log('🔐 [OAuth] URL autenticada gerada');
  console.log('🔐 [OAuth] Endpoint:', endpoint);

  const response = await fetch(authenticatedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data)
  });

  console.log(`🔐 [OAuth] Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('🔐 [OAuth] Erro:', errorText);

    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      throw new Error(`WooCommerce API error: ${response.status} ${response.statusText}`);
    }

    throw new Error(
      `WooCommerce API error: ${errorData.message || errorData.code || response.statusText}`
    );
  }

  const responseData = await response.json();

  // Verificar se retornou array vazio (bug conhecido)
  if (Array.isArray(responseData) && responseData.length === 0) {
    console.error('🔐 [OAuth] Array vazio retornado - possível erro no servidor');
    throw new Error('WooCommerce retornou array vazio - verifique logs do servidor');
  }

  return responseData as T;
}
