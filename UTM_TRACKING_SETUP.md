# 🎯 Configuração de Tracking de UTMs - WooCommerce → Shopify

Este documento explica como preservar UTMs (parâmetros de tracking) durante todo o fluxo de compra, desde o anúncio do Facebook até a finalização no checkout Shopify.

## 📋 Problema

Quando o cliente é redirecionado do WooCommerce para o Shopify, as UTMs se perdem:

```
Facebook Ad → WooCommerce (✅ com UTMs) → Shopify (❌ sem UTMs) → Pixel não sabe a origem
```

**Resultado:**
- ❌ Facebook Pixel não consegue atribuir a venda corretamente
- ❌ Campanhas não são otimizadas
- ❌ ROAS (Return on Ad Spend) fica incorreto
- ❌ Retargeting fica comprometido

## ✅ Solução Completa

Implementar tracking de UTMs em 3 camadas:

1. **WooCommerce**: Capturar e armazenar UTMs
2. **Redirecionamento**: Incluir UTMs na URL do Shopify
3. **Shopify**: Receber UTMs e enviar para Facebook Pixel

---

## 📝 Passo 1: Instalar UTM Tracker no WooCommerce

### Opção A: Via Plugin (Recomendado)

1. **WooCommerce → Plugins → Adicionar Novo**
2. Procure por: **"Code Snippets"** ou **"Insert Headers and Footers"**
3. Instale e ative

4. **Code Snippets → Add New**
5. Cole o código de `woocommerce-utm-tracker.js`
6. Defina como **Footer** (executar no rodapé)
7. Ative o snippet

### Opção B: Adicionar Manualmente no Tema

1. **Aparência → Editor de Temas**
2. Abra `footer.php` ou `functions.php`
3. Adicione antes da tag `</body>`:

```php
<!-- UTM Tracker -->
<script>
<?php include 'path/to/woocommerce-utm-tracker.js'; ?>
</script>
```

### Opção C: Via Google Tag Manager (Mais Fácil)

1. **Google Tag Manager → Nova Tag**
2. Tipo: **HTML Personalizado**
3. Cole o código completo de `woocommerce-utm-tracker.js`
4. Acionador: **Todas as Páginas**
5. Publique

---

## 📝 Passo 2: Modificar Código de Redirecionamento

Você precisa garantir que o código que redireciona para o Shopify **PRESERVE AS UTMs**.

### Exemplo de Código PHP no WooCommerce:

```php
<?php
/**
 * Redirecionar para checkout Shopify com UTMs preservadas
 *
 * Adicione este código no functions.php do seu tema WooCommerce
 */

// Hook que intercepta o botão "Finalizar Compra"
add_action('woocommerce_proceed_to_checkout', 'redirect_to_shopify_with_utms', 10);

function redirect_to_shopify_with_utms() {
    // Pegar itens do carrinho
    $cart_items = WC()->cart->get_cart();

    if (empty($cart_items)) {
        return; // Carrinho vazio, não fazer nada
    }

    // Montar URL do Shopify
    $shopify_url = 'https://sua-loja.myshopify.com/cart/';

    // Adicionar produtos ao carrinho Shopify
    $variant_ids = array();
    foreach ($cart_items as $cart_item) {
        $product = $cart_item['data'];
        $sku = $product->get_sku();
        $quantity = $cart_item['quantity'];

        // Buscar variant_id do Shopify pelo SKU
        $shopify_variant_id = get_shopify_variant_id_by_sku($sku);

        if ($shopify_variant_id) {
            $variant_ids[] = $shopify_variant_id . ':' . $quantity;
        }
    }

    if (empty($variant_ids)) {
        return; // Nenhum produto encontrado na Shopify
    }

    // URL base: https://loja.myshopify.com/cart/42412398051371:1,42412398182443:2
    $shopify_url .= implode(',', $variant_ids);

    // ========================================
    // CRÍTICO: ADICIONAR UTMs À URL
    // ========================================

    // Capturar UTMs da sessão/cookie (salvas pelo script JavaScript)
    $utms = get_stored_utms_from_session();

    if (!empty($utms)) {
        $query_params = array();

        // Adicionar todos os parâmetros de tracking
        $tracking_params = array(
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'utm_id',
            'fbclid',
            'gclid'
        );

        foreach ($tracking_params as $param) {
            if (isset($utms[$param]) && !empty($utms[$param])) {
                $query_params[$param] = $utms[$param];
            }
        }

        // Adicionar parâmetros à URL
        if (!empty($query_params)) {
            $shopify_url .= '?' . http_build_query($query_params);
        }
    }

    // Redirecionar
    wp_redirect($shopify_url);
    exit;
}

/**
 * Recuperar UTMs da sessão/cookie
 */
function get_stored_utms_from_session() {
    // Método 1: Tentar GET (passadas como query params)
    $utms = array();

    if (isset($_GET['utm_source'])) {
        $utms['utm_source'] = sanitize_text_field($_GET['utm_source']);
    }
    if (isset($_GET['utm_medium'])) {
        $utms['utm_medium'] = sanitize_text_field($_GET['utm_medium']);
    }
    if (isset($_GET['utm_campaign'])) {
        $utms['utm_campaign'] = sanitize_text_field($_GET['utm_campaign']);
    }
    if (isset($_GET['utm_term'])) {
        $utms['utm_term'] = sanitize_text_field($_GET['utm_term']);
    }
    if (isset($_GET['utm_content'])) {
        $utms['utm_content'] = sanitize_text_field($_GET['utm_content']);
    }
    if (isset($_GET['fbclid'])) {
        $utms['fbclid'] = sanitize_text_field($_GET['fbclid']);
    }

    // Método 2: Tentar Cookie (fallback)
    if (empty($utms) && isset($_COOKIE['tracking_utms'])) {
        $cookie_utms = json_decode(stripslashes($_COOKIE['tracking_utms']), true);
        if (is_array($cookie_utms)) {
            $utms = $cookie_utms;
        }
    }

    // Método 3: Tentar Session (fallback)
    if (empty($utms) && isset($_SESSION['tracking_utms'])) {
        $utms = $_SESSION['tracking_utms'];
    }

    return $utms;
}

/**
 * Buscar variant_id do Shopify pelo SKU
 * (Você já deve ter essa função implementada)
 */
function get_shopify_variant_id_by_sku($sku) {
    // Consultar seu banco de dados ou API
    // Retornar o variant_id correspondente

    global $wpdb;
    $result = $wpdb->get_var($wpdb->prepare(
        "SELECT shopify_variant_id FROM wp_product_mappings WHERE sku = %s",
        $sku
    ));

    return $result;
}
```

### Exemplo de Código JavaScript (Alternativa):

Se você está usando JavaScript para redirecionar:

```javascript
// Capturar UTMs do localStorage (salvas pelo utm-tracker.js)
function redirectToShopify() {
  const utms = window.UTMTracker.getUTMs();

  // URL base do Shopify
  let shopifyURL = 'https://sua-loja.myshopify.com/cart/42412398051371:1';

  // Adicionar UTMs
  shopifyURL = window.UTMTracker.addUTMsToURL(shopifyURL, utms);

  console.log('🔗 Redirecionando para Shopify com UTMs:', shopifyURL);

  // Redirecionar
  window.location.href = shopifyURL;
}
```

---

## 📝 Passo 3: Instalar UTM Receiver na Shopify

### Método 1: Via theme.liquid (Recomendado)

1. **Shopify Admin → Online Store → Themes**
2. **Actions → Edit Code**
3. Abra `layout/theme.liquid`
4. Cole o código de `shopify-utm-receiver.js` **ANTES da tag `</body>`**
5. Save

### Método 2: Via Google Tag Manager

1. **Google Tag Manager → Nova Tag**
2. Tipo: **HTML Personalizado**
3. Cole o código de `shopify-utm-receiver.js`
4. Acionador: **Todas as Páginas**
5. Publique

---

## 🧪 Teste Completo

### Passo a Passo de Teste:

1. **Criar URL de teste com UTMs:**
   ```
   https://sua-loja-woo.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=teste_utm&fbclid=teste123
   ```

2. **Abrir a URL** no navegador

3. **Verificar console do navegador** (F12):
   ```
   🎯 [UTM Tracker] Inicializando...
   📊 [UTM Tracker] UTMs capturadas: {utm_source: "facebook", utm_medium: "cpc", ...}
   ✅ [UTM Tracker] UTMs salvas em localStorage
   ```

4. **Adicionar produto ao carrinho** no WooCommerce

5. **Clicar em "Finalizar Compra"**

6. **Verificar URL do Shopify** (deve ter as UTMs):
   ```
   https://sua-loja.myshopify.com/cart/42412398051371:1?utm_source=facebook&utm_medium=cpc&utm_campaign=teste_utm&fbclid=teste123
   ```

7. **Verificar console do Shopify**:
   ```
   🎯 [Shopify UTM] Inicializando...
   📊 [Shopify UTM] Parâmetros capturados: {utm_source: "facebook", ...}
   📊 [Shopify UTM] Enviando parâmetros para Facebook Pixel
   ✅ [Shopify UTM] Parâmetros enviados para Facebook Pixel
   ```

8. **Verificar Facebook Pixel** (extensão do navegador ou Events Manager):
   - Evento PageView deve ter parâmetros customizados com UTMs
   - Evento InitiateCheckout deve ter UTMs
   - Evento Purchase deve ter UTMs

---

## 📊 Verificar no Facebook Events Manager

1. **Facebook Business Manager → Events Manager**
2. Selecione seu Pixel
3. Vá em **Teste Events** ou **Events**
4. Faça uma compra de teste
5. Verifique se o evento **Purchase** tem:
   ```json
   {
     "event_name": "Purchase",
     "custom_data": {
       "utm_source": "facebook",
       "utm_medium": "cpc",
       "utm_campaign": "teste_utm",
       "fbclid": "teste123",
       "value": 82713.38,
       "currency": "BRL"
     }
   }
   ```

---

## ✅ Checklist de Implementação

- [ ] Script `woocommerce-utm-tracker.js` instalado no WooCommerce
- [ ] Código de redirecionamento modificado para incluir UTMs
- [ ] Script `shopify-utm-receiver.js` instalado na Shopify
- [ ] Teste realizado com UTMs de teste
- [ ] UTMs aparecendo no console do navegador (WooCommerce)
- [ ] UTMs aparecendo na URL do Shopify
- [ ] UTMs aparecendo no console do Shopify
- [ ] Facebook Pixel recebendo UTMs nos eventos
- [ ] Eventos no Facebook Events Manager com UTMs corretas

---

## 🎯 Resultado Esperado

**Fluxo Completo COM Tracking:**

```
Facebook Ad (utm_source=facebook&utm_campaign=verao2025)
  ↓
WooCommerce
  ├─ Script captura UTMs ✅
  ├─ Salva em localStorage/cookie ✅
  └─ Cliente adiciona ao carrinho
  ↓
Cliente clica "Finalizar Compra"
  ↓
Redirecionamento para Shopify
  ├─ PHP/JS adiciona UTMs na URL ✅
  └─ URL: shopify.com/cart/123?utm_source=facebook&utm_campaign=verao2025
  ↓
Shopify Checkout
  ├─ Script recebe UTMs da URL ✅
  ├─ Salva em localStorage ✅
  └─ Envia para Facebook Pixel ✅
  ↓
Facebook Pixel
  ├─ PageView com UTMs ✅
  ├─ InitiateCheckout com UTMs ✅
  └─ Purchase com UTMs ✅
  ↓
✅ Venda atribuída corretamente à campanha!
```

---

**Versão:** 1.0.0
**Data:** 2025-10-19
**Compatível com:** WooCommerce + Shopify + Facebook Pixel
