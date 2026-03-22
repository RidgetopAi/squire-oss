/**
 * Saved Cards API
 *
 * Save conversation card pairs with tags for later retrieval.
 * Uses the objects + object_tags tables with metadata.type = 'saved_card'.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../../db/pool.js';
import { generateEmbedding } from '../../providers/embeddings.js';

interface IdParams { id: string }

const router = Router();

/**
 * POST /api/saved-cards
 * Save a conversation card pair
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userMessage, assistantContent, reportData, tags = [] } = req.body;

    if (!assistantContent && !reportData) {
      res.status(400).json({ error: 'assistantContent or reportData is required' });
      return;
    }

    // For reports, use report content for search; otherwise use assistant text
    const contentForSearch = reportData
      ? `${reportData.title}\n${reportData.summary}\n${reportData.content}`
      : assistantContent;

    // Generate embedding from the combined content for semantic search
    const searchText = userMessage
      ? `${userMessage}\n\n${contentForSearch}`
      : contentForSearch;
    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(searchText);
    } catch (err) {
      console.warn('[SavedCards] Failed to generate embedding:', err);
    }

    const embeddingStr = embedding ? `[${embedding.join(',')}]` : null;

    // Insert into objects table
    const result = await pool.query(
      `INSERT INTO objects (
        name, filename, mime_type, size_bytes,
        storage_type, storage_path, object_type,
        extracted_text, metadata, embedding,
        processing_status, source, status
      ) VALUES (
        $1, 'saved_card', 'application/json', $2,
        'local', '', 'other',
        $3, $4, $5::vector,
        'completed', 'extract', 'active'
      ) RETURNING id, created_at`,
      [
        // name: first ~80 chars of assistant content
        assistantContent.slice(0, 80).replace(/\n/g, ' '),
        Buffer.byteLength(assistantContent, 'utf8'),
        assistantContent,
        JSON.stringify({
          type: 'saved_card',
          userMessage: userMessage || '',
          ...(reportData ? { reportData } : {}),
        }),
        embeddingStr,
      ]
    );

    const { id, created_at } = result.rows[0];

    // Add tags
    const normalizedTags: string[] = [];
    for (const tag of tags) {
      const normalized = tag.toLowerCase().trim();
      if (!normalized) continue;
      await pool.query(
        `INSERT INTO object_tags (object_id, tag, source)
         VALUES ($1, $2, 'user')
         ON CONFLICT (object_id, tag) DO NOTHING`,
        [id, normalized]
      );
      normalizedTags.push(normalized);
    }

    res.status(201).json({
      id,
      userMessage: userMessage || '',
      assistantContent: assistantContent || '',
      reportData: reportData || undefined,
      tags: normalizedTags,
      createdAt: created_at,
    });
  } catch (error) {
    console.error('[SavedCards] Error saving card:', error);
    res.status(500).json({ error: 'Failed to save card' });
  }
});

/**
 * GET /api/saved-cards
 * List saved cards with optional tag and search filters
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const tag = req.query.tag as string | undefined;
    const q = req.query.q as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Semantic search path
    if (q) {
      let embedding: number[];
      try {
        embedding = await generateEmbedding(q);
      } catch {
        res.status(500).json({ error: 'Failed to generate search embedding' });
        return;
      }

      const embeddingStr = `[${embedding.join(',')}]`;

      let query = `
        SELECT o.id, o.extracted_text, o.metadata, o.created_at,
               1 - (o.embedding <=> $1::vector) as similarity,
               COALESCE(
                 (SELECT json_agg(ot.tag ORDER BY ot.tag)
                  FROM object_tags ot WHERE ot.object_id = o.id), '[]'
               ) as tags
        FROM objects o
        WHERE o.status = 'active'
          AND o.metadata->>'type' = 'saved_card'
          AND o.embedding IS NOT NULL
      `;
      const params: unknown[] = [embeddingStr];
      let paramIndex = 2;

      if (tag) {
        query += ` AND EXISTS (
          SELECT 1 FROM object_tags ot
          WHERE ot.object_id = o.id AND ot.tag = $${paramIndex++}
        )`;
        params.push(tag.toLowerCase().trim());
      }

      query += ` ORDER BY similarity DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);
      const cards = result.rows.map(mapRowToCard);
      res.json({ cards, count: cards.length });
      return;
    }

    // Tag filter or list all
    let query = `
      SELECT o.id, o.extracted_text, o.metadata, o.created_at,
             COALESCE(
               (SELECT json_agg(ot.tag ORDER BY ot.tag)
                FROM object_tags ot WHERE ot.object_id = o.id), '[]'
             ) as tags
      FROM objects o
      WHERE o.status = 'active'
        AND o.metadata->>'type' = 'saved_card'
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (tag) {
      query += ` AND EXISTS (
        SELECT 1 FROM object_tags ot
        WHERE ot.object_id = o.id AND ot.tag = $${paramIndex++}
      )`;
      params.push(tag.toLowerCase().trim());
    }

    query += ` ORDER BY o.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const cards = result.rows.map(mapRowToCard);
    res.json({ cards, count: cards.length });
  } catch (error) {
    console.error('[SavedCards] Error listing cards:', error);
    res.status(500).json({ error: 'Failed to list saved cards' });
  }
});

/**
 * GET /api/saved-cards/tags
 * List all tags with counts
 */
router.get('/tags', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `SELECT ot.tag, COUNT(*) as count
       FROM object_tags ot
       JOIN objects o ON o.id = ot.object_id
       WHERE o.status = 'active'
         AND o.metadata->>'type' = 'saved_card'
       GROUP BY ot.tag
       ORDER BY count DESC, ot.tag`
    );

    res.json({
      tags: result.rows.map((r) => ({ tag: r.tag, count: parseInt(r.count) })),
    });
  } catch (error) {
    console.error('[SavedCards] Error listing tags:', error);
    res.status(500).json({ error: 'Failed to list tags' });
  }
});

/**
 * DELETE /api/saved-cards/:id
 * Remove a saved card (soft delete)
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      `UPDATE objects
       SET status = 'deleted', deleted_at = NOW()
       WHERE id = $1
         AND metadata->>'type' = 'saved_card'
         AND status = 'active'
       RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Saved card not found' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('[SavedCards] Error deleting card:', error);
    res.status(500).json({ error: 'Failed to delete saved card' });
  }
});

// === HELPERS ===

function mapRowToCard(row: Record<string, unknown>) {
  const metadata = row.metadata as Record<string, unknown>;
  return {
    id: row.id as string,
    userMessage: (metadata?.userMessage as string) || '',
    assistantContent: row.extracted_text as string,
    reportData: metadata?.reportData as Record<string, unknown> | undefined,
    tags: (row.tags as string[]) || [],
    similarity: row.similarity ? parseFloat(row.similarity as string) : undefined,
    createdAt: row.created_at as string,
  };
}

export default router;
