import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../../config/index.js';

/**
 * API Key authentication middleware
 *
 * Checks for SQUIRE_API_KEY in either:
 * - x-api-key header
 * - Authorization: Bearer <key> header
 *
 * If SQUIRE_API_KEY is not set in env, authentication is disabled (dev mode).
 * In production (NODE_ENV=production), the server refuses to start without
 * a key (see src/api/server.ts startup checks).
 *
 * Comparison uses crypto.timingSafeEqual to prevent timing-channel
 * key disclosure.
 */

function safeEqual(provided: string, expected: string): boolean {
  // timingSafeEqual requires equal-length buffers; the length check is
  // not itself timing-safe but length is not secret.
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expected),
    );
  } catch {
    return false;
  }
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = config.security.apiKey;

  // If no API key is configured, skip auth (dev mode)
  if (!apiKey) {
    next();
    return;
  }

  // Check x-api-key header
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && safeEqual(headerKey, apiKey)) {
    next();
    return;
  }

  // Check Authorization: Bearer header
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearerKey = authHeader.slice(7);
    if (safeEqual(bearerKey, apiKey)) {
      next();
      return;
    }
  }

  res.status(401).json({ error: 'Unauthorized - invalid or missing API key' });
}

/**
 * Verify a token against the configured API key, in constant time.
 * Used by Socket.IO auth middleware where the request is not an
 * Express Request.
 */
export function verifyApiKey(token: unknown): boolean {
  const apiKey = config.security.apiKey;
  if (!apiKey) return true; // dev mode — no auth configured
  if (typeof token !== 'string') return false;
  return safeEqual(token, apiKey);
}
