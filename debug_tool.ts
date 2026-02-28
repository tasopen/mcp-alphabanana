
import { createMcpClient, closeMcpClient, parseToolResult } from './test/helpers/mcp-client.js';

async function debugCall() {
    const handle = await createMcpClient(30000);
    try {
        const result = await handle.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A tiny blue circle.',
                model: 'Flash2.5',
                outputFileName: 'debug_circle',
                outputType: 'file',
                outputWidth: 32,
                outputHeight: 32,
                output_format: 'png',
                outputPath: 'C:/Users/tobiu/WS/tasopen-public/mcp-alphabanana/output',
                debug: true
            },
        });
        console.log('FULL RESULT:', JSON.stringify(result, null, 2));
    } catch (err) {
        console.error('Call failed:', err);
    } finally {
        await closeMcpClient(handle);
    }
}

debugCall();
