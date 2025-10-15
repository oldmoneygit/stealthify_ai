'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Product } from '@/lib/types';

interface ProductCardProps {
  product: Product;
  onAnalyze?: (productId: number) => void;
  isAnalyzing?: boolean;
  analysisStatus?: 'clean' | 'blur_applied' | 'failed' | null;
}

export function ProductCard({
  product,
  onAnalyze,
  isAnalyzing = false,
  analysisStatus = null
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false);

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

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4">
      {/* Image */}
      <div className="relative aspect-square mb-3 bg-gray-100 rounded-md overflow-hidden">
        {!imageError ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            🖼️ Imagem indisponível
          </div>
        )}

        {/* Status Badge */}
        {analysisStatus && (
          <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium ${statusColors[analysisStatus]}`}>
            {statusLabels[analysisStatus]}
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="space-y-2">
        <h3 className="font-semibold text-gray-900 line-clamp-2 min-h-[3rem]">
          {product.name}
        </h3>

        <div className="flex items-center justify-between text-sm text-gray-600">
          <span className="font-mono">{product.sku}</span>
          <span className="font-bold text-gray-900">
            R$ {product.price.toFixed(2)}
          </span>
        </div>

        {/* Action Button */}
        {onAnalyze && (
          <button
            onClick={() => onAnalyze(product.id)}
            disabled={isAnalyzing}
            className={`
              w-full py-2 px-4 rounded-md font-medium text-sm
              transition-colors
              ${isAnalyzing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                Analisando...
              </span>
            ) : (
              '🔍 Analisar Produto'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
