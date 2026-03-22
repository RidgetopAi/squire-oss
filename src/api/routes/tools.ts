/**
 * Tool History API Routes
 *
 * Provides endpoints for querying tool call history and statistics.
 */

import { Router, Request, Response } from 'express';
import { getToolCallHistory, getToolCallStats } from '../../services/tool-logger.js';

const router = Router();

/**
 * GET /api/tools/history
 * Get recent tool calls
 *
 * Query params:
 * - since: ISO date string or duration like "1h", "24h", "7d"
 * - limit: max number of results (default 100)
 * - tool: filter by tool name
 * - failures: if "true", only show failed calls
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { since, limit, tool, failures } = req.query;

    // Parse since parameter
    let sinceDate: Date | undefined;
    if (since) {
      const sinceStr = String(since);
      // Check for duration format like "1h", "24h", "7d"
      const durationMatch = sinceStr.match(/^(\d+)(m|h|d)$/);
      if (durationMatch && durationMatch[1] && durationMatch[2]) {
        const amount = parseInt(durationMatch[1]);
        const unit = durationMatch[2] as 'm' | 'h' | 'd';
        const now = Date.now();
        const msPerUnit = { m: 60000, h: 3600000, d: 86400000 };
        sinceDate = new Date(now - amount * msPerUnit[unit]);
      } else {
        // Try parsing as ISO date
        sinceDate = new Date(sinceStr);
        if (isNaN(sinceDate.getTime())) {
          sinceDate = undefined;
        }
      }
    }

    const history = await getToolCallHistory({
      since: sinceDate,
      limit: limit ? parseInt(String(limit)) : 100,
      toolName: tool ? String(tool) : undefined,
      successOnly: failures === 'true' ? false : undefined,
    });

    res.json({
      count: history.length,
      since: sinceDate?.toISOString() || null,
      calls: history,
    });
  } catch (error) {
    console.error('[Tools API] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch tool history' });
  }
});

/**
 * GET /api/tools/stats
 * Get tool call statistics
 *
 * Query params:
 * - since: ISO date string or duration like "1h", "24h", "7d"
 */
router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { since } = req.query;

    // Parse since parameter (same logic as above)
    let sinceDate: Date | undefined;
    if (since) {
      const sinceStr = String(since);
      const durationMatch = sinceStr.match(/^(\d+)(m|h|d)$/);
      if (durationMatch && durationMatch[1] && durationMatch[2]) {
        const amount = parseInt(durationMatch[1]);
        const unit = durationMatch[2] as 'm' | 'h' | 'd';
        const now = Date.now();
        const msPerUnit = { m: 60000, h: 3600000, d: 86400000 };
        sinceDate = new Date(now - amount * msPerUnit[unit]);
      } else {
        sinceDate = new Date(sinceStr);
        if (isNaN(sinceDate.getTime())) {
          sinceDate = undefined;
        }
      }
    }

    const stats = await getToolCallStats(sinceDate);

    res.json({
      since: sinceDate?.toISOString() || 'all time',
      ...stats,
    });
  } catch (error) {
    console.error('[Tools API] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch tool stats' });
  }
});

export default router;
