import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import type { ErrorEntry } from './types.js';

// ========================================
// Log Reading
// ========================================

const MANDREL_LOG_PATH = process.env['MANDREL_LOG_PATH'] || '/var/log/mandrel-mcp.log';
const MAX_LOG_LINES = 100;
const MAX_ERRORS = 10;

/**
 * Read recent errors from Mandrel MCP log file
 */
function readMandrelLog(): ErrorEntry[] {
  const errors: ErrorEntry[] = [];

  try {
    if (!existsSync(MANDREL_LOG_PATH)) {
      return errors;
    }

    const content = readFileSync(MANDREL_LOG_PATH, 'utf8');
    const lines = content.split('\n').slice(-MAX_LOG_LINES);

    for (const line of lines) {
      if (!line.trim()) continue;

      // Look for common error patterns
      const isError =
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('exception') ||
        line.toLowerCase().includes('failed') ||
        line.toLowerCase().includes('fatal');

      if (isError) {
        // Try to parse timestamp from common log formats
        const timestampMatch = line.match(/^\[?(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})/);
        const timestamp = timestampMatch && timestampMatch[1]
          ? new Date(timestampMatch[1])
          : new Date();

        errors.push({
          timestamp,
          source: 'mandrel-mcp.log',
          message: line.trim(),
        });

        if (errors.length >= MAX_ERRORS) break;
      }
    }
  } catch {
    // Silently fail if we can't read the log file
  }

  return errors;
}

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
  const mandrelErrors = readMandrelLog();
  const journalErrors = readJournalctlErrors();

  // Combine and sort by timestamp (newest first)
  const allErrors = [...mandrelErrors, ...journalErrors];
  allErrors.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Return top MAX_ERRORS
  return allErrors.slice(0, MAX_ERRORS);
}
