import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fallbackDir, repoRoot } from './paths.js';

export interface McpClientHandle {
  client: Client;
  transport: StdioClientTransport;
}

export async function createMcpClient(timeoutMs: number = 30000): Promise<McpClientHandle> {
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['tsx', 'src/index.ts'],
    cwd: repoRoot,
    env: {
      ...process.env,
      MCP_FALLBACK_OUTPUT: fallbackDir,
    },
  });

  const client = new Client(
    { name: 'mcp-alphabanana-tests', version: '1.0.0' },
    { capabilities: {} }
  );

  // Add timeout for connection
  const connectPromise = client.connect(transport);
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`MCP server connection timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
  } catch (error) {
    // Clean up on failure
    try {
      await transport.close();
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }

  return { client, transport };
}

export async function closeMcpClient(handle: McpClientHandle): Promise<void> {
  await handle.client.close();
  await handle.transport.close();
}

export function parseToolResult(result: any): any {
  const textItem = result?.content?.find((item: any) => item?.type === 'text');
  if (!textItem?.text) {
    throw new Error('Tool result missing text content');
  }
  return JSON.parse(textItem.text);
}

