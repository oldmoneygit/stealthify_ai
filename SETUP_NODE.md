# 🚀 Como Instalar Node.js no seu Mac

O projeto precisa do **Node.js 18+** para rodar. Siga os passos abaixo:

---

## Opção 1: Instalar via Homebrew (Recomendado)

### 1. Instalar Homebrew (se não tiver)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Instalar Node.js
```bash
brew install node@20
```

### 3. Verificar instalação
```bash
node --version  # Deve mostrar v20.x.x
pnpm --version  # Deve mostrar 10.18.1
```

---

## Opção 2: Instalar via Download Direto

### 1. Baixar Node.js
Acesse: https://nodejs.org/
- Clique em "Download Node.js (LTS)"
- Baixe a versão **macOS Installer (.pkg)**

### 2. Instalar
- Abra o arquivo `.pkg` baixado
- Siga o instalador (Next, Next, Install)

### 3. Verificar instalação
Abra um **novo terminal** e rode:
```bash
node --version
npm --version
```

---

## Opção 3: Instalar via NVM (Node Version Manager)

### 1. Instalar NVM
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
```

### 2. Recarregar terminal
```bash
source ~/.zshrc
```

### 3. Instalar Node.js 20
```bash
nvm install 20
nvm use 20
nvm alias default 20
```

### 4. Verificar
```bash
node --version
```

---

## ✅ Após Instalar Node.js

Execute estes comandos no terminal:

```bash
# 1. Ir para o diretório do projeto
cd /Users/jefersonlima/Documents/stealthify_ai/stealthify_ai

# 2. Verificar versões
node --version   # Deve ser >= 18.0.0
pnpm --version   # Deve ser 10.18.1

# 3. Instalar dependências (se ainda não instalou)
pnpm install

# 4. Verificar tipos TypeScript
pnpm type-check

# 5. Inicializar banco de dados
pnpm db:init

# 6. Sincronizar produtos do WooCommerce
pnpm test:woo

# 7. Iniciar servidor de desenvolvimento
pnpm dev
```

---

## 🌐 Acessar a Aplicação

Após rodar `pnpm dev`, acesse:
```
http://localhost:3000
```

Você verá o **Brand Camouflage System** funcionando! 🎉

---

## ❓ Troubleshooting

### "pnpm: command not found" após instalar Node.js
```bash
npm install -g pnpm
```

### "Permission denied" ao instalar
```bash
sudo npm install -g pnpm
```

### Erro "EACCES" ou "permission denied"
```bash
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

---

## 📚 Próximos Passos

Depois de instalar Node.js e rodar o servidor:

1. **Configurar Environment Variables**
   - Copiar `.env.example` para `.env.local`
   - Adicionar suas credenciais (WooCommerce, Shopify, Google Cloud)

2. **Testar Conexões**
   ```bash
   pnpm test:apis
   ```

3. **Usar o Sistema**
   - Abrir http://localhost:3000
   - Selecionar produto
   - Clicar "Analisar Produto"
   - Ver resultado Before/After
   - Importar para Shopify

---

**Boa sorte! 🚀**
