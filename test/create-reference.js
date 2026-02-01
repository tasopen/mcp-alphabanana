import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Create 64x64 solid magenta PNG
const width = 64;
const height = 64;
const pixels = new Uint8Array(width * height * 4);

for (let i = 0; i < pixels.length; i += 4) {
  pixels[i] = 255;     // R
  pixels[i + 1] = 0;   // G
  pixels[i + 2] = 255; // B
  pixels[i + 3] = 255; // A
}

const outputPath = path.join(__dirname, 'output', 'fixtures', 'reference_magenta_64x64.png');

await sharp(Buffer.from(pixels), {
  raw: {
    width,
    height,
    channels: 4,
  },
})
.png()
.toFile(outputPath);

console.log(`Created reference image: ${outputPath}`);
console.log('RGB(255, 0, 255) - Pure magenta 64x64px');
