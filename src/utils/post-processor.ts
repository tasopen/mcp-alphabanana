/**
 * Post-processing utilities for image resize and transparency.
 * Uses Sharp for image manipulation.
 */

import sharp from 'sharp';

export type ResizeMode = 'crop' | 'stretch' | 'letterbox' | 'contain';
export type OutputFormat = 'png' | 'jpg';

export interface PostProcessOptions {
  width: number;
  height: number;
  format: OutputFormat;
  resizeMode: ResizeMode;
  transparentColor: string | null;  // Hex color to make transparent
  colorTolerance: number;           // 0-255
  hasTransparency?: boolean;        // Whether image has transparency applied
}

/**
 * Post-process an image: apply transparency and resize.
 * Transparency is applied before resize to prevent color bleeding.
 * @param inputBuffer - Raw image buffer from Gemini
 * @param options - Processing options
 * @returns Processed image buffer
 */
export async function postProcess(
  inputBuffer: Buffer,
  options: PostProcessOptions
): Promise<Buffer> {
  let image = sharp(inputBuffer);
  
  // Step 1: Apply transparency (before resize to prevent bleeding)
  if (options.transparentColor && options.format === 'png') {
    image = await applyTransparency(image, options.transparentColor, options.colorTolerance);
  }
  
  // Step 2: Resize based on mode
  const hasTransparency = options.hasTransparency ?? (options.transparentColor !== null && options.format === 'png');
  image = applyResize(image, options.width, options.height, options.resizeMode, options.format, hasTransparency);
  
  // Step 3: Output format
  if (options.format === 'png') {
    return image.png().toBuffer();
  } else {
    return image.jpeg({ quality: 90 }).toBuffer();
  }
}

/**
 * Apply color-key transparency using HSV-based matching.
 * @param image - Sharp image instance
 * @param hexColor - Hex color to make transparent
 * @param tolerance - Color matching tolerance (0-255)
 * @returns New Sharp instance with transparency applied
 */
async function applyTransparency(
  image: sharp.Sharp,
  hexColor: string,
  tolerance: number
): Promise<sharp.Sharp> {
  // Parse hex color
  const { r: targetR, g: targetG, b: targetB } = parseHexColor(hexColor);
  
  // Get raw pixel data
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const pixels = new Uint8Array(data);
  const { width, height, channels } = info;
  
  // Convert target color to HSV
  const targetHSV = rgbToHsv(targetR, targetG, targetB);
  
  // Process each pixel
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    // Convert pixel to HSV and compare
    const pixelHSV = rgbToHsv(r, g, b);
    
    // Filter out low-saturation (gray-like) and very dark pixels
    // This prevents unintended transparency of grays and blacks
    // Scale thresholds based on tolerance: higher tolerance = more permissive filters
    const MIN_SATURATION = Math.max(20, 50 - (tolerance / 255) * 30);  // 50% at tolerance=0, 20% at tolerance=255
    const MIN_VALUE = Math.max(15, 35 - (tolerance / 255) * 20);        // 35% at tolerance=0, 15% at tolerance=255
    
    if (pixelHSV.s < MIN_SATURATION || pixelHSV.v < MIN_VALUE) {
      continue;  // Skip this pixel, keep it opaque
    }
    
    // Calculate HSV distance with weighted components
    // Hue is circular (0-360), so we need special handling
    const hueDiff = Math.min(
      Math.abs(pixelHSV.h - targetHSV.h),
      360 - Math.abs(pixelHSV.h - targetHSV.h)
    );
    const satDiff = Math.abs(pixelHSV.s - targetHSV.s);
    const valDiff = Math.abs(pixelHSV.v - targetHSV.v);
    
    // Normalize tolerance to HSV scale
    // For hue: scale more generously to account for AI model color variations
    // tolerance=30 -> ~42° hue tolerance (enough for typical AI color drift)
    // For saturation: AI models often generate desaturated colors, so apply 2x tolerance
    // For value: keep proportional scaling
    const hueTolerance = Math.min((tolerance / 255) * 360, 60); // Up to 60° at max tolerance
    const satTolerance = Math.min((tolerance / 255) * 200, 80); // 2x scaling for saturation, up to 80%
    const valTolerance = (tolerance / 255) * 100; // 0-100 scale
    
    // Check if pixel matches within tolerance
    if (hueDiff <= hueTolerance && satDiff <= satTolerance && valDiff <= valTolerance) {
      // Make pixel transparent
      pixels[i + 3] = 0;
    }
  }
  
  // Create new image from modified pixel data
  return sharp(Buffer.from(pixels), {
    raw: {
      width,
      height,
      channels,
    },
  });
}

/**
 * Apply resize with specified mode.
 */
function applyResize(
  image: sharp.Sharp,
  width: number,
  height: number,
  mode: ResizeMode,
  format: OutputFormat,
  hasTransparency: boolean
): sharp.Sharp {
  // Determine resize kernel based on output size
  // Use nearest-neighbor for small sprites (preserves pixel art)
  // Use lanczos3 for larger images (better quality)
  const kernel: keyof sharp.KernelEnum =
    width <= 64 && height <= 64 ? 'nearest' : 'lanczos3';

  switch (mode) {
    case 'crop':
      // Center crop to exact dimensions
      return image.resize(width, height, {
        kernel,
        fit: 'cover',
        position: 'center',
      });
      
    case 'stretch':
      // Distort to exact dimensions
      return image.resize(width, height, {
        kernel,
        fit: 'fill',
      });
      
    case 'letterbox':
      // Fit within dimensions with padding
      return image.resize(width, height, {
        kernel,
        fit: 'contain',
        background: format === 'png' 
          ? { r: 0, g: 0, b: 0, alpha: 0 }  // Transparent for PNG
          : { r: 0, g: 0, b: 0, alpha: 1 }, // Black for JPG
      });

    case 'contain':
      // Auto-trim transparent margins, then fit object to frame (transparent PNG only)
      // For non-transparent images, behaves like letterbox
      if (hasTransparency) {
        // Trim transparent edges to get bounding box of opaque content
        image = image.trim();
      }
      // Fit within dimensions with transparent/black padding
      return image.resize(width, height, {
        kernel,
        fit: 'contain',
        background: hasTransparency
          ? { r: 0, g: 0, b: 0, alpha: 0 }  // Transparent
          : { r: 0, g: 0, b: 0, alpha: 1 }, // Black
      });
      
    default:
      return image.resize(width, height, { kernel, fit: 'cover', position: 'center' });
  }
}

/**
 * Parse a hex color string to RGB values.
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  // Remove # if present
  const cleanHex = hex.replace(/^#/, '');
  
  // Handle 3-digit hex
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex;
  
  const num = parseInt(fullHex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert RGB to HSV color space.
 * @returns Object with h (0-360), s (0-100), v (0-100)
 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  // Calculate hue
  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      h = 60 * (((bNorm - rNorm) / delta) + 2);
    } else {
      h = 60 * (((rNorm - gNorm) / delta) + 4);
    }
  }
  if (h < 0) h += 360;
  
  // Calculate saturation
  const s = max === 0 ? 0 : (delta / max) * 100;
  
  // Calculate value
  const v = max * 100;
  
  return { h, s, v };
}

/**
 * Debug utility: save intermediate processing images.
 * @param buffer - Image buffer to save
 * @param path - Output path
 */
export async function saveDebugImage(buffer: Buffer, path: string): Promise<void> {
  await sharp(buffer).toFile(path);
}
