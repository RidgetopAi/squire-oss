import { Request, Response, NextFunction } from 'express';
import { config } from '../../config/index.js';

/**
 * API Key authentication middleware
 *
 * Checks for SQUIRE_API_KEY in either:
 * - x-api-key header
 * - Authorization: Bearer <key> header
 *
 * If SQUIRE_API_KEY is not set in env, authentication is disabled (dev mode).
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = config.security.apiKey;

  // If no API key is configured, skip auth (dev mode)
  if (!apiKey) {
    next();
    return;
  }

  // Check x-api-key header
  const headerKey = req.headers['x-api-key'];
  if (headerKey === apiKey) {
    next();
    return;
  }

  // Check Authorization: Bearer header
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    const bearerKey = authHeader.slice(7);
    if (bearerKey === apiKey) {
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Unauthorized - invalid or missing API key' });
}
