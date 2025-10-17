'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';

interface SyncedProduct {
  product_id: string;
  original_image: string | null;
  edited_image: string | null;
  edited_filepath: string | null;
  directory: string | null;
}

export default function BlurReviewPage() {
  const [products, setProducts] = useState<SyncedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<SyncedProduct | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [reprocessResult, setReprocessResult] = useState<any>(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceSuccess, setReplaceSuccess] = useState(false);
  const [manualEditing, setManualEditing] = useState(false);
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualEditResult, setManualEditResult] = useState<any>(null);
  const [manualEditHistory, setManualEditHistory] = useState<any[]>([]);
  const [showManualEditor, setShowManualEditor] = useState(false);
  const [applyingWatermark, setApplyingWatermark] = useState(false);
  const [watermarkResult, setWatermarkResult] = useState<any>(null);

  // Seleção múltipla para batch reprocessing
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [batchReprocessing, setBatchReprocessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<any>(null);

  useEffect(() => {
    syncOriginals();
  }, []);

  const syncOriginals = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching synchronized products...');

      const response = await fetch('/api/sync-originals');
      const data = await response.json();

      if (data.success) {
        console.log('✅ Synced products:', data);
        // Filter to only show products that have BOTH original and edited
        const productsWithBoth = data.products.filter(
          (p: SyncedProduct) => p.original_image && p.edited_image
        );
        setProducts(productsWithBoth);
      }
    } catch (error) {
      console.error('❌ Error syncing originals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReprocess = async () => {
    if (!selectedProduct || !selectedProduct.original_image) return;

    try {
      setReprocessing(true);
      setReprocessResult(null);
      setReplaceSuccess(false);

      // Extract original filename from URL
      const originalFilename = selectedProduct.original_image.split('/').pop();

      console.log('🔄 Starting reprocess with ORIGINAL:', {
        product_id: selectedProduct.product_id,
        original_filename: originalFilename
      });

      const response = await fetch('/api/reprocess-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          original_filename: originalFilename
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Reprocess successful:', result);
        setReprocessResult(result);
      } else {
        console.error('❌ Reprocess failed:', result.error);
        alert(`Erro ao reprocessar: ${result.error}`);
      }
    } catch (error: any) {
      console.error('❌ Error during reprocess:', error);
      alert(`Erro ao reprocessar: ${error.message}`);
    } finally {
      setReprocessing(false);
    }
  };

  const handleReplace = async () => {
    if (!selectedProduct || !reprocessResult) return;

    try {
      setReplacing(true);

      // Extract filename from edited_image URL (remove query parameters like ?t=...)
      const editedImageUrl = selectedProduct.edited_image || '';
      const editedFilename = editedImageUrl.split('/').pop()?.split('?')[0];

      console.log('🔄 Replacing old edited image with reprocessed version:', {
        product_id: selectedProduct.product_id,
        reprocessed_filename: reprocessResult.reprocessed_filename,
        original_directory: selectedProduct.directory,
        original_filename: editedFilename
      });

      const response = await fetch('/api/replace-edited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          reprocessed_filename: reprocessResult.reprocessed_filename,
          original_directory: selectedProduct.directory,
          original_filename: editedFilename
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Replace successful:', result);
        setReplaceSuccess(true);

        // Update the selected product to show the new edited image
        // Add cache buster to force reload
        const updatedEditedImage = `${selectedProduct.edited_image}?t=${Date.now()}`;

        setSelectedProduct({
          ...selectedProduct,
          edited_image: updatedEditedImage
        });

        // Update in the products list too
        setProducts(products.map(p =>
          p.product_id === selectedProduct.product_id
            ? { ...p, edited_image: updatedEditedImage }
            : p
        ));

        alert('✅ Imagem substituída com sucesso! A versão reeditada agora é a oficial na coluna do meio.');
      } else {
        console.error('❌ Replace failed:', result.error);
        alert(`Erro ao substituir: ${result.error}`);
      }
    } catch (error: any) {
      console.error('❌ Error during replace:', error);
      alert(`Erro ao substituir: ${error.message}`);
    } finally {
      setReplacing(false);
    }
  };

  // Toggle de seleção de produto individual
  const toggleProductSelection = (productId: string) => {
    const newSelected = new Set(selectedProductIds);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProductIds(newSelected);
  };

  // Selecionar/desselecionar todos
  const toggleSelectAll = () => {
    if (selectedProductIds.size === products.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(products.map(p => p.product_id)));
    }
  };

  // Batch reprocess automático
  const handleBatchReprocess = async () => {
    if (selectedProductIds.size === 0) {
      alert('Selecione pelo menos um produto para reeditar.');
      return;
    }

    const confirmed = confirm(
      `🚀 Reeditar ${selectedProductIds.size} produto(s) automaticamente?\n\n` +
      `Os produtos selecionados serão reeditados usando suas imagens originais.\n` +
      `As novas imagens substituirão as antigas automaticamente.\n\n` +
      `Deseja continuar?`
    );

    if (!confirmed) return;

    try {
      setBatchReprocessing(true);
      setBatchProgress(null);

      const selectedProducts = products.filter(p => selectedProductIds.has(p.product_id));
      let processed = 0;
      let success = 0;
      let errors = 0;
      const results: any[] = [];

      console.log(`🔄 Iniciando batch reprocess de ${selectedProducts.length} produtos...`);

      for (const product of selectedProducts) {
        processed++;
        console.log(`\n🔄 [${processed}/${selectedProducts.length}] Processando: ${product.product_id}`);

        try {
          // 1. Reprocessar a imagem usando a original
          const originalFilename = product.original_image?.split('/').pop();

          const reprocessResponse = await fetch('/api/reprocess-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: product.product_id,
              original_filename: originalFilename
            })
          });

          const reprocessResult = await reprocessResponse.json();

          if (!reprocessResult.success) {
            throw new Error(reprocessResult.error || 'Reprocess failed');
          }

          console.log(`   ✅ Reprocessado: ${reprocessResult.reprocessed_filename}`);

          // 2. Substituir automaticamente
          const editedFilename = product.edited_image?.split('/').pop()?.split('?')[0];

          const replaceResponse = await fetch('/api/replace-edited', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: product.product_id,
              reprocessed_filename: reprocessResult.reprocessed_filename,
              original_directory: product.directory,
              original_filename: editedFilename
            })
          });

          const replaceResult = await replaceResponse.json();

          if (!replaceResult.success) {
            throw new Error(replaceResult.error || 'Replace failed');
          }

          console.log(`   ✅ Substituída: ${replaceResult.replaced_file}`);

          success++;
          results.push({
            product_id: product.product_id,
            success: true,
            blur_score: reprocessResult.blur_score,
            message: reprocessResult.message
          });

        } catch (error: any) {
          console.error(`   ❌ Erro no produto ${product.product_id}:`, error.message);
          errors++;
          results.push({
            product_id: product.product_id,
            success: false,
            error: error.message
          });
        }

        // Update progress
        setBatchProgress({
          total: selectedProducts.length,
          processed,
          success,
          errors,
          results
        });

        // Small delay to avoid overwhelming server
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log(`\n🎉 Batch reprocess concluído!`);
      console.log(`   ✅ Sucesso: ${success}`);
      console.log(`   ❌ Erros: ${errors}`);

      alert(
        `✅ Batch Reprocessing Concluído!\n\n` +
        `✔️ Sucesso: ${success}\n` +
        `❌ Erros: ${errors}\n\n` +
        `As imagens foram automaticamente substituídas no banco de dados.`
      );

      // Reload products para mostrar as imagens atualizadas
      await syncOriginals();

      // Limpar seleção
      setSelectedProductIds(new Set());

    } catch (error: any) {
      console.error('❌ Error during batch reprocess:', error);
      alert(`Erro no batch reprocessing: ${error.message}`);
    } finally {
      setBatchReprocessing(false);
    }
  };

  const handleApplyWatermarkBatch = async () => {
    const confirmed = confirm(
      `🚀 Aplicar marca d'água em TODAS as imagens editadas?\n\n` +
      `As imagens com marca d'água serão salvas em: debug/watermarked/\n\n` +
      `O processamento será feito em batches de 10 imagens. Deseja continuar?`
    );

    if (!confirmed) return;

    try {
      setApplyingWatermark(true);
      setWatermarkResult(null);

      console.log('💧 Iniciando aplicação de marca d\'água em lote...');

      // Use configurações padrão da marca d'água
      const watermarkSettings = {
        text: '© IMAGEM PROTEGIDA\nDIREITOS AUTORAIS RESERVADOS',
        opacity: 0.4,
        fontSize: 48,
        fontColor: '#FFFFFF',
        position: 'center' as const
      };

      let offset = 0;
      let totalProcessed = 0;
      let totalSuccess = 0;
      let totalErrors = 0;
      let hasMore = true;

      // Processar em batches até terminar
      while (hasMore) {
        console.log(`💧 Processando batch com offset ${offset}...`);

        const response = await fetch('/api/apply-watermark-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            watermark_settings: watermarkSettings,
            batch_size: 10,
            offset: offset
          })
        });

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error);
        }

        totalProcessed += result.batch_processed;
        totalSuccess += result.batch_success;
        totalErrors += result.batch_errors;

        console.log(`✅ Batch completo: ${totalProcessed}/${result.total_images} processadas`);

        // Update UI temporariamente
        setWatermarkResult({
          processed_so_far: totalProcessed,
          total_images: result.total_images,
          success_count: totalSuccess,
          error_count: totalErrors,
          message: `Processando: ${totalProcessed}/${result.total_images}...`
        });

        hasMore = result.has_more;
        offset = result.next_offset || 0;

        // Small delay to prevent overwhelming the server
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Final result
      const finalResult = {
        success: true,
        message: `Marca d'água aplicada em ${totalSuccess} de ${totalProcessed} imagens`,
        total_images: totalProcessed,
        success_count: totalSuccess,
        error_count: totalErrors,
        output_directory: 'debug\\watermarked'
      };

      console.log('✅ Watermark batch COMPLETO:', finalResult);
      setWatermarkResult(finalResult);
      alert(
        `✅ Processamento completo!\n\n` +
        `✔️ Sucesso: ${totalSuccess}\n` +
        `❌ Erros: ${totalErrors}\n` +
        `📁 Salvo em: debug\\watermarked`
      );

    } catch (error: any) {
      console.error('❌ Error during watermark batch:', error);
      alert(`Erro ao aplicar marca d'água: ${error.message}`);
    } finally {
      setApplyingWatermark(false);
    }
  };

  const handleManualEdit = async (sourceImageUrl: string) => {
    if (!selectedProduct || !manualPrompt.trim()) {
      alert('Por favor, escreva um prompt para editar a imagem.');
      return;
    }

    try {
      setManualEditing(true);

      console.log('✏️ Starting manual edit:', {
        product_id: selectedProduct.product_id,
        source_image: sourceImageUrl,
        prompt: manualPrompt
      });

      const response = await fetch('/api/manual-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: selectedProduct.product_id,
          image_url: sourceImageUrl,
          custom_prompt: manualPrompt
        })
      });

      const result = await response.json();

      if (result.success) {
        console.log('✅ Manual edit successful:', result);
        setManualEditResult(result);

        // Add to history
        setManualEditHistory([...manualEditHistory, {
          ...result,
          timestamp: new Date().toISOString(),
          source_image: sourceImageUrl
        }]);

        // Clear prompt
        setManualPrompt('');
      } else {
        console.error('❌ Manual edit failed:', result.error);
        alert(`Erro na edição manual: ${result.error}`);
      }
    } catch (error: any) {
      console.error('❌ Error during manual edit:', error);
      alert(`Erro na edição manual: ${error.message}`);
    } finally {
      setManualEditing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Sincronizando imagens originais...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                🔄 Revisão de Edições com Originais
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Produtos sincronizados com imagem original para reedição
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">
                {products.length}
              </div>
              <div className="text-sm text-gray-500">
                Produtos Sincronizados
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-4 space-y-3">
            {/* Row 1: Basic actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={syncOriginals}
                disabled={loading}
                className="bg-green-500 hover:bg-green-600 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                🔄 Recarregar Sincronização
              </button>

              <button
                onClick={handleApplyWatermarkBatch}
                disabled={applyingWatermark || products.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {applyingWatermark ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Aplicando Marca D&apos;água...
                  </>
                ) : (
                  <>
                    💧 Aplicar Marca D&apos;água em Todas ({products.length})
                  </>
                )}
              </button>

              <button
                onClick={() => window.location.href = '/title-editor'}
                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors"
              >
                ✏️ Editor de Títulos
              </button>
            </div>

            {/* Row 2: Batch selection controls */}
            <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={toggleSelectAll}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
                >
                  {selectedProductIds.size === products.length ? '❌ Desselecionar Todos' : '✅ Selecionar Todos'}
                </button>

                <span className="text-sm font-medium text-gray-700">
                  {selectedProductIds.size} de {products.length} selecionados
                </span>
              </div>

              <button
                onClick={handleBatchReprocess}
                disabled={batchReprocessing || selectedProductIds.size === 0}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold py-2 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
              >
                {batchReprocessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Reeditando {selectedProductIds.size} produto(s)...
                  </>
                ) : (
                  <>
                    🚀 Reeditar Selecionados ({selectedProductIds.size})
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Batch Reprocess Progress */}
          {batchProgress && (
            <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-500">
              <h3 className="font-bold text-purple-800 mb-2">
                🚀 Reeditando produtos em lote...
              </h3>
              <div className="text-sm text-purple-700 space-y-2">
                <div>
                  <p className="mb-2">
                    Progresso: <strong>{batchProgress.processed}/{batchProgress.total}</strong>
                  </p>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                    <div
                      className="bg-purple-600 h-3 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round((batchProgress.processed / batchProgress.total) * 100)}%`
                      }}
                    ></div>
                  </div>
                </div>
                <p>✅ <strong>{batchProgress.success}</strong> produtos reeditados com sucesso</p>
                {batchProgress.errors > 0 && (
                  <p>❌ <strong>{batchProgress.errors}</strong> erros</p>
                )}
              </div>
            </div>
          )}

          {/* Watermark Result */}
          {watermarkResult && (
            <div className={`mt-4 p-4 rounded-lg ${
              watermarkResult.processed_so_far < watermarkResult.total_images
                ? 'bg-blue-50 border-2 border-blue-500'
                : 'bg-green-50 border-2 border-green-500'
            }`}>
              <h3 className={`font-bold mb-2 ${
                watermarkResult.processed_so_far < watermarkResult.total_images
                  ? 'text-blue-800'
                  : 'text-green-800'
              }`}>
                {watermarkResult.processed_so_far < watermarkResult.total_images ? '💧 Processando...' : '✅ Concluído!'}
              </h3>
              <div className={`text-sm space-y-1 ${
                watermarkResult.processed_so_far < watermarkResult.total_images
                  ? 'text-blue-700'
                  : 'text-green-700'
              }`}>
                {watermarkResult.message && (
                  <p className="font-semibold">{watermarkResult.message}</p>
                )}
                {watermarkResult.total_images && (
                  <div>
                    <p className="mb-2">
                      Progresso: <strong>{watermarkResult.processed_so_far || 0}/{watermarkResult.total_images}</strong>
                    </p>
                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(((watermarkResult.processed_so_far || 0) / watermarkResult.total_images) * 100)}%`
                        }}
                      ></div>
                    </div>
                  </div>
                )}
                <p>✔️ <strong>{watermarkResult.success_count || 0}</strong> imagens processadas com sucesso</p>
                {(watermarkResult.error_count > 0) && (
                  <p>❌ <strong>{watermarkResult.error_count}</strong> erros</p>
                )}
                {watermarkResult.output_directory && (
                  <p>📁 Salvo em: <code className="bg-white px-2 py-1 rounded text-xs">{watermarkResult.output_directory}</code></p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {products.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500 mb-4">Nenhum produto sincronizado encontrado.</p>
            <p className="text-sm text-gray-400">
              Certifique-se de que existem imagens em debug/Originais e debug/qwen
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => {
              const isSelected = selectedProductIds.has(product.product_id);

              return (
                <div
                  key={product.product_id}
                  className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-all cursor-pointer ${
                    isSelected ? 'ring-4 ring-purple-500 ring-offset-2' : ''
                  }`}
                  onClick={() => setSelectedProduct(product)}
                >
                  {/* Edited Image Preview */}
                  <div className="aspect-square relative bg-gray-100">
                    {product.edited_image ? (
                      <img
                        src={product.edited_image}
                        alt={`Product ${product.product_id}`}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        Sem imagem editada
                      </div>
                    )}

                    {/* Checkbox for selection */}
                    <div
                      className="absolute top-2 left-2 z-10"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleProductSelection(product.product_id);
                      }}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg border-3 flex items-center justify-center cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-purple-600 border-purple-700'
                            : 'bg-white border-gray-300 hover:bg-gray-100'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Product ID Badge */}
                    <div className="absolute top-2 right-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
                      ID: {product.product_id}
                    </div>

                    {/* Original Available Badge */}
                    {product.original_image && (
                      <div className="absolute bottom-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                        ✅ Original
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="p-4">
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Produto ID:</span> {product.product_id}
                    </p>
                    <p className="text-xs text-gray-500 mb-3">
                      <span className="font-medium">Dir:</span> {product.directory}
                    </p>

                    <button
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProduct(product);
                      }}
                    >
                      Ver Comparação
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal - Comparison View */}
      {selectedProduct && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedProduct(null);
            setReprocessResult(null);
          }}
        >
          <div
            className="bg-white rounded-lg max-w-7xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Produto ID: {selectedProduct.product_id}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Diretório: {selectedProduct.directory}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedProduct(null);
                  setReprocessResult(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Side by Side Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Original Image */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    📸 Original (WooCommerce)
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      Base para reedição
                    </span>
                  </h3>
                  <div className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden border-2 border-green-500">
                    {selectedProduct.original_image ? (
                      <img
                        src={selectedProduct.original_image}
                        alt="Original"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        Sem imagem original
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 text-center">
                    {selectedProduct.original_image}
                  </div>
                </div>

                {/* Edited Image */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    🌫️ Editada (Com Blur Anterior)
                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
                      Precisa reeditar
                    </span>
                  </h3>
                  <div className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden border-2 border-orange-500">
                    {selectedProduct.edited_image ? (
                      <img
                        src={selectedProduct.edited_image}
                        alt="Editada"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        Sem imagem editada
                      </div>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 text-center break-all">
                    {selectedProduct.edited_filepath}
                  </div>
                </div>
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-800">
                  💡 <strong>Como funciona:</strong> O botão "Reprocessar" usará a <strong>imagem original</strong> (esquerda)
                  como base para criar uma nova edição, potencialmente com menos blur que a versão anterior (direita).
                </p>
              </div>

              {/* Reprocess Result */}
              {reprocessResult && (
                <div className={`mb-6 p-4 rounded-lg ${
                  reprocessResult.blur_score < 50 ? 'bg-green-50 border-2 border-green-500' :
                  reprocessResult.blur_score < 80 ? 'bg-yellow-50 border-2 border-yellow-500' :
                  'bg-orange-50 border-2 border-orange-500'
                }`}>
                  <h3 className="font-bold text-lg mb-3">
                    {reprocessResult.blur_score < 50 ? '✅ Reedição Bem-Sucedida!' :
                     reprocessResult.blur_score < 80 ? '⚠️ Reedição com Blur Moderado' :
                     '🔴 Ainda com Blur Alto'}
                  </h3>

                  <div className="space-y-2 text-sm mb-4">
                    <p>
                      <span className="font-medium">Blur Score:</span>{' '}
                      <span className={`font-bold text-lg ${
                        reprocessResult.blur_score < 50 ? 'text-green-600' :
                        reprocessResult.blur_score < 80 ? 'text-yellow-600' :
                        'text-orange-600'
                      }`}>
                        {reprocessResult.blur_score}/100
                      </span>
                    </p>
                    <p>
                      <span className="font-medium">Sharpness:</span>{' '}
                      {reprocessResult.sharpness_score.toFixed(2)}
                    </p>
                    <p>
                      <span className="font-medium">Status:</span>{' '}
                      {reprocessResult.needed_blur
                        ? `Blur aplicado em ${reprocessResult.blur_regions_count} região(s)`
                        : '✅ Imagem completamente limpa!'}
                    </p>
                    <p className="text-xs text-gray-600 italic">
                      {reprocessResult.message}
                    </p>
                  </div>

                  {/* Show reprocessed image */}
                  <div>
                    <h4 className="font-semibold mb-2">🎨 Imagem Reeditada:</h4>
                    <div className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden max-w-md border-4 border-green-500">
                      <img
                        src={reprocessResult.reprocessed_url}
                        alt="Reeditada"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Success Badge */}
                    {replaceSuccess && (
                      <div className="mt-3 p-3 bg-green-100 border-2 border-green-500 rounded-lg text-center">
                        <p className="text-green-800 font-bold">
                          ✅ Imagem substituída com sucesso!
                        </p>
                        <p className="text-sm text-green-700 mt-1">
                          Esta versão agora é a oficial no diretório original.
                        </p>
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          const link = document.createElement('a');
                          link.href = reprocessResult.reprocessed_url;
                          link.download = reprocessResult.reprocessed_filename;
                          link.click();
                        }}
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                        disabled={replacing}
                      >
                        ⬇️ Download Reeditada
                      </button>

                      <button
                        onClick={handleReplace}
                        disabled={replacing || replaceSuccess}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {replacing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Substituindo...
                          </>
                        ) : replaceSuccess ? (
                          <>✅ Substituída!</>
                        ) : (
                          <>🔄 Usar Esta Versão</>
                        )}
                      </button>
                    </div>

                    {!replaceSuccess && (
                      <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-800">
                          💡 <strong>Importante:</strong> Ao clicar em "Usar Esta Versão", a imagem reeditada
                          substituirá a versão antiga no diretório original. Um backup da versão antiga será criado automaticamente.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Manual Editor Section */}
              <div className="mt-8 border-t pt-6">
                <button
                  onClick={() => setShowManualEditor(!showManualEditor)}
                  className="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  ✏️ {showManualEditor ? 'Esconder' : 'Mostrar'} Editor Manual
                </button>

                {showManualEditor && (
                  <div className="mt-4 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-lg">
                    <h3 className="text-xl font-bold text-indigo-900 mb-4">
                      ✏️ Editor Manual com Prompt Personalizado
                    </h3>

                    <div className="bg-white p-4 rounded-lg mb-4">
                      <p className="text-sm text-gray-700 mb-3">
                        <strong>💡 Como usar:</strong> Escolha qual imagem você quer editar (Original, Editada ou Reeditada)
                        e escreva um prompt descrevendo exatamente o que você quer que o Qwen Edit faça.
                      </p>

                      <p className="text-xs text-gray-600 mb-2">
                        <strong>Exemplos de prompts:</strong>
                      </p>
                      <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 mb-3">
                        <li>"Remove apenas o logo da lateral do tênis, mantendo o restante intacto"</li>
                        <li>"Aplica blur apenas na região do logo Nike no canto superior direito"</li>
                        <li>"Remove todo texto visível da imagem sem alterar as cores"</li>
                        <li>"Suaviza a área com marcas sem deixar tão borrada"</li>
                      </ul>
                    </div>

                    {/* Image Selection */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Selecione a imagem base para editar:
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        <button
                          onClick={() => handleManualEdit(selectedProduct.original_image!)}
                          disabled={manualEditing || !manualPrompt.trim() || !selectedProduct.original_image}
                          className="p-3 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          📸 Editar Original
                        </button>

                        <button
                          onClick={() => handleManualEdit(selectedProduct.edited_image!)}
                          disabled={manualEditing || !manualPrompt.trim() || !selectedProduct.edited_image}
                          className="p-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🌫️ Editar Versão com Blur
                        </button>

                        <button
                          onClick={() => reprocessResult && handleManualEdit(reprocessResult.reprocessed_url)}
                          disabled={manualEditing || !manualPrompt.trim() || !reprocessResult}
                          className="p-3 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          🎨 Editar Reeditada
                        </button>
                      </div>
                    </div>

                    {/* Prompt Input */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prompt Personalizado:
                      </label>
                      <textarea
                        value={manualPrompt}
                        onChange={(e) => setManualPrompt(e.target.value)}
                        placeholder="Ex: Remove apenas o logo Nike da lateral do tênis, mantendo o restante intacto e preservando as cores originais..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        rows={4}
                        disabled={manualEditing}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        {manualPrompt.length} caracteres
                      </p>
                    </div>

                    {/* Status */}
                    {manualEditing && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <p className="text-blue-800 font-medium">
                          Editando imagem com Qwen... (~10-15 segundos)
                        </p>
                      </div>
                    )}

                    {/* Manual Edit Result */}
                    {manualEditResult && (
                      <div className="mt-4 p-4 bg-white border-2 border-indigo-500 rounded-lg">
                        <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                          ✅ Edição Manual Concluída!
                          {!manualEditResult.has_brands && (
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                              Limpa
                            </span>
                          )}
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                          <div>
                            <span className="font-medium">Blur Score:</span>{' '}
                            <span className={`font-bold ${
                              manualEditResult.blur_score < 50 ? 'text-green-600' :
                              manualEditResult.blur_score < 80 ? 'text-yellow-600' :
                              'text-red-600'
                            }`}>
                              {manualEditResult.blur_score}/100
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Logos detectados:</span>{' '}
                            <span className={manualEditResult.logos_detected === 0 ? 'text-green-600' : 'text-red-600'}>
                              {manualEditResult.logos_detected}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium">Sharpness:</span>{' '}
                            {manualEditResult.sharpness_score.toFixed(2)}
                          </div>
                          <div>
                            <span className="font-medium">Textos detectados:</span>{' '}
                            <span className={manualEditResult.texts_detected === 0 ? 'text-green-600' : 'text-red-600'}>
                              {manualEditResult.texts_detected}
                            </span>
                          </div>
                        </div>

                        <div className="mb-3">
                          <p className="text-xs text-gray-600 italic bg-gray-50 p-2 rounded">
                            <strong>Prompt usado:</strong> {manualEditResult.custom_prompt}
                          </p>
                        </div>

                        <div className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden max-w-md border-4 border-indigo-500">
                          <img
                            src={manualEditResult.manual_url}
                            alt="Manual Edit"
                            className="w-full h-full object-contain"
                          />
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => {
                              const link = document.createElement('a');
                              link.href = manualEditResult.manual_url;
                              link.download = manualEditResult.manual_filename;
                              link.click();
                            }}
                            className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                          >
                            ⬇️ Download
                          </button>

                          <button
                            onClick={() => {
                              // Use this as base for next manual edit
                              setManualPrompt('');
                            }}
                            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                          >
                            🔄 Editar Novamente
                          </button>
                        </div>
                      </div>
                    )}

                    {/* History */}
                    {manualEditHistory.length > 0 && (
                      <div className="mt-4 p-4 bg-white border border-gray-200 rounded-lg">
                        <h4 className="font-semibold mb-3">📜 Histórico de Edições Manuais ({manualEditHistory.length})</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {manualEditHistory.map((edit, idx) => (
                            <div key={idx} className="p-2 bg-gray-50 rounded text-xs">
                              <p className="font-medium">#{idx + 1} - {new Date(edit.timestamp).toLocaleTimeString('pt-BR')}</p>
                              <p className="text-gray-600 truncate">{edit.custom_prompt}</p>
                              <p className={`font-bold ${edit.blur_score < 50 ? 'text-green-600' : 'text-orange-600'}`}>
                                Blur: {edit.blur_score}/100
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    if (selectedProduct.original_image) {
                      const link = document.createElement('a');
                      link.href = selectedProduct.original_image;
                      link.download = `${selectedProduct.product_id}-original.jpg`;
                      link.click();
                    }
                  }}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white font-medium py-3 px-4 rounded transition-colors disabled:opacity-50"
                  disabled={!selectedProduct.original_image || reprocessing}
                >
                  📥 Download Original
                </button>

                <button
                  onClick={() => {
                    if (selectedProduct.edited_image) {
                      const link = document.createElement('a');
                      link.href = selectedProduct.edited_image;
                      link.download = `${selectedProduct.product_id}-edited-old.jpg`;
                      link.click();
                    }
                  }}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded transition-colors disabled:opacity-50"
                  disabled={!selectedProduct.edited_image || reprocessing}
                >
                  📥 Download Editada Anterior
                </button>

                <button
                  onClick={handleReprocess}
                  disabled={reprocessing || !selectedProduct.original_image}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {reprocessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Reprocessando...
                    </>
                  ) : (
                    <>
                      🔄 Reeditar com Original
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
