/**
 * 🎨 PROCESS DUPLICATES - Alta Fidelidade com Vision AI + Qwen Prime
 *
 * Processa duplicatas com:
 * 1. Gemini Vision para detectar logos
 * 2. Qwen Image Edit para remoção com MÁXIMA FIDELIDADE
 * 3. Mudanças MÍNIMAS e ESPECÍFICAS
 *
 * Baseado em: SHOPIFY_ANTI_DETECTION.md e QWEN_PRIME_GUIDE.md
 *
 * Uso:
 *   npx tsx scripts/process-duplicates-high-fidelity.ts
 */

import fs from 'fs/promises';
import path from 'path';
import { detectBrandsWithGemini } from '@/services/detection.service';
import { editWithBrandRemoval } from '@/services/qwen-edit.service';

const DUPLICATES_DIR = 'debug/all-duplicates';
const EDITED_DIR = 'debug/all-duplicates/editado';

interface ProcessResult {
  filename: string;
  brands_detected: string[];
  has_logos: boolean;
  edited: boolean;
  error?: string;
}

async function processDuplicates(): Promise<void> {
  console.log('🎨 PROCESSAMENTO COM ALTA FIDELIDADE - Vision AI + Qwen Prime\n');
  console.log('📋 Estratégia: MÁXIMA FIDELIDADE com mudanças MÍNIMAS e ESPECÍFICAS\n');

  // 1. Criar pasta editado
  console.log('📂 Criando pasta: debug/all-duplicates/editado');
  await fs.mkdir(EDITED_DIR, { recursive: true });

  // 2. Ler duplicatas
  const files = await fs.readdir(DUPLICATES_DIR);
  const imageFiles = files.filter(f =>
    (f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('editado')
  );

  console.log(`\n📁 Total de duplicatas: ${imageFiles.length}`);
  console.log('\n' + '='.repeat(80) + '\n');

  const results: ProcessResult[] = [];

  // 3. Processar cada imagem
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const filePath = path.join(DUPLICATES_DIR, file);

    console.log(`[${i + 1}/${imageFiles.length}] Processando: ${file}`);
    console.log('─'.repeat(80));

    try {
      // 3.1. Ler imagem e converter para base64
      const imageBuffer = await fs.readFile(filePath);
      const imageBase64 = imageBuffer.toString('base64');

      // 3.2. Detectar logos com Gemini Vision
      console.log('   🔍 [1/3] Detectando logos com Gemini Vision...');

      const detection = await detectBrandsWithGemini(imageBase64);

      console.log(`   📊 Marcas detectadas: ${detection.brands.length > 0 ? detection.brands.join(', ') : 'Nenhuma'}`);
      console.log(`   📈 Risk Score: ${detection.riskScore}`);

      if (detection.brands.length === 0 || detection.riskScore < 40) {
        console.log('   ✅ Imagem limpa - não precisa editar');

        // Copiar original para pasta editado
        const destPath = path.join(EDITED_DIR, file);
        await fs.copyFile(filePath, destPath);

        results.push({
          filename: file,
          brands_detected: [],
          has_logos: false,
          edited: false
        });

        console.log('   💾 Original copiado para: editado/\n');
        continue;
      }

      // 3.3. Aplicar Qwen Image Edit (MÁXIMA FIDELIDADE)
      console.log('   ✨ [2/3] Removendo logos com Qwen Prime (alta fidelidade)...');
      console.log('   🎯 Estratégia: Mantém textura, cores e estrutura originais');
      console.log('   🎯 Remove APENAS elementos de marca sem deformar\n');

      const editedBase64 = await editWithBrandRemoval(
        imageBase64,
        detection.brands,
        'sneaker' // Categoria padrão
      );

      // 3.4. Salvar imagem editada
      console.log('   💾 [3/3] Salvando resultado...');

      const editedBuffer = Buffer.from(
        editedBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64'
      );

      const destPath = path.join(EDITED_DIR, file);
      await fs.writeFile(destPath, editedBuffer);

      results.push({
        filename: file,
        brands_detected: detection.brands,
        has_logos: true,
        edited: true
      });

      console.log(`   ✅ Editado e salvo em: editado/${file}`);
      console.log('   🎉 Edição com alta fidelidade concluída!\n');

    } catch (error) {
      console.error(`   ❌ Erro ao processar: ${error}`);

      results.push({
        filename: file,
        brands_detected: [],
        has_logos: false,
        edited: false,
        error: error instanceof Error ? error.message : String(error)
      });

      console.log('');
    }
  }

  // 4. Resumo final
  console.log('='.repeat(80));
  console.log('📊 RESUMO DO PROCESSAMENTO\n');

  const cleanImages = results.filter(r => !r.has_logos);
  const editedImages = results.filter(r => r.edited);
  const failedImages = results.filter(r => r.error);

  console.log(`   ✅ Imagens limpas (sem logos): ${cleanImages.length}`);
  console.log(`   ✨ Imagens editadas (logos removidos): ${editedImages.length}`);
  console.log(`   ❌ Erros: ${failedImages.length}`);
  console.log(`   📁 Total processado: ${results.length}`);

  if (editedImages.length > 0) {
    console.log('\n📋 IMAGENS EDITADAS:');
    editedImages.forEach(r => {
      console.log(`   ✨ ${r.filename}`);
      console.log(`      Marcas removidas: ${r.brands_detected.join(', ')}`);
    });
  }

  if (failedImages.length > 0) {
    console.log('\n⚠️  ERROS:');
    failedImages.forEach(r => {
      console.log(`   ❌ ${r.filename}: ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ PROCESSAMENTO CONCLUÍDO!');
  console.log('─'.repeat(80));
  console.log(`   📁 Resultados salvos em: debug/all-duplicates/editado/`);
  console.log('─'.repeat(80));

  console.log('\n📋 PRÓXIMOS PASSOS:');
  console.log('   1. Revisar imagens em debug/all-duplicates/editado/');
  console.log('   2. Comparar com originais para validar fidelidade');
  console.log('   3. Aprovar ou solicitar nova edição\n');

  // 5. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    total_processed: results.length,
    clean_images: cleanImages.length,
    edited_images: editedImages.length,
    failed_images: failedImages.length,
    results: results
  };

  await fs.writeFile(
    'debug/all-duplicates/processing-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('📄 Relatório detalhado: debug/all-duplicates/processing-report.json\n');
}

// Execute
processDuplicates().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
