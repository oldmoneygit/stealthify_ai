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
 */
function calculatePromotionalRegularPrice(salePrice: number): number {
  const discountPercentage = Math.random() * 0.2 + 0.3; // 30-50%
  const regularPrice = salePrice / (1 - discountPercentage);

  if (regularPrice < 100000) {
    return Math.round(regularPrice / 100) * 100;
  } else {
    return Math.round(regularPrice / 1000) * 1000;
  }
}

async function previewPromotionalPricing() {
  console.log('🔍 PREVIEW: Preços Promocionais\n');
  console.log('Buscando primeiros 10 produtos...\n');

  try {
    const response = await wooApi.get('products', {
      per_page: 10,
      status: 'publish',
    });

    const products = response.data as WooProduct[];

    console.log('📊 Exemplos de Conversão:\n');
    console.log('='.repeat(80));

    products.forEach((product, index) => {
      const currentSalePrice = parseFloat(product.sale_price || product.price);
      const newRegularPrice = calculatePromotionalRegularPrice(currentSalePrice);
      const discountPercent = Math.round(((newRegularPrice - currentSalePrice) / newRegularPrice) * 100);
      const savingsARS = newRegularPrice - currentSalePrice;

      console.log(`\n[${index + 1}] ${product.name.substring(0, 60)}...`);
      console.log(`    SKU: ${product.sku}`);
      console.log(`
    💵 Preço Normal:      R$ ${newRegularPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ARS`);
      console.log(`    💰 Preço Promocional: R$ ${currentSalePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ARS`);
      console.log(`    🎉 Você economiza:    R$ ${savingsARS.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${discountPercent}% OFF)`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Preview concluído! Se estiver satisfeito, execute:');
    console.log('   npx tsx scripts/add-promotional-pricing.ts\n');
  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

previewPromotionalPricing();
