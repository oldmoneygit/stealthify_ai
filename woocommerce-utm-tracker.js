/**
 * WooCommerce UTM Tracker
 *
 * Este script captura e armazena UTMs quando o cliente entra na loja WooCommerce
 * e garante que sejam preservadas no redirecionamento para Shopify.
 *
 * Como instalar:
 * 1. WooCommerce → Aparência → Personalizar → CSS Adicional ou Scripts
 * 2. Cole este código em um Custom HTML Widget no footer
 * 3. Ou adicione no functions.php do tema
 */

(function() {
  'use strict';

  console.log('🎯 [UTM Tracker] Inicializando...');

  // Lista de parâmetros UTM que vamos rastrear
  const UTM_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'fbclid',     // Facebook Click ID
    'gclid',      // Google Click ID
    'msclkid',    // Microsoft Click ID
    'ttclid'      // TikTok Click ID
  ];

  /**
   * Captura UTMs da URL atual
   */
  function captureUTMs() {
    const urlParams = new URLSearchParams(window.location.search);
    const utms = {};
    let hasUTMs = false;

    UTM_PARAMS.forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        utms[param] = value;
        hasUTMs = true;
      }
    });

    if (hasUTMs) {
      console.log('📊 [UTM Tracker] UTMs capturadas:', utms);
      storeUTMs(utms);
    } else {
      console.log('ℹ️ [UTM Tracker] Nenhuma UTM na URL atual');
    }

    return utms;
  }

  /**
   * Armazena UTMs em localStorage e cookies (redundância)
   */
  function storeUTMs(utms) {
    // Armazenar em localStorage (permanente até limpar)
    try {
      localStorage.setItem('tracking_utms', JSON.stringify(utms));
      localStorage.setItem('tracking_utms_timestamp', Date.now().toString());
      console.log('✅ [UTM Tracker] UTMs salvas em localStorage');
    } catch (e) {
      console.warn('⚠️ [UTM Tracker] Erro ao salvar em localStorage:', e);
    }

    // Armazenar em cookie (fallback - expira em 30 dias)
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie = `tracking_utms=${encodeURIComponent(JSON.stringify(utms))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
      console.log('✅ [UTM Tracker] UTMs salvas em cookie');
    } catch (e) {
      console.warn('⚠️ [UTM Tracker] Erro ao salvar em cookie:', e);
    }
  }

  /**
   * Recupera UTMs armazenadas
   */
  function getStoredUTMs() {
    // Tentar localStorage primeiro
    try {
      const stored = localStorage.getItem('tracking_utms');
      if (stored) {
        const utms = JSON.parse(stored);
        console.log('📦 [UTM Tracker] UTMs recuperadas do localStorage:', utms);
        return utms;
      }
    } catch (e) {
      console.warn('⚠️ [UTM Tracker] Erro ao ler localStorage:', e);
    }

    // Fallback para cookie
    try {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'tracking_utms') {
          const utms = JSON.parse(decodeURIComponent(value));
          console.log('📦 [UTM Tracker] UTMs recuperadas do cookie:', utms);
          return utms;
        }
      }
    } catch (e) {
      console.warn('⚠️ [UTM Tracker] Erro ao ler cookie:', e);
    }

    return {};
  }

  /**
   * Adiciona UTMs a uma URL
   */
  function addUTMsToURL(url, utms) {
    if (Object.keys(utms).length === 0) {
      return url;
    }

    const urlObj = new URL(url);

    Object.keys(utms).forEach(key => {
      // Só adicionar se ainda não existir na URL
      if (!urlObj.searchParams.has(key)) {
        urlObj.searchParams.set(key, utms[key]);
      }
    });

    return urlObj.toString();
  }

  /**
   * Intercepta cliques em links de checkout e adiciona UTMs
   */
  function interceptCheckoutLinks() {
    // Seletores comuns de botões de checkout no WooCommerce
    const checkoutSelectors = [
      'a[href*="/checkout"]',
      'a.checkout-button',
      'a.wc-forward',
      '.woocommerce-cart a.checkout-button',
      '.cart-checkout-button a',
      'a[href*="proceed-to-checkout"]'
    ];

    checkoutSelectors.forEach(selector => {
      const links = document.querySelectorAll(selector);

      links.forEach(link => {
        link.addEventListener('click', function(e) {
          const utms = getStoredUTMs();

          if (Object.keys(utms).length > 0) {
            const currentHref = this.href;
            const newHref = addUTMsToURL(currentHref, utms);

            if (newHref !== currentHref) {
              console.log('🔗 [UTM Tracker] Adicionando UTMs ao link de checkout');
              console.log('   Original:', currentHref);
              console.log('   Com UTMs:', newHref);
              this.href = newHref;
            }
          }
        });
      });
    });

    console.log(`✅ [UTM Tracker] ${links.length} links de checkout interceptados`);
  }

  /**
   * Adiciona UTMs aos dados do Facebook Pixel
   */
  function enhanceFacebookPixel() {
    const utms = getStoredUTMs();

    if (Object.keys(utms).length === 0) {
      return;
    }

    // Se Facebook Pixel já está carregado
    if (window.fbq) {
      console.log('📊 [UTM Tracker] Enviando UTMs para Facebook Pixel');

      // Adicionar como parâmetros customizados
      window.fbq('track', 'ViewContent', {
        utm_source: utms.utm_source,
        utm_medium: utms.utm_medium,
        utm_campaign: utms.utm_campaign,
        utm_term: utms.utm_term,
        utm_content: utms.utm_content
      });
    }
  }

  /**
   * Envia UTMs para o backend (opcional - para salvar no banco)
   */
  function sendUTMsToBackend() {
    const utms = getStoredUTMs();

    if (Object.keys(utms).length === 0) {
      return;
    }

    // Enviar para endpoint customizado (opcional)
    // Você pode criar um endpoint para salvar as UTMs associadas à sessão
    /*
    fetch('/wp-json/custom/v1/track-utms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        utms: utms,
        timestamp: Date.now(),
        url: window.location.href
      })
    }).then(() => {
      console.log('✅ [UTM Tracker] UTMs enviadas para backend');
    }).catch(err => {
      console.warn('⚠️ [UTM Tracker] Erro ao enviar UTMs:', err);
    });
    */
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  // 1. Capturar UTMs da URL atual (se houver)
  captureUTMs();

  // 2. Interceptar links de checkout quando DOM carregar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', interceptCheckoutLinks);
  } else {
    interceptCheckoutLinks();
  }

  // 3. Re-interceptar após AJAX (WooCommerce usa AJAX no carrinho)
  const observer = new MutationObserver(function(mutations) {
    interceptCheckoutLinks();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 4. Adicionar UTMs ao Facebook Pixel
  enhanceFacebookPixel();

  // 5. Expor funções globalmente para uso em outros scripts
  window.UTMTracker = {
    getUTMs: getStoredUTMs,
    addUTMsToURL: addUTMsToURL
  };

  console.log('✅ [UTM Tracker] Inicializado com sucesso');
  console.log('📊 [UTM Tracker] UTMs atuais:', getStoredUTMs());

})();
