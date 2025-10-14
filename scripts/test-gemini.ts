import './load-env';

async function testGemini() {
  console.log('🧪 Testando Gemini API...\n');

  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  console.log(`API Key: ${apiKey?.substring(0, 20)}...${apiKey?.substring(apiKey.length - 5)}`);
  console.log(`Length: ${apiKey?.length} caracteres\n`);

  // Use gemini-2.5-flash (stable version)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Hello, respond with just "OK"' }]
        }]
      })
    });

    console.log(`Status: ${response.status} ${response.statusText}\n`);

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Gemini: Funcionando!');
      console.log('Resposta:', JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Gemini: Erro na resposta');
      console.log('Erro:', JSON.stringify(data, null, 2));

      if (data.error?.message) {
        console.log('\n💡 Mensagem de erro:', data.error.message);

        if (data.error.message.includes('API_KEY_INVALID')) {
          console.log('\n🔑 Solução:');
          console.log('1. Vá em: https://aistudio.google.com/app/apikey');
          console.log('2. Crie uma nova API Key');
          console.log('3. Cole no .env.local em GOOGLE_GEMINI_API_KEY');
        }
      }
    }
  } catch (error) {
    console.log('❌ Erro na requisição:', error);
  }
}

testGemini();
