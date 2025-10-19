# 🎉 Configuração da Thank You Page da Shopify

Este documento explica como configurar a captura de dados do cliente na página de "Obrigado" da Shopify.

## 📋 Problema que Resolve

A API da Shopify no plano básico **NÃO retorna** dados pessoais do cliente (PII):
- ❌ Nome do cliente
- ❌ Email
- ❌ Telefone
- ❌ Endereço completo

Mas esses dados **ESTÃO DISPONÍVEIS** na Thank You Page via JavaScript!

## 🚀 Solução

Capturar os dados do cliente **IMEDIATAMENTE** após o pagamento ser aprovado, usando um script JavaScript na Thank You Page da Shopify.

---

## 📝 Passo a Passo

### 1️⃣ Adicionar Token de Segurança no `.env.local`

Abra o arquivo `.env.local` e adicione:

```bash
# Token para validar requisições da Thank You Page
SHOPIFY_THANK_YOU_TOKEN=seu_token_secreto_aleatorio_aqui_123456789
```

**Gerar token aleatório:**
```bash
# Linux/Mac
openssl rand -hex 32

# Windows (PowerShell)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

### 2️⃣ Atualizar variável no Vercel (Produção)

1. Acesse: https://vercel.com/seu-projeto/settings/environment-variables
2. Adicione a variável:
   - Name: `SHOPIFY_THANK_YOU_TOKEN`
   - Value: (mesmo valor do `.env.local`)
   - Environments: ✅ Production
3. Clique em "Save"
4. **Redeploy** o projeto

### 3️⃣ Adicionar Script na Shopify

1. Acesse **Shopify Admin** → **Settings** → **Checkout**

2. Scroll até a seção **"Order status page"** ou **"Additional scripts"**

3. Cole o seguinte código:

```html
<script>
(function() {
  // Verificar se estamos na página de obrigado
  if (!Shopify || !Shopify.checkout) {
    return;
  }

  const checkout = Shopify.checkout;

  // Extrair dados do cliente
  const customerData = {
    shopify_order_id: checkout.order_id,
    order_number: checkout.order_number,

    customer_name: checkout.billing_address?.name ||
                   (checkout.billing_address?.first_name + ' ' + checkout.billing_address?.last_name) ||
                   'Cliente Shopify',

    customer_first_name: checkout.billing_address?.first_name || '',
    customer_last_name: checkout.billing_address?.last_name || '',
    customer_email: checkout.email || '',
    customer_phone: checkout.phone || checkout.billing_address?.phone || '',

    billing_address: {
      first_name: checkout.billing_address?.first_name || '',
      last_name: checkout.billing_address?.last_name || '',
      name: checkout.billing_address?.name || '',
      address1: checkout.billing_address?.address1 || '',
      address2: checkout.billing_address?.address2 || '',
      city: checkout.billing_address?.city || '',
      province: checkout.billing_address?.province || '',
      province_code: checkout.billing_address?.province_code || '',
      country: checkout.billing_address?.country || '',
      country_code: checkout.billing_address?.country_code || '',
      zip: checkout.billing_address?.zip || '',
      phone: checkout.billing_address?.phone || ''
    },

    shipping_address: {
      first_name: checkout.shipping_address?.first_name || '',
      last_name: checkout.shipping_address?.last_name || '',
      name: checkout.shipping_address?.name || '',
      address1: checkout.shipping_address?.address1 || '',
      address2: checkout.shipping_address?.address2 || '',
      city: checkout.shipping_address?.city || '',
      province: checkout.shipping_address?.province || '',
      province_code: checkout.shipping_address?.province_code || '',
      country: checkout.shipping_address?.country || '',
      country_code: checkout.shipping_address?.country_code || '',
      zip: checkout.shipping_address?.zip || '',
      phone: checkout.shipping_address?.phone || ''
    },

    captured_at: new Date().toISOString()
  };

  // Enviar para nosso webhook
  fetch('https://SEU_DOMINIO_VERCEL.vercel.app/api/update-customer-data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Thank-You-Token': 'SEU_TOKEN_AQUI'
    },
    body: JSON.stringify(customerData)
  })
  .then(response => response.json())
  .then(data => {
    console.log('✅ Dados enviados:', data);
  })
  .catch(error => {
    console.error('❌ Erro:', error);

    // Retry após 2 segundos
    setTimeout(() => {
      fetch('https://SEU_DOMINIO_VERCEL.vercel.app/api/update-customer-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Thank-You-Token': 'SEU_TOKEN_AQUI'
        },
        body: JSON.stringify(customerData)
      }).catch(() => {});
    }, 2000);
  });
})();
</script>
```

4. **IMPORTANTE: Substituir:**
   - `SEU_DOMINIO_VERCEL` → seu domínio real (ex: `brand-camouflage.vercel.app`)
   - `SEU_TOKEN_AQUI` → o mesmo token que você colocou no `.env.local`

5. Clique em **"Save"**

---

## 🧪 Testar

1. Faça um **pedido de teste** na sua loja Shopify
2. Preencha **todos os dados** (nome, email, telefone, endereço)
3. Complete o checkout até a página de "Obrigado"
4. Verifique nos **logs do Vercel** se apareceu:
   ```
   📝 [Update Customer] Recebendo dados da Thank You Page...
   📦 [Update Customer] Dados recebidos: { customer_name: "benjamin rapetti", ... }
   ✅ [Update Customer] Pedido atualizado com sucesso
   ```
5. Verifique no **WooCommerce** se o pedido foi atualizado com:
   - ✅ Nome completo
   - ✅ Email
   - ✅ Telefone
   - ✅ Endereço completo

---

## 🔧 Troubleshooting

### Erro 401 - Invalid token
- Verifique se o token no script é **exatamente igual** ao do `.env.local`
- Verifique se a variável está configurada no Vercel
- Faça redeploy após adicionar a variável

### Erro 500 - Order not found
- O webhook pode ter falhado e não criou o pedido no WooCommerce
- Verifique os logs do webhook em `/api/shopify-order-webhook`

### Dados não aparecem no WooCommerce
- Abra o **console do navegador** (F12) na Thank You Page
- Verifique se há erros de CORS ou rede
- Verifique se o fetch está sendo executado

---

## 📊 Fluxo Completo

```
1. Cliente finaliza compra na Shopify
   ↓
2. Shopify processa pagamento (Appmax)
   ↓
3. Shopify dispara webhook → /api/shopify-order-webhook
   ↓
4. Sistema cria pedido no WooCommerce (SEM dados do cliente)
   ↓
5. Cliente é redirecionado para Thank You Page
   ↓
6. Script JavaScript captura dados do Shopify.checkout
   ↓
7. Script envia POST → /api/update-customer-data
   ↓
8. Sistema atualiza pedido WooCommerce (COM dados do cliente)
   ↓
9. ✅ Pedido completo no WooCommerce
   ✅ Pixel Facebook recebe dados corretos
```

---

## 🎯 Resultado Esperado

**Antes:**
```
Nome: Cliente Shopify
Email: sem-email@shopify.com
Telefone: (vazio)
Endereço: venecia, 398 - Rio segundo - Córdoba
```

**Depois:**
```
Nome: benjamin rapetti
Email: cliente@email.com
Telefone: +54 3572 60-4394
Endereço: venecia 398, 5960 Rio segundo Córdoba, Argentina
```

---

**Versão:** 1.0.0
**Data:** 2025-10-19
**Compatível com:** Shopify Basic Plan + WooCommerce
