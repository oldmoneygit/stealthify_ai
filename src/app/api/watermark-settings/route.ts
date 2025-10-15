import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'watermark-settings.json');

interface WatermarkSettings {
  enabled: boolean;
  text: string;
  opacity: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  customX?: number;
  customY?: number;
  logoUrl?: string;
  logoOpacity?: number;
  logoSize?: number;
  logoPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  useLogoOnly?: boolean;
}

const DEFAULT_SETTINGS: WatermarkSettings = {
  enabled: true,
  text: '© IMAGEM PROTEGIDA\nDIREITOS AUTORAIS RESERVADOS',
  opacity: 0.4,
  fontSize: 48,
  fontColor: '#FFFFFF',
  fontFamily: 'Inter',
  position: 'center',
  logoOpacity: 0.5,
  logoSize: 150,
  useLogoOnly: false
};

// GET - Carregar configurações
export async function GET() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(data);
      return NextResponse.json({ success: true, settings });
    } else {
      return NextResponse.json({ success: true, settings: DEFAULT_SETTINGS });
    }
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    return NextResponse.json({ success: true, settings: DEFAULT_SETTINGS });
  }
}

// POST - Salvar configurações
export async function POST(request: NextRequest) {
  try {
    const settings: WatermarkSettings = await request.json();

    // Validação básica
    if (typeof settings.enabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'enabled deve ser boolean' },
        { status: 400 }
      );
    }

    if (settings.opacity < 0 || settings.opacity > 1) {
      return NextResponse.json(
        { success: false, error: 'opacity deve estar entre 0 e 1' },
        { status: 400 }
      );
    }

    // Salvar no arquivo
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');

    console.log('✅ Configurações de marca d\'água salvas com sucesso');

    return NextResponse.json({ success: true, message: 'Configurações salvas' });
  } catch (error) {
    console.error('❌ Erro ao salvar configurações:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao salvar configurações' },
      { status: 500 }
    );
  }
}
