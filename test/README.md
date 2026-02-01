# Tests

## Goals

- Run MCP integration tests by spawning the FastMCP CLI and calling the MCP tool over stdio.
- Support low-cost sanity checks and a fuller test suite.

## Levels

### Sanity

- Runs a minimal image generation call with small dimensions.
- Intended for quick confirmation with minimal API usage.

Run:

```bash
npm run test
# or
npm run test:sanity
```

### Full

- Exercises base64-only, file output, combine output, JPG transparency warning, relative outputPath error, reference images.
- Optional fallback-write test if `MCP_TEST_UNWRITABLE_PATH` is provided.

Run:

```bash
npm run test:full
```

## Environment Variables

- `GEMINI_API_KEY` (required for real API calls)
- `MCP_TEST_UNWRITABLE_PATH` (optional): absolute path that is expected to be unwritable

## Output

- Files are written under `test/output`.
- Fallback writes are forced into `test/output/fallback` via `MCP_FALLBACK_OUTPUT`.
