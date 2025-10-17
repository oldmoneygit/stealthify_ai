import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { addCustomizableWatermark } from '@/services/watermark.service';

interface BatchWatermarkRequest {
  watermark_settings: {
    text?: string;
    opacity?: number;
    fontSize?: number;
    fontColor?: string;
    position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
    logoUrl?: string;
    logoOpacity?: number;
    logoSize?: number;
  };
  batch_size?: number; // Número de imagens a processar por vez (padrão: 10)
  offset?: number; // Índice de início (padrão: 0)
}

/**
 * Aplica marca d'água em lote de imagens editadas
 * Processa um número limitado de imagens por vez para evitar timeout
 *
 * USAGE:
 * - POST sem offset: processa primeiras 10 imagens
 * - POST com offset=10: processa imagens 11-20
 * - Continue até processar todas
 */
export async function POST(request: NextRequest) {
  console.log('💧 [Batch Watermark] ========== INÍCIO ==========');

  try {
    console.log('💧 [Batch Watermark] Parseando request body...');
    const body: BatchWatermarkRequest = await request.json();

    const {
      watermark_settings,
      batch_size = 10, // Padrão: 10 imagens por vez
      offset = 0
    } = body;

    console.log('💧 [Batch Watermark] Configurações:');
    console.log(`   Watermark: ${JSON.stringify(watermark_settings)}`);
    console.log(`   Batch size: ${batch_size}`);
    console.log(`   Offset: ${offset}`);

    const qwenDir = path.join(process.cwd(), 'debug', 'qwen');
    const watermarkedDir = path.join(process.cwd(), 'debug', 'watermarked');

    // Criar diretório de saída se não existir
    if (!fs.existsSync(watermarkedDir)) {
      fs.mkdirSync(watermarkedDir, { recursive: true });
    }

    if (!fs.existsSync(qwenDir)) {
      return NextResponse.json({
        success: false,
        error: 'Diretório de imagens editadas não encontrado'
      }, { status: 404 });
    }

    // Coletar todas as imagens editadas
    console.log('📂 [Batch Watermark] Coletando lista de imagens...');
    const allImages: Array<{ directory: string; filename: string; fullPath: string }> = [];

    const subdirs = fs.readdirSync(qwenDir)
      .filter(f => fs.statSync(path.join(qwenDir, f)).isDirectory());

    for (const subdir of subdirs) {
      const subdirPath = path.join(qwenDir, subdir);
      const files = fs.readdirSync(subdirPath)
        .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
        .filter(f => !f.includes('-old-backup')); // Skip backups

      files.forEach(filename => {
        allImages.push({
          directory: subdir,
          filename,
          fullPath: path.join(subdirPath, filename)
        });
      });
    }

    const totalImages = allImages.length;
    console.log(`📂 [Batch Watermark] Total de imagens encontradas: ${totalImages}`);

    // Selecionar apenas o batch atual
    const imagesToProcess = allImages.slice(offset, offset + batch_size);
    const remaining = Math.max(0, totalImages - (offset + batch_size));

    console.log(`💧 [Batch Watermark] Processando batch: ${offset + 1}-${offset + imagesToProcess.length} de ${totalImages}`);
    console.log(`   Imagens neste batch: ${imagesToProcess.length}`);
    console.log(`   Restantes após este batch: ${remaining}`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Processar cada imagem do batch atual
    for (let i = 0; i < imagesToProcess.length; i++) {
      const image = imagesToProcess[i];
      if (!image) continue;

      const globalIndex = offset + i;
      const progress = Math.round(((globalIndex + 1) / totalImages) * 100);

      try {
        console.log(`💧 [${globalIndex + 1}/${totalImages}] Processando: ${image.filename} (${progress}%)`);

        // Ler imagem
        const imageBuffer = fs.readFileSync(image.fullPath);
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        // Aplicar marca d'água
        const watermarkedBase64 = await addCustomizableWatermark(imageBase64, watermark_settings);

        // Salvar imagem com marca d'água
        const watermarkedBuffer = Buffer.from(
          watermarkedBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );

        // Criar subdiretório se necessário
        const outputSubdir = path.join(watermarkedDir, image.directory);
        if (!fs.existsSync(outputSubdir)) {
          fs.mkdirSync(outputSubdir, { recursive: true });
        }

        const outputPath = path.join(outputSubdir, image.filename);
        fs.writeFileSync(outputPath, watermarkedBuffer);

        console.log(`   ✅ Salva: ${path.relative(process.cwd(), outputPath)}`);

        results.push({
          filename: image.filename,
          directory: image.directory,
          success: true,
          output_path: path.relative(process.cwd(), outputPath)
        });

        successCount++;

      } catch (error: any) {
        console.error(`   ❌ Erro ao processar ${image.filename}:`, error.message);

        results.push({
          filename: image.filename,
          directory: image.directory,
          success: false,
          error: error.message
        });

        errorCount++;
      }
    }

    const hasMore = remaining > 0;
    const nextOffset = hasMore ? offset + batch_size : null;

    console.log(`\n✅ [Batch Watermark] Batch completo!`);
    console.log(`   ✅ Sucesso: ${successCount}`);
    console.log(`   ❌ Erros: ${errorCount}`);
    console.log(`   📁 Saída: ${watermarkedDir}`);
    console.log(`   🔄 Mais batches? ${hasMore ? 'SIM (offset=' + nextOffset + ')' : 'NÃO (CONCLUÍDO)'}`);

    return NextResponse.json({
      success: true,
      message: `Marca d'água aplicada em ${successCount} de ${imagesToProcess.length} imagens`,
      batch_processed: imagesToProcess.length,
      batch_success: successCount,
      batch_errors: errorCount,
      total_images: totalImages,
      processed_so_far: offset + imagesToProcess.length,
      remaining: remaining,
      has_more: hasMore,
      next_offset: nextOffset,
      output_directory: watermarkedDir,
      results
    });

  } catch (error: any) {
    console.error('❌ [Batch Watermark] Erro:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Batch watermark failed'
    }, { status: 500 });
  }
}
