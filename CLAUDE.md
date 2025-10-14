# 🤖 CLAUDE.md - Constituição do Projeto Brand Camouflage System

> **Arquivo de Contexto Completo para IA Development**
> Este documento contém todas as regras, padrões, contexto e workflows necessários para desenvolver neste projeto.

---

## 📋 Índice

1. [Regras Gerais e Contexto Global](#-regras-gerais-e-contexto-global)
2. [Arquitetura do Projeto](#-arquitetura-do-projeto)
3. [Padrões de Código e Tipagem](#-padrões-de-código-e-tipagem)
4. [Stack Tecnológica](#-stack-tecnológica)
5. [Fluxo de Dados (Pipeline IA)](#-fluxo-de-dados-pipeline-ia)
6. [Comunicação e Integrações](#-comunicação-e-integrações)
7. [Ambiente de Desenvolvimento](#-ambiente-de-desenvolvimento)
8. [Comandos e Scripts](#-comandos-e-scripts)
9. [Checklist de Validação](#-checklist-de-validação)
10. [Troubleshooting](#-troubleshooting)

---

## 🌍 Regras Gerais e Contexto Global

### **Contexto do Projeto**

**Nome**: `brand-camouflage-system`
**Objetivo**: Sistema automatizado para camuflagem de marcas em produtos (WooCommerce → Shopify)
**Usuário**: Uso pessoal (single-user)
**Linguagem Primária**: Português BR

**Problema que Resolve**:
- Loja WooCommerce com produtos de marcas (Nike, Adidas, etc.)
- Necessidade de checkout Shopify (gateway específico)
- Redirecionamento WooCommerce → Shopify checkout mantendo SKU
- Produtos devem estar "camuflados" (sem logos/marcas) no Shopify

### **🔴 REGRAS FUNDAMENTAIS - ALWAYS MANDATORY**

1. **NUNCA** fazer commit sem rodar `pnpm type-check` primeiro
2. **NUNCA** usar `any` em TypeScript (usar `unknown` quando necessário)
3. **SEMPRE** testar cada função isoladamente antes de integrar
4. **SEMPRE** manter SKU original intacto (CRÍTICO para redirecionamento)
5. **SEMPRE** validar input de APIs externas (WooCommerce, Shopify, Google)
6. **SEMPRE** ter fallback para falhas de IA (blur mask como último recurso)
7. **SEMPRE** usar variáveis de ambiente para secrets
8. **SEMPRE** logar cada etapa do pipeline (console.log com emojis)
9. **IMPORTANTE**: Pipeline deve ser **100% automatizado** (1 clique)
10. **IMPORTANTE**: Processo deve ser **idempotente** (pode rodar múltiplas vezes)

### **Linguagem e Gerenciador de Pacotes**

- **Linguagem**: TypeScript 5.3+ (strict mode)
- **Runtime**: Node.js >= 18.0.0
- **Gerenciador**: `pnpm >= 8.0.0` (**SEMPRE usar pnpm**)
  - ❌ **NUNCA** usar `npm` ou `yarn`
  - ✅ Usar `pnpm install`, `pnpm add`, `pnpm dev`

### **Princípios de Design**

1. **Simplicidade**: Código deve ser fácil de entender e manter
2. **Automação**: Menos cliques, mais inteligência
3. **Type Safety**: Zero erros de tipo em produção
4. **Resilience**: Falhas de IA não devem quebrar o sistema
5. **Transparency**: Usuário sempre sabe o que está acontecendo

---

## 🗂️ Arquitetura do Projeto

### **Estrutura de Diretórios**

```
brand-camouflage/
├── src/
│   ├── app/                           # Next.js 14 App Router
│   │   ├── page.tsx                   # Dashboard principal
│   │   ├── setup/page.tsx             # Setup WooCommerce + Shopify
│   │   ├── products/page.tsx          # Lista de produtos
│   │   ├── api/
│   │   │   ├── sync/route.ts          # POST /api/sync (WooCommerce)
│   │   │   ├── analyze/route.ts       # POST /api/analyze (IA Pipeline)
│   │   │   └── import/route.ts        # POST /api/import (Shopify)
│   │   └── layout.tsx
│   │
│   ├── components/
│   │   ├── ProductCard.tsx            # Card individual
│   │   ├── BeforeAfter.tsx            # Comparação lado a lado
│   │   ├── AnalysisProgress.tsx       # Progress indicator
│   │   ├── SetupWizard.tsx            # Wizard de configuração
│   │   └── Button.tsx                 # Botão reutilizável
│   │
│   ├── services/                      # Business logic
│   │   ├── woocommerce.service.ts     # WooCommerce REST API
│   │   ├── shopify.service.ts         # Shopify Admin API
│   │   ├── title.service.ts           # Title camouflage
│   │   ├── detection.service.ts       # Brand detection (Gemini)
│   │   ├── inpainting.service.ts      # Image editing (Vertex AI)
│   │   ├── verification.service.ts    # Post-edit verification
│   │   └── orchestrator.service.ts    # 🎯 MAIN PIPELINE
│   │
│   ├── lib/
│   │   ├── db.ts                      # SQLite client
│   │   ├── vertex-auth.ts             # Google Cloud OAuth
│   │   ├── types.ts                   # TypeScript definitions
│   │   └── constants.ts               # Brand mappings, configs
│   │
│   └── utils/
│       ├── mask-generator.ts          # Create masks from polygons
│       ├── image-converter.ts         # Base64 ↔ URL conversions
│       ├── retry.ts                   # Retry with exponential backoff
│       └── validators.ts              # Input validation
│
├── database/
│   ├── schema.sql                     # SQLite schema
│   ├── migrations/                    # DB migrations
│   └── products.db                    # SQLite file (gitignored)
│
├── scripts/
│   ├── test-apis.ts                   # Test API connections
│   ├── test-pipeline.ts               # Test full pipeline
│   └── seed-db.ts                     # Seed test data
│
├── public/
│   └── placeholder.png                # Fallback image
│
├── .env.example                       # Environment template
├── .env.local                         # Real secrets (gitignored)
├── .gitignore
├── CLAUDE.md                          # Este arquivo
├── ROADMAP.md                         # Implementation plan
├── README.md                          # Setup instructions
├── package.json
├── tsconfig.json                      # TypeScript strict config
└── next.config.js
```

### **Padrão Arquitetural**

**Next.js 14 App Router**:
- `app/` - Pages e layouts
- `app/api/` - API Routes (serverless functions)
- `components/` - React components (client + server)
- `services/` - Business logic (pure functions)
- `lib/` - Infrastructure (DB, auth, types)
- `utils/` - Helper functions

**Separação de Responsabilidades**:
```
UI Layer (components)
    ↓
API Layer (app/api)
    ↓
Service Layer (services)
    ↓
Data Layer (lib/db)
```

---

## 🎯 Padrões de Código e Tipagem

### **Type Safety - ALWAYS MANDATORY**

#### **TypeScript Strict Mode**

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,                       // ✅ SEMPRE
    "noImplicitAny": true,                // ❌ Proíbe 'any'
    "strictNullChecks": true,             // ✅ Null safety
    "strictFunctionTypes": true,          // ✅ Function type checking
    "noUncheckedIndexedAccess": true,     // ✅ Array/Object safety
    "forceConsistentCasingInFileNames": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler"
  }
}
```

#### **Regras de Tipagem**

1. **NEVER use `any`**

```typescript
// ❌ ERRADO
const data: any = await fetch(url);

// ✅ CORRETO
const data: unknown = await fetch(url);
if (isValidProduct(data)) {
  // Type narrowing
}
```

2. **SEMPRE definir tipos de retorno**

```typescript
// ❌ ERRADO
async function detectBrands(imageUrl) {
  return await gemini.detect(imageUrl);
}

// ✅ CORRETO
async function detectBrands(imageUrl: string): Promise<BrandDetection> {
  const result = await gemini.detect(imageUrl);
  if (!isValidDetection(result)) {
    throw new Error('Invalid detection result');
  }
  return result;
}
```

3. **Usar Type Guards**

```typescript
function isProduct(obj: unknown): obj is Product {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sku' in obj &&
    'name' in obj &&
    'image_url' in obj
  );
}
```

4. **Interfaces para contratos públicos**

```typescript
// Contratos de API, Database models
interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  image_url: string;
  woo_product_id: number;
}

interface AnalysisResult {
  title: string;
  image: string;
  brands_detected: string[];
  risk_score: number;
  status: 'clean' | 'blur_applied' | 'failed';
}
```

### **Convenções de Nomenclatura**

```typescript
// Arquivos
kebab-case.ts              // ✅ orchestrator.service.ts
camelCase.ts               // ❌ orchestratorService.ts

// Componentes React
PascalCase.tsx             // ✅ ProductCard.tsx

// Variáveis e Funções
camelCase                  // ✅ const productCount = 10;
                          // ✅ async function analyzeProduct() {}

// Constantes
UPPER_SNAKE_CASE          // ✅ const MAX_RETRIES = 3;

// Types/Interfaces
PascalCase                // ✅ interface ProductData {}
```

### **Estrutura de Funções**

```typescript
/**
 * Analisa produto e gera versão camuflada
 *
 * @param product - Produto do WooCommerce
 * @returns Resultado da análise com título e imagem editados
 * @throws {AnalysisError} Se pipeline falhar após retries
 */
export async function analyzeProduct(
  product: Product
): Promise<AnalysisResult> {
  // 1. Validação de entrada
  if (!product.image_url || !product.name) {
    throw new Error('Invalid product: missing required fields');
  }

  // 2. Logging inicial
  console.log('🔍 Analisando produto:', {
    sku: product.sku,
    name: product.name
  });

  try {
    // 3. Lógica principal
    const result = await runPipeline(product);

    // 4. Logging de sucesso
    console.log('✅ Análise concluída:', {
      sku: product.sku,
      status: result.status
    });

    return result;
  } catch (error) {
    // 5. Error handling
    console.error('❌ Erro na análise:', error);
    throw new AnalysisError('Analysis failed', { cause: error });
  }
}
```

### **Error Handling**

```typescript
// Custom Error Classes
export class AnalysisError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

// Try-Catch com Type Narrowing
try {
  const result = await riskyOperation();
} catch (error) {
  if (error instanceof AnalysisError) {
    console.error('Analysis failed:', error.context);
  } else if (error instanceof Error) {
    console.error('Unknown error:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
  throw error;
}
```

---

## 🛠️ Stack Tecnológica

### **Core**

- **Framework**: Next.js 14 (App Router)
- **Linguagem**: TypeScript 5.3+
- **Runtime**: Node.js >= 18
- **Package Manager**: pnpm 8+

### **Frontend**

- **UI**: React 18 (Server + Client Components)
- **Styling**: Tailwind CSS 3.4
- **State**: React hooks (useState, useEffect)
- **Forms**: React Hook Form (se necessário)

### **Backend**

- **API**: Next.js API Routes (serverless)
- **Database**: SQLite (better-sqlite3)
- **File Storage**: Local (base64 em DB para imagens editadas)

### **IA/ML**

- **Detection**: Google Gemini 1.5 Pro (Vision)
- **Inpainting**: Google Vertex AI Imagen 006
- **Authentication**: Service Account JWT

### **Integrações**

- **E-commerce Source**: WooCommerce REST API v3
- **E-commerce Target**: Shopify Admin API 2024-01
- **Image Processing**: Sharp (resize, conversions)

### **DevOps**

- **Development**: Local (localhost:3000)
- **Production**: Vercel ou self-hosted
- **Database**: SQLite file (products.db)

---

## 🔄 Fluxo de Dados (Pipeline IA)

### **Pipeline Completo - orchestrator.service.ts**

```typescript
/**
 * FLUXO PRINCIPAL - DEVE SER EXECUTADO EM ORDEM
 *
 * 1. Camuflagem de Título (100-200ms)
 * 2. Detecção de Marcas (2-3s)
 * 3. Segmentação (2-3s)
 * 4. Inpainting (5-8s)
 * 5. Verificação (2-3s)
 * 6. Fallback (blur) se necessário (1s)
 *
 * TOTAL: ~12-20s por produto
 */

export async function analyzeSingleProduct(
  product: Product
): Promise<AnalysisResult> {

  // FASE 1: Título
  console.log('📝 [1/6] Camuflando título...');
  const camouflagedTitle = await titleService.camouflage(product.name);

  // FASE 2: Detecção
  console.log('🔍 [2/6] Detectando marcas na imagem...');
  const detection = await detectionService.detect(product.image_url);

  if (detection.riskScore < 50) {
    // Imagem segura, não precisa editar
    return {
      title: camouflagedTitle,
      image: product.image_url,
      brands_detected: [],
      risk_score: detection.riskScore,
      status: 'clean'
    };
  }

  // FASE 3: Segmentação (criar polígonos precisos)
  console.log('🎯 [3/6] Criando máscaras de segmentação...');
  const segments = await detectionService.segment(
    product.image_url,
    detection.regions
  );

  // FASE 4: Inpainting
  console.log('✨ [4/6] Removendo marcas com IA...');
  const mask = maskGenerator.createMask(segments);
  const editedImage = await inpaintingService.remove(
    product.image_url,
    mask,
    detection.brands
  );

  // FASE 5: Verificação
  console.log('🔎 [5/6] Verificando remoção...');
  const verification = await verificationService.verify(editedImage);

  if (verification.isClean) {
    console.log('✅ [6/6] Produto limpo!');
    return {
      title: camouflagedTitle,
      image: editedImage,
      brands_detected: detection.brands,
      risk_score: 0,
      status: 'clean'
    };
  }

  // FASE 6: Fallback - Blur
  console.log('⚠️ [6/6] Aplicando blur em regiões persistentes...');
  const finalImage = await inpaintingService.applyBlur(
    editedImage,
    verification.blurRegions
  );

  return {
    title: camouflagedTitle,
    image: finalImage,
    brands_detected: detection.brands,
    risk_score: verification.riskScore,
    status: 'blur_applied'
  };
}
```

### **Diagrama de Fluxo**

```
┌──────────────────────────────────────┐
│  Produto Original (WooCommerce)      │
│  - Título: "Nike Air Jordan 1"      │
│  - Imagem: com swoosh Nike visível  │
└────────────┬─────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  FASE 1: Camuflagem de Título         │
│  title.service.ts                     │
│  Nike → NK, Jordan → JD               │
│  Resultado: "NK Air JD 1"             │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  FASE 2: Detecção de Marcas           │
│  detection.service.ts (Gemini Vision) │
│  - Detecta swoosh Nike                │
│  - riskScore: 95                      │
│  - regions: [polygon coordinates]     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  FASE 3: Segmentação                  │
│  detection.service.ts                 │
│  - Cria polígonos precisos            │
│  - Coordenadas normalizadas (0-1)     │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  FASE 4: Inpainting                   │
│  inpainting.service.ts (Vertex AI)    │
│  - Remove logos com IA                │
│  - Preenche com textura matching      │
│  - strength: 0.8, guidance: 17        │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  FASE 5: Verificação                  │
│  verification.service.ts              │
│  - Re-analisa imagem editada          │
│  - Checa se marcas foram removidas    │
└────────────┬───────────────────────────┘
             │
          ┌──┴──┐
          │     │
        Clean?  │
          │     │
     ┌────┘     └────┐
     │ Sim           │ Não
     ▼               ▼
┌─────────┐    ┌──────────────┐
│ Sucesso │    │ FASE 6: Blur │
│ ✅       │    │ Fallback     │
└─────────┘    └──────┬───────┘
                      │
                      ▼
               ┌──────────────┐
               │ Produto Final│
               │ ✅ ou ⚠️     │
               └──────────────┘
```

---

## 📡 Comunicação e Integrações

### **1. WooCommerce REST API**

**Base URL**: `https://sua-loja.com/wp-json/wc/v3/`
**Auth**: OAuth 1.0a (Consumer Key + Secret)

#### **Endpoints Utilizados**

```typescript
// Listar produtos
GET /products?per_page=100&status=publish

// Buscar produto específico
GET /products/{id}
```

#### **Configuração**

```env
WOOCOMMERCE_URL=https://sua-loja.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxx
```

#### **Implementação**

```typescript
// src/services/woocommerce.service.ts

import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const wooApi = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL!,
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY!,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET!,
  version: "wc/v3"
});

export async function fetchProducts(): Promise<Product[]> {
  const response = await wooApi.get("products", {
    per_page: 100,
    status: "publish"
  });

  return response.data.map(p => ({
    woo_product_id: p.id,
    sku: p.sku,
    name: p.name,
    price: parseFloat(p.price),
    image_url: p.images[0]?.src || null
  }));
}
```

---

### **2. Shopify Admin API**

**Base URL**: `https://sua-loja.myshopify.com/admin/api/2024-01/`
**Auth**: Access Token (header `X-Shopify-Access-Token`)

#### **Endpoints Utilizados**

```typescript
// Criar produto
POST /products.json

// Atualizar produto
PUT /products/{id}.json
```

#### **Configuração**

```env
SHOPIFY_STORE_URL=https://sua-loja.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx
```

#### **Implementação**

```typescript
// src/services/shopify.service.ts

export async function createProduct(
  product: Product,
  analysis: AnalysisResult
): Promise<ShopifyProduct> {

  const response = await fetch(
    `${process.env.SHOPIFY_STORE_URL}/admin/api/2024-01/products.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product: {
          title: analysis.title,  // Título camuflado
          variants: [{
            sku: product.sku,     // ⚠️ CRITICAL: manter SKU original
            price: product.price,
            inventory_management: 'shopify'
          }],
          images: [{
            attachment: analysis.image  // Base64 da imagem editada
          }],
          status: 'active'
        }
      })
    }
  );

  const data = await response.json();
  return data.product;
}
```

---

### **3. Google Gemini API (Vision)**

**Model**: `gemini-1.5-pro`
**Uso**: Detecção de marcas + Segmentação

#### **Configuração**

```env
GOOGLE_GEMINI_API_KEY=AIzaSy...
```

#### **Implementação**

```typescript
// src/services/detection.service.ts

export async function detectBrands(
  imageUrl: string
): Promise<BrandDetection> {

  const imageBase64 = await urlToBase64(imageUrl);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GOOGLE_GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: DETECTION_PROMPT  // Ver constants.ts
            },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          response_mime_type: "application/json"
        }
      })
    }
  );

  const result = await response.json();
  return JSON.parse(result.candidates[0].content.parts[0].text);
}
```

---

### **4. Google Vertex AI (Imagen)**

**Model**: `imagegeneration@006`
**Uso**: Inpainting (remoção de marcas)

#### **Configuração**

```env
GOOGLE_CLOUD_PROJECT_ID=my-project-12345
GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

#### **Autenticação**

```typescript
// src/lib/vertex-auth.ts

import { google } from 'googleapis';

export async function getAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(
    process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON!
  );

  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    undefined,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/cloud-platform']
  );

  const tokens = await jwtClient.authorize();
  return tokens.access_token!;
}
```

#### **Implementação**

```typescript
// src/services/inpainting.service.ts

export async function removeLogos(
  imageBase64: string,
  maskBase64: string,
  brands: string[]
): Promise<string> {

  const accessToken = await getAccessToken();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;

  const prompt = `
COMPLETELY REMOVE all brand logos and text from the masked area.
Brands detected: ${brands.join(', ')}
Fill with matching product texture.
ZERO brand elements must remain.
  `.trim();

  const response = await fetch(
    `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagegeneration@006:predict`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [{
          prompt,
          image: { bytesBase64Encoded: imageBase64 },
          mask: { image: { bytesBase64Encoded: maskBase64 } },
          parameters: {
            sampleCount: 1,
            guidance: 17,
            strength: 0.8,
            steps: 35,
            negative_prompt: "incomplete removal, partial logo"
          }
        }]
      })
    }
  );

  const result = await response.json();
  const editedBase64 = result.predictions[0].bytesBase64Encoded;
  return `data:image/png;base64,${editedBase64}`;
}
```

---

### **5. SQLite Database**

**Driver**: better-sqlite3
**File**: `database/products.db`

#### **Schema**

```sql
-- database/schema.sql

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  woo_product_id INTEGER UNIQUE NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  image_url TEXT NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,

  -- Título
  original_title TEXT NOT NULL,
  camouflaged_title TEXT NOT NULL,

  -- Imagem
  original_image_url TEXT NOT NULL,
  edited_image_base64 TEXT NOT NULL,

  -- Metadata
  brands_detected TEXT NOT NULL,  -- JSON array
  risk_score INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('clean', 'blur_applied', 'failed')),

  -- Shopify
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  imported_at TIMESTAMP,

  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_analyses_product_id ON analyses(product_id);
```

#### **Client**

```typescript
// src/lib/db.ts

import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'database', 'products.db');
export const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Helper functions
export function saveProduct(product: Product): void {
  const stmt = db.prepare(`
    INSERT INTO products (woo_product_id, sku, name, price, image_url)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(woo_product_id) DO UPDATE SET
      name = excluded.name,
      price = excluded.price,
      image_url = excluded.image_url,
      synced_at = CURRENT_TIMESTAMP
  `);

  stmt.run(
    product.woo_product_id,
    product.sku,
    product.name,
    product.price,
    product.image_url
  );
}

export function saveAnalysis(
  productId: number,
  analysis: AnalysisResult
): void {
  const stmt = db.prepare(`
    INSERT INTO analyses (
      product_id,
      original_title,
      camouflaged_title,
      original_image_url,
      edited_image_base64,
      brands_detected,
      risk_score,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    productId,
    analysis.original_title,
    analysis.title,
    analysis.original_image,
    analysis.image,
    JSON.stringify(analysis.brands_detected),
    analysis.risk_score,
    analysis.status
  );
}
```

---

## 💻 Ambiente de Desenvolvimento

### **Requisitos**

```bash
Node.js >= 18.0.0
pnpm >= 8.0.0
Git
```

### **Setup Inicial**

```bash
# 1. Clone/Create project
mkdir brand-camouflage
cd brand-camouflage

# 2. Initialize
pnpm init
pnpm create next-app@latest . --typescript --tailwind --app

# 3. Install dependencies
pnpm add better-sqlite3 @woocommerce/woocommerce-rest-api sharp
pnpm add -D @types/better-sqlite3

# 4. Setup environment
cp .env.example .env.local
# Editar .env.local com suas credenciais

# 5. Initialize database
pnpm db:init

# 6. Test connections
pnpm test:apis

# 7. Start development
pnpm dev
```

### **Environment Variables**

```bash
# .env.local (NUNCA commitar)

# WooCommerce
WOOCOMMERCE_URL=https://sua-loja.com
WOOCOMMERCE_CONSUMER_KEY=ck_xxxxx
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxxx

# Shopify
SHOPIFY_STORE_URL=https://sua-loja.myshopify.com
SHOPIFY_ACCESS_TOKEN=shpat_xxxxx

# Google Cloud
GOOGLE_GEMINI_API_KEY=AIzaSy...
GOOGLE_CLOUD_PROJECT_ID=my-project-12345
GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON={"type":"service_account",...}

# Optional
NODE_ENV=development
```

---

## ⚡ Comandos e Scripts

### **Desenvolvimento**

```bash
pnpm dev                    # Start Next.js dev server
pnpm build                  # Build for production
pnpm start                  # Start production server
```

### **Validação**

```bash
pnpm type-check             # TypeScript check
pnpm lint                   # ESLint
```

### **Database**

```bash
pnpm db:init                # Initialize database
pnpm db:migrate             # Run migrations
pnpm db:seed                # Seed test data
pnpm db:reset               # Drop and recreate
```

### **Testing**

```bash
pnpm test:apis              # Test API connections
pnpm test:pipeline          # Test full analysis pipeline
pnpm test:single            # Analyze single product
```

---

## ✅ Checklist de Validação

### **Antes de Cada Commit**

```markdown
- [ ] `pnpm type-check` passou sem erros
- [ ] `pnpm lint` passou sem erros
- [ ] Código testado manualmente
- [ ] Nenhum secret exposto
- [ ] Logs adequados adicionados
- [ ] Commit message descritiva
```

### **Antes de Deploy**

```markdown
- [ ] `pnpm build` passou sem erros
- [ ] Environment variables configuradas
- [ ] Database inicializado
- [ ] Testes de API passaram
- [ ] Pipeline testado end-to-end
- [ ] Backup do banco de dados criado
```

### **Ao Adicionar Nova Feature**

```markdown
- [ ] Tipos TypeScript definidos
- [ ] Error handling implementado
- [ ] Logs com emojis adicionados
- [ ] Função testada isoladamente
- [ ] Documentação JSDoc adicionada
- [ ] Integrado ao pipeline (se relevante)
```

---

## 🐛 Troubleshooting

### **TypeScript Errors**

```bash
# Limpar cache e rebuild
rm -rf .next
pnpm type-check
pnpm build
```

### **Database Locked**

```bash
# Fechar todas as conexões e resetar
pnpm db:reset
```

### **API Rate Limits**

- Gemini: 60 requests/min
- Vertex AI: 300 requests/min
- Implementar retry com backoff exponencial

### **Imagens Muito Grandes**

```bash
# Resize antes de enviar para IA
# Ver utils/image-converter.ts
```

---

## 📚 Recursos

- [Next.js 14 Docs](https://nextjs.org/docs)
- [Google Gemini API](https://ai.google.dev/docs)
- [Vertex AI Imagen](https://cloud.google.com/vertex-ai/docs/generative-ai/image/overview)
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-rest)

---

**Versão**: 1.0.0
**Última Atualização**: 2025-01-14
**Compatível com**: brand-camouflage v0.1.0

---

**FIM DO DOCUMENTO**

Este arquivo deve ser consultado **antes** de iniciar qualquer desenvolvimento neste projeto.

✅ **Happy Coding!** 🚀
