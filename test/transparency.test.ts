/**
 * Transparency-focused tests for Flash and Pro models.
 * Run individually to control API usage and costs:
 *   npm run test:transparency        - Run all transparency tests
 *   npm run test:transparency:flash  - Run Flash model tests only (tolerance 80)
 *   npm run test:transparency:pro    - Run Pro model tests only (tolerance 40)
 */

import fs from 'fs/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { closeMcpClient, createMcpClient, parseToolResult } from './helpers/mcp-client.js';
import { outputDir } from './helpers/paths.js';

const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
const runFlashTests = process.env.TEST_MODEL !== 'pro';
const runProTests = process.env.TEST_MODEL !== 'flash';

describe('transparency tests', () => {
  let handle: Awaited<ReturnType<typeof createMcpClient>> | null = null;
  let connectionError: Error | null = null;

  beforeAll(async () => {
    await fs.mkdir(outputDir, { recursive: true });
    try {
      handle = await createMcpClient(30000); // 30 second timeout for transparency processing
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
  });

  // Flash model transparency tests
  describe.runIf(hasApiKey && runFlashTests)('flash model transparency', () => {
    test('generates transparent PNG with magenta background (tolerance 80)', async () => {
      if (!handle) throw new Error('MCP client not initialized');

      const result = await handle.client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'A simple red circle, centered, clean edges',
          modelTier: 'flash',
          outputFileName: 'transparency_flash_magenta',
          outputType: 'file',
          outputWidth: 64,
          outputHeight: 64,
          outputFormat: 'png',
          outputPath: outputDir,
          transparent: true,
          colorTolerance: 80,
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.format).toBe('png');
      expect(parsed.filePath).toBeTruthy();

      // Verify file exists and has transparency
      const stat = await fs.stat(parsed.filePath);
      expect(stat.size).toBeGreaterThan(0);

      // Check that image has alpha channel
      const metadata = await sharp(parsed.filePath).metadata();
      expect(metadata.channels).toBe(4); // RGBA
      expect(metadata.hasAlpha).toBe(true);

      // Sample some pixels to verify transparency exists
      const { data } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      
      // Count transparent pixels (alpha = 0)
      let transparentCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentCount++;
      }
      
      // Should have at least some transparent pixels (background)
      expect(transparentCount).toBeGreaterThan(0);
      console.log(`Flash magenta (tolerance 80): ${transparentCount} transparent pixels out of ${pixels.length / 4}`);
    });

    test('saturation/brightness filters prevent gray/black transparency', async () => {
      if (!handle) throw new Error('MCP client not initialized');

      const result = await handle.client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'A white circle with gray and black shading, on magenta background',
          modelTier: 'flash',
          outputFileName: 'transparency_flash_filter',
          outputType: 'file',
          outputWidth: 64,
          outputHeight: 64,
          outputFormat: 'png',
          outputPath: outputDir,
          transparent: true,
          transparentColor: '#FF00FF',
          colorTolerance: 80,
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.success).toBe(true);

      // Verify that grays/blacks in the subject are NOT transparent
      const { data, info } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      
      // Count opaque pixels that are gray/black (low saturation or brightness)
      let opaqueGrayBlackCount = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const a = pixels[i + 3];
        
        // Check if it's gray-ish (similar RGB values) or black-ish (low RGB)
        const isGrayish = Math.abs(r - g) < 30 && Math.abs(g - b) < 30 && Math.abs(r - b) < 30;
        const isDark = Math.max(r, g, b) < 77; // < 30% brightness
        
        if (a > 0 && (isGrayish || isDark)) {
          opaqueGrayBlackCount++;
        }
      }
      
      // Should have opaque gray/black pixels in the subject
      expect(opaqueGrayBlackCount).toBeGreaterThan(0);
      console.log(`Flash filter: ${opaqueGrayBlackCount} opaque gray/black pixels preserved`);
    });
  });

  // Pro model transparency tests
  describe.runIf(hasApiKey && runProTests)('pro model transparency', () => {
    test('generates transparent PNG with magenta background (tolerance 40)', async () => {
      if (!handle) throw new Error('MCP client not initialized');

      const result = await handle.client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'A simple red circle, centered, clean edges',
          modelTier: 'pro',
          outputFileName: 'transparency_pro_magenta',
          outputType: 'file',
          outputWidth: 64,
          outputHeight: 64,
          outputFormat: 'png',
          outputPath: outputDir,
          transparent: true,
          colorTolerance: 40,
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.format).toBe('png');
      expect(parsed.filePath).toBeTruthy();

      // Verify transparency
      const metadata = await sharp(parsed.filePath).metadata();
      expect(metadata.channels).toBe(4);
      expect(metadata.hasAlpha).toBe(true);

      const { data } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      
      let transparentCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentCount++;
      }
      
      expect(transparentCount).toBeGreaterThan(0);
      console.log(`Pro magenta (tolerance 40): ${transparentCount} transparent pixels out of ${pixels.length / 4}`);
    });

    test('generates transparent PNG with green background (tolerance 40)', async () => {
      if (!handle) throw new Error('MCP client not initialized');

      const result = await handle.client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'A simple blue square, centered, sharp edges',
          modelTier: 'pro',
          outputFileName: 'transparency_pro_green',
          outputType: 'file',
          outputWidth: 64,
          outputHeight: 64,
          outputFormat: 'png',
          outputPath: outputDir,
          transparent: true,
          transparentColor: '#00FF00',
          colorTolerance: 40,
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.format).toBe('png');

      const metadata = await sharp(parsed.filePath).metadata();
      expect(metadata.hasAlpha).toBe(true);

      const { data } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      
      let transparentCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentCount++;
      }
      
      expect(transparentCount).toBeGreaterThan(0);
      console.log(`Pro green (tolerance 40): ${transparentCount} transparent pixels out of ${pixels.length / 4}`);
    });

    test('2K resolution with transparency', async () => {
      if (!handle) throw new Error('MCP client not initialized');

      const result = await handle.client.callTool({
        name: 'generate_image',
        arguments: {
          prompt: 'A detailed red gem, centered, on magenta background',
          modelTier: 'pro',
          sourceResolution: '2K',
          outputFileName: 'transparency_pro_2k',
          outputType: 'file',
          outputWidth: 128,
          outputHeight: 128,
          outputFormat: 'png',
          outputPath: outputDir,
          transparent: true,
          colorTolerance: 40,
        },
      });

      const parsed = parseToolResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.width).toBe(128);
      expect(parsed.height).toBe(128);

      const metadata = await sharp(parsed.filePath).metadata();
      expect(metadata.hasAlpha).toBe(true);

      const { data } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
      const pixels = new Uint8Array(data);
      
      let transparentCount = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] === 0) transparentCount++;
      }
      
      expect(transparentCount).toBeGreaterThan(0);
      console.log(`Pro 2K (tolerance 40): ${transparentCount} transparent pixels out of ${pixels.length / 4}`);
    });
  });

  test.runIf(!hasApiKey)('skips when GEMINI_API_KEY is missing', () => {
    expect(true).toBe(true);
  });
});
