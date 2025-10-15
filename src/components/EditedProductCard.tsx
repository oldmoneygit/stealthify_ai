'use client';

import { useState } from 'react';

interface EditedProductCardProps {
  sku: string;
  originalName: string;
  camouflagedName: string;
  price: number;
  originalImage: string;
  editedImage: string;
  localImagePath: string | null;
  brandsDetected: string[];
  riskScore: number;
  status: 'clean' | 'blur_applied' | 'failed';
  analyzedAt: string;
  onImportToShopify?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function EditedProductCard({
  sku,
  originalName,
  camouflagedName,
  price,
  originalImage,
  editedImage,
  localImagePath,
  brandsDetected,
  riskScore,
  status,
  analyzedAt,
  onImportToShopify,
  onDelete
}: EditedProductCardProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleImport = async () => {
    if (!onImportToShopify) return;
    setIsImporting(true);
    try {
      await onImportToShopify();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Erro ao importar para Shopify');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    const confirmed = window.confirm(
      `Tem certeza que deseja deletar a análise do produto "${camouflagedName}"?\n\nSKU: ${sku}\n\nIsso irá deletar:\n- Registro no banco de dados\n- Imagem editada salva localmente\n\nEsta ação não pode ser desfeita.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDelete();
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Erro ao deletar análise');
    } finally {
      setIsDeleting(false);
    }
  };

  const statusColors = {
    clean: 'bg-green-100 text-green-800',
    blur_applied: 'bg-yellow-100 text-yellow-800',
    failed: 'bg-red-100 text-red-800'
  };

  const statusLabels = {
    clean: '✅ Limpo',
    blur_applied: '⚠️ Blur Aplicado',
    failed: '❌ Falhou'
  };

  // Display image (use base64 from database)
  const displayImage = showOriginal
    ? originalImage
    : editedImage; // Always use base64 from database

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all duration-200">
      {/* Image Comparison */}
      <div className="relative h-64 bg-gray-100">
        {!imageError ? (
          <img
            src={displayImage}
            alt={camouflagedName}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-4xl mb-2">🖼️</div>
              <div className="text-sm">Imagem indisponível</div>
            </div>
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={() => setShowOriginal(!showOriginal)}
          className="absolute top-2 right-2 px-3 py-1.5 bg-black bg-opacity-70 text-white text-xs rounded-full hover:bg-opacity-90 transition-all backdrop-blur-sm"
        >
          {showOriginal ? '👁️ Ver Editada' : '👁️ Ver Original'}
        </button>

        {/* Status Badge */}
        <div className={`absolute top-2 left-2 px-3 py-1 rounded-full text-xs font-medium ${statusColors[status]} backdrop-blur-sm`}>
          {statusLabels[status]}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* SKU */}
        <div className="text-xs text-gray-500 font-mono mb-1 flex items-center justify-between">
          <span>{sku}</span>
          {localImagePath && (
            <span className="text-green-600" title="Salvo localmente">
              💾
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2" title={camouflagedName}>
          {camouflagedName}
        </h3>

        {/* Original Name (smaller) */}
        <p className="text-xs text-gray-500 mb-2 line-clamp-1" title={`Original: ${originalName}`}>
          Original: {originalName}
        </p>

        {/* Price */}
        <div className="text-lg font-bold text-gray-900 mb-3">
          R$ {price.toFixed(2)}
        </div>

        {/* Brands Detected */}
        {brandsDetected.length > 0 && (
          <div className="mb-3">
            <div className="text-xs text-gray-600 mb-1">Marcas removidas:</div>
            <div className="flex flex-wrap gap-1">
              {brandsDetected.map((brand, index) => (
                <span
                  key={index}
                  className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full"
                >
                  {brand}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Risk Score */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">Risk Score:</span>
            <span className={`font-semibold ${riskScore > 40 ? 'text-red-600' : riskScore > 20 ? 'text-yellow-600' : 'text-green-600'}`}>
              {riskScore}/100
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                riskScore > 40 ? 'bg-red-500' : riskScore > 20 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(riskScore, 100)}%` }}
            />
          </div>
        </div>

        {/* Analyzed At */}
        <div className="text-xs text-gray-500 mb-3 flex items-center gap-1">
          <span>⏰</span>
          <span>{new Date(analyzedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onImportToShopify && status === 'clean' && (
            <button
              onClick={handleImport}
              disabled={isImporting || isDeleting}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              {isImporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Importando...
                </>
              ) : (
                <>
                  🛒 Shopify
                </>
              )}
            </button>
          )}

          {onDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting || isImporting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
              title="Deletar análise"
            >
              {isDeleting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Deletando...
                </>
              ) : (
                <>
                  🗑️ Deletar
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
