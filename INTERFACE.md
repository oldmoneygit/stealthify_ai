# 🎨 Interface Web - Brand Camouflage System

## 🚀 Como Usar

### 1. **Iniciar o Servidor**

```bash
pnpm dev
```

Acesse: `http://localhost:3000`

---

## 📱 Páginas Disponíveis

### 🏠 **Home** (`/`)
Redireciona para `/products`

### 📦 **Produtos** (`/products`)
- Lista produtos do WooCommerce
- Botão para analisar cada produto
- Status de análise

### ✅ **Produtos Editados** (`/edited`)
**NOVA PÁGINA PRINCIPAL!**

#### **Recursos**:
- 📊 **Dashboard com Estatísticas**
  - Total de análises
  - % Produtos limpos
  - Risk Score médio
  - Armazenamento em disco

- 🖼️ **Cards de Produtos**
  - Comparação Before/After (botão toggle)
  - Título original → camuflado
  - Marcas detectadas e removidas
  - Risk Score visual (barra de progresso)
  - Status (✅ Limpo / ⚠️ Blur / ❌ Falhou)
  - Data/hora da análise
  - Indicador de arquivo salvo localmente (💾)

- 🔍 **Filtros e Busca**
  - Buscar por SKU ou nome
  - Filtrar por status (Todos / Limpos / Com Blur / Falhos)

- 📤 **Exportação**
  - **CSV**: Formato Shopify (pronto para importar)
  - **JSON**: Dados completos

- 🛒 **Importação Individual**
  - Botão "Importar para Shopify" em cada produto limpo
  - (Requer implementação da API de importação)

---

## 🎯 Fluxo de Uso

### **Workflow Completo**:

```
1. Executar Pipeline
   └─> pnpm test:pipeline
   └─> Ou API POST /api/analyze

2. Acessar /edited
   └─> Ver todos os produtos editados
   └─> Comparar antes/depois
   └─> Verificar risk scores

3. Exportar em Massa
   └─> Clicar "Exportar CSV"
   └─> Importar no Shopify manualmente

OU

3. Importar Individualmente
   └─> Clicar "Importar para Shopify" no card
   └─> Produto vai direto para Shopify via API
```

---

## 📊 API Endpoints

### **GET /api/products/edited**
Retorna produtos editados

**Query Params**:
- `status=clean|blur_applied|failed` - Filtrar por status
- `brand=Nike` - Filtrar por marca
- `limit=20` - Limitar resultados

**Response**:
```json
{
  "success": true,
  "count": 10,
  "products": [
    {
      "sku": "NIKE-001",
      "originalName": "Nike Air Jordan 1",
      "camouflagedName": "NK Air JD 1",
      "price": 150.00,
      "originalImage": "https://...",
      "editedImage": "data:image/png;base64,...",
      "localImagePath": "output/edited-images/NIKE-001_1234567890.png",
      "brandsDetected": ["Nike", "Jordan"],
      "riskScore": 0,
      "status": "clean",
      "analyzedAt": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### **GET /api/stats**
Retorna estatísticas

**Response**:
```json
{
  "success": true,
  "analysis": {
    "total": 50,
    "clean": 45,
    "blurApplied": 3,
    "failed": 2,
    "avgRiskScore": 12,
    "topBrands": [
      { "brand": "Nike", "count": 25 },
      { "brand": "Adidas", "count": 15 }
    ]
  },
  "storage": {
    "imagesCount": 45,
    "totalSizeMB": 12.5
  }
}
```

### **GET /api/export?format=csv|json**
Exporta produtos limpos

**Response**: Arquivo para download

---

## 🎨 Componentes

### **EditedProductCard**
Card individual de produto editado

**Props**:
```typescript
{
  sku: string;
  originalName: string;
  camouflagedName: string;
  price: number;
  originalImage: string;
  editedImage: string;
  localImagePath: string | null;
  brandsDetected: string[];
  riskScore: number;
  status: 'clean' | 'blur_applied' | 'failed';
  analyzedAt: string;
  onImportToShopify?: () => Promise<void>;
}
```

**Recursos**:
- Toggle Before/After
- Status badge
- Risk score visual
- Botão de importação
- Indicador de arquivo local

---

## 🎨 Design System

### **Cores por Status**:
- ✅ Limpo: Verde (`green-600`)
- ⚠️ Blur: Amarelo (`yellow-600`)
- ❌ Falhou: Vermelho (`red-600`)

### **Risk Score Colors**:
- 0-20: Verde
- 21-40: Amarelo
- 41-100: Vermelho

---

## 📁 Estrutura de Arquivos

```
src/
├── app/
│   ├── layout.tsx              ← Layout com navegação
│   ├── page.tsx                ← Home (redirect)
│   ├── edited/
│   │   └── page.tsx            ← Página de produtos editados ⭐
│   └── api/
│       ├── products/
│       │   └── edited/route.ts ← API de produtos editados
│       ├── stats/route.ts      ← API de estatísticas
│       └── export/route.ts     ← API de exportação
│
└── components/
    └── EditedProductCard.tsx   ← Card de produto editado
```

---

## 🧪 Teste Rápido

```bash
# 1. Rodar pipeline para ter dados
pnpm test:pipeline

# 2. Iniciar dev server
pnpm dev

# 3. Acessar
http://localhost:3000/edited

# 4. Ver produtos editados com comparação before/after
# 5. Exportar CSV clicando no botão
```

---

## 🚀 Próximos Passos (Opcional)

### **Implementar Importação Individual para Shopify**:

Criar `src/app/api/shopify/import/route.ts`:
```typescript
export async function POST(request: Request) {
  const { sku } = await request.json();

  // 1. Buscar produto e análise no banco
  // 2. Usar shopify.service.ts para criar produto
  // 3. Retornar sucesso/erro
}
```

### **Adicionar Bulk Import**:
Botão "Importar Todos" que importa todos os produtos limpos de uma vez.

### **Histórico de Importações**:
Salvar no banco quando produto foi importado para Shopify.

---

## 💡 Dicas

- **Performance**: As imagens são carregadas do disco local quando disponíveis (mais rápido)
- **Fallback**: Se arquivo local não existir, usa base64 do banco
- **Comparação**: Clique no botão "👁️" para alternar between original/editada
- **Filtros**: Use os filtros para encontrar produtos específicos rapidamente
- **Exportação**: CSV está no formato correto para importação direta no Shopify

---

✅ **Interface completa e funcional!** 🎉
