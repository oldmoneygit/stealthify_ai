import fs from 'fs';
import path from 'path';

const editadoDir = path.join(process.cwd(), 'debug', 'qwen', 'all-images', 'editado');
const allImagesDir = path.join(process.cwd(), 'debug', 'qwen', 'all-images');

const files = fs.readdirSync(editadoDir)
  .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
  .sort();

console.log(`Total files in editado/: ${files.length}`);
console.log(`Should have: 79`);
console.log(`Extra files: ${files.length - 79}`);

if (files.length > 79) {
  const filesToMove = files.slice(79);
  console.log(`\nMoving ${filesToMove.length} files back to all-images/...`);

  filesToMove.forEach((file, idx) => {
    const src = path.join(editadoDir, file);
    const dest = path.join(allImagesDir, file);
    fs.renameSync(src, dest);
    console.log(`[${idx + 1}/${filesToMove.length}] ${file}`);
  });

  console.log(`\n✅ Moved ${filesToMove.length} files back!`);
} else {
  console.log('\n✅ No files to move back.');
}
