# 🔄 Setup: Sincronização Periódica de Pedidos Antigos

Este documento explica como configurar a sincronização automática de pedidos antigos da Shopify para o WooCommerce.

## 📋 O Que Faz

O endpoint `/api/sync-old-orders` executa automaticamente a cada hora e:

1. ✅ Busca os últimos 250 pedidos da Shopify
2. ✅ Filtra pedidos que **NÃO** têm a tag `woocommerce-sync`
3. ✅ Sincroniza cada pedido para o WooCommerce
4. ✅ Adiciona a tag `woocommerce-sync` no Shopify (evita duplicação)
5. ✅ Retorna estatísticas detalhadas

## 🚀 Passo a Passo de Configuração

### 1️⃣ Gerar Token de Segurança

Gere um token aleatório seguro:

**Windows (PowerShell):**
```powershell
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
```

**Linux/Mac:**
```bash
openssl rand -hex 32
```

Copie o token gerado.

### 2️⃣ Configurar Variável de Ambiente no Vercel

1. Acesse: https://vercel.com/seu-projeto/settings/environment-variables
2. Adicione nova variável:
   - **Name:** `CRON_SECRET`
   - **Value:** (cole o token gerado)
   - **Environments:** ✅ Production, ✅ Preview, ✅ Development
3. Clique em **Save**

### 3️⃣ Adicionar ao `.env.local` (Desenvolvimento)

```bash
# Token para autenticar cron job
CRON_SECRET=seu_token_gerado_aqui_12345678
```

### 4️⃣ Deploy para o Vercel

```bash
# Fazer push das mudanças
git add .
git commit -m "feat: configure periodic sync cron job"
git push

# Vercel irá:
# 1. Detectar o vercel.json
# 2. Criar o cron job automaticamente
# 3. Executar a cada hora (cron: "0 * * * *")
```

### 5️⃣ Verificar Cron Job no Vercel

1. Acesse: https://vercel.com/seu-projeto/settings/crons
2. Você deve ver:
   ```
   Path: /api/sync-old-orders
   Schedule: 0 * * * * (Every hour at minute 0)
   Status: Active
   ```

---

## 🧪 Testar Manualmente (Antes do Deploy)

### Teste Local

```bash
# 1. Iniciar servidor de desenvolvimento
pnpm dev

# 2. Em outro terminal, fazer requisição POST
curl -X POST http://localhost:3000/api/sync-old-orders \
  -H "Authorization: Bearer SEU_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Teste em Produção

```bash
curl -X POST https://redirect-woo-shopify.vercel.app/api/sync-old-orders \
  -H "Authorization: Bearer SEU_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Resposta Esperada

```json
{
  "success": true,
  "message": "Sync completed",
  "stats": {
    "total_orders": 250,
    "already_synced": 230,
    "synced_now": 18,
    "failed": 2,
    "duration_ms": 45230
  },
  "results": {
    "synced": [5876543210, 5876543211, ...],
    "failed": [
      {
        "order_id": 5876543212,
        "error": "No mapped products"
      }
    ]
  }
}
```

---

## 📊 Monitoramento

### Ver Logs de Execução

1. **Vercel Dashboard** → seu projeto → **Logs**
2. Filtrar por: `/api/sync-old-orders`
3. Você verá:
   ```
   🔄 [Sync] Iniciando sincronização de pedidos antigos...
   📥 Buscando pedidos da Shopify...
   ✅ 250 pedidos encontrados na Shopify
   📋 18 pedidos precisam ser sincronizados
   📦 Processando pedido Shopify #1234...
   ✅ Pedido WooCommerce criado: #567
   ✅ [Sync] Sincronização concluída!
      Sincronizados: 18
      Falharam: 2
      Duração: 45230ms
   ```

### Verificar Pedidos no WooCommerce

1. Acesse **WooCommerce → Pedidos**
2. Filtre por **Nota do Cliente**: "Pedido Shopify"
3. Verifique **Metadados Personalizados**:
   ```
   _shopify_order_id: 5876543210
   _shopify_order_number: 1234
   _sync_source: periodic_sync
   ```

### Verificar Tags no Shopify

1. Acesse **Shopify Admin → Pedidos**
2. Pedidos sincronizados devem ter a tag: `woocommerce-sync`

---

## ⚙️ Configurações Avançadas

### Alterar Frequência do Cron

Edite `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync-old-orders",
      "schedule": "0 */2 * * *"  // A cada 2 horas
      // ou
      "schedule": "0 0 * * *"    // 1x por dia (meia-noite)
      // ou
      "schedule": "*/30 * * * *" // A cada 30 minutos
    }
  ]
}
```

Formato cron: `minuto hora dia mês dia_da_semana`

### Alterar Limite de Pedidos

Edite `src/app/api/sync-old-orders/route.ts` linha 281:

```typescript
const orders = await fetchShopifyOrders(500); // Era 250
```

**⚠️ Atenção:** 
- Shopify API limita a 250 pedidos por requisição
- Rate limit: 2 requisições/segundo (básico) ou 4/s (avançado)

### Alterar Delay Entre Pedidos

Edite linha 322:

```typescript
await new Promise(resolve => setTimeout(resolve, 1000)); // Era 500ms
```

---

## 🐛 Troubleshooting

### Erro 401 - Unauthorized

**Causa:** Token inválido

**Solução:**
1. Verifique se `CRON_SECRET` está configurado no Vercel
2. Verifique se o token no `Authorization: Bearer` está correto
3. Faça redeploy após adicionar a variável

### Erro 500 - Order not found

**Causa:** Produto não mapeado

**Solução:**
1. Verifique se todos os produtos estão importados no Supabase
2. Execute `/api/import-products` antes
3. Verifique os logs para ver qual SKU está faltando

### Cron Não Executa

**Verificar:**
1. `vercel.json` está no root do projeto? ✅
2. Arquivo commitado e pushed? ✅
3. Cron aparece em Vercel → Settings → Crons? ✅
4. Projeto está no plano Pro? (Crons requerem plano pago) ⚠️

**Solução:**
- Vercel Crons requerem **plano Pro** ($20/mês)
- Alternativa: usar serviço externo (cron-job.org, EasyCron)

### Rate Limit da Shopify

**Sintomas:**
```
429 Too Many Requests
```

**Solução:**
1. Aumentar delay entre pedidos (linha 322)
2. Reduzir frequência do cron (ex: a cada 2 horas)
3. Processar menos pedidos por execução

---

## 🎯 Fluxo Completo

```
Vercel Cron (a cada hora)
  ↓
POST /api/sync-old-orders
  ├─ Authenticate (Bearer token)
  ├─ Fetch Shopify orders (last 250)
  ├─ Filter by tag (without "woocommerce-sync")
  ↓
Para cada pedido:
  ├─ Check if exists in WooCommerce (idempotency)
  ├─ Map Shopify variants → WooCommerce products
  ├─ Parse note_attributes (Brazilian address)
  ├─ Create order in WooCommerce
  ├─ Add "woocommerce-sync" tag to Shopify
  └─ Delay 500ms (rate limiting)
  ↓
Return statistics:
  ├─ Total orders checked: 250
  ├─ Already synced: 230
  ├─ Synced now: 18
  ├─ Failed: 2
  └─ Duration: 45s
```

---

## ✅ Checklist de Validação

Antes de considerar completo:

- [ ] `CRON_SECRET` configurado no Vercel
- [ ] `CRON_SECRET` adicionado ao `.env.local`
- [ ] `vercel.json` commitado e pushed
- [ ] Deploy realizado com sucesso
- [ ] Cron aparece em Vercel → Settings → Crons
- [ ] Teste manual passou (POST com Bearer token)
- [ ] Primeiro cron automático executou (aguardar 1 hora)
- [ ] Pedidos aparecem no WooCommerce
- [ ] Tags aparecem na Shopify

---

## 📚 Comparação com Plugin PHP

| Feature                          | Plugin PHP      | Nossa Implementação |
| -------------------------------- | --------------- | ------------------- |
| Periodic sync                    | ✅ WordPress Cron | ✅ Vercel Cron        |
| Tag-based tracking               | ✅               | ✅                   |
| Idempotency                      | ✅               | ✅                   |
| Process note_attributes          | ❌               | ✅                   |
| Brazilian address parsing        | ❌               | ✅                   |
| Detailed logging                 | ⚠️ Básico        | ✅ Completo          |
| Statistics reporting             | ❌               | ✅                   |
| Rate limiting                    | ❌               | ✅                   |
| Duplicate prevention             | ⚠️ Race conditions | ✅ Robusto          |

---

**Versão:** 1.0.0  
**Data:** 2025-10-19  
**Compatível com:** Shopify Basic Plan + WooCommerce + Vercel  
