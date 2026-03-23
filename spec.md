---
title: "mcp-alphabanana Specification"
version: "1.4.3"
license: "MIT"
node_compatibility: ">=18"
---

# mcp-alphabanana Specification (v1.4.3, Nano Banana 2/Gemini 3.1 Flash Image)

## 1. Overview

mcp-alphabanana is a Model Context Protocol server for generating image assets using Google Gemini AI, supporting ultra-fast 0.5K drafting, improved multi-image reasoning, thinking processes, grounding search, and an extended transparency pipeline (WebP supported).

**This version is re-implemented with [FastMCP 3](https://www.npmjs.com/package/fastmcp)**, resulting in a significantly simplified codebase and flexible output format options.

---

## Version History

| Version | Date | Highlights |
|---|---|---|
| 1.4.3 | 2026-03-24 | Bump version to prepare a rebuilt MCPB bundle (repackage with updated artifacts). |
| 1.4.2 | 2026-03-22 | Reduce npm package size by excluding image assets; improve cross-platform `.mcpb` bundling; add logo icon to README. |

## 2. Model Specifications & Compatibility

To ensure a smooth transition for existing MCP clients (GitHub Copilot, Claude Desktop, etc.), a mapping layer is implemented.

| Input Model ID | Internal Model ID | Description |
| --- | --- | --- |
| `Flash3.1` | `gemini-3.1-flash-image-preview` | Ultra-fast, supports Thinking/Grounding. |
| `Flash2.5` | `gemini-2.5-flash-image` | Legacy Flash. High stability. Low cost. Have Free Tier.|
| `Pro3` | `gemini-3.0-pro-image-preview` | High-fidelity Pro model. |
| `flash` | `gemini-3.1-flash-image-preview` | Alias for backward compatibility. |
| `pro` | `gemini-3.0-pro-image-preview` | Alias for backward compatibility. |

---

## 3. Image Generation Parameters (API Alignment)

Parameters are aligned with the [Official Gemini Image Generation Documentation](https://ai.google.dev/gemini-api/docs/image-generation) where possible.

### 3.1 Resolution & Aspect Ratio

The server uses a **Table-Driven Selection** logic to match the requested dimensions to valid Gemini API tiers.

* **Source Resolution (`output_resolution`):**
* `0.5K`: Max side ~512px. (Optimized for drafting).
* `1K`: Max side ~1024px (Default).
* `2K`, `4K`: High-resolution tiers.

* **New Aspect Ratios (Flash 3.1 exclusive):**
* Standard: `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `21:9`.
* Extended: `1:4`, `4:1`, `1:8`, `8:1`.

**Auto-Selection Example:**
If a user requests `1000x240`:

1. Calculate Ratio: $1000 / 240 \approx 4.16$.
2. Match Table: Closest is `4:1`.
3. Set Tier: If not specified, defaults to `0.5K` (512px long side) for speed.

```typescript
// aspect-ratio.ts
export const SUPPORTED_ASPECT_RATIOS = {
  '1:1': 1.0,
  '2:3': 0.667, '3:2': 1.5,
  '3:4': 0.75,  '4:3': 1.333,
  '4:5': 0.8,   '5:4': 1.25,
  '9:16': 0.5625, '16:9': 1.778,
  '21:9': 2.333,
  // --- Extreme aspect ratio added from Flash 3.1 (Nano Banana 2) ---
  '1:4': 0.25,  '4:1': 4.0,
  '1:8': 0.125, '8:1': 8.0,
} as const;

**Aspect Ratio Mapping Table**

| Ratio | Numeric | Closest Gemini Tier (default) | Notes |
|---:|---:|---|---|
| 1:1 | 1.00 | 0.5K (512 px) | Icons and square assets |
| 16:9 | 1.778 | 1K | Standard wide format |
| 4:1 | 4.00 | 0.5K | Ultra-wide/panoramic; Flash 3.1 supported |
| 1:4 | 0.25 | 0.5K | Tall banner; Flash 3.1 supported |
```

### 3.2 Advanced Features

* **Thinking Mode (`thinking_mode`):**
* `minimal` (default): Standard generation.
* `high`: Enables deeper reasoning for complex prompts.

* **Thought Summaries (`include_thoughts`):**
* `false` (default): Returns only the image.
* `true`: Returns the model's internal "thoughts" as text metadata (if supported by client).

* **Grounding Type (`grounding_type`):**
* `none` (default).
* `text`: Enables `Google Search_retrieval`.
* `image`: Enables `google_image_search_retrieval`.
* `both`: Enables both search tools.

---

### 3.3 Additional Parameters (implementation parity)

The server exposes additional parameters that are present in the implementation and should be considered part of the stable tool schema.

| Parameter | Type | Default | Description |
|---|---:|---|---|
| `debug` | boolean | `false` | When `true`, intermediate artifacts (raw Gemini images, masks, debug JSON) are written to the `outputPath` (must be absolute) and/or a configured fallback directory. |
| `colorTolerance` | integer (0-255) | `30` | Color-key tolerance for transparency extraction; lower values are stricter. |
| `fringeMode` | enum (`auto` | `crisp` | `hd`) | `auto` | Controls fringe reduction at alpha edges during mask post-processing. |
| `resizeMode` | enum (`crop` | `stretch` | `letterbox` | `contain`) | `crop` | How the generated image is fitted to `outputWidth`/`outputHeight`. |
| `outputCompression` | integer (0-100) | `85` | Quality for `webp`/`jpg` outputs (higher = better quality). |
| `include_metadata` | boolean | `false` | When `true` include grounding and reasoning metadata in the JSON output. |
| `outputType` | enum (`file` | `base64` | `combine`) | `combine` | Output delivery mode; when `file` or `combine` an absolute `outputPath` is required. |

## 4. Enhanced Transparency Pipeline

The "Alpha Banana" core (background removal) is expanded to support WebP.

* **Transparency Formats:**
* **PNG**: Fully supported (Color-keying + Despill).
* **WebP**: **New.** Supports alpha channel with better compression.
* **JPEG**: Supported but **no transparency** (falls back to solid background).

* **Implementation:**
The `sharp` pipeline will handle the format conversion *after* the alpha mask is applied.

---

### Transparency Pipeline Details

The post-processing pipeline applied after receiving the raw Gemini image is as follows:

1. Alpha Mask Extraction — if Gemini returns an alpha channel or mask, the pipeline extracts it as the primary mask. If not, color-key extraction is attempted using `transparentColor`.
2. Despill and Color‑Key — apply `transparentColor` with `colorTolerance` to remove uniform backgrounds and reduce color spill onto foreground subjects.
3. Fringe Reduction — apply `fringeMode` to smooth or harden edges as requested (`auto`, `crisp`, `hd`).
4. Format Encoding — convert to the requested `output_format` (`png`, `webp`, `jpg`) applying `outputCompression` when relevant.
5. Debug Artifacts — when `debug=true`, save intermediate files (e.g. `<outputFileName>_debug_raw.png`, `<outputFileName>_debug_mask.png`) to `outputPath`. If writing to `outputPath` fails, a fallback directory configured via `MCP_FALLBACK_OUTPUT` is used.

## 5. Multi-Image Reference Strategy

Flash 3.1 supports up to **14 reference images**. The server will automatically index these to allow LLMs to give specific instructions.

* **Indexing Logic:** Images are passed to the API with internal tags like `input_file_0` through `input_file_13`.
* **Instruction Example:**
> "Generate a character that looks like **Image 0** but wears the uniform from **Image 1**."

---

### Reference Image Validation Rules

- Count: 0–14 for Flash3.1 / Pro3; 0–3 for Flash2.5.
- MIME Types: `image/png`, `image/jpeg`, `image/webp`.
- Size Limit: 5 MiB per file (server-side enforced).
- Path Requirements: `referenceImages` passed as local file paths must be readable by the process; in CLI contexts they should be absolute or resolved relative to the working directory.
- Indexing: Files are bound to `input_file_0` … `input_file_N` in the order provided; prompts can reference these tags.

## 6. MCP Tool Schema (Summary)

```typescript
{
  name: "generate_image",
  parameters: {
    prompt: z.string(),
    model: z.enum(["Flash3.1", "Flash2.5", "Pro3", "flash", "pro"]).default("Flash3.1"),
    output_resolution: z.enum(["0.5K", "1K", "2K", "4K"]).default("1K"),
    output_format: z.enum(["png", "jpg", "webp"]).default("png"),
    transparent: z.boolean().default(false),
    grounding_type: z.enum(["none", "text", "image", "both"]).default("none"),
    thinking_mode: z.enum(["minimal", "high"]).default("minimal"),
    include_thoughts: z.boolean().default(false),
    reference_images: z.array(z.object({
      data: z.string(), // base64 or local file path (implementation may accept file paths)
      description: z.string().optional(),
      filePath: z.string().optional()
    })).max(14).optional(),
    debug: z.boolean().default(false),
    colorTolerance: z.number().int().min(0).max(255).default(30),
    fringeMode: z.enum(["auto","crisp","hd"]).default("auto"),
    resizeMode: z.enum(["crop","stretch","letterbox","contain"]).default("crop"),
    outputCompression: z.number().int().min(0).max(100).default(85),
    include_metadata: z.boolean().default(false),
    outputType: z.enum(["file","base64","combine"]).default("combine"),
  }
}
```

---

## 7. Constraints & Model Feature Matrix

block unsupported parameters per model.
3.1 only features: thinking_mode, include_thoughts, grounding_type
3.1 extended aspect ratio: 1:4, 4:1, 1:8, 8:1
3.1 extended resolution: 0.5K, 2K, 4K
3.0 extended resolution: 2K, 4K
3.0 extended max reference images: 14
3.1 extended max reference images: 14
2.5 extended max reference images: 3

---

<!-- CLI examples intentionally omitted from spec; see README.md for user-facing command examples -->

## 8. References

- [FastMCP (npm)](https://www.npmjs.com/package/fastmcp)
- [FastMCP GitHub](https://github.com/punkpeye/fastmcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [qhdrl12/mcp-server-gemini-image-generator](https://github.com/qhdrl12/mcp-server-gemini-image-generator) (Reference implementation)

---

## 9. Error Handling & Retry Policy

Observed implementation behavior:

- The server does not perform automatic retries of Gemini API calls. Calls to the Gemini client are made directly; on failure the tool returns an error to the caller. (See the `generate_image` tool error handler in `src/index.ts`, which inspects the error message for rate-limit indicators and returns a user-facing message.)
- On rate-limit-like errors the server maps the response to a friendly message: `Rate limit exceeded. Please retry after 60 seconds.` This is a user message only; no automatic retry or back-off is performed by the server.
- File write failures for output files are handled with a fallback write attempt: the server attempts to save outputs to `MCP_FALLBACK_OUTPUT` or a local `fallback-output` directory if the requested `outputPath` is not writable. This fallback behavior is implemented in the code.

Notes for implementers:

- A retry/back-off wrapper around `generateWithGemini` is not present but could be added (for example using `p-retry` which appears in the lockfile). If automatic retries are desired, wrap the API call with exponential back-off and respect any `retryAfter` headers returned by the upstream API.
- The current code does basic error classification by examining error text for `429` or `rate limit` and returns a static retry suggestion; for production robustness, prefer parsing structured API error responses when available.

## 10. Testing & CI Integration

- Unit tests: See `test/sanity.test.ts` for basic checks.
- Full pipeline tests: See `test/full.test.ts` for end-to-end generation scenarios.
- Run tests locally: `npm run test` and `npm run test -- --coverage` for coverage.
- Development commands: `npm run dev` (MCP dev server), `npm run inspect` (MCP Inspector UI).

## 11. Contribution & Localization

- Branch naming: `feat/` for features, `fix/` for fixes.
- Linting & formatting: ESLint + Prettier; run `npm run lint`.
- Localization: Keep `README.ja.md` and `spec.md` in sync; when adding user-facing text, provide translations.





