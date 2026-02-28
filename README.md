# mcp-alphabanana

English | [日本語](README.ja.md)

A Model Context Protocol (MCP) server for generating image assets using Google Gemini AI (Gemini 3.1 Flash/Nano Banana 2 supported).

Built with [FastMCP 3](https://www.npmjs.com/package/fastmcp) for a simplified codebase and flexible output options.

## Features

- **Ultra-fast image generation** (Gemini 3.1 Flash, 0.5K/1K/2K/4K)
- **Advanced multi-image reasoning** (up to 14 reference images)
- **Thinking/Grounding support** (Flash3.1 only)
- **Transparent PNG/WebP output** (color-key post-processing, despill)
- **Multiple output formats**: file, base64, or both
- **Flexible resize modes**: crop, stretch, letterbox, contain
- **Multiple model tiers**: Flash3.1, Flash2.5, Pro3, legacy aliases

## Installation

Add `@tasopen/mcp-alphabanana` to your MCP Servers configuration.

## Configuration

Configure the `GEMINI_API_KEY` in your MCP configuration (e.g. `mcp.json`).

Examples:

- Reference an OS environment variable from `mcp.json`:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- Provide the key directly in `mcp.json`:

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

## VS Code Integration

Add to your VS Code settings (`.vscode/settings.json` or user settings), configuring the server `env` in `mcp.json` or via the VS Code MCP settings.

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "command": "npx",
        "args":["-y", "@tasopen/mcp-alphabanana"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"  // or "your_api_key_here"
        }
      }
    }
  }
}
```

**Optional:** Set a custom fallback directory for write failures by adding `MCP_FALLBACK_OUTPUT` to the `env` object.

## Model Selection & Parameters

| Input Model ID | Internal Model ID | Description |
| --- | --- | --- |
| `Flash3.1` | `gemini-3.1-flash-image-preview` | Ultra-fast, supports Thinking/Grounding. |
| `Flash2.5` | `gemini-2.5-flash-image` | Legacy Flash. High stability. Low cost. |
| `Pro3` | `gemini-3.0-pro-image-preview` | High-fidelity Pro model. |
| `flash` | `gemini-3.1-flash-image-preview` | Alias for backward compatibility. |
| `pro` | `gemini-3.0-pro-image-preview` | Alias for backward compatibility. |

### Parameters (v2.0)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | *required* | Description of the image to generate |
| `model` | enum | `Flash3.1` | Model: `Flash3.1`, `Flash2.5`, `Pro3`, `flash`, `pro` |
| `output_resolution` | enum | `1K` | `0.5K`, `1K`, `2K`, `4K` (0.5K/2K/4K: Flash3.1 only) |
| `output_format` | enum | `png` | `png`, `jpg`, `webp` (WebP: alpha supported) |
| `transparent` | boolean | `false` | Transparent background (PNG/WebP only) |
| `grounding_type` | enum | `none` | `none`, `text`, `image`, `both` (Flash3.1 only) |
| `thinking_mode` | enum | `minimal` | `minimal`, `high` (Flash3.1 only) |
| `include_thoughts` | boolean | `false` | Return model's "thoughts" (Flash3.1 only) |
| `reference_images` | array | `[]` | Up to 14 (Flash3.1/Pro3), 3 (Flash2.5) |

---

## Usage Examples

#### Basic Generation

```json
{
  "prompt": "A pixel art treasure chest, golden trim, wooden texture",
  "model": "Flash3.1",
  "outputFileName": "chest",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

#### Advanced (WebP, thinking, grounding)

```json
{
  "prompt": "A photorealistic girl with wings flying over a European countryside",
  "model": "Flash3.1",
  "outputFileName": "girl_wings",
  "outputWidth": 632,
  "outputHeight": 424,
  "output_format": "webp",
  "thinking_mode": "high",
  "grounding_type": "both",
  "include_thoughts": true
}
```

#### With Reference Images

```json
{
  "prompt": "A matching treasure chest, open state, same pixel art style as references",
  "model": "Pro3",
  "outputFileName": "chest_open",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true,
  "reference_images": [
    {
      "description": "Closed chest for style reference",
      "data": "...base64..."
    }
  ]
}
```

---

## Transparency & Output Formats

- **PNG**: Full alpha, color-key + despill
- **WebP**: Full alpha, better compression (Flash3.1+)
- **JPEG**: No transparency (falls back to solid background)

---

## Development

```bash
# Development mode with MCP CLI
npm run dev


# MCP Inspector (Web UI)
npm run inspect

# Build for production
npm run build
```

## License

MIT

