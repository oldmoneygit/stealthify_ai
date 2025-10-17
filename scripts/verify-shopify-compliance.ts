/**
 * 🔍 VERIFY SHOPIFY COMPLIANCE - Verificar conformidade com Shopify
 *
 * Analisa TODAS as imagens editadas e verifica se passariam na verificação de IA da Shopify
 * Move imagens com risco para pasta separada e gera relatório com sugestões
 */

// ⚠️ IMPORTANTE: Carregar variáveis de ambiente ANTES de importar qualquer coisa
import { config } from 'dotenv';
config({ path: '.env.local' });

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const EDITED_DIR = 'debug/edited';
const RISKY_DIR = 'debug/shopify-risky';
const SAFE_DIR = 'debug/shopify-safe';
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY!;
const GEMINI_MODEL = 'gemini-2.5-flash';

// Threshold de risco: acima disso, não passa na Shopify
const RISK_THRESHOLD = 30; // Bem rigoroso para garantir

interface ShopifyVerification {
  filename: string;
  brands_detected: string[];
  risk_score: number;
  will_pass_shopify: boolean;
  detected_elements: string[];
  confidence: number;
  suggestions: string[];
}

async function fileToBase64(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);

  const resized = await sharp(buffer)
    .resize(2048, 2048, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return resized.toString('base64');
}

async function verifyShopifyCompliance(imageBase64: string, filename: string): Promise<ShopifyVerification> {
  const prompt = `You are an AI verification system for Shopify.

Analyze this product image with EXTREME SCRUTINY to detect ANY remaining brand elements that would violate Shopify's policies.

Look for:
- Brand logos (Nike swoosh, Jordan jumpman, Adidas stripes, etc.)
- Brand text/wordmarks (even partial or faded)
- Brand symbols or icons
- Trademarked patterns or designs
- Any subtle brand elements

Return ONLY a JSON object with this structure:
{
  "brands_detected": ["Brand1", "Brand2"],
  "risk_score": 0-100,
  "detected_elements": ["description of what was found"],
  "confidence": 0-100,
  "will_pass_shopify": true/false
}

Risk score scale:
- 0-20: Clean, will definitely pass
- 21-40: Minor traces, might pass
- 41-60: Moderate branding, likely will fail
- 61-100: Strong branding, will definitely fail

Be VERY STRICT. Even subtle logos or partial text should be flagged.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature: 0.1, // Bem baixo para ser consistente
          responseMimeType: 'application/json'
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('No content in Gemini response');
  }

  const analysis = JSON.parse(content);

  // Gerar sugestões baseadas no que foi detectado
  const suggestions: string[] = [];

  if (analysis.risk_score > RISK_THRESHOLD) {
    suggestions.push('🚨 AÇÃO NECESSÁRIA: Reprocessar com Qwen Prime');

    if (analysis.brands_detected.length > 0) {
      suggestions.push(`🎯 Marcas detectadas: ${analysis.brands_detected.join(', ')}`);
    }

    if (analysis.detected_elements.length > 0) {
      analysis.detected_elements.forEach((element: string) => {
        if (element.toLowerCase().includes('logo')) {
          suggestions.push('💡 Aplicar máscara mais agressiva nos logos');
        }
        if (element.toLowerCase().includes('text')) {
          suggestions.push('💡 Remover completamente textos de marca');
        }
        if (element.toLowerCase().includes('swoosh')) {
          suggestions.push('💡 Focar remoção do swoosh Nike com prompts específicos');
        }
        if (element.toLowerCase().includes('jumpman')) {
          suggestions.push('💡 Remover Jumpman Jordan com inpainting adicional');
        }
      });
    }

    suggestions.push('🔄 Alternativas: Aplicar blur estratégico ou substituir por placeholder');
  }

  return {
    filename,
    brands_detected: analysis.brands_detected || [],
    risk_score: analysis.risk_score || 0,
    will_pass_shopify: analysis.will_pass_shopify !== false && analysis.risk_score <= RISK_THRESHOLD,
    detected_elements: analysis.detected_elements || [],
    confidence: analysis.confidence || 0,
    suggestions
  };
}

async function verifyAllProducts(): Promise<void> {
  console.log('🔍 VERIFICAÇÃO DE CONFORMIDADE COM SHOPIFY\n');
  console.log('📋 Analisando TODAS as imagens com IA rigorosa...');
  console.log(`🎯 Threshold de risco: ${RISK_THRESHOLD} (acima = não passa)\n`);
  console.log('='.repeat(80) + '\n');

  // 1. Criar pastas
  await fs.mkdir(RISKY_DIR, { recursive: true });
  await fs.mkdir(SAFE_DIR, { recursive: true });

  // 2. Ler todas as imagens
  const files = await fs.readdir(EDITED_DIR);
  const imageFiles = files.filter(f => f.endsWith('.jpg'));

  console.log(`📁 Total de imagens a analisar: ${imageFiles.length}\n`);

  const results: ShopifyVerification[] = [];
  let safeCount = 0;
  let riskyCount = 0;

  // 3. Analisar cada imagem
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const filePath = path.join(EDITED_DIR, file);

    console.log(`[${i + 1}/${imageFiles.length}] Analisando: ${file}`);

    try {
      // Converter para base64
      const imageBase64 = await fileToBase64(filePath);

      // Verificar com Gemini
      const verification = await verifyShopifyCompliance(imageBase64, file);

      // Decidir destino
      let status = '';
      let destDir = '';

      if (verification.will_pass_shopify) {
        status = '✅ PASSA';
        destDir = SAFE_DIR;
        safeCount++;
      } else {
        status = '❌ NÃO PASSA';
        destDir = RISKY_DIR;
        riskyCount++;
      }

      console.log(`   ${status} - Risk: ${verification.risk_score} - Brands: ${verification.brands_detected.length > 0 ? verification.brands_detected.join(', ') : 'None'}`);

      // Copiar para pasta apropriada
      const destPath = path.join(destDir, file);
      await fs.copyFile(filePath, destPath);

      results.push(verification);

      // Pequeno delay para não sobrecarregar API
      if ((i + 1) % 10 === 0) {
        console.log(`   ⏸️  Pausa (processado ${i + 1}/${imageFiles.length})...\n`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log('');
      }

    } catch (error) {
      console.error(`   ❌ Erro: ${error}`);
      console.log('');
    }
  }

  // 4. Resumo final
  console.log('='.repeat(80));
  console.log('📊 RESULTADO DA VERIFICAÇÃO\n');

  console.log(`   ✅ PASSA na Shopify: ${safeCount} (${((safeCount / imageFiles.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ NÃO PASSA na Shopify: ${riskyCount} (${((riskyCount / imageFiles.length) * 100).toFixed(1)}%)\n`);

  // 5. Produtos de alto risco
  const highRisk = results.filter(r => !r.will_pass_shopify);

  if (highRisk.length > 0) {
    console.log('🚨 PRODUTOS COM RISCO (NÃO PASSAM NA SHOPIFY):\n');

    // Ordenar por risk score (maior primeiro)
    highRisk.sort((a, b) => b.risk_score - a.risk_score);

    console.log('   Top 20 mais arriscados:');
    highRisk.slice(0, 20).forEach((item, index) => {
      console.log(`   ${index + 1}. [Risk ${item.risk_score}] ${item.filename}`);
      if (item.brands_detected.length > 0) {
        console.log(`      Marcas: ${item.brands_detected.join(', ')}`);
      }
      if (item.detected_elements.length > 0) {
        console.log(`      Elementos: ${item.detected_elements.slice(0, 2).join(', ')}`);
      }
      console.log('');
    });

    if (highRisk.length > 20) {
      console.log(`   ... e mais ${highRisk.length - 20} produtos\n`);
    }
  }

  // 6. Estatísticas de marcas detectadas
  const brandsCount = new Map<string, number>();
  results.forEach(r => {
    r.brands_detected.forEach(brand => {
      brandsCount.set(brand, (brandsCount.get(brand) || 0) + 1);
    });
  });

  if (brandsCount.size > 0) {
    console.log('📈 MARCAS AINDA DETECTADAS (top 10):\n');
    const sortedBrands = Array.from(brandsCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedBrands.forEach(([brand, count]) => {
      console.log(`   ${brand}: ${count} produtos`);
    });
    console.log('');
  }

  // 7. Gerar relatório JSON
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_analyzed: imageFiles.length,
      safe_for_shopify: safeCount,
      risky_for_shopify: riskyCount,
      pass_rate: ((safeCount / imageFiles.length) * 100).toFixed(2) + '%',
      risk_threshold: RISK_THRESHOLD
    },
    brands_detected: Object.fromEntries(brandsCount),
    risky_products: highRisk.map(r => ({
      filename: r.filename,
      risk_score: r.risk_score,
      brands: r.brands_detected,
      elements: r.detected_elements,
      suggestions: r.suggestions
    })),
    all_results: results
  };

  await fs.writeFile(
    'debug/shopify-compliance-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('='.repeat(80));
  console.log('💾 Relatório salvo: debug/shopify-compliance-report.json');
  console.log('='.repeat(80) + '\n');

  // 8. Sugestões gerais
  console.log('💡 SUGESTÕES GERAIS:\n');

  if (riskyCount > 0) {
    console.log('   🔄 AÇÕES RECOMENDADAS:');
    console.log('   1. Reprocessar produtos de alto risco com Qwen Prime');
    console.log('   2. Usar prompts mais agressivos para remoção');
    console.log('   3. Aplicar blur estratégico em logos persistentes');
    console.log('   4. Considerar substituição por imagens genéricas para casos extremos\n');

    console.log('   📁 ORGANIZAÇÃO:');
    console.log(`   - Produtos SEGUROS: debug/shopify-safe/ (${safeCount} arquivos)`);
    console.log(`   - Produtos ARRISCADOS: debug/shopify-risky/ (${riskyCount} arquivos)\n`);
  } else {
    console.log('   🎉 PARABÉNS! Todos os produtos passam na verificação!\n');
  }

  console.log('='.repeat(80));
  console.log('✅ VERIFICAÇÃO CONCLUÍDA!');
  console.log('='.repeat(80));
}

// Execute
verifyAllProducts().catch((error) => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
