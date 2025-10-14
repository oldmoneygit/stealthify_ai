import './load-env';
import { camouflage } from '@/services/title.service';

console.log('🧪 Testando serviço de camuflagem de títulos...\n');

// Test cases
const testCases = [
  'Nike Air Max 90 Original Black White',
  'Adidas Ultraboost Premium Sneakers',
  'Air Jordan 1 Retro High OG',
  'Gucci Belt Premium Leather',
  'New Balance 574 Classic',
  'Off-White x Nike Dunk Low',
  'Louis Vuitton Bag Authentic',
  'Under Armour Running Shoes Limited Edition'
];

console.log('📝 Casos de teste:\n');

for (const title of testCases) {
  const camouflaged = camouflage(title);

  console.log(`Original:    ${title}`);
  console.log(`Camouflado:  ${camouflaged}`);
  console.log('─'.repeat(60));
}

console.log('\n✅ Teste concluído!');
