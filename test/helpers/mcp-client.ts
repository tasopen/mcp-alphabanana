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

interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

interface ToolCallDiagnosticsContext {
  testName: string;
}

function summarizeForLog(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}... [truncated ${value.length - 500} chars]` : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => summarizeForLog(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, summarizeForLog(item, seen)])
  );
}

function logToolDiagnostics(
  stage: string,
  request: ToolCallRequest,
  context: ToolCallDiagnosticsContext,
  extra: Record<string, unknown>
): void {
  const payload = summarizeForLog({
    testName: context.testName,
    toolName: request.name,
    arguments: request.arguments,
    ...extra,
  });

  console.error(`[${context.testName}] ${stage}\n${JSON.stringify(payload, null, 2)}`);
}

export async function callToolAndParse(
  client: Client,
  request: ToolCallRequest,
  context: ToolCallDiagnosticsContext
): Promise<{ rawResult: unknown; parsed: any }> {
  let rawResult: unknown;

  try {
    rawResult = await client.callTool(request);
  } catch (error) {
    logToolDiagnostics('callTool threw an exception', request, context, { error });
    throw error;
  }

  let parsed: any;

  try {
    parsed = parseToolResult(rawResult);
  } catch (error) {
    logToolDiagnostics('parseToolResult threw an exception', request, context, {
      error,
      rawResult,
    });
    throw error;
  }

  if (!parsed?.success) {
    logToolDiagnostics('tool returned success=false', request, context, {
      rawResult,
      parsed,
    });
  }

  return { rawResult, parsed };
}

export function parseToolResult(result: any): any {
  const textItem = result?.content?.find((item: any) => item?.type === 'text');
  if (!textItem?.text) {
    throw new Error('Tool result missing text content');
  }
  return JSON.parse(textItem.text);
}

