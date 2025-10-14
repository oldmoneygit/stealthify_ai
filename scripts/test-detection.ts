import './load-env';
import { detect, segment } from '@/services/detection.service';

console.log('🧪 Testando serviço de detecção de marcas...\n');

// Test image URL (Nike shoe with visible swoosh logo)
const testImageUrl = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'; // Nike shoe

async function testDetection() {
  try {
    console.log('📸 Imagem de teste:', testImageUrl);
    console.log('─'.repeat(60));

    // Step 1: Detection
    console.log('\n🔍 PASSO 1: Detectando marcas...\n');
    const detection = await detect(testImageUrl);

    console.log('✅ Detecção completa!');
    console.log('\n📊 Resultados:');
    console.log('  Marcas detectadas:', detection.brands.join(', '));
    console.log('  Risk Score:', detection.riskScore);
    console.log('  Regiões encontradas:', detection.regions.length);

    console.log('\n📍 Detalhes das regiões:');
    detection.regions.forEach((region, index) => {
      console.log(`\n  Região ${index + 1}:`);
      console.log(`    Marca: ${region.brand}`);
      console.log(`    Tipo: ${region.type}`);
      console.log(`    Confiança: ${region.confidence}%`);
      console.log(`    Pontos do polígono: ${region.polygon.length}`);
    });

    // Step 2: Segmentation
    if (detection.regions.length > 0) {
      console.log('\n─'.repeat(60));
      console.log('\n🎯 PASSO 2: Criando segmentação precisa...\n');

      const segments = await segment(testImageUrl, detection.regions);

      console.log('✅ Segmentação completa!');
      console.log('\n📊 Resultados:');
      console.log('  Segmentos criados:', segments.length);

      console.log('\n📐 Detalhes dos segmentos:');
      segments.forEach((seg, index) => {
        console.log(`\n  Segmento ${index + 1}:`);
        console.log(`    Marca: ${seg.brand}`);
        console.log(`    Confiança: ${seg.confidence}%`);
        console.log(`    Pontos do polígono: ${seg.polygon.length}`);
      });
    } else {
      console.log('\n⚠️ Nenhuma região detectada para segmentar');
    }

    console.log('\n─'.repeat(60));
    console.log('\n✅ Teste concluído com sucesso!');

  } catch (error) {
    console.error('\n❌ Erro no teste:', error);
    process.exit(1);
  }
}

testDetection();
