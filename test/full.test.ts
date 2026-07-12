
import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { callToolAndParse, closeMcpClient, createMcpClient } from './helpers/mcp-client.js';
import { ensureReferenceImage } from './helpers/fixtures.js';
import { fallbackDir, outputDir } from './helpers/paths.js';

const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
const unwritablePath = process.env.MCP_TEST_UNWRITABLE_PATH;
const hasFallbackPath = Boolean(unwritablePath && path.isAbsolute(unwritablePath));

describe('mcp-alphabanana full', () => {
  let handle: Awaited<ReturnType<typeof createMcpClient>> | null = null;
  let connectionError: Error | null = null;

  beforeAll(async () => {
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(fallbackDir, { recursive: true });
    try {
      handle = await createMcpClient(20000); // 20 second timeout
    } catch (error) {
      connectionError = error instanceof Error ? error : new Error(String(error));
      console.error('Failed to connect to MCP server:', connectionError.message);
    }
  });

  afterAll(async () => {
    if (handle) {
      await closeMcpClient(handle);
      handle = null;
    }
  });

  test('MCP server connection is established', async () => {
    if (connectionError) {
      console.error('Connection error details:', connectionError);
      throw new Error(`Failed to connect to MCP server: ${connectionError.message}`);
    }

    expect(handle).toBeTruthy();
    expect(handle?.client).toBeTruthy();

    const tools = await handle!.client.listTools();
    expect(tools).toBeTruthy();
    expect(tools.tools).toBeInstanceOf(Array);
    expect(tools.tools.length).toBeGreaterThan(0);

    const generateTool = tools.tools.find((t) => t.name === 'generate_image');
    expect(generateTool).toBeTruthy();
    expect(generateTool?.name).toBe('generate_image');
  });

  test.runIf(hasApiKey)('base64-only output returns inline data', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A flat red square icon with a white border.',
        model: 'flash',
        outputFileName: 'full_base64',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: base64-only output returns inline data',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.filePath).toBeUndefined();
  });

  test.runIf(hasApiKey)('combine output returns file and base64', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A minimal green triangle with a simple outline.',
        model: 'flash',
        outputFileName: 'full_combine',
        outputType: 'combine',
        outputWidth: 48,
        outputHeight: 48,
        output_format: 'png',
        outputPath: outputDir,
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: combine output returns file and base64',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.filePath).toBeTruthy();
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');

    const stat = await fs.stat(parsed.filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test.runIf(hasApiKey)('jpg transparency adds warning', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple yellow star with a solid background.',
        model: 'flash',
        outputFileName: 'full_jpg',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'jpg',
        transparent: true,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: jpg transparency adds warning',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain('Transparency is ignored for JPG output');
  });

  test.runIf(hasApiKey)('pro 4K source generates output', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple mountain silhouette with a gradient sky.',
        model: 'pro',
        output_resolution: '4K',
        outputFileName: 'full_pro_4k',
        outputType: 'base64',
        outputWidth: 64,
        outputHeight: 64,
        output_format: 'png',
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: pro 4K source generates output',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
  });

  test.runIf(hasApiKey)('relative outputPath returns an error', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A placeholder icon for validation.',
        model: 'flash',
        outputFileName: 'full_relative',
        outputType: 'file',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        outputPath: '.\\relative',
      },
    };

    await expect(callToolAndParse(handle.client, request, {
      testName: 'full: relative outputPath returns an error',
    })).rejects.toThrow(/outputPath must be an absolute path/);
  });

  test.runIf(hasApiKey)('reference image paths are accepted', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const referencePath = await ensureReferenceImage();

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'Create an original tiny banana icon using the reference image only as loose inspiration for the blue color palette. Do not reproduce the reference image composition.',
        model: 'flash',
        outputFileName: 'full_reference',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        referenceImages: [
          {
            description: 'Tiny sample image',
            filePath: referencePath,
          },
        ],
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: reference image paths are accepted',
    });
    expect(parsed.success).toBe(true);
  });

  test.runIf(hasApiKey)('Lite3.1 basic image generation', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple orange circle on a white background.',
        model: 'Lite3.1',
        outputFileName: 'full_lite_basic',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: Lite3.1 basic image generation',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
  });

  test.runIf(hasApiKey)('Lite3.1 forces 1K resolution when 2K requested', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple blue square icon.',
        model: 'Lite3.1',
        output_resolution: '2K',
        outputFileName: 'full_lite_2k_override',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        transparent: false,
        include_metadata: true,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: Lite3.1 forces 1K resolution when 2K requested',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    // The output is resized to 32x32 regardless of source resolution,
    // but the generation should succeed without error despite 2K being
    // overridden to 1K internally.
    expect(parsed.width).toBe(32);
    expect(parsed.height).toBe(32);
  });

  test.runIf(hasApiKey)('Lite3.1 blocks grounding even when requested', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple green triangle outline.',
        model: 'Lite3.1',
        outputFileName: 'full_lite_grounding',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        transparent: false,
        grounding_type: 'text',
        include_metadata: true,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: Lite3.1 blocks grounding even when requested',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.metadata).toBeTruthy();
    // Lite3.1 does not support grounding, so effectiveGrounding must be 'none'
    // even though grounding_type: 'text' was requested.
    expect(parsed.metadata.effectiveGrounding).toBe('none');
  });

  test.runIf(hasApiKey)('Lite3.1 noresize mode returns 1K native dimensions', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A simple purple star icon on a white background.',
        model: 'Lite3.1',
        outputFileName: 'full_lite_native',
        outputType: 'base64',
        noresize: true,
        aspectRatio: '1:1',
        output_resolution: '1K',
        output_format: 'png',
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: Lite3.1 noresize mode returns 1K native dimensions',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
    // 1K 1:1 native dimensions are 1024x1024
    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(1024);
  });

  test.runIf(Boolean(hasFallbackPath && hasApiKey))('fallback write path is used on failure', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A gray circle used for fallback testing.',
        model: 'flash',
        outputFileName: 'full_fallback',
        outputType: 'file',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        outputPath: unwritablePath,
        transparent: false,
      },
    };

    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'full: fallback write path is used on failure',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.warning).toContain('Requested path not writable');
    expect(parsed.filePath).toContain('fallback');
  });

  test.runIf(!hasApiKey)('skips when GEMINI_API_KEY is missing', () => {
    expect(true).toBe(true);
  });
});
