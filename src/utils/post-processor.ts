/**
 * Post-processing utilities for image resize and transparency.
 * Uses Sharp for image manipulation.
 *
 * Transparency pipeline:
 *   1. Select background color by histogram hue proximity to the requested key color
 *   2. RGB-distance color-key removal
 *   3. Despill — remove key-color contamination from boundary pixels
 *   4. Alpha edge refinement — size/mode adaptive
 *   5. Resize
 */

import sharp from 'sharp';

export type ResizeMode = 'crop' | 'stretch' | 'letterbox' | 'contain';
export type OutputFormat = 'png' | 'jpg' | 'webp';

export interface PostProcessOptions {
  width: number;
  height: number;
  format: OutputFormat;
  resizeMode: ResizeMode;
  transparentColor: string | null;  // Hex color (defaults to #FF00FF when enabled)
  colorTolerance: number;           // 0-255
  hasTransparency?: boolean;        // Whether image has transparency applied
  fringeMode?: FringeMode;          // auto | crisp | hd
}

/** Info returned alongside the processed buffer when debug details are needed. */
export interface PostProcessDebugInfo {
  selectedColor?: string;  // Hex of chosen background color
  selectionMethod?: 'histogram' | 'corner';
  requestedColor?: string; // Hex requested for transparency keying
  cornerColors?: string[]; // Hex values from the 4 corners (TL, TR, BL, BR)
}

export type FringeMode = 'auto' | 'crisp' | 'hd';

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
  let debugInfo: PostProcessDebugInfo = {};

  // Step 1: Apply transparency (before resize to prevent bleeding)
  if (options.transparentColor && (options.format === 'png' || options.format === 'webp')) {
    const requestedColor = normalizeTransparentColor(options.transparentColor);
    const selection = await selectTransparentColor(
      sharp(inputBuffer),
      requestedColor,
      options.colorTolerance,
    );
    debugInfo.selectedColor = rgbToHex(selection.color.r, selection.color.g, selection.color.b);
    debugInfo.selectionMethod = selection.method;
    debugInfo.requestedColor = requestedColor;
    debugInfo.cornerColors = selection.cornerColors.map((corner) => rgbToHex(corner.r, corner.g, corner.b));

    image = await applyTransparency(
      image,
      debugInfo.selectedColor,
      options.colorTolerance,
      options.width,
      options.height,
      options.fringeMode,
    );
  }

  // Step 2: Resize based on mode
  const hasTransparency = options.hasTransparency ?? (options.transparentColor !== null && (options.format === 'png' || options.format === 'webp'));
  image = applyResize(image, options.width, options.height, options.resizeMode, options.format, hasTransparency);

  // Step 3: Output format
  if (options.format === 'png') {
    return image.png().toBuffer();
  } else if (options.format === 'webp') {
    return image.webp({ quality: 90 }).toBuffer();
  } else {
    return image.jpeg({ quality: 90 }).toBuffer();
  }
}

/**
 * Wrapper that also returns debug info (detected color etc.).
 */
export async function postProcessWithDebug(
  inputBuffer: Buffer,
  options: PostProcessOptions
): Promise<{ buffer: Buffer; debugInfo: PostProcessDebugInfo }> {
  let image = sharp(inputBuffer);
  let debugInfo: PostProcessDebugInfo = {};

  if (options.transparentColor && (options.format === 'png' || options.format === 'webp')) {
    const requestedColor = normalizeTransparentColor(options.transparentColor);
    const selection = await selectTransparentColor(
      sharp(inputBuffer),
      requestedColor,
      options.colorTolerance,
    );
    debugInfo.selectedColor = rgbToHex(selection.color.r, selection.color.g, selection.color.b);
    debugInfo.selectionMethod = selection.method;
    debugInfo.requestedColor = requestedColor;
    debugInfo.cornerColors = selection.cornerColors.map((corner) => rgbToHex(corner.r, corner.g, corner.b));

    image = await applyTransparency(
      image,
      debugInfo.selectedColor,
      options.colorTolerance,
      options.width,
      options.height,
      options.fringeMode,
    );
  }

  const hasTransparency = options.hasTransparency ?? (options.transparentColor !== null && (options.format === 'png' || options.format === 'webp'));
  image = applyResize(image, options.width, options.height, options.resizeMode, options.format, hasTransparency);

  let buffer: Buffer;
  if (options.format === 'png') {
    buffer = await image.png().toBuffer();
  } else if (options.format === 'webp') {
    buffer = await image.webp({ quality: 90 }).toBuffer();
  } else {
    buffer = await image.jpeg({ quality: 90 }).toBuffer();
  }

  return { buffer, debugInfo };
}

/**
 * Select the chroma-key color by histogram analysis and hue proximity.
 * Falls back to corner sampling when the histogram cannot find a suitable color.
 */
async function selectTransparentColor(
  image: sharp.Sharp,
  requestedHex: string,
  tolerance: number,
): Promise<{ color: { r: number; g: number; b: number }; method: 'histogram' | 'corner'; cornerColors: { r: number; g: number; b: number }[] }> {
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  const { width, height, channels } = info;
  const totalPixels = width * height;

  const requested = parseHexColor(requestedHex);
  const targetHue = rgbToHsv(requested.r, requested.g, requested.b).h;
  const hueTolerance = (tolerance / 255) * 120;
  const minArea = totalPixels * 0.05;

  const cornerColors = getCornerColors(pixels, width, height, channels);

  const histogramColor = pickHistogramColor(pixels, channels, targetHue, hueTolerance, minArea);
  if (histogramColor) {
    return { color: histogramColor, method: 'histogram', cornerColors };
  }

  const cornerColor = pickCornerColor(cornerColors, targetHue);
  return { color: cornerColor, method: 'corner', cornerColors };
}

function pickHistogramColor(
  pixels: Uint8Array,
  channels: number,
  targetHue: number,
  hueTolerance: number,
  minArea: number,
): { r: number; g: number; b: number } | null {
  const binCounts = new Uint32Array(4096);

  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const idx = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    binCounts[idx] += 1;
  }

  let bestIndex = -1;
  let bestDistance = Infinity;
  let bestCount = 0;

  for (let idx = 0; idx < binCounts.length; idx++) {
    const count = binCounts[idx];
    if (count < minArea) continue;

    const r = ((idx >> 8) & 0x0f) * 16 + 8;
    const g = ((idx >> 4) & 0x0f) * 16 + 8;
    const b = (idx & 0x0f) * 16 + 8;
    const hue = rgbToHsv(r, g, b).h;
    const distance = hueDistance(hue, targetHue);

    if (distance > hueTolerance) continue;

    if (distance < bestDistance || (distance === bestDistance && count > bestCount)) {
      bestIndex = idx;
      bestDistance = distance;
      bestCount = count;
    }
  }

  if (bestIndex < 0) return null;

  return {
    r: ((bestIndex >> 8) & 0x0f) * 16 + 8,
    g: ((bestIndex >> 4) & 0x0f) * 16 + 8,
    b: (bestIndex & 0x0f) * 16 + 8,
  };
}

function getCornerColors(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: number,
): { r: number; g: number; b: number }[] {
  const cornerOffsets = [
    0,
    (width - 1) * channels,
    (height - 1) * width * channels,
    ((height - 1) * width + (width - 1)) * channels,
  ];

  return cornerOffsets.map((offset) => ({
    r: pixels[offset],
    g: pixels[offset + 1],
    b: pixels[offset + 2],
  }));
}

function pickCornerColor(
  cornerColors: { r: number; g: number; b: number }[],
  targetHue: number,
): { r: number; g: number; b: number } {
  let best = cornerColors[0];
  let bestDistance = Infinity;

  for (const corner of cornerColors) {
    const hue = rgbToHsv(corner.r, corner.g, corner.b).h;
    const distance = hueDistance(hue, targetHue);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = corner;
    }
  }

  return best;
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 360 - diff);
}

function normalizeTransparentColor(color: string | null): string {
  if (!color || color === 'auto') return '#FF00FF';
  return color;
}

/**
 * Apply color-key transparency with despill and alpha edge refinement.
 *
 * Pipeline (single-pass pixel loop + sharp edge ops + post-passes):
 *   1. HSV-based color matching → alpha = 0 for background pixels
 *   2. Despill → remove key-colour contamination from near-boundary foreground pixels
 *   3. Alpha edge refinement → erode(1) + blur(0.5) for soft anti-aliased edges
 *   4. Boundary pixel forced despill → aggressive despill on pixels adjacent to transparent
 *   5. Alpha-weighted despill → semi-transparent pixels get proportional colour correction
 *
 * @param image - Sharp image instance
 * @param hexColor - Hex color to make transparent
 * @param tolerance - Color matching tolerance (0-255)
 * @param outputWidth - Target output width for size-adaptive processing
 * @param outputHeight - Target output height for size-adaptive processing
 * @returns New Sharp instance with transparency applied
 */
async function applyTransparency(
  image: sharp.Sharp,
  hexColor: string,
  tolerance: number,
  outputWidth: number,
  outputHeight: number,
  fringeMode: FringeMode = 'auto',
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

  // ── RGB Euclidean distance thresholds ──
  // Primary colour matching uses simple RGB distance, which is far more robust
  // than HSV for desaturated / muted backgrounds that Gemini often produces.
  // tolerance 30 → rgbThreshold ≈ 52   (transparent)
  //                rgbDespill   ≈ 94   (despill zone)
  const rgbThreshold = tolerance * Math.SQRT2;     // transparent if within this
  const rgbDespillThreshold = rgbThreshold * 1.8;  // despill if within this

  // Determine which despill formula to use based on key colour hue.
  // Magenta ≈ 300°, Green ≈ 120°, Blue ≈ 240°
  const keyHue = targetHSV.h;
  type DespillKind = 'magenta' | 'green' | 'blue' | 'generic';
  let despillKind: DespillKind = 'generic';
  if (keyHue >= 270 || keyHue <= 30) despillKind = 'magenta';   // 270-360 or 0-30
  else if (keyHue >= 90 && keyHue <= 150) despillKind = 'green';
  else if (keyHue >= 210 && keyHue <= 270) despillKind = 'blue';

  // Process each pixel
  for (let i = 0; i < pixels.length; i += channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    // RGB Euclidean distance from target background colour
    const dr = r - targetR;
    const dg = g - targetG;
    const db = b - targetB;
    const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db);

    // Check if pixel matches within tolerance → make transparent
    if (rgbDist <= rgbThreshold) {
      pixels[i + 3] = 0;
    }
    // Despill: pixel is NOT transparent but close to key colour → remove spill
    else if (rgbDist <= rgbDespillThreshold) {
      // Calculate spill strength (1.0 at key boundary, 0.0 at despill boundary)
      const spillStrength = Math.max(0, 1 - (rgbDist - rgbThreshold) / (rgbDespillThreshold - rgbThreshold));

      let nr = r, ng = g, nb = b;
      switch (despillKind) {
        case 'magenta':
          // Magenta = R + B; clamp R and B towards G
          nr = Math.round(r - spillStrength * Math.max(0, r - g));
          nb = Math.round(b - spillStrength * Math.max(0, b - g));
          break;
        case 'green':
          // Green spill: clamp G towards max(R, B), and push R/B down
          // if they were lifted by the low-saturation green background bleeding in
          ng = Math.round(g - spillStrength * Math.max(0, g - Math.max(r, b)));
          // Additional: if pixel looks like desaturated green (G > R && G > B),
          // also darken R and B proportionally to remove the green-grey tint
          if (g > r && g > b) {
            const greenExcess = g - Math.max(r, b);
            if (greenExcess > 10) {
              const correction = spillStrength * greenExcess * 0.3;
              nr = Math.max(0, Math.round(r - correction));
              nb = Math.max(0, Math.round(b - correction));
            }
          }
          break;
        case 'blue':
          // Blue spill: clamp B towards max(R, G)
          nb = Math.round(b - spillStrength * Math.max(0, b - Math.max(r, g)));
          break;
        default:
          // Generic fallback: reduce saturation toward grey
          {
            const grey = Math.round((r + g + b) / 3);
            nr = Math.round(r + spillStrength * (grey - r) * 0.5);
            ng = Math.round(g + spillStrength * (grey - g) * 0.5);
            nb = Math.round(b + spillStrength * (grey - b) * 0.5);
          }
          break;
      }
      pixels[i] = Math.max(0, Math.min(255, nr));
      pixels[i + 1] = Math.max(0, Math.min(255, ng));
      pixels[i + 2] = Math.max(0, Math.min(255, nb));
    }
  }

  // ── HD boundary clear: force-clear a 1px boundary around transparency ──
  const resolvedMode = resolveFringeMode(fringeMode, outputWidth, outputHeight);
  const forceEdgeClear = resolvedMode === 'hd';
  if (forceEdgeClear) {
    const rgbaPixels = pixels;
    const alphaIndex = 3;
    // Snapshot alpha to avoid cascade clearing
    const alphaSnapshot = new Uint8Array(rgbaPixels.length / 4);
    for (let i = 0, a = 0; i < rgbaPixels.length; i += 4, a += 1) {
      alphaSnapshot[a] = rgbaPixels[i + alphaIndex];
    }

    const hasTransparentNeighbor = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (alphaSnapshot[nIdx] === 0) return true;
        }
      }
      return false;
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const alpha = rgbaPixels[idx + alphaIndex];
        if (alpha === 0) continue;
        if (!hasTransparentNeighbor(x, y)) continue;

        rgbaPixels[idx + alphaIndex] = 0;
      }
    }
  }

  // Create image from colour-keyed + despilled pixel data
  const keyed = sharp(Buffer.from(pixels), {
    raw: { width, height, channels },
  });

  // ── Alpha refinement ──
  // Keep binary alpha; HD uses boundary clear above instead of erode/blur.
  const refinedAlpha = await sharp(Buffer.from(pixels), { raw: { width, height, channels } })
    .extractChannel(3)
    .raw()
    .toBuffer();

  const rgb = await keyed
    .removeAlpha()
    .raw()
    .toBuffer();

  // Manually create RGBA buffer by interleaving RGB and alpha
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3];         // R
    rgba[i * 4 + 1] = rgb[i * 3 + 1]; // G
    rgba[i * 4 + 2] = rgb[i * 3 + 2]; // B
    rgba[i * 4 + 3] = refinedAlpha[i]; // A
  }

  // ── Post-pass A: Boundary pixel forced despill (8-neighbour + median) ──
  // Small sprites: light despill, no median blend (preserve crisp edges)
  // Large images: aggressive despill with median smoothing
  const rgbaPixels = new Uint8Array(rgba);
  const isCrisp = resolvedMode === 'crisp';
  const isHd = resolvedMode === 'hd';
  const forceBase = isCrisp ? 0.4 : (isHd ? 1.1 : 1.0);
  const medianBlend = isCrisp ? 0.0 : (isHd ? 0.2 : 0.15); // 0 = no blend for crisp sprites
  // Large-image alpha-weighted despill parameters (stronger than before)
  const alphaCoef = isCrisp ? 0.0 : (isHd ? 1.4 : 1.2);  // skip for crisp (no semi-transparent pixels)
  const alphaPower = isHd ? 2.0 : 1.8;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = rgbaPixels[idx + 3];
      if (alpha === 0) continue; // skip transparent

      // 8-connected neighbors including diagonals
      let hasTransparentNeighbour = false;
      const neighbours = [
        [x - 1, y - 1], [x, y - 1], [x + 1, y - 1],
        [x - 1, y], [x + 1, y],
        [x - 1, y + 1], [x, y + 1], [x + 1, y + 1],
      ];

      for (const [nx, ny] of neighbours) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = (ny * width + nx) * 4;
          if (rgbaPixels[nIdx + 3] === 0) {
            hasTransparentNeighbour = true;
            break;
          }
        }
      }

      if (hasTransparentNeighbour) {
        // Collect local 3x3 neighbourhood for median smoothing guidance
        const rr: number[] = [];
        const gg: number[] = [];
        const bb: number[] = [];
        for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx++) {
            const nIdx = (yy * width + xx) * 4;
            rr.push(rgbaPixels[nIdx]);
            gg.push(rgbaPixels[nIdx + 1]);
            bb.push(rgbaPixels[nIdx + 2]);
          }
        }
        const median = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)];
        const medR = median(rr), medG = median(gg), medB = median(bb);

        const r = rgbaPixels[idx], g = rgbaPixels[idx + 1], b = rgbaPixels[idx + 2];
        const forceStrength = forceBase;
        const keepRatio = 1 - medianBlend;

        switch (despillKind) {
          case 'magenta':
            // Clamp R and B towards local green median to remove magenta spill
            rgbaPixels[idx] = Math.max(0, Math.min(255, Math.round(r - forceStrength * Math.max(0, r - medG))));
            rgbaPixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b - forceStrength * Math.max(0, b - medG))));
            // Conditional median blend (large images only)
            if (medianBlend > 0) {
              rgbaPixels[idx] = Math.round(rgbaPixels[idx] * keepRatio + medR * medianBlend);
              rgbaPixels[idx + 1] = Math.round(rgbaPixels[idx + 1] * keepRatio + medG * medianBlend);
              rgbaPixels[idx + 2] = Math.round(rgbaPixels[idx + 2] * keepRatio + medB * medianBlend);
            }
            break;

          case 'green': {
            // Aggressively remove green spill from boundary pixels.
            // Clamp G towards the non-green channel baseline.
            const gBase = Math.max(r, b);
            const gExcess = Math.max(0, g - gBase);
            rgbaPixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g - forceStrength * gExcess)));
            // Also reduce R/B if they were lifted by the desaturated green (grey-green tint)
            if (gExcess > 8) {
              const greyCorrection = forceStrength * gExcess * 0.35;
              rgbaPixels[idx] = Math.max(0, Math.min(255, Math.round(r - greyCorrection)));
              rgbaPixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b - greyCorrection)));
            }
            if (medianBlend > 0) {
              rgbaPixels[idx] = Math.round(rgbaPixels[idx] * keepRatio + medR * medianBlend);
              rgbaPixels[idx + 1] = Math.round(rgbaPixels[idx + 1] * keepRatio + medG * medianBlend);
              rgbaPixels[idx + 2] = Math.round(rgbaPixels[idx + 2] * keepRatio + medB * medianBlend);
            }
            break;
          }

          case 'blue':
            rgbaPixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b - forceStrength * Math.max(0, b - Math.max(medR, medG)))));
            if (medianBlend > 0) {
              rgbaPixels[idx] = Math.round(rgbaPixels[idx] * keepRatio + medR * medianBlend);
              rgbaPixels[idx + 1] = Math.round(rgbaPixels[idx + 1] * keepRatio + medG * medianBlend);
              rgbaPixels[idx + 2] = Math.round(rgbaPixels[idx + 2] * keepRatio + medB * medianBlend);
            }
            break;

          default: {
            // Generic: move color toward local median by a factor
            rgbaPixels[idx] = Math.max(0, Math.min(255, Math.round(r + forceStrength * (medR - r) * 0.6)));
            rgbaPixels[idx + 1] = Math.max(0, Math.min(255, Math.round(g + forceStrength * (medG - g) * 0.6)));
            rgbaPixels[idx + 2] = Math.max(0, Math.min(255, Math.round(b + forceStrength * (medB - b) * 0.6)));
            break;
          }
        }
      }
    }
  }

  // ── Post-pass B: Non-linear alpha-weighted despill for semi-transparent pixels ──
  for (let i = 0; i < rgbaPixels.length; i += 4) {
    const alpha = rgbaPixels[i + 3];
    if (alpha === 0 || alpha === 255) continue; // only semi-transparent

    // non-linear strength (more aggressive for near-transparent pixels)
    const t = 1 - alpha / 255;
    const spillStrength = Math.pow(t, alphaPower) * alphaCoef;

    const r = rgbaPixels[i], g = rgbaPixels[i + 1], b = rgbaPixels[i + 2];
    switch (despillKind) {
      case 'magenta':
        rgbaPixels[i] = Math.max(0, Math.min(255, Math.round(r - spillStrength * Math.max(0, r - g))));
        rgbaPixels[i + 2] = Math.max(0, Math.min(255, Math.round(b - spillStrength * Math.max(0, b - g))));
        break;
      case 'green': {
        const gBase2 = Math.max(r, b);
        const gExcess2 = Math.max(0, g - gBase2);
        rgbaPixels[i + 1] = Math.max(0, Math.min(255, Math.round(g - spillStrength * gExcess2)));
        if (gExcess2 > 8) {
          const gc2 = spillStrength * gExcess2 * 0.35;
          rgbaPixels[i] = Math.max(0, Math.min(255, Math.round(r - gc2)));
          rgbaPixels[i + 2] = Math.max(0, Math.min(255, Math.round(b - gc2)));
        }
        break;
      }
      case 'blue':
        rgbaPixels[i + 2] = Math.max(0, Math.min(255, Math.round(b - spillStrength * Math.max(0, b - Math.max(r, g)))));
        break;
      default: {
        const grey = Math.round((r + g + b) / 3);
        rgbaPixels[i] = Math.max(0, Math.min(255, Math.round(r + spillStrength * (grey - r) * 0.6)));
        rgbaPixels[i + 1] = Math.max(0, Math.min(255, Math.round(g + spillStrength * (grey - g) * 0.6)));
        rgbaPixels[i + 2] = Math.max(0, Math.min(255, Math.round(b + spillStrength * (grey - b) * 0.6)));
        break;
      }
    }
  }

  // ── Post-pass C: Isolated pixel cleanup ──
  // Remove small opaque clusters (≤2 px) surrounded mostly by transparent pixels.
  // This cleans up scattered background remnant speckles that survived the
  // main colour-key pass due to per-pixel RGB noise in the Gemini output.
  // We use a wider RGB threshold (2.5× base) so borderline bg pixels are caught.
  const cleanupThreshold = rgbThreshold * (isHd ? 3.0 : 2.0);
  // Work on a snapshot so we don't cascade changes within the same pass
  const snapshot = new Uint8Array(rgbaPixels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = snapshot[idx + 3];
      if (alpha === 0) continue; // already transparent

      // Count transparent vs opaque in 8-connected neighbourhood
      let transCount = 0;
      let opaqueCount = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            transCount++; // treat out-of-bounds as transparent
            continue;
          }
          const nIdx = (ny * width + nx) * 4;
          if (snapshot[nIdx + 3] === 0) transCount++;
          else opaqueCount++;
        }
      }

      // If mostly surrounded by transparent (at least 6 of 8 neighbours)
      if (transCount >= 6) {
        // Check if this pixel's colour is within extended threshold of key
        const pr = snapshot[idx], pg = snapshot[idx + 1], pb = snapshot[idx + 2];
        const cdr = pr - targetR, cdg = pg - targetG, cdb = pb - targetB;
        const cDist = Math.sqrt(cdr * cdr + cdg * cdg + cdb * cdb);
        if (cDist <= cleanupThreshold) {
          rgbaPixels[idx + 3] = 0;
        }
      }
    }
  }

  return sharp(Buffer.from(rgbaPixels), { raw: { width, height, channels: 4 } });
}

function resolveFringeMode(mode: FringeMode, width: number, height: number): 'crisp' | 'hd' {
  if (mode === 'crisp' || mode === 'hd') return mode;
  const longerSide = Math.max(width, height);
  return longerSide > 128 ? 'hd' : 'crisp';
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
        background: (format === 'png' || format === 'webp')
          ? { r: 0, g: 0, b: 0, alpha: 0 }  // Transparent for PNG/WebP
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
 * Convert RGB values to a hex color string.
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

/**
 * Debug utility: save intermediate processing images.
 * @param buffer - Image buffer to save
 * @param path - Output path
 */
export async function saveDebugImage(buffer: Buffer, path: string): Promise<void> {
  await sharp(buffer).toFile(path);
}
