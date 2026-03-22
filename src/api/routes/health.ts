import { Router, Request, Response } from 'express';
import { checkConnection } from '../../db/pool.js';
import { checkEmbeddingHealth } from '../../providers/embeddings.js';
import { config } from '../../config/index.js';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const [dbHealthy, embeddingHealthy] = await Promise.all([
    checkConnection(),
    checkEmbeddingHealth(),
  ]);

  const allHealthy = dbHealthy && embeddingHealthy;

  const status = {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : 'disconnected',
    embedding: {
      status: embeddingHealthy ? 'connected' : 'disconnected',
      provider: config.embedding.provider,
      model: config.embedding.model,
      dimension: config.embedding.dimension,
    },
    version: '0.1.0',
  };

  res.status(allHealthy ? 200 : 503).json(status);
});

export default router;
