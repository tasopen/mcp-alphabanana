import fs from 'fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { closeMcpClient, createMcpClient, parseToolResult } from './helpers/mcp-client.js';
import { outputDir } from './helpers/paths.js';

const hasApiKey = Boolean(process.env.GEMINI_API_KEY);

describe('mcp-alphabanana flash3.1 features', () => {
    let handle: Awaited<ReturnType<typeof createMcpClient>> | null = null;

    beforeAll(async () => {
        await fs.mkdir(outputDir, { recursive: true });
        if (hasApiKey) {
            handle = await createMcpClient(30000); // 30 second timeout
        }
    });

    afterAll(async () => {
        if (handle) {
            await closeMcpClient(handle);
            handle = null;
        }
    });

    test.runIf(hasApiKey)('0.5K resolution support', async () => {
        const result = await handle!.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A tiny simple pixel art cat.',
                model: 'Flash3.1',
                output_resolution: '0.5K',
                outputFileName: 'test_05k',
                outputType: 'base64',
                outputWidth: 128,
                outputHeight: 128,
            },
        });

        const parsed = parseToolResult(result);
        if (!parsed.success) console.error('0.5K test failed:', parsed.message);
        expect(parsed.success).toBe(true);
        expect(parsed.base64).toBeTruthy();
    });

    test.runIf(hasApiKey)('thinking mode and grounding (text)', async () => {
        const result = await handle!.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A futuristic city based on the latest architectural trends of 2026.',
                model: 'Flash3.1',
                thinking_mode: 'high',
                grounding_type: 'text',
                include_thoughts: true,
                outputFileName: 'test_thinking_grounding',
                outputType: 'base64',
                outputWidth: 256,
                outputHeight: 256,
            },
        });

        const parsed = parseToolResult(result);
        if (!parsed.success) console.error('Thinking/Grounding test failed:', parsed.message);
        expect(parsed.success).toBe(true);
    });

    test.runIf(hasApiKey)('extreme aspect ratio 1:8', async () => {
        const result = await handle!.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A long vertical bamboo branch.',
                model: 'Flash3.1',
                aspect_ratio: '1:8',
                outputFileName: 'test_1_8',
                outputType: 'base64',
                outputWidth: 64,
                outputHeight: 512,
            },
        });

        const parsed = parseToolResult(result);
        if (!parsed.success) console.error('Aspect ratio 1:8 test failed:', parsed.message);
        expect(parsed.success).toBe(true);
    });

    test.runIf(hasApiKey)('webp format with transparency', async () => {
        const result = await handle!.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A simple floating blue bubble.',
                model: 'Flash3.1',
                output_format: 'webp',
                transparent: true,
                outputFileName: 'test_webp_trans',
                outputType: 'combine',
                outputPath: outputDir,
                outputWidth: 128,
                outputHeight: 128,
            },
        });

        const parsed = parseToolResult(result);
        if (!parsed.success) console.error('WebP transparency test failed:', parsed.message);
        expect(parsed.success).toBe(true);
        expect(parsed.mimeType).toBe('image/webp');
        expect(parsed.filePath).toMatch(/\.webp$/);
    });

    test.runIf(hasApiKey)('reference image count (checking limit)', async () => {
        // Note: We don't necessarily need valid unique files for count validation if the server 
        // just checks the array length, but here we'll use the same fixture multiple times.
        const { ensureReferenceImage } = await import('./helpers/fixtures.js');
        const refPath = await ensureReferenceImage();

        const result = await handle!.client.callTool({
            name: 'generate_image',
            arguments: {
                prompt: 'A character matching these styles.',
                model: 'Flash3.1',
                referenceImages: [
                    { filePath: refPath, description: 'ref1' },
                    { filePath: refPath, description: 'ref2' },
                    { filePath: refPath, description: 'ref3' },
                    { filePath: refPath, description: 'ref4' },
                ],
                outputFileName: 'test_refs',
                outputType: 'base64',
                outputWidth: 64,
                outputHeight: 64,
            },
        });

        const parsed = parseToolResult(result);
        if (!parsed.success) console.error('Reference count test failed:', parsed.message);
        expect(parsed.success).toBe(true);
    });
});
