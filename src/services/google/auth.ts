import { google } from 'googleapis';
import { pool } from '../../db/pool.js';

// Environment variables for Google OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google/callback';

// Scopes needed for Calendar and Gmail access
const GOOGLE_SCOPES = [
  // Calendar
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  // Gmail
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  // User info
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export interface GoogleAccount {
  id: string;
  google_user_id: string;
  email: string;
  display_name: string | null;
  access_token: string;
  refresh_token: string;
  token_expires_at: Date;
  scopes: string[];
  calendars_sync_token: string | null;
  last_full_sync_at: Date | null;
  sync_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create OAuth2 client with credentials
 */
function createOAuth2Client() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate OAuth URL for user to authorize Google Calendar access
 */
export function getAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent', // Force consent to get refresh token
    state: state,
  });
}

/**
 * Exchange authorization code for tokens and store account
 */
export async function handleOAuthCallback(code: string): Promise<GoogleAccount> {
  const oauth2Client = createOAuth2Client();

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google');
  }

  // Get user info
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();

  if (!userInfo.data.id || !userInfo.data.email) {
    throw new Error('Failed to get user info from Google');
  }

  const tokenExpiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date)
    : new Date(Date.now() + 3600 * 1000); // Default 1 hour

  // Upsert account (update if exists, insert if new)
  const result = await pool.query(`
    INSERT INTO google_accounts (
      google_user_id,
      email,
      display_name,
      access_token,
      refresh_token,
      token_expires_at,
      scopes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (google_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_accounts.refresh_token),
      token_expires_at = EXCLUDED.token_expires_at,
      scopes = EXCLUDED.scopes,
      sync_enabled = TRUE,
      updated_at = NOW()
    RETURNING *
  `, [
    userInfo.data.id,
    userInfo.data.email,
    userInfo.data.name || null,
    tokens.access_token,
    tokens.refresh_token,
    tokenExpiresAt,
    GOOGLE_SCOPES,
  ]);

  return result.rows[0] as GoogleAccount;
}

/**
 * Refresh access token for an account
 */
async function refreshAccessToken(accountId: string): Promise<GoogleAccount> {
  const account = await getAccount(accountId);
  if (!account) {
    throw new Error(`Google account not found: ${accountId}`);
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: account.refresh_token,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const tokenExpiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date)
    : new Date(Date.now() + 3600 * 1000);

  const result = await pool.query(`
    UPDATE google_accounts
    SET access_token = $1,
        token_expires_at = $2,
        updated_at = NOW()
    WHERE id = $3
    RETURNING *
  `, [credentials.access_token, tokenExpiresAt, accountId]);

  return result.rows[0] as GoogleAccount;
}

/**
 * Ensure account has valid (non-expired) access token
 * Refreshes if needed
 */
export async function ensureValidToken(accountId: string): Promise<GoogleAccount> {
  const account = await getAccount(accountId);
  if (!account) {
    throw new Error(`Google account not found: ${accountId}`);
  }

  // Check if token is expired or will expire in next 5 minutes
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  if (account.token_expires_at.getTime() - Date.now() < expiryBuffer) {
    return refreshAccessToken(accountId);
  }

  return account;
}

/**
 * Get authenticated OAuth2 client for an account
 */
export async function getAuthenticatedClient(accountId: string) {
  const account = await ensureValidToken(accountId);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expires_at.getTime(),
  });

  return oauth2Client;
}

/**
 * Get a Google account by ID
 */
export async function getAccount(accountId: string): Promise<GoogleAccount | null> {
  const result = await pool.query(
    'SELECT * FROM google_accounts WHERE id = $1',
    [accountId]
  );
  return result.rows[0] as GoogleAccount || null;
}

/**
 * Get all connected Google accounts
 */
export async function listAccounts(): Promise<GoogleAccount[]> {
  const result = await pool.query(
    'SELECT * FROM google_accounts ORDER BY created_at DESC'
  );
  return result.rows as GoogleAccount[];
}

/**
 * Get all sync-enabled accounts
 */
export async function listSyncEnabledAccounts(): Promise<GoogleAccount[]> {
  const result = await pool.query(
    'SELECT * FROM google_accounts WHERE sync_enabled = TRUE ORDER BY created_at DESC'
  );
  return result.rows as GoogleAccount[];
}

/**
 * Disconnect a Google account (remove from database)
 */
export async function disconnectAccount(accountId: string): Promise<boolean> {
  // Also revoke token with Google
  try {
    const account = await getAccount(accountId);
    if (account) {
      const oauth2Client = createOAuth2Client();
      oauth2Client.setCredentials({
        access_token: account.access_token,
      });
      await oauth2Client.revokeToken(account.access_token);
    }
  } catch (err) {
    // Token revocation is best-effort, continue with deletion
    console.warn('Failed to revoke Google token:', err);
  }

  const result = await pool.query(
    'DELETE FROM google_accounts WHERE id = $1',
    [accountId]
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Update account sync token (after calendar list sync)
 */
export async function updateCalendarsSyncToken(
  accountId: string,
  syncToken: string | null
): Promise<void> {
  await pool.query(`
    UPDATE google_accounts
    SET calendars_sync_token = $1,
        updated_at = NOW()
    WHERE id = $2
  `, [syncToken, accountId]);
}

/**
 * Mark full sync completed
 */
export async function markFullSyncComplete(accountId: string): Promise<void> {
  await pool.query(`
    UPDATE google_accounts
    SET last_full_sync_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
  `, [accountId]);
}

/**
 * Enable/disable sync for an account
 */
export async function setSyncEnabled(accountId: string, enabled: boolean): Promise<void> {
  await pool.query(`
    UPDATE google_accounts
    SET sync_enabled = $1,
        updated_at = NOW()
    WHERE id = $2
  `, [enabled, accountId]);
}

/**
 * Check if Google OAuth is configured
 */
export function isGoogleConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Get connection status for display
 */
export async function getConnectionStatus(): Promise<{
  configured: boolean;
  accounts: Array<{
    id: string;
    email: string;
    display_name: string | null;
    sync_enabled: boolean;
    last_full_sync_at: Date | null;
  }>;
}> {
  const configured = isGoogleConfigured();

  if (!configured) {
    return { configured, accounts: [] };
  }

  const accounts = await listAccounts();

  return {
    configured,
    accounts: accounts.map(a => ({
      id: a.id,
      email: a.email,
      display_name: a.display_name,
      sync_enabled: a.sync_enabled,
      last_full_sync_at: a.last_full_sync_at,
    })),
  };
}
