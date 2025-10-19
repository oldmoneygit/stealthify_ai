import crypto from 'crypto';

/**
 * 🔐 WooCommerce OAuth 1.0a Implementation
 *
 * Baseado na implementação oficial PHP:
 * https://github.com/woocommerce/wc-api-php/blob/trunk/src/WooCommerce/HttpClient/OAuth.php
 */

/**
 * Encode RFC 3986 (igual ao PHP rawurlencode + replacements)
 */
function encode(value: string): string {
  // rawurlencode + replace específico do WooCommerce
  return encodeURIComponent(value)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');  // Tilde não deve ser encoded
}

/**
 * Gera nonce (igual ao PHP: sha1(microtime()))
 */
function generateNonce(): string {
  const microtime = Date.now() * 1000 + Math.random() * 1000;
  return crypto.createHash('sha1').update(microtime.toString()).digest('hex');
}

/**
 * Gera timestamp atual
 */
function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Normaliza e ordena parâmetros (byte-order strcmp)
 */
function normalizeAndSortParameters(params: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};

  // Normalizar (encode key e value)
  for (const key of Object.keys(params)) {
    const encodedKey = encode(key);
    const encodedValue = encode(params[key] || '');
    normalized[encodedKey] = encodedValue;
  }

  // Ordenar por chave (strcmp byte-order)
  const sortedKeys = Object.keys(normalized).sort((a, b) => {
    return a.localeCompare(b);
  });

  const sorted: Record<string, string> = {};
  for (const key of sortedKeys) {
    sorted[key] = normalized[key];
  }

  return sorted;
}

/**
 * Junta parâmetros com '=' e codifica novamente (double encoding)
 */
function joinWithEqualsSign(params: Record<string, string>): string[] {
  const result: string[] = [];

  for (const key of Object.keys(params)) {
    const value = params[key] || '';
    // Join com = e encode novamente (double encoding)
    const string = `${key}=${value}`;
    result.push(encode(string));
  }

  return result;
}

/**
 * Gera assinatura OAuth 1.0a
 */
function generateOAuthSignature(
  method: string,
  url: string,
  parameters: Record<string, string>,
  consumerSecret: string,
  apiVersion: string
): string {
  // 1. Encode URL base (rawurlencode)
  const baseRequestUri = encode(url);

  // 2. Normalizar e ordenar parâmetros
  const normalizedParams = normalizeAndSortParameters(parameters);

  // 3. Criar query string (join com &, mas encoded como %26)
  const queryParts = joinWithEqualsSign(normalizedParams);
  const queryString = queryParts.join('%26');

  // 4. Criar string to sign: METHOD&URL&PARAMS
  const stringToSign = `${method.toUpperCase()}&${baseRequestUri}&${queryString}`;

  // 5. Secret: para v3+ adicionar '&' no final
  let secret = consumerSecret;
  if (!['v1', 'v2'].includes(apiVersion)) {
    secret += '&';
  }

  // 6. HMAC-SHA256
  const signature = crypto
    .createHmac('sha256', secret)
    .update(stringToSign)
    .digest('base64');

  return signature;
}

/**
 * Cria URL autenticada com OAuth 1.0a
 */
export function createWooCommerceAuthUrl(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  apiVersion: string = 'v3'
): string {
  const timestamp = generateTimestamp();
  const nonce = generateNonce();

  // Parâmetros OAuth (SEM oauth_version!)
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_timestamp: timestamp,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256'
  };

  // Gerar assinatura
  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    consumerSecret,
    apiVersion
  );

  // Adicionar assinatura
  oauthParams.oauth_signature = signature;

  // Criar query string (encoding normal, não double)
  const queryParams: string[] = [];
  for (const key of Object.keys(oauthParams)) {
    const value = oauthParams[key] || '';
    queryParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }

  const queryString = queryParams.join('&');

  // Adicionar à URL
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${queryString}`;
}

/**
 * Faz POST autenticado para WooCommerce API v3
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
    consumerSecret,
    'v3'
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
