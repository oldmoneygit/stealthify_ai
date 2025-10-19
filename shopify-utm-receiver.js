/**
 * Shopify UTM Receiver & Facebook Pixel Enhancer
 *
 * Este script captura UTMs da URL quando cliente chega da WooCommerce
 * e envia para o Facebook Pixel para tracking correto.
 *
 * Como instalar:
 * 1. Shopify Admin → Online Store → Themes → Actions → Edit Code
 * 2. Abra theme.liquid
 * 3. Cole este código ANTES da tag </body>
 */

<script>
(function() {
  'use strict';

  console.log('🎯 [Shopify UTM] Inicializando...');

  // Lista de parâmetros UTM e tracking
  const TRACKING_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'fbclid',
    'gclid',
    'msclkid',
    'ttclid'
  ];

  /**
   * Captura parâmetros de tracking da URL
   */
  function captureTrackingParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const params = {};
    let hasParams = false;

    TRACKING_PARAMS.forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        params[param] = value;
        hasParams = true;
      }
    });

    if (hasParams) {
      console.log('📊 [Shopify UTM] Parâmetros capturados:', params);
      storeTrackingParams(params);
    } else {
      console.log('ℹ️ [Shopify UTM] Nenhum parâmetro na URL, verificando localStorage...');
      // Tentar recuperar de localStorage (pode ter sido salvo antes)
      const stored = getStoredTrackingParams();
      if (Object.keys(stored).length > 0) {
        console.log('📦 [Shopify UTM] Parâmetros recuperados do localStorage:', stored);
        params = stored;
      }
    }

    return params;
  }

  /**
   * Armazena parâmetros em localStorage
   */
  function storeTrackingParams(params) {
    try {
      localStorage.setItem('shopify_tracking_params', JSON.stringify(params));
      localStorage.setItem('shopify_tracking_timestamp', Date.now().toString());
      console.log('✅ [Shopify UTM] Parâmetros salvos em localStorage');
    } catch (e) {
      console.warn('⚠️ [Shopify UTM] Erro ao salvar em localStorage:', e);
    }

    // Cookie fallback
    try {
      const expires = new Date();
      expires.setDate(expires.getDate() + 30);
      document.cookie = `shopify_tracking=${encodeURIComponent(JSON.stringify(params))}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
      console.log('✅ [Shopify UTM] Parâmetros salvos em cookie');
    } catch (e) {
      console.warn('⚠️ [Shopify UTM] Erro ao salvar em cookie:', e);
    }
  }

  /**
   * Recupera parâmetros armazenados
   */
  function getStoredTrackingParams() {
    // Tentar localStorage
    try {
      const stored = localStorage.getItem('shopify_tracking_params');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('⚠️ [Shopify UTM] Erro ao ler localStorage:', e);
    }

    // Fallback para cookie
    try {
      const cookies = document.cookie.split(';');
      for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'shopify_tracking') {
          return JSON.parse(decodeURIComponent(value));
        }
      }
    } catch (e) {
      console.warn('⚠️ [Shopify UTM] Erro ao ler cookie:', e);
    }

    return {};
  }

  /**
   * Envia UTMs para o Facebook Pixel
   */
  function sendToFacebookPixel(params) {
    if (Object.keys(params).length === 0) {
      console.log('ℹ️ [Shopify UTM] Nenhum parâmetro para enviar ao Facebook Pixel');
      return;
    }

    // Aguardar Facebook Pixel carregar
    const maxAttempts = 20;
    let attempts = 0;

    const sendInterval = setInterval(function() {
      attempts++;

      if (window.fbq) {
        clearInterval(sendInterval);

        console.log('📊 [Shopify UTM] Enviando parâmetros para Facebook Pixel');

        // PageView com parâmetros customizados
        window.fbq('track', 'PageView', {
          utm_source: params.utm_source || '',
          utm_medium: params.utm_medium || '',
          utm_campaign: params.utm_campaign || '',
          utm_term: params.utm_term || '',
          utm_content: params.utm_content || '',
          utm_id: params.utm_id || '',
          fbclid: params.fbclid || '',
          gclid: params.gclid || ''
        });

        // Se estiver na página de checkout, enviar InitiateCheckout
        if (window.location.pathname.includes('/checkout') ||
            window.location.pathname.includes('/cart')) {
          console.log('🛒 [Shopify UTM] Enviando InitiateCheckout com UTMs');

          window.fbq('track', 'InitiateCheckout', {
            utm_source: params.utm_source || '',
            utm_medium: params.utm_medium || '',
            utm_campaign: params.utm_campaign || '',
            fbclid: params.fbclid || ''
          });
        }

        // Se estiver na Thank You Page, enviar Purchase com UTMs
        if (window.Shopify && window.Shopify.checkout && window.Shopify.checkout.order_id) {
          console.log('💰 [Shopify UTM] Enviando Purchase com UTMs');

          const checkout = window.Shopify.checkout;

          window.fbq('track', 'Purchase', {
            value: parseFloat(checkout.total_price),
            currency: checkout.currency,
            content_ids: checkout.line_items.map(item => item.product_id),
            content_type: 'product',
            // UTMs para tracking
            utm_source: params.utm_source || '',
            utm_medium: params.utm_medium || '',
            utm_campaign: params.utm_campaign || '',
            utm_term: params.utm_term || '',
            utm_content: params.utm_content || '',
            fbclid: params.fbclid || '',
            // Dados adicionais
            order_id: checkout.order_id,
            order_number: checkout.order_number
          });
        }

        console.log('✅ [Shopify UTM] Parâmetros enviados para Facebook Pixel');

      } else if (attempts >= maxAttempts) {
        clearInterval(sendInterval);
        console.warn('⚠️ [Shopify UTM] Facebook Pixel não encontrado após 20 tentativas');
      }
    }, 100); // Tentar a cada 100ms
  }

  /**
   * Envia UTMs para o Google Analytics (se disponível)
   */
  function sendToGoogleAnalytics(params) {
    if (Object.keys(params).length === 0) {
      return;
    }

    // Google Analytics 4 (gtag.js)
    if (window.gtag) {
      console.log('📊 [Shopify UTM] Enviando parâmetros para Google Analytics 4');

      window.gtag('event', 'page_view', {
        campaign_source: params.utm_source,
        campaign_medium: params.utm_medium,
        campaign_name: params.utm_campaign,
        campaign_term: params.utm_term,
        campaign_content: params.utm_content
      });
    }

    // Google Analytics Universal (analytics.js) - Legado
    if (window.ga) {
      console.log('📊 [Shopify UTM] Enviando parâmetros para Google Analytics Universal');

      window.ga('set', 'campaignSource', params.utm_source);
      window.ga('set', 'campaignMedium', params.utm_medium);
      window.ga('set', 'campaignName', params.utm_campaign);
    }
  }

  // ==========================================
  // INICIALIZAÇÃO
  // ==========================================

  // 1. Capturar parâmetros da URL
  const trackingParams = captureTrackingParams();

  // 2. Enviar para Facebook Pixel
  sendToFacebookPixel(trackingParams);

  // 3. Enviar para Google Analytics
  sendToGoogleAnalytics(trackingParams);

  // 4. Expor globalmente
  window.ShopifyUTMTracker = {
    getParams: getStoredTrackingParams
  };

  console.log('✅ [Shopify UTM] Inicializado com sucesso');
  console.log('📊 [Shopify UTM] Parâmetros atuais:', trackingParams);

})();
</script>
