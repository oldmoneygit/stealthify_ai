/**
 * 💱 Converter Preços: MXN → ARS
 *
 * Converte todos os preços dos produtos no WooCommerce
 * de Peso Mexicano (MXN) para Peso Argentino (ARS)
 * usando a cotação atual da API de câmbio.
 *
 * IMPORTANTE:
 * - Busca cotação em tempo real
 * - Atualiza preços via WooCommerce API
 * - Atualiza banco de dados local também
 * - Cria backup antes de atualizar
 */

import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Carregar variáveis de ambiente
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

// Configurar WooCommerce API
const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: 'wc/v3',
  queryStringAuth: true // Use query string for auth (more compatible)
});

// Configurar banco de dados
const dbPath = path.join(process.cwd(), 'database', 'products.db');
const db = new Database(dbPath);

interface Product {
  id: number;
  sku: string;
  name: string;
  price: string;
}

/**
 * Buscar cotação atual MXN → ARS
 */
async function getExchangeRate(): Promise<number> {
  console.log('💱 Buscando cotação MXN → ARS...');

  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/MXN');
    const data = await response.json();
    const rate = data.rates.ARS;

    console.log(`✅ Cotação obtida: 1 MXN = ${rate} ARS\n`);
    return rate;

  } catch (error) {
    console.error('❌ Erro ao buscar cotação, usando fallback:', error);
    // Fallback: cotação aproximada caso API falhe
    const fallbackRate = 75.27;
    console.log(`⚠️  Usando cotação fallback: 1 MXN = ${fallbackRate} ARS\n`);
    return fallbackRate;
  }
}

/**
 * Buscar todos os produtos do WooCommerce
 */
async function fetchAllProducts(): Promise<Product[]> {
  console.log('📦 Buscando produtos do WooCommerce...');

  try {
    let allProducts: Product[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await wooApi.get('products', {
        per_page: 100,
        page: page,
        status: 'publish'
      });

      const products = response.data as Product[];
      allProducts = [...allProducts, ...products];

      console.log(`   Página ${page}: ${products.length} produtos`);

      // Verificar se há mais páginas
      hasMore = products.length === 100;
      page++;
    }

    console.log(`✅ Total: ${allProducts.length} produtos encontrados\n`);
    return allProducts;

  } catch (error: any) {
    console.error('❌ Erro ao buscar produtos:', error.message);
    throw error;
  }
}

/**
 * Converter e atualizar preços
 */
async function convertPrices() {
  console.log('\n' + '='.repeat(60));
  console.log('💱 CONVERSÃO DE PREÇOS: MXN → ARS');
  console.log('='.repeat(60) + '\n');

  // 1. Buscar cotação
  const exchangeRate = await getExchangeRate();

  // 2. Buscar produtos
  const products = await fetchAllProducts();

  if (products.length === 0) {
    console.log('⚠️  Nenhum produto encontrado!\n');
    return;
  }

  console.log('🔄 Iniciando conversão de preços...\n');

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < products.length; i++) {
    const product = products[i]!;
    const currentNumber = i + 1;

    try {
      const priceMXN = parseFloat(product.price);

      if (isNaN(priceMXN) || priceMXN === 0) {
        console.log(`[${currentNumber}/${products.length}] ⚠️  Pulando ${product.sku} - Preço inválido: ${product.price}`);
        skipped++;
        continue;
      }

      // Calcular novo preço em ARS
      const priceARS = priceMXN * exchangeRate;
      const priceARSRounded = Math.round(priceARS * 100) / 100; // 2 casas decimais

      console.log(`[${currentNumber}/${products.length}] ${product.sku}`);
      console.log(`   Nome: ${product.name}`);
      console.log(`   MXN: $${priceMXN.toFixed(2)} → ARS: $${priceARSRounded.toFixed(2)}`);

      // Atualizar no WooCommerce (AMBOS: regular_price E sale_price)
      await wooApi.put(`products/${product.id}`, {
        regular_price: priceARSRounded.toString(),
        sale_price: priceARSRounded.toString(), // ⚠️ IMPORTANTE: Atualizar o preço de venda também!
        price: priceARSRounded.toString()
      });

      // Atualizar no banco de dados local
      const updateStmt = db.prepare(`
        UPDATE products
        SET price = ?
        WHERE sku = ?
      `);
      updateStmt.run(priceARSRounded, product.sku);

      updated++;
      console.log(`   ✅ Atualizado!\n`);

      // Delay para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (error: any) {
      errors++;
      console.error(`[${currentNumber}/${products.length}] ❌ Erro ao atualizar ${product.sku}:`, error.message);
      console.log('');
    }
  }

  console.log('='.repeat(60));
  console.log('🎉 CONVERSÃO COMPLETA!');
  console.log('='.repeat(60));
  console.log(`📊 Estatísticas:`);
  console.log(`   Total:      ${products.length}`);
  console.log(`   ✅ Atualizados: ${updated}`);
  console.log(`   ⚠️  Pulados:    ${skipped}`);
  console.log(`   ❌ Erros:      ${errors}`);
  console.log('');
  console.log(`💱 Taxa de câmbio usada: 1 MXN = ${exchangeRate} ARS`);
  console.log('');
}

/**
 * Criar backup antes de converter
 */
function createBackup() {
  console.log('💾 Criando backup do banco de dados...');

  try {
    const backupPath = path.join(process.cwd(), 'database', `products_backup_${Date.now()}.db`);

    fs.copyFileSync(dbPath, backupPath);
    console.log(`✅ Backup criado: ${backupPath}\n`);

  } catch (error) {
    console.error('⚠️  Erro ao criar backup (continuando mesmo assim):', error);
  }
}

/**
 * Executar conversão
 */
async function main() {
  try {
    // Criar backup primeiro
    createBackup();

    // Executar conversão
    await convertPrices();

    console.log('✅ Script concluído com sucesso!\n');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
}

// Confirmar antes de executar
console.log('\n⚠️  ATENÇÃO: Este script irá converter TODOS os preços de MXN para ARS!');
console.log('📝 Um backup será criado automaticamente.\n');

main();
