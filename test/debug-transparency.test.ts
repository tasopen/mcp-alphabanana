/**
 * Debug test to analyze generated image colors
 */

import fs from 'fs/promises';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { closeMcpClient, createMcpClient, parseToolResult } from './helpers/mcp-client.js';
import { outputDir } from './helpers/paths.js';

const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

// RGB to HSV conversion
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;
  
  let h = 0;
  if (delta !== 0) {
    if (max === rNorm) {
      h = 60 * (((gNorm - bNorm) / delta) % 6);
    } else if (max === gNorm) {
      h = 60 * (((bNorm - rNorm) / delta) + 2);
    } else {
      h = 60 * (((rNorm - gNorm) / delta) + 4);
    }
  }
  if (h < 0) h += 360;
  
  const s = max === 0 ? 0 : (delta / max) * 100;
  const v = max * 100;
  
  return { h, s, v };
}

describe('debug transparency', () => {
  let handle: Awaited<ReturnType<typeof createMcpClient>> | null = null;

  beforeAll(async () => {
    await fs.mkdir(outputDir, { recursive: true });
    try {
      handle = await createMcpClient(30000);
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  });

  afterAll(async () => {
    if (handle) {
      await closeMcpClient(handle);
    }
  });

  test.runIf(hasApiKey)('analyze magenta background colors', async () => {
    if (!handle) throw new Error('MCP client not initialized');

    const result = await handle.client.callTool({
      name: 'generate_image',
      arguments: {
        prompt: 'A simple red circle, centered, clean edges',
        modelTier: 'flash',
        outputFileName: 'debug_magenta_raw',
        outputType: 'file',
        outputWidth: 64,
        outputHeight: 64,
        outputFormat: 'png',
        outputPath: outputDir,
        transparent: true, // Request transparent with magenta background
        transparentColor: '#FF00FF',
        colorTolerance: 30,
        debug: true, // Enable debug mode to save raw image
      },
    });

    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(true);

    // Analyze the raw image colors
    const { data, info } = await sharp(parsed.filePath).raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data);
    
    // Sample colors and their HSV values
    const colorSamples: Map<string, { count: number; hsv: { h: number; s: number; v: number } }> = new Map();
    
    for (let i = 0; i < pixels.length; i += info.channels) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      const key = `${r},${g},${b}`;
      const hsv = rgbToHsv(r, g, b);
      
      if (!colorSamples.has(key)) {
        colorSamples.set(key, { count: 1, hsv });
      } else {
        colorSamples.get(key)!.count++;
      }
    }
    
    // Sort by frequency
    const sorted = Array.from(colorSamples.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20); // Top 20 colors
    
    console.log('\n=== Top 20 colors in generated image ===');
    console.log('RGB         | Count  | H°    | S%   | V%   | Notes');
    console.log('------------|--------|-------|------|------|----------------');
    
    for (const [rgb, { count, hsv }] of sorted) {
      const [r, g, b] = rgb.split(',').map(Number);
      const percentage = ((count / (pixels.length / info.channels)) * 100).toFixed(1);
      
      // Check if it matches target magenta
      const isMagentaLike = Math.abs(hsv.h - 300) < 30 && hsv.s > 50 && hsv.v > 50;
      const note = isMagentaLike ? 'MAGENTA-LIKE' : '';
      
      console.log(
        `${r.toString().padStart(3)},${g.toString().padStart(3)},${b.toString().padStart(3)} | ` +
        `${count.toString().padStart(6)} (${percentage.padStart(4)}%) | ` +
        `${hsv.h.toFixed(0).padStart(5)} | ` +
        `${hsv.s.toFixed(0).padStart(4)} | ` +
        `${hsv.v.toFixed(0).padStart(4)} | ${note}`
      );
    }
    
    // Check if target magenta (255, 0, 255) exists
    const targetKey = '255,0,255';
    const targetCount = colorSamples.get(targetKey)?.count || 0;
    console.log(`\nExact target magenta (255,0,255): ${targetCount} pixels`);
    
    // Magenta-like pixels (H: 270-330, S > 50%, V > 50%)
    let magentaLikeCount = 0;
    let lowSatCount = 0;
    let lowValCount = 0;
    
    for (const [rgb, { count, hsv }] of colorSamples) {
      const hDiff = Math.min(Math.abs(hsv.h - 300), 360 - Math.abs(hsv.h - 300));
      
      if (hDiff < 30) {
        if (hsv.s < 50) lowSatCount += count;
        else if (hsv.v < 30) lowValCount += count;
        else magentaLikeCount += count;
      }
    }
    
    console.log(`\nMagenta-like pixels (H±30°, S≥50%, V≥30%): ${magentaLikeCount}`);
    console.log(`Magenta hue but low saturation (S<50%): ${lowSatCount}`);
    console.log(`Magenta hue but low brightness (V<30%): ${lowValCount}`);
  });
});
