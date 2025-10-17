import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  try {
    // Await params (Next.js 15+ requirement)
    const params = await context.params;

    // Reconstruct the file path: debug/qwen/directory/filename
    const directory = params.path[0]; // e.g., "processed-181-200-v2"
    const filename = params.path[1]; // e.g., "26052-Nike-Air-Jordan-1.jpg"

    if (!directory || !filename) {
      return NextResponse.json(
        { error: 'Invalid path parameters' },
        { status: 400 }
      );
    }

    console.log(`📸 Serving image: ${directory}/${filename}`);

    const filepath = path.join(
      process.cwd(),
      'debug',
      'qwen',
      directory,
      filename
    );

    // Check if file exists
    if (!fs.existsSync(filepath)) {
      console.error(`❌ Image not found: ${filepath}`);
      return NextResponse.json(
        { error: 'Image not found', path: filepath },
        { status: 404 }
      );
    }

    // Read the image file
    const imageBuffer = fs.readFileSync(filepath);

    // Determine content type based on extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

    console.log(`✅ Image served: ${filename} (${imageBuffer.length} bytes)`);

    // Return the image
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });

  } catch (error) {
    console.error('❌ Error serving image:', error);
    return NextResponse.json(
      { error: 'Error loading image', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
