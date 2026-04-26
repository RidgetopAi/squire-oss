import { execSync } from 'child_process';
import type { ServiceHealth, EndpointHealth, ServiceStatus } from './types.js';

// ========================================
// Service Health Checking
// ========================================

const SERVICES = ['squire', 'mandrel', 'mandrel-command'];

/**
 * Check the status of a systemd service
 */
function checkServiceStatus(serviceName: string): ServiceStatus {
  try {
    const output = execSync(`systemctl is-active ${serviceName}`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();

    if (output === 'active') return 'active';
    if (output === 'inactive') return 'inactive';
    if (output === 'failed') return 'failed';
    return 'unknown';
  } catch (error) {
    // systemctl returns non-zero exit code for non-active services
    const stderr = error instanceof Error && 'stderr' in error
      ? String((error as { stderr: unknown }).stderr)
      : '';

    if (stderr.includes('inactive')) return 'inactive';
    if (stderr.includes('failed')) return 'failed';
    return 'unknown';
  }
}

/**
 * Check all monitored systemd services
 */
export async function checkServices(): Promise<ServiceHealth[]> {
  const results: ServiceHealth[] = [];

  for (const serviceName of SERVICES) {
    try {
      const status = checkServiceStatus(serviceName);
      results.push({
        name: serviceName,
        status,
        error: status === 'failed' ? 'Service has failed' : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name: serviceName,
        status: 'unknown',
        error: message,
      });
    }
  }

  return results;
}

// ========================================
// Endpoint Health Checking
// ========================================

import { config } from '../../config/index.js';

const ENDPOINTS = [
  { url: `http://localhost:${config.server.port}/api/health`, name: 'Squire API' },
  { url: `${config.mandrel.baseUrl}/health`, name: 'Mandrel' },
];

/**
 * Check health of a single endpoint
 */
async function checkEndpoint(
  url: string
): Promise<EndpointHealth> {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        url,
        status: 'healthy',
        responseTime,
      };
    }

    return {
      url,
      status: 'unhealthy',
      responseTime,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    return {
      url,
      status: 'unreachable',
      responseTime,
      error: message,
    };
  }
}

/**
 * Check all monitored endpoints
 */
export async function checkEndpoints(): Promise<EndpointHealth[]> {
  const results = await Promise.all(
    ENDPOINTS.map((endpoint) => checkEndpoint(endpoint.url))
  );

  return results;
}
