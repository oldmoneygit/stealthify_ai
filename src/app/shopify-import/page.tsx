'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';

interface Product {
  product_id: string;
  sku: string;
  original_name: string;
  camouflaged_title: string;
  price: number;
  status: string;
  analyzed_at: string;
}

export default function ShopifyImportPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [stats, setStats] = useState({ total: 0, not_imported: 0, already_imported: 0 });
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentSku: '' });
  const [importResults, setImportResults] = useState<any>(null);

  // Carregar produtos ao montar
  useEffect(() => {
    loadProducts();
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      const response = await fetch('/api/shopify-import?mode=test');
      const data = await response.json();
      setConnectionStatus(data.success ? 'connected' : 'error');
    } catch (error) {
      setConnectionStatus('error');
    }
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading products...');

      const response = await fetch('/api/shopify-import');
      const data = await response.json();

      if (data.success) {
        console.log('✅ Products loaded:', data);
        setProducts(data.products || []);
        setStats({
          total: data.total || 0,
          not_imported: data.not_imported || 0,
          already_imported: data.already_imported || 0
        });
      }
    } catch (error) {
      console.error('❌ Error loading products:', error);
      alert('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    const newSelection = new Set(selectedProducts);
    if (newSelection.has(productId)) {
      newSelection.delete(productId);
    } else {
      newSelection.add(productId);
    }
    setSelectedProducts(newSelection);
  };

  const selectAll = () => {
    setSelectedProducts(new Set(products.map(p => p.product_id)));
  };

  const deselectAll = () => {
    setSelectedProducts(new Set());
  };

  const syncWithShopify = async () => {
    if (!confirm('Sincronizar com Shopify?\n\nIsso irá verificar quais produtos ainda existem na Shopify e remover do DB os que foram deletados.')) {
      return;
    }

    setSyncing(true);
    try {
      console.log('🔄 Starting Shopify sync...');

      const response = await fetch('/api/shopify-import?mode=sync');
      const result = await response.json();

      console.log('✅ Sync complete:', result);

      if (result.success) {
        alert(`✅ Sincronização completa!\n\n` +
          `Produtos sincronizados: ${result.synced || 0}\n` +
          `Produtos removidos do DB: ${result.removed || 0}\n\n` +
          `${result.message}`
        );

        // Recarregar produtos
        await loadProducts();
      } else {
        alert(`❌ Erro na sincronização: ${result.error}`);
      }

    } catch (error: any) {
      console.error('❌ Sync error:', error);
      alert(`❌ Erro ao sincronizar: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const importToShopify = async (mode: 'selected' | 'all' | 'batch', batchSize?: number) => {
    let productIdsToImport: string[] = [];
    let confirmMsg = '';

    if (mode === 'selected') {
      if (selectedProducts.size === 0) {
        alert('Selecione pelo menos um produto');
        return;
      }
      productIdsToImport = Array.from(selectedProducts);
      confirmMsg = `Importar ${selectedProducts.size} produto(s) selecionado(s) para Shopify?`;
    } else if (mode === 'batch' && batchSize) {
      // Pegar os primeiros N produtos
      productIdsToImport = products.slice(0, batchSize).map(p => p.product_id);
      confirmMsg = `Importar primeiros ${productIdsToImport.length} produto(s) para Shopify?`;
    } else if (mode === 'all') {
      productIdsToImport = products.map(p => p.product_id);
      confirmMsg = `Importar TODOS os ${products.length} produtos para Shopify?`;
    }

    if (!confirm(confirmMsg)) {
      return;
    }

    setImporting(true);
    setImportResults(null);
    setImportProgress({ current: 0, total: products.length, currentSku: '' });

    try {
      console.log('🛍️ Starting Shopify import:', { mode, count: productIdsToImport.length });

      const body = {
        mode: 'single',
        product_ids: productIdsToImport
      };

      const response = await fetch('/api/shopify-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      console.log('✅ Import complete:', result);
      setImportResults(result);

      if (result.success) {
        alert(`✅ Importação completa!\n\n` +
          `Total: ${result.total}\n` +
          `Sucesso: ${result.imported}\n` +
          `Falhas: ${result.failed}`
        );

        // Recarregar produtos
        await loadProducts();
        deselectAll();
      } else {
        alert(`❌ Erro na importação: ${result.error}`);
      }

    } catch (error: any) {
      console.error('❌ Import error:', error);
      alert(`❌ Erro ao importar: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                🛍️ Importar para Shopify
              </h1>
              <p className="text-gray-600">
                Importe produtos camuflados para sua loja Shopify (mantém SKU original e preço)
              </p>
            </div>

            {/* Connection Status and Sync Button */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {connectionStatus === 'checking' && (
                  <span className="text-yellow-600">⏳ Verificando conexão...</span>
                )}
                {connectionStatus === 'connected' && (
                  <span className="text-green-600">✅ Conectado à Shopify</span>
                )}
                {connectionStatus === 'error' && (
                  <span className="text-red-600">❌ Erro de conexão</span>
                )}
              </div>

              <button
                onClick={syncWithShopify}
                disabled={syncing || connectionStatus !== 'connected'}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 text-sm transition"
                title="Sincronizar com Shopify para verificar quais produtos ainda existem"
              >
                {syncing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sincronizando...
                  </>
                ) : (
                  <>🔄 Sincronizar</>
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-900">{stats.not_imported}</div>
              <div className="text-sm text-blue-600">Prontos para importar</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-900">{stats.already_imported}</div>
              <div className="text-sm text-green-600">Já importados</div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-600">Total processados</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        {products.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={selectAll}
                  className="px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                >
                  Selecionar Todos
                </button>
                <button
                  onClick={deselectAll}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition"
                >
                  Desmarcar Todos
                </button>
                <span className="text-sm text-gray-500">
                  {selectedProducts.size} selecionado(s)
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                {/* Botão Selecionados */}
                <button
                  onClick={() => importToShopify('selected')}
                  disabled={importing || selectedProducts.size === 0}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition"
                >
                  {importing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Importando...
                    </>
                  ) : (
                    <>🛍️ Importar Selecionados ({selectedProducts.size})</>
                  )}
                </button>

                {/* Separador */}
                <div className="border-l border-gray-300"></div>

                {/* Botões de Lote */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 font-medium">Lotes:</span>
                  <button
                    onClick={() => importToShopify('batch', 10)}
                    disabled={importing || products.length === 0}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                  >
                    10
                  </button>
                  <button
                    onClick={() => importToShopify('batch', 20)}
                    disabled={importing || products.length === 0}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                  >
                    20
                  </button>
                  <button
                    onClick={() => importToShopify('batch', 50)}
                    disabled={importing || products.length === 0}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                  >
                    50
                  </button>
                  <button
                    onClick={() => importToShopify('batch', 100)}
                    disabled={importing || products.length === 0}
                    className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm transition"
                  >
                    100
                  </button>
                </div>

                {/* Separador */}
                <div className="border-l border-gray-300"></div>

                {/* Botão Importar Todos */}
                <button
                  onClick={() => importToShopify('all')}
                  disabled={importing || products.length === 0}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 transition"
                >
                  {importing ? 'Importando...' : `🚀 Importar Todos (${products.length})`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Progress */}
        {importing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <div className="font-semibold text-blue-900">
                Importando para Shopify... ({importProgress.current}/{importProgress.total})
              </div>
            </div>
            {importProgress.currentSku && (
              <div className="text-sm text-blue-600">
                Processando: {importProgress.currentSku}
              </div>
            )}
          </div>
        )}

        {/* Import Results */}
        {importResults && importResults.success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-green-900 mb-3">✅ Importação Concluída!</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-2xl font-bold text-green-900">{importResults.imported}</div>
                <div className="text-sm text-green-600">Importados com sucesso</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-900">{importResults.failed}</div>
                <div className="text-sm text-red-600">Falhas</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{importResults.total}</div>
                <div className="text-sm text-gray-600">Total processados</div>
              </div>
            </div>

            {importResults.errors && importResults.errors.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold text-red-900 mb-2">Erros:</h4>
                <div className="bg-white rounded p-3 max-h-40 overflow-y-auto">
                  {importResults.errors.map((error: string, idx: number) => (
                    <div key={idx} className="text-sm text-red-600 mb-1">
                      • {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importResults.products && importResults.products.length > 0 && (
              <div className="mt-4">
                <h4 className="font-semibold text-green-900 mb-2">Produtos Importados:</h4>
                <div className="bg-white rounded p-3 max-h-60 overflow-y-auto">
                  {importResults.products.map((prod: any, idx: number) => (
                    <div key={idx} className="text-sm text-gray-700 mb-2 pb-2 border-b last:border-b-0">
                      <div className="font-medium">{prod.sku} - {prod.title}</div>
                      <a
                        href={prod.shopify_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Ver na Shopify →
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Products Table */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-gray-600">Carregando produtos...</div>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Nenhum produto pronto para importar
            </h3>
            <p className="text-gray-600 mb-6">
              Processe produtos primeiro nas outras páginas do sistema
            </p>
            <a
              href="/blur-review"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Ir para Revisão de Produtos
            </a>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      <input
                        type="checkbox"
                        checked={selectedProducts.size === products.length && products.length > 0}
                        onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">SKU</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título Original</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Título Camuflado</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preço</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr
                      key={product.product_id}
                      className={selectedProducts.has(product.product_id) ? 'bg-blue-50' : 'hover:bg-gray-50'}
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.product_id)}
                          onChange={() => toggleProductSelection(product.product_id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.product_id}</td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">{product.sku}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{product.original_name}</td>
                      <td className="px-6 py-4 text-sm text-green-700 font-medium">{product.camouflaged_title}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">R$ {product.price.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          product.status === 'clean' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {product.status === 'clean' ? '✓ Limpo' : '⚠ Blur Aplicado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
