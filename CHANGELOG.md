# Changelog

## 1.5.1 (2026-07-12)
- Pro3 model: fall back from 0.5K to 1K resolution when 0.5K is requested (Pro3 does not support 0.5K)
- Migrate full test suite from deprecated Flash2.5 to Flash3.1 as the primary model; keep one Flash2.5 sanity test for legacy compatibility

## 1.5.0 (2026-07-12)
- Support 'Gemini 3.1 Flash Lite Image' model
- Add support for 'Gemini 3.1 Flash Lite Image' model. short name 'Lite'
- Update model name from preview to release for avoiding depreciation
- Update full test to support lite model
- Update dependencies

## 1.4.3 (2026-03-24)
- Prepare for MCPB rebuild: bump package version to 1.4.3 and repackage updated artifacts for release.
- Ensure optional platform `sharp` binaries are included in the bundle and verify fallback assets.

## 1.4.2 (2026-03-22)
- Reduce npm package size from 3.6 MB to ~130 KB by excluding image assets from the package and replacing relative image paths in README with GitHub raw URLs.
- Fix cross-platform `.mcpb` bundle: install all `sharp` platform binaries (`win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-arm64`) before packing in CI so the bundle works on all platforms.
- Add logo icon to README header.

## 1.4.1 (2026-03-22)
- Improve Windows reliability for `.mcpb` installs by bundling platform-specific optional `sharp` runtime packages instead of depending on postinstall hooks.
- Improve Claude Desktop usability by steering larger image generations toward `outputType=file` and documenting FileSystem-assisted absolute paths on Windows.

## 1.4.0 (2026-03-22)
- Add `noresize=true` native-size output mode so callers can specify `aspectRatio` plus `output_resolution` without also providing pixel dimensions.
- Update README image references to the new `images/` layout, including demo and sample output assets.
- Expand `manifest.json` for MCPB 0.3 metadata, registry-facing links, static icon packaging, screenshots, and Claude-friendly `user_config` for `GEMINI_API_KEY`.
- Resize the packaged Claude registry icon at `images/mcp-alphabanana.png` to 512x512.
- Include `manifest.json`, `glama.json`, and the `images/` directory in npm package contents.
- Validate the MCPB manifest during release builds and publish a stable GitHub release asset at `mcp-alphabanana-latest.mcpb`.

## 1.3.6 (2026-03-08)
- Read the FastMCP server version from `package.json` instead of hardcoding it in `src/index.ts`.
- Add `Dockerfile`, `glama.json`, and GitHub release workflow files for Glama inspection and GitHub Releases.
- Extend the release workflow to publish to npm via GitHub Actions OIDC trusted publishing.
- Refresh README content for Glama-oriented publishing and Japanese documentation alignment.

## 1.3.5 (2026-03-07)
- Bump package version to 1.3.5
- Update README header image to animated GIF

## 1.3.4 (2026-03-07)

- Added cross-platform GitHub Actions CI for Ubuntu, macOS, and Windows.
- Added workflow-dispatch API smoke tests using `GEMINI_API_KEY` when configured.
- Improved MCP test diagnostics for tool-call, parse, and API failure cases.
- Updated the sanity smoke prompt for more stable image generation.
- Included the README image asset in the published npm package.


## 1.3.0 (2026-02-28)

* Added support for Gemini 3.1 Flash Image model (`gemini-3.1-flash-image-preview`).
* Ultra-fast 0.5K drafting, improved multi-image reasoning, thinking mode, and grounding search.
* Extended transparency pipeline to support WebP format.
* Version bump to 1.3.0. All references to previous versions updated for consistency.

## 1.2.0 (2026-02-26)

- Added support for npm package distribution and installation.

## 1.1.0 (2026-02-07)

- Improve prompt preservation by documenting "no summarization/translation" guidance in MCP server instructions and tool metadata.
- Update transparency processing docs and recommendations (Flash-friendly defaults, tolerance guidance).
- Revise fringe handling docs to match new `hd` boundary-clear behavior and add usage examples.
- Add transparency debug logging for selected and corner colors.
- Enhance post-processing pipeline (HD boundary clear, crisp guidance) and related tooling.

## 1.0.0

- Initial public release.
