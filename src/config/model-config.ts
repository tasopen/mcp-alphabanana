/**
 * Central model configuration — the SINGLE SOURCE OF TRUTH for mcp-alphabanana.
 *
 * Everything model-related is defined here exactly once:
 *   - public model names
 *   - Google model IDs
 *   - the default model
 *   - aliases
 *   - lifecycle (status / shutdown date)
 *   - capabilities (supported resolutions, reference-image limits, thinking, grounding)
 *   - supported output resolutions
 *
 * Model selection, validation, and MCP schema generation all consume this file
 * (see `src/model-resolver.ts`, `src/index.ts`, `src/utils/gemini-client.ts`).
 *
 * v1.6.0: NanoBanana2.1 (`gemini-nano-banana-2.1`) is the default model,
 * `flash` resolves to it, Flash3.1 is deprecated (shutdown 2026-10-29),
 * and `0.5K` output resolution has been removed.
 */

/** Canonical supported output resolutions (v1.6.0: `0.5K` removed). */
export const SUPPORTED_RESOLUTIONS = ['1K', '2K', '4K'] as const;
export type ResolutionKey = (typeof SUPPORTED_RESOLUTIONS)[number];

export type ModelStatus = 'stable' | 'deprecated';

/** Thinking levels accepted across models (v1.6.0: `medium` added for NanoBanana2.1). */
export const THINKING_LEVELS = ['minimal', 'medium', 'high'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ModelCapabilities {
  /** Output resolutions the model accepts (used for validation and clamping). */
  supportedResolutions: readonly ResolutionKey[];
  /** Maximum number of reference images accepted by the model. */
  maxReferenceImages: number;
  /** Whether the model supports Gemini thinking configuration. */
  thinking: boolean;
  /** Thinking levels accepted by the model (empty when `thinking` is false). */
  thinkingLevels: readonly ThinkingLevel[];
  /** The model's own default thinking level (present when `thinking` is true). */
  defaultThinkingLevel?: ThinkingLevel;
  /** Whether the model supports search grounding tools. */
  grounding: boolean;
}

export interface ModelDefinition {
  /** Google Gemini model ID sent to the API. */
  readonly modelId: string;
  /** Lifecycle status. */
  readonly status: ModelStatus;
  /** Marks the single default model. */
  readonly default?: boolean;
  /** ISO date (YYYY-MM-DD) from which Google no longer serves the model. */
  readonly shutdownDate?: string;
  /** Model-specific capabilities. */
  readonly capabilities: ModelCapabilities;
}

/**
 * Canonical model table. The object key IS the public model name exposed
 * through the MCP schema (e.g. `MODEL_CONFIG['NanoBanana2.1']`).
 */
export const MODEL_CONFIG = {
  'NanoBanana2.1': {
    modelId: 'gemini-nano-banana-2.1',
    status: 'stable',
    default: true,
    capabilities: {
      supportedResolutions: SUPPORTED_RESOLUTIONS,
      maxReferenceImages: 14,
      thinking: true,
      thinkingLevels: ['minimal', 'medium', 'high'],
      defaultThinkingLevel: 'medium',
      grounding: true,
    },
  },
  'Flash3.1': {
    modelId: 'gemini-3.1-flash-image',
    status: 'deprecated',
    shutdownDate: '2026-10-29',
    capabilities: {
      supportedResolutions: SUPPORTED_RESOLUTIONS,
      maxReferenceImages: 14,
      thinking: true,
      thinkingLevels: ['minimal', 'high'],
      defaultThinkingLevel: 'minimal',
      grounding: true,
    },
  },
  'Lite3.1': {
    modelId: 'gemini-3.1-flash-lite-image',
    status: 'stable',
    capabilities: {
      supportedResolutions: ['1K'],
      maxReferenceImages: 14,
      thinking: false,
      thinkingLevels: [],
      grounding: false,
    },
  },
  'Flash2.5': {
    modelId: 'gemini-2.5-flash-image',
    status: 'stable',
    capabilities: {
      supportedResolutions: ['1K'],
      maxReferenceImages: 3,
      thinking: false,
      thinkingLevels: [],
      grounding: false,
    },
  },
  'Pro3': {
    modelId: 'gemini-3-pro-image',
    status: 'stable',
    capabilities: {
      supportedResolutions: SUPPORTED_RESOLUTIONS,
      maxReferenceImages: 14,
      thinking: true,
      thinkingLevels: ['minimal', 'high'],
      defaultThinkingLevel: 'minimal',
      grounding: true,
    },
  },
} as const satisfies Record<string, ModelDefinition>;

export type PublicModelName = keyof typeof MODEL_CONFIG;

/** Public alias → canonical model key. Resolved through `resolveModelKey`. */
export const MODEL_ALIASES = {
  flash: 'NanoBanana2.1',
  pro: 'Pro3',
} as const satisfies Record<string, PublicModelName>;

export type ModelAlias = keyof typeof MODEL_ALIASES;

/** Any value accepted for the `model` parameter (canonical names + aliases). */
export type ModelInput = PublicModelName | ModelAlias;

/** Canonical public model names, in declaration order. */
export const PUBLIC_MODEL_NAMES = Object.keys(MODEL_CONFIG) as PublicModelName[];

/** Public aliases, in declaration order. */
export const MODEL_ALIAS_NAMES = Object.keys(MODEL_ALIASES) as ModelAlias[];

/** All values accepted by the MCP `model` parameter (names + aliases). */
export const MODEL_ENUM_VALUES = [
  ...PUBLIC_MODEL_NAMES,
  ...MODEL_ALIAS_NAMES,
] as [ModelInput, ...ModelInput[]];

/** The default model, derived from `MODEL_CONFIG` (never hard-coded). */
export const DEFAULT_MODEL: PublicModelName = (() => {
  const entry = Object.entries(MODEL_CONFIG).find(
    ([, definition]) => (definition as ModelDefinition).default === true
  );
  if (!entry) {
    throw new Error('MODEL_CONFIG must mark exactly one model as default.');
  }
  return entry[0] as PublicModelName;
})();

/**
 * Default thinking level, derived from the default model's capabilities.
 * NanoBanana2.1's model default is `medium` (Google documentation).
 */
export const DEFAULT_THINKING_LEVEL: ThinkingLevel =
  (MODEL_CONFIG[DEFAULT_MODEL].capabilities as ModelCapabilities).defaultThinkingLevel ?? 'minimal';

/** True when `value` is a canonical public model name. */
export function isPublicModelName(value: string): value is PublicModelName {
  return (PUBLIC_MODEL_NAMES as readonly string[]).includes(value);
}

/** True when `value` is a known alias. */
export function isModelAlias(value: string): value is ModelAlias {
  return (MODEL_ALIAS_NAMES as readonly string[]).includes(value);
}

/**
 * Resolve an alias or canonical name to the canonical model key.
 * Returns `undefined` for unknown models.
 *
 *   "flash" → "NanoBanana2.1" → MODEL_CONFIG["NanoBanana2.1"] → "gemini-nano-banana-2.1"
 */
export function resolveModelKey(input: string): PublicModelName | undefined {
  if (isPublicModelName(input)) return input;
  if (isModelAlias(input)) return MODEL_ALIASES[input];
  return undefined;
}

/** Look up the canonical definition for a model key. */
export function getModelDefinition(key: PublicModelName): ModelDefinition {
  return MODEL_CONFIG[key];
}

/** Resolve a model key to the Google model ID. */
export function getGoogleModelId(key: PublicModelName): string {
  return MODEL_CONFIG[key].modelId;
}

/** True when the resolution is supported in v1.6.0 (i.e. not `0.5K`). */
export function isResolutionSupported(resolution: string): resolution is ResolutionKey {
  return (SUPPORTED_RESOLUTIONS as readonly string[]).includes(resolution);
}

/** Human-readable list of resolutions, e.g. `1K, 2K, and 4K`. */
export function formatResolutionList(
  resolutions: readonly ResolutionKey[] = SUPPORTED_RESOLUTIONS
): string {
  if (resolutions.length === 0) return '';
  if (resolutions.length === 1) return resolutions[0];
  if (resolutions.length === 2) return `${resolutions[0]} and ${resolutions[1]}`;
  return `${resolutions.slice(0, -1).join(', ')}, and ${resolutions[resolutions.length - 1]}`;
}

/** Largest reference-image limit across all models (used for schema validation). */
export function getMaxReferenceImages(): number {
  return PUBLIC_MODEL_NAMES.reduce(
    (max, key) => Math.max(max, MODEL_CONFIG[key].capabilities.maxReferenceImages),
    0
  );
}

/**
 * Clamp a requested thinking level to one the model supports.
 * Unsupported levels fall back to the model's own default level.
 */
export function clampThinkingLevelToModel(
  level: ThinkingLevel,
  capabilities: ModelCapabilities
): ThinkingLevel {
  if (capabilities.thinkingLevels.includes(level)) return level;
  return (
    capabilities.defaultThinkingLevel ??
    capabilities.thinkingLevels[0] ??
    level
  );
}

/**
 * Clamp a resolution to the closest value supported by the given model.
 * Nearest canonical rank wins; ties resolve to the lower resolution.
 */
export function clampResolutionToModel(
  resolution: ResolutionKey,
  supported: readonly ResolutionKey[]
): ResolutionKey {
  if (supported.length === 0) return resolution;
  if (supported.includes(resolution)) return resolution;

  const rank = (value: ResolutionKey) => SUPPORTED_RESOLUTIONS.indexOf(value);
  const target = rank(resolution);
  let best = supported[0];
  let bestDistance = Math.abs(rank(best) - target);
  for (const candidate of supported.slice(1)) {
    const distance = Math.abs(rank(candidate) - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format an ISO `YYYY-MM-DD` date as e.g. `October 29, 2026`. */
export function formatShutdownDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

/** Human-readable list of every value accepted by the `model` parameter. */
export function formatModelList(): string {
  return [...PUBLIC_MODEL_NAMES, ...MODEL_ALIAS_NAMES].join(', ');
}

/** Deprecation warning for a model with `status: 'deprecated'`. */
export function buildDeprecationWarning(name: string, definition: ModelDefinition): string {
  const shutdown = definition.shutdownDate
    ? `Google has announced its shutdown for ${formatShutdownDate(definition.shutdownDate)}.`
    : 'Google has announced its shutdown.';
  const replacement = DEFAULT_MODEL;
  return `${name} (${definition.modelId}) is deprecated.\n${shutdown}\nPlease migrate to ${replacement}.`;
}

/** Error message used once the shutdown date has been reached. */
export function buildShutdownError(name: string, definition: ModelDefinition): string {
  const shutdown = definition.shutdownDate
    ? `Google shut down this model on ${formatShutdownDate(definition.shutdownDate)}.`
    : 'Google shut down this model.';
  const replacement = DEFAULT_MODEL;
  return `${name} (${definition.modelId}) is no longer supported.\n${shutdown}\nPlease use ${replacement} instead.`;
}
