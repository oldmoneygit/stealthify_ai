import { NextRequest, NextResponse } from 'next/server';
import * as watermarkService from '@/services/watermark.service';
import { urlToBase64 } from '@/utils/image-converter';

// URL de imagem de exemplo de um sneaker (use imagem pública)
const SAMPLE_IMAGE_URL = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&h=800&fit=crop';

interface WatermarkSettings {
  enabled: boolean;
  text: string;
  opacity: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'custom';
  customX?: number;
  customY?: number;
  logoUrl?: string;
  logoOpacity?: number;
  logoSize?: number;
  logoPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'custom';
  logoCustomX?: number;
  logoCustomY?: number;
  useLogoOnly?: boolean;
  customImage?: string | null; // Imagem customizada do usuário
}

export async function POST(request: NextRequest) {
  try {
    const settings: WatermarkSettings = await request.json();

    console.log('🎨 Gerando preview da marca d\'água...');

    // Determinar qual imagem usar
    let baseImage: string;

    if (settings.customImage) {
      // Usar imagem customizada do usuário
      console.log('🖼️ Usando imagem customizada do usuário...');
      baseImage = settings.customImage;
    } else {
      // Baixar imagem de exemplo padrão
      console.log('📥 Baixando imagem de exemplo padrão...');
      const sampleImageBase64 = await urlToBase64(SAMPLE_IMAGE_URL);
      baseImage = `data:image/jpeg;base64,${sampleImageBase64}`;
    }

    if (!settings.enabled) {
      return NextResponse.json({
        success: true,
        previewImage: baseImage,
        message: 'Marca d\'água desativada'
      });
    }

    // Aplicar marca d'água customizada
    console.log('💧 Aplicando marca d\'água...');
    const watermarkedImage = await watermarkService.addCustomizableWatermark(
      baseImage,
      settings
    );

    console.log('✅ Preview gerado com sucesso');

    return NextResponse.json({
      success: true,
      previewImage: watermarkedImage
    });
  } catch (error) {
    console.error('❌ Erro ao gerar preview:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao gerar preview' },
      { status: 500 }
    );
  }
}
