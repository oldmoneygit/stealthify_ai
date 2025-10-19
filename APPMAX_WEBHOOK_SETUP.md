# 🔔 Configuração do Apphook do Appmax

Este documento explica como configurar o webhook (Apphook) do Appmax para capturar os dados completos do cliente quando um pedido é aprovado.

## 📋 Problema que Resolve

A API da Shopify no plano básico **NÃO retorna** dados pessoais do cliente (PII):
- ❌ Nome do cliente
- ❌ Email
- ❌ Telefone
- ❌ Endereço completo

Mas o **Appmax TEM todos esses dados** quando processa o pagamento!

## 🚀 Solução

Configurar um **Apphook** (webhook) no Appmax para enviar os dados do cliente para nosso sistema quando o pedido for aprovado.

---

## 📝 Passo a Passo

### 1️⃣ Acessar Configuração de Apphooks

1. Acesse o **Painel do Appmax**
2. No menu lateral esquerdo, clique em **"Configurações"**
3. Clique em **"Apphooks (Webhook)"**
4. Clique no botão roxo **"Novo Webhook"**

### 2️⃣ Configurar o Apphook

Preencha os campos:

**Loja:**
- Selecione a loja cadastrada que vai enviar as notificações

**URL para Envio:**
```
https://SEU_DOMINIO.vercel.app/api/appmax-webhook
```

**IMPORTANTE:** Substituir `SEU_DOMINIO` pelo seu domínio real do Vercel!

### 3️⃣ Selecionar Eventos

Na seção **"Eventos"**, selecione:

#### Categoria: **Pedido**

**Escolha UM dos seguintes eventos:**

- ✅ **Pedido Pago** ← RECOMENDADO (dispara logo após pagamento ser confirmado)
- OU ✅ **Pedido aprovado** ← Alternativa (dispara após análise antifraude)

**Opcional (para ter mais controle):**

- ✅ Pedido Integrado (se quiser atualizar só após todas validações - mais lento)

**NÃO selecionar** (ainda):

- ❌ Cliente Criado (não tem endereço completo)
- ❌ Cliente interessado (abandono de carrinho)
- ❌ Boleto Gerado (só gera boleto)

### 4️⃣ Selecionar Template

Na seção **"Template"**, selecione:

✅ **Modelo padrão (Recomendado)**

Este modelo envia um JSON com as principais variáveis necessárias.

### 5️⃣ Testar e Salvar

1. Clique em **"Testar Eventos"** para enviar um teste
2. Verifique nos **logs do Vercel** se recebeu o webhook
3. Clique em **"Salvar"**

---

## 🔍 Verificar se Está Funcionando

### Método 1: Logs do Vercel

1. Acesse: https://vercel.com/seu-projeto
2. Clique na aba **"Logs"** ou **"Functions"**
3. Procure por:
   ```
   🔔 [Appmax Webhook] Recebendo webhook...
   📦 [Appmax Webhook] Evento: OrderApproved
   👤 [Appmax Webhook] Cliente: { name: "...", email: "...", phone: "..." }
   ```

### Método 2: Fazer Pedido de Teste

1. Faça um pedido de teste na Shopify
2. Complete o pagamento via Appmax (pode usar modo de teste)
3. Quando o pedido for aprovado, o Appmax vai disparar o webhook
4. Verifique no WooCommerce se o pedido foi atualizado com:
   - ✅ Nome completo do cliente
   - ✅ Email
   - ✅ Telefone
   - ✅ Endereço completo

---

## 🔧 Estrutura do Fluxo

```
1. Cliente finaliza compra na Shopify
   ↓
2. Shopify envia para Appmax processar pagamento
   ↓
3. Appmax processa pagamento
   ↓
4. Appmax dispara webhook → /api/shopify-order-webhook (Shopify → WooCommerce)
   └─ Cria pedido no WooCommerce SEM dados do cliente (API limitada)
   ↓
5. Appmax aprova pagamento
   ↓
6. Appmax dispara Apphook "Pedido aprovado" → /api/appmax-webhook
   ↓
7. Sistema busca pedido na Shopify pelo appmax_order_id
   ↓
8. Sistema encontra shopify_order_id correspondente
   ↓
9. Sistema busca pedido no WooCommerce pelo shopify_order_id
   ↓
10. Sistema atualiza pedido no WooCommerce com dados completos
    ↓
11. ✅ Pedido completo no WooCommerce!
    ✅ Nome: "benjamin rapetti"
    ✅ Telefone: "+54 3572 60-4394"
    ✅ Email: cliente@email.com
    ✅ Endereço: venecia 398, Rio segundo, Córdoba
```

---

## 📊 Dados Enviados pelo Appmax

O Appmax envia um payload JSON como este:

```json
{
  "event": "OrderApproved",
  "order": {
    "id": 98511315,
    "status": "approved",
    "total": 82713.38,
    "customer": {
      "id": 12345,
      "name": "benjamin rapetti",
      "email": "cliente@email.com",
      "phone": "+54 3572 60-4394",
      "document": "12345678900"
    },
    "billing_address": {
      "street": "venecia",
      "number": "398",
      "complement": "",
      "neighborhood": "Centro",
      "city": "Rio segundo",
      "state": "Córdoba",
      "zipcode": "5960",
      "country": "Argentina"
    },
    "shipping_address": {
      "street": "venecia",
      "number": "398",
      "complement": "",
      "neighborhood": "Centro",
      "city": "Rio segundo",
      "state": "Córdoba",
      "zipcode": "5960",
      "country": "Argentina"
    },
    "payment_method": "credit_card",
    "created_at": "2025-10-19T10:41:53"
  }
}
```

**Nosso sistema usa esses dados para atualizar o WooCommerce!**

---

## 🐛 Troubleshooting

### Webhook não está sendo recebido

1. **Verificar URL:** A URL está correta? `https://...vercel.app/api/appmax-webhook`
2. **Verificar eventos:** "Pedido aprovado" está selecionado?
3. **Verificar loja:** A loja selecionada é a correta?
4. **Testar:** Clique em "Testar Eventos" no Appmax

### Pedido não está sendo atualizado

1. **Verificar logs:** Procure por erros nos logs do Vercel
2. **Verificar appmax_order_id:** O pedido da Shopify tem `note_attributes` com `appmax_order_id`?
3. **Verificar timing:** O webhook do Shopify já criou o pedido no WooCommerce?

### Erro: "Shopify Order ID not found"

Isso acontece quando:
- O webhook do Appmax chega **ANTES** do webhook da Shopify
- O pedido ainda não foi criado no WooCommerce

**Solução:** Configure um delay no Apphook (ex: "Pedido aprovado com atraso (60min)")

---

## 📈 Próximos Passos

Após configurar e testar:

1. ✅ Desabilite o script da Thank You Page (se estava usando)
2. ✅ Monitore alguns pedidos reais
3. ✅ Verifique se os dados estão corretos no WooCommerce
4. ✅ Confirme se o Pixel do Facebook está recebendo dados corretos

---

**Versão:** 1.0.0
**Data:** 2025-10-19
**Compatível com:** Appmax + Shopify + WooCommerce
