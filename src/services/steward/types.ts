// ========================================
// Types
// ========================================

export type ServiceStatus = 'active' | 'inactive' | 'failed' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  error?: string;
}

export interface EndpointHealth {
  url: string;
  status: 'healthy' | 'unhealthy' | 'unreachable';
  responseTime?: number;
  error?: string;
}

export interface ErrorEntry {
  timestamp: Date;
  source: string;
  message: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: ServiceHealth[];
  endpoints: EndpointHealth[];
  recentErrors: ErrorEntry[];
  checkedAt: Date;
}
