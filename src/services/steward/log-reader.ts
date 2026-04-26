import { execSync } from 'child_process';
import type { ErrorEntry } from './types.js';

// ========================================
// Log Reading
// ========================================

const MAX_LOG_LINES = 100;
const MAX_ERRORS = 10;

/**
 * Read recent errors from journalctl for squire service
 */
function readJournalctlErrors(): ErrorEntry[] {
  const errors: ErrorEntry[] = [];

  try {
    // Get last 100 lines from squire service journal
    const output = execSync(
      `journalctl -u squire -n ${MAX_LOG_LINES} --no-pager -o json`,
      {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1024 * 1024, // 1MB buffer
      }
    );

    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as {
          PRIORITY?: string;
          MESSAGE?: string;
          __REALTIME_TIMESTAMP?: string;
        };

        // Check priority level (error is 3, warning is 4)
        const isError =
          entry.PRIORITY === '3' ||
          entry.PRIORITY === '4' ||
          (entry.MESSAGE && (
            entry.MESSAGE.toLowerCase().includes('error') ||
            entry.MESSAGE.toLowerCase().includes('exception') ||
            entry.MESSAGE.toLowerCase().includes('failed')
          ));

        if (isError && entry.MESSAGE) {
          const timestamp = entry.__REALTIME_TIMESTAMP
            ? new Date(parseInt(entry.__REALTIME_TIMESTAMP) / 1000)
            : new Date();

          errors.push({
            timestamp,
            source: 'journalctl:squire',
            message: entry.MESSAGE.trim(),
          });

          if (errors.length >= MAX_ERRORS) break;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  } catch {
    // Silently fail if journalctl is not available or service doesn't exist
  }

  return errors;
}

/**
 * Get all recent errors from log sources
 */
export async function getRecentErrors(): Promise<ErrorEntry[]> {
  const journalErrors = readJournalctlErrors();

  // Sort by timestamp (newest first)
  journalErrors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Return top MAX_ERRORS
  return journalErrors.slice(0, MAX_ERRORS);
}
