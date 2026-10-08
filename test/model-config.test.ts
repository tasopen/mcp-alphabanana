import { describe, expect, test } from 'vitest';
import {
  DEFAULT_MODEL,
  DEFAULT_THINKING_LEVEL,
  MODEL_ALIASES,
  MODEL_CONFIG,
  MODEL_ENUM_VALUES,
  PUBLIC_MODEL_NAMES,
  SUPPORTED_RESOLUTIONS,
  THINKING_LEVELS,
  clampResolutionToModel,
  clampThinkingLevelToModel,
  formatResolutionList,
  getGoogleModelId,
  getMaxReferenceImages,
  isResolutionSupported,
  resolveModelKey,
  type ModelDefinition,
} from '../src/config/model-config.js';
import { isShutdownReached, resolveModel, resolveModelOrThrow } from '../src/model-resolver.js';

/** One day before the given ISO date (UTC). */
function dayBefore(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

/** One day after the given ISO date (UTC). */
function dayAfter(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

describe('model mapping (MODEL_CONFIG single source of truth)', () => {
  test('NanoBanana2.1 maps to gemini-nano-banana-2.1', () => {
    expect(getGoogleModelId('NanoBanana2.1')).toBe('gemini-nano-banana-2.1');
    expect(resolveModelKey('NanoBanana2.1')).toBe('NanoBanana2.1');
  });

  test('existing model mappings are preserved', () => {
    expect(getGoogleModelId('Flash3.1')).toBe('gemini-3.1-flash-image');
    expect(getGoogleModelId('Lite3.1')).toBe('gemini-3.1-flash-lite-image');
    expect(getGoogleModelId('Flash2.5')).toBe('gemini-2.5-flash-image');
    expect(getGoogleModelId('Pro3')).toBe('gemini-3-pro-image');
  });

  test('canonical model list matches the v1.6.0 lineup', () => {
    expect([...PUBLIC_MODEL_NAMES]).toEqual([
      'NanoBanana2.1',
      'Flash3.1',
      'Lite3.1',
      'Flash2.5',
      'Pro3',
    ]);
  });

  test('MCP enum exposes canonical names and aliases', () => {
    expect([...MODEL_ENUM_VALUES]).toEqual([
      'NanoBanana2.1',
      'Flash3.1',
      'Lite3.1',
      'Flash2.5',
      'Pro3',
      'flash',
      'pro',
    ]);
  });

  test('default model is NanoBanana2.1, derived from MODEL_CONFIG', () => {
    expect(DEFAULT_MODEL).toBe('NanoBanana2.1');
    expect((MODEL_CONFIG[DEFAULT_MODEL] as ModelDefinition).default).toBe(true);
    const defaults = PUBLIC_MODEL_NAMES.filter(
      (name) => (MODEL_CONFIG[name] as ModelDefinition).default === true
    );
    expect(defaults).toEqual(['NanoBanana2.1']);
  });

  test('flash alias resolves to NanoBanana2.1', () => {
    expect(MODEL_ALIASES.flash).toBe('NanoBanana2.1');
    expect(resolveModelKey('flash')).toBe('NanoBanana2.1');

    const resolution = resolveModel('flash');
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.key).toBe('NanoBanana2.1');
      expect(resolution.googleModelId).toBe('gemini-nano-banana-2.1');
    }
  });

  test('pro alias resolves to Pro3', () => {
    expect(resolveModelKey('pro')).toBe('Pro3');
    const resolution = resolveModel('pro');
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.googleModelId).toBe('gemini-3-pro-image');
    }
  });

  test('unknown model is rejected', () => {
    const resolution = resolveModel('not-a-model');
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.error).toContain('Unknown model');
      expect(resolution.error).toContain('NanoBanana2.1');
    }
  });

  test('every model defines capabilities from the central config', () => {
    for (const name of PUBLIC_MODEL_NAMES) {
      const capabilities = MODEL_CONFIG[name].capabilities;
      expect(capabilities.supportedResolutions.length).toBeGreaterThan(0);
      expect(capabilities.maxReferenceImages).toBeGreaterThan(0);
      expect(typeof capabilities.thinking).toBe('boolean');
      expect(typeof capabilities.grounding).toBe('boolean');
    }
  });
});

describe('Flash3.1 lifecycle (injectable clock)', () => {
  // The shutdown date always comes from the production configuration.
  const shutdownDate = MODEL_CONFIG['Flash3.1'].shutdownDate;

  test('Flash3.1 shutdown date is defined once in MODEL_CONFIG', () => {
    expect(shutdownDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MODEL_CONFIG['Flash3.1'].status).toBe('deprecated');
  });

  test('before shutdown: deprecation warning + request allowed', () => {
    const resolution = resolveModel('Flash3.1', dayBefore(shutdownDate!));
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.googleModelId).toBe('gemini-3.1-flash-image');
      expect(resolution.warning).toContain('Flash3.1 (gemini-3.1-flash-image) is deprecated.');
      expect(resolution.warning).toContain('Please migrate to NanoBanana2.1.');
      // The warning must mention the configured shutdown date.
      const [year, month, day] = shutdownDate!.split('-');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      expect(resolution.warning).toContain(
        `${monthNames[Number(month) - 1]} ${Number(day)}, ${year}`
      );
    }
  });

  test('on the shutdown date: rejected (no API request)', () => {
    const onShutdown = new Date(`${shutdownDate}T00:00:00Z`);
    expect(isShutdownReached(shutdownDate!, onShutdown)).toBe(true);

    const resolution = resolveModel('Flash3.1', onShutdown);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.error).toContain('Flash3.1 (gemini-3.1-flash-image) is no longer supported.');
      expect(resolution.error).toContain('Please use NanoBanana2.1 instead.');
    }
    expect(() => resolveModelOrThrow('Flash3.1', onShutdown)).toThrow(/no longer supported/);
  });

  test('after shutdown: rejected (no API request)', () => {
    const resolution = resolveModel('Flash3.1', dayAfter(shutdownDate!));
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) {
      expect(resolution.error).toContain('is no longer supported');
    }
  });

  test('other models are unaffected by the Flash3.1 shutdown', () => {
    const after = dayAfter(shutdownDate!);
    const resolution = resolveModel(DEFAULT_MODEL, after);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.warning).toBeUndefined();
    }
    expect(() => resolveModelOrThrow('Pro3', after)).not.toThrow();
  });

  test('deprecation warning is not produced for stable models', () => {
    const resolution = resolveModel(DEFAULT_MODEL);
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.warning).toBeUndefined();
    }
  });
});

describe('output resolutions', () => {
  test('supported resolutions are 1K, 2K, and 4K', () => {
    expect([...SUPPORTED_RESOLUTIONS]).toEqual(['1K', '2K', '4K']);
    expect(isResolutionSupported('1K')).toBe(true);
    expect(isResolutionSupported('2K')).toBe(true);
    expect(isResolutionSupported('4K')).toBe(true);
    expect(formatResolutionList()).toBe('1K, 2K, and 4K');
  });

  test('0.5K is no longer a supported resolution', () => {
    expect(isResolutionSupported('0.5K')).toBe(false);
  });

  test('no model advertises 0.5K in its capabilities', () => {
    for (const name of PUBLIC_MODEL_NAMES) {
      expect([...MODEL_CONFIG[name].capabilities.supportedResolutions]).not.toContain('0.5K');
    }
  });

  test('clampResolutionToModel picks the nearest supported resolution', () => {
    expect(clampResolutionToModel('1K', SUPPORTED_RESOLUTIONS)).toBe('1K');
    expect(clampResolutionToModel('2K', ['1K'])).toBe('1K');
    expect(clampResolutionToModel('4K', ['1K'])).toBe('1K');
    // Tie in rank distance resolves to the lower resolution.
    expect(clampResolutionToModel('2K', ['1K', '4K'])).toBe('1K');
    expect(clampResolutionToModel('4K', ['1K', '4K'])).toBe('4K');
  });
});

describe('capabilities', () => {
  test('NanoBanana2.1 supports 1K/2K/4K, 14 reference images, thinking and grounding', () => {
    const capabilities = MODEL_CONFIG['NanoBanana2.1'].capabilities;
    expect([...capabilities.supportedResolutions]).toEqual(['1K', '2K', '4K']);
    expect(capabilities.maxReferenceImages).toBe(14);
    expect(capabilities.thinking).toBe(true);
    expect(capabilities.grounding).toBe(true);
  });

  test('reference-image limit used by the schema is the max across models', () => {
    expect(getMaxReferenceImages()).toBe(14);
    expect(MODEL_CONFIG['Flash2.5'].capabilities.maxReferenceImages).toBe(3);
  });

  test('Lite3.1 is 1K-only with no grounding/thinking', () => {
    const capabilities = MODEL_CONFIG['Lite3.1'].capabilities;
    expect([...capabilities.supportedResolutions]).toEqual(['1K']);
    expect(capabilities.grounding).toBe(false);
    expect(capabilities.thinking).toBe(false);
    expect([...capabilities.thinkingLevels]).toEqual([]);
  });
});

describe('thinking levels (v1.6.0: medium added)', () => {
  test('accepted levels are minimal, medium, high', () => {
    expect([...THINKING_LEVELS]).toEqual(['minimal', 'medium', 'high']);
  });

  test('default thinking level is medium, derived from NanoBanana2.1', () => {
    expect(DEFAULT_THINKING_LEVEL).toBe('medium');
    expect(MODEL_CONFIG['NanoBanana2.1'].capabilities.defaultThinkingLevel).toBe('medium');
  });

  test('NanoBanana2.1 supports all three levels', () => {
    const capabilities = MODEL_CONFIG['NanoBanana2.1'].capabilities;
    expect([...capabilities.thinkingLevels]).toEqual(['minimal', 'medium', 'high']);
    expect(capabilities.thinking).toBe(true);
  });

  test('Flash3.1 and Pro3 support minimal/high only', () => {
    expect([...MODEL_CONFIG['Flash3.1'].capabilities.thinkingLevels]).toEqual(['minimal', 'high']);
    expect([...MODEL_CONFIG['Pro3'].capabilities.thinkingLevels]).toEqual(['minimal', 'high']);
    expect(MODEL_CONFIG['Flash3.1'].capabilities.defaultThinkingLevel).toBe('minimal');
    expect(MODEL_CONFIG['Pro3'].capabilities.defaultThinkingLevel).toBe('minimal');
  });

  test('clampThinkingLevelToModel falls back to the model default', () => {
    const nano = MODEL_CONFIG['NanoBanana2.1'].capabilities;
    expect(clampThinkingLevelToModel('medium', nano)).toBe('medium');
    expect(clampThinkingLevelToModel('high', nano)).toBe('high');

    const flash31 = MODEL_CONFIG['Flash3.1'].capabilities;
    // medium is not supported by Flash3.1 → falls back to its own default (minimal)
    expect(clampThinkingLevelToModel('medium', flash31)).toBe('minimal');
    expect(clampThinkingLevelToModel('high', flash31)).toBe('high');
  });

  test('non-thinking models have no thinking levels', () => {
    expect([...MODEL_CONFIG['Lite3.1'].capabilities.thinkingLevels]).toEqual([]);
    expect([...MODEL_CONFIG['Flash2.5'].capabilities.thinkingLevels]).toEqual([]);
  });
});
