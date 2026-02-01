# mcp-alphabanana Specification

## Overview

mcp-alphabanana is a Model Context Protocol server that enables **VS Code GitHub Copilot Agent** and other MCP clients to generate image assets on demand using Google Gemini AI.

**This version is re-implemented with [FastMCP 3](https://www.npmjs.com/package/fastmcp)**, resulting in a significantly simplified codebase and flexible output format options.

## Purpose

- Provide MCP clients with on-demand **general-purpose** image generation
- Generate bitmap images from text prompts with optional reference images
- Support transparent PNG output via post-processing (color-key method)
- Output images in specified resolutions with automatic post-processing
- Return results as files, base64-encoded data, or both

---

## Key Changes from Internal Version

| Item | Internal Version | Public Version |
|------|------------------|----------------|
| MCP Framework | @modelcontextprotocol/sdk (raw) | FastMCP 3.x |
| Code Structure | server.ts + tools/ + utils/ | index.ts-centric simple structure |
| Output Format | File only | file / base64 / combine (selectable) |
| Configuration | config.ts | Direct environment variable reference |

---

## Project Structure

```
mcp-alphabanana/
├── src/
│   ├── index.ts              # FastMCP server definition & tool registration
│   └── utils/
│       ├── gemini-client.ts  # Gemini API wrapper
│       ├── post-processor.ts # Resize & transparency processing
│       └── aspect-ratio.ts   # Aspect ratio calculation
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
└── README.md
```

---

## Dependencies

```json
{
  "dependencies": {
    "fastmcp": "^3.31.0",
    "zod": "^3.23.0",
    "@google/genai": "^1.0.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0"
  }
}
```

---

## Tool Definition

### `generate_image`

Generates image assets using Gemini AI.

### Input Schema (Zod)

```typescript
import { z } from 'zod';

const GenerateImageParams = z.object({
  // Required parameters
  prompt: z.string().describe('Description of the image to generate'),
  outputFileName: z.string().describe('Output filename (extension auto-added if missing)'),
  
  // Output format
  outputType: z.enum(['file', 'base64', 'combine'])
    .default('combine')
    .describe('Output format: file=file only, base64=base64 only, combine=both'),
  
  // Model settings
  modelTier: z.enum(['flash', 'pro'])
    .describe('Model selection: flash=Gemini 2.5 Flash (max 3 reference images), pro=Gemini 3 Pro (max 14 reference images)'),
  sourceResolution: z.enum(['1K', '2K', '4K'])
    .default('1K')
    .describe('Gemini generation resolution (2K/4K available only with pro tier)'),
  
  // Output dimensions
  outputWidth: z.number().int().min(8).max(4096).default(1024)
    .describe('Output image width in pixels'),
  outputHeight: z.number().int().min(8).max(4096).default(1024)
    .describe('Output image height in pixels'),
  outputFormat: z.enum(['png', 'jpg']).default('png')
    .describe('Output format'),
  outputPath: z.string().optional()
    .describe('Absolute output directory path (required when saving files)'),
  
  // Transparency processing
  transparent: z.boolean().default(false)
    .describe('Request transparent background (PNG only)'),
  transparentColor: z.string().nullable().default(null)
    .describe('Color to make transparent (hex format, e.g., #FF00FF)'),
  colorTolerance: z.number().int().min(0).max(255).default(30)
    .describe('Tolerance for transparent color matching'),
  
  // Resize
  resizeMode: z.enum(['crop', 'stretch', 'letterbox', 'contain'])
    .default('crop')
    .describe('Resize mode'),
  
  // Reference images
  referenceImages: z.array(z.object({
    description: z.string().optional(),
    filePath: z.string().describe('Absolute path to reference image file (.png, .jpg, .jpeg, .webp)'),
  })).default([]).describe('Reference images for style guidance (flash tier: max 3, pro tier: max 14)'),
  
  // Debug
  debug: z.boolean().default(false)
    .describe('Debug mode: output intermediate processing images and prompt'),
});
```

### Output Schema

```typescript
interface GenerateImageOutput {
  success: boolean;
  
  // When outputType is 'file' or 'combine'
  filePath?: string;
  
  // When outputType is 'base64' or 'combine'
  base64?: string;
  mimeType?: string;  // 'image/png' or 'image/jpeg'
  
  // Common fields
  width: number;
  height: number;
  format: string;
  message: string;
  
  // Debug mode only
  debugPrompt?: string;
}
```

---

## FastMCP Implementation

### Server Setup

```typescript
// src/index.ts
import { FastMCP, imageContent } from 'fastmcp';
import { z } from 'zod';
import { generateWithGemini } from './utils/gemini-client';
import { postProcess } from './utils/post-processor';
import { selectAspectRatio } from './utils/aspect-ratio';
import * as fs from 'fs/promises';
import * as path from 'path';

const server = new FastMCP({
  name: 'mcp-alphabanana',
  version: '1.0.0',
  instructions: `
    Image asset generation server using Google Gemini AI.
    Supports transparent PNG output, multiple resolutions, and style references.
    Use outputType to control whether results are returned as files, base64, or both.
  `,
});

server.addTool({
  name: 'generate_image',
  description: 'Generate image assets using Gemini AI with optional transparency and reference images',
  parameters: GenerateImageParams,
  annotations: {
    title: 'Image Generator',
    readOnlyHint: false,
    openWorldHint: true,
  },
  execute: async (args, { log }) => {
    try {
      log.info('Starting image generation', { prompt: args.prompt });
      
      // 1. Calculate aspect ratio
      const aspectRatio = selectAspectRatio(args.outputWidth, args.outputHeight);
      
      // 2. Call Gemini API
      const rawImageBuffer = await generateWithGemini({
        prompt: args.prompt,
        modelTier: args.modelTier,
        sourceResolution: args.sourceResolution,
        aspectRatio,
        transparent: args.transparent,
        transparentColor: args.transparentColor,
        referenceImages: args.referenceImages,
      });
      
      // 3. Post-processing (resize + transparency)
      const processedBuffer = await postProcess(rawImageBuffer, {
        width: args.outputWidth,
        height: args.outputHeight,
        format: args.outputFormat,
        resizeMode: args.resizeMode,
        transparentColor: args.transparent ? (args.transparentColor || '#FF00FF') : null,
        colorTolerance: args.colorTolerance,
      });
      
      // 4. Return based on outputType
      const result: GenerateImageOutput = {
        success: true,
        width: args.outputWidth,
        height: args.outputHeight,
        format: args.outputFormat,
        message: 'Image generated successfully',
      };
      
      // Save file (when outputType is 'file' or 'combine')
      if (args.outputType === 'file' || args.outputType === 'combine') {
        const fileName = args.outputFileName.endsWith(`.${args.outputFormat}`)
          ? args.outputFileName
          : `${args.outputFileName}.${args.outputFormat}`;
        const fullPath = path.resolve(args.outputPath, fileName);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, processedBuffer);
        result.filePath = fullPath;
      }
      
      // Base64 encode (when outputType is 'base64' or 'combine')
      if (args.outputType === 'base64' || args.outputType === 'combine') {
        result.base64 = processedBuffer.toString('base64');
        result.mimeType = args.outputFormat === 'png' ? 'image/png' : 'image/jpeg';
      }
      
      // Build return content
      const content: any[] = [
        { type: 'text', text: JSON.stringify(result, null, 2) },
      ];
      
      // Include image when outputType is 'base64' or 'combine'
      if (args.outputType === 'base64' || args.outputType === 'combine') {
        content.push({
          type: 'image',
          data: result.base64,
          mimeType: result.mimeType,
        });
      }
      
      return { content };
      
    } catch (error) {
      log.error('Image generation failed', { error: String(error) });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            message: `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
          }),
        }],
      };
    }
  },
});

// Start server
server.start({
  transportType: 'stdio',
});
```

---

## Output Type Behavior

| outputType | Save File | Return Base64 | MCP Image Content | Use Case |
|------------|-----------|---------------|-------------------|----------|
| `file` | ✓ | ✗ | ✗ | Local development, batch generation |
| `base64` | ✗ | ✓ | ✓ | Tool chaining, immediate display |
| `combine` | ✓ | ✓ | ✓ | Default, flexible usage |

### Response Examples

#### `outputType: 'file'`
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\":true,\"filePath\":\"/path/to/output.png\",\"width\":256,\"height\":256,\"format\":\"png\",\"message\":\"Image generated successfully\"}"
    }
  ]
}
```

#### `outputType: 'base64'`
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\":true,\"base64\":\"iVBORw0KGgo...\",\"mimeType\":\"image/png\",\"width\":256,\"height\":256,\"format\":\"png\",\"message\":\"Image generated successfully\"}"
    },
    {
      "type": "image",
      "data": "iVBORw0KGgo...",
      "mimeType": "image/png"
    }
  ]
}
```

#### `outputType: 'combine'` (default)
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"success\":true,\"filePath\":\"/path/to/output.png\",\"base64\":\"iVBORw0KGgo...\",\"mimeType\":\"image/png\",\"width\":256,\"height\":256,\"format\":\"png\",\"message\":\"Image generated successfully\"}"
    },
    {
      "type": "image",
      "data": "iVBORw0KGgo...",
      "mimeType": "image/png"
    }
  ]
}
```

---

## Gemini API Configuration

### Models

| Tier | Model | Max Resolution | Max Reference Images | Thinking |
|------|-------|----------------|---------------------|----------|
| pro | `gemini-3-pro-image-preview` | 4K (4096px) | 14 | ✓ Enabled |
| flash | `gemini-2.5-flash-image` | 1K (1024px) | 3 | ✗ Disabled |

### Supported Aspect Ratios

Aspect ratios are automatically selected based on output dimensions:

| Ratio | Value | Example Use |
|-------|-------|-------------|
| 1:1 | 1.0 | Icons, sprites |
| 2:3 | 0.667 | Portrait cards |
| 3:2 | 1.5 | Landscape scenes |
| 3:4 | 0.75 | Character portraits |
| 4:3 | 1.333 | UI panels |
| 4:5 | 0.8 | Mobile UI |
| 5:4 | 1.25 | Tile sets |
| 9:16 | 0.5625 | Mobile backgrounds |
| 16:9 | 1.778 | Game backgrounds |
| 21:9 | 2.333 | Ultra-wide backgrounds |

---

## Transparency Processing

### Algorithm (HSV-Based)

1. When `transparent: true` → Add transparent background instruction to prompt
2. When `transparentColor` is set → Use HSV color space matching
3. Supported key colors: Magenta (#FF00FF), Green (#00FF00), Blue (#0000FF)
4. Transparency is applied before resize (prevents color bleeding)

### Recommended Background Colors

| Color | Hex | Best For | Notes |
|-------|-----|----------|-------|
| Magenta | #FF00FF | Most sprites | Default. Good contrast with most assets |
| Green | #00FF00 | Purple/pink objects | Use when subject contains magenta |
| Blue | #0000FF | Green objects | Use when subject contains green |

---

## Resize Modes

| Mode | Description |
|------|-------------|
| `crop` | Center crop to exact dimensions (default). Maintains aspect ratio, cuts overflow |
| `stretch` | Distort image to fit exact dimensions. May change aspect ratio |
| `letterbox` | Fit within dimensions with padding. Black for JPG, transparent for PNG |
| `contain` | Trim transparent margins then fit to frame (PNG only) |

---

## VS Code Integration

### MCP Server Configuration

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "type": "stdio",
        "command": "node",
        "args": ["c:/path/to/mcp-alphabanana/dist/index.js"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
        }
      }
    }
  }
}
```

---

## Usage Examples

### Basic Generation (Default: combine)

```json
{
  "prompt": "A pixel art treasure chest, golden trim, wooden texture",
  "modelTier": "pro",
  "outputFileName": "chest",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

### File Only (Batch Processing)

```json
{
  "prompt": "Fantasy forest background, mystical atmosphere",
  "modelTier": "pro",
  "outputFileName": "forest_bg",
  "outputType": "file",
  "outputWidth": 1920,
  "outputHeight": 1080,
  "outputFormat": "jpg",
  "outputPath": "C:/Users/you/project/assets/backgrounds"
}
```

### Base64 Only (Chain to Other Tools)

```json
{
  "prompt": "App icon, minimal mountain with sun, flat vector",
  "modelTier": "pro",
  "outputFileName": "icon",
  "outputType": "base64",
  "outputWidth": 512,
  "outputHeight": 512,
  "transparent": true
}
```

### With Reference Images

```json
{
  "prompt": "A matching treasure chest, open state, same pixel art style as references",
  "modelTier": "pro",
  "outputFileName": "chest_open",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true,
  "referenceImages": [
    {
      "description": "Closed chest for style reference",
      "filePath": "C:/Users/you/project/assets/references/chest_closed.png"
    }
  ]
}
```

### High-Resolution Background (4K Source)

```json
{
  "prompt": "A fantasy game background, mystical forest at twilight with glowing mushrooms",
  "modelTier": "pro",
  "sourceResolution": "4K",
  "outputFileName": "forest_twilight",
  "outputWidth": 1920,
  "outputHeight": 1080,
  "outputFormat": "jpg",
  "outputPath": "C:/Users/you/project/assets/backgrounds"
}
```

---

## Error Handling

| Error Type | Response |
|------------|----------|
| API Rate Limit (429) | `{ success: false, message: "Rate limit exceeded. Please retry after 60 seconds." }` |
| Invalid Parameters | Zod validation error with field details |
| API Empty Response | `{ success: false, message: "No image in response. Try refining the prompt." }` |
| File Write Failure | `{ success: false, message: "Failed to write file: [path]" }` |

---

## Constraints & Limitations

| Constraint | Value | Notes |
|------------|-------|-------|
| Max output resolution | 4096x4096 | Output size limit; actual Gemini source may be larger before downscale |
| Min output resolution | 8x8 | Practical minimum |
| Supported formats | PNG, JPG | WebP may be added later |
| Source resolution (flash) | 1K | gemini-2.5-flash limitation |
| Source resolution (pro) | 1K, 2K, 4K | gemini-3-pro-image-preview |
| Transparent background | PNG only | Color-key method |
| Color tolerance range | 0-255 | Default: 30 |
| Reference images (flash) | max 3 | API limitation |
| Reference images (pro) | max 14 | API limitation |
| Aspect ratios | 10 supported | Auto-selected |
| Resize modes | 4 supported | crop, stretch, letterbox, contain |

### Clarifications (Implementation Decisions)

- **Resize behavior:** The server always resizes the Gemini output to `outputWidth` × `outputHeight` (upscale or downscale). This decouples Gemini’s fixed source sizes from requested output dimensions.
- **Gemini fixed sizes:** Gemini returns fixed pixel sizes based on `sourceResolution` and selected aspect ratio. The server post-scales to the requested output size.
- **4K on flash tier:** If `sourceResolution: "4K"` is requested with `modelTier: "flash"`, the request is sent as-is to the API (no validation or downgrade).
- **Reference images:** `referenceImages` are loaded from file paths and sent as inline image parts.
- **Transparency with JPG:** If `transparent: true` and `outputFormat: "jpg"`, transparency is ignored and a warning is returned in the result message.

---

## Development & Testing

### Run with FastMCP CLI

```bash
# Development mode (mcp-cli)
npx fastmcp dev src/index.ts

# MCP Inspector (Web UI)
npx fastmcp inspect src/index.ts
```

### Build

```bash
npm run build
node dist/index.js
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API Key |

---

## References

- [FastMCP (npm)](https://www.npmjs.com/package/fastmcp)
- [FastMCP GitHub](https://github.com/punkpeye/fastmcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [qhdrl12/mcp-server-gemini-image-generator](https://github.com/qhdrl12/mcp-server-gemini-image-generator) (Reference implementation)




