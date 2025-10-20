# 📊 Facebook Tracking - Setup Completo

## Resumo

Este guia mostra como configurar o **tracking 100% assertivo** do Facebook combinando:
1. **Facebook Pixel** (browser) - eventos de navegação
2. **Custom Pixel** (Shopify) - captura parâmetros
3. **Conversion API** (backend) - evento Purchase server-side

---

## 🔐 Parte 1: Obter Credenciais Facebook

### 1.1 Pixel ID

1. Acesse [Facebook Business Manager](https://business.facebook.com)
2. Vá em **Events Manager** → Selecione sua conta de anúncios
3. Clique em **Data Sources** (Fontes de Dados)
4. Clique no seu Pixel (ou crie um novo)
5. Copie o **Pixel ID** (número de 15 dígitos)

**Exemplo:** `123456789012345`

### 1.2 Conversion API Access Token

1. No mesmo Pixel, vá em **Settings** (Configurações)
2. Role até **Conversions API**
3. Clique em **Generate Access Token**
4. Copie o token (começa com `EAA...`)

**Exemplo:** `EAAGm7...` (token longo)

---

## 🛠️ Parte 2: Configurar Backend

### 2.1 Adicionar Variáveis de Ambiente

Edite o arquivo `.env.local` e adicione:

```bash
# Facebook Conversion API
FACEBOOK_PIXEL_ID=123456789012345
FACEBOOK_CONVERSION_API_TOKEN=EAAGm7ZC...seu-token-aqui...
```

### 2.2 Deploy do Backend

```bash
# Build local (testar)
pnpm build

# Deploy Vercel
git add .
git commit -m "feat: add Facebook Conversion API tracking"
git push
```

Aguarde o deploy terminar e anote a URL do seu app:
**Exemplo:** `https://seu-app.vercel.app`

---

## 🎨 Parte 3: Shopify Custom Pixel

### 3.1 Acessar Customer Events

1. Acesse Shopify Admin: `https://dq3gzg-a6.myshopify.com/admin`
2. Vá em **Settings** (Configurações) → **Customer events**
3. Clique em **Add Custom Pixel**

### 3.2 Código do Custom Pixel

Cole o código abaixo (substitua `YOUR_APP_URL`):

```javascript
// ===================================================================
// 📊 Facebook Tracking - Custom Pixel
// Captura parâmetros de tracking e envia para backend
// ===================================================================

// Helper: Get cookie value
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(';').shift();
  }
  return null;
}

// Subscribe to checkout_completed event
analytics.subscribe("checkout_completed", async (event) => {
  try {
    console.log('[Custom Pixel] Checkout completed, capturing tracking data...');

    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);

    // Get Facebook cookies
    const fbp = getCookie('_fbp');
    const fbc = getCookie('_fbc');

    // Build tracking data
    const trackingData = {
      // Facebook
      fbclid: urlParams.get('fbclid'),
      fbp: fbp,
      fbc: fbc || (urlParams.get('fbclid') ? `fb.1.${Date.now()}.${urlParams.get('fbclid')}` : null),

      // UTMs
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_term: urlParams.get('utm_term'),
      utm_content: urlParams.get('utm_content'),
      utm_id: urlParams.get('utm_id'),

      // Google
      gclid: urlParams.get('gclid'),

      // TikTok
      ttclid: urlParams.get('ttclid'),

      // Microsoft
      msclkid: urlParams.get('msclkid'),

      // URLs
      landing_url: window.location.href,
      referrer: document.referrer,

      // Client info
      user_agent: navigator.userAgent
    };

    // Remove null/undefined values
    Object.keys(trackingData).forEach(key => {
      if (!trackingData[key]) {
        delete trackingData[key];
      }
    });

    console.log('[Custom Pixel] Tracking data:', trackingData);

    // Send to backend
    const response = await fetch('YOUR_APP_URL/api/save-tracking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id: event.data.checkout.order.id,
        tracking: trackingData
      })
    });

    if (response.ok) {
      console.log('[Custom Pixel] ✅ Tracking data saved successfully');
    } else {
      console.error('[Custom Pixel] ❌ Failed to save tracking data:', response.status);
    }

  } catch (error) {
    console.error('[Custom Pixel] ❌ Error:', error);
  }
});

// Subscribe to page_viewed (optional - for debugging)
analytics.subscribe("page_viewed", (event) => {
  const urlParams = new URLSearchParams(window.location.search);
  const fbclid = urlParams.get('fbclid');
  const utmSource = urlParams.get('utm_source');

  if (fbclid || utmSource) {
    console.log('[Custom Pixel] Page viewed with tracking params:', {
      fbclid,
      utm_source: utmSource
    });
  }
});
```

### 3.3 Substituir URL

**⚠️ IMPORTANTE:** Substitua `YOUR_APP_URL` pela URL real do seu app Vercel:

```javascript
// ❌ ERRADO
const response = await fetch('YOUR_APP_URL/api/save-tracking', {

// ✅ CORRETO
const response = await fetch('https://seu-app.vercel.app/api/save-tracking', {
```

### 3.4 Salvar

1. Dê um nome ao pixel: **"Facebook Tracking Capture"**
2. Clique em **Save**
3. Clique em **Connect** para ativar

---

## ✅ Parte 4: Testar

### 4.1 Teste de Compra

1. Acesse sua loja WooCommerce
2. Adicione um produto ao carrinho
3. **Importante:** Acesse com parâmetros UTM na URL:
   ```
   https://sua-loja.com/produto?utm_source=facebook&utm_campaign=test&fbclid=IwAR3xYz...
   ```
4. Complete a compra (será redirecionado para Shopify)
5. Finalize o pagamento na Shopify

### 4.2 Verificar Logs

**No Console do Browser (F12):**
```
[Custom Pixel] Checkout completed, capturing tracking data...
[Custom Pixel] Tracking data: {fbclid: "...", utm_source: "facebook", ...}
[Custom Pixel] ✅ Tracking data saved successfully
```

**Nos Logs do Vercel:**
```
✅ [Tracking] Dados salvos para pedido: 6001212096555
✅ [Webhook] Pedido criado no WooCommerce: #27777
📊 [Tracking] Dados encontrados no cache: {has_fbclid: true, ...}
✅ [Facebook CAPI] Evento Purchase enviado com sucesso
```

### 4.3 Verificar no Facebook Events Manager

1. Acesse [Facebook Events Manager](https://business.facebook.com/events_manager)
2. Selecione seu Pixel
3. Vá em **Test Events**
4. Faça uma compra de teste
5. Você deve ver:
   - **1 evento Purchase** (CAPI)
   - **Deduplication status:** `Deduplicated` (se Pixel também disparou)
   - **Match Quality:** High (se email/phone foram hashados corretamente)

---

## 🐛 Troubleshooting

### Problema 1: "Tracking não encontrado"

**Sintoma:**
```
⚠️ [Tracking] Nenhum parâmetro de tracking encontrado para pedido: 6001212096555
```

**Causa:** Custom Pixel não disparou ou falhou

**Solução:**
1. Verificar console do browser (F12) → ver erros do Custom Pixel
2. Verificar URL do `/api/save-tracking` está correta
3. Verificar CORS (deve permitir chamadas da Shopify)

---

### Problema 2: "Facebook CAPI error"

**Sintoma:**
```
❌ [Facebook CAPI] Erro na API: Invalid access token
```

**Causa:** Access Token inválido ou expirado

**Solução:**
1. Gerar novo Access Token no Facebook Events Manager
2. Atualizar `.env.local` com o novo token
3. Fazer redeploy

---

### Problema 3: "Event not appearing in Facebook"

**Sintoma:** Evento não aparece no Events Manager

**Possíveis causas:**
1. **Pixel ID errado** → Verificar `.env.local`
2. **Access Token errado** → Gerar novo
3. **Test mode ativo** → Adicionar `test_event_code` no Events Manager
4. **Dados hasheados incorretos** → Verificar formato de email/phone

**Debug:**
1. Adicionar `test_event_code: 'TEST12345'` no Events Manager
2. Verificar se evento aparece na aba "Test Events"
3. Ver `fbtrace_id` nos logs para rastrear no Facebook

---

### Problema 4: "Duplicate events"

**Sintoma:** Facebook conta 2x o mesmo Purchase

**Causa:** event_id diferente entre Pixel e CAPI

**Solução:**
- Verificar que `event_id` tem o formato: `order_{ORDER_ID}_{TIMESTAMP}`
- Se Pixel também dispara Purchase, usar o mesmo event_id

---

## 📊 Parte 5: Monitoramento

### 5.1 Endpoints de Diagnóstico

**Verificar cache de tracking:**
```bash
GET https://seu-app.vercel.app/api/save-tracking?order_id=6001212096555
```

**Verificar erros do webhook:**
```bash
GET https://seu-app.vercel.app/api/shopify-order-webhook
```

### 5.2 Métricas no Facebook

**Events Manager → Overview:**
- **Total Events Received** (últimas 24h)
- **Match Quality** (% de eventos com dados de usuário)
- **Event Match Quality Score** (0-10)

**Meta recomenda:**
- Match Quality: > 70%
- Event Match Quality: > 6.0

---

## 🎯 Checklist Final

Antes de ir para produção, verificar:

- [ ] Facebook Pixel ID configurado em `.env.local`
- [ ] Conversion API Token configurado em `.env.local`
- [ ] Custom Pixel criado e ativado na Shopify
- [ ] URL do backend correta no Custom Pixel
- [ ] Compra de teste realizada com sucesso
- [ ] Evento aparece no Facebook Events Manager
- [ ] Match Quality > 70%
- [ ] Logs do Vercel mostram "Purchase enviado com sucesso"
- [ ] Deduplicação funcionando (se Pixel browser também dispara)

---

## 📚 Recursos

- [Facebook Conversions API Docs](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Shopify Custom Pixels](https://shopify.dev/docs/api/web-pixels-api)
- [Event Deduplication](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events)

---

**Última Atualização:** 2025-10-19
**Versão:** 1.0.0
