import fs from 'fs/promises';
import path from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { closeMcpClient, createMcpClient, parseToolResult } from './helpers/mcp-client.js';
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

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A flat red square icon with a white border.',
        modelTier: 'flash',
        outputFileName: 'full_base64',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        outputFormat: 'png',
        transparent: false,
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
    expect(parsed.filePath).toBeUndefined();
  });

  test.runIf(hasApiKey)('combine output returns file and base64', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A minimal green triangle with a simple outline.',
        modelTier: 'flash',
        outputFileName: 'full_combine',
        outputType: 'combine',
        outputWidth: 48,
        outputHeight: 48,
        outputFormat: 'png',
        outputPath: outputDir,
        transparent: false,
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.filePath).toBeTruthy();
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');

    const stat = await fs.stat(parsed.filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test.runIf(hasApiKey)('jpg transparency adds warning', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A simple yellow star with a solid background.',
        modelTier: 'flash',
        outputFileName: 'full_jpg',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        outputFormat: 'jpg',
        transparent: true,
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain('Transparency is ignored for JPG output');
  });

  test.runIf(hasApiKey)('pro 4K source generates output', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A simple mountain silhouette with a gradient sky.',
        modelTier: 'pro',
        sourceResolution: '4K',
        outputFileName: 'full_pro_4k',
        outputType: 'base64',
        outputWidth: 64,
        outputHeight: 64,
        outputFormat: 'png',
        transparent: false,
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
  });

  test.runIf(hasApiKey)('relative outputPath returns an error', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A placeholder icon for validation.',
        modelTier: 'flash',
        outputFileName: 'full_relative',
        outputType: 'file',
        outputWidth: 32,
        outputHeight: 32,
        outputFormat: 'png',
        outputPath: '.\\relative',
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain('outputPath must be an absolute path');
  });

  test.runIf(hasApiKey)('reference image paths are accepted', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const referencePath = await ensureReferenceImage();

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'Match the style of the reference image.',
        modelTier: 'flash',
        outputFileName: 'full_reference',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        outputFormat: 'png',
        referenceImages: [
          {
            description: 'Tiny sample image',
            filePath: referencePath,
          },
        ],
      },
    });

    const parsed = parseToolResult(result);
    if (!parsed.success) {
      console.error('Reference image test failed:', parsed.message);
    }
    expect(parsed.success).toBe(true);
  });

  test.runIf(Boolean(hasFallbackPath && hasApiKey))('fallback write path is used on failure', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A gray circle used for fallback testing.',
        modelTier: 'flash',
        outputFileName: 'full_fallback',
        outputType: 'file',
        outputWidth: 32,
        outputHeight: 32,
        outputFormat: 'png',
        outputPath: unwritablePath,
        transparent: false,
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);
    expect(parsed.warning).toContain('Requested path not writable');
    expect(parsed.filePath).toContain('fallback');
  });

  test.runIf(!hasApiKey)('skips when GEMINI_API_KEY is missing', () => {
    expect(true).toBe(true);
  });
});
