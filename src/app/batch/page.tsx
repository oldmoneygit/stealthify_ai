'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  image_url: string;
}

interface AnalysisResult {
  title: string;
  image: string;
  brands_detected: string[];
  risk_score: number;
  status: 'clean' | 'blur_applied' | 'failed';
  error?: string;
}

interface ProcessedProduct {
  product: Product;
  result: AnalysisResult | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export default function BatchProcessingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [processedProducts, setProcessedProducts] = useState<ProcessedProduct[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    clean: 0,
    blurApplied: 0,
    failed: 0,
    skipped: 0
  });

  // Use ref for cancel flag so async function can see updates
  const cancelledRef = useRef(false);

  // Fetch products from database
  const loadProducts = async () => {
    try {
      // Load products
      const productsResponse = await fetch('/api/products');
      const productsData = await productsResponse.json();

      if (!productsData.success) {
        throw new Error('Failed to load products');
      }

      // Load existing analyses
      const analysesResponse = await fetch('/api/analyses');
      const analysesData = await analysesResponse.json();

      console.log('📊 Analyses response:', {
        success: analysesData.success,
        count: analysesData.count,
        totalAnalyses: analysesData.analyses?.length || 0
      });

      const existingAnalyses = new Map();
      if (analysesData.success && analysesData.analyses) {
        analysesData.analyses.forEach((a: any) => {
          // Use analysis data (from getAllAnalyses function)
          if (a.analysis) {
            existingAnalyses.set(a.productId, {
              title: a.analysis.title,
              image: a.analysis.image,
              brands_detected: a.analysis.brands_detected || [],
              risk_score: a.analysis.risk_score,
              status: a.analysis.status
            });
            console.log(`  ✅ Loaded analysis for product ${a.productId}`);
          }
        });
      }

      console.log(`📊 Total analyses loaded: ${existingAnalyses.size}`);

      // Merge products with existing analyses
      const processed = productsData.products.map((p: Product) => {
        const existingResult = existingAnalyses.get(p.id);
        return {
          product: p,
          result: existingResult || null,
          status: existingResult ? 'completed' : 'pending'
        };
      });

      setProducts(productsData.products);
      setProcessedProducts(processed);

      // Calculate initial stats
      const completed = processed.filter((p: ProcessedProduct) => p.status === 'completed').length;
      const clean = processed.filter((p: ProcessedProduct) => p.result?.status === 'clean').length;
      const blurApplied = processed.filter((p: ProcessedProduct) => p.result?.status === 'blur_applied').length;

      setStats({
        total: productsData.products.length,
        completed,
        clean,
        blurApplied,
        failed: 0,
        skipped: 0
      });

      console.log(`✅ ${productsData.products.length} produtos carregados (${completed} já analisados)`);

    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      alert('Erro ao carregar produtos. Verifique o console.');
    }
  };

  // Process single product
  const processSingleProduct = async (product: Product, index: number): Promise<AnalysisResult> => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Análise falhou');
    }

    return data.analysis;
  };

  // Start batch processing
  const startBatchProcessing = async () => {
    if (products.length === 0) {
      alert('Nenhum produto carregado. Clique em &quot;Carregar Produtos&quot; primeiro.');
      return;
    }

    setIsProcessing(true);
    cancelledRef.current = false;
    setCurrentIndex(0);

    const newStats = { ...stats };

    for (let i = 0; i < products.length; i++) {
      // Check if cancelled
      if (cancelledRef.current) {
        console.log('⚠️ Processamento cancelado pelo usuário');
        break;
      }

      const processedProduct = processedProducts[i]!;
      const product = processedProduct.product;

      setCurrentIndex(i);

      // Skip if already analyzed
      if (processedProduct.result && processedProduct.status === 'completed') {
        console.log(`⏭️ Pulando ${product.sku} (já analisado)`);
        newStats.skipped++;
        setStats({ ...newStats });
        continue;
      }

      // Update status to processing
      setProcessedProducts(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i]!, status: 'processing' };
        return updated;
      });

      try {
        // Process product
        const result = await processSingleProduct(product, i);

        // Update result
        setProcessedProducts(prev => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i]!,
            result,
            status: 'completed'
          };
          return updated;
        });

        // Update stats
        newStats.completed++;
        if (result.status === 'clean') newStats.clean++;
        else if (result.status === 'blur_applied') newStats.blurApplied++;
        else if (result.status === 'failed') newStats.failed++;

        setStats({ ...newStats });

      } catch (error) {
        console.error(`Erro ao processar produto ${product.sku}:`, error);

        // Mark as failed
        setProcessedProducts(prev => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i]!,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          return updated;
        });

        newStats.failed++;
        newStats.completed++;
        setStats({ ...newStats });
      }

      // Delay between products (2 seconds)
      if (i < products.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    setIsProcessing(false);

    if (cancelledRef.current) {
      alert(`Processamento cancelado!\n\nProcessados: ${newStats.completed}\n✅ Limpos: ${newStats.clean}\n⚠️ Blur aplicado: ${newStats.blurApplied}\n⏭️ Pulados: ${newStats.skipped}\n❌ Falharam: ${newStats.failed}`);
    } else {
      alert(`Processamento completo!\n\nTotal: ${newStats.total}\n✅ Limpos: ${newStats.clean}\n⚠️ Blur aplicado: ${newStats.blurApplied}\n⏭️ Pulados: ${newStats.skipped}\n❌ Falharam: ${newStats.failed}`);
    }
  };

  // Cancel batch processing
  const cancelProcessing = () => {
    cancelledRef.current = true;
    console.log('🛑 Solicitação de cancelamento enviada...');
  };

  const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🚀 Processamento em Massa
          </h1>
          <p className="text-gray-600">
            Edite todos os produtos automaticamente com visualização em tempo real
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex gap-4">
            <button
              onClick={loadProducts}
              disabled={isProcessing}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              📦 Carregar Produtos
            </button>

            {!isProcessing ? (
              <button
                onClick={startBatchProcessing}
                disabled={products.length === 0}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                ▶️ Iniciar Processamento
              </button>
            ) : (
              <button
                onClick={cancelProcessing}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                🛑 Cancelar Processamento
              </button>
            )}
          </div>

          {products.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              {products.length} produtos carregados
              {stats.completed > 0 && (
                <span className="ml-2 text-green-600 font-medium">
                  ({stats.completed - stats.skipped} já analisados)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {isProcessing && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Progresso: {stats.completed} / {stats.total}</span>
                <span>{percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-4 text-center">
              <div className="bg-blue-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-gray-600">Total</div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-600">{stats.clean}</div>
                <div className="text-sm text-gray-600">✅ Limpos</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-yellow-600">{stats.blurApplied}</div>
                <div className="text-sm text-gray-600">⚠️ Blur</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-600">{stats.skipped}</div>
                <div className="text-sm text-gray-600">⏭️ Pulados</div>
              </div>
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
                <div className="text-sm text-gray-600">❌ Falhas</div>
              </div>
            </div>
          </div>
        )}

        {/* Products Grid */}
        <div className="space-y-4">
          {processedProducts.map((item, index) => (
            <div
              key={item.product.id}
              className={`bg-white rounded-lg shadow-sm p-6 transition-all ${
                item.status === 'processing' ? 'ring-2 ring-blue-500 shadow-lg' : ''
              }`}
            >
              <div className="flex gap-6">
                {/* Product Info */}
                <div className="flex-shrink-0 w-48">
                  <div className="text-sm font-medium text-gray-900 mb-1">
                    {item.product.sku}
                  </div>
                  <div className="text-xs text-gray-500 mb-2 line-clamp-2">
                    {item.product.name}
                  </div>
                  <div className="text-sm font-bold text-gray-900">
                    R$ {item.product.price.toFixed(2)}
                  </div>

                  {/* Status Badge */}
                  <div className="mt-3">
                    {item.status === 'pending' && (
                      <span className="inline-block px-3 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                        ⏸️ Aguardando
                      </span>
                    )}
                    {item.status === 'processing' && (
                      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full animate-pulse">
                        ⚙️ Processando...
                      </span>
                    )}
                    {item.status === 'completed' && item.result && (
                      <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                        item.result.status === 'clean' ? 'bg-green-100 text-green-700' :
                        item.result.status === 'blur_applied' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {item.result.status === 'clean' ? '✅ Limpo' :
                         item.result.status === 'blur_applied' ? '⚠️ Blur Aplicado' :
                         '❌ Falhou'}
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="inline-block px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                        ❌ Erro
                      </span>
                    )}
                  </div>
                </div>

                {/* Images Comparison */}
                <div className="flex-grow grid grid-cols-2 gap-6">
                  {/* Original Image */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-2">ORIGINAL</div>
                    <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img
                        src={item.product.image_url}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                      {item.product.name}
                    </div>
                  </div>

                  {/* Edited Image */}
                  <div>
                    <div className="text-xs font-medium text-gray-600 mb-2">EDITADO</div>
                    <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      {item.result ? (
                        <>
                          <img
                            src={item.result.image}
                            alt="Editado"
                            className="w-full h-full object-contain"
                          />
                          {item.result.brands_detected.length > 0 && (
                            <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
                              {item.result.brands_detected.join(', ')}
                            </div>
                          )}
                        </>
                      ) : item.status === 'processing' ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-2"></div>
                            <div className="text-sm text-gray-600">Editando...</div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                          Aguardando
                        </div>
                      )}
                    </div>
                    {item.result && (
                      <div className="mt-2 text-xs text-gray-500">
                        {item.result.title}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {item.status === 'failed' && item.error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  ❌ Erro: {item.error}
                </div>
              )}
            </div>
          ))}
        </div>

        {processedProducts.length === 0 && !isProcessing && (
          <div className="text-center py-12 text-gray-500">
            Clique em &quot;Carregar Produtos&quot; para começar
          </div>
        )}
      </div>
    </div>
  );
}
