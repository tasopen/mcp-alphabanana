import fs from 'fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { closeMcpClient, createMcpClient, parseToolResult } from './helpers/mcp-client.js';
import { outputDir } from './helpers/paths.js';

describe('mcp-alphabanana manual test', () => {
    let handle: any = null;

    beforeAll(async () => {
        await fs.mkdir(outputDir, { recursive: true });
        handle = await createMcpClient(60000); // 1 minute timeout for high quality gen
    });

    afterAll(async () => {
        if (handle) await closeMcpClient(handle);
    });

    test('user prompt generation', async () => {
        const result = await handle.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: '((ultra-detailed)), (highly detailed CG illustration), (best quality:1.2),ultra-detailed,highly detailed,colorful composition,artistic photoshoot,anime,1girl, solo focus, shool  girl, (pastel orange hair color:1.3), auburn hair, white sweater and burgundy french beret, looking at viewer, laying in a park, (v sign), Portrait,depth of field, soft lighting, sidelighting, (shine), lighting, ray tracing, smile, perfect face, lustrous skin, highly detailed face, highly detailed eyes , perfect face, perfect nose, perfect hair, perfect eyes, beautiful hair, beautiful face, extremely detailed face, beautiful detailed eyes, beautiful clavicle, beautiful body, beautiful chest, beautiful thigh, beautiful legs, beautiful fingers, lovely, (very detailed background:1.0),(highly detailed background:1.0),intricate details, joyful atmosphere, autumn colors palette, chromatic aberration',
                model: 'Flash3.1',
                output_resolution: '1K',
                outputWidth: 512,
                outputHeight: 512,
                output_format: 'webp',
                outputFileName: 'user_test_girl',
                outputType: 'combine',
                outputPath: outputDir,
                transparent: true,
                debug: true,
                include_thoughts: true
            },
        });

        console.log('RAW Result:', JSON.stringify(result, null, 2));

        const parsed = parseToolResult(result);
        console.log('Result:', JSON.stringify(parsed, null, 2));
        expect(parsed.success).toBe(true);
        expect(parsed.filePath).toMatch(/\.webp$/);
    });
});
