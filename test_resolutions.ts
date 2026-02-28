import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

async function testWithHint(size: string, ratio: string = '1:1') {
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const ratioHint = ratio === '1:1' ? 'square 1:1 format' : `${ratio} aspect ratio`;
    const prompt = `a simple gold coin, 8-bit style. IMPORTANT: Output in a ${ratioHint}.`;

    console.log(`Testing - imageSize: ${size}, aspectRatio: ${ratio}, prompt: "${prompt}"`);
    try {
        const result = await genAI.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                thinkingConfig: {
                    thinkingLevel: "MINIMAL",
                },
                imageConfig: {
                    aspectRatio: ratio,
                    imageSize: size,
                },
                responseModalities: [
                    'IMAGE',
                    'TEXT',
                ],
            } as any
        });

        const part = result.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData?.data) {
            const buffer = Buffer.from(part.inlineData.data, 'base64');
            const metadata = await sharp(buffer).metadata();
            const filename = `hint_${size}_${ratio.replace(':', '_')}.png`;
            await sharp(buffer).toFile(filename);
            console.log(`  SUCCESS: ${metadata.width}x${metadata.height}`);
            console.log(`  Saved to: ${filename}`);
        } else {
            console.log(`  WARNING: No image data`);
        }
    } catch (err: any) {
        console.log(`  FAILED: ${err.message}`);
    }
}

async function run() {
    await testWithHint('512', '1:4');
    await testWithHint('512', '4:1');
    await testWithHint('512', '16:9');
    await testWithHint('512', '3:4');
}

run();
