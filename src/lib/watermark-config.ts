/**
 * Watermark Configuration Loader
 * Carrega configurações customizadas de marca d'água do arquivo de settings
 */

import fs from 'fs';
import path from 'path';

const SETTINGS_FILE = path.join(process.cwd(), 'watermark-settings.json');

export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  opacity: number;
  fontSize: number;
  fontColor: string;
  fontFamily: string;
  position: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  logoUrl?: string;
  logoOpacity?: number;
  logoSize?: number;
  logoPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  useLogoOnly?: boolean;
}

const DEFAULT_CONFIG: WatermarkConfig = {
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

/**
 * Carrega configurações de marca d'água
 * Se não houver arquivo de configuração, retorna configurações padrão
 */
export function loadWatermarkConfig(): WatermarkConfig {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const config = JSON.parse(data);
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.warn('⚠️ Erro ao carregar configurações de marca d\'água, usando padrão:', error);
  }

  return DEFAULT_CONFIG;
}

/**
 * Verifica se marca d'água está habilitada
 */
export function isWatermarkEnabled(): boolean {
  const config = loadWatermarkConfig();
  return config.enabled;
}
