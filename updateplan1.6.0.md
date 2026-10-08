# mcp-alphabanana v1.6.0 Implementation Specification

## 1. Overview

This specification defines the implementation changes for `mcp-alphabanana` v1.6.0.

The release focuses on migrating the default image generation model to Google Nano Banana 2.1 while maintaining compatibility with existing users where practical.

### Goals

1. Add support for `gemini-nano-banana-2.1`.
2. Make `NanoBanana2.1` the default model.
3. Change the `flash` alias to use Nano Banana 2.1.
4. Remove unsupported `0.5K` output resolution.
5. Deprecate `Flash3.1`.
6. Block `Flash3.1` after Google's announced shutdown date.
7. Preserve the existing transparency post-processing implementation.
8. Establish a single source of truth for model configuration.
9. Update tests and documentation.

AI-based transparency improvements are **not part of v1.6.0**.

---

# 2. Target Version

```text
Current version: 1.5.1
Target version:  1.6.0
```

The version is bumped to `1.6.0` because the default model and supported resolution set change.

---

# 3. Background

Google released Nano Banana 2.1 on October 6, 2026.

Official model ID:

```text
gemini-nano-banana-2.1
```

Nano Banana 2.1 provides improvements in:

* Image quality
* Prompt adherence
* Character consistency
* Text rendering
* Reference-image handling

Supported output resolutions:

```text
1K
2K
4K
```

Nano Banana 2.1 supports up to 14 reference images.

Google has announced the shutdown of:

```text
gemini-3.1-flash-image
```

on:

```text
2026-10-29
```

The recommended replacement is:

```text
gemini-nano-banana-2.1
```

---

# 4. Design Principles

## 4.1 Single Source of Truth

Model-related configuration must have one authoritative source in the implementation.

The following information must not be independently redefined across multiple source files:

* Public model names
* Google model IDs
* Default model
* Aliases
* Deprecation status
* Shutdown dates
* Model capabilities
* Supported resolutions
* Reference-image limits

Recommended location:

```text
src/config/model-config.ts
```

All model selection, validation, and schema generation should consume this configuration.

Conceptually:

```text
                 model-config.ts
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       Schema       Resolver     Validation
          │            │            │
          └────────────┼────────────┘
                       ↓
                  Gemini API
```

The purpose is to prevent configuration drift.

For example, the following must not happen:

```text
Source code:  NanoBanana2.1 is default
README:      Flash3.1 is default
Tests:       Flash2.5 is default
```

---

# 5. Central Model Configuration

Create or extend a centralized model configuration.

Conceptual structure:

```typescript
// src/config/model-config.ts

export const MODEL_CONFIG = {
  NanoBanana21: {
    publicName: "NanoBanana2.1",
    modelId: "gemini-nano-banana-2.1",
    status: "stable",
    default: true,
    supportedResolutions: ["1K", "2K", "4K"],
    maxReferenceImages: 14,
  },

  Flash31: {
    publicName: "Flash3.1",
    modelId: "gemini-3.1-flash-image",
    status: "deprecated",
    shutdownDate: "2026-10-29",
  },

  // Existing models...
} as const;
```

The exact TypeScript structure may be adapted to the existing project architecture.

The important requirement is that model metadata is defined only once.

---

# 6. Canonical Models

The canonical public model list is defined by `MODEL_CONFIG`.

Expected models after v1.6.0:

| Public Model    | Google Model ID               | Status     |
| --------------- | ----------------------------- | ---------- |
| `NanoBanana2.1` | `gemini-nano-banana-2.1`      | Default    |
| `Flash3.1`      | `gemini-3.1-flash-image`      | Deprecated |
| `Lite3.1`       | `gemini-3.1-flash-lite-image` | Supported  |
| `Flash2.5`      | Existing mapping              | Supported  |
| `Pro3`          | `gemini-3-pro-image`          | Supported  |

Existing supported models should remain available unless explicitly changed by this specification.

No second hard-coded model table should be introduced.

---

# 7. Model Aliases

Aliases should be defined in the same model configuration system.

Conceptually:

```typescript
export const MODEL_ALIASES = {
  flash: "NanoBanana21",
  pro: "Pro3",
} as const;
```

The `flash` alias must therefore resolve as:

```text
flash
  ↓
NanoBanana2.1
  ↓
gemini-nano-banana-2.1
```

Do not maintain a separate alias-to-Google-model-ID mapping.

---

# 8. Default Model

The default model must become:

```text
NanoBanana2.1
```

The default should be derived from the centralized model configuration.

Avoid maintaining an independent value such as:

```typescript
const DEFAULT_MODEL = "NanoBanana2.1";
```

unless it is derived directly from `MODEL_CONFIG`.

The goal is to ensure there is only one source of truth.

---

# 9. Flash3.1 Deprecation

`Flash3.1` remains recognized in v1.6.0.

This is intentional. Existing users specifying `Flash3.1` should receive a meaningful migration warning instead of an unknown-model error.

Its lifecycle information must come from `MODEL_CONFIG`.

Before shutdown:

```text
Flash3.1 requested
       ↓
MODEL_CONFIG
       ↓
status = deprecated
       ↓
Warning
       ↓
API request allowed
```

Recommended warning:

```text
Flash3.1 (gemini-3.1-flash-image) is deprecated.
Google has announced its shutdown for October 29, 2026.
Please migrate to NanoBanana2.1.
```

---

# 10. Flash3.1 Shutdown

The shutdown date is:

```text
2026-10-29
```

This date must be defined only once in the model configuration.

Do not duplicate the date across:

* Model resolver
* Validation logic
* Tests
* Constants in unrelated modules

After the shutdown date:

```text
Flash3.1 requested
       ↓
MODEL_CONFIG
       ↓
shutdown date reached
       ↓
Reject request
       ↓
No Gemini API request
```

Recommended error:

```text
Flash3.1 (gemini-3.1-flash-image) is no longer supported.
Google shut down this model on October 29, 2026.
Please use NanoBanana2.1 instead.
```

The server must not make an API request for Flash3.1 after the shutdown date.

---

# 11. Output Resolution

Nano Banana 2.1 supports:

```text
1K
2K
4K
```

The existing:

```text
0.5K
```

option must be removed.

### Before

```text
0.5K
1K
2K
4K
```

### After

```text
1K
2K
4K
```

The supported resolution list should originate from the model configuration.

---

# 12. `0.5K` Validation

`0.5K` must not be silently converted to `1K`.

An explicit validation error should be returned.

Example:

```text
Invalid output_resolution: 0.5K.
Supported resolutions are 1K, 2K, and 4K.
```

The supported-resolution list in the error should be derived from the same configuration used by validation.

---

# 13. Model Capabilities

Model-specific capabilities should be represented in the centralized configuration where appropriate.

Examples include:

* Supported resolutions
* Maximum reference images
* Thinking support
* Grounding support
* Other model-specific API capabilities

Avoid scattered checks such as:

```typescript
if (model === "Flash3.1") {
  ...
}
```

throughout the implementation.

Prefer resolving the model configuration first and using its capabilities.

This keeps model migration localized.

---

# 14. Transparency

Nano Banana 2.1 does not provide native transparent output through the current image-generation interface.

The existing `transparent` functionality must remain unchanged in v1.6.0.

Architecture:

```text
Image generation
      ↓
Generated image
      ↓
Existing transparency post-processing
      ↓
PNG / WebP with alpha
```

No new transparency algorithm is introduced.

Documentation should clearly distinguish:

```text
Native model transparency
```

from:

```text
mcp-alphabanana local transparency post-processing
```

Recommended wording:

> Nano Banana 2.1 does not provide native transparent output. When `transparent=true` is specified, mcp-alphabanana applies local post-processing to generate an alpha channel.

---

# 15. Thinking Mode

Nano Banana 2.1 supports:

```text
minimal
medium
high
```

The existing MCP behavior should be preserved where possible.

No new thinking-mode architecture is required for v1.6.0.

If model-specific thinking capabilities need to be represented, they should be defined through the centralized model configuration rather than duplicated in validation code.

---

# 16. Reference Images

Nano Banana 2.1 supports up to:

```text
14 reference images
```

The limit should be defined in the model configuration:

```typescript
maxReferenceImages: 14
```

Validation should consume this value.

No independent hard-coded `14` should be introduced in the validation layer.

---

# 17. Grounding

Existing grounding functionality should be reviewed against the current Google GenAI SDK.

If the existing implementation is compatible with Nano Banana 2.1, retain it.

No grounding redesign is required for v1.6.0.

Any model-specific grounding capability should be represented in the centralized model configuration.

---

# 18. SDK Dependency

Review the current dependency:

```json
"@google/genai": "^2.11.0"
```

Confirm that the SDK supports:

```text
gemini-nano-banana-2.1
```

If a newer SDK version is required, update it as part of v1.6.0.

Test the SDK update for regressions in:

* Image generation
* Reference images
* Grounding
* Thinking
* Image output
* Error handling

---

# 19. Model Resolution Flow

All model selection must follow a single resolution path:

```text
User model parameter
        ↓
Resolve alias
        ↓
Resolve canonical model
        ↓
Read MODEL_CONFIG
        ↓
Validate lifecycle
        ↓
Validate capabilities
        ↓
Resolve Google model ID
        ↓
Generate image
```

Example:

```text
"flash"
   ↓
"NanoBanana2.1"
   ↓
MODEL_CONFIG.NanoBanana21
   ↓
"gemini-nano-banana-2.1"
```

This ensures aliases, model IDs, lifecycle information, and capabilities are resolved consistently.

---

# 20. MCP Tool Schema

The MCP tool schema should derive the model list from the canonical model configuration.

Do not maintain a manually synchronized model list.

Conceptually:

```typescript
const modelNames = getPublicModelNames(MODEL_CONFIG);
```

The schema should expose:

```text
NanoBanana2.1
Flash3.1
Lite3.1
Flash2.5
Pro3
flash
pro
```

`Flash3.1` remains exposed temporarily so users receive the appropriate deprecation/shutdown message.

---

# 21. Tests

Tests must verify the behavior of the centralized configuration and model-resolution system.

## 21.1 Model Mapping

Verify:

```text
NanoBanana2.1
    ↓
gemini-nano-banana-2.1
```

## 21.2 Default Model

Verify that the configured default resolves to:

```text
NanoBanana2.1
```

## 21.3 Alias

Verify:

```text
flash
    ↓
NanoBanana2.1
```

## 21.4 Flash3.1 Before Shutdown

Using an injectable clock or date abstraction:

```text
2026-10-28
    ↓
Warning
    ↓
API request allowed
```

## 21.5 Flash3.1 On Shutdown Date

```text
2026-10-29
    ↓
Error
    ↓
No API request
```

## 21.6 Flash3.1 After Shutdown

```text
2026-10-30
    ↓
Error
    ↓
No API request
```

Tests should obtain the shutdown date from the same configuration used by production code.

Do not create independent test constants containing the shutdown date.

---

# 22. Resolution Tests

Valid:

```text
1K
2K
4K
```

Invalid:

```text
0.5K
```

Tests should use the canonical model configuration when practical rather than maintaining another independent list of supported resolutions.

---

# 23. Transparency Tests

Verify that:

```text
transparent=false
```

does not invoke transparency processing.

Verify that:

```text
transparent=true
```

continues to invoke the existing transparency post-processing pipeline.

No new transparency algorithm is required.

---

# 24. Documentation Updates

Review and update:

```text
README.md
README.ja.md
CHANGELOG.md
spec.md
```

Search the entire repository for obsolete or contradictory references:

```text
Flash3.1
gemini-3.1-flash-image
0.5K
output_resolution
default model
flash
```

Documentation should reflect the canonical implementation configuration.

---

# 25. Documentation Consistency

Documentation is user-facing and may necessarily repeat model information.

The following information must remain consistent with the implementation:

```text
NanoBanana2.1
gemini-nano-banana-2.1
Flash3.1
gemini-3.1-flash-image
October 29, 2026
1K / 2K / 4K
14 reference images
```

The source code must have a single authoritative configuration.

Documentation should not introduce an alternative model definition.

If practical, model tables and supported-value documentation may be generated from the canonical configuration to reduce maintenance overhead.

---

# 26. Changelog

Add a v1.6.0 entry:

```markdown
## [1.6.0] - 2026-10-XX

### Added

- Added support for Google Nano Banana 2.1 (`gemini-nano-banana-2.1`).
- Added NanoBanana2.1 as the default image generation model.

### Changed

- Changed the `flash` alias to use Nano Banana 2.1.
- Removed `0.5K` from supported output resolutions.
- Supported resolutions are now 1K, 2K, and 4K.

### Deprecated

- Deprecated `Flash3.1` (`gemini-3.1-flash-image`).
- Flash3.1 will no longer be available after October 29, 2026.

### Transparency

- Kept the existing local transparency post-processing.
- No native transparency implementation was added in this release.
```

The actual release date should be filled in when v1.6.0 is released.

---

# 27. Backward Compatibility

| Existing usage               | v1.6.0 behavior             |
| ---------------------------- | --------------------------- |
| No model specified           | Uses `NanoBanana2.1`        |
| `flash`                      | Resolves to `NanoBanana2.1` |
| `Flash3.1` before 2026-10-29 | Warning + request allowed   |
| `Flash3.1` from 2026-10-29   | Request rejected            |
| `0.5K`                       | Rejected                    |
| `1K`                         | Supported                   |
| `2K`                         | Supported                   |
| `4K`                         | Supported                   |

---

# 28. Recommended Implementation Structure

Recommended structure:

```text
src/
├── config/
│   └── model-config.ts
├── ...
├── model-resolver.ts
├── validation/
│   └── ...
└── ...
```

The exact directory structure can follow the existing repository conventions.

The key requirement is that `model-config.ts` is the single source of truth.

```text
                 ┌─────────────────────┐
                 │   model-config.ts   │
                 │                     │
                 │ Models              │
                 │ Aliases             │
                 │ Default             │
                 │ Lifecycle           │
                 │ Capabilities        │
                 │ Resolutions         │
                 └──────────┬──────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ↓                 ↓                 ↓
      MCP schema       Model resolver     Validation
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ↓
                       Gemini API
```

No parallel model-definition system should be introduced.

---

# 29. Release Checklist

## Configuration

* [ ] Create or extend the centralized model configuration
* [ ] Add `NanoBanana2.1`
* [ ] Add `gemini-nano-banana-2.1`
* [ ] Set NanoBanana2.1 as the default
* [ ] Change `flash` alias
* [ ] Mark Flash3.1 as deprecated
* [ ] Define Flash3.1 shutdown date once
* [ ] Define supported resolutions once
* [ ] Define reference-image limits once
* [ ] Define applicable model capabilities once

## Implementation

* [ ] Update model resolver
* [ ] Update MCP schema
* [ ] Update lifecycle validation
* [ ] Remove `0.5K`
* [ ] Preserve transparency processing
* [ ] Review thinking-mode compatibility
* [ ] Review grounding compatibility
* [ ] Verify SDK compatibility

## Tests

* [ ] Model mapping
* [ ] Default model
* [ ] Alias resolution
* [ ] Flash3.1 pre-shutdown behavior
* [ ] Flash3.1 shutdown behavior
* [ ] Resolution validation
* [ ] Transparency
* [ ] Reference images
* [ ] Existing model regression tests

## Documentation

* [ ] README.md
* [ ] README.ja.md
* [ ] CHANGELOG.md
* [ ] spec.md
* [ ] Search for obsolete model names
* [ ] Search for obsolete resolution values
* [ ] Search for obsolete default-model descriptions

## Release

* [ ] Update package version to `1.6.0`
* [ ] Update lockfile if required
* [ ] Build
* [ ] Run lint
* [ ] Run tests
* [ ] Test actual Nano Banana 2.1 generation
* [ ] Test transparency
* [ ] Publish npm package
* [ ] Create GitHub release

---

# 30. Final Design

The central model migration is:

```text
Flash3.1
    ↓
NanoBanana2.1
```

The v1.6.0 implementation treats model information as configuration rather than scattering model-specific logic throughout the codebase.

The key architectural rule is:

> **Define model identity, aliases, lifecycle, capabilities, and supported values once, then derive model resolution, schema, and validation behavior from that definition.**

The resulting architecture is:

```text
                 MODEL_CONFIG
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
     Schema       Resolver      Validation
       │             │             │
       └─────────────┼─────────────┘
                     ↓
                Gemini API
```

Nano Banana 2.1 becomes the default model, `flash` follows the new default, Flash3.1 receives a controlled migration path until October 29, 2026, and `0.5K` is removed.

The existing transparency post-processing remains unchanged.
