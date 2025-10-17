/**
 * 🔄 Script de Redirecionamento WooCommerce → Shopify
 *
 * Este script deve ser injetado no tema WooCommerce
 * para interceptar o botão "Finalizar Compra" e redirecionar
 * para o checkout da Shopify com os produtos camuflados
 *
 * INSTALAÇÃO:
 * 1. No WordPress, vá em Aparência → Editor de Tema
 * 2. Abra functions.php
 * 3. Adicione o código de hook para carregar este script
 * 4. Faça upload deste arquivo para sua hospedagem
 */

(function() {
  'use strict';

  // URL da sua API de redirecionamento
  const API_URL = 'https://SEU_DOMINIO/api/woo-to-shopify-redirect';

  console.log('🔄 [WooCommerce → Shopify] Script carregado');

  /**
   * Extrai itens do carrinho WooCommerce
   */
  function getCartItems() {
    const items = [];

    // WooCommerce renderiza os itens do carrinho no DOM
    const cartItems = document.querySelectorAll('.woocommerce-cart-form__cart-item');

    cartItems.forEach(row => {
      // Buscar SKU (geralmente está em um data attribute ou meta)
      const skuElement = row.querySelector('[data-sku]');
      const sku = skuElement ? skuElement.getAttribute('data-sku') : null;

      // Alternativa: buscar SKU no título/link do produto
      const productLink = row.querySelector('.product-name a');
      const skuFromUrl = productLink ? extractSkuFromUrl(productLink.href) : null;

      // Buscar quantidade
      const quantityInput = row.querySelector('.qty');
      const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1;

      const finalSku = sku || skuFromUrl;

      if (finalSku) {
        items.push({
          sku: finalSku,
          quantity: quantity
        });
      }
    });

    return items;
  }

  /**
   * Tenta extrair SKU da URL do produto
   */
  function extractSkuFromUrl(url) {
    // Exemplo: https://loja.com/produto/nike-air-jordan-1-chicago/?sku=STFY-123
    const match = url.match(/[?&]sku=([^&]+)/);
    return match ? match[1] : null;
  }

  /**
   * Redireciona para checkout Shopify
   */
  async function redirectToShopifyCheckout(event) {
    event.preventDefault();
    event.stopPropagation();

    console.log('🛒 [Checkout] Botão "Finalizar Compra" clicado');

    // Mostrar loading
    const button = event.target;
    const originalText = button.textContent;
    button.textContent = 'Redirecionando...';
    button.disabled = true;

    try {
      // Extrair itens do carrinho
      const items = getCartItems();

      console.log('📦 [Carrinho] Itens:', items);

      if (items.length === 0) {
        alert('Não foi possível identificar os produtos no carrinho. Por favor, tente novamente.');
        button.textContent = originalText;
        button.disabled = false;
        return;
      }

      // Chamar API de redirecionamento
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });

      const result = await response.json();

      if (result.success && result.checkout_url) {
        console.log('✅ [Checkout] Redirecionando para:', result.checkout_url);

        // Redirecionar para Shopify
        window.location.href = result.checkout_url;
      } else {
        console.error('❌ [Checkout] Erro:', result.error);
        alert('Erro ao criar checkout: ' + result.error);
        button.textContent = originalText;
        button.disabled = false;
      }

    } catch (error) {
      console.error('❌ [Checkout] Erro de rede:', error);
      alert('Erro ao conectar com o servidor. Por favor, tente novamente.');
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  /**
   * Inicializa o script quando o DOM estiver pronto
   */
  function init() {
    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Buscar botão "Finalizar Compra" (Proceed to Checkout)
    const checkoutButtons = document.querySelectorAll(
      '.checkout-button, .wc-proceed-to-checkout a, a.checkout-button, button.checkout-button'
    );

    console.log('🔍 [Init] Botões de checkout encontrados:', checkoutButtons.length);

    checkoutButtons.forEach((button, index) => {
      console.log(`🔘 [Init] Interceptando botão ${index + 1}`);
      button.addEventListener('click', redirectToShopifyCheckout);
    });

    // Se nenhum botão foi encontrado, tentar novamente após 1 segundo
    if (checkoutButtons.length === 0) {
      console.log('⏳ [Init] Nenhum botão encontrado, tentando novamente em 1s...');
      setTimeout(init, 1000);
    }
  }

  // Iniciar
  init();

})();
