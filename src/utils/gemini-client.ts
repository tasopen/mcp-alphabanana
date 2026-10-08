/**
 * Select the best Gemini sourceResolution ('1K', '2K', '4K') from width/height and aspect ratio.
 * Uses the official Gemini table for all supported aspect ratios and resolutions.
 * The resolution list itself comes from the central model configuration.
 * Fallback: the largest resolution when the requested size exceeds every native size.
 */
export function selectSourceResolutionSmart(width: number, height: number, aspectRatio: AspectRatioKey): SourceResolution {
  const candidates = SUPPORTED_RESOLUTIONS
    .map((resolution) => ({ resolution, native: GEMINI_NATIVE_SIZES[aspectRatio]?.[resolution] }))
    .filter((entry): entry is { resolution: ResolutionKey; native: [number, number] } => Boolean(entry.native));

  if (candidates.length === 0) {
    throw new Error(`selectSourceResolutionSmart: No native sizes for aspect ratio "${aspectRatio}".`);
  }

  const largest = candidates[candidates.length - 1];

  // If either side exceeds the largest native size, use the largest resolution.
  if (width > largest.native[0] || height > largest.native[1]) {
    return largest.resolution;
  }

  // To avoid upscaling: select the smallest resolution that still covers the requested size.
  for (const candidate of candidates) {
    if (width <= candidate.native[0] && height <= candidate.native[1]) {
      return candidate.resolution;
    }
  }

  // Theoretically unreachable: the largest candidate always covers the size here.
  return largest.resolution;
}
/**
 * Gemini API wrapper for image generation.
 * Supports multiple model tiers and reference images.
 */

import { GoogleGenAI, type Part } from '@google/genai';
import { GEMINI_NATIVE_SIZES, type AspectRatioKey, type GeminiResolutionKey } from './aspect-ratio.js';
import {
  SUPPORTED_RESOLUTIONS,
  clampResolutionToModel,
  clampThinkingLevelToModel,
  type ModelInput,
  type ResolutionKey,
  type ThinkingLevel,
} from '../config/model-config.js';
import { resolveModelOrThrow } from '../model-resolver.js';

// Source resolution mapping to API `imageSize` values ('1K', '2K', '4K').
// v1.6.0: '0.5K' (API value '512') has been removed.
const SOURCE_RESOLUTIONS: Record<SourceResolution, string> = {
  '1K': '1K',
  '2K': '2K',
  '4K': '4K',
} as const;

/** Model names/aliases accepted by this client (canonical list: src/config/model-config.ts). */
export type ModelTier = ModelInput;
export type SourceResolution = GeminiResolutionKey;
export type GroundingType = 'none' | 'text' | 'image' | 'both';
export type ThinkingMode = ThinkingLevel;

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

export interface GeminiReasoningDetails {
  mode: ThinkingMode;
  includeThoughts: boolean;
  hasThoughtSignature: boolean;
  hasThoughtText: boolean;
  thoughtSignature?: string;
  thoughtText?: string;
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export interface GenerateWithGeminiResult {
  imageBuffer: Buffer;
  requestedGrounding: GroundingType;
  effectiveGrounding: GroundingType;
  groundingMetadata?: unknown;
  safetyRatings?: unknown[];
  usageMetadata?: GeminiUsageMetadata;
  reasoningSummary?: string;
  reasoning?: GeminiReasoningDetails;
}

function extractThoughtText(parts: unknown): string | undefined {
  if (!Array.isArray(parts)) {
    return undefined;
  }

  const thoughtTexts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    const thoughtFlag = (part as any).thought;
    const text = (part as any).text;
    if (thoughtFlag === true && typeof text === 'string' && text.trim().length > 0) {
      thoughtTexts.push(text.trim());
      continue;
    }
    if (typeof thoughtFlag === 'string' && thoughtFlag.trim().length > 0) {
      thoughtTexts.push(thoughtFlag.trim());
    }
  }

  if (thoughtTexts.length === 0) {
    return undefined;
  }

  return thoughtTexts.join('\n\n');
}

function buildReasoningSummary(details: GeminiReasoningDetails): string {
  const modeLabel = `${details.mode} thinking`;
  if (!details.includeThoughts) {
    return `Reasoning metadata captured with ${modeLabel}; thought text output is disabled.`;
  }

  if (details.hasThoughtText) {
    return `Reasoning metadata captured with ${modeLabel}; thought text is included.`;
  }

  if (details.hasThoughtSignature) {
    return `Reasoning metadata captured with ${modeLabel}; thought signature is available, but no thought text was returned.`;
  }

  return `Reasoning metadata captured with ${modeLabel}; no thought fields were returned by Gemini.`;
}

// Prompts that likely require real-time lookup should opt in to search grounding.
function inferGroundingTypeFromPrompt(prompt: string): GroundingType {
  const normalized = prompt.toLowerCase();
  const searchHints = [
    'search',
    'google',
    'latest',
    'current',
    'today',
    'news',
    'headline',
    '最新',
    '現在',
    '今日',
    'ニュース',
    '検索',
  ];
  return searchHints.some((hint) => normalized.includes(hint)) ? 'text' : 'none';
}

function buildGroundingTools(groundingType: GroundingType): Array<Record<string, unknown>> {
  if (groundingType === 'none') {
    return [];
  }

  if (groundingType === 'text') {
    return [{ googleSearch: {} }];
  }

  if (groundingType === 'image') {
    return [
      {
        googleSearch: {
          searchTypes: {
            imageSearch: {},
          },
        },
      },
    ];
  }

  // both: combine web + image search
  return [
    {
      googleSearch: {
        searchTypes: {
          webSearch: {},
          imageSearch: {},
        },
      },
    },
  ];
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
 * Remove sensitive/verbose string fields from log objects.
 */
function omitStringField(obj: unknown, key: string): void {
  if (!obj || typeof obj !== 'object') {
    return;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record[key] === 'string') {
    delete record[key];
  }
}

/**
 * Generate an image using Gemini API.
 * @param options - Generation options
 * @returns Generated image and response metadata from Gemini
 */
export async function generateWithGemini(options: GenerateWithGeminiOptions): Promise<GenerateWithGeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const genAI = new GoogleGenAI({ apiKey });

  // Single resolution path: alias → canonical model → MODEL_CONFIG → lifecycle → capabilities → Google model ID.
  const resolvedModel = resolveModelOrThrow(options.modelTier);
  const model = resolvedModel.googleModelId;
  const modelName = resolvedModel.key;
  const capabilities = resolvedModel.config.capabilities;

  // Capability-driven parameter guarding (single source: MODEL_CONFIG).
  let effectiveSourceResolution = options.sourceResolution;
  let effectiveGroundingType: GroundingType | undefined = options.groundingType;

  if (!capabilities.supportedResolutions.includes(effectiveSourceResolution)) {
    const clamped = clampResolutionToModel(effectiveSourceResolution, capabilities.supportedResolutions);
    console.warn(`[${modelName}] sourceResolution overridden from '${effectiveSourceResolution}' to '${clamped}' (supported: ${capabilities.supportedResolutions.join(', ')})`);
    effectiveSourceResolution = clamped;
  }

  if (!capabilities.grounding && effectiveGroundingType && effectiveGroundingType !== 'none') {
    console.warn(`[${modelName}] groundingType overridden from '${effectiveGroundingType}' to 'none' (model does not support search grounding)`);
    effectiveGroundingType = 'none';
  }

  // Thinking level: clamp to the levels the model supports (e.g. NanoBanana2.1 accepts
  // minimal/medium/high with a model default of medium; Flash3.1/Pro3 accept minimal/high).
  const requestedThinkingLevel = options.thinkingMode ??
    capabilities.defaultThinkingLevel ?? 'minimal';
  const effectiveThinkingLevel = capabilities.thinking
    ? clampThinkingLevelToModel(requestedThinkingLevel, capabilities)
    : requestedThinkingLevel;
  if (effectiveThinkingLevel !== requestedThinkingLevel) {
    console.warn(`[${modelName}] thinkingMode overridden from '${requestedThinkingLevel}' to '${effectiveThinkingLevel}' (supported: ${capabilities.thinkingLevels.join(', ') || 'none'})`);
  }

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

  // Infuse aspect ratio hint into instructions to ensure the model honors it.
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
      imageSize: SOURCE_RESOLUTIONS[effectiveSourceResolution],
    },
  };

  const requestedGrounding: GroundingType = effectiveGroundingType ?? 'none';
  let effectiveGrounding: GroundingType = requestedGrounding !== 'none'
    ? requestedGrounding
    : inferGroundingTypeFromPrompt(options.prompt);

  // Models without grounding capability never search (capability: MODEL_CONFIG).
  if (!capabilities.grounding) {
    effectiveGrounding = 'none';
  }

  // Thinking Mode setup (capability-driven; levels and defaults live in MODEL_CONFIG)
  if (capabilities.thinking) {
    if (options.includeThoughts) {
      // Request the chosen level and ask for thought fields when explicitly requested.
      (generationConfig as any).thinkingConfig = {
        thinkingLevel: effectiveThinkingLevel,
        includeThoughts: true,
      };
    } else {
      // Pin the requested level; thought text stays hidden (still billed by Google).
      (generationConfig as any).thinkingConfig = {
        thinkingLevel: effectiveThinkingLevel,
        includeThoughts: false,
      };
    }
  }

  // Grounding must be configured under request.config.tools.
  if (capabilities.grounding && effectiveGrounding !== 'none') {
    (generationConfig as any).tools = buildGroundingTools(effectiveGrounding);
  }

  const reqObj: any = {
    model,
    contents: [{ role: 'user', parts }],
    config: generationConfig,
  };

  // Generate content
  console.error('--- GEMINI API REQUEST ---');
  console.error(JSON.stringify({
    model,
    generationConfig,
    requestedGrounding,
    effectiveGrounding,
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
            omitStringField(p, 'thoughtSignature');
            return p;
          });
        }
        // Omit thoughtSignature fields at known candidate/content levels.
        omitStringField(respLog.candidates[0], 'thoughtSignature');
        omitStringField(respLog.candidates[0].content, 'thoughtSignature');
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
    const firstCandidate = candidates[0] as any;
    const content = firstCandidate?.content;
    if (content && content.parts) {
      // Find the image part
      for (const part of content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const base64Data = part.inlineData.data;
          const thoughtSignature = typeof content?.thoughtSignature === 'string'
            ? content.thoughtSignature
            : (typeof firstCandidate?.thoughtSignature === 'string' ? firstCandidate.thoughtSignature : undefined);
          const thoughtText = options.includeThoughts ? extractThoughtText(content.parts) : undefined;
          const reasoning: GeminiReasoningDetails = {
            mode: effectiveThinkingLevel,
            includeThoughts: options.includeThoughts ?? false,
            hasThoughtSignature: Boolean(thoughtSignature),
            hasThoughtText: Boolean(thoughtText),
            thoughtText,
          };

          return {
            imageBuffer: Buffer.from(base64Data, 'base64'),
            requestedGrounding,
            effectiveGrounding,
            groundingMetadata: firstCandidate?.groundingMetadata,
            safetyRatings: Array.isArray(firstCandidate?.safetyRatings) ? firstCandidate.safetyRatings : undefined,
            usageMetadata: response?.usageMetadata
              ? {
                  promptTokenCount: response.usageMetadata.promptTokenCount,
                  candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
                  totalTokenCount: response.usageMetadata.totalTokenCount,
                }
              : undefined,
            reasoningSummary: buildReasoningSummary(reasoning),
            reasoning,
          };
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
