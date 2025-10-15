import fs from 'fs';
import path from 'path';

/**
 * Save edited image to local filesystem
 *
 * @param imageBase64 - Base64-encoded image (with or without data URI prefix)
 * @param sku - Product SKU for filename
 * @param format - Image format (png, jpg, webp)
 * @returns Relative path to saved file
 */
export async function saveEditedImage(
  imageBase64: string,
  sku: string,
  format: 'png' | 'jpg' | 'webp' = 'png'
): Promise<string> {
  // Remove data URI prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  // Create output directory
  const outputDir = path.join(process.cwd(), 'output', 'edited-images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate filename: SKU + timestamp + format
  const timestamp = Date.now();
  const safeSkuName = sku.replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `${safeSkuName}_${timestamp}.${format}`;
  const filepath = path.join(outputDir, filename);

  // Convert base64 to buffer and save
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(filepath, buffer);

  console.log(`💾 Imagem salva: ${filename}`);

  // Return relative path
  return path.join('output', 'edited-images', filename);
}

/**
 * Get absolute path for a saved image
 *
 * @param relativePath - Relative path from saveEditedImage
 * @returns Absolute path to file
 */
export function getImagePath(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

/**
 * Check if saved image exists
 *
 * @param relativePath - Relative path from saveEditedImage
 * @returns True if file exists
 */
export function imageExists(relativePath: string): boolean {
  return fs.existsSync(getImagePath(relativePath));
}

/**
 * Delete saved image
 *
 * @param relativePath - Relative path from saveEditedImage
 */
export function deleteImage(relativePath: string): void {
  const filepath = getImagePath(relativePath);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    console.log(`🗑️ Imagem deletada: ${relativePath}`);
  }
}

/**
 * Save comparison image (before/after side by side)
 *
 * @param originalBase64 - Original image
 * @param editedBase64 - Edited image
 * @param sku - Product SKU
 * @returns Path to comparison image
 */
export async function saveComparisonImage(
  originalBase64: string,
  editedBase64: string,
  sku: string
): Promise<string> {
  // For now, just save edited image
  // TODO: Use Sharp to create side-by-side comparison
  return saveEditedImage(editedBase64, `${sku}_comparison`, 'png');
}

/**
 * List all saved images
 *
 * @returns Array of relative paths
 */
export function listSavedImages(): string[] {
  const outputDir = path.join(process.cwd(), 'output', 'edited-images');

  if (!fs.existsSync(outputDir)) {
    return [];
  }

  const files = fs.readdirSync(outputDir);
  return files.map(file => path.join('output', 'edited-images', file));
}

/**
 * Get stats for saved images (count, total size)
 */
export function getStorageStats(): {
  count: number;
  totalSizeBytes: number;
  totalSizeMB: number;
} {
  const images = listSavedImages();
  let totalSize = 0;

  for (const relativePath of images) {
    const filepath = getImagePath(relativePath);
    const stats = fs.statSync(filepath);
    totalSize += stats.size;
  }

  return {
    count: images.length,
    totalSizeBytes: totalSize,
    totalSizeMB: parseFloat((totalSize / (1024 * 1024)).toFixed(2))
  };
}

/**
 * Clean up old images (older than X days)
 *
 * @param daysOld - Delete images older than this many days
 * @returns Number of files deleted
 */
export function cleanOldImages(daysOld: number = 30): number {
  const images = listSavedImages();
  const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
  let deletedCount = 0;

  for (const relativePath of images) {
    const filepath = getImagePath(relativePath);
    const stats = fs.statSync(filepath);

    if (stats.mtimeMs < cutoffTime) {
      deleteImage(relativePath);
      deletedCount++;
    }
  }

  console.log(`🗑️ ${deletedCount} imagens antigas deletadas (>${daysOld} dias)`);
  return deletedCount;
}
