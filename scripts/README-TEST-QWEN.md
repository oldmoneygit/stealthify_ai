# ✨ Test Qwen Edit Image - Script de Teste Isolado

Script para testar o **Qwen/FLUX Inpainting** de forma isolada e ver a qualidade da edição.

## 📋 O que o script faz?

1. ✅ Carrega imagem original (local ou URL)
2. ✅ Detecta marcas com Gemini Vision
3. ✅ Cria máscaras preventivas (box lids + swooshes laterais)
4. ✅ Edita imagem com Qwen/FLUX
5. ✅ Re-detecta marcas na imagem editada
6. ✅ **Salva 3 arquivos em `debug/qwen/`**:
   - `*_1_original.png` - Imagem original
   - `*_2_edited.png` - Imagem editada pelo Qwen
   - `*_3_comparison.png` - **Antes vs Depois lado a lado** (800px cada)

## 🚀 Como Usar

### **Passo 1: Colocar imagens na pasta `debug/qwen/`**

```bash
# A pasta já foi criada automaticamente
debug/qwen/
```

Coloque suas imagens originais lá (Nike, Adidas, etc.).

**Exemplos:**
- `debug/qwen/nike-dunk-red.jpg`
- `debug/qwen/nike-air-jordan.jpg`
- `debug/qwen/adidas-yeezy.jpg`

### **Passo 2: Rodar o script**

```bash
pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/NOME_DA_IMAGEM.jpg"
```

**Exemplos:**

```bash
# Testar Nike Dunk
pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/nike-dunk-red.jpg"

# Testar Nike Air Jordan
pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/nike-air-jordan.jpg"

# Testar imagem online
pnpm tsx scripts/test-qwen-edit.ts "https://exemplo.com/produto-nike.jpg"
```

### **Passo 3: Ver resultados**

Abra a pasta `debug/qwen/` e você verá 3 arquivos criados:

```
debug/qwen/
├── nike_dunk_red_1737028456789_1_original.png    ← Original
├── nike_dunk_red_1737028456789_2_edited.png      ← Editada pelo Qwen
└── nike_dunk_red_1737028456789_3_comparison.png  ← ANTES vs DEPOIS lado a lado
```

**Abra a imagem `*_3_comparison.png`** para ver antes e depois lado a lado! 🎨

## 📊 Exemplo de Saída no Terminal

```
✨ TEST QWEN EDIT IMAGE - Teste Isolado de Edição

═══════════════════════════════════════════════════════════════════════════

📸 Imagem: debug/qwen/nike-dunk-red.jpg

📂 Lendo arquivo local...
✅ Imagem carregada (456 KB)

🔍 [1/4] Detectando marcas na imagem original...
   Dimensões: 1181x788
   ✅ Marcas detectadas: Nike
   📊 Risk Score: 95
   📍 Regiões detectadas: 3

🎭 [2/4] Criando máscaras preventivas...
   ✅ Máscaras preventivas criadas: 6
      [1] box_lid_top: box_2d=[0, 100, 300, 900]
      [2] swoosh_left_lateral: box_2d=[400, 50, 600, 250]
      [3] swoosh_right_lateral: box_2d=[400, 750, 600, 950]
      ... (mais máscaras)

   📦 Total de regiões para edição: 9
      3 detectadas + 6 preventivas

✨ [3/4] Editando imagem com Qwen/FLUX...
   ⏳ Isso pode demorar 10-15 segundos...
   ✅ Edição concluída!

🔎 [4/4] Re-detectando marcas na imagem editada...
   📊 Risk Score APÓS edição: 25
   📍 Marcas ainda detectadas: NENHUMA

💾 Salvando resultados...

   ✅ Original: debug\qwen\nike_dunk_red_1737028456789_1_original.png
   ✅ Editada: debug\qwen\nike_dunk_red_1737028456789_2_edited.png

🎨 Criando imagem de comparação (antes vs depois)...
   ✅ Comparação salva em: debug\qwen\nike_dunk_red_1737028456789_3_comparison.png

═══════════════════════════════════════════════════════════════════════════
📊 RESUMO DA EDIÇÃO
═══════════════════════════════════════════════════════════════════════════

📐 Dimensões: 1181 x 788 pixels
🎯 Marcas detectadas: Nike
🎭 Máscaras aplicadas: 9

📁 Arquivos salvos em debug/qwen/:
   1️⃣ nike_dunk_red_1737028456789_1_original.png (original)
   2️⃣ nike_dunk_red_1737028456789_2_edited.png (editada pelo Qwen)
   3️⃣ nike_dunk_red_1737028456789_3_comparison.png (comparação lado a lado)

═══════════════════════════════════════════════════════════════════════════

✅ Teste concluído com sucesso!

💡 Dica: Abra a imagem de comparação para ver antes vs depois lado a lado.
```

## 📸 Arquivos Gerados

### 1. `*_1_original.png`
Imagem original sem modificações.

### 2. `*_2_edited.png`
Imagem editada pelo Qwen/FLUX com:
- ✅ Logos removidos
- ✅ Textos removidos
- ✅ Máscaras preventivas aplicadas (box lids + swooshes laterais)

### 3. `*_3_comparison.png` ⭐ **MAIS IMPORTANTE**
Imagem lado a lado mostrando:
- **Esquerda**: Original
- **Direita**: Editada
- Ambas redimensionadas para 800px de largura
- Fundo cinza escuro separando

**Use esta imagem para avaliar a qualidade da edição visualmente!**

## 🎯 Para que serve?

Este script é perfeito para:

1. **Testar qualidade da edição do Qwen** de forma isolada
2. **Ver se as máscaras preventivas estão funcionando** (swooshes laterais)
3. **Comparar antes vs depois** visualmente
4. **Debugar problemas de edição** sem rodar o pipeline completo
5. **Validar se logos foram removidos** ou se ainda aparecem

## 🐛 Caso de Uso: Debugar Swooshes Laterais

Se você suspeita que o Qwen não está removendo os swooshes laterais dos tênis:

```bash
# 1. Colocar imagem com swoosh lateral em debug/qwen/
# 2. Rodar script
pnpm tsx scripts/test-qwen-edit.ts "debug/qwen/nike-lateral-swoosh.jpg"

# 3. Abrir *_3_comparison.png
# 4. Comparar visualmente:
#    - Esquerda tem swoosh lateral? ✅
#    - Direita ainda tem swoosh? ❌ (deveria estar removido)
```

Se ainda tiver swoosh na direita → **problema na edição do Qwen!**

## ⚙️ Requisitos

- ✅ `GOOGLE_GEMINI_API_KEY` configurada (para detecção)
- ✅ `GOOGLE_CLOUD_PROJECT_ID` + `GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON` (para Qwen/FLUX)
- ✅ Pasta `debug/qwen/` criada (automático)

## 🔥 Dica Pro

**Teste múltiplas imagens de uma vez:**

```bash
# Loop para testar todas as imagens na pasta
for file in debug/qwen/*.jpg; do
  echo "Testando: $file"
  pnpm tsx scripts/test-qwen-edit.ts "$file"
done
```

Depois abra todas as imagens `*_3_comparison.png` para comparar!

---

**Criado por:** Brand Camouflage System
**Versão:** 1.0.0
**Data:** 2025-01-16
