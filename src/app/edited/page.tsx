'use client';

import { useState, useEffect } from 'react';
import EditedProductCard from '@/components/EditedProductCard';

interface EditedProduct {
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
}

interface Stats {
  total: number;
  clean: number;
  blurApplied: number;
  failed: number;
  avgRiskScore: number;
  topBrands: Array<{ brand: string; count: number }>;
  imagesCount: number;
  totalSizeMB: number;
}

export default function EditedProductsPage() {
  const [products, setProducts] = useState<EditedProduct[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'clean' | 'blur_applied' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [exporting, setExporting] = useState(false);

  // Load products
  useEffect(() => {
    loadProducts();
    loadStats();
  }, [statusFilter]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const response = await fetch(`/api/products/edited${params}`);
      const data = await response.json();

      console.log('📦 Products loaded:', {
        success: data.success,
        count: data.count,
        firstProduct: data.products?.[0] ? {
          sku: data.products[0].sku,
          hasEditedImage: !!data.products[0].editedImage,
          editedImageStart: data.products[0].editedImage?.substring(0, 50)
        } : null
      });

      if (data.success) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();

      if (data.success) {
        setStats({
          total: data.analysis.total,
          clean: data.analysis.clean,
          blurApplied: data.analysis.blurApplied,
          failed: data.analysis.failed,
          avgRiskScore: data.analysis.avgRiskScore,
          topBrands: data.analysis.topBrands,
          imagesCount: data.storage.imagesCount,
          totalSizeMB: data.storage.totalSizeMB
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      setExporting(true);
      const response = await fetch(`/api/export?format=${format}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify-export-${Date.now()}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Erro ao exportar');
    } finally {
      setExporting(false);
    }
  };

  const handleImportToShopify = async (sku: string) => {
    try {
      const response = await fetch('/api/shopify/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku })
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Produto ${sku} importado para Shopify!`);
        loadProducts(); // Reload
      } else {
        alert(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Erro ao importar para Shopify');
    }
  };

  const handleDelete = async (sku: string) => {
    try {
      const response = await fetch(`/api/products/${sku}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        alert(`✅ Análise deletada: ${sku}`);
        // Reload products and stats
        await Promise.all([loadProducts(), loadStats()]);
      } else {
        alert(`❌ Erro: ${data.error}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Erro ao deletar análise');
    }
  };

  // Filter products by search term
  const filteredProducts = products.filter(p =>
    p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.originalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.camouflagedName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Produtos Editados</h1>
              <p className="text-gray-600 mt-1">
                Produtos com marcas removidas prontos para importação
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleExport('csv')}
                disabled={exporting || products.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
              >
                📊 Exportar CSV
              </button>

              <button
                onClick={() => handleExport('json')}
                disabled={exporting || products.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium flex items-center gap-2"
              >
                📦 Exportar JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Total Analisados</div>
              <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">✅ Limpos</div>
              <div className="text-3xl font-bold text-green-600">{stats.clean}</div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.total > 0 ? Math.round((stats.clean / stats.total) * 100) : 0}% do total
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">Risk Score Médio</div>
              <div className="text-3xl font-bold text-gray-900">{stats.avgRiskScore}</div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-sm text-gray-600 mb-1">💾 Armazenamento</div>
              <div className="text-3xl font-bold text-gray-900">{stats.totalSizeMB}MB</div>
              <div className="text-xs text-gray-500 mt-1">
                {stats.imagesCount} imagens salvas
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <input
                type="text"
                placeholder="🔍 Buscar por SKU ou nome..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2">
              {['all', 'clean', 'blur_applied', 'failed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'Todos' :
                   status === 'clean' ? '✅ Limpos' :
                   status === 'blur_applied' ? '⚠️ Com Blur' :
                   '❌ Falhos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Carregando produtos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Nenhum produto encontrado
            </h3>
            <p className="text-gray-600">
              {searchTerm ? 'Tente outro termo de busca' : 'Execute o pipeline para analisar produtos'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Mostrando {filteredProducts.length} produto(s)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.map((product) => (
                <EditedProductCard
                  key={product.sku}
                  {...product}
                  onImportToShopify={() => handleImportToShopify(product.sku)}
                  onDelete={() => handleDelete(product.sku)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
