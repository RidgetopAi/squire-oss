import { checkServices, checkEndpoints } from './health-checker.js';
import { getRecentErrors } from './log-reader.js';
import type { SystemHealth } from './types.js';

// ========================================
// Main Export
// ========================================

/**
 * Get comprehensive system health information
 *
 * Checks:
 * - systemd services (squire, mandrel, mandrel-command)
 * - Health endpoints (Squire API, Mandrel)
 * - Recent errors from logs (mandrel-mcp.log, journalctl)
 *
 * @returns SystemHealth object with overall status and detailed checks
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  // Run all checks in parallel
  const [services, endpoints, recentErrors] = await Promise.all([
    checkServices(),
    checkEndpoints(),
    getRecentErrors(),
  ]);

  // Determine overall status
  let status: SystemHealth['status'] = 'healthy';

  // Check if any critical services are down
  const hasFailedService = services.some(
    (s) => s.status === 'failed' || s.status === 'inactive'
  );

  // Check if any endpoints are unhealthy
  const hasUnhealthyEndpoint = endpoints.some(
    (e) => e.status === 'unhealthy' || e.status === 'unreachable'
  );

  if (hasFailedService || hasUnhealthyEndpoint) {
    status = 'unhealthy';
  } else if (services.some((s) => s.status === 'unknown') || recentErrors.length > 5) {
    status = 'degraded';
  }

  return {
    status,
    services,
    endpoints,
    recentErrors,
    checkedAt: new Date(),
  };
}

// Re-export types
export type {
  SystemHealth,
  ServiceHealth,
  EndpointHealth,
  ErrorEntry,
  ServiceStatus,
} from './types.js';
