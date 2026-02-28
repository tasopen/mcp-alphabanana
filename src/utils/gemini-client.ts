/**
 * Select the best Gemini sourceResolution ('0.5K', '1K', '2K', '4K') from width/height.
 * Reference: https://ai.google.dev/gemini-api/docs/image-generation#3.1-flash-image-preview
 * Fallback: '1K' if no match.
 */
/**
 * Select the best Gemini sourceResolution ('0.5K', '1K', '2K', '4K') from width/height and aspect ratio.
 * Uses the official Gemini table for all supported aspect ratios and resolutions.
 * Fallback: '1K' if no close match.
 */
export function selectSourceResolutionSmart(width: number, height: number, aspectRatio: AspectRatioKey): SourceResolution {
  // Gemini official table: [aspectRatio][resolution] = [w, h]
  const table: Record<AspectRatioKey, Record<SourceResolution, [number, number]>> = {
    '1:1':    { '0.5K': [512,512],   '1K': [1024,1024],   '2K': [2048,2048],   '4K': [4096,4096] },
    '1:4':    { '0.5K': [256,1024],  '1K': [512,2048],    '2K': [1024,4096],  '4K': [2048,8192] },
    '1:8':    { '0.5K': [192,1536],  '1K': [384,3072],    '2K': [768,6144],   '4K': [1536,12288] },
    '2:3':    { '0.5K': [424,632],   '1K': [848,1264],    '2K': [1696,2528],  '4K': [3392,5056] },
    '3:2':    { '0.5K': [632,424],   '1K': [1264,848],    '2K': [2528,1696],  '4K': [5056,3392] },
    '3:4':    { '0.5K': [448,600],   '1K': [896,1200],    '2K': [1792,2400],  '4K': [3584,4800] },
    '4:1':    { '0.5K': [1024,256],  '1K': [2048,512],    '2K': [4096,1024],  '4K': [8192,2048] },
    '4:3':    { '0.5K': [600,448],   '1K': [1200,896],    '2K': [2400,1792],  '4K': [4800,3584] },
    '4:5':    { '0.5K': [464,576],   '1K': [928,1152],    '2K': [1856,2304],  '4K': [3712,4608] },
    '5:4':    { '0.5K': [576,464],   '1K': [1152,928],    '2K': [2304,1856],  '4K': [4608,3712] },
    '8:1':    { '0.5K': [1536,192],  '1K': [3072,384],    '2K': [6144,768],   '4K': [12288,1536] },
    '9:16':   { '0.5K': [384,688],   '1K': [768,1376],    '2K': [1536,2752],  '4K': [3072,5504] },
    '16:9':   { '0.5K': [688,384],   '1K': [1376,768],    '2K': [2752,1536],  '4K': [5504,3072] },
    '21:9':   { '0.5K': [792,168],   '1K': [1584,672],    '2K': [3168,1344],  '4K': [6336,2688] },
  };

  // If both sides are less than or equal to 0.5K, return 0.5K
  const min0_5K = table[aspectRatio]?.['0.5K'];
  if (min0_5K && width <= min0_5K[0] && height <= min0_5K[1]) {
    return '0.5K';
  }

  // If either side exceeds the maximum value (4K), return 4K
  const max4K = table[aspectRatio]?.['4K'];
  if (max4K && (width > max4K[0] || height > max4K[1])) {
    return '4K';
  }

  // To avoid upscaling: select the smallest resolution where both sides are greater than or equal to the ideal value
  for (const res of ['0.5K','1K','2K','4K'] as const) {
    const ideal = table[aspectRatio]?.[res];
    if (!ideal) continue;
    if (width <= ideal[0] && height <= ideal[1]) {
      return res;
    }
  }

  // Theoretically unreachable: if none of the above conditions are met
  throw new Error('selectSourceResolutionSmart: No valid resolution found for the given size and aspect ratio.');
}
/**
 * Gemini API wrapper for image generation.
 * Supports multiple model tiers and reference images.
 */

import { GoogleGenAI, type Part } from '@google/genai';
import type { AspectRatioKey } from './aspect-ratio.js';

// Model configuration
const MODELS = {
  'Flash3.1': 'gemini-3.1-flash-image-preview',
  'Flash2.5': 'gemini-2.5-flash-image',
  'Pro3': 'gemini-3-pro-image-preview',
  // Aliases for backward compatibility
  flash: 'gemini-3.1-flash-image-preview',
  pro: 'gemini-3-pro-image-preview',
} as const;

// Source resolution mapping (API supported values: '512', '1K', '2K', '4K')
// '512' provides smaller assets suitable for icons, while '1K' is the quality default.
const SOURCE_RESOLUTIONS: Record<SourceResolution, string> = {
  '0.5K': '512',
  '1K': '1K',
  '2K': '2K',
  '4K': '4K',
} as const;

export type ModelTier = 'Flash3.1' | 'Flash2.5' | 'Pro3' | 'flash' | 'pro';
export type SourceResolution = '0.5K' | '1K' | '2K' | '4K';
export type GroundingType = 'none' | 'text' | 'image' | 'both';
export type ThinkingMode = 'minimal' | 'high';

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
  groundingType?: GroundingType;
  thinkingMode?: ThinkingMode;
  includeThoughts?: boolean;
}

/**
 * Helper to truncate base64 strings for logging.
 * Returns first 12 chars ... last 12 chars.
 */
function truncateBase64(data: string): string {
  if (data.length <= 30) return data;
  return `${data.slice(0, 12)}...${data.slice(-12)} (total: ${data.length} chars)`;
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

  // Infuse aspect ratio hint into instructions to ensure the model honors it (especially for 512px)
  const ratioHint = options.aspectRatio === '1:1' ? 'square 1:1 format' : `${options.aspectRatio} aspect ratio`;
  const finalPrompt = `${enhancedPrompt}\n\nIMPORTANT: Focus on generating a high-quality asset in a ${ratioHint}.`;

  // Add the main prompt
  parts.push({
    text: finalPrompt,
  });

  // Configure generation parameters with imageConfig for aspect ratio and resolution
  // Use camelCase keys to match @google/genai SDK v1.0.0+ expectations
  const generationConfig: Record<string, unknown> = {
    responseModalities: ['IMAGE', 'TEXT'],
    imageConfig: {
      aspectRatio: options.aspectRatio,
      imageSize: SOURCE_RESOLUTIONS[options.sourceResolution],
    },
  };

  const isGemini3 = model.includes('gemini-3');

  // Thinking
  if (isGemini3) {
    if (options.thinkingMode === 'high') {
      (generationConfig as any).thinkingConfig = {
        thinkingBudget: 1024,
      };
    }
  }

  const reqObj: any = {
    model,
    contents: [{ role: 'user', parts }],
    config: generationConfig,
  };

  // Grounding
  if (isGemini3 && options.groundingType && options.groundingType !== 'none') {
    reqObj.tools = [];
    if (options.groundingType === 'text' || options.groundingType === 'both') {
      reqObj.tools.push({ googleSearch: {} });
    }
  }

  // Generate content
  console.error('--- GEMINI API REQUEST ---');
  console.error(JSON.stringify({
    model,
    generationConfig,
    grounding: options.groundingType,
    parts: parts.map(p => {
      if ('inlineData' in p && p.inlineData) {
        return {
          type: 'inlineData',
          mimeType: p.inlineData.mimeType,
          data: p.inlineData.data ? truncateBase64(p.inlineData.data) : '(no data)'
        };
      }
      return p;
    }),
  }, null, 2));

  let response;
  try {
    const result = (await genAI.models.generateContent(reqObj)) as any;
    response = result;

    console.error('--- GEMINI API RESPONSE ---');
    if (response && response.candidates && response.candidates.length > 0) {
      try {
        const respLog = JSON.parse(JSON.stringify(response));
        // Truncate base64 in response logs
        if (respLog.candidates[0].content && respLog.candidates[0].content.parts) {
          respLog.candidates[0].content.parts = respLog.candidates[0].content.parts.map((p: any) => {
            if (p.inlineData && p.inlineData.data) {
              p.inlineData.data = truncateBase64(p.inlineData.data);
            }
            return p;
          });
        }
        console.error(JSON.stringify(respLog, null, 2));
      } catch (logErr) {
        console.error('Error stringifying response for log:', logErr);
        console.error('Raw response candidates count:', response.candidates.length);
      }
    } else {
      console.error('No candidates or invalid response object.');
    }
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

  if (response && response.candidates && response.candidates.length > 0) {
    const candidates = response.candidates;
    const content = candidates[0].content;
    if (content && content.parts) {
      // Find the image part
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          return Buffer.from(base64Data, 'base64');
        } else {
          console.error(`Found non-image part in response: ${Object.keys(part).join(', ')}`);
          if (part.text) {
            console.error(`Part text: ${part.text.slice(0, 100)}...`);
          }
        }
      }
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
