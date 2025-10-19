import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * Script para salvar o payload completo do webhook em um arquivo
 * para análise posterior.
 *
 * Adicione este código temporariamente no início do webhook handler
 * em src/app/api/shopify-order-webhook/route.ts:
 *
 * ```typescript
 * // TEMPORÁRIO - Salvar payload para análise
 * const fs = require('fs');
 * const path = require('path');
 * const payloadPath = path.join(process.cwd(), 'debug', 'webhook-payload.json');
 * fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
 * fs.writeFileSync(payloadPath, bodyText, 'utf8');
 * console.log('📝 Payload salvo em:', payloadPath);
 * ```
 */

console.log(`
╔════════════════════════════════════════════════════════════════════╗
║  📝 INSTRUÇÕES PARA CAPTURAR WEBHOOK PAYLOAD                      ║
╚════════════════════════════════════════════════════════════════════╝

1. Abra: src/app/api/shopify-order-webhook/route.ts

2. Adicione este código LOGO APÓS a linha "const bodyText = await request.text();":

   const fs = require('fs');
   const path = require('path');
   const payloadPath = path.join(process.cwd(), 'debug', 'webhook-payload.json');
   fs.mkdirSync(path.dirname(payloadPath), { recursive: true });
   fs.writeFileSync(payloadPath, bodyText, 'utf8');
   console.log('📝 Payload salvo em:', payloadPath);

3. Faça deploy (git add, commit, push)

4. Faça um NOVO PEDIDO DE TESTE na Shopify

5. Verifique o arquivo debug/webhook-payload.json

6. Compare com os dados retornados pela API GET /orders

Isso nos permitirá ver se o webhook traz mais dados do que a API.
`);

console.log('\n✅ Pronto! Siga as instruções acima.\n');
