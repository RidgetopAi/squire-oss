import { config } from '../../config/index.js';

export interface MandrelResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Call a Mandrel MCP tool via HTTP
 *
 * @param toolName - The tool name (e.g., 'context_store', 'project_switch')
 * @param args - Tool arguments
 * @returns Response with success status and data or error
 */
export async function callMandrelTool<T = unknown>(
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<MandrelResponse<T>> {
  const url = `${config.mandrel.baseUrl}/mcp/tools/${toolName}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arguments: args }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `HTTP ${response.status}: ${text || response.statusText}`,
      };
    }

    const data = await response.json();
    return { success: true, data: data as T };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
