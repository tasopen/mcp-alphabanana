
import { GoogleGenAI } from '@google/genai';

async function test() {
    const apiKey = 'AIzaSyCBL5AqeOOX7eOczNemZNS1hhyhk1qqMrU';
    const genAI = new GoogleGenAI({ apiKey });
    const model = 'gemini-1.5-flash';

    try {
        const result = (await genAI.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
        })) as any;
        console.log('Connectivity Test Success:', result.text);

        // Now test image generation model
        console.log('Testing Image Generation Model...');
        const imgResult = (await genAI.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: [{ role: 'user', parts: [{ text: 'Cat photo' }] }],
            config: {
                response_modalities: ['IMAGE'],
            } as any
        })) as any;
        console.log('Image Test Candidates:', imgResult.candidates?.length);
    } catch (err) {
        console.error('Test Failed:', err);
    }
}

test();
