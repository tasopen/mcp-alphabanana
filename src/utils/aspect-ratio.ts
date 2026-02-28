/**
 * Aspect ratio calculation utilities for Gemini image generation.
 * Automatically selects the closest supported aspect ratio based on output dimensions.
 */

// Supported aspect ratios by Gemini API
export const SUPPORTED_ASPECT_RATIOS = {
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
} as const;

export type AspectRatioKey = keyof typeof SUPPORTED_ASPECT_RATIOS;

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
