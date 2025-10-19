/**
 * 🔐 WooCommerce Authentication via Query Params
 *
 * SOLUÇÃO: Usar consumer_key e consumer_secret diretamente na URL
 * Ref: https://woocommerce.github.io/woocommerce-rest-api-docs/#authentication
 *
 * "If your server does not parse the Authorization header correctly,
 * you might see a "Consumer key is missing" error. You can provide
 * the consumer key and secret as query parameters."
 */

/**
 * Cria URL autenticada para WooCommerce usando query params
 */
export function createWooCommerceAuthUrl(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string
): string {
  // Adicionar consumer_key e consumer_secret como query params
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}consumer_key=${encodeURIComponent(consumerKey)}&consumer_secret=${encodeURIComponent(consumerSecret)}`;
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

  // Criar URL com query params auth
  const authenticatedUrl = createWooCommerceAuthUrl(
    'POST',
    url,
    consumerKey,
    consumerSecret
  );

  console.log('🔐 [WooCommerce] Autenticação via query params');
  console.log('🔐 [WooCommerce] Endpoint:', endpoint);

  const response = await fetch(authenticatedUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(data)
  });

  console.log(`🔐 [WooCommerce] Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('🔐 [WooCommerce] Erro:', errorText);

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
    console.error('🔐 [WooCommerce] Array vazio retornado - possível erro no servidor');
    throw new Error('WooCommerce retornou array vazio - verifique logs do servidor');
  }

  return responseData as T;
}
