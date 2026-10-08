/**
 * Model resolver — the single resolution path for model selection.
 *
 *   User model parameter
 *           ↓
 *     Resolve alias
 *           ↓
 *     Resolve canonical model
 *           ↓
 *     Read MODEL_CONFIG
 *           ↓
 *     Validate lifecycle (deprecation warning / shutdown rejection)
 *           ↓
 *     { key, config, googleModelId, warning? }
 *
 * The clock is injectable (`now`) so shutdown behaviour can be tested
 * without depending on the real system date.
 */

import {
  MODEL_CONFIG,
  buildDeprecationWarning,
  buildShutdownError,
  formatModelList,
  resolveModelKey,
  type ModelDefinition,
  type ModelInput,
  type PublicModelName,
} from './config/model-config.js';

export interface ResolvedModel {
  ok: true;
  key: PublicModelName;
  config: ModelDefinition;
  googleModelId: string;
  /** Migration warning to surface to the user (deprecated models only). */
  warning?: string;
}

export interface ModelResolutionError {
  ok: false;
  error: string;
}

export type ModelResolution = ResolvedModel | ModelResolutionError;

/**
 * True when the model may no longer be used.
 * The shutdown date itself is already blocked (inclusive).
 */
export function isShutdownReached(shutdownDate: string, now: Date): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shutdownDate);
  if (!match) {
    throw new Error(`Invalid shutdown date in MODEL_CONFIG: "${shutdownDate}" (expected YYYY-MM-DD)`);
  }
  const [, year, month, day] = match;
  const cutoff = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return today >= cutoff;
}

/**
 * Resolve a model parameter (canonical name or alias) to its configuration,
 * validating lifecycle state against `now` (defaults to the current date).
 *
 * - deprecated model before shutdown → `{ ok: true, warning }` (request allowed)
 * - model on/after its shutdown date  → `{ ok: false, error }` (no API request)
 * - unknown model                     → `{ ok: false, error }`
 */
export function resolveModel(input: ModelInput | string, now: Date = new Date()): ModelResolution {
  const key = resolveModelKey(input);
  if (!key) {
    return {
      ok: false,
      error: `Unknown model: "${input}". Supported models: ${formatModelList()}.`,
    };
  }

  const config: ModelDefinition = MODEL_CONFIG[key];

  if (config.shutdownDate && isShutdownReached(config.shutdownDate, now)) {
    return { ok: false, error: buildShutdownError(key, config) };
  }

  const warning =
    config.status === 'deprecated' ? buildDeprecationWarning(key, config) : undefined;

  return {
    ok: true,
    key,
    config,
    googleModelId: config.modelId,
    warning,
  };
}

/** `resolveModel` that throws instead of returning `{ ok: false }`. */
export function resolveModelOrThrow(input: ModelInput | string, now: Date = new Date()): ResolvedModel {
  const resolution = resolveModel(input, now);
  if (!resolution.ok) {
    throw new Error(resolution.error);
  }
  return resolution;
}
