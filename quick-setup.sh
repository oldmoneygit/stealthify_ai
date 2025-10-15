#!/bin/bash

echo "🚀 Brand Camouflage System - Quick Setup"
echo "========================================"
echo ""

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo "📦 Homebrew não encontrado. Instalando..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for M1/M2 Macs
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "📦 Node.js não encontrado. Instalando..."
    brew install node@20
    brew link node@20
else
    echo "✅ Node.js já instalado: $(node --version)"
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 pnpm não encontrado. Instalando..."
    npm install -g pnpm
else
    echo "✅ pnpm já instalado: $(pnpm --version)"
fi

echo ""
echo "✅ Setup completo!"
echo ""
echo "Próximos passos:"
echo "1. pnpm install          # Instalar dependências"
echo "2. pnpm type-check       # Verificar tipos"
echo "3. pnpm db:init          # Inicializar banco"
echo "4. pnpm test:woo         # Sincronizar produtos"
echo "5. pnpm dev              # Iniciar servidor"
echo ""
echo "Depois acesse: http://localhost:3000"
echo ""
