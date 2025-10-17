'use client';

import { useEffect, useState } from 'react';
import { camouflage, detectBrandsInTitle } from '@/services/title.service';
import Navbar from '@/components/Navbar';

interface Product {
  product_id: string;
  original_name: string;
  camouflaged_title: string | null;
  sku: string;
  price: number;
  original_image: string | null;
  edited_image: string | null;
  directory: string | null;
  has_watermark: boolean;
  is_saved_in_db?: boolean;
}

export default function TitleEditorPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedTitles, setEditedTitles] = useState<{ [key: string]: string }>({});
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      console.log('📦 Carregando produtos do banco de dados...');

      const response = await fetch('/api/products-with-titles');
      const data = await response.json();

      if (data.success) {
        setProducts(data.products);
        console.log(`✅ ${data.products.length} produtos carregados`);
        console.log(`   💾 ${data.saved_count} com títulos salvos`);
        console.log(`   📝 ${data.not_saved_count} sem títulos`);
      }
    } catch (error) {
      console.error('❌ Erro ao carregar produtos:', error);
    } finally {
      setLoading(false);
    }
  };

  const extractNameFromFilename = (filename: string): string => {
    if (!filename) return '';
    // Extract name from: "/api/original-images/25877-NBA-x-Nike-Dunk-Low-EMB-75th-Anniversary.jpg"
    const name = filename.split('/').pop()?.split('.')[0] || '';
    // Remove product ID prefix (5 digits + dash)
    return name.replace(/^\d{5}-/, '').replace(/-/g, ' ');
  };

  const handleTitleEdit = (productId: string, newTitle: string) => {
    setEditedTitles({
      ...editedTitles,
      [productId]: newTitle
    });
  };

  const applyCamouflageToAll = () => {
    const newEditedTitles: { [key: string]: string } = {};

    products.forEach(product => {
      const camouflagedTitle = camouflage(product.original_name);
      newEditedTitles[product.product_id] = camouflagedTitle;
    });

    setEditedTitles(newEditedTitles);
    alert(`✅ Camuflagem automática aplicada em ${products.length} produtos!`);
  };

  const handleSaveTitles = async () => {
    if (Object.keys(editedTitles).length === 0) {
      alert('⚠️ Nenhum título foi editado!');
      return;
    }

    const confirmed = confirm(
      `💾 Salvar ${Object.keys(editedTitles).length} títulos editados no banco de dados?`
    );

    if (!confirmed) return;

    try {
      setSaving(true);

      const response = await fetch('/api/update-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titles: editedTitles
        })
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ ${result.updated_count} títulos salvos com sucesso!`);
        setEditedTitles({});
        loadProducts(); // Reload to show updated data
      } else {
        alert(`❌ Erro ao salvar: ${result.error}`);
      }
    } catch (error: any) {
      alert(`❌ Erro ao salvar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.original_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.product_id.includes(searchTerm)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando produtos...</p>
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                ✏️ Editor de Títulos em Massa
              </h1>
              <p className="mt-2 text-sm text-gray-600">
                Edite e camufle títulos de produtos antes de exportar para Shopify
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-blue-600">
                {products.length}
              </div>
              <div className="text-sm text-gray-500">
                Produtos Totais
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={applyCamouflageToAll}
              disabled={products.length === 0}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50"
            >
              🤖 Aplicar Camuflagem Automática em Todos
            </button>

            <button
              onClick={handleSaveTitles}
              disabled={saving || Object.keys(editedTitles).length === 0}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Salvando...
                </>
              ) : (
                <>
                  💾 Salvar Títulos ({Object.keys(editedTitles).length})
                </>
              )}
            </button>

            <button
              onClick={() => window.location.href = '/blur-review'}
              className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded transition-colors"
            >
              ← Voltar para Revisão
            </button>
          </div>

          {/* Search */}
          <div className="mt-4">
            <input
              type="text"
              placeholder="🔍 Buscar por nome ou ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Products Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Título Original
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Título Editado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Marcas Detectadas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredProducts.map((product) => {
                // Priority: edited titles (unsaved) > saved titles from DB > original name
                const currentTitle = editedTitles[product.product_id]
                  || product.camouflaged_title
                  || product.original_name;

                const detectedBrands = detectBrandsInTitle(product.original_name);
                const hasUnsavedEdits = !!editedTitles[product.product_id];
                const hasSavedTitle = product.is_saved_in_db;

                // Background color logic
                let rowBgClass = '';
                if (hasUnsavedEdits) {
                  rowBgClass = 'bg-yellow-50'; // Yellow = unsaved changes
                } else if (hasSavedTitle) {
                  rowBgClass = 'bg-green-50'; // Green = saved in DB
                }

                return (
                  <tr key={product.product_id} className={rowBgClass}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {product.product_id}
                        {hasSavedTitle && !hasUnsavedEdits && (
                          <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">
                            💾 Salvo
                          </span>
                        )}
                        {hasUnsavedEdits && (
                          <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded-full">
                            ✏️ Editado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-xs">
                        {product.original_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={currentTitle}
                        onChange={(e) => handleTitleEdit(product.product_id, e.target.value)}
                        className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
                          hasSavedTitle && !hasUnsavedEdits
                            ? 'border-green-400 bg-green-50'
                            : hasUnsavedEdits
                            ? 'border-yellow-400 bg-yellow-50'
                            : 'border-gray-300'
                        }`}
                        placeholder="Título editado..."
                      />
                      {hasSavedTitle && !hasUnsavedEdits && (
                        <p className="text-xs text-green-600 mt-1">
                          💾 Título salvo no banco de dados
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {detectedBrands.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {detectedBrands.map(brand => (
                            <span
                              key={brand}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
                            >
                              {brand}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-green-600">✓ Limpo</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleTitleEdit(product.product_id, camouflage(product.original_name))}
                        className="text-purple-600 hover:text-purple-900 font-medium"
                      >
                        🤖 Auto
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Nenhum produto encontrado
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="mt-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
          <h3 className="font-bold text-blue-900 mb-3">📊 Resumo</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-blue-700">Total de Produtos:</p>
              <p className="text-2xl font-bold text-blue-900">{products.length}</p>
            </div>
            <div>
              <p className="text-green-700">💾 Salvos no BD:</p>
              <p className="text-2xl font-bold text-green-600">
                {products.filter(p => p.is_saved_in_db).length}
              </p>
            </div>
            <div>
              <p className="text-yellow-700">✏️ Editados (não salvos):</p>
              <p className="text-2xl font-bold text-yellow-600">
                {Object.keys(editedTitles).length}
              </p>
            </div>
            <div>
              <p className="text-orange-700">📝 Sem título:</p>
              <p className="text-2xl font-bold text-orange-600">
                {products.filter(p => !p.is_saved_in_db).length - Object.keys(editedTitles).length}
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs text-blue-800 font-semibold mb-2">Legenda de Cores:</p>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-green-50 border-2 border-green-400 rounded"></div>
                <span className="text-gray-700">Verde = Salvo no banco</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-yellow-50 border-2 border-yellow-400 rounded"></div>
                <span className="text-gray-700">Amarelo = Editado (não salvo)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 bg-white border-2 border-gray-300 rounded"></div>
                <span className="text-gray-700">Branco = Sem edição</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
