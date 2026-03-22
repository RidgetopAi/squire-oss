/**
 * Email Cache Service
 *
 * Local storage for emails ingested during periodic checks.
 * Enables search and retrieval after emails are marked read on Gmail.
 */

import { pool } from '../db/pool.js';
import type { Email, EmailFull } from './google/gmail.js';
import type { EmailSummary } from './courier/summarizer.js';

export interface CachedEmail {
  gmail_id: string;
  thread_id: string;
  account_id: string;
  from_address: string;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  snippet: string;
  body: string | null;
  summary: string | null;
  email_date: Date;
  received_at: Date;
}

/**
 * Store emails from a check cycle. Upserts — safe to call on duplicates.
 */
export async function cacheEmails(
  accountId: string,
  emails: Email[],
  summaries: EmailSummary[]
): Promise<number> {
  if (emails.length === 0) return 0;

  const summaryMap = new Map(summaries.map(s => [s.id, s.summary]));

  let stored = 0;
  for (const email of emails) {
    try {
      await pool.query(
        `INSERT INTO emails (gmail_id, thread_id, account_id, from_address, subject, snippet, summary, email_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (gmail_id) DO UPDATE SET
           summary = COALESCE(EXCLUDED.summary, emails.summary)`,
        [
          email.id,
          email.threadId,
          accountId,
          email.from,
          email.subject,
          email.snippet,
          summaryMap.get(email.id) ?? null,
          email.date,
        ]
      );
      stored++;
    } catch (error) {
      console.error(`[EmailCache] Failed to store email ${email.id}:`, error);
    }
  }

  return stored;
}

/**
 * Cache the full body of an email (called after fetching from Gmail).
 */
export async function cacheEmailBody(
  gmailId: string,
  full: EmailFull
): Promise<void> {
  await pool.query(
    `UPDATE emails SET
       body = $1,
       to_addresses = $2,
       cc_addresses = $3
     WHERE gmail_id = $4`,
    [
      full.body,
      JSON.stringify(full.to),
      JSON.stringify(full.cc ?? []),
      gmailId,
    ]
  );
}

/**
 * Get a cached email by Gmail ID.
 */
export async function getCachedEmail(gmailId: string): Promise<CachedEmail | null> {
  const result = await pool.query(
    'SELECT * FROM emails WHERE gmail_id = $1',
    [gmailId]
  );
  return result.rows[0] ?? null;
}

/**
 * List cached emails, newest first.
 */
export async function listCachedEmails(options?: {
  limit?: number;
  offset?: number;
  from?: string;
  since?: Date;
}): Promise<CachedEmail[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (options?.from) {
    conditions.push(`from_address ILIKE $${paramIdx}`);
    params.push(`%${options.from}%`);
    paramIdx++;
  }

  if (options?.since) {
    conditions.push(`email_date >= $${paramIdx}`);
    params.push(options.since);
    paramIdx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const limit = Math.min(options?.limit ?? 20, 50);
  const offset = options?.offset ?? 0;

  const result = await pool.query(
    `SELECT * FROM emails ${where} ORDER BY email_date DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return result.rows;
}

/**
 * Full-text search across cached emails.
 */
export async function searchEmails(
  query: string,
  limit = 10
): Promise<CachedEmail[]> {
  const result = await pool.query(
    `SELECT *, ts_rank(
       to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(from_address, '') || ' ' || coalesce(body, '')),
       plainto_tsquery('english', $1)
     ) AS rank
     FROM emails
     WHERE to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(snippet, '') || ' ' || coalesce(from_address, '') || ' ' || coalesce(body, ''))
           @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC, email_date DESC
     LIMIT $2`,
    [query, limit]
  );

  return result.rows;
}

/**
 * Get total count of cached emails.
 */
export async function getEmailCount(): Promise<number> {
  const result = await pool.query('SELECT count(*) FROM emails');
  return parseInt(result.rows[0].count, 10);
}
