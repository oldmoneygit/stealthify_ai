/**
 * Script para adicionar regular_price (preço riscado) 40% maior que sale_price
 *
 * Execução: npx tsx scripts/add-regular-price.ts
 */

import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import dotenv from 'dotenv';
import path from 'path';

// Carregar variáveis de ambiente
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

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

async function addRegularPrices() {
  console.log('🚀 Iniciando adição de regular_price...\n');

  let page = 1;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    console.log(`📦 Buscando página ${page}...`);

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

      // Se não tem price, pula
      if (!product.price || product.price === '' || product.price === '0') {
        console.log(`⏭️  ${product.sku} - Sem price, pulando...`);
        totalSkipped++;
        continue;
      }

      const currentPrice = parseFloat(product.price);
      const salePrice = currentPrice;         // Mantém o preço atual como sale_price
      const regularPrice = currentPrice * 1.4; // 40% mais caro para regular_price (riscado)

      console.log(`💰 ${product.sku} - ${product.name.substring(0, 40)}...`);
      console.log(`   Preço atual: R$ ${currentPrice.toFixed(2)}`);
      console.log(`   Sale Price (novo): R$ ${salePrice.toFixed(2)}`);
      console.log(`   Regular Price (novo - riscado): R$ ${regularPrice.toFixed(2)}`);

      try {
        await wooApi.put(`products/${product.id}`, {
          sale_price: salePrice.toFixed(2),
          regular_price: regularPrice.toFixed(2)
        });

        console.log(`   ✅ Atualizado!\n`);
        totalUpdated++;

        // Delay de 1 segundo entre requisições para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`   ❌ Erro ao atualizar:`, error);
        console.log('');
      }
    }

    page++;
  }

  console.log('═══════════════════════════════════════');
  console.log('📊 RESUMO DA OPERAÇÃO');
  console.log('═══════════════════════════════════════');
  console.log(`Total de produtos processados: ${totalProcessed}`);
  console.log(`✅ Atualizados com sucesso: ${totalUpdated}`);
  console.log(`⏭️  Pulados (sem sale_price): ${totalSkipped}`);
  console.log('═══════════════════════════════════════\n');
}

// Executar
addRegularPrices()
  .then(() => {
    console.log('🎉 Script concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
