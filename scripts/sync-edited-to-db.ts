/**
 * 🔄 SYNC EDITED TO DB - Sincronizar produtos editados com banco de dados
 *
 * Atualiza o DB com as imagens editadas da pasta debug/edited/
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import { db } from '@/lib/db';

const EDITED_DIR = 'debug/edited';

interface ProductRecord {
  id: number;
  woo_product_id: number;
  sku: string;
  name: string;
  price: number;
  image_url: string;
}

async function fileToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/**
 * Extrai o woo_product_id do nome do arquivo
 * Formato: "25899-Nike-Air-Jordan-1-High-Bred-Banned-2016.jpg" -> 25899
 */
function extractProductIdFromFilename(filename: string): number {
  const match = filename.match(/^(\d+)-/);
  if (!match) {
    throw new Error(`Cannot extract product ID from filename: ${filename}`);
  }
  return parseInt(match[1], 10);
}

async function syncEditedToDB(): Promise<void> {
  console.log('🔄 SYNC EDITED TO DB\n');
  console.log('📁 Lendo produtos editados de: debug/edited/\n');
  console.log('='.repeat(80) + '\n');

  // Ler todos os arquivos JPG de edited/
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f => f.toLowerCase().endsWith('.jpg'));

  console.log(`📊 Total de imagens editadas: ${imageFiles.length}\n`);
  console.log('🔄 Sincronizando com banco de dados...\n');
  console.log('='.repeat(80) + '\n');

  let updatedCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const imagePath = path.join(EDITED_DIR, filename);

    console.log(`[${i + 1}/${imageFiles.length}] 📦 ${filename}`);

    try {
      // Extrair woo_product_id do nome do arquivo
      const wooProductId = extractProductIdFromFilename(filename);

      // Buscar produto no DB
      const product = db.prepare(`
        SELECT id, woo_product_id, sku, name, price, image_url
        FROM products
        WHERE woo_product_id = ?
      `).get(wooProductId) as ProductRecord | undefined;

      if (!product) {
        console.log(`   ⚠️  Produto ${wooProductId} não encontrado no DB`);
        notFoundCount++;
        continue;
      }

      // Converter imagem para base64
      const editedImageBase64 = await fileToBase64(imagePath);

      // Verificar se já existe análise para este produto
      const existingAnalysis = db.prepare(`
        SELECT id FROM analyses
        WHERE product_id = ?
        ORDER BY analyzed_at DESC
        LIMIT 1
      `).get(product.id) as { id: number } | undefined;

      if (existingAnalysis) {
        // Atualizar análise existente
        db.prepare(`
          UPDATE analyses
          SET edited_image_base64 = ?,
              status = 'clean',
              analyzed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(editedImageBase64, existingAnalysis.id);

        console.log(`   ✅ Atualizado - SKU: ${product.sku}`);
      } else {
        // Criar nova análise
        db.prepare(`
          INSERT INTO analyses (
            product_id,
            original_title,
            camouflaged_title,
            original_image_url,
            edited_image_base64,
            brands_detected,
            risk_score,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          product.id,
          product.name,
          product.name, // Usar mesmo título por enquanto
          product.image_url,
          editedImageBase64,
          JSON.stringify([]), // Sem marcas detectadas
          0, // Risk score 0 (limpo)
          'clean'
        );

        console.log(`   ✅ Criado - SKU: ${product.sku}`);
      }

      updatedCount++;

    } catch (error) {
      console.error(`   ❌ Erro: ${error}`);
      errorCount++;
    }
  }

  // Resumo
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESUMO DA SINCRONIZAÇÃO\n');
  console.log(`   Total processado: ${imageFiles.length}`);
  console.log(`   ✅ Atualizados/Criados: ${updatedCount}`);
  console.log(`   ⚠️  Não encontrados: ${notFoundCount}`);
  console.log(`   ❌ Erros: ${errorCount}`);
  console.log('\n' + '='.repeat(80));
  console.log('✅ SINCRONIZAÇÃO CONCLUÍDA!\n');

  // Verificar total no DB
  const totalAnalyses = db.prepare('SELECT COUNT(*) as count FROM analyses').get() as { count: number };
  console.log(`📊 Total de análises no DB: ${totalAnalyses.count}`);
  console.log('='.repeat(80));
}

syncEditedToDB().catch(console.error);
