# 🔐 Configuração de Environment Variables

## ⚠️ IMPORTANTE: Configure antes de testar as APIs

Para que a **FASE 2** funcione, você precisa criar o arquivo `.env.local` com suas credenciais reais.

---

## 📝 Passo a Passo

### 1. Copiar Template

```bash
cp .env.example .env.local
```

### 2. Editar .env.local

Abra o arquivo `.env.local` e adicione suas credenciais:

```env
# WooCommerce
WOOCOMMERCE_URL=https://sua-loja.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxxxxxxxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxxxxxxxxxx

# Shopify
SHOPIFY_STORE_URL=https://sua-loja.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxxxxxxxxxx

# Google Cloud
GOOGLE_GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxx
GOOGLE_CLOUD_PROJECT_ID=seu-project-id-12345
GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"seu-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...@....iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

NODE_ENV=development
```

---

## 🔑 Como Obter Credenciais

### WooCommerce

1. Acesse: `https://sua-loja.com/wp-admin`
2. Vá em: **WooCommerce** → **Configurações** → **Avançado** → **API REST**
3. Clique em **Adicionar chave**
4. Configure:
   - **Descrição**: Brand Camouflage System
   - **Usuário**: Seu usuário admin
   - **Permissões**: Leitura/Gravação
5. Copie **Consumer Key** e **Consumer Secret**

### Shopify

1. Acesse: `https://sua-loja.myshopify.com/admin`
2. Vá em: **Configurações** → **Apps e canais de vendas**
3. Clique em **Desenvolver apps**
4. Crie um novo app privado
5. Configure os escopos:
   - `read_products`
   - `write_products`
6. Instale o app e copie o **Access Token**

### Google Gemini API

1. Acesse: https://aistudio.google.com/app/apikey
2. Crie uma nova API Key
3. Copie a chave

### Google Vertex AI (Service Account)

1. Acesse: https://console.cloud.google.com
2. Crie/selecione um projeto
3. Vá em: **IAM & Admin** → **Service Accounts**
4. Crie uma Service Account com permissões:
   - Vertex AI User
   - Service Account Token Creator
5. Crie uma chave JSON
6. Copie o conteúdo do arquivo JSON inteiro (tudo em uma única linha)

---

## ✅ Validar Configuração

Após configurar `.env.local`, execute:

```bash
pnpm test:apis
```

Você deve ver:

```
🧪 Testando conexões com APIs...

📦 [1/4] WooCommerce REST API...
✅ WooCommerce: Conexão OK

🛍️ [2/4] Shopify Admin API...
✅ Shopify: Conexão OK - Sua Loja

🔐 [3/4] Google Vertex AI Authentication...
✅ Vertex AI: Access token obtido
✅ Vertex AI: Autenticação OK

🤖 [4/4] Google Gemini API...
✅ Gemini: Conexão OK

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Todas as APIs estão funcionando!

🎯 Próximo passo: FASE 3 - Serviços de IA
```

---

## 🐛 Troubleshooting

### WooCommerce: 401 Unauthorized
- Verifique Consumer Key e Secret
- Certifique-se que a URL termina sem `/`
- Verifique permissões da API Key (deve ser Leitura/Gravação)

### Shopify: 403 Forbidden
- Verifique Access Token
- Certifique-se que o app tem os escopos corretos
- Verifique se a URL está correta: `https://sua-loja.myshopify.com`

### Vertex AI: Authentication Failed
- Verifique se o JSON da Service Account está correto
- Certifique-se que está em uma única linha (sem quebras)
- Verifique se o projeto tem Vertex AI habilitado
- Confirme as permissões da Service Account

### Gemini: Invalid API Key
- Verifique se a API Key está correta
- Certifique-se que a API está habilitada no projeto

---

## 🔒 Segurança

**NUNCA** commite o arquivo `.env.local`!

Ele está no `.gitignore` para evitar vazamento de credenciais.

---

**Após configurar e validar, você está pronto para a FASE 3!** 🚀
