
import { GoogleGenAI } from '@google/genai';

async function listModels() {
    const apiKey = 'AIzaSyCBL5AqeOOX7eOczNemZNS1hhyhk1qqMrU';
    const genAI = new GoogleGenAI({ apiKey });

    try {
        console.log('Listing models...');
        const response = await (genAI.models as any).list();
        // The list() method might return an object with a models property or be an iterable itself.
        // Based on common patterns in these SDKs:
        const models = response.models || response;
        if (Array.isArray(models)) {
            for (const model of models) {
                console.log(`- ${model.name} (${model.displayName})`);
                console.log(`  Supported Actions: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
            }
        } else {
            console.log('Models response:', JSON.stringify(response, null, 2));
        }
    } catch (err: any) {
        console.error('List Models Failed:', err.status, err.message);
    }
}

listModels();
