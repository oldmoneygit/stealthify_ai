# 🔬 Test Vision API - Script de Teste

Script para testar o Google Cloud Vision API e ver **exatamente** o que ele detecta em uma imagem.

## 📋 O que o script faz?

1. ✅ Carrega uma imagem (local ou URL)
2. ✅ Envia para Google Cloud Vision API
3. ✅ Retorna análise COMPLETA no terminal:
   - Logos detectados (marca, confiança, coordenadas)
   - Textos detectados (texto, coordenadas)
   - Coordenadas em pixels E normalizadas (0-1000)
4. ✅ **Gera imagem com bounding boxes na pasta `debug/`**:
   - Caixas **VERMELHAS** = logos
   - Caixas **AZUIS** = textos
   - Labels com nome e % de confiança

## 🚀 Como Usar

### **Opção 1: Testar imagem local**

```bash
pnpm tsx scripts/test-vision-api.ts "caminho/para/imagem.jpg"
```

**Exemplos:**

```bash
# Testar imagem da pasta debug
pnpm tsx scripts/test-vision-api.ts "debug/SKU123_1_edited_by_qwen.png"

# Testar imagem da pasta public
pnpm tsx scripts/test-vision-api.ts "public/teste-nike.jpg"

# Caminho absoluto
pnpm tsx scripts/test-vision-api.ts "C:\Users\PC\Desktop\tenis-nike.jpg"
```

### **Opção 2: Testar imagem de URL**

```bash
pnpm tsx scripts/test-vision-api.ts "https://exemplo.com/imagem.jpg"
```

**Exemplo:**

```bash
# Testar imagem online
pnpm tsx scripts/test-vision-api.ts "https://i.imgur.com/exemplo123.jpg"
```

## 📊 Exemplo de Saída

```
🔬 TEST VISION API - Análise Detalhada

📸 Imagem: debug/SKU123_1_edited_by_qwen.png

✅ Imagem convertida para base64 (456 KB)

✅ Dimensões: 1000 x 1000 pixels

🔍 Enviando imagem para Vision API...

═══════════════════════════════════════════════════════════════════════════
📊 RESULTADOS DA ANÁLISE - GOOGLE CLOUD VISION API
═══════════════════════════════════════════════════════════════════════════

📐 Dimensões da Imagem: 1000 x 1000 pixels

🎯 LOGOS DETECTADOS:
───────────────────────────────────────────────────────────────────────────
   ⚠️ 2 logo(s) detectado(s):

   [1] Nike
       Confiança: 91.3%

       📍 Coordenadas em PIXELS:
          X: [120 - 280] (largura: 160px)
          Y: [450 - 520] (altura: 70px)
          Vértices: [{"x":120,"y":450},{"x":280,"y":450},{"x":280,"y":520},{"x":120,"y":520}]

       📐 Coordenadas NORMALIZADAS (0-1000):
          xmin: 120, xmax: 280
          ymin: 450, ymax: 520
          box_2d: [450, 120, 520, 280]

       🎨 Posição Relativa:
          Horizontal: 12.0% - 28.0%
          Vertical: 45.0% - 52.0%

   [2] Nike
       Confiança: 87.5%

       📍 Coordenadas em PIXELS:
          X: [750 - 890] (largura: 140px)
          Y: [460 - 525] (altura: 65px)
          Vértices: [{"x":750,"y":460},{"x":890,"y":460},{"x":890,"y":525},{"x":750,"y":525}]

       📐 Coordenadas NORMALIZADAS (0-1000):
          xmin: 750, xmax: 890
          ymin: 460, ymax: 525
          box_2d: [460, 750, 525, 890]

       🎨 Posição Relativa:
          Horizontal: 75.0% - 89.0%
          Vertical: 46.0% - 52.5%

📝 TEXTOS DETECTADOS:
───────────────────────────────────────────────────────────────────────────
   ⚠️ 5 bloco(s) de texto detectado(s):

   [1] "AIR"

       📍 Coordenadas em PIXELS:
          X: [200 - 350] (largura: 150px)
          Y: [100 - 150] (altura: 50px)

       📐 Coordenadas NORMALIZADAS (0-1000):
          box_2d: [100, 200, 150, 350]

   ... (mais textos)

═══════════════════════════════════════════════════════════════════════════
📈 RESUMO:
───────────────────────────────────────────────────────────────────────────
   Logos detectados: 2
   Textos detectados: 5
   Status: ⚠️ MARCAS DETECTADAS
═══════════════════════════════════════════════════════════════════════════

🎨 Gerando imagem com bounding boxes...

✅ Imagem com análise salva em: debug/vision_api_test_1737028456789.png

✅ Análise concluída com sucesso!
```

## 📁 Arquivo Gerado

O script gera um arquivo na pasta `debug/` com o nome:

```
debug/vision_api_test_<timestamp>.png
```

**Exemplo:**
```
debug/vision_api_test_1737028456789.png
```

Essa imagem terá:
- ✅ Caixas **VERMELHAS** ao redor dos logos detectados
- ✅ Caixas **AZUIS** ao redor dos textos detectados
- ✅ Labels com o nome da marca/texto e % de confiança

## 🎯 Casos de Uso

### 1. **Testar se Vision API detecta logos em imagem editada**

```bash
# Analisar imagem DEPOIS do Qwen editar
pnpm tsx scripts/test-vision-api.ts "debug/SKU123_1_edited_by_qwen.png"
```

Se ainda detectar Nike → Qwen não removeu bem!

### 2. **Comparar detecção antes vs depois da edição**

```bash
# Antes
pnpm tsx scripts/test-vision-api.ts "produtos/original/tenis-nike.jpg"

# Depois
pnpm tsx scripts/test-vision-api.ts "debug/SKU123_1_edited_by_qwen.png"
```

Compare quantos logos foram detectados em cada!

### 3. **Testar imagem de produto online**

```bash
# Baixar e analisar direto da URL
pnpm tsx scripts/test-vision-api.ts "https://sua-loja.com/produto-123.jpg"
```

### 4. **Debugar coordenadas**

Use as coordenadas impressas no terminal para entender onde o Vision API está "vendo" as marcas:

- **📍 Coordenadas em PIXELS**: onde na imagem real
- **📐 Coordenadas NORMALIZADAS**: formato usado pelo sistema (0-1000)
- **🎨 Posição Relativa**: % da imagem (útil para entender localização)

## ⚙️ Requisitos

- ✅ `GOOGLE_CLOUD_VISION_API_KEY` configurada no `.env.local`
- ✅ Pasta `debug/` criada (o script cria automaticamente se não existir)

## 🐛 Troubleshooting

### Erro: "GOOGLE_CLOUD_VISION_API_KEY não configurada"

Adicione no `.env.local`:

```env
GOOGLE_CLOUD_VISION_API_KEY=AIzaSy...
```

### Erro: "Arquivo não encontrado"

- Use caminho relativo da raiz do projeto
- Ou use caminho absoluto com barras corretas no Windows: `C:\Users\...`

### Erro: "Vision API error: 403"

- API Key inválida ou sem permissões
- Billing não habilitado no Google Cloud

## 📝 Notas

- Vision API **NÃO cobra** por detecção de logos/textos nas primeiras 1.000 imagens/mês
- Cada execução = 1 request para Vision API
- Imagens muito grandes (>10MB) podem dar timeout → resize antes

---

**Criado por:** Brand Camouflage System
**Versão:** 1.0.0
**Data:** 2025-01-16
