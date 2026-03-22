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

  test('native Gemini size lookup matches square 0.5K output', () => {
    expect(getGeminiNativeSize('1:1', '0.5K')).toEqual({ width: 512, height: 512 });
  });


  test.runIf(hasApiKey)('Flash3.1 minimal image generation', async () => {
    if (!handle) throw new Error('MCP client not initialized');
    const request = {
      name: 'generate_image',
      arguments: {
        prompt: 'A tiny pixel art red apple game icon with a single green leaf, centered on a plain light gray background.',
        model: 'Flash3.1',
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
      testName: 'sanity: Flash3.1 minimal image generation',
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
        model: 'Flash3.1',
        outputFileName: 'sanity_native_icon',
        outputType: 'base64',
        noresize: true,
        aspectRatio: '1:1',
        output_resolution: '0.5K',
        output_format: 'png',
        transparent: false,
      },
    };
    const { parsed } = await callToolAndParse(handle.client, request, {
      testName: 'sanity: noresize mode returns Gemini native dimensions',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.mimeType || parsed.format).toBe('image/png');
    expect(parsed.width).toBe(512);
    expect(parsed.height).toBe(512);
    expect(parsed.base64).toBeTruthy();
  });

  test.runIf(!hasApiKey)('skips when GEMINI_API_KEY is missing', () => {
    expect(true).toBe(true);
  });
});
