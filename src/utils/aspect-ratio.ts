/**
 * Aspect ratio calculation utilities for Gemini image generation.
 * Automatically selects the closest supported aspect ratio based on output dimensions.
 */

// Supported aspect ratios by Gemini API
export const SUPPORTED_ASPECT_RATIO_KEYS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
  '1:4',
  '4:1',
  '1:8',
  '8:1',
] as const;

export type AspectRatioKey = typeof SUPPORTED_ASPECT_RATIO_KEYS[number];

export const SUPPORTED_ASPECT_RATIOS: Record<AspectRatioKey, number> = {
  '1:1': 1.0,
  '2:3': 2 / 3,       // 0.667 - Portrait cards
  '3:2': 3 / 2,       // 1.5 - Landscape scenes
  '3:4': 3 / 4,       // 0.75 - Character portraits
  '4:3': 4 / 3,       // 1.333 - UI panels
  '4:5': 4 / 5,       // 0.8 - Mobile UI
  '5:4': 5 / 4,       // 1.25 - Tile sets
  '9:16': 9 / 16,     // 0.5625 - Mobile backgrounds
  '16:9': 16 / 9,     // 1.778 - Game backgrounds
  '21:9': 21 / 9,     // 2.333 - Ultra-wide backgrounds
  // Nano Banana 2 extreme ratios
  '1:4': 1 / 4,       // 0.25 - Extremely tall
  '4:1': 4 / 1,       // 4.0 - Extremely wide
  '1:8': 1 / 8,       // 0.125 - Ultra tall
  '8:1': 8 / 1,       // 8.0 - Ultra wide
};

export const GEMINI_RESOLUTION_KEYS = ['0.5K', '1K', '2K', '4K'] as const;
export type GeminiResolutionKey = typeof GEMINI_RESOLUTION_KEYS[number];

export const GEMINI_NATIVE_SIZES: Record<AspectRatioKey, Record<GeminiResolutionKey, [number, number]>> = {
  '1:1':    { '0.5K': [512, 512],   '1K': [1024, 1024],   '2K': [2048, 2048],   '4K': [4096, 4096] },
  '1:4':    { '0.5K': [256, 1024],  '1K': [512, 2048],    '2K': [1024, 4096],   '4K': [2048, 8192] },
  '1:8':    { '0.5K': [192, 1536],  '1K': [384, 3072],    '2K': [768, 6144],    '4K': [1536, 12288] },
  '2:3':    { '0.5K': [424, 632],   '1K': [848, 1264],    '2K': [1696, 2528],   '4K': [3392, 5056] },
  '3:2':    { '0.5K': [632, 424],   '1K': [1264, 848],    '2K': [2528, 1696],   '4K': [5056, 3392] },
  '3:4':    { '0.5K': [448, 600],   '1K': [896, 1200],    '2K': [1792, 2400],   '4K': [3584, 4800] },
  '4:1':    { '0.5K': [1024, 256],  '1K': [2048, 512],    '2K': [4096, 1024],   '4K': [8192, 2048] },
  '4:3':    { '0.5K': [600, 448],   '1K': [1200, 896],    '2K': [2400, 1792],   '4K': [4800, 3584] },
  '4:5':    { '0.5K': [464, 576],   '1K': [928, 1152],    '2K': [1856, 2304],   '4K': [3712, 4608] },
  '5:4':    { '0.5K': [576, 464],   '1K': [1152, 928],    '2K': [2304, 1856],   '4K': [4608, 3712] },
  '8:1':    { '0.5K': [1536, 192],  '1K': [3072, 384],    '2K': [6144, 768],    '4K': [12288, 1536] },
  '9:16':   { '0.5K': [384, 688],   '1K': [768, 1376],    '2K': [1536, 2752],   '4K': [3072, 5504] },
  '16:9':   { '0.5K': [688, 384],   '1K': [1376, 768],    '2K': [2752, 1536],   '4K': [5504, 3072] },
  '21:9':   { '0.5K': [792, 168],   '1K': [1584, 672],    '2K': [3168, 1344],   '4K': [6336, 2688] },
};

/**
 * Select the closest supported aspect ratio based on output dimensions.
 * @param width - Output image width in pixels
 * @param height - Output image height in pixels
 * @returns The closest supported aspect ratio string (e.g., '16:9')
 */
export function selectAspectRatio(width: number, height: number): AspectRatioKey {
  const targetRatio = width / height;

  let closestRatio: AspectRatioKey = '1:1';
  let minDifference = Infinity;

  for (const [ratioKey, ratioValue] of Object.entries(SUPPORTED_ASPECT_RATIOS)) {
    const difference = Math.abs(targetRatio - ratioValue);
    if (difference < minDifference) {
      minDifference = difference;
      closestRatio = ratioKey as AspectRatioKey;
    }
  }

  return closestRatio;
}

/**
 * Get the numeric value of an aspect ratio.
 * @param ratio - Aspect ratio key (e.g., '16:9')
 * @returns The numeric ratio value
 */
export function getAspectRatioValue(ratio: AspectRatioKey): number {
  return SUPPORTED_ASPECT_RATIOS[ratio];
}

/**
 * Get the native Gemini pixel size for a supported aspect ratio and generation resolution.
 */
export function getGeminiNativeSize(aspectRatio: AspectRatioKey, resolution: GeminiResolutionKey): { width: number; height: number } {
  const [width, height] = GEMINI_NATIVE_SIZES[aspectRatio][resolution];
  return { width, height };
}
