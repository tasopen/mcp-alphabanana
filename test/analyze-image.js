/**
 * Quick script to analyze pixel colors in a generated image
 * Usage: node test/analyze-image.js <image-path>
 */

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function rgbToHsv(r, g, b) {
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

async function analyzeImage(imagePath) {
  console.log(`\nAnalyzing: ${imagePath}\n`);
  
  const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8Array(data);
  
  const colorSamples = new Map();
  
  for (let i = 0; i < pixels.length; i += info.channels) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = info.channels === 4 ? pixels[i + 3] : 255;
    
    const key = `${r},${g},${b},${a}`;
    const hsv = rgbToHsv(r, g, b);
    
    if (!colorSamples.has(key)) {
      colorSamples.set(key, { count: 1, hsv, a });
    } else {
      colorSamples.get(key).count++;
    }
  }
  
  const sorted = Array.from(colorSamples.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 30);
  
  console.log('RGBA          | Count  | H°    | S%   | V%   | Alpha | Notes');
  console.log('--------------|--------|-------|------|------|-------|----------------');
  
  for (const [rgba, { count, hsv, a }] of sorted) {
    const [r, g, b] = rgba.split(',').map(Number);
    const percentage = ((count / (pixels.length / info.channels)) * 100).toFixed(1);
    
    const isMagentaLike = Math.abs(hsv.h - 300) < 30;
    const isGreenLike = Math.abs(hsv.h - 120) < 30;
    const passesFilter = hsv.s >= 50 && hsv.v >= 30;
    
    let note = '';
    if (a === 0) note = 'TRANSPARENT';
    else if (isMagentaLike) note = `MAGENTA ${passesFilter ? 'PASS' : 'FAIL'}`;
    else if (isGreenLike) note = `GREEN ${passesFilter ? 'PASS' : 'FAIL'}`;
    else if (!passesFilter) note = `FILTERED (S${hsv.s.toFixed(0)}<50 or V${hsv.v.toFixed(0)}<30)`;
    
    console.log(
      `${r.toString().padStart(3)},${g.toString().padStart(3)},${b.toString().padStart(3)},${a.toString().padStart(3)} | ` +
      `${count.toString().padStart(6)} (${percentage.padStart(4)}%) | ` +
      `${hsv.h.toFixed(0).padStart(5)} | ` +
      `${hsv.s.toFixed(0).padStart(4)} | ` +
      `${hsv.v.toFixed(0).padStart(4)} | ` +
      `${a.toString().padStart(5)} | ${note}`
    );
  }
  
  const totalPixels = pixels.length / info.channels;
  const transparentCount = Array.from(colorSamples.entries())
    .filter(([_, { a }]) => a === 0)
    .reduce((sum, [_, { count }]) => sum + count, 0);
  
  console.log(`\nTotal pixels: ${totalPixels}`);
  console.log(`Transparent pixels: ${transparentCount} (${((transparentCount / totalPixels) * 100).toFixed(1)}%)`);
  console.log(`Opaque pixels: ${totalPixels - transparentCount} (${(((totalPixels - transparentCount) / totalPixels) * 100).toFixed(1)}%)`);
}

const imagePath = process.argv[2] || resolve(__dirname, 'output/transparency_flash_magenta.png');
analyzeImage(imagePath).catch(console.error);
