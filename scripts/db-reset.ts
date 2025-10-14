import fs from 'fs';
import path from 'path';
import { initializeDatabase } from '../src/lib/db';

console.log('🔧 Resetando database...\n');

const dbPath = path.join(process.cwd(), 'database', 'products.db');
const dbShmPath = `${dbPath}-shm`;
const dbWalPath = `${dbPath}-wal`;

try {
  // Remove database files if they exist
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ Removido: products.db');
  }
  if (fs.existsSync(dbShmPath)) {
    fs.unlinkSync(dbShmPath);
    console.log('✅ Removido: products.db-shm');
  }
  if (fs.existsSync(dbWalPath)) {
    fs.unlinkSync(dbWalPath);
    console.log('✅ Removido: products.db-wal');
  }

  // Reinitialize database
  console.log('\n🔧 Criando novo database...');
  initializeDatabase();

  console.log('\n✅ Database resetado com sucesso!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Erro ao resetar database:', error);
  process.exit(1);
}
