import { GoogleGenAI } from '@google/genai';

async function run() {
    try {
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await genAI.models.generateContent({
            model: 'gemini-3.1-flash',
            contents: [{ role: 'user', parts: [{ text: '鳥の紋章' }] }],
            config: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: {
                    aspectRatio: '1:1',
                    imageSize: '1K'
                }
            } as any
        });

        console.log("Response keys:", Object.keys(response));
        if (response.candidates && response.candidates.length > 0) {
            console.log("Candidate keys:", Object.keys(response.candidates[0]));
            const parts = response.candidates[0].content?.parts || [];
            console.log(`Found ${parts.length} parts`);
            for (let i = 0; i < parts.length; i++) {
                console.log(`Part ${i} keys:`, Object.keys(parts[i]));
                if (parts[i].inlineData) {
                    console.log(`Part ${i} inlineData keys:`, Object.keys(parts[i].inlineData));
                }
                if (parts[i].text) {
                    console.log(`Part ${i} text:`, parts[i].text.slice(0, 50));
                }
            }
        } else {
            console.log("No candidates found in response structure.", response);
        }
    } catch (err: any) {
        console.error('Test failed with error:', err.message);
    }
}

run();
