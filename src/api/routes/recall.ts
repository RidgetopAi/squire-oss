/**
 * Enhanced Recall API Route
 *
 * POST /api/recall - Full enhanced recall pipeline (BM25 + vector + entity + graph + reranker)
 * Also returns beliefs and supports date-range filtering.
 */

import { Router, Request, Response } from 'express';
import { enhancedRecall } from '../../services/chat/enhancedRecall.js';
import { generateEmbedding } from '../../providers/embeddings.js';
import { getAllBeliefs } from '../../services/knowledge/beliefs.js';
import { pool } from '../../db/pool.js';

const router = Router();

interface RecallRequest {
  query: string;
  maxResults?: number;
  includeBeliefs?: boolean;
  dateRangeStart?: string;  // ISO date string
  dateRangeEnd?: string;    // ISO date string
  minSalience?: number;
  minStrength?: number;
  lookbackDays?: number;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as RecallRequest;

    if (!body.query || typeof body.query !== 'string') {
      res.status(400).json({ error: 'query is required' });
      return;
    }

    const maxResults = body.maxResults ?? 20;

    // Generate query embedding for hybrid search
    let queryEmbedding: number[] | undefined;
    try {
      queryEmbedding = await generateEmbedding(body.query);
    } catch (err) {
      console.error('[Recall API] Embedding generation failed, proceeding with BM25 only:', err);
    }

    // Run enhanced recall (BM25 + vector + entity matching + graph propagation + reranker)
    const recallResult = await enhancedRecall(body.query, {
      maxResults,
      queryEmbedding,
      minSalience: body.minSalience ?? 0.0,  // Low floor for eval — don't filter out low-salience memories
      minStrength: body.minStrength ?? 0.0,
      lookbackDays: body.lookbackDays ?? 3650, // 10 years
    });

    let memories = recallResult.memories;

    // Optional: date-range filter (for temporal queries)
    if (body.dateRangeStart || body.dateRangeEnd) {
      const rangeStart = body.dateRangeStart ? new Date(body.dateRangeStart) : new Date(0);
      const rangeEnd = body.dateRangeEnd ? new Date(body.dateRangeEnd) : new Date();

      // Also fetch memories by date range that may not have been found by BM25/vector
      const dateResult = await pool.query(
        `SELECT id, content, created_at, occurred_at, salience_score, current_strength
         FROM memories
         WHERE occurred_at >= $1 AND occurred_at <= $2
         ORDER BY occurred_at DESC
         LIMIT $3`,
        [rangeStart, rangeEnd, maxResults],
      );

      // Merge date-range results with recall results (deduplicate by id)
      const existingIds = new Set(memories.map(m => m.id));
      for (const row of dateResult.rows) {
        if (!existingIds.has(row.id)) {
          memories.push({
            id: row.id,
            content: row.content,
            created_at: row.created_at,
            salience_score: row.salience_score,
            current_strength: row.current_strength,
            bm25Score: 0,
            entityScore: 0,
            bridgeScore: 0,
            propagationScore: 0,
            totalScore: 1, // minimal score so it shows up
          });
        }
      }
    }

    // Optional: include beliefs for preference-type queries
    let beliefs: any[] = [];
    if (body.includeBeliefs) {
      try {
        beliefs = await getAllBeliefs({ limit: 50 });
      } catch (err) {
        console.error('[Recall API] Beliefs fetch failed:', err);
      }
    }

    res.json({
      memories,
      beliefs,
      stats: recallResult.stats,
      count: memories.length,
    });
  } catch (error) {
    console.error('[Recall API] Error:', error);
    res.status(500).json({ error: 'Enhanced recall failed' });
  }
});

export default router;
