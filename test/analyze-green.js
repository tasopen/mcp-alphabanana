import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const imagePath = path.join(__dirname, 'output', 'transparency_flash_green.png');

const { data, info } = await sharp(imagePath).raw().toBuffer({ resolveWithObject: true });
const pixels = new Uint8Array(data);

// Color analysis
const colorMap = new Map();
for (let i = 0; i < pixels.length; i += 4) {
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  const a = pixels[i + 3];
  const key = `${r},${g},${b},${a}`;
  colorMap.set(key, (colorMap.get(key) || 0) + 1);
}

// Top 20 colors
const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log('\nTop 20 colors in green background test:');
console.log('Target: RGB(0, 255, 0) - bright green\n');
sorted.forEach(([key, count], idx) => {
  const [r, g, b, a] = key.split(',').map(Number);
  
  // HSV conversion
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
  
  console.log(`${idx + 1}. RGB(${r}, ${g}, ${b}) A=${a} - ${count} pixels - H=${h.toFixed(0)}° S=${s.toFixed(0)}% V=${v.toFixed(0)}%`);
});

// Count transparent pixels
let transparentCount = 0;
for (let i = 3; i < pixels.length; i += 4) {
  if (pixels[i] === 0) transparentCount++;
}

console.log(`\nTransparent pixels: ${transparentCount} / ${pixels.length / 4}`);
