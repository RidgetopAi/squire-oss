/**
 * User Identity Service
 *
 * Manages the locked user identity for this Squire instance.
 * Once a name is set and locked, it cannot be changed except through
 * explicit user command (rename).
 *
 * Design principle: One user per database, identity is immutable.
 */

import { pool } from '../db/pool.js';

// === TYPES ===

export interface UserIdentity {
  id: string;
  name: string;
  is_locked: boolean;
  locked_at: Date;
  source: IdentitySource;
  created_at: Date;
  updated_at: Date;
  previous_names: PreviousName[];
}

export type IdentitySource =
  | 'auto_detection'
  | 'onboarding'
  | 'manual'
  | 'import'
  | 'rename_command';

export interface PreviousName {
  name: string;
  changed_at: string;
  reason: string;
}

// === CORE FUNCTIONS ===

/**
 * Get the current user identity (if set)
 * Returns null if no identity has been established yet
 */
export async function getUserIdentity(): Promise<UserIdentity | null> {
  const result = await pool.query(`
    SELECT id, name, is_locked, locked_at, source, created_at, updated_at, previous_names
    FROM user_identity
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    is_locked: row.is_locked,
    locked_at: new Date(row.locked_at),
    source: row.source as IdentitySource,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    previous_names: row.previous_names || [],
  };
}

/**
 * Set the initial user identity
 * Only works if no identity exists yet
 * Automatically locks the identity
 */
export async function setInitialIdentity(
  name: string,
  source: IdentitySource = 'auto_detection'
): Promise<UserIdentity> {
  // Check if identity already exists
  const existing = await getUserIdentity();
  if (existing) {
    throw new Error(
      `Identity already established as "${existing.name}". Use renameUser() to change.`
    );
  }

  const result = await pool.query(
    `INSERT INTO user_identity (name, source, is_locked, locked_at)
     VALUES ($1, $2, TRUE, NOW())
     RETURNING id, name, is_locked, locked_at, source, created_at, updated_at, previous_names`,
    [name.trim(), source]
  );

  const row = result.rows[0];
  console.log(`[Identity] Initial identity set: "${name}" (source: ${source})`);

  return {
    id: row.id,
    name: row.name,
    is_locked: row.is_locked,
    locked_at: new Date(row.locked_at),
    source: row.source as IdentitySource,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    previous_names: row.previous_names || [],
  };
}

/**
 * Rename the user (explicit action only)
 * Records the previous name in history
 */
export async function renameUser(
  newName: string,
  reason: string = 'User requested rename'
): Promise<UserIdentity> {
  const existing = await getUserIdentity();
  if (!existing) {
    // No existing identity - just set initial
    return setInitialIdentity(newName, 'rename_command');
  }

  const previousEntry: PreviousName = {
    name: existing.name,
    changed_at: new Date().toISOString(),
    reason,
  };

  const result = await pool.query(
    `UPDATE user_identity
     SET name = $1,
         source = 'rename_command',
         updated_at = NOW(),
         previous_names = previous_names || $2::jsonb
     RETURNING id, name, is_locked, locked_at, source, created_at, updated_at, previous_names`,
    [newName.trim(), JSON.stringify(previousEntry)]
  );

  const row = result.rows[0];
  console.log(`[Identity] User renamed: "${existing.name}" -> "${newName}" (reason: ${reason})`);

  return {
    id: row.id,
    name: row.name,
    is_locked: row.is_locked,
    locked_at: new Date(row.locked_at),
    source: row.source as IdentitySource,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
    previous_names: row.previous_names || [],
  };
}

/**
 * Unlock identity (for admin/testing purposes only)
 * This allows identity detection to run again
 */
export async function unlockIdentity(): Promise<void> {
  await pool.query(`
    UPDATE user_identity
    SET is_locked = FALSE, updated_at = NOW()
  `);
  console.log('[Identity] Identity unlocked - detection will run again');
}

/**
 * Lock identity (prevent further changes)
 */
export async function lockIdentity(): Promise<void> {
  await pool.query(`
    UPDATE user_identity
    SET is_locked = TRUE, locked_at = NOW(), updated_at = NOW()
  `);
  console.log('[Identity] Identity locked');
}

/**
 * Migrate identity from personality summary (one-time operation)
 * Extracts name from existing personality summary and locks it
 */
export async function migrateFromPersonalitySummary(): Promise<UserIdentity | null> {
  // Check if identity already exists
  const existing = await getUserIdentity();
  if (existing) {
    console.log(`[Identity] Identity already set: "${existing.name}" - skipping migration`);
    return existing;
  }

  // Get personality summary
  const result = await pool.query(`
    SELECT content FROM living_summaries WHERE category = 'personality' LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.log('[Identity] No personality summary found - skipping migration');
    return null;
  }

  const content = result.rows[0].content as string;

  // Try to extract name from various patterns
  const patterns = [
    /Your name is (\w+)/i,
    /You're (\w+),/i,
    /You are (\w+),/i,
    /You're (\w+)\./i,
    /You are (\w+)\./i,
    /(\w+) is your name/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const name = match[1];
      // Validate it looks like a name (not a common word)
      const invalidNames = new Set([
        'the', 'a', 'an', 'your', 'my', 'their', 'his', 'her', 'its',
        'this', 'that', 'here', 'there', 'now', 'then',
      ]);
      if (!invalidNames.has(name.toLowerCase())) {
        console.log(`[Identity] Migrating name from personality summary: "${name}"`);
        return setInitialIdentity(name, 'import');
      }
    }
  }

  console.log('[Identity] Could not extract name from personality summary');
  return null;
}
