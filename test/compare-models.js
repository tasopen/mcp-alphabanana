import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function analyzeImage(imagePath, label) {
  try {
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

    // Top 10 colors
    const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${label}`);
    console.log(`${'='.repeat(60)}`);
    
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
      
      console.log(`${idx + 1}. RGB(${r.toString().padStart(3)}, ${g.toString().padStart(3)}, ${b.toString().padStart(3)}) A=${a.toString().padStart(3)} | ${count.toString().padStart(4)} px | H=${h.toFixed(0).padStart(3)}° S=${s.toFixed(0).padStart(3)}% V=${v.toFixed(0).padStart(3)}%`);
    });

    // Count transparent pixels
    let transparentCount = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparentCount++;
    }

    console.log(`\nTransparent: ${transparentCount} / ${pixels.length / 4} (${((transparentCount / (pixels.length / 4)) * 100).toFixed(1)}%)`);
  } catch (err) {
    console.log(`\n${label}: File not found or error - ${err.message}`);
  }
}

// Analyze Flash debug_raw images
await analyzeImage(path.join(__dirname, 'output', 'transparency_flash_magenta_debug_raw.png'), 'Flash Magenta - RAW (before processing) - WITHOUT reference');
await analyzeImage(path.join(__dirname, 'output', 'transparency_flash_magenta_with_ref_debug_raw.png'), 'Flash Magenta - RAW (before processing) - WITH reference image');
await analyzeImage(path.join(__dirname, 'output', 'transparency_flash_green_debug_raw.png'), 'Flash Green - RAW (before processing)');

// Analyze Pro debug_raw images
await analyzeImage(path.join(__dirname, 'output', 'transparency_pro_magenta_debug_raw.png'), 'Pro Magenta - RAW (before processing)');
await analyzeImage(path.join(__dirname, 'output', 'transparency_pro_green_debug_raw.png'), 'Pro Green - RAW (before processing)');

console.log('\n' + '='.repeat(60));
console.log('COMPARISON SUMMARY');
console.log('='.repeat(60));
console.log('Target colors:');
console.log('  Magenta: RGB(255, 0, 255) - H=300° S=100% V=100%');
console.log('  Green:   RGB(0, 255, 0)   - H=120° S=100% V=100%');
console.log('\nFlash Magenta Comparison:');
console.log('  Without reference: Color drift expected (H≈332°, S≈83%)');
console.log('  With reference:    Improved accuracy if reference helps');
console.log('');
