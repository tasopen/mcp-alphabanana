import { describe, expect, test } from 'vitest';
import sharp from 'sharp';
import { postProcess, postProcessWithDebug } from '../src/utils/post-processor.js';

/**
 * Transparency tests for the existing local post-processing pipeline.
 * v1.6.0 keeps this pipeline unchanged (no native model transparency).
 */

const SIZE = 64;

/** Solid magenta background with a blue square subject in the center. */
async function makeChromaKeyImage(): Promise<Buffer> {
  const raw = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const insideSubject = x >= 16 && x < 48 && y >= 16 && y < 48;
      const offset = (y * SIZE + x) * 4;
      if (insideSubject) {
        raw[offset] = 30;
        raw[offset + 1] = 60;
        raw[offset + 2] = 200;
        raw[offset + 3] = 255;
      } else {
        raw[offset] = 255;
        raw[offset + 1] = 0;
        raw[offset + 2] = 255;
        raw[offset + 3] = 255;
      }
    }
  }
  return sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png().toBuffer();
}

async function pixelAt(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

describe('transparency post-processing (preserved in v1.6.0)', () => {
  test('transparent=false does not invoke transparency processing', async () => {
    const input = await makeChromaKeyImage();

    const { buffer, debugInfo } = await postProcessWithDebug(input, {
      width: SIZE,
      height: SIZE,
      format: 'png',
      resizeMode: 'crop',
      transparentColor: null,
      colorTolerance: 30,
    });

    // No color keying happened.
    expect(debugInfo.selectedColor).toBeUndefined();
    expect(debugInfo.requestedColor).toBeUndefined();

    // The background is untouched and fully opaque.
    const corner = await pixelAt(buffer, 0, 0);
    expect(corner).toEqual([255, 0, 255, 255]);
  });

  test('transparent=true runs the existing alpha pipeline', async () => {
    const input = await makeChromaKeyImage();

    const { buffer, debugInfo } = await postProcessWithDebug(input, {
      width: SIZE,
      height: SIZE,
      format: 'png',
      resizeMode: 'crop',
      transparentColor: '#FF00FF',
      colorTolerance: 30,
    });

    // The pipeline selected and keyed the background color.
    expect(debugInfo.requestedColor).toBe('#FF00FF');
    expect(debugInfo.selectedColor).toBeTruthy();

    // Background becomes transparent; the subject stays opaque.
    const corner = await pixelAt(buffer, 0, 0);
    expect(corner[3]).toBe(0);
    const subject = await pixelAt(buffer, 32, 32);
    expect(subject[3]).toBe(255);
    expect(subject[2]).toBeGreaterThan(150); // blue subject preserved
  });

  test('postProcess without transparency behaves like transparent=false', async () => {
    const input = await makeChromaKeyImage();
    const buffer = await postProcess(input, {
      width: SIZE,
      height: SIZE,
      format: 'png',
      resizeMode: 'crop',
      transparentColor: null,
      colorTolerance: 30,
    });

    const corner = await pixelAt(buffer, 0, 0);
    expect(corner).toEqual([255, 0, 255, 255]);
  });

  test('JPG output ignores transparency even when a key color is provided', async () => {
    const input = await makeChromaKeyImage();
    const buffer = await postProcess(input, {
      width: SIZE,
      height: SIZE,
      format: 'jpg',
      resizeMode: 'crop',
      transparentColor: '#FF00FF',
      colorTolerance: 30,
    });

    const metadata = await sharp(buffer).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.hasAlpha).toBeFalsy();
  });
});
