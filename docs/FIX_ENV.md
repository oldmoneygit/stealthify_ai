# 🔧 Como Corrigir o .env.local

## 📊 Status Atual

✅ **WooCommerce** - Funcionando perfeitamente!
✅ **Shopify** - Funcionando perfeitamente!
❌ **Vertex AI** - JSON inválido
❌ **Gemini** - API Key com problema

---

## 🔴 Problema 1: Vertex AI Service Account JSON

### O Problema

O JSON está truncado ou com quebras de linha. Ele começa com `{...` ao invés de `{"type":"service_account"...`

### A Solução

1. **Obtenha o arquivo JSON da Service Account:**
   - Vá em: https://console.cloud.google.com
   - Projeto: `woocommerce-shopify-466714`
   - IAM & Admin → Service Accounts
   - Encontre sua service account
   - Ações → Gerenciar chaves → Adicionar chave → Criar nova chave → JSON
   - Faça download do arquivo JSON

2. **Converta para uma única linha:**

Você tem 3 opções:

#### Opção A: Usando ferramenta online
- Vá em: https://codebeautify.org/json-minify
- Cole o conteúdo do arquivo JSON
- Clique em "Minify/Compact"
- Copie o resultado

#### Opção B: Usando Node.js (recomendado)
```bash
node -e "console.log(JSON.stringify(require('./caminho/para/service-account.json')))"
```

#### Opção C: Manualmente
- Abra o arquivo JSON
- Remova TODAS as quebras de linha
- Remova TODOS os espaços em branco extras
- Deve ficar: `{"type":"service_account","project_id":"woocommerce-shopify-466714",...}`

3. **Cole no .env.local:**

```env
GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"woocommerce-shopify-466714","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@woocommerce-shopify-466714.iam.gserviceaccount.com",...}
```

**IMPORTANTE:**
- Tudo em UMA ÚNICA LINHA
- NÃO adicione aspas ao redor do JSON
- NÃO quebre em múltiplas linhas

---

## 🔴 Problema 2: Gemini API Key

### O Problema

A API Key pode estar incompleta ou inválida.

### A Solução

1. **Verifique a API Key:**
   - Vá em: https://aistudio.google.com/app/apikey
   - Crie uma nova API Key (ou use existente)
   - Copie COMPLETA

2. **Formato correto:**
```env
GOOGLE_GEMINI_API_KEY=AIzaSyCXTcdKCEMxxxxxxxxxxxxxxxxxxxxxxxx
```

**IMPORTANTE:**
- A chave deve começar com `AIzaSy`
- Deve ter aproximadamente 39 caracteres
- Sem espaços, sem aspas

---

## ✅ Validar Correções

Após corrigir o `.env.local`:

### 1. Validar formato:
```bash
pnpm validate:env
```

Deve mostrar:
```
✅ Service Account JSON é válido
   Email: ...@woocommerce-shopify-466714.iam.gserviceaccount.com
   Project ID: woocommerce-shopify-466714
```

### 2. Testar APIs:
```bash
pnpm test:apis
```

Deve mostrar:
```
✅ WooCommerce: Conexão OK
✅ Shopify: Conexão OK
✅ Vertex AI: Autenticação OK
✅ Gemini: Conexão OK
```

---

## 📝 Template Completo do .env.local

```env
# WooCommerce
WOOCOMMERCE_URL=https://snkhouse.com
WOOCOMMERCE_CONSUMER_KEY=ck_4c2b449...
WOOCOMMERCE_CONSUMER_SECRET=cs_bdc8eca...

# Shopify
SHOPIFY_STORE_URL=https://dq3gzg-a6.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_6c7dc42cc...

# Google Cloud
GOOGLE_GEMINI_API_KEY=AIzaSyCXTcdKCEMxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CLOUD_PROJECT_ID=woocommerce-shopify-466714
GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"woocommerce-shopify-466714","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@woocommerce-shopify-466714.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

NODE_ENV=development
```

---

## 🆘 Ainda com problemas?

### Vertex AI não funciona?

1. **Verifique permissões da Service Account:**
   - Deve ter: "Vertex AI User"
   - Deve ter: "Service Account Token Creator"

2. **Habilite as APIs:**
   ```
   https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
   ```

### Gemini não funciona?

1. **Habilite a API:**
   ```
   https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com
   ```

2. **Crie nova API Key:**
   - Em: https://aistudio.google.com/app/apikey
   - Projeto: woocommerce-shopify-466714

---

**Após corrigir, execute:**
```bash
pnpm validate:env
pnpm test:apis
```

Se tudo estiver ✅, você está pronto para a **FASE 3**! 🚀
