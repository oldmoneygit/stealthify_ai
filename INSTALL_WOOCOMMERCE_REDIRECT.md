# 🔄 Instalação do Redirecionamento WooCommerce → Shopify

## 📝 Passo a Passo

### **1. Atualizar URL da API no JavaScript**

Primeiro, você precisa editar o arquivo `public/woocommerce-redirect.js` e substituir a URL placeholder:

```javascript
// Linha 19: Trocar por sua URL real
const API_URL = 'https://SEU_DOMINIO.com/api/woo-to-shopify-redirect';
```

**Exemplo**:
```javascript
const API_URL = 'https://brand-camouflage.vercel.app/api/woo-to-shopify-redirect';
```

---

### **2. Fazer Upload do JavaScript**

**Opção A: Via FTP/SFTP**
1. Conecte-se ao servidor de hospedagem do WordPress
2. Navegue até `/wp-content/themes/SEU_TEMA/js/`
3. Faça upload do arquivo `woocommerce-redirect.js`

**Opção B: Via WordPress Admin**
1. Vá em **Aparência → Editor de Tema**
2. Crie um novo arquivo chamado `woocommerce-redirect.js`
3. Cole o conteúdo do arquivo
4. Salve

---

### **3. Carregar o Script no Tema WordPress**

Adicione o seguinte código no arquivo `functions.php` do seu tema:

```php
/**
 * 🔄 Carregar script de redirecionamento WooCommerce → Shopify
 */
function load_woocommerce_to_shopify_redirect() {
    // Carregar apenas na página do carrinho
    if (is_cart()) {
        wp_enqueue_script(
            'woo-to-shopify-redirect',
            get_template_directory_uri() . '/js/woocommerce-redirect.js',
            array(), // Sem dependências
            '1.0.0',
            true // Carregar no footer
        );
    }
}
add_action('wp_enqueue_scripts', 'load_woocommerce_to_shopify_redirect');
```

**Como adicionar no functions.php**:
1. WordPress Admin → **Aparência → Editor de Tema**
2. Selecione **functions.php** na lista de arquivos
3. Cole o código acima **NO FINAL** do arquivo
4. Clique em **Atualizar Arquivo**

---

### **4. Verificar SKUs no WooCommerce**

O sistema precisa que os produtos WooCommerce tenham SKUs configurados. Verifique se todos os produtos têm SKU:

1. WordPress Admin → **Produtos → Todos os Produtos**
2. Edite cada produto
3. Na aba **Inventário**, certifique-se de que o campo **SKU** está preenchido
4. O SKU deve ser **exatamente o mesmo** usado no banco de dados do sistema

**IMPORTANTE**: O SKU é a chave de mapeamento entre WooCommerce e Shopify!

---

### **5. Adicionar Atributo data-sku no Template (Se Necessário)**

Se o seu tema WooCommerce não exibe o SKU nos itens do carrinho, você precisa adicionar um atributo `data-sku`:

Edite o template do carrinho (geralmente `cart/cart.php`):

```php
<!-- Adicionar data-sku em cada linha do carrinho -->
<tr class="woocommerce-cart-form__cart-item" data-sku="<?php echo esc_attr($_product->get_sku()); ?>">
    <!-- ... resto do conteúdo -->
</tr>
```

**Localização do arquivo**:
- `/wp-content/themes/SEU_TEMA/woocommerce/cart/cart.php`

Se o arquivo não existir, copie do WooCommerce:
- `/wp-content/plugins/woocommerce/templates/cart/cart.php`
Para:
- `/wp-content/themes/SEU_TEMA/woocommerce/cart/cart.php`

---

## 🧪 Testando o Sistema

### **Teste 1: Verificar Carregamento do Script**

1. Acesse a página do carrinho no WooCommerce
2. Abra o **Console do Navegador** (F12)
3. Procure pela mensagem:
   ```
   🔄 [WooCommerce → Shopify] Script carregado
   🔍 [Init] Botões de checkout encontrados: 1
   ```

Se aparecer `Botões de checkout encontrados: 0`, o script não está encontrando o botão. Verifique o seletor CSS.

---

### **Teste 2: Verificar Extração de SKUs**

1. Adicione um produto ao carrinho
2. Vá até a página do carrinho
3. Abra o **Console do Navegador** (F12)
4. Digite:
   ```javascript
   document.querySelectorAll('.woocommerce-cart-form__cart-item')
   ```
5. Verifique se os elementos têm o atributo `data-sku`

---

### **Teste 3: Testar Redirecionamento Completo**

1. Adicione um produto ao carrinho (que já foi importado para Shopify)
2. Vá até a página do carrinho
3. Clique em **"Finalizar Compra"**
4. **Esperado**: Botão muda para "Redirecionando..." e depois redireciona para Shopify
5. **Console deve mostrar**:
   ```
   🛒 [Checkout] Botão "Finalizar Compra" clicado
   📦 [Carrinho] Itens: [{sku: "STFY-123", quantity: 1}]
   ✅ [Checkout] Redirecionando para: https://sua-loja.myshopify.com/...
   ```

---

## ❌ Troubleshooting

### **Problema 1: Script não carrega**

**Sintoma**: Nenhuma mensagem no console

**Solução**:
- Verifique se o caminho do arquivo está correto no `functions.php`
- Limpe o cache do WordPress (plugins de cache)
- Teste em janela anônima

---

### **Problema 2: "Nenhum produto foi importado para a Shopify ainda"**

**Sintoma**: Erro ao clicar em "Finalizar Compra"

**Solução**:
- Certifique-se de que os produtos foram **importados para Shopify** primeiro
- Verifique se o banco de dados tem `shopify_product_id` e `shopify_variant_id` preenchidos
- Execute:
  ```sql
  SELECT p.sku, a.shopify_product_id, a.shopify_variant_id
  FROM products p
  LEFT JOIN analyses a ON p.id = a.product_id
  WHERE a.shopify_product_id IS NULL;
  ```

---

### **Problema 3: "Produtos não encontrados na Shopify"**

**Sintoma**: Erro listando SKUs não encontrados

**Solução**:
- Verifique se o SKU do WooCommerce **corresponde exatamente** ao SKU no banco de dados
- SKUs são case-sensitive: `STFY-123` ≠ `stfy-123`

---

### **Problema 4: Botão de checkout não interceptado**

**Sintoma**: Clica no botão e vai para checkout WooCommerce normal

**Solução**:
- O seletor CSS pode estar errado para o seu tema
- Edite `woocommerce-redirect.js` linha 137:
  ```javascript
  // Adicione o seletor específico do seu tema
  const checkoutButtons = document.querySelectorAll(
    '.checkout-button, .wc-proceed-to-checkout a, .SEU_SELETOR_AQUI'
  );
  ```
- Use **Inspecionar Elemento** (F12) para descobrir a classe do botão

---

## 🔐 Segurança

### **Validação de SKUs**

A API valida automaticamente:
- ✅ SKUs existem no banco de dados
- ✅ Produtos foram importados para Shopify
- ✅ `shopify_product_id` e `shopify_variant_id` não são nulos

### **Rate Limiting (Opcional)**

Se você espera muito tráfego, adicione rate limiting na API:

```typescript
// Exemplo: limitar a 10 requisições por IP por minuto
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 10 // 10 requisições
});

export async function POST(request: Request) {
  // ... seu código
}
```

---

## 📊 Monitoramento

### **Logs na API**

A API loga automaticamente:
```typescript
console.log('🔄 [WooCommerce → Shopify] Iniciando redirecionamento:', { items });
console.log('📦 [Mapeamento] Produtos encontrados:', shopifyProducts.length);
console.log('✅ [Checkout] URL criada:', checkoutUrl);
```

Verifique os logs no console do Vercel/servidor.

---

## ✅ Checklist Final

Antes de colocar em produção:

- [ ] URL da API atualizada no JavaScript
- [ ] JavaScript carregado no tema WordPress
- [ ] Todos os produtos têm SKU no WooCommerce
- [ ] Produtos foram importados para Shopify
- [ ] Teste com 1 produto funcionou
- [ ] Teste com múltiplos produtos funcionou
- [ ] Cache do WordPress limpo
- [ ] Logs da API verificados

---

**Pronto! 🎉** Seu sistema de redirecionamento está configurado.

Se tiver problemas, verifique os logs no console do navegador e no servidor Next.js.
