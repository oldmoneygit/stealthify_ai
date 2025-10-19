/**
 * Script para sincronizar preços do WooCommerce para Shopify
 *
 * WooCommerce -> Shopify:
 * - sale_price -> price
 * - regular_price -> compare_at_price
 *
 * Execução: npx tsx scripts/sync-prices-woo-to-shopify.ts
 */

import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SHOPIFY_API_VERSION = '2024-01';
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: true
});

interface WooProduct {
  id: number;
  sku: string;
  name: string;
  price: string;
  sale_price: string;
  regular_price: string;
}

interface ShopifyVariant {
  id: number;
  sku: string;
  price: string;
  compare_at_price: string | null;
}

interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyVariant[];
}

async function syncPrices() {
  console.log('🔄 Iniciando sincronização de preços WooCommerce → Shopify...\n');

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;
  let page = 1;

  while (true) {
    console.log(`📦 Buscando produtos WooCommerce página ${page}...`);

    const response = await wooApi.get("products", {
      per_page: 100,
      page,
      status: "publish"
    });

    const products = response.data as WooProduct[];

    if (products.length === 0) {
      console.log('\n✅ Todas as páginas processadas!\n');
      break;
    }

    console.log(`   Produtos encontrados: ${products.length}\n`);

    for (const product of products) {
      totalProcessed++;

      // Se não tem sale_price ou regular_price, pula
      if (!product.sale_price || !product.regular_price) {
        console.log(`⏭️  ${product.sku} - Sem sale_price ou regular_price no WooCommerce, pulando...`);
        totalSkipped++;
        continue;
      }

      const salePrice = parseFloat(product.sale_price);
      const regularPrice = parseFloat(product.regular_price);

      console.log(`💰 ${product.sku} - ${product.name.substring(0, 40)}...`);
      console.log(`   WooCommerce - Sale: R$ ${salePrice.toFixed(2)} | Regular: R$ ${regularPrice.toFixed(2)}`);

      try {
        // Buscar produto na Shopify pelo SKU
        const shopifyVariant = await findShopifyVariantBySku(product.sku);

        if (!shopifyVariant) {
          console.log(`   ⚠️  Produto não encontrado na Shopify\n`);
          totalNotFound++;
          continue;
        }

        console.log(`   Shopify - Atualizando price e compare_at_price...`);

        // Atualizar variant na Shopify
        const updateUrl = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/variants/${shopifyVariant.id}.json`;

        const updateResponse = await fetch(updateUrl, {
          method: 'PUT',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            variant: {
              id: shopifyVariant.id,
              price: salePrice.toFixed(2),              // WooCommerce sale_price
              compare_at_price: regularPrice.toFixed(2) // WooCommerce regular_price
            }
          })
        });

        if (!updateResponse.ok) {
          const error = await updateResponse.text();
          throw new Error(`${updateResponse.status} - ${error}`);
        }

        console.log(`   ✅ Shopify - Price: R$ ${salePrice.toFixed(2)} | Compare At: R$ ${regularPrice.toFixed(2)}\n`);
        totalUpdated++;

        // Delay de 500ms entre requisições (Shopify rate limit: 2 req/s)
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`   ❌ Erro ao sincronizar:`, error);
        console.log('');
      }
    }

    page++;
  }

  console.log('═══════════════════════════════════════');
  console.log('📊 RESUMO DA SINCRONIZAÇÃO');
  console.log('═══════════════════════════════════════');
  console.log(`Total de produtos processados: ${totalProcessed}`);
  console.log(`✅ Sincronizados com sucesso: ${totalUpdated}`);
  console.log(`⏭️  Pulados (sem preços WooCommerce): ${totalSkipped}`);
  console.log(`⚠️  Não encontrados na Shopify: ${totalNotFound}`);
  console.log('═══════════════════════════════════════\n');
}

/**
 * Busca variant na Shopify por SKU
 * Usa GraphQL para busca mais eficiente
 */
async function findShopifyVariantBySku(sku: string): Promise<ShopifyVariant | null> {
  try {
    // Usar GraphQL para buscar por SKU (mais eficiente que REST)
    const graphqlUrl = `${SHOPIFY_STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

    const query = `
      query getVariantBySku($sku: String!) {
        productVariants(first: 1, query: $sku) {
          edges {
            node {
              id
              sku
              price
              compareAtPrice
            }
          }
        }
      }
    `;

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: { sku: `sku:${sku}` }
      })
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    const edges = result.data?.productVariants?.edges;

    if (!edges || edges.length === 0) {
      return null;
    }

    const node = edges[0].node;

    // Converter GraphQL ID para REST ID
    // GraphQL ID format: "gid://shopify/ProductVariant/12345"
    const restId = parseInt(node.id.split('/').pop() || '0');

    return {
      id: restId,
      sku: node.sku,
      price: node.price,
      compare_at_price: node.compareAtPrice
    };

  } catch (error) {
    console.error(`   Erro ao buscar SKU ${sku} na Shopify:`, error);
    return null;
  }
}

// Executar
syncPrices()
  .then(() => {
    console.log('🎉 Sincronização concluída com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
