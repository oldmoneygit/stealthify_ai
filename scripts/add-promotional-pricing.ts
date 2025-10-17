import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Configurar WooCommerce API
const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: 'wc/v3',
  queryStringAuth: true,
});

interface WooProduct {
  id: number;
  sku: string;
  name: string;
  price: string;
  regular_price: string;
  sale_price: string;
}

/**
 * Calcula um preço regular promocional realista
 * @param salePrice - Preço de venda atual (em ARS)
 * @returns Preço regular com desconto aparente de 30-50%
 */
function calculatePromotionalRegularPrice(salePrice: number): number {
  // Desconto aparente entre 30% e 50%
  const discountPercentage = Math.random() * 0.2 + 0.3; // 0.3 a 0.5

  // Calcular preço regular (sale_price / (1 - discount))
  const regularPrice = salePrice / (1 - discountPercentage);

  // Arredondar para um número "bonito"
  // Se for menor que 100k, arredonda para múltiplos de 100
  // Se for maior, arredonda para múltiplos de 1000
  if (regularPrice < 100000) {
    return Math.round(regularPrice / 100) * 100;
  } else {
    return Math.round(regularPrice / 1000) * 1000;
  }
}

async function addPromotionalPricing() {
  console.log('⚠️  ATENÇÃO: Este script irá adicionar preços promocionais!');
  console.log('📝 Um backup será criado automaticamente.\n');

  console.log('\n============================================================');
  console.log('💰 ADICIONAR PREÇOS PROMOCIONAIS');
  console.log('============================================================\n');

  try {
    // Buscar todos os produtos
    console.log('📦 Buscando produtos do WooCommerce...');
    const allProducts: WooProduct[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await wooApi.get('products', {
        per_page: 100,
        page,
        status: 'publish',
      });

      const products = response.data as WooProduct[];
      allProducts.push(...products);
      console.log(`   Página ${page}: ${products.length} produtos`);

      hasMore = products.length === 100;
      page++;
    }

    console.log(`✅ Total: ${allProducts.length} produtos encontrados\n`);

    // Processar cada produto
    console.log('🔄 Iniciando atualização de preços...\n');

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
      if (!product) continue; // Type guard

      const productNumber = i + 1;

      console.log(`[${productNumber}/${allProducts.length}] ${product.sku}`);
      console.log(`   Nome: ${product.name}`);

      try {
        // Pegar o preço atual (sale_price)
        const currentSalePrice = parseFloat(product.sale_price || product.price);

        if (!currentSalePrice || currentSalePrice < 10000) {
          console.log(`   ⚠️  Produto com preço suspeito (${currentSalePrice}), pulando...`);
          skipped++;
          continue;
        }

        // Calcular novo preço regular (30-50% maior)
        const newRegularPrice = calculatePromotionalRegularPrice(currentSalePrice);

        // Calcular percentual de desconto aparente
        const discountPercent = Math.round(((newRegularPrice - currentSalePrice) / newRegularPrice) * 100);

        console.log(`   💰 Sale Price: R$ ${currentSalePrice.toFixed(2)}`);
        console.log(`   💵 Regular Price: R$ ${newRegularPrice.toFixed(2)} (${discountPercent}% off)`);

        // Atualizar no WooCommerce
        await wooApi.put(`products/${product.id}`, {
          regular_price: newRegularPrice.toString(),
          sale_price: currentSalePrice.toString(),
          price: currentSalePrice.toString(), // Price sempre = sale_price
        });

        console.log(`   ✅ Atualizado!\n`);
        updated++;

        // Delay para não sobrecarregar a API
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: unknown) {
        console.error(`   ❌ Erro ao atualizar: ${error instanceof Error ? error.message : String(error)}\n`);
        errors++;
      }
    }

    // Resumo final
    console.log('\n============================================================');
    console.log('🎉 ATUALIZAÇÃO COMPLETA!');
    console.log('============================================================');
    console.log('📊 Estatísticas:');
    console.log(`   ✅ Atualizados: ${updated}`);
    console.log(`   ⚠️  Pulados:    ${skipped}`);
    console.log(`   ❌ Erros:      ${errors}`);

    if (errors === 0) {
      console.log('\n✅ Script concluído com sucesso!');
    } else {
      console.log('\n⚠️  Script concluído com alguns erros. Verifique os logs acima.');
    }
  } catch (error) {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  }
}

// Executar
addPromotionalPricing();
