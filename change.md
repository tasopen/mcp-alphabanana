support-design-doc.md）として保存してご活用ください。

Markdown
# Technical Design Document: Nano Banana 2 Lite Support for mcp-alphabanana

## 1. Overview & Objective
The goal of this modification is to integrate support for Google's **Nano Banana 2 Lite** (internal model identifier: `gemini-3.1-flash-lite-image`) into the `mcp-alphabanana` local MCP server. This lightweight model enables ultra-fast, cost-effective image generation, making it an ideal choice for quick asset drafting and low-latency iteration.

## 2. Technical Capabilities & Constraint Analysis

According to the official Google Gemini API specification for Nano Banana 2 Lite, the model comes with specific technical constraints that differ from `Flash3.1` and `Pro3`:

| Feature | Premium Tiers (Flash3.1 / Pro3) | Nano Banana 2 Lite (`Lite3.1`) |
| :--- | :--- | :--- |
| **Native Resolutions** | 0.5K, 1K, 2K, 4K | **1K Only** (1024px bounding box variations) |
| **Search Grounding** | Supported | **Not Supported** |
| **Transparency** | Pseudo-transparency via Chroma-key | Pseudo-transparency via Chroma-key (Edge-accuracy may vary) |

### Background Transparency Consideration
Nano Banana 2 Lite supports multi-turn background adjustment/removal commands natively via instruction editing. However, for initial asset generation, it does not output native alpha-channel transparency directly. 

The current implementation of `mcp-alphabanana` addresses transparency by forcing a high-contrast single-color backdrop (e.g., `#FF00FF` / pure magenta) through targeted prompts and executing a pixel-swap masking operation during the `postProcess` stage via Node.js. This mechanism is logically compatible with the Lite tier. However, due to the lower parameter weight of the Lite model, subtle bleeding or lower fidelity along subject edges may occur during chroma-key replacement.

---

## 3. Architectural Proposed Changes

To handle the model's restrictions smoothly without failing execution, the server must intercept incoming parameters and gracefully apply fallbacks.

### 3.1 `src/utils/gemini-client.ts`
- **Model Dictionary Expansion**: Append the explicit model identifier mapping for the Lite model tier.
- **Type Safety**: Update `ModelTier` type unions to include `'Lite3.1'`.
- **Parameter Guarding Logic**: Intercept execution inside `generateWithGemini()`. If `modelTier === 'Lite3.1'`, automatically override `sourceResolution` to `'1K'` and `groundingType` to `'none'`, logging warning messages to `stderr` for visibility.

### 3.2 `src/index.ts`
- **Zod Schema Update**: Update the validation schema for tool arguments to accommodate `'Lite3.1'` as an allowed item inside the model `enum`.
- **LLM Context Enhancement**: Polish the string description fields so consumer LLMs can strategically choose between premium tiers and low-latency tiers depending on user intent.

---

## 4. Implementation Code Blueprint

### 4.1 Changes in `src/utils/gemini-client.ts`

#### Model Mapping & Type Definitions
```typescript
// Add Lite3.1 to the standard model dictionary mapping
const MODELS = {
  'Flash3.1': 'gemini-3.1-flash-image-preview',
  'Lite3.1': 'gemini-3.1-flash-lite-image', // Newly integrated model id
  'Flash2.5': 'gemini-2.5-flash-image',
  'Pro3': 'gemini-3-pro-image-preview',
  flash: 'gemini-3.1-flash-image-preview',
  pro: 'gemini-3-pro-image-preview',
} as const;

// Extend the ModelTier union type
export type ModelTier = 'Flash3.1' | 'Lite3.1' | 'Flash2.5' | 'Pro3' | 'flash' | 'pro';
Parameter Normalization Interceptor
Add this block at the entry point of the generateWithGemini execution flow:

TypeScript
export async function generateWithGemini(options: GenerateWithGeminiOptions): Promise<GenerateWithGeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Enforce structural constraints specifically for Nano Banana 2 Lite
  if (options.modelTier === 'Lite3.1') {
    // 1. Lite model only supports 1K resolution native footprints
    if (options.sourceResolution !== '1K') {
      console.error(`[Lite-Constraint] Nano Banana 2 Lite only supports 1K resolution. Coerced from '${options.sourceResolution}' to '1K'.`);
      options.sourceResolution = '1K';
    }

    // 2. Lite model lacks Google Search Grounding infrastructure
    if (options.groundingType && options.groundingType !== 'none') {
      console.error(`[Lite-Constraint] Google Search Grounding is unavailable on Nano Banana 2 Lite. Disabling.`);
      options.groundingType = 'none';
    }
  }

  // ... proceed with native size computations and payload composition ...
}
4.2 Changes in src/index.ts
Tool Parameter Schema Adjustment
Modify the Zod validator structure governing the generate_image endpoint configuration:

TypeScript
const GenerateImageParams = z.object({
  prompt: z.string().describe('Text description of the image asset to generate'),
  
  // Update model validation to accept 'Lite3.1'
  model: z.enum(['Flash3.1', 'Lite3.1', 'Flash2.5', 'Pro3', 'flash', 'pro']).default('Flash3.1')
    .describe('Model tier to execute image synthesis. Choose "Lite3.1" for high-speed, cost-efficient draft iterations. Choose "Flash3.1" or "Pro3" for high-fidelity production assets.'),
  
  width: z.number().int().positive().default(512),
  height: z.number().int().positive().default(512),
  
  // ... remaining parameter validations ...
});
5. Verification & Testing Matrix
To guarantee robustness post-refactoring, execute the following local CLI validations using the MCP tool execution interface:

Happy Path Smoke Test (Lite3.1 + 1K):

Payload: { "prompt": "A retro pixel art character", "model": "Lite3.1", "width": 1024, "height": 1024 }

Expected Behavior: Successful image return; processing time should fall significantly below baseline Flash3.1 thresholds.

Resolution Fallback Interception:

Payload: { "prompt": "Minimalist UI icon", "model": "Lite3.1", "width": 2048, "height": 2048 }

Expected Behavior: Server outputs an interception log statement to standard error (stderr), downscales generation parameters to 1K, and responds successfully with a resized image.

Grounding Prevention Safeguard:

Payload: { "prompt": "Current sports car concept", "model": "Lite3.1", "groundingType": "search" }

Expected Behavior: Server silently disables grounding, records a constraint warning, and proceeds with the default generative pathway.

Transparency Integrity Validation:

Payload: { "prompt": "A modern standard sword game asset", "model": "Lite3.1", "transparent": true }

Expected Behavior: Background is accurately coated with the chroma-key color and successfully extracted by the local canvas engine without runtime exceptions.