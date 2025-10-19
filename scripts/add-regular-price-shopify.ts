/**
 * Script para adicionar compare_at_price (preço riscado) 40% maior que price na Shopify
 *
 * Execução: npx tsx scripts/add-regular-price-shopify.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_API_VERSION = '2024-01';
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

interface ShopifyVariant {
  id: number;
  product_id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
}

interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyVariant[];
}

interface PaginationInfo {
  next?: string;
}

async function addShopifyRegularPrices() {
  console.log('🚀 Iniciando adição de compare_at_price na Shopify...\n');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let nextPageUrl: string | undefined = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=250`;

  while (nextPageUrl) {
    console.log(`📦 Buscando produtos...`);

    const response = await fetch(nextPageUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    const products = data.products as ShopifyProduct[];

    console.log(`   Produtos encontrados: ${products.length}\n`);

    // Processar cada produto e suas variantes
    for (const product of products) {
      for (const variant of product.variants) {
        totalProcessed++;

        // Se não tem price, pula
        if (!variant.price || variant.price === '' || variant.price === '0') {
          console.log(`⏭️  ${variant.sku} - Sem price, pulando...`);
          totalSkipped++;
          continue;
        }

        const currentPrice = parseFloat(variant.price);
        const compareAtPrice = currentPrice * 1.4; // 40% mais caro

        console.log(`💰 ${variant.sku} - ${product.title.substring(0, 40)}...`);
        console.log(`   Preço atual: R$ ${currentPrice.toFixed(2)}`);
        console.log(`   Compare At Price (novo - riscado): R$ ${compareAtPrice.toFixed(2)}`);

        try {
          // Atualizar variant na Shopify
          const updateUrl = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/variants/${variant.id}.json`;

          const updateResponse = await fetch(updateUrl, {
            method: 'PUT',
            headers: {
              'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              variant: {
                id: variant.id,
                compare_at_price: compareAtPrice.toFixed(2)
              }
            })
          });

          if (!updateResponse.ok) {
            const error = await updateResponse.text();
            throw new Error(`${updateResponse.status} - ${error}`);
          }

          console.log(`   ✅ Atualizado!\n`);
          totalUpdated++;

          // Delay de 500ms entre requisições (Shopify tem rate limit de 2 req/s)
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (error) {
          console.error(`   ❌ Erro ao atualizar:`, error);
          console.log('');
        }
      }
    }

    // Verificar se há próxima página
    const linkHeader = response.headers.get('Link');
    nextPageUrl = parseLinkHeader(linkHeader);

    if (nextPageUrl) {
      console.log('📄 Próxima página encontrada...\n');
    }
  }

  console.log('═══════════════════════════════════════');
  console.log('📊 RESUMO DA OPERAÇÃO');
  console.log('═══════════════════════════════════════');
  console.log(`Total de variantes processadas: ${totalProcessed}`);
  console.log(`✅ Atualizadas com sucesso: ${totalUpdated}`);
  console.log(`⏭️  Puladas (sem price): ${totalSkipped}`);
  console.log('═══════════════════════════════════════\n');
}

/**
 * Parse do header Link para obter próxima página
 * Link: <https://store.myshopify.com/admin/api/2024-01/products.json?page_info=xxx>; rel="next"
 */
function parseLinkHeader(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;

  const links = linkHeader.split(',');
  const nextLink = links.find(link => link.includes('rel="next"'));

  if (!nextLink) return undefined;

  const match = nextLink.match(/<(.+?)>/);
  return match ? match[1] : undefined;
}

// Executar
addShopifyRegularPrices()
  .then(() => {
    console.log('🎉 Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
