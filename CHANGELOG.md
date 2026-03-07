# Changelog

## 1.3.5 (2026-03-11)
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
