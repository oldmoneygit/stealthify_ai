# 🔄 Shopify Order Sync Setup

## Visão Geral

Este sistema sincroniza automaticamente pedidos da Shopify de volta para o WooCommerce, garantindo que os pedidos apareçam com os produtos corretos (não camuflados) e com os dados completos do cliente.

**Fluxo**:
```
Cliente finaliza compra na Shopify
    ↓
Shopify envia webhook para nossa API
    ↓
API mapeia produtos Shopify → WooCommerce
    ↓
API cria pedido no WooCommerce
    ↓
Lojista processa pedido normalmente
```

---

## 📋 Pré-requisitos

- ✅ Sistema de redirecionamento WooCommerce → Shopify funcionando
- ✅ Produtos já importados na Shopify com variant IDs salvos no Supabase
- ✅ Deploy do sistema no Vercel ou servidor público (webhooks precisam de URL pública)

---

## 🔧 Setup Passo a Passo

### Passo 1: Adicionar Variável de Ambiente

Adicione no seu `.env.local` (ou nas Environment Variables do Vercel):

```bash
SHOPIFY_WEBHOOK_SECRET=seu-secret-aqui
```

**Como gerar o secret**:
```bash
# Gerar um secret aleatório forte
openssl rand -base64 32
```

Exemplo:
```bash
SHOPIFY_WEBHOOK_SECRET=x8P2kL9mN4vQ7wR3tY6uJ1hG5fD8aS2eX9cV4bZ7nM0o
```

### Passo 2: Deploy da Aplicação

**Se usar Vercel**:
```bash
# 1. Commit e push das mudanças
git add .
git commit -m "feat: add Shopify order sync webhook"
git push

# 2. Vercel irá fazer deploy automaticamente
```

**Se usar outro servidor**:
```bash
pnpm build
pnpm start
```

Certifique-se de que sua aplicação está acessível publicamente em:
```
https://seu-dominio.com/api/shopify-order-webhook
```

### Passo 3: Adicionar Webhook na Shopify

#### Opção A: Via Shopify Admin (Interface Web)

1. **Acesse Shopify Admin**:
   - Vá para: https://sua-loja.myshopify.com/admin
   - Settings → Notifications → Webhooks

2. **Criar Webhook**:
   - Clique em "Create webhook"
   - **Event**: `Order creation` (orders/create)
   - **Format**: `JSON`
   - **URL**: `https://seu-dominio.vercel.app/api/shopify-order-webhook`
   - **Webhook API version**: `2024-01` (ou mais recente)

3. **Salvar**:
   - Clique em "Save webhook"
   - A Shopify irá gerar um secret automaticamente

4. **Copiar Secret**:
   - Na lista de webhooks, clique no webhook criado
   - Copie o valor do campo "Secret"
   - Este é o valor que você deve usar em `SHOPIFY_WEBHOOK_SECRET`

#### Opção B: Via Shopify CLI

```bash
# 1. Instalar Shopify CLI (se ainda não tiver)
pnpm add -g @shopify/cli

# 2. Fazer login
shopify auth login

# 3. Criar webhook
shopify webhook create \
  --topic orders/create \
  --address https://seu-dominio.vercel.app/api/shopify-order-webhook \
  --api-version 2024-01
```

#### Opção C: Via API (cURL)

```bash
curl -X POST \
  "https://sua-loja.myshopify.com/admin/api/2024-01/webhooks.json" \
  -H "X-Shopify-Access-Token: SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "topic": "orders/create",
      "address": "https://seu-dominio.vercel.app/api/shopify-order-webhook",
      "format": "json"
    }
  }'
```

### Passo 4: Atualizar Environment Variable com o Secret

**No Vercel**:
1. Vá em: Settings → Environment Variables
2. Edite `SHOPIFY_WEBHOOK_SECRET`
3. Cole o secret copiado da Shopify
4. Clique em "Save"
5. Faça um novo deploy (Deployments → Redeploy)

**Se rodar local**:
1. Edite `.env.local`
2. Atualize `SHOPIFY_WEBHOOK_SECRET` com o secret da Shopify
3. Reinicie o servidor: `pnpm dev`

---

## 🧪 Testando o Webhook

### Teste 1: Verificar Endpoint

```bash
# O endpoint deve estar acessível
curl https://seu-dominio.vercel.app/api/shopify-order-webhook
```

Resposta esperada: `{"success":false,"error":"Invalid webhook signature"}`
(Isso é esperado, pois não enviamos a assinatura HMAC)

### Teste 2: Criar Pedido de Teste na Shopify

1. **Via Shopify Admin**:
   - Settings → Notifications → Webhooks
   - Clique no webhook criado
   - Clique em "Send test notification"
   - A Shopify enviará um pedido fictício

2. **Verificar Logs**:
   - **Vercel**: Vá em Deployments → Function Logs
   - **Local**: Veja o console do terminal

3. **Verificar WooCommerce**:
   - Acesse: WooCommerce → Orders
   - Deve aparecer um novo pedido com:
     - Status: `processing` ou `on-hold`
     - Meta dados: `_shopify_order_id`, `_synced_from_shopify`
     - Produtos mapeados corretamente

### Teste 3: Pedido Real

1. Acesse sua loja WooCommerce
2. Adicione um produto ao carrinho
3. Clique em "Finalizar Compra"
4. Você será redirecionado para Shopify
5. Complete o pagamento (pode usar cartão de teste)
6. O webhook será disparado automaticamente
7. Verifique se o pedido apareceu no WooCommerce

---

## 📊 Monitoramento

### Logs do Webhook

**O webhook loga cada etapa**:
```
📥 [Webhook] Recebendo webhook da Shopify...
✅ [Webhook] Assinatura verificada
📦 [Webhook] Pedido Shopify recebido: { shopify_order_id, email, total }
🔄 [Webhook] Mapeando produtos...
✅ [Webhook] Mapeado: Nike Air Jordan 1 → WooCommerce product 12345
📝 [Webhook] Status mapeado: { shopify_financial: 'paid', woo_status: 'processing' }
🛒 [Webhook] Criando pedido no WooCommerce...
✅ [Webhook] Pedido criado no WooCommerce: { woo_order_id: 789 }
```

### Verificar Status na Shopify

1. Shopify Admin → Settings → Notifications → Webhooks
2. Clique no webhook
3. Veja "Recent deliveries" para ver status das últimas execuções

### Webhook Delivery Status

- ✅ **200 OK**: Webhook processado com sucesso
- ⚠️ **401 Unauthorized**: Assinatura HMAC inválida (verifique o secret)
- ❌ **404 Not Found**: Produto não encontrado no Supabase
- ❌ **500 Internal Error**: Erro ao criar pedido no WooCommerce

---

## 🔍 Troubleshooting

### Erro: "Invalid webhook signature"

**Causa**: Secret do webhook não corresponde

**Solução**:
1. Verifique se `SHOPIFY_WEBHOOK_SECRET` está correto no Vercel
2. Copie o secret exato da Shopify Admin (Settings → Webhooks)
3. Faça redeploy após atualizar

### Erro: "Nenhum produto foi mapeado para WooCommerce"

**Causa**: Shopify variant IDs não estão no Supabase

**Solução**:
```bash
# Rodar script de atualização
npx tsx scripts/update-supabase-shopify-ids.ts
```

Isso irá sincronizar os variant IDs do SQLite para o Supabase.

### Erro: "Failed to create WooCommerce order"

**Causa**: Credenciais WooCommerce inválidas ou produto não existe

**Solução**:
1. Verifique `WOOCOMMERCE_CONSUMER_KEY` e `WOOCOMMERCE_CONSUMER_SECRET`
2. Teste conexão: `npx tsx scripts/test-apis.ts`
3. Verifique se os produtos existem no WooCommerce

### Webhook não está sendo disparado

**Causa**: URL do webhook incorreta ou Shopify não consegue acessar

**Solução**:
1. Verifique se URL está correta na Shopify Admin
2. Teste manualmente: "Send test notification"
3. Verifique se o domínio está acessível publicamente
4. Certifique-se de que não há firewall bloqueando

### Pedidos duplicados

**Causa**: Shopify pode reenviar webhooks em caso de timeout

**Solução**: Implementar idempotência
```typescript
// Verificar se pedido já existe antes de criar
const existingOrder = await checkIfOrderExists(shopifyOrderId);
if (existingOrder) {
  return NextResponse.json({ success: true, already_exists: true });
}
```

---

## 🔐 Segurança

### HMAC Signature Verification

O webhook **SEMPRE** verifica a assinatura HMAC da Shopify:

```typescript
const hash = crypto
  .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
  .update(bodyText, 'utf8')
  .digest('base64');

if (hash !== hmacHeader) {
  return 401 Unauthorized;
}
```

Isso garante que apenas a Shopify pode disparar o webhook.

### Recomendações

- ✅ Use secret forte (mínimo 32 caracteres)
- ✅ Mantenha secret em variável de ambiente (nunca no código)
- ✅ Use HTTPS (obrigatório para webhooks Shopify)
- ✅ Monitore logs de webhooks regularmente
- ✅ Implemente rate limiting se necessário

---

## 📈 Mapeamento de Status

### Shopify → WooCommerce

| Shopify Financial Status | Shopify Fulfillment | WooCommerce Status |
|-------------------------|--------------------|--------------------|
| `pending`               | `null`             | `pending`          |
| `authorized`            | `null`             | `on-hold`          |
| `paid`                  | `null`             | `processing`       |
| `paid`                  | `fulfilled`        | `completed`        |
| `partially_paid`        | `null`             | `on-hold`          |
| `refunded`              | `*`                | `refunded`         |
| `voided`                | `*`                | `cancelled`        |

---

## 📝 Dados Sincronizados

### Do Shopify para WooCommerce

✅ **Customer Info**:
- Nome completo (first_name + last_name)
- Email
- Telefone
- Endereço de cobrança completo
- Endereço de entrega completo

✅ **Order Items**:
- Produtos (mapeados via Shopify variant ID → WooCommerce product ID)
- Quantidades
- Preços

✅ **Order Meta**:
- `_shopify_order_id`: ID do pedido na Shopify
- `_shopify_order_number`: Número do pedido (ex: #1001)
- `_synced_from_shopify`: Flag de sincronização
- `_sync_date`: Data/hora da sincronização

✅ **Order Status**:
- Mapeado automaticamente conforme tabela acima

---

## 🎯 Próximos Passos

Após o webhook funcionar corretamente:

1. **Teste com volume**: Crie 5-10 pedidos de teste
2. **Monitore por 24h**: Verifique se todos os webhooks são processados
3. **Configure alertas**: Implemente notificações para erros
4. **Documente workflow**: Treine equipe sobre novo fluxo
5. **Go live**: Ative para todos os clientes

---

## 🆘 Suporte

Se encontrar problemas:

1. **Verifique logs**: Vercel Function Logs ou console local
2. **Teste manualmente**: Use "Send test notification" na Shopify
3. **Valide credenciais**: Rode `npx tsx scripts/test-apis.ts`
4. **Verifique mapeamento**: Confirme que produtos têm variant IDs no Supabase

---

## ✅ Checklist de Validação

Antes de considerar o setup completo:

- [ ] Variável `SHOPIFY_WEBHOOK_SECRET` configurada
- [ ] Webhook criado na Shopify Admin
- [ ] URL do webhook aponta para domínio público correto
- [ ] Teste de webhook enviado com sucesso (200 OK)
- [ ] Pedido de teste aparece no WooCommerce
- [ ] Produtos mapeados corretamente
- [ ] Customer data correto no pedido WooCommerce
- [ ] Status do pedido apropriado
- [ ] Meta dados `_shopify_order_id` presente
- [ ] Pedido real testado end-to-end

---

**Versão**: 1.0.0
**Última Atualização**: 2025-01-17
**Compatível com**: Shopify API 2024-01, WooCommerce REST API v3
