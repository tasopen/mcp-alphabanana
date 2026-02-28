
# mcp-alphabanana Specification (v2.0, Nano Banana 2/Gemini 3.1 Flash Image)

## 1. Overview

mcp-alphabanana is a Model Context Protocol server for generating image assets using Google Gemini AI, supporting ultra-fast 0.5K drafting, improved multi-image reasoning, thinking processes, grounding search, and an extended transparency pipeline (WebP supported).

**This version is re-implemented with [FastMCP 3](https://www.npmjs.com/package/fastmcp)**, resulting in a significantly simplified codebase and flexible output format options.

---

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

## 4. Enhanced Transparency Pipeline

The "Alpha Banana" core (background removal) is expanded to support WebP.

* **Transparency Formats:**
* **PNG**: Fully supported (Color-keying + Despill).
* **WebP**: **New.** Supports alpha channel with better compression.
* **JPEG**: Supported but **no transparency** (falls back to solid background).

* **Implementation:**
The `sharp` pipeline will handle the format conversion *after* the alpha mask is applied.

---

## 5. Multi-Image Reference Strategy

Flash 3.1 supports up to **14 reference images**. The server will automatically index these to allow LLMs to give specific instructions.

* **Indexing Logic:** Images are passed to the API with internal tags like `input_file_0` through `input_file_13`.
* **Instruction Example:**
> "Generate a character that looks like **Image 0** but wears the uniform from **Image 1**."

---

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
      data: z.string(), // base64
      description: z.string().optional()
    })).max(14).optional(),
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

## 8. References

- [FastMCP (npm)](https://www.npmjs.com/package/fastmcp)
- [FastMCP GitHub](https://github.com/punkpeye/fastmcp)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Gemini Image Generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [qhdrl12/mcp-server-gemini-image-generator](https://github.com/qhdrl12/mcp-server-gemini-image-generator) (Reference implementation)




