import { GoogleGenAI } from '@google/genai';

async function run() {
    try {
        console.log("Starting SDK call...");
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await genAI.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{ role: 'user', parts: [{ text: '鳥の紋章' }] }],
            config: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: '1:1',
                    imageSize: '1K'
                }
            } as any
        });

        // Dump the main structure (truncating large strings)
        const dump = JSON.parse(JSON.stringify(response));
        if (dump.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
            dump.candidates[0].content.parts[0].inlineData.data = '...BASE64...';
        }
        console.log("RESPONSE STRUCTURE:", JSON.stringify(dump, null, 2));

    } catch (err: any) {
        console.error('Test failed:', err);
    }
}

run();
