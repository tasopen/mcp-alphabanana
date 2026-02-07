/**
 * Test transparency processing only (without calling Gemini API each time)
 * Run with: npx tsx test/test-transparency-only.ts
 * 
 * First run: Downloads image from Gemini and saves it
 * Subsequent runs: Uses saved image for testing
 */

import { postProcess } from '../src/utils/post-processor.js';
import { generateWithGemini } from '../src/utils/gemini-client.js';
import { outputDir } from './helpers/paths.js';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const CACHED_IMAGE_PATH = path.join(outputDir, 'cached_test_image.png');

async function main() {
  console.log('🧪 Testing Flash model transparency processing...\n');

  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not set');
    process.exit(1);
  }

  await fs.mkdir(outputDir, { recursive: true });

  let rawImageBuffer: Buffer;

  // Check if cached image exists
  try {
    await fs.access(CACHED_IMAGE_PATH);
    console.log('✓ Using cached image from previous run');
    console.log(`  Path: ${CACHED_IMAGE_PATH}\n`);
    rawImageBuffer = await fs.readFile(CACHED_IMAGE_PATH);
  } catch {
    console.log('⏬ Cached image not found. Downloading from Gemini...');
    console.log('Prompt: "A simple red circle, centered, clean edges"');
    console.log('Settings: Flash model, transparent=true, magenta background\n');

    rawImageBuffer = await generateWithGemini({
      prompt: 'A simple red circle, centered, clean edges',
      modelTier: 'flash',
      sourceResolution: '1K',
      aspectRatio: '1:1',
      transparent: true,
      transparentColor: '#FF00FF',
      referenceImages: [],
    });

    await fs.writeFile(CACHED_IMAGE_PATH, rawImageBuffer);
    console.log(`✓ Image downloaded and cached to: ${CACHED_IMAGE_PATH}\n`);
  }

  // Check raw image info
  const rawMetadata = await sharp(rawImageBuffer).metadata();
  console.log('Raw image info:');
  console.log(`  Format: ${rawMetadata.format}`);
  console.log(`  Size: ${rawMetadata.width}x${rawMetadata.height}`);
  console.log(`  Channels: ${rawMetadata.channels}`);
  console.log(`  Has alpha: ${rawMetadata.hasAlpha}\n`);

  // Test transparency processing
  console.log('🔄 Testing transparency processing...\n');

  try {
    const processed = await postProcess(rawImageBuffer, {
      width: 64,
      height: 64,
      format: 'png',
      resizeMode: 'crop',
      transparentColor: 'auto',
      colorTolerance: 80,
    });

    console.log('✅ Transparency processing succeeded!');
    console.log(`   Output buffer size: ${processed.length} bytes\n`);

    // Save result
    const outputPath = path.join(outputDir, 'transparency_test_result.png');
    await fs.writeFile(outputPath, processed);
    console.log(`💾 Saved result to: ${outputPath}`);

    // Verify result
    const resultMetadata = await sharp(processed).metadata();
    console.log('\nResult image info:');
    console.log(`  Format: ${resultMetadata.format}`);
    console.log(`  Size: ${resultMetadata.width}x${resultMetadata.height}`);
    console.log(`  Channels: ${resultMetadata.channels}`);
    console.log(`  Has alpha: ${resultMetadata.hasAlpha}`);

    // Check for transparent pixels
    const { data } = await sharp(processed).raw().toBuffer({ resolveWithObject: true });
    const pixels = new Uint8Array(data);
    let transparentCount = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) transparentCount++;
    }
    const totalPixels = pixels.length / 4;
    const transparentPercent = ((transparentCount / totalPixels) * 100).toFixed(1);
    
    console.log(`\nTransparency stats:`);
    console.log(`  Transparent pixels: ${transparentCount} / ${totalPixels} (${transparentPercent}%)`);

    if (transparentCount > 0) {
      console.log('\n✅ Test PASSED: Image has transparent pixels');
    } else {
      console.log('\n⚠️  Warning: No transparent pixels found');
    }

  } catch (error) {
    console.error('\n❌ Transparency processing failed:');
    console.error(error);
    process.exit(1);
  }

  console.log('\n💡 Tip: Run this again to test without calling Gemini API');
  console.log(`    Delete ${CACHED_IMAGE_PATH} to download a fresh image`);
}

main();
