import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { outputDir } from './paths.js';

export async function ensureReferenceImage(): Promise<string> {
  const fixturesDir = path.resolve(outputDir, 'fixtures');
  const filePath = path.resolve(fixturesDir, 'ref-32x32.png');

  await fs.mkdir(fixturesDir, { recursive: true });
  
  // Create a simple 32x32 blue rectangle as reference image
  const buffer = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 4,
      background: { r: 0, g: 100, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
    
  await fs.writeFile(filePath, buffer);

  return filePath;
}
