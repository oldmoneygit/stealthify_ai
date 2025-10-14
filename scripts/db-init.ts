import { initializeDatabase } from '../src/lib/db';

console.log('🔧 Inicializando database...\n');

try {
  initializeDatabase();
  console.log('\n✅ Database inicializado com sucesso!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Erro ao inicializar database:', error);
  process.exit(1);
}
