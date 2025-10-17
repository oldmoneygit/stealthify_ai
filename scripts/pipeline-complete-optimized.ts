import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import Replicate from 'replicate';
import { google } from 'googleapis';

// ============================================================================
// TIPOS
// ============================================================================

interface VisionAPIDetection {
  logos: Array<{
    brand: string;
    confidence: number;
    vertices: Array<{ x?: number; y?: number }>;
  }>;
  texts: Array<{
    text: string;
    confidence: number;
    vertices: Array<{ x?: number; y?: number }>;
  }>;
}

interface ProcessResult {
  productId: string;
  status: 'skipped_already_edited' | 'skipped_clean' | 'edited_qwen' | 'edited_blur' | 'failed';
  needsEdit: boolean;
  qwenApplied: boolean;
  blurApplied: boolean;
  detectionsBefore: number;
  detectionsAfter: number;
  finalPath?: string;
  error?: string;
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
});

const QWEN_MODEL = 'zsxkib/qwen2-vl-7b-instruct:de848a761c61e29a4ba7be44ebdf62f1151adffc452a36e0a90e3e44f4e7d048';

// Diretórios
const INPUT_DIR = path.join(process.cwd(), 'debug');
const OUTPUT_BASE = path.join(process.cwd(), 'debug', 'processed');
const EDITED_DIR = path.join(OUTPUT_BASE, 'edited');
const BLUR_DIR = path.join(OUTPUT_BASE, 'blur-smart');
const COMPARISON_DIR = path.join(OUTPUT_BASE, 'comparison');
const VISION_DIR = path.join(OUTPUT_BASE, 'vision_analysis');

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function extractProductId(filename: string): string {
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : '';
}

function isAlreadyProcessed(productId: string): boolean {
  // Verifica se já existe em blur-edited-smart ou edited
  const blurSmartPath = path.join(process.cwd(), 'debug', 'comparison', 'blur-edited-smart');
  const editedPath = path.join(process.cwd(), 'debug', 'comparison', 'edited');

  if (fs.existsSync(blurSmartPath)) {
    const files = fs.readdirSync(blurSmartPath);
    if (files.some(f => f.startsWith(productId))) {
      return true;
    }
  }

  if (fs.existsSync(editedPath)) {
    const files = fs.readdirSync(editedPath);
    if (files.some(f => f.startsWith(productId))) {
      return true;
    }
  }

  return false;
}

async function imageToBase64(imagePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(imagePath);
  return buffer.toString('base64');
}

async function base64ToImage(base64: string, outputPath: string): Promise<void> {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  await fs.promises.writeFile(outputPath, buffer);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// VERTEX AI - VISION API
// ============================================================================

async function getVertexAIToken(): Promise<string> {
  const serviceAccountJson = process.env.GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error('GOOGLE_VERTEX_SERVICE_ACCOUNT_JSON não encontrada');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    undefined,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/cloud-platform']
  );

  const tokens = await jwtClient.authorize();

  if (!tokens.access_token) {
    throw new Error('Falha ao obter access token');
  }

  return tokens.access_token;
}

async function analyzeWithVisionAPI(imagePath: string): Promise<VisionAPIDetection> {
  const accessToken = await getVertexAIToken();
  const imageBase64 = await imageToBase64(imagePath);

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [
            { type: 'LOGO_DETECTION', maxResults: 50 },
            { type: 'TEXT_DETECTION', maxResults: 50 }
          ]
        }]
      })
    }
  );

  const data = await response.json();
  const result = data.responses[0];

  const logos = (result.logoAnnotations || []).map((logo: any) => ({
    brand: logo.description,
    confidence: Math.round(logo.score * 100),
    vertices: logo.boundingPoly.vertices
  }));

  const texts = (result.textAnnotations || []).slice(1).map((text: any) => ({
    text: text.description,
    confidence: Math.round(text.score * 100 || 80),
    vertices: text.boundingPoly.vertices
  }));

  return { logos, texts };
}

// ============================================================================
// QWEN EDIT IMAGE
// ============================================================================

async function editImageWithQwen(
  imagePath: string,
  productId: string
): Promise<string> {
  console.log('   🎨 Editando com Qwen...');

  const imageBuffer = await fs.promises.readFile(imagePath);
  const base64 = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const prompt = `Remove ALL brand logos, brand names, and brand text from this product image.
This includes Nike swoosh, Adidas stripes, brand labels, and any visible text.
Keep the product design intact but remove all branding elements completely.
Make the removal look natural and seamless.`;

  const output = await replicate.run(QWEN_MODEL, {
    input: {
      image: base64,
      prompt: prompt,
      max_pixels: 1024000,
    }
  }) as any;

  if (!output || !output.edited_image) {
    throw new Error('Qwen não retornou imagem editada');
  }

  return output.edited_image;
}

// ============================================================================
// BLUR INTELIGENTE
// ============================================================================

async function applySmartBlur(
  imagePath: string,
  detection: VisionAPIDetection,
  outputPath: string
): Promise<number> {
  // Filtrar detecções críticas (Nike-related)
  const nikeLogos = detection.logos.filter(logo =>
    (logo.brand.toLowerCase().includes('nike') && logo.confidence > 70) ||
    logo.confidence > 85
  );

  const nikeTexts = detection.texts.filter(text => {
    const t = text.text.toLowerCase();
    return (t.includes('nike') && text.text.length >= 3) ||
           t === 'sb' || t === 'air' ||
           (t.length >= 6 && (t.includes('swoosh') || t.includes('jordan')));
  });

  const allRegions = [...nikeLogos, ...nikeTexts];

  if (allRegions.length === 0) {
    return 0;
  }

  console.log(`   🎯 Aplicando blur em ${allRegions.length} regiões críticas`);

  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  let imageBuffer = await image.toBuffer();

  for (const region of allRegions) {
    const vertices = region.vertices;

    // Sem padding - bordas exatas
    const x = Math.max(0, Math.min(...vertices.map(v => v.x || 0)));
    const y = Math.max(0, Math.min(...vertices.map(v => v.y || 0)));
    const maxX = Math.min(width, Math.max(...vertices.map(v => v.x || 0)));
    const maxY = Math.min(height, Math.max(...vertices.map(v => v.y || 0)));

    const boxWidth = maxX - x;
    const boxHeight = maxY - y;

    // Pular regiões muito pequenas
    if (boxWidth < 10 || boxHeight < 10) continue;

    // Blur leve (15 em vez de 50)
    const regionBuffer = await sharp(imageBuffer)
      .extract({ left: x, top: y, width: boxWidth, height: boxHeight })
      .blur(15)
      .toBuffer();

    imageBuffer = await sharp(imageBuffer)
      .composite([{
        input: regionBuffer,
        left: x,
        top: y
      }])
      .toBuffer();
  }

  await sharp(imageBuffer).toFile(outputPath);
  return allRegions.length;
}

// ============================================================================
// CRIAR COMPARAÇÃO
// ============================================================================

async function createComparison(
  originalPath: string,
  editedPath: string,
  outputPath: string
): Promise<void> {
  const original = sharp(originalPath).resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255 } });
  const edited = sharp(editedPath).resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255 } });

  const [originalBuffer, editedBuffer] = await Promise.all([
    original.toBuffer(),
    edited.toBuffer()
  ]);

  await sharp({
    create: {
      width: 1024,
      height: 512,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
  .composite([
    { input: originalBuffer, left: 0, top: 0 },
    { input: editedBuffer, left: 512, top: 0 }
  ])
  .toFile(outputPath);
}

// ============================================================================
// PIPELINE PRINCIPAL
// ============================================================================

async function processProduct(imagePath: string): Promise<ProcessResult> {
  const filename = path.basename(imagePath);
  const productId = extractProductId(filename);
  const baseFilename = filename.replace('.png', '');

  console.log(`\n${'='.repeat(80)}`);
  console.log(`📸 ${filename} (ID: ${productId})`);
  console.log(`${'='.repeat(80)}`);

  const result: ProcessResult = {
    productId,
    status: 'failed',
    needsEdit: false,
    qwenApplied: false,
    blurApplied: false,
    detectionsBefore: 0,
    detectionsAfter: 0,
  };

  try {
    // STEP 1: Verificar se já foi processado
    console.log('   [1/5] Verificando se já foi editado...');
    if (isAlreadyProcessed(productId)) {
      console.log('   ✅ Produto já editado anteriormente - PULANDO');
      result.status = 'skipped_already_edited';
      return result;
    }

    // STEP 2: Análise inicial com Vision AI
    console.log('   [2/5] Analisando com Vision AI...');
    const initialDetection = await analyzeWithVisionAPI(imagePath);
    const totalDetections = initialDetection.logos.length + initialDetection.texts.length;
    result.detectionsBefore = totalDetections;

    console.log(`   Encontrado: ${initialDetection.logos.length} logos, ${initialDetection.texts.length} textos`);

    // Verificar se precisa edição (Nike-related)
    const hasNikeBrands = initialDetection.logos.some(l =>
      l.brand.toLowerCase().includes('nike') ||
      l.brand.toLowerCase().includes('jordan') ||
      l.brand.toLowerCase().includes('adidas')
    );

    const hasNikeTexts = initialDetection.texts.some(t => {
      const text = t.text.toLowerCase();
      return text.includes('nike') || text === 'sb' || text === 'air';
    });

    if (!hasNikeBrands && !hasNikeTexts) {
      console.log('   ✅ Imagem limpa - não precisa edição - PULANDO');
      result.status = 'skipped_clean';
      result.needsEdit = false;
      return result;
    }

    result.needsEdit = true;
    console.log('   ⚠️ Marcas detectadas - iniciando edição');

    // STEP 3: Editar com Qwen
    console.log('   [3/5] Editando com Qwen...');
    const editedBase64 = await editImageWithQwen(imagePath, productId);

    const editedPath = path.join(EDITED_DIR, `${baseFilename}_edited.png`);
    await base64ToImage(editedBase64, editedPath);
    result.qwenApplied = true;
    console.log('   ✅ Qwen aplicado');

    // Aguardar um pouco para evitar rate limit
    await sleep(1000);

    // STEP 4: Re-analisar com Vision AI
    console.log('   [4/5] Re-analisando com Vision AI...');
    const finalDetection = await analyzeWithVisionAPI(editedPath);
    result.detectionsAfter = finalDetection.logos.length + finalDetection.texts.length;

    console.log(`   Encontrado: ${finalDetection.logos.length} logos, ${finalDetection.texts.length} textos`);

    // STEP 5: Aplicar blur inteligente se necessário
    console.log('   [5/5] Verificando necessidade de blur...');

    const hasRemainingNike = finalDetection.logos.some(l =>
      l.brand.toLowerCase().includes('nike') && l.confidence > 70
    ) || finalDetection.texts.some(t => {
      const text = t.text.toLowerCase();
      return (text.includes('nike') && t.text.length >= 3) || text === 'sb' || text === 'air';
    });

    let finalImagePath = editedPath;

    if (hasRemainingNike) {
      const blurPath = path.join(BLUR_DIR, `${baseFilename}_edited-blur.png`);
      const regionsBlurred = await applySmartBlur(editedPath, finalDetection, blurPath);

      if (regionsBlurred > 0) {
        result.blurApplied = true;
        finalImagePath = blurPath;
        console.log(`   ✅ Blur aplicado em ${regionsBlurred} regiões`);
        result.status = 'edited_blur';
      } else {
        result.status = 'edited_qwen';
      }
    } else {
      console.log('   ✅ Imagem limpa após Qwen - sem necessidade de blur');
      result.status = 'edited_qwen';
    }

    // Criar comparação
    const comparisonPath = path.join(COMPARISON_DIR, `${baseFilename}_comparison.png`);
    await createComparison(imagePath, finalImagePath, comparisonPath);
    console.log('   ✅ Comparação criada');

    result.finalPath = finalImagePath;
    console.log(`   ✅ CONCLUÍDO - Status: ${result.status}`);

  } catch (error) {
    console.error('   ❌ ERRO:', error);
    result.error = error instanceof Error ? error.message : String(error);
    result.status = 'failed';
  }

  return result;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const limit = parseInt(process.argv[2] || '10');

  console.log(`🚀 PIPELINE COMPLETO OTIMIZADO`);
  console.log(`📂 Input: ${INPUT_DIR}`);
  console.log(`📊 Limite: ${limit} produtos`);
  console.log(`\n`);

  // Criar diretórios
  [OUTPUT_BASE, EDITED_DIR, BLUR_DIR, COMPARISON_DIR, VISION_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Listar imagens (apenas produtos Nike com ID numérico no início)
  const images = fs.readdirSync(INPUT_DIR)
    .filter(f => (f.endsWith('.png') || f.endsWith('.jpg')) && /^\d+-Nike/.test(f))
    .slice(0, limit);

  console.log(`📸 Total de imagens: ${images.length}\n`);

  const results: ProcessResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const imagePath = path.join(INPUT_DIR, images[i]);
    const result = await processProduct(imagePath);
    results.push(result);

    console.log(`\n📊 Progresso: ${i + 1}/${images.length}\n`);

    // Aguardar entre produtos
    if (i < images.length - 1) {
      await sleep(2000);
    }
  }

  // Relatório final
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 RELATÓRIO FINAL`);
  console.log(`${'='.repeat(80)}\n`);

  const skippedAlreadyEdited = results.filter(r => r.status === 'skipped_already_edited').length;
  const skippedClean = results.filter(r => r.status === 'skipped_clean').length;
  const editedQwen = results.filter(r => r.status === 'edited_qwen').length;
  const editedBlur = results.filter(r => r.status === 'edited_blur').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`Total Processado:              ${results.length}`);
  console.log(`Já Editados (pulados):         ${skippedAlreadyEdited}`);
  console.log(`Limpos (sem edição):           ${skippedClean}`);
  console.log(`Editados (Qwen apenas):        ${editedQwen}`);
  console.log(`Editados (Qwen + Blur):        ${editedBlur}`);
  console.log(`Falhas:                        ${failed}`);
  console.log(`\n`);

  // Taxa de sucesso
  const totalEdited = editedQwen + editedBlur;
  const totalSkipped = skippedAlreadyEdited + skippedClean;
  const totalProcessed = totalEdited + totalSkipped;
  const successRate = totalProcessed > 0 ? Math.round((totalProcessed / results.length) * 100) : 0;

  console.log(`Taxa de Sucesso: ${successRate}%`);
  console.log(`\n`);

  // Salvar relatório
  const reportPath = path.join(OUTPUT_BASE, 'REPORT.txt');
  const reportContent = `
RELATÓRIO DE PROCESSAMENTO - ${new Date().toISOString()}
${'='.repeat(80)}

CONFIGURAÇÃO:
- Limite: ${limit} produtos
- Input: ${INPUT_DIR}
- Output: ${OUTPUT_BASE}

RESULTADOS:
- Total Processado:              ${results.length}
- Já Editados (pulados):         ${skippedAlreadyEdited}
- Limpos (sem edição):           ${skippedClean}
- Editados (Qwen apenas):        ${editedQwen}
- Editados (Qwen + Blur):        ${editedBlur}
- Falhas:                        ${failed}
- Taxa de Sucesso:               ${successRate}%

DETALHES POR PRODUTO:
${results.map(r => `
ID: ${r.productId}
Status: ${r.status}
Precisa Edição: ${r.needsEdit ? 'Sim' : 'Não'}
Qwen Aplicado: ${r.qwenApplied ? 'Sim' : 'Não'}
Blur Aplicado: ${r.blurApplied ? 'Sim' : 'Não'}
Detecções (antes): ${r.detectionsBefore}
Detecções (depois): ${r.detectionsAfter}
${r.error ? `Erro: ${r.error}` : ''}
${r.finalPath ? `Resultado: ${r.finalPath}` : ''}
`).join('\n' + '-'.repeat(80) + '\n')}
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`📄 Relatório salvo: ${reportPath}`);
  console.log(`\n✅ Pipeline completo!\n`);
}

main().catch(console.error);
