import { generateWithGemini } from './src/utils/gemini-client.js';

async function run() {
    try {
        console.log("Starting generateWithGemini...");
        const buf = await generateWithGemini({
            prompt: '鳥の紋章',
            modelTier: 'Flash3.1',
            sourceResolution: '1K',
            aspectRatio: '1:1',
            transparent: true,
            transparentColor: null,
            referenceImages: [],
            groundingType: 'none',
            thinkingMode: 'minimal',
            includeThoughts: false
        });
        console.log(`Success! Buffer size: ${buf.length}`);
    } catch (err: any) {
        console.error('Test failed:', err.message);
    }
}

run();
