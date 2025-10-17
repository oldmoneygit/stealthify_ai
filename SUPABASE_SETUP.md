# 🚀 Guia Completo: Migração SQLite → Supabase

## 📋 Passo a Passo

### **Passo 1: Executar Schema SQL no Supabase**

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto: `fjtsikorywkvlcpmvbse`
3. No menu lateral, clique em **SQL Editor**
4. Clique em **New Query**
5. Cole o conteúdo do arquivo [`database/supabase-schema.sql`](database/supabase-schema.sql)
6. Clique em **RUN** ou pressione `Ctrl + Enter`

**✅ Resultado Esperado:**
```
✅ Schema criado com sucesso!
```

Se der erro, pode ser que as tabelas já existam. Nesse caso, o script vai dropar e recriar.

---

### **Passo 2: Criar Script de Migração de Dados**

Vou criar um script que copia todos os dados do SQLite para o Supabase.

**Arquivo**: `scripts/migrate-sqlite-to-supabase.ts`

Este script vai:
1. Ler todos os produtos do SQLite
2. Inserir no Supabase
3. Ler todas as análises do SQLite
4. Inserir no Supabase

---

### **Passo 3: Executar Migração**

No terminal, execute:

```bash
npx tsx scripts/migrate-sqlite-to-supabase.ts
```

**Tempo estimado**: 2-5 minutos (depende do número de produtos)

---

### **Passo 4: Verificar Dados no Supabase**

1. Acesse: https://supabase.com/dashboard
2. No menu lateral, clique em **Table Editor**
3. Verifique as tabelas:
   - **products**: Deve ter todos os produtos do WooCommerce
   - **analyses**: Deve ter todas as análises com imagens editadas

---

### **Passo 5: Configurar Variáveis de Ambiente no Vercel**

1. Acesse: https://vercel.com/dashboard
2. Selecione seu projeto: `redirect-woo-shopify`
3. Vá em **Settings** → **Environment Variables**
4. Adicione as seguintes variáveis:

```
NEXT_PUBLIC_SUPABASE_URL=https://fjtsikorywkvlcpmvbse.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdHNpa29yeXdrdmxjcG12YnNlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDcyNDk4MCwiZXhwIjoyMDc2MzAwOTgwfQ.SiD2FjHzl32RjWLtW9y0M_zAfmLpSSyKyO8SNUeElGc
```

5. Clique em **Save**

---

### **Passo 6: Deploy e Teste**

Agora vou fazer commit e push das alterações:

```bash
git add .
git commit -m "feat: migrate from SQLite to Supabase for serverless deployment"
git push origin main
```

O Vercel vai fazer deploy automático (~2 minutos).

---

### **Passo 7: Testar Redirecionamento**

Depois do deploy, teste a API:

```bash
curl -X POST https://redirect-woo-shopify.vercel.app/api/woo-to-shopify-redirect \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"SEU_SKU_AQUI","quantity":1}]}'
```

**✅ Resultado Esperado:**
```json
{
  "success": true,
  "checkout_url": "https://sua-loja.myshopify.com/..."
}
```

---

## 🎯 Resumo das Mudanças

### **Arquivos Criados:**
- ✅ `src/lib/supabase.ts` - Cliente Supabase com todas as funções
- ✅ `database/supabase-schema.sql` - Schema PostgreSQL
- ✅ `scripts/migrate-sqlite-to-supabase.ts` - Script de migração

### **Arquivos Modificados:**
- ✅ `src/app/api/woo-to-shopify-redirect/route.ts` - Usa Supabase agora
- ✅ `.env.example` - Documentação das credenciais
- ✅ `.env.local` - Credenciais locais configuradas
- ✅ `package.json` - Adicionado `@supabase/supabase-js`

---

## 🔍 Como Funciona Agora

### **Antes (SQLite):**
```
WooCommerce → JavaScript → API Vercel → ❌ SQLite (não funciona)
```

### **Depois (Supabase):**
```
WooCommerce → JavaScript → API Vercel → ✅ Supabase Postgres → Shopify
                                              ↑
                                          24/7 na nuvem!
```

---

## ✅ Vantagens

1. **24/7 Online**: Funciona sem seu computador ligado
2. **Serverless**: Escala automaticamente
3. **Rápido**: Postgres otimizado
4. **Confiável**: Backup automático
5. **Gratuito**: Plano gratuito do Supabase (500 MB, 50.000 rows)

---

## 🎉 Próximos Passos

Após a migração estar completa:

1. ✅ Executar schema no Supabase
2. ✅ Executar migração de dados
3. ✅ Configurar variáveis no Vercel
4. ✅ Deploy no Vercel
5. ✅ Testar redirect API
6. ✅ Instalar JavaScript no WooCommerce
7. ✅ Testar fluxo completo end-to-end

---

**Pronto para começar?** Execute o Passo 1 agora! 🚀
