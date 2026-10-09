import fs from 'fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { getGeminiNativeSize } from '../src/utils/aspect-ratio.js';
import { callToolAndParse, closeMcpClient, createMcpClient } from './helpers/mcp-client.js';
import { outputDir } from './helpers/paths.js';

const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

describe('mcp-alphabanana sanity', () => {
  let handle: Awaited<ReturnType<typeof createMcpClient>> | null = null;
  let connectionError: Error | null = null;

  beforeAll(async () => {
    await fs.mkdir(outputDir, { recursive: true });
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

  test('native Gemini size lookup matches square 1K output', () => {
    expect(getGeminiNativeSize('1:1', '1K')).toEqual({ width: 1024, height: 1024 });
  });

  test('tool schema exposes canonical models, aliases, and the default model', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const tools = await handle.client.listTools();
    const generateTool = tools.tools.find((t) => t.name === 'generate_image');
    const modelSchema = (generateTool?.inputSchema as any)?.properties?.model;

    expect(Array.isArray(modelSchema?.enum)).toBe(true);
    expect(modelSchema.enum).toEqual(
      expect.arrayContaining(['NanoBanana2.1', 'Flash3.1', 'Lite3.1', 'Flash2.5', 'Pro3', 'flash', 'pro'])
    );
    expect(modelSchema.default).toBe('NanoBanana2.1');

    const thinkingSchema = (generateTool?.inputSchema as any)?.properties?.thinking_mode;
    expect(thinkingSchema?.enum).toEqual(['minimal', 'medium', 'high']);
    expect(thinkingSchema?.default).toBe('medium');
  });


  test.runIf(hasApiKey)('Flash2.5 legacy model still generates', async () => {
    if (!handle) throw new Error('MCP client not initialized');
    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A tiny pixel art blue berry game icon, centered on a plain light gray background.',
        model: 'Flash2.5',
        outputFileName: 'sanity_flash25_legacy',
        outputType: 'base64',
        outputWidth: 32,
        outputHeight: 32,
        output_resolution: '1K',
        output_format: 'png',
        transparent: false,
      },
    };
    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'sanity: Flash2.5 legacy model still generates',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.base64).toBeTruthy();
    expect(parsed.mimeType).toBe('image/png');
  });

  test.runIf(hasApiKey)('default model (NanoBanana2.1) minimal image generation', async () => {
    if (!handle) throw new Error('MCP client not initialized');
    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A tiny pixel art red apple game icon with a single green leaf, centered on a plain light gray background.',
        // `model` omitted on purpose: exercises the configured default model.
        outputFileName: 'sanity_icon',
        outputType: 'file',
        outputWidth: 32,
        outputHeight: 32,
        output_format: 'png',
        outputPath: outputDir,
        transparent: false,
      },
    };
    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'sanity: default model (NanoBanana2.1) minimal image generation',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.mimeType || parsed.format).toBe('image/png');
    expect(parsed.width).toBe(32);
    expect(parsed.height).toBe(32);
    expect(parsed.filePath).toBeTruthy();
    const stat = await fs.stat(parsed.filePath);
    expect(stat.size).toBeGreaterThan(0);
  });

  test.runIf(hasApiKey)('noresize mode returns Gemini native dimensions', async () => {
    if (!handle) throw new Error('MCP client not initialized');
    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A tiny banana mascot app icon on a clean background.',
        outputFileName: 'sanity_native_icon',
        outputType: 'base64',
        noresize: true,
        aspectRatio: '1:1',
        output_resolution: '1K',
        output_format: 'png',
        transparent: false,
      },
    };
    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'sanity: noresize mode returns Gemini native dimensions',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.mimeType || parsed.format).toBe('image/png');
    expect(parsed.width).toBe(1024);
    expect(parsed.height).toBe(1024);
    expect(parsed.base64).toBeTruthy();
  });

  test.runIf(!hasApiKey)('skips when GEMINI_API_KEY is missing', () => {
    expect(true).toBe(true);
  });
});
