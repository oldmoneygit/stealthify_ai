import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3",
  queryStringAuth: true,
});

interface Product {
  id: number;
  sku: string;
  name: string;
  price: string;
  sale_price: string;
  regular_price: string;
}

async function analyzePrices() {
  console.log("🔍 Iniciando análise de preços...\n");

  const allProducts: Product[] = [];
  let page = 1;
  let hasMore = true;

  // Buscar todos os produtos
  while (hasMore) {
    const response = await wooApi.get("products", {
      per_page: 100,
      page,
      status: "publish",
    });

    const products = response.data as Product[];
    allProducts.push(...products);

    console.log(`📦 Página ${page}: ${products.length} produtos`);

    if (products.length < 100) {
      hasMore = false;
    }
    page++;
  }

  console.log(`\n✅ Total de produtos carregados: ${allProducts.length}\n`);

  // Analisar preços (usando sale_price)
  const prices: number[] = [];
  const productPrices: { sku: string; name: string; price: number }[] = [];

  for (const product of allProducts) {
    const price = parseFloat(product.sale_price || product.price);
    if (!isNaN(price) && price > 0) {
      prices.push(price);
      productPrices.push({
        sku: product.sku,
        name: product.name,
        price,
      });
    }
  }

  // Calcular estatísticas
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const min = sortedPrices[0];
  const max = sortedPrices[sortedPrices.length - 1];
  const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;

  // Calcular mediana
  const mid = Math.floor(sortedPrices.length / 2);
  const median =
    sortedPrices.length % 2 === 0
      ? (sortedPrices[mid - 1] + sortedPrices[mid]) / 2
      : sortedPrices[mid];

  // Calcular desvio padrão
  const variance =
    prices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  console.log("═══════════════════════════════════════");
  console.log("📊 ESTATÍSTICAS DE PREÇOS");
  console.log("═══════════════════════════════════════");
  console.log(`Total de produtos: ${prices.length}`);
  console.log(`Preço mínimo: R$ ${min.toFixed(2)}`);
  console.log(`Preço máximo: R$ ${max.toFixed(2)}`);
  console.log(`Média: R$ ${mean.toFixed(2)}`);
  console.log(`Mediana: R$ ${median.toFixed(2)}`);
  console.log(`Desvio padrão: R$ ${stdDev.toFixed(2)}`);
  console.log("═══════════════════════════════════════\n");

  // Identificar outliers (valores > 2 desvios padrão da média)
  const upperBound = mean + 2 * stdDev;
  const lowerBound = mean - 2 * stdDev;

  const highOutliers = productPrices
    .filter((p) => p.price > upperBound)
    .sort((a, b) => b.price - a.price);

  const lowOutliers = productPrices
    .filter((p) => p.price < lowerBound && p.price > 0)
    .sort((a, b) => a.price - b.price);

  // Mostrar produtos mais caros
  console.log("═══════════════════════════════════════");
  console.log("💎 TOP 10 PRODUTOS MAIS CAROS");
  console.log("═══════════════════════════════════════");
  const top10 = [...productPrices].sort((a, b) => b.price - a.price).slice(0, 10);
  top10.forEach((p, i) => {
    console.log(`${i + 1}. ${p.sku} - ${p.name.substring(0, 50)}...`);
    console.log(`   💰 R$ ${p.price.toFixed(2)}`);
    console.log(`   📊 ${((p.price / mean - 1) * 100).toFixed(1)}% acima da média\n`);
  });

  // Mostrar produtos mais baratos
  console.log("═══════════════════════════════════════");
  console.log("💸 TOP 10 PRODUTOS MAIS BARATOS");
  console.log("═══════════════════════════════════════");
  const bottom10 = [...productPrices]
    .sort((a, b) => a.price - b.price)
    .slice(0, 10);
  bottom10.forEach((p, i) => {
    console.log(`${i + 1}. ${p.sku} - ${p.name.substring(0, 50)}...`);
    console.log(`   💰 R$ ${p.price.toFixed(2)}`);
    console.log(`   📊 ${((1 - p.price / mean) * 100).toFixed(1)}% abaixo da média\n`);
  });

  // Mostrar outliers extremos (acima de 2 desvios padrão)
  if (highOutliers.length > 0) {
    console.log("═══════════════════════════════════════");
    console.log(`⚠️  OUTLIERS ALTOS (${highOutliers.length} produtos)`);
    console.log("   (Mais de 2 desvios padrão acima da média)");
    console.log("═══════════════════════════════════════");
    highOutliers.slice(0, 5).forEach((p) => {
      console.log(`🔴 ${p.sku} - ${p.name.substring(0, 50)}...`);
      console.log(`   💰 R$ ${p.price.toFixed(2)}`);
      console.log(`   📊 ${((p.price / mean - 1) * 100).toFixed(1)}% acima da média\n`);
    });
  }

  if (lowOutliers.length > 0) {
    console.log("═══════════════════════════════════════");
    console.log(`⚠️  OUTLIERS BAIXOS (${lowOutliers.length} produtos)`);
    console.log("   (Mais de 2 desvios padrão abaixo da média)");
    console.log("═══════════════════════════════════════");
    lowOutliers.slice(0, 5).forEach((p) => {
      console.log(`🔴 ${p.sku} - ${p.name.substring(0, 50)}...`);
      console.log(`   💰 R$ ${p.price.toFixed(2)}`);
      console.log(`   📊 ${((1 - p.price / mean) * 100).toFixed(1)}% abaixo da média\n`);
    });
  }

  // Distribuição de preços por faixa
  console.log("═══════════════════════════════════════");
  console.log("📈 DISTRIBUIÇÃO DE PREÇOS");
  console.log("═══════════════════════════════════════");
  const ranges = [
    { min: 0, max: 50000, label: "Até R$ 50.000" },
    { min: 50000, max: 75000, label: "R$ 50.000 - R$ 75.000" },
    { min: 75000, max: 85000, label: "R$ 75.000 - R$ 85.000" },
    { min: 85000, max: 95000, label: "R$ 85.000 - R$ 95.000" },
    { min: 95000, max: 100000, label: "R$ 95.000 - R$ 100.000" },
    { min: 100000, max: Infinity, label: "Acima de R$ 100.000" },
  ];

  ranges.forEach((range) => {
    const count = prices.filter((p) => p >= range.min && p < range.max).length;
    const percentage = ((count / prices.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.floor(parseFloat(percentage) / 2));
    console.log(`${range.label.padEnd(30)} ${count.toString().padStart(4)} (${percentage}%) ${bar}`);
  });

  console.log("\n✅ Análise concluída!");
}

analyzePrices().catch((error) => {
  console.error("❌ Erro na análise:", error);
  process.exit(1);
});
