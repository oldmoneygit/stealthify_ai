'use client';

import { useState, useEffect } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { BeforeAfter } from '@/components/BeforeAfter';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import type { Product, AnalysisResult } from '@/lib/types';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);

  // Load products on mount
  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const response = await fetch('/api/products');
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Failed to fetch products:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAnalyze(productId: number) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setSelectedProduct(product);
    setIsAnalyzing(true);
    setCurrentPhase(1);
    setAnalysis(null);

    try {
      // Simulate phase progression
      const phaseIntervals = [
        { phase: 2, delay: 500 },   // Title → Detection
        { phase: 3, delay: 3000 },  // Detection → Segmentation
        { phase: 4, delay: 3000 },  // Segmentation → Inpainting
        { phase: 5, delay: 8000 },  // Inpainting → Verification
        { phase: 6, delay: 3000 }   // Verification → Done
      ];

      // Start phase progression
      phaseIntervals.forEach(({ phase, delay }) => {
        setTimeout(() => {
          setCurrentPhase(phase);
        }, delay);
      });

      // Call API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });

      const data = await response.json();

      if (data.success) {
        setAnalysis(data.result);
        setCurrentPhase(6);
      } else {
        throw new Error(data.message || 'Analysis failed');
      }

    } catch (error) {
      console.error('Analysis failed:', error);
      alert('Falha na análise. Verifique o console.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleImport() {
    if (!selectedProduct || !analysis) return;

    setIsImporting(true);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct.id
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Produto importado para Shopify!\nID: ${data.shopifyProduct.id}`);
      } else {
        throw new Error(data.message || 'Import failed');
      }

    } catch (error) {
      console.error('Import failed:', error);
      alert('Falha ao importar. Verifique o console.');
    } finally {
      setIsImporting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-600">Carregando produtos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🎨 Brand Camouflage System
          </h1>
          <p className="text-gray-600">
            {products.length} produtos sincronizados do WooCommerce
          </p>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Products Grid */}
          <div className="lg:col-span-2">
            {products.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-600 mb-4">
                  Nenhum produto encontrado.
                </p>
                <p className="text-sm text-gray-500">
                  Execute: <code className="bg-gray-100 px-2 py-1 rounded">pnpm test:woo</code>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAnalyze={handleAnalyze}
                    isAnalyzing={isAnalyzing && selectedProduct?.id === product.id}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Analysis Panel */}
          <div className="space-y-6">
            {isAnalyzing && currentPhase > 0 && (
              <AnalysisProgress currentPhase={currentPhase} />
            )}

            {selectedProduct && analysis && !isAnalyzing && (
              <BeforeAfter
                product={selectedProduct}
                analysis={analysis}
                onImport={handleImport}
                isImporting={isImporting}
              />
            )}

            {!selectedProduct && !isAnalyzing && (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                <p className="text-4xl mb-4">🎯</p>
                <p>Selecione um produto para analisar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
