'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

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
  logoPosition: 'center',
  useLogoOnly: false
};

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Moderna)' },
  { value: 'Arial', label: 'Arial (Clássica)' },
  { value: 'Times New Roman', label: 'Times New Roman (Serifada)' },
  { value: 'Courier New', label: 'Courier New (Mono)' },
  { value: 'Georgia', label: 'Georgia (Elegante)' },
  { value: 'Verdana', label: 'Verdana (Legível)' },
  { value: 'Impact', label: 'Impact (Bold)' },
];

export default function WatermarkSettingsPage() {
  const [settings, setSettings] = useState<WatermarkSettings>(DEFAULT_SETTINGS);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [customPreviewImage, setCustomPreviewImage] = useState<string | null>(null);
  const [useCustomPreview, setUseCustomPreview] = useState(false);

  // Carregar configurações salvas
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/watermark-settings');
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const response = await fetch('/api/watermark-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        setSaveMessage('✅ Configurações salvas com sucesso!');
      } else {
        setSaveMessage('❌ Erro ao salvar configurações');
      }
    } catch (error) {
      console.error('Erro ao salvar:', error);
      setSaveMessage('❌ Erro ao salvar configurações');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const generatePreview = async () => {
    setIsLoadingPreview(true);
    setPreviewError(null);

    try {
      const response = await fetch('/api/watermark-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          customImage: useCustomPreview ? customPreviewImage : null
        })
      });

      if (response.ok) {
        const data = await response.json();
        setPreviewImage(data.previewImage);
      } else {
        const error = await response.json();
        setPreviewError(error.error || 'Erro ao gerar preview');
      }
    } catch (error) {
      console.error('Erro ao gerar preview:', error);
      setPreviewError('Erro de conexão ao gerar preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleCustomPreviewUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida');
      return;
    }

    // Converter para base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setCustomPreviewImage(base64);
      setUseCustomPreview(true);
      setPreviewImage(null); // Limpar preview anterior
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida (PNG recomendado para transparência)');
      return;
    }

    // Converter para base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setSettings({ ...settings, logoUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const resetToDefaults = () => {
    if (confirm('Deseja restaurar as configurações padrão?')) {
      setSettings(DEFAULT_SETTINGS);
      setPreviewImage(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            💧 Configurações de Marca d&apos;Água
          </h1>
          <p className="text-gray-600">
            Personalize a marca d&apos;água que será aplicada nas imagens editadas
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Painel de Configurações */}
          <div className="space-y-6">
            {/* Ativar/Desativar */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Marca d&apos;Água Ativada
                  </h3>
                  <p className="text-sm text-gray-600">
                    Ativar/desativar marca d&apos;água em todas as imagens
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-14 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>

            {/* Modo de Marca d'Água */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Modo de Marca d&apos;Água</h3>

              <div className="space-y-3">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={!settings.useLogoOnly}
                    onChange={() => setSettings({ ...settings, useLogoOnly: false })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">📝 Texto (ou Texto + Logo)</span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={settings.useLogoOnly || false}
                    onChange={() => setSettings({ ...settings, useLogoOnly: true })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-gray-700">🖼️ Apenas Logo</span>
                </label>
              </div>
            </div>

            {/* Configurações de Texto */}
            {!settings.useLogoOnly && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Configurações de Texto</h3>

                {/* Texto */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Texto da Marca d&apos;Água
                  </label>
                  <textarea
                    value={settings.text}
                    onChange={(e) => setSettings({ ...settings, text: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Use \n para quebra de linha"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Dica: Use \n para criar múltiplas linhas
                  </p>
                </div>

                {/* Fonte */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fonte
                  </label>
                  <select
                    value={settings.fontFamily}
                    onChange={(e) => setSettings({ ...settings, fontFamily: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tamanho da Fonte */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tamanho da Fonte: {settings.fontSize}px
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="120"
                    value={settings.fontSize}
                    onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>20px</span>
                    <span>120px</span>
                  </div>
                </div>

                {/* Cor do Texto */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cor do Texto
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={settings.fontColor}
                      onChange={(e) => setSettings({ ...settings, fontColor: e.target.value })}
                      className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={settings.fontColor}
                      onChange={(e) => setSettings({ ...settings, fontColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="#FFFFFF"
                    />
                  </div>
                </div>

                {/* Opacidade do Texto */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Opacidade do Texto: {Math.round(settings.opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.opacity * 100}
                    onChange={(e) => setSettings({ ...settings, opacity: Number(e.target.value) / 100 })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0% (invisível)</span>
                    <span>100% (opaco)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Upload de Logo */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Logo/Imagem</h3>

              {/* Upload Button */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload de Logo (PNG recomendado)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use PNG com fundo transparente para melhores resultados
                </p>
              </div>

              {/* Logo Preview */}
              {settings.logoUrl && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview do Logo
                  </label>
                  <div className="relative w-32 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                    <img
                      src={settings.logoUrl}
                      alt="Logo preview"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, logoUrl: undefined })}
                    className="text-sm text-red-600 hover:text-red-700 mt-2"
                  >
                    🗑️ Remover logo
                  </button>
                </div>
              )}

              {/* Logo Size */}
              {settings.logoUrl && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tamanho do Logo: {settings.logoSize}px
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="500"
                      value={settings.logoSize || 150}
                      onChange={(e) => setSettings({ ...settings, logoSize: Number(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>50px</span>
                      <span>500px</span>
                    </div>
                  </div>

                  {/* Logo Opacity */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Opacidade do Logo: {Math.round((settings.logoOpacity || 0.5) * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={(settings.logoOpacity || 0.5) * 100}
                      onChange={(e) => setSettings({ ...settings, logoOpacity: Number(e.target.value) / 100 })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Logo Position */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Posição do Logo
                    </label>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'top-left' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'top-left'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ↖️ Sup. Esq.
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'top-center' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'top-center'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ⬆️ Sup. Centro
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'top-right' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'top-right'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ↗️ Sup. Dir.
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'bottom-left' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'bottom-left'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ↙️ Inf. Esq.
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'center' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          (settings.logoPosition === 'center' || !settings.logoPosition)
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        🎯 Centro
                      </button>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'bottom-right' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'bottom-right'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ↘️ Inf. Dir.
                      </button>
                      <div></div>
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, logoPosition: 'bottom-center' })}
                        className={`p-2 text-xs border-2 rounded-lg transition-all ${
                          settings.logoPosition === 'bottom-center'
                            ? 'border-blue-600 bg-blue-50 text-blue-700'
                            : 'border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        ⬇️ Inf. Centro
                      </button>
                    </div>

                    {/* Custom Position Button */}
                    <button
                      type="button"
                      onClick={() => setSettings({
                        ...settings,
                        logoPosition: 'custom',
                        logoCustomX: settings.logoCustomX ?? 50,
                        logoCustomY: settings.logoCustomY ?? 50
                      })}
                      className={`w-full p-3 text-sm border-2 rounded-lg transition-all font-medium ${
                        settings.logoPosition === 'custom'
                          ? 'border-purple-600 bg-purple-50 text-purple-700'
                          : 'border-gray-300 hover:border-purple-400'
                      }`}
                    >
                      🎯 Posição Personalizada
                    </button>

                    {/* Custom X/Y Coordinate Controls */}
                    {settings.logoPosition === 'custom' && (
                      <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <p className="text-sm text-purple-800 mb-3 font-medium">
                          Ajuste a posição do logo na imagem:
                        </p>

                        {/* X Coordinate */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-purple-900 mb-2">
                            Posição Horizontal (X): {settings.logoCustomX ?? 50}%
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.logoCustomX ?? 50}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoCustomX: Number(e.target.value)
                            })}
                            className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                          />
                          <div className="flex justify-between text-xs text-purple-600 mt-1">
                            <span>← Esquerda (0%)</span>
                            <span>Direita (100%) →</span>
                          </div>
                        </div>

                        {/* Y Coordinate */}
                        <div>
                          <label className="block text-sm font-medium text-purple-900 mb-2">
                            Posição Vertical (Y): {settings.logoCustomY ?? 50}%
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.logoCustomY ?? 50}
                            onChange={(e) => setSettings({
                              ...settings,
                              logoCustomY: Number(e.target.value)
                            })}
                            className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                          />
                          <div className="flex justify-between text-xs text-purple-600 mt-1">
                            <span>↑ Topo (0%)</span>
                            <span>Fundo (100%) ↓</span>
                          </div>
                        </div>

                        <div className="mt-3 p-2 bg-white rounded border border-purple-300">
                          <p className="text-xs text-purple-700">
                            💡 <strong>Dica:</strong> 0% é o canto superior esquerdo, 100% é o canto inferior direito.
                            Use 50% em ambos para centralizar.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Posição do Texto */}
            {!settings.useLogoOnly && (
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Posição do Texto</h3>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'top-left' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'top-left'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ↖️ Sup. Esq.
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'top-center' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'top-center'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ⬆️ Sup. Centro
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'top-right' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'top-right'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ↗️ Sup. Dir.
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'bottom-left' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'bottom-left'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ↙️ Inf. Esq.
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'center' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'center'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  🎯 Centro
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'bottom-right' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'bottom-right'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ↘️ Inf. Dir.
                </button>
                <div></div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, position: 'bottom-center' })}
                  className={`p-2 text-sm border-2 rounded-lg transition-all ${
                    settings.position === 'bottom-center'
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-blue-400'
                  }`}
                >
                  ⬇️ Inf. Centro
                </button>
              </div>
            </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-3">
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isSaving ? '💾 Salvando...' : '💾 Salvar Configurações'}
              </button>

              <button
                onClick={resetToDefaults}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              >
                🔄 Restaurar Padrão
              </button>
            </div>

            {saveMessage && (
              <div className={`p-4 rounded-lg ${
                saveMessage.includes('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {saveMessage}
              </div>
            )}
          </div>

          {/* Painel de Preview */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 sticky top-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview da Marca d&apos;Água</h3>

              {/* Upload de Imagem Customizada */}
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  🖼️ Imagem para Preview
                </label>

                <div className="flex items-center gap-2 mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!useCustomPreview}
                      onChange={() => {
                        setUseCustomPreview(false);
                        setPreviewImage(null);
                      }}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Usar imagem padrão (sneaker)</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={useCustomPreview}
                      onChange={() => setUseCustomPreview(true)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Usar minha imagem</span>
                  </label>
                </div>

                {useCustomPreview && (
                  <div className="mt-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleCustomPreviewUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                    />
                    {customPreviewImage && (
                      <div className="mt-3">
                        <p className="text-xs text-green-600 mb-2">✅ Imagem carregada com sucesso!</p>
                        <div className="relative w-full h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                          <img
                            src={customPreviewImage}
                            alt="Preview customizado"
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <button
                          onClick={() => {
                            setCustomPreviewImage(null);
                            setUseCustomPreview(false);
                            setPreviewImage(null);
                          }}
                          className="text-sm text-red-600 hover:text-red-700 mt-2"
                        >
                          🗑️ Remover imagem
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={generatePreview}
                disabled={isLoadingPreview || (useCustomPreview && !customPreviewImage)}
                className="w-full bg-green-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed mb-4"
              >
                {isLoadingPreview ? '⏳ Gerando Preview...' : '👁️ Gerar Preview'}
              </button>

              <div className="relative bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 min-h-[400px] flex items-center justify-center">
                {isLoadingPreview ? (
                  <div className="text-center text-gray-500 p-8">
                    <div className="animate-spin text-6xl mb-4">⏳</div>
                    <p className="text-lg mb-2 font-semibold">Gerando Preview...</p>
                    <p className="text-sm">Baixando imagem de exemplo e aplicando marca d&apos;água</p>
                  </div>
                ) : previewError ? (
                  <div className="text-center text-red-500 p-8">
                    <p className="text-6xl mb-4">❌</p>
                    <p className="text-lg mb-2 font-semibold">Erro ao Gerar Preview</p>
                    <p className="text-sm mb-4">{previewError}</p>
                    <button
                      onClick={generatePreview}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      🔄 Tentar Novamente
                    </button>
                  </div>
                ) : previewImage ? (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="max-w-full max-h-[500px] object-contain rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="text-center text-gray-500 p-8">
                    <p className="text-6xl mb-4">👟</p>
                    <p className="text-lg mb-2 font-semibold">📸 Nenhum preview ainda</p>
                    <p className="text-sm mb-4">Clique em &quot;Gerar Preview&quot; para ver como a marca d&apos;água vai ficar</p>
                    <p className="text-xs text-gray-400">Preview usa uma imagem real de sneaker do Unsplash</p>
                  </div>
                )}
              </div>

              <div className="mt-4 text-sm text-gray-600">
                <p className="font-medium mb-2">ℹ️ Informações:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Preview usa uma imagem de exemplo</li>
                  <li>Marca d&apos;água será aplicada em todas as imagens editadas</li>
                  <li>Você pode ajustar as configurações e gerar novo preview</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
