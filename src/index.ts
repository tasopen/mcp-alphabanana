#!/usr/bin/env node
/**
 * mcp-alphabanana - FastMCP server for image generation using Google Gemini AI.
 * Supports transparent PNG output, multiple resolutions, and style references.
 */

// Global error handlers to capture startup/initialization errors
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT_EXCEPTION]', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
  process.exit(1);
});

import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_VERSION = JSON.parse(
  fsSync.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
) as { version?: string };
const SERVER_VERSION = /^\d+\.\d+\.\d+$/.test(PACKAGE_VERSION.version ?? '')
  ? (PACKAGE_VERSION.version as `${number}.${number}.${number}`)
  : '0.0.0';

import {
  GEMINI_RESOLUTION_KEYS,
  SUPPORTED_ASPECT_RATIO_KEYS,
  getGeminiNativeSize,
  selectAspectRatio,
  type AspectRatioKey,
} from './utils/aspect-ratio.js';
import {
  generateWithGemini,
  type GroundingType,
  type GeminiReasoningDetails,
  type GeminiUsageMetadata,
  type ReferenceImage,
} from './utils/gemini-client.js';
import { postProcess, postProcessWithDebug, saveDebugImage } from './utils/post-processor.js';

// Supported image extensions and their MIME types
const SUPPORTED_IMAGE_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

/**
 * Load a reference image from file path and convert to ReferenceImage format
 */
async function loadReferenceImage(filePath: string, description?: string): Promise<ReferenceImage> {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = SUPPORTED_IMAGE_TYPES[ext];

  if (!mimeType) {
    throw new Error(`Unsupported image format: ${ext}. Supported: ${Object.keys(SUPPORTED_IMAGE_TYPES).join(', ')}`);
  }

  const buffer = await fs.readFile(filePath);
  const data = buffer.toString('base64');

  return {
    description,
    data,
    mimeType,
  };
}

// Zod schema for generate_image parameters
const GenerateImageParams = z.object({
  // Required parameters
  prompt: z.string().describe('User-provided image prompt. Preserve the original wording and detail; do not summarize or translate. Only append transparency-related hints if needed.'),
  outputFileName: z.string().describe('Output filename (extension auto-added if missing)'),

  // Output format
  outputType: z.enum(['file', 'base64', 'combine'])
    .default('combine')
    .describe('Output format: file=file only, base64=base64 only, combine=both. In Claude Desktop, prefer file for medium or large images to avoid context-size limits; use base64 only for small previews.'),

  // Model settings (REQUIRED - affects cost and capabilities)
    // See tool description for model details. 'flash' and 'pro' are aliases for Flash2.5 and Pro3, kept for compatibility.
    model: z.enum(['Flash3.1', 'Lite3.1', 'Flash2.5', 'Pro3', 'flash', 'pro']).default('Flash3.1')
      .describe('Model tier to use for generation (see tool description for details; "flash" and "pro" are aliases for Flash2.5 and Pro3; "Lite3.1" is the low-latency Nano Banana 2 Lite model, 1K-only, no grounding)'),
    // output_resolution is normally auto-calculated from pixel size; set only to intentionally override.
    output_resolution: z.enum(GEMINI_RESOLUTION_KEYS).optional()
      .describe('Gemini generation source resolution (optional in normal mode, required when noresize=true). In normal mode, the final image is resized to the requested pixel size after generation.'),

  // Native-size mode
  noresize: z.boolean().default(false)
    .describe('Skip post-generation resizing and return Gemini native dimensions directly. When true, provide aspectRatio and output_resolution instead of outputWidth/outputHeight.'),
  aspectRatio: z.enum(SUPPORTED_ASPECT_RATIO_KEYS).optional()
    .describe('Gemini aspect ratio to use directly when noresize=true. Ignored in normal resize mode.'),

  // Output dimensions
  outputWidth: z.number().int().min(8).max(4096).optional()
    .describe('Output image width in pixels. Required unless noresize=true. In normal mode, the image will be generated using the closest supported Gemini aspect ratio and resolution, then resized to this width.'),
  outputHeight: z.number().int().min(8).max(4096).optional()
    .describe('Output image height in pixels. Required unless noresize=true. In normal mode, the image will be generated using the closest supported Gemini aspect ratio and resolution, then resized to this height.'),
  output_format: z.enum(['png', 'jpg', 'webp']).default('png')
    .describe('Output format'),
  outputPath: z.string().optional()
    .describe('Output directory path (MUST be an absolute path when outputType is file or combine). In Claude Desktop on Windows, use the FileSystem extension to choose or prepare a writable absolute path such as C:\\temp.'),

  // Transparency processing
  transparent: z.boolean().default(false)
    .describe('Request transparent background (PNG or WebP only). Background color is selected by histogram analysis.'),
  transparentColor: z.string().nullable().default(null)
    .describe('Color to make transparent. Hex (e.g. #FF00FF). null defaults to #FF00FF when transparent=true.'),
  colorTolerance: z.number().int().min(0).max(255).default(30)
    .describe('Tolerance for color matching (0-255). Higher values are more permissive for transparent color selection and keying.'),

  // Fringe reduction
  fringeMode: z.enum(['auto', 'crisp', 'hd']).default('auto')
    .describe('Fringe reduction mode: auto (size-based), crisp (binary alpha), hd (force-clear 1px boundary for large images).'),

  // Resize
  resizeMode: z.enum(['crop', 'stretch', 'letterbox', 'contain'])
    .default('crop')
    .describe('Resize mode: crop=center crop, stretch=distort, letterbox=fit with padding, contain=trim transparent margins then fit'),

  // Advanced 3.1 features
  grounding_type: z.enum(['none', 'text', 'image', 'both']).default('none')
    .describe('Grounding tool usage (3.1 only)'),
  thinking_mode: z.enum(['minimal', 'high']).default('minimal')
    .describe('Thinking mode (3.1 only)'),
  include_thoughts: z.boolean().default(false)
    .describe('Optional (default: false). Request thought fields from Gemini (3.1 only). Thought content is returned in MCP response only when include_metadata=true.'),
  include_metadata: z.boolean().default(false)
    .describe('Include grounding and reasoning metadata in JSON output (optional, may increase payload size).'),

  // Reference images
  referenceImages: z.array(z.object({
    description: z.string().optional(),
    filePath: z.string().describe('Absolute path to reference image file (.png, .jpg, .jpeg, .webp). In Claude Desktop on Windows, use the FileSystem extension to locate the file and pass its Windows absolute path.'),
  })).max(14).default([]).describe('Reference images for style guidance (Flash2.5: max 3, others: max 14)'),

  // Debug
  debug: z.boolean().default(false)
    .describe('Debug mode: output intermediate processing images and prompt'),
}).superRefine((args, ctx) => {
  const needsOutputPath = args.outputType === 'file' || args.outputType === 'combine';
  const usesNativeSize = args.noresize === true;

  if (usesNativeSize) {
    if (!args.aspectRatio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aspectRatio'],
        message: 'aspectRatio is required when noresize=true',
      });
    }

    if (!args.output_resolution) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['output_resolution'],
        message: 'output_resolution is required when noresize=true',
      });
    }
  } else {
    if (args.outputWidth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputWidth'],
        message: 'outputWidth is required unless noresize=true',
      });
    }

    if (args.outputHeight === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['outputHeight'],
        message: 'outputHeight is required unless noresize=true',
      });
    }
  }

  if (needsOutputPath && !args.outputPath) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputPath'],
      message: 'outputPath is required when outputType is "file" or "combine"',
    });
    return;
  }

  if (needsOutputPath && args.outputPath && !path.isAbsolute(args.outputPath)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['outputPath'],
      message: 'outputPath must be an absolute path when outputType is "file" or "combine"',
    });
  }
});

// Output interface
interface GenerateImageOutput {
  success: boolean;
  filePath?: string;
  base64?: string;
  mimeType?: string;
  width: number;
  height: number;
  format: string;
  message: string;
  warning?: string;
  debugPrompt?: string;
  metadata?: {
    requestedGrounding: GroundingType;
    effectiveGrounding: GroundingType;
    grounding?: unknown;
    reasoningSummary?: string;
    reasoning?: GeminiReasoningDetails;
    safetyRatings?: unknown[];
    usage?: GeminiUsageMetadata;
  };
}

// Create FastMCP server
const server = new FastMCP({
  name: 'mcp-alphabanana',
  version: SERVER_VERSION,
  instructions: `
    Image asset generation server using Google Gemini AI.
    Supports transparent PNG output, multiple resolutions, and style references.
    Use outputType to control whether results are returned as files, base64, or both.
    In Claude Desktop, prefer outputType=file for medium or large images because base64/combine responses can exceed the client's context budget.
    In Claude Desktop on Windows, use the FileSystem extension to choose readable reference-image paths and writable output directories.
    Preserve user prompts as-is. Do not summarize or translate; only add transparency-related hints when needed.
  `,
});

// Register the generate_image tool
server.addTool({
  name: 'generate_image',
  description: `Generate image assets using Gemini AI with optional transparency and reference images.\n\n[Claude Desktop Guidance]\n- Prefer outputType='file' for medium or large images. base64 and combine responses can exceed Claude Desktop's context limit.\n- On Claude Desktop for Windows, use the FileSystem extension to choose reference-image paths and a writable absolute outputPath before calling this tool.\n- Use base64 only for small previews or when the client explicitly needs inline image data.\n\n[Model Guidance]\n- Flash3.1 (recommended): High quality, very fast, supports grounding and advanced features.\n- Lite3.1 (Nano Banana 2 Lite): Ultra-fast, cost-effective, 1K-only, no search grounding. Ideal for quick drafting and low-latency iteration.\n- Pro3: Higher fidelity, but more costly and slower.\n- Flash2.5: Legacy, maintained for compatibility. Does not support 0.5K, 2K, or 4K resolutions.\n\n[Aspect Ratios]\nGemini supports the following aspect ratios (model-dependent):\n- Common to all models: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9\n- Flash3.1 only: 1:4, 4:1, 1:8, 8:1\n\nNormal mode: provide outputWidth/outputHeight and the server will choose the closest Gemini aspect ratio and source resolution, then resize to the requested pixel size.\nNo-resize mode: set noresize=true and provide aspectRatio plus output_resolution. The server will return Gemini's native pixel dimensions for that combination without post-generation resizing.\n\nIf you intentionally want to control resizing/cropping in normal mode, use the 'resizeMode' parameter: 'crop' (default, center crop), 'letterbox' (fit with padding), 'contain' (trim transparent margins then fit), or 'stretch' (distort to fit).\n\n[IMPORTANT]\nAlways preserve the user's prompt as-is, including language and nuance. Do not translate or summarize.`,
  parameters: GenerateImageParams,
  annotations: {
    title: 'Image Generator',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  execute: async (args, { log }) => {
    try {
      log.info('Starting image generation', { prompt: args.prompt });
      const usesNativeSize = args.noresize === true;

      // Validate: outputPath is required for file and combine output types
      if ((args.outputType === 'file' || args.outputType === 'combine') && !args.outputPath) {
        return {
          content: [
            {
              type: 'text' as const, text: JSON.stringify({
                success: false,
                message: 'outputPath is required when outputType is "file" or "combine"',
                width: 0,
                height: 0,
                format: ''
              })
            },
          ],
        };
      }

      // Validate: 4K only available with pro tier (send as-is per spec, but log warning)
      if (args.output_resolution === '4K' && (args.model === 'Flash3.1' || args.model === 'Flash2.5' || args.model === 'flash')) {
        log.warn('4K resolution requested with flash tier - sending as-is to API');
      }

      // Validate: transparency with JPG
      let transparencyWarning = '';
      if (args.transparent && args.output_format === 'jpg') {
        transparencyWarning = ' Warning: Transparency is ignored for JPG output.';
        log.warn('Transparency requested with JPG format - transparency will be ignored');
      }

      // 1. Resolve aspect ratio and output size
      const aspectRatio: AspectRatioKey = usesNativeSize
        ? args.aspectRatio!
        : selectAspectRatio(args.outputWidth!, args.outputHeight!);
      log.info('Selected aspect ratio', { aspectRatio });

      // 2. Load and prepare reference images from file paths
      const referenceImages: ReferenceImage[] = [];
      for (const ref of args.referenceImages) {
        try {
          const loaded = await loadReferenceImage(ref.filePath, ref.description);
          referenceImages.push(loaded);
          log.info('Loaded reference image', { path: ref.filePath, mimeType: loaded.mimeType });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to load reference image "${ref.filePath}": ${errMsg}`);
        }
      }

      // Validate reference image count
      const maxRefs = args.model === 'Flash2.5' ? 3 : 14;
      if (referenceImages.length > maxRefs) {
        log.warn(`Too many reference images (${referenceImages.length}), truncating to ${maxRefs}`);
        referenceImages.splice(maxRefs);
      }

      // 3. Call Gemini API
      log.info('Calling Gemini API', { model: args.model, output_resolution: args.output_resolution });
      // sourceResolution: Must be provided (if not specified, it will be determined automatically)
      let sourceResolution: import('./utils/gemini-client.js').SourceResolution | undefined = args.output_resolution as import('./utils/gemini-client.js').SourceResolution;
      if (!sourceResolution) {
        const { selectSourceResolutionSmart } = await import('./utils/gemini-client.js');
        sourceResolution = selectSourceResolutionSmart(args.outputWidth!, args.outputHeight!, aspectRatio);
        log.info('Auto-selected sourceResolution', { sourceResolution });
      }
      // Pro3 does not support 0.5K — fall back to 1K before calculating output size
      if ((args.model === 'Pro3' || args.model === 'pro') && sourceResolution === '0.5K') {
        log.warn('Pro3 does not support 0.5K resolution, falling back to 1K');
        sourceResolution = '1K';
      }
      const outputSize = usesNativeSize
        ? getGeminiNativeSize(aspectRatio, sourceResolution)
        : { width: args.outputWidth!, height: args.outputHeight! };

      const geminiResult = await generateWithGemini({
        prompt: args.prompt,
        modelTier: args.model,
        sourceResolution,
        aspectRatio,
        transparent: args.transparent && (args.output_format === 'png' || args.output_format === 'webp'),
        transparentColor: args.transparentColor,
        referenceImages,
        groundingType: args.grounding_type,
        thinkingMode: args.thinking_mode,
        includeThoughts: args.include_thoughts,
      });
      const rawImageBuffer = geminiResult.imageBuffer;

      // Debug: save raw Gemini output (requires absolute outputPath when writing debug files)
      if (args.debug) {
        if (!args.outputPath || !path.isAbsolute(args.outputPath)) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ success: false, message: 'Debug mode: outputPath must be provided and be an absolute path when writing debug files', width: 0, height: 0, format: '' }) },
            ],
          };
        }

        const debugRawPath = path.resolve(args.outputPath, `${args.outputFileName}_debug_raw.png`);
        try {
          await fs.mkdir(path.dirname(debugRawPath), { recursive: true });
          await saveDebugImage(rawImageBuffer, debugRawPath);
          log.info('Saved debug raw image', { path: debugRawPath });
        } catch (err: any) {
          log.warn('Failed to write debug raw image to requested path, attempting fallback', { error: err && err.message });
          const fallbackDir = process.env.MCP_FALLBACK_OUTPUT || path.resolve(__dirname, '..', 'fallback-output');
          try {
            await fs.mkdir(fallbackDir, { recursive: true });
            let fallbackRaw = path.resolve(fallbackDir, `${args.outputFileName}_debug_raw.png`);
            if (fsSync.existsSync(fallbackRaw)) {
              fallbackRaw = path.resolve(fallbackDir, `${args.outputFileName}_debug_raw_${Date.now()}.png`);
            }
            await saveDebugImage(rawImageBuffer, fallbackRaw);
            log.warn('Saved debug raw image to fallback', { fallback: fallbackRaw });
            if (args.debug) {
              // Append info to message if result exists later
              // We'll attach in the final save block if needed
            }
          } catch (fallbackErr: any) {
            log.error('Failed to write debug raw image to fallback', { error: fallbackErr && fallbackErr.message });
            // Not fatal: continue and let later saving handle fallback for the main file
          }
        }
      }

      // 4. Post-processing (resize + transparency)
      log.info('Post-processing image', {
        width: outputSize.width,
        height: outputSize.height,
        noresize: usesNativeSize,
        resizeMode: args.resizeMode,
      });

      const shouldApplyTransparency = args.transparent && (args.output_format === 'png' || args.output_format === 'webp');
      // Resolve transparency color: null → 'auto' when transparent is true
      const resolvedTransparentColor = shouldApplyTransparency
        ? (args.transparentColor || '#FF00FF')
        : null;

      const postProcessOptions = {
        width: outputSize.width,
        height: outputSize.height,
        format: args.output_format as 'png' | 'jpg' | 'webp',
        resizeMode: args.resizeMode as 'crop' | 'stretch' | 'letterbox' | 'contain',
        skipResize: usesNativeSize,
        transparentColor: resolvedTransparentColor,
        colorTolerance: args.colorTolerance,
        fringeMode: args.fringeMode,
      };

      let processedBuffer: Buffer;
      if (args.debug) {
        const { buffer, debugInfo } = await postProcessWithDebug(rawImageBuffer, postProcessOptions);
        processedBuffer = buffer;
        if (debugInfo.selectedColor) {
          log.info('Selected background color', { color: debugInfo.selectedColor, method: debugInfo.selectionMethod });
        }
        if (debugInfo.cornerColors || debugInfo.requestedColor) {
          log.info('Transparency debug', {
            requestedColor: debugInfo.requestedColor,
            selectedColor: debugInfo.selectedColor,
            selectionMethod: debugInfo.selectionMethod,
            cornerColors: debugInfo.cornerColors,
          });
        }
      } else {
        processedBuffer = await postProcess(rawImageBuffer, postProcessOptions);
      }

      // 5. Build result
      // Set correct mimeType for all output types
      let mimeType: string;
      switch (args.output_format) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        case 'jpg':
        default:
          mimeType = 'image/jpeg';
          break;
      }

      const result: GenerateImageOutput = {
        success: true,
        width: outputSize.width,
        height: outputSize.height,
        format: args.output_format,
        mimeType,
        message: `Image generated successfully.${transparencyWarning}`,
      };

      // Debug: include prompt
      if (args.debug) {
        result.debugPrompt = args.prompt;
      }

      if (args.include_metadata) {
        result.metadata = {
          requestedGrounding: geminiResult.requestedGrounding,
          effectiveGrounding: geminiResult.effectiveGrounding,
          grounding: geminiResult.groundingMetadata,
          reasoningSummary: geminiResult.reasoningSummary,
          reasoning: geminiResult.reasoning,
          safetyRatings: geminiResult.safetyRatings,
          usage: geminiResult.usageMetadata,
        };
      }

      // Save file (when outputType is 'file' or 'combine')
      if (args.outputType === 'file' || args.outputType === 'combine') {
        // outputPath is guaranteed to exist due to validation above
        const outputPath = args.outputPath!;

        const fileName = args.outputFileName.endsWith(`.${args.output_format}`)
          ? args.outputFileName
          : `${args.outputFileName}.${args.output_format}`;

        // Require absolute outputPath
        if (!path.isAbsolute(outputPath)) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify({ success: false, message: 'outputPath must be an absolute path when saving files', width: 0, height: 0, format: '' }) },
            ],
          };
        }

        // Attempt to write to requested absolute path
        const requestedDir = outputPath;
        const fullPath = path.resolve(requestedDir, fileName);

        try {
          log.info('Attempting to save output file', { path: fullPath });
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, processedBuffer);

          result.filePath = fullPath;
          log.info('Saved output file', { path: fullPath });
        } catch (err: any) {
          // On failure, attempt fallback
          log.warn('Failed to write to requested outputPath, attempting fallback', { error: err && err.message });

          const fallbackDir = process.env.MCP_FALLBACK_OUTPUT || path.resolve(__dirname, '..', 'fallback-output');
          try {
            await fs.mkdir(fallbackDir, { recursive: true });

            // Avoid overwriting by appending timestamp if file exists
            let fallbackFileName = fileName;
            let fallbackFullPath = path.resolve(fallbackDir, fallbackFileName);
            if (fsSync.existsSync(fallbackFullPath)) {
              const ext = path.extname(fileName);
              const base = path.basename(fileName, ext);
              fallbackFileName = `${base}_${Date.now()}${ext}`;
              fallbackFullPath = path.resolve(fallbackDir, fallbackFileName);
            }

            await fs.writeFile(fallbackFullPath, processedBuffer);

            result.filePath = fallbackFullPath;
            result.warning = `Requested path not writable; saved to fallback: ${fallbackFullPath}`;
            log.warn('Saved output to fallback', { fallback: fallbackFullPath });

            // If debug mode, include fallback info in message
            if (args.debug) result.message += ` (saved to fallback: ${fallbackFullPath})`;
          } catch (fallbackErr: any) {
            log.error('Fallback write failed', { error: fallbackErr && fallbackErr.message });
            throw new Error(`Failed to write output to requested path and fallback. Errors: ${err?.message}; ${fallbackErr?.message}`);
          }
        }
      }

      // Base64 encode (when outputType is 'base64' or 'combine')
      if (args.outputType === 'base64' || args.outputType === 'combine') {
        result.base64 = processedBuffer.toString('base64');
        result.mimeType = args.output_format === 'png' ? 'image/png' : args.output_format === 'webp' ? 'image/webp' : 'image/jpeg';
      }

      // Build return content
      log.info('Image generation completed successfully');

      // Include image content when outputType is 'base64' or 'combine'
      if (args.outputType === 'base64' || args.outputType === 'combine') {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify(result, null, 2) },
            { type: 'image' as const, data: result.base64!, mimeType: result.mimeType! },
          ],
        };
      }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error('Image generation failed', { error: errorMessage });

      // Check for specific error types
      let userMessage = `Generation failed: ${errorMessage}`;
      if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
        userMessage = 'Rate limit exceeded. Please retry after 60 seconds.';
      } else if (errorMessage.includes('No image in response')) {
        userMessage = 'No image in response. Try refining the prompt.';
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            message: userMessage,
            width: 0,
            height: 0,
            format: '',
          }),
        }],
      };
    }
  },
});

// Start server (async to properly catch rejected promises from server.start())
(async () => {
  try {
    console.error('[SERVER_STARTUP] Starting MCP server initialization...');
    await server.start({
      transportType: 'stdio',
    });
    console.error('[SERVER_STARTUP] Server started successfully');
  } catch (startError) {
    console.error('[SERVER_STARTUP_ERROR]', startError);
    process.exit(1);
  }
})().catch((err) => {
  console.error('[SERVER_STARTUP_FATAL]', err);
  process.exit(1);
});