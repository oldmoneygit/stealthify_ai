'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Product, AnalysisResult } from '@/lib/types';

interface BeforeAfterProps {
  product: Product;
  analysis: AnalysisResult;
  onImport?: () => void;
  isImporting?: boolean;
}

export function BeforeAfter({
  product,
  analysis,
  onImport,
  isImporting = false
}: BeforeAfterProps) {
  const [activeTab, setActiveTab] = useState<'before' | 'after'>('before');

  const statusColors = {
    clean: 'bg-green-100 text-green-800 border-green-200',
    blur_applied: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    failed: 'bg-red-100 text-red-800 border-red-200'
  };

  const statusIcons = {
    clean: '✅',
    blur_applied: '⚠️',
    failed: '❌'
  };

  const statusLabels = {
    clean: 'Limpo - Todas as marcas removidas',
    blur_applied: 'Blur Aplicado - Algumas marcas persistentes',
    failed: 'Falha - Erro no processamento'
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Comparação Antes/Depois
        </h2>
        <p className="text-gray-600">
          SKU: <span className="font-mono">{product.sku}</span>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('before')}
          className={`
            px-4 py-2 font-medium transition-colors
            ${activeTab === 'before'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          📸 Original
        </button>
        <button
          onClick={() => setActiveTab('after')}
          className={`
            px-4 py-2 font-medium transition-colors
            ${activeTab === 'after'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
        >
          ✨ Editado
        </button>
      </div>

      {/* Image Display */}
      <div className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
        {activeTab === 'before' ? (
          <Image
            src={product.image_url}
            alt="Original"
            fill
            className="object-contain"
          />
        ) : (
          <img
            src={analysis.image}
            alt="Editado"
            className="w-full h-full object-contain"
          />
        )}
      </div>

      {/* Title Comparison */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">
            Título Original
          </p>
          <p className="text-gray-900">{product.name}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">
            Título Camuflado
          </p>
          <p className="text-gray-900 font-semibold">{analysis.title}</p>
        </div>
      </div>

      {/* Analysis Details */}
      <div className={`
        border rounded-lg p-4 space-y-3
        ${statusColors[analysis.status]}
      `}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">
            {statusIcons[analysis.status]}
          </span>
          <div className="flex-1">
            <p className="font-semibold mb-1">
              {statusLabels[analysis.status]}
            </p>

            {analysis.brands_detected.length > 0 && (
              <p className="text-sm">
                <strong>Marcas detectadas:</strong>{' '}
                {analysis.brands_detected.join(', ')}
              </p>
            )}

            <p className="text-sm">
              <strong>Risk Score:</strong> {analysis.risk_score}
            </p>

            {analysis.error && (
              <p className="text-sm mt-2 text-red-700">
                <strong>Erro:</strong> {analysis.error}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Import Button */}
      {onImport && analysis.status !== 'failed' && (
        <button
          onClick={onImport}
          disabled={isImporting}
          className={`
            w-full py-3 px-6 rounded-lg font-semibold text-white
            transition-colors
            ${isImporting
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700'
            }
          `}
        >
          {isImporting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Importando para Shopify...
            </span>
          ) : (
            '🛍️ Importar para Shopify'
          )}
        </button>
      )}
    </div>
  );
}
