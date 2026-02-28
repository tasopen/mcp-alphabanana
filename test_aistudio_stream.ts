import { GoogleGenAI } from '@google/genai';
import { writeFile } from 'fs';
import sharp from 'sharp';

function saveBinaryFile(fileName: string, content: Buffer) {
    writeFile(fileName, content, (err) => {
        if (err) {
            console.error(`Error writing file ${fileName}:`, err);
            return;
        }
        console.log(`File ${fileName} saved to file system.`);
    });
}

async function main() {
    const ai = new GoogleGenAI({
        apiKey: process.env['GEMINI_API_KEY']!,
    });
    const config = {
        thinkingConfig: {
            thinkingLevel: "MINIMAL",
        },
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "512",
            // personGeneration: "", // Removed as it caused errors
        },
        responseModalities: [
            'IMAGE',
            'TEXT',
        ],
    };
    const model = 'gemini-3.1-flash-image-preview';
    const contents = [
        {
            role: 'user',
            parts: [
                {
                    text: `a simple gold coin, 8-bit style`,
                },
            ],
        },
    ];

    console.log("Calling generateContentStream...");
    try {
        const response = await ai.models.generateContentStream({
            model,
            config: config as any,
            contents,
        });

        let fileIndex = 0;
        for await (const chunk of response) {
            if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
                continue;
            }
            const part = chunk.candidates[0].content.parts[0];
            if (part.inlineData) {
                const fileName = `aistudio_stream_${fileIndex++}.png`;
                const inlineData = part.inlineData;
                const buffer = Buffer.from(inlineData.data || '', 'base64');
                const metadata = await sharp(buffer).metadata();
                console.log(`Received image chunk: ${metadata.width}x${metadata.height}`);
                saveBinaryFile(fileName, buffer);
            }
            else if (chunk.text) {
                console.log("Text chunk:", chunk.text);
            }
        }
    } catch (err: any) {
        console.error("FAILED:", err.message);
    }
}

main();
