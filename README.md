# mcp-alphabanana

English | [日本語](README.ja.md)

A Model Context Protocol (MCP) server for generating image assets using Google Gemini AI.

Built with [FastMCP 3](https://www.npmjs.com/package/fastmcp) for a simplified codebase and flexible output options.

## Features

- **General-purpose image generation** using Google Gemini AI
- **Transparent PNG output** via color-key post-processing
- **Multiple output formats**: file, base64, or both
- **Reference image support** for style guidance
- **Flexible resize modes**: crop, stretch, letterbox, contain
- **Multiple model tiers**: flash (Gemini 2.5 Flash) or pro (Gemini 3 Pro)

## Installation

```bash
npm install
npm run build
```

## Configuration

Configure the `GEMINI_API_KEY` in your MCP configuration (e.g. `mcp.json`). Some agent environments cannot access OS environment variables, so you can either reference an OS environment variable from `mcp.json` or provide the key directly in `mcp.json`.

Examples:

- Reference an OS environment variable from `mcp.json`:

```json
{
  "env": {
    "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"
  }
}
```

- Provide the key directly in `mcp.json` (useful when the agent cannot access OS env vars):

```json
{
  "env": {
    "GEMINI_API_KEY": "your_api_key_here"
  }
}
```

Use whichever method suits your deployment — prefer environment references when possible, but include the key directly when agent constraints require it.

## VS Code Integration

Add to your VS Code settings (`.vscode/settings.json` or user settings), configuring the server `env` in `mcp.json` or via the VS Code MCP settings. You can reference an OS environment variable or put the key directly:

```json
{
  "mcp": {
    "servers": {
      "mcp-alphabanana": {
        "type": "stdio",
        "command": "node",
        "args": ["c:/path/to/mcp-alphabanana/dist/index.js"],
        "env": {
          "GEMINI_API_KEY": "${env:GEMINI_API_KEY}"  // or "your_api_key_here"
        }
      }
    }
  }
}
```

**Optional:** Set a custom fallback directory for write failures by adding `MCP_FALLBACK_OUTPUT` to the `env` object.

## Antigravity (mcp_config.json)

Antigravity uses a global `mcp_config.json` to register MCP servers. Example `mcp_config.json`:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "node",
      "args": ["C:/path/to/mcp-alphabanana/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Note: In this repository we used an `mcp_config.json` with the `mcp-alphabanana` entry (Antigravity) and confirmed the server started and generated images successfully.

## Claude Desktop

If you run MCP servers via Claude Desktop, add an entry in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-alphabanana": {
      "command": "node",
      "args": ["C:/path/to/mcp-alphabanana/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

Tested: Adding the above entry in Claude Desktop and starting the server launched the MCP server and image generation worked.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API Key. Configure in `mcp.json` either by referencing an OS environment variable (`${env:GEMINI_API_KEY}`) or by including the key directly (some agents cannot access OS env vars). |
| `MCP_FALLBACK_OUTPUT` | No | Fallback directory for write failures (default: `<install-dir>/fallback-output`) |

### Output Path Best Practices

**Always use absolute paths for `outputPath`:**

✅ **Good:** "C:/Users/you/project/assets", "/home/user/images"  
❌ **Bad:** `"./"`, `"output/"`, `"../images"`

Relative paths are resolved from the MCP server's working directory (unpredictable when running as a service), leading to unexpected file locations.

**Fallback behavior:**
- If the requested `outputPath` is writable → image saved there as usual
- If not writable (permission denied, etc.) → saves to fallback directory with `warning` in response
- Fallback directory: `MCP_FALLBACK_OUTPUT` env var, or `<install-dir>/fallback-output` by default
- If fallback also fails → returns error

## Development

```bash
# Development mode with MCP CLI
npm run dev

# MCP Inspector (Web UI)
npm run inspect

# Build for production
npm run build
```

## Tool: generate_image

Generate image assets using Gemini AI with optional transparency and reference images.

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | *required* | Description of the image to generate |
| `outputFileName` | string | *required* | Output filename (extension auto-added if missing) |
| `outputType` | enum | `combine` | Output format: `file`, `base64`, or `combine` |
| `modelTier` | enum | *required* | Model: `flash` (Gemini 2.5 Flash, max 3 refs) or `pro` (Gemini 3 Pro, max 14 refs) |
| `sourceResolution` | enum | `1K` | Gemini source resolution: `1K`, `2K`, or `4K` (2K/4K pro-only) |
| `outputWidth` | number | `1024` | Output width in pixels (8-4096) |
| `outputHeight` | number | `1024` | Output height in pixels (8-4096) |
| `outputFormat` | enum | `png` | Output format: `png` or `jpg` |
| `outputPath` | string | *optional* | Absolute output directory path (required when saving files) |
| `transparent` | boolean | `false` | Request transparent background (PNG only) |
| `transparentColor` | string | `null` | Color to make transparent (e.g., `#FF00FF`), defaults to `#FF00FF` when null |
| `colorTolerance` | number | `30` | Tolerance for transparent color matching (0-255) |
| `fringeMode` | enum | `auto` | Fringe reduction mode: `auto`, `crisp`, `hd` (auto uses `crisp` <= 128px, otherwise `hd`) |
| `resizeMode` | enum | `crop` | Resize mode: `crop`, `stretch`, `letterbox`, or `contain` |
| `referenceImages` | array | `[]` | Reference images for style guidance (file paths) |
| `debug` | boolean | `false` | Debug mode: output intermediate images |

### Usage Examples

#### Basic Generation

```json
{
  "prompt": "A pixel art treasure chest, golden trim, wooden texture",
  "modelTier": "flash",
  "outputFileName": "chest",
  "outputWidth": 64,
  "outputHeight": 64,
  "transparent": true
}
```

#### Transparency + Fringe Control

```json
{
  "prompt": "Anime-style girl riding a bicycle",
  "modelTier": "flash",
  "outputFileName": "bicycle_girl",
  "outputWidth": 1024,
  "outputHeight": 576,
  "transparent": true,
  "colorTolerance": 30,
  "fringeMode": "crisp"
}
```

#### High-Resolution Background

```json
{
  "prompt": "Fantasy forest at twilight with glowing mushrooms",
  "outputFileName": "forest_bg",
  "modelTier": "pro",
  "sourceResolution": "4K",
  "outputWidth": 3840,
  "outputHeight": 2160,
  "outputFormat": "jpg",
  "outputPath": "C:/Users/you/project/assets/backgrounds"
}
```

#### With Reference Image

```json
{
  "prompt": "A matching treasure chest, open state, same pixel art style",
  "modelTier": "flash",
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

## Output Types

| Type | Saves File | Returns Base64 | MCP Image Content |
|------|-----------|----------------|-------------------|
| `file` | ✓ | ✗ | ✗ |
| `base64` | ✗ | ✓ | ✓ |
| `combine` | ✓ | ✓ | ✓ |

## Transparency Processing

The server selects the background color by histogram analysis and hue proximity to the requested key color, then applies RGB-distance keying and despill. If no histogram candidate qualifies, it falls back to the closest-hue corner color.

### Model Notes

- Flash is sufficient for transparent PNG output in typical use.
- `colorTolerance` around 30 performed best in tests; higher values can increase false positives.

### Recommended Background Colors

| Color | Hex | Best For |
|-------|-----|----------|
| Magenta | `#FF00FF` | Most sprites (default, works with both models) |
| Green | `#00FF00` | Purple/pink objects |
| Cyan | `#00FFFF` | Red/orange objects |
| Blue | `#0000FF` | Yellow/green objects |

### Examples

**Flash model (recommended for transparent PNG):**
```json
{
  "modelTier": "flash",
  "transparent": true,
  "transparentColor": "#FF00FF",
  "colorTolerance": 30
}
```

### Fringe Mode Guidance

- Use `crisp` when thin lines risk being removed (pixel art, bicycle spokes, wire meshes).
- Use `hd` for general high-resolution images where fringe is noticeable.
- Use `auto` for a size-based default (`crisp` for <= 128px, `hd` otherwise).

## License

MIT
