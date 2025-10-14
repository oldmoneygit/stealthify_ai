# 🗺️ ROADMAP - Brand Camouflage System

> Plano de implementação fase por fase
> Cada fase deve ser completada e testada antes de prosseguir

---

## 📋 Visão Geral

**Tempo Estimado Total**: 15-20 horas
**Fases**: 5
**Critério de Sucesso**: Pipeline completo funcionando end-to-end com 1 clique

---

## 🎯 FASE 1: Setup e Estrutura Base (2-3h)

### **Objetivo**
Criar estrutura do projeto, configurar TypeScript strict mode, e inicializar banco de dados.

### **Tarefas**

1. **Inicializar Projeto Next.js**
```bash
pnpm create next-app@latest brand-camouflage --typescript --tailwind --app
cd brand-camouflage
```

2. **Configurar TypeScript Strict**
```bash
# Editar tsconfig.json conforme CLAUDE.md
# Adicionar regras: noImplicitAny, strictNullChecks, noUncheckedIndexedAccess
```

3. **Instalar Dependências**
```bash
pnpm add better-sqlite3 @woocommerce/woocommerce-rest-api sharp
pnpm add -D @types/better-sqlite3
```

4. **Criar Estrutura de Diretórios**
```bash
mkdir -p src/{services,lib,utils,components}
mkdir -p database/migrations
mkdir -p scripts
```

5. **Criar Database Schema**
```bash
# Criar database/schema.sql conforme especificação
pnpm db:init
```

6. **Setup Environment Variables**
```bash
cp .env.example .env.local
# Adicionar credenciais reais
```

### **Critérios de Sucesso**
- [ ] `pnpm type-check` passa sem erros
- [ ] Database inicializado corretamente
- [ ] Environment variables configuradas
- [ ] Estrutura de diretórios criada

### **Commit**
```bash
git add .
git commit -m "feat: initial project setup with strict TypeScript and database"
```

---

## 🎯 FASE 2: Integrações de API (3-4h)

### **Objetivo**
Implementar clients para WooCommerce, Shopify, e Google Cloud.

### **Tarefas**

1. **WooCommerce Service**
```typescript
// src/services/woocommerce.service.ts
- fetchProducts()
- getProduct(id)
- Salvar no database
```

2. **Shopify Service**
```typescript
// src/services/shopify.service.ts
- createProduct()
- updateProduct()
- Manter SKU original (CRITICAL)
```

3. **Vertex Auth**
```typescript
// src/lib/vertex-auth.ts
- getAccessToken() usando Service Account JWT
```

4. **Scripts de Teste**
```bash
# scripts/test-apis.ts
pnpm test:apis
# Deve validar conexão com todas as APIs
```

### **Critérios de Sucesso**
- [ ] WooCommerce: busca produtos com sucesso
- [ ] Shopify: cria produto de teste
- [ ] Vertex Auth: obtém access token válido
- [ ] Script de teste passa 100%

### **Commit**
```bash
git commit -m "feat: implement API clients for WooCommerce, Shopify, and Vertex AI"
```

---

## 🎯 FASE 3: Serviços de IA (5-6h)

### **Objetivo**
Implementar cada etapa do pipeline de IA: título, detecção, segmentação, inpainting, verificação.

### **Tarefas**

1. **Title Service**
```typescript
// src/services/title.service.ts
- camouflageTitle(original: string): string
- Brand mappings (Nike → NK, Adidas → AD, etc.)
```

2. **Detection Service**
```typescript
// src/services/detection.service.ts
- detectBrands(imageUrl: string): Promise<BrandDetection>
- segment(imageUrl: string, regions: Region[]): Promise<Segment[]>
- Usar Gemini 1.5 Pro Vision
```

3. **Inpainting Service**
```typescript
// src/services/inpainting.service.ts
- removeLogos(image: string, mask: string, brands: string[]): Promise<string>
- applyBlur(image: string, regions: BlurRegion[]): Promise<string>
- Usar Vertex AI Imagen 006
```

4. **Verification Service**
```typescript
// src/services/verification.service.ts
- verify(editedImage: string): Promise<VerificationResult>
- Re-analisar com Gemini para detectar marcas residuais
```

5. **Utilities**
```typescript
// src/utils/mask-generator.ts
- createMaskFromPolygons(segments: Segment[]): string

// src/utils/image-converter.ts
- urlToBase64(url: string): Promise<string>
- base64ToUrl(base64: string): string
```

### **Critérios de Sucesso**
- [ ] Title service: camufla corretamente (Nike → NK)
- [ ] Detection: detecta swoosh Nike com riskScore > 90
- [ ] Inpainting: remove logos (verificar visualmente)
- [ ] Verification: detecta marcas residuais
- [ ] Fallback blur funciona

### **Commit**
```bash
git commit -m "feat: implement AI pipeline services (detection, inpainting, verification)"
```

---

## 🎯 FASE 4: Orchestrator e Pipeline (3-4h)

### **Objetivo**
Criar o orchestrator que coordena todo o pipeline de forma automática.

### **Tarefas**

1. **Orchestrator Service**
```typescript
// src/services/orchestrator.service.ts

export async function analyzeSingleProduct(
  product: Product
): Promise<AnalysisResult> {
  // FASE 1: Título (100-200ms)
  const title = await titleService.camouflage(product.name);

  // FASE 2: Detecção (2-3s)
  const detection = await detectionService.detect(product.image_url);

  if (detection.riskScore < 50) {
    return { title, image: product.image_url, status: 'clean' };
  }

  // FASE 3: Segmentação (2-3s)
  const segments = await detectionService.segment(
    product.image_url,
    detection.regions
  );

  // FASE 4: Inpainting (5-8s)
  const mask = maskGenerator.createMask(segments);
  const edited = await inpaintingService.remove(
    product.image_url,
    mask,
    detection.brands
  );

  // FASE 5: Verificação (2-3s)
  const verification = await verificationService.verify(edited);

  if (verification.isClean) {
    return { title, image: edited, status: 'clean' };
  }

  // FASE 6: Fallback Blur (1s)
  const final = await inpaintingService.applyBlur(
    edited,
    verification.blurRegions
  );

  return { title, image: final, status: 'blur_applied' };
}
```

2. **Batch Processing**
```typescript
export async function analyzeBatch(
  products: Product[]
): Promise<AnalysisResult[]> {
  const results: AnalysisResult[] = [];

  for (const product of products) {
    console.log(`📦 [${results.length + 1}/${products.length}] Processando ${product.sku}...`);

    try {
      const result = await analyzeSingleProduct(product);
      results.push(result);

      // Salvar no banco
      await db.saveAnalysis(product.id, result);

    } catch (error) {
      console.error(`❌ Erro ao processar ${product.sku}:`, error);
      results.push({
        title: product.name,
        image: product.image_url,
        status: 'failed',
        error: error.message
      });
    }

    // Delay entre produtos para evitar rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}
```

3. **API Routes**
```typescript
// src/app/api/analyze/route.ts
export async function POST(request: Request) {
  const { productId } = await request.json();

  const product = db.getProduct(productId);
  const result = await orchestrator.analyzeSingleProduct(product);

  return Response.json(result);
}
```

4. **Script de Teste End-to-End**
```bash
# scripts/test-pipeline.ts
pnpm test:pipeline
# Deve processar 1 produto do início ao fim
```

### **Critérios de Sucesso**
- [ ] Pipeline completo funciona (1 produto)
- [ ] Logs detalhados em cada etapa
- [ ] Resultado salvo no banco
- [ ] Tempo total < 20 segundos por produto
- [ ] Batch processing funciona (3 produtos)

### **Commit**
```bash
git commit -m "feat: implement orchestrator and complete AI pipeline"
```

---

## 🎯 FASE 5: Frontend e UI (2-3h)

### **Objetivo**
Criar interface para visualizar produtos, analisar com 1 clique, e importar para Shopify.

### **Tarefas**

1. **Setup Wizard**
```typescript
// src/components/SetupWizard.tsx
- Tela de boas-vindas
- Conectar WooCommerce (URL, Consumer Key, Secret)
- Conectar Shopify (URL, Access Token)
- Testar conexões
```

2. **Products Dashboard**
```typescript
// src/app/products/page.tsx
- Listar produtos do WooCommerce
- Checkbox para seleção múltipla
- Botão "Analisar Selecionados"
- Status: pendente | analisando | concluído | erro
```

3. **Product Card**
```typescript
// src/components/ProductCard.tsx
- Imagem do produto
- Nome (original)
- SKU
- Preço
- Botão "Analisar"
- Progress bar quando analisando
```

4. **Before/After Comparison**
```typescript
// src/components/BeforeAfter.tsx
- Imagem original vs editada
- Título original vs camuflado
- Marcas detectadas
- Risk score
- Status (clean | blur_applied)
```

5. **Analysis Progress**
```typescript
// src/components/AnalysisProgress.tsx
- [1/6] Camuflando título... ✅
- [2/6] Detectando marcas... ⏳
- [3/6] Criando máscaras... ⏳
- [4/6] Removendo logos... ⏳
- [5/6] Verificando... ⏳
- [6/6] Aplicando blur... ⏳
```

6. **Import Button**
```typescript
// Botão "Importar para Shopify"
- Enviar título camuflado
- Enviar imagem editada
- Manter SKU original
- Mostrar link do produto no Shopify
```

### **Critérios de Sucesso**
- [ ] Setup wizard completo
- [ ] Lista de produtos carregada
- [ ] Botão "Analisar" funciona (1 clique)
- [ ] Progress bar atualiza em tempo real
- [ ] Comparação Before/After visual
- [ ] Importação para Shopify funciona

### **Commit**
```bash
git commit -m "feat: implement frontend dashboard and 1-click workflow"
```

---

## 🎉 FASE FINAL: Testing e Polish (1-2h)

### **Objetivo**
Testar sistema end-to-end, corrigir bugs, melhorar UX.

### **Tarefas**

1. **Testes End-to-End**
```bash
# Testar fluxo completo:
1. Setup WooCommerce + Shopify
2. Sincronizar produtos
3. Analisar 5 produtos
4. Verificar análises visuais
5. Importar 3 produtos para Shopify
6. Confirmar produtos no Shopify
```

2. **Edge Cases**
```markdown
- Produto sem imagem
- Imagem sem marcas (riskScore < 50)
- Falha na API do Google
- Rate limit
- Imagem muito grande (> 5MB)
- Título sem marcas
```

3. **Performance**
```markdown
- Otimizar conversões base64
- Cache de máscaras
- Retry com exponential backoff
```

4. **UX Polish**
```markdown
- Loading states
- Error messages amigáveis
- Success toasts
- Confirmação antes de importar
```

### **Critérios de Sucesso**
- [ ] 10 produtos processados com sucesso
- [ ] Edge cases tratados
- [ ] Performance aceitável (< 20s por produto)
- [ ] UX fluida e intuitiva

### **Commit**
```bash
git commit -m "feat: final testing, edge cases, and UX polish"
git tag v1.0.0
```

---

## 📊 Métricas de Sucesso

| Métrica | Target | Atual |
|---------|--------|-------|
| Type Safety | 0 erros | - |
| Análise Título | < 200ms | - |
| Detecção Marcas | < 3s | - |
| Inpainting | < 8s | - |
| Pipeline Total | < 20s | - |
| Taxa de Sucesso | > 90% | - |

---

## 🐛 Troubleshooting por Fase

### **FASE 1: Setup**
```bash
# Database locked
pnpm db:reset

# TypeScript errors
rm -rf .next && pnpm type-check
```

### **FASE 2: APIs**
```bash
# WooCommerce 401
Verificar Consumer Key/Secret

# Shopify 403
Verificar scopes do Access Token
```

### **FASE 3: IA**
```bash
# Gemini 429 (rate limit)
Adicionar delay entre requests

# Vertex 401
Verificar Service Account JSON
```

### **FASE 4: Orchestrator**
```bash
# Pipeline timeout
Aumentar timeout do fetch
Adicionar retry logic
```

### **FASE 5: Frontend**
```bash
# Imagem não carrega
Verificar CORS
Converter base64 corretamente
```

---

## 🚀 Próximos Passos (Pós-v1.0)

- [ ] Webhook para sincronização automática de produtos
- [ ] Interface para re-análise de produtos
- [ ] Histórico de análises
- [ ] Exportar relatório de análises
- [ ] Suporte a múltiplas lojas
- [ ] Dashboard de métricas

---

**Versão**: 1.0.0
**Última Atualização**: 2025-01-14

---

**FIM DO ROADMAP**

Siga as fases em ordem. Cada commit deve passar em `pnpm type-check` antes de prosseguir.

✅ **Good luck!** 🚀
