/**
 * Coordinate Validation Utility
 *
 * Helps debug coordinate transformation issues between Vision API and mask application.
 * Compares Vision API pixel coordinates vs normalized box_2d coordinates.
 */

interface VisionDetectedRegion {
  brand: string;
  type: 'logo' | 'text';
  confidence: number;
  boundingPoly: {
    vertices: Array<{ x: number; y: number }>;
  };
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

/**
 * Validate coordinate transformation from Vision API to box_2d
 */
export function validateCoordinateTransformation(
  region: VisionDetectedRegion,
  imageWidth: number,
  imageHeight: number
): {
  isValid: boolean;
  pixelCoords: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  normalizedCoords: {
    xmin: number;
    xmax: number;
    ymin: number;
    ymax: number;
    width: number;
    height: number;
  };
  box2dPixelCoords: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };
  matchesExpected: boolean;
  errorMessage?: string;
} {
  // Extract pixel coordinates from Vision API boundingPoly
  const vertices = region.boundingPoly.vertices;
  const xCoords = vertices.map(v => v.x || 0);
  const yCoords = vertices.map(v => v.y || 0);

  const pixelMinX = Math.min(...xCoords);
  const pixelMaxX = Math.max(...xCoords);
  const pixelMinY = Math.min(...yCoords);
  const pixelMaxY = Math.max(...yCoords);

  const pixelWidth = pixelMaxX - pixelMinX;
  const pixelHeight = pixelMaxY - pixelMinY;

  // Normalize to 0-1000 scale (this is what SHOULD be in box_2d)
  const expectedXMin = Math.round((pixelMinX / imageWidth) * 1000);
  const expectedXMax = Math.round((pixelMaxX / imageWidth) * 1000);
  const expectedYMin = Math.round((pixelMinY / imageHeight) * 1000);
  const expectedYMax = Math.round((pixelMaxY / imageHeight) * 1000);

  const normalizedWidth = expectedXMax - expectedXMin;
  const normalizedHeight = expectedYMax - expectedYMin;

  // Extract what's actually in box_2d
  const [actualYMin, actualXMin, actualYMax, actualXMax] = region.box_2d;

  // Convert box_2d BACK to pixels to see where masks are being applied
  const box2dPixelMinX = Math.floor((actualXMin / 1000) * imageWidth);
  const box2dPixelMaxX = Math.ceil((actualXMax / 1000) * imageWidth);
  const box2dPixelMinY = Math.floor((actualYMin / 1000) * imageHeight);
  const box2dPixelMaxY = Math.ceil((actualYMax / 1000) * imageHeight);

  const box2dPixelWidth = box2dPixelMaxX - box2dPixelMinX;
  const box2dPixelHeight = box2dPixelMaxY - box2dPixelMinY;

  // Check if they match (allowing 2 pixel tolerance due to rounding)
  const xMinMatches = Math.abs(expectedXMin - actualXMin) <= 2;
  const xMaxMatches = Math.abs(expectedXMax - actualXMax) <= 2;
  const yMinMatches = Math.abs(expectedYMin - actualYMin) <= 2;
  const yMaxMatches = Math.abs(expectedYMax - actualYMax) <= 2;

  const matchesExpected = xMinMatches && xMaxMatches && yMinMatches && yMaxMatches;

  let errorMessage: string | undefined;
  if (!matchesExpected) {
    const diffs = [];
    if (!xMinMatches) diffs.push(`xMin: expected ${expectedXMin}, got ${actualXMin} (diff: ${actualXMin - expectedXMin})`);
    if (!xMaxMatches) diffs.push(`xMax: expected ${expectedXMax}, got ${actualXMax} (diff: ${actualXMax - expectedXMax})`);
    if (!yMinMatches) diffs.push(`yMin: expected ${expectedYMin}, got ${actualYMin} (diff: ${actualYMin - expectedYMin})`);
    if (!yMaxMatches) diffs.push(`yMax: expected ${expectedYMax}, got ${actualYMax} (diff: ${actualYMax - expectedYMax})`);
    errorMessage = `Coordinate mismatch: ${diffs.join(', ')}`;
  }

  return {
    isValid: matchesExpected,
    pixelCoords: {
      minX: pixelMinX,
      maxX: pixelMaxX,
      minY: pixelMinY,
      maxY: pixelMaxY,
      width: pixelWidth,
      height: pixelHeight
    },
    normalizedCoords: {
      xmin: expectedXMin,
      xmax: expectedXMax,
      ymin: expectedYMin,
      ymax: expectedYMax,
      width: normalizedWidth,
      height: normalizedHeight
    },
    box2dPixelCoords: {
      minX: box2dPixelMinX,
      maxX: box2dPixelMaxX,
      minY: box2dPixelMinY,
      maxY: box2dPixelMaxY,
      width: box2dPixelWidth,
      height: box2dPixelHeight
    },
    matchesExpected,
    errorMessage
  };
}

/**
 * Log detailed coordinate validation for debugging
 */
export function logCoordinateValidation(
  region: VisionDetectedRegion,
  imageWidth: number,
  imageHeight: number
): void {
  const validation = validateCoordinateTransformation(region, imageWidth, imageHeight);

  console.log(`\n🔍 Coordinate Validation: ${region.brand} (${region.type})`);
  console.log(`   Image Dimensions: ${imageWidth}x${imageHeight}`);

  console.log(`\n   📍 Vision API Pixel Coordinates:`);
  console.log(`      x: [${validation.pixelCoords.minX} - ${validation.pixelCoords.maxX}] (width: ${validation.pixelCoords.width}px)`);
  console.log(`      y: [${validation.pixelCoords.minY} - ${validation.pixelCoords.maxY}] (height: ${validation.pixelCoords.height}px)`);

  console.log(`\n   📐 Expected Normalized (0-1000):`);
  console.log(`      xmin: ${validation.normalizedCoords.xmin}, xmax: ${validation.normalizedCoords.xmax}`);
  console.log(`      ymin: ${validation.normalizedCoords.ymin}, ymax: ${validation.normalizedCoords.ymax}`);

  console.log(`\n   📦 Actual box_2d: [${region.box_2d.join(', ')}]`);
  console.log(`      [ymin, xmin, ymax, xmax]`);

  console.log(`\n   🎯 Where Mask Will Be Applied (pixels):`);
  console.log(`      x: [${validation.box2dPixelCoords.minX} - ${validation.box2dPixelCoords.maxX}] (width: ${validation.box2dPixelCoords.width}px)`);
  console.log(`      y: [${validation.box2dPixelCoords.minY} - ${validation.box2dPixelCoords.maxY}] (height: ${validation.box2dPixelCoords.height}px)`);

  if (validation.matchesExpected) {
    console.log(`\n   ✅ Coordinates match! Mask should be in correct position.`);
  } else {
    console.log(`\n   ❌ Coordinates MISMATCH! Mask will be in wrong position!`);
    console.log(`   ⚠️ ${validation.errorMessage}`);
  }
}

/**
 * Batch validate all regions
 */
export function validateAllRegions(
  regions: VisionDetectedRegion[],
  imageWidth: number,
  imageHeight: number
): {
  allValid: boolean;
  validCount: number;
  invalidCount: number;
  invalidRegions: Array<{
    brand: string;
    type: string;
    error: string;
  }>;
} {
  const invalidRegions: Array<{ brand: string; type: string; error: string }> = [];
  let validCount = 0;
  let invalidCount = 0;

  for (const region of regions) {
    const validation = validateCoordinateTransformation(region, imageWidth, imageHeight);

    if (validation.matchesExpected) {
      validCount++;
    } else {
      invalidCount++;
      invalidRegions.push({
        brand: region.brand,
        type: region.type,
        error: validation.errorMessage || 'Unknown mismatch'
      });
    }
  }

  return {
    allValid: invalidCount === 0,
    validCount,
    invalidCount,
    invalidRegions
  };
}
