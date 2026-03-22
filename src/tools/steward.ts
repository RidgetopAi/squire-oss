/**
 * Steward Health Check Tool
 *
 * Provides system health information to the LLM.
 * Checks services, endpoints, and recent errors.
 */

import { getSystemHealth } from '../services/steward/index.js';
import type { ToolHandler, ToolSpec } from './types.js';

// === TYPES ===

interface StewardHealthCheckArgs {
  verbose?: boolean;
}

// === HANDLER ===

async function stewardHealthCheck(args: StewardHealthCheckArgs): Promise<string> {
  const verbose = args.verbose ?? false;

  try {
    const health = await getSystemHealth();

    // Build output
    const lines: string[] = [];

    // Overall status
    lines.push(`System Status: ${health.status.toUpperCase()}`);
    lines.push(`Checked At: ${health.checkedAt.toISOString()}`);
    lines.push('');

    // Services
    lines.push('Services:');
    for (const service of health.services) {
      const statusIcon = service.status === 'active' ? '✓' : '✗';
      lines.push(`  ${statusIcon} ${service.name}: ${service.status}`);
      if (verbose && service.error) {
        lines.push(`    Error: ${service.error}`);
      }
    }
    lines.push('');

    // Endpoints
    lines.push('Endpoints:');
    for (const endpoint of health.endpoints) {
      const statusIcon = endpoint.status === 'healthy' ? '✓' : '✗';
      const responseTime = endpoint.responseTime ? ` (${endpoint.responseTime}ms)` : '';
      lines.push(`  ${statusIcon} ${endpoint.url}: ${endpoint.status}${responseTime}`);
      if (verbose && endpoint.error) {
        lines.push(`    Error: ${endpoint.error}`);
      }
    }

    // Recent errors (only in verbose mode or if there are errors)
    if (health.recentErrors.length > 0) {
      lines.push('');
      lines.push(`Recent Errors (${health.recentErrors.length}):`);
      const errorsToShow = verbose ? health.recentErrors : health.recentErrors.slice(0, 3);
      for (const error of errorsToShow) {
        lines.push(`  - [${error.source}] ${error.message}`);
        if (verbose && error.timestamp) {
          lines.push(`    at ${error.timestamp}`);
        }
      }
      if (!verbose && health.recentErrors.length > 3) {
        lines.push(`  ... and ${health.recentErrors.length - 3} more (use verbose=true to see all)`);
      }
    }

    return lines.join('\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Error checking system health: ${message}`;
  }
}

// === TOOL DEFINITION ===

export const tools: ToolSpec[] = [{
  name: 'steward_health_check',
  description: 'Check the health of Squire system services and endpoints. Returns status of systemd services, health endpoints, and recent errors. Use this when troubleshooting issues or verifying system status.',
  parameters: {
    type: 'object',
    properties: {
      verbose: {
        type: 'boolean',
        description: 'If true, includes detailed error messages and all recent errors. Default is false for a concise summary.',
      },
    },
    required: [],
  },
  handler: stewardHealthCheck as ToolHandler,
}];
