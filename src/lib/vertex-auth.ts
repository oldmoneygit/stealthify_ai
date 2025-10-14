import { google } from 'googleapis';

/**
 * Get access token for Vertex AI API using Service Account
 */
export async function getAccessToken(): Promise<string> {
  try {
    const serviceAccountJson = process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON;

    if (!serviceAccountJson) {
      throw new Error('GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON not configured');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);

    const jwtClient = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const tokens = await jwtClient.authorize();

    if (!tokens.access_token) {
      throw new Error('Failed to get access token');
    }

    console.log('✅ Vertex AI: Access token obtido');
    return tokens.access_token;

  } catch (error) {
    console.error('❌ Vertex AI: Erro ao obter access token:', error);
    throw new Error(
      `Failed to get Vertex AI access token: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Test Vertex AI authentication
 */
export async function testVertexAuth(): Promise<boolean> {
  try {
    const token = await getAccessToken();
    console.log('✅ Vertex AI: Autenticação OK');
    return token.length > 0;
  } catch (error) {
    console.error('❌ Vertex AI: Falha na autenticação:', error);
    return false;
  }
}
