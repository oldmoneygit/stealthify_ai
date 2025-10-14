# Brand Camouflage System

Sistema automatizado para camuflagem de marcas em produtos (WooCommerce → Shopify)

## Stack Tecnológica

- **Framework**: Next.js 14 (App Router)
- **Linguagem**: TypeScript 5.3+ (strict mode)
- **Database**: SQLite (better-sqlite3)
- **IA**: Google Gemini 1.5 Pro + Vertex AI Imagen
- **E-commerce**: WooCommerce REST API + Shopify Admin API
- **Styling**: Tailwind CSS 3.4

## Setup Inicial

### 1. Instalar Dependências

```bash
pnpm install
```

### 2. Configurar Environment Variables

```bash
cp .env.example .env.local
# Editar .env.local com suas credenciais
```

### 3. Inicializar Database

```bash
pnpm db:init
```

### 4. Validar Setup

```bash
pnpm type-check
```

### 5. Iniciar Desenvolvimento

```bash
pnpm dev
```

Acesse: http://localhost:3000

## Scripts Disponíveis

```bash
pnpm dev            # Inicia servidor de desenvolvimento
pnpm build          # Build para produção
pnpm start          # Inicia servidor de produção
pnpm type-check     # Valida TypeScript
pnpm lint           # Executa ESLint
pnpm db:init        # Inicializa database
pnpm db:reset       # Reseta database
pnpm test:setup     # Testa configuração do projeto
```

## Estrutura do Projeto

```
brand-camouflage-system/
├── src/
│   ├── app/            # Next.js App Router
│   ├── components/     # React components
│   ├── services/       # Business logic
│   ├── lib/            # Infrastructure (DB, auth, types)
│   └── utils/          # Helper functions
├── database/           # SQLite database
├── scripts/            # Utility scripts
├── CLAUDE.md          # Constituição do projeto
└── ROADMAP.md         # Plano de implementação
```

## Documentação

- **[CLAUDE.md](./CLAUDE.md)**: Constituição completa do projeto com regras, padrões e arquitetura
- **[ROADMAP.md](./ROADMAP.md)**: Plano de implementação fase por fase

## Status

✅ **FASE 1 CONCLUÍDA** - Setup e Estrutura Base

### Próximos Passos

- [ ] FASE 2: Integrações de API
- [ ] FASE 3: Serviços de IA
- [ ] FASE 4: Orchestrator e Pipeline
- [ ] FASE 5: Frontend e UI

## Licença

ISC
