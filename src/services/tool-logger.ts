/**
 * Tool Call Logger
 *
 * Logs all tool executions to the database for observability and reporting.
 */

import { pool } from '../db/pool.js';

export interface ToolCallLog {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  resultSummary: string | null;
  success: boolean;
  durationMs: number | null;
  errorMessage: string | null;
  conversationId: string | null;
  createdAt: Date;
}

/**
 * Log a tool call to the database
 */
export async function logToolCall(params: {
  toolName: string;
  arguments: Record<string, unknown>;
  resultSummary?: string;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
  conversationId?: string;
}): Promise<void> {
  try {
    // Truncate result summary to avoid huge logs
    const truncatedResult = params.resultSummary
      ? params.resultSummary.substring(0, 500)
      : null;

    await pool.query(
      `INSERT INTO tool_calls (tool_name, arguments, result_summary, success, duration_ms, error_message, conversation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.toolName,
        JSON.stringify(params.arguments),
        truncatedResult,
        params.success,
        params.durationMs || null,
        params.errorMessage || null,
        params.conversationId || null,
      ]
    );
  } catch (error) {
    // Don't let logging failures break tool execution
    console.error('[ToolLogger] Failed to log tool call:', error);
  }
}

/**
 * Get recent tool calls
 */
export async function getToolCallHistory(params: {
  since?: Date;
  limit?: number;
  toolName?: string;
  successOnly?: boolean;
}): Promise<ToolCallLog[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.since) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(params.since);
  }

  if (params.toolName) {
    conditions.push(`tool_name = $${paramIndex++}`);
    values.push(params.toolName);
  }

  if (params.successOnly !== undefined) {
    conditions.push(`success = $${paramIndex++}`);
    values.push(params.successOnly);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 100;

  const result = await pool.query(
    `SELECT id, tool_name, arguments, result_summary, success, duration_ms, error_message, conversation_id, created_at
     FROM tool_calls
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    values
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    toolName: row.tool_name as string,
    arguments: row.arguments as Record<string, unknown>,
    resultSummary: row.result_summary as string | null,
    success: row.success as boolean,
    durationMs: row.duration_ms as number | null,
    errorMessage: row.error_message as string | null,
    conversationId: row.conversation_id as string | null,
    createdAt: row.created_at as Date,
  }));
}

/**
 * Get tool call statistics
 */
export async function getToolCallStats(since?: Date): Promise<{
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgDurationMs: number;
  byTool: Array<{ toolName: string; count: number; avgDuration: number; failures: number }>;
}> {
  const sinceClause = since ? 'WHERE created_at >= $1' : '';
  const values = since ? [since] : [];

  // Overall stats
  const overallResult = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE success = true) as successful,
       COUNT(*) FILTER (WHERE success = false) as failed,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration
     FROM tool_calls ${sinceClause}`,
    values
  );

  // Per-tool stats
  const byToolResult = await pool.query(
    `SELECT
       tool_name,
       COUNT(*) as count,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration,
       COUNT(*) FILTER (WHERE success = false) as failures
     FROM tool_calls ${sinceClause}
     GROUP BY tool_name
     ORDER BY count DESC`,
    values
  );

  const overall = overallResult.rows[0];
  return {
    totalCalls: parseInt(overall.total) || 0,
    successfulCalls: parseInt(overall.successful) || 0,
    failedCalls: parseInt(overall.failed) || 0,
    avgDurationMs: parseFloat(overall.avg_duration) || 0,
    byTool: byToolResult.rows.map((row: Record<string, unknown>) => ({
      toolName: row.tool_name as string,
      count: parseInt(row.count as string),
      avgDuration: parseFloat(row.avg_duration as string) || 0,
      failures: parseInt(row.failures as string),
    })),
  };
}
