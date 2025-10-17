import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Serve final edited images from debug/final-edited directory
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;

    // Validate filename (prevent directory traversal)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const imagePath = path.join(process.cwd(), 'debug', 'final-edited', filename);

    if (!fs.existsSync(imagePath)) {
      console.log(`❌ Final image not found: ${filename}`);
      return NextResponse.json(
        { error: 'Final image not found' },
        { status: 404 }
      );
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(filename).toLowerCase();

    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.webp') contentType = 'image/webp';

    console.log(`💎 Serving final image: ${filename} (${imageBuffer.length} bytes)`);

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (error: any) {
    console.error('❌ Error serving final image:', error);
    return NextResponse.json(
      { error: 'Failed to load final image' },
      { status: 500 }
    );
  }
}
