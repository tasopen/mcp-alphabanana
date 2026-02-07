/**
 * Gemini API wrapper for image generation.
 * Supports multiple model tiers and reference images.
 */

import { GoogleGenAI, type Part } from '@google/genai';
import type { AspectRatioKey } from './aspect-ratio.js';

// Model configuration
const MODELS = {
  pro: 'gemini-3-pro-image-preview',
  flash: 'gemini-2.5-flash-image',
} as const;

// Source resolution mapping (pixels)
const SOURCE_RESOLUTIONS = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
} as const;

export type ModelTier = 'flash' | 'pro';
export type SourceResolution = '1K' | '2K' | '4K';

export interface ReferenceImage {
  description?: string;
  data: string;  // Base64-encoded image data
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface GenerateWithGeminiOptions {
  prompt: string;
  modelTier: ModelTier;
  sourceResolution: SourceResolution;
  aspectRatio: AspectRatioKey;
  transparent: boolean;
  transparentColor: string | null;
  referenceImages: ReferenceImage[];
}

/**
 * Generate an image using Gemini API.
 * @param options - Generation options
 * @returns Raw image buffer from Gemini
 */
export async function generateWithGemini(options: GenerateWithGeminiOptions): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenAI({ apiKey });
  const model = MODELS[options.modelTier];
  
  // Build the prompt with transparency instructions
  let enhancedPrompt = options.prompt;
  
  if (options.transparent) {
    const bgColor = (!options.transparentColor || options.transparentColor === 'auto')
      ? '#FF00FF'
      : options.transparentColor;
    const colorDesc = getColorDescription(bgColor);
    const avoidedColors = getAvoidedColors(bgColor);
    
    // Use chroma key terminology for better color accuracy.
    // Note: even if the model doesn't produce the exact colour, the post-processor
    // auto-detects the actual background colour and applies despill to clean edges.
    enhancedPrompt = `Subject: ${enhancedPrompt}

CRITICAL BACKGROUND REQUIREMENT:
The background MUST be a solid, uniform chroma key screen in ${bgColor} (${colorDesc}).
This is a technical requirement for image compositing.
- Fill the ENTIRE background with a single flat solid colour as close to ${bgColor} as possible
- The background must be completely uniform — NO gradients, NO patterns, NO variation
- Subject must have sharp, clean edges against the background
- NO feathering or colour blending between subject and background
- Think of this as a green screen / blue screen studio setup

SUBJECT COLOR RESTRICTION:
The subject itself must NOT contain any ${avoidedColors} tones.
These colors are too close to the chroma key background and will be damaged during compositing.
If the subject naturally has such colors, shift them to a clearly different hue.

The background uniformity is critical for post-processing.`;
  }

  // Build content parts
  const parts: Part[] = [];

  // Add reference images first (if any)
  for (const ref of options.referenceImages) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.data,
      },
    });
    // Add description if provided
    if (ref.description) {
      parts.push({
        text: `[Reference image: ${ref.description}]`,
      });
    }
  }

  // Add the main prompt
  parts.push({
    text: enhancedPrompt,
  });

  // Configure generation parameters with image_config for aspect ratio and resolution
  // See: https://ai.google.dev/gemini-api/docs/image-generation#aspect-ratios-and-image-size
  // Use snake_case keys to match server expectations from docs examples
  const generationConfig: Record<string, unknown> = {
    response_modalities: ['IMAGE', 'TEXT'],
    image_config: {
      aspect_ratio: options.aspectRatio,
      // Ensure an explicit image_size for all models (use 1K for flash by default)
      image_size: options.modelTier === 'flash' ? '1K' : options.sourceResolution,
    },
  };

  // For pro tier, allow a larger image_size and thinking budget
  if (options.modelTier === 'pro') {
    (generationConfig as any).image_config = {
      aspect_ratio: options.aspectRatio,
      image_size: options.sourceResolution,
    };
    (generationConfig as any).thinking_config = {
      thinking_budget: 1024,
    };
  }

  // Generate content
  let response;
  try {
    response = await genAI.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: generationConfig,
    });
  } catch (err) {
    // Attach request details to the error for easier debugging
    const details = {
      model,
      generationConfig,
      parts: parts.map(p => {
        if ((p as any).inlineData) return { type: 'inlineData', mimeType: (p as any).inlineData.mimeType };
        if ((p as any).text) return { type: 'text', textPreview: (p as any).text?.slice(0, 120) };
        return { type: 'unknown' };
      }),
    };
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Gemini API call failed: ${msg} | request=${JSON.stringify(details)}`);
  }

  // Extract image from response
  const candidates = response.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidates in response. Try refining the prompt.');
  }

  const content = candidates[0].content;
  if (!content || !content.parts) {
    throw new Error('No content parts in response. Try refining the prompt.');
  }

  // Find the image part
  for (const part of content.parts) {
    if (part.inlineData && part.inlineData.data) {
      const base64Data = part.inlineData.data;
      return Buffer.from(base64Data, 'base64');
    }
  }

  throw new Error('No image in response. Try refining the prompt.');
}

/**
 * Get human-readable color description with RGB values for prompt enhancement.
 */
function parseHex(hexColor: string): { r: number; g: number; b: number } {
  const cleanHex = hexColor.replace(/^#/, '');
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex;
  const num = parseInt(fullHex, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function getColorDescription(hexColor: string): string {
  const normalized = hexColor.toUpperCase();
  const colorNames: Record<string, string> = {
    '#FF00FF': 'pure magenta',
    '#00FF00': 'bright green',
    '#0000FF': 'blue',
    '#00FFFF': 'cyan',
    '#FFFF00': 'yellow',
  };
  const { r, g, b } = parseHex(hexColor);
  const colorName = colorNames[normalized] || 'specified color';
  return `${colorName}, exact RGB(${r}, ${g}, ${b})`;
}

/**
 * Return a list of color families that the subject should avoid,
 * based on the chroma-key background colour.  This prevents Gemini from
 * painting subject pixels in hues that are close to the key colour and
 * would therefore be damaged by the despill / transparency pass.
 */
function getAvoidedColors(hexColor: string): string {
  const { r, g, b } = parseHex(hexColor);

  // Simple hue classification based on dominant channels
  // Magenta family (high R + high B, low G)
  if (r > 160 && b > 160 && g < 100) {
    return 'pink, magenta, fuchsia, purple, violet, or lavender';
  }
  // Green family (high G, low R + B)
  if (g > 160 && r < 100 && b < 100) {
    return 'green, lime, chartreuse, mint, or teal';
  }
  // Blue family (high B, low R + G)
  if (b > 160 && r < 100 && g < 100) {
    return 'blue, indigo, navy, cobalt, or periwinkle';
  }
  // Cyan family (high G + B, low R)
  if (g > 160 && b > 160 && r < 100) {
    return 'cyan, turquoise, aqua, teal, or mint';
  }
  // Yellow family (high R + G, low B)
  if (r > 160 && g > 160 && b < 100) {
    return 'yellow, gold, amber, or lime-yellow';
  }
  // Fallback: generic warning
  return 'colors similar to the background';
}
