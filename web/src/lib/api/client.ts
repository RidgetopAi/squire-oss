// ============================================
// SQUIRE WEB - API CLIENT
// ============================================
// Base fetch wrapper for backend API

// Use relative URLs in browser (goes through Next.js proxy)
// Use absolute URL only for SSR or when explicitly set
const API_BASE_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  : '';

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface FetchOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text();
    let message = `API Error: ${response.status} ${response.statusText}`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.error || parsed.message || message;
    } catch {
      // Use default message
    }
    throw new ApiError(response.status, response.statusText, message);
  }

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  return JSON.parse(text);
}

function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  // For relative URLs (browser), just use the endpoint directly
  // For absolute URLs (SSR), prepend the base
  let urlString = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      urlString += `?${queryString}`;
    }
  }

  return urlString;
}

export async function apiGet<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    ...fetchOptions,
  });

  return handleResponse<T>(response);
}

export async function apiPost<T, B = unknown>(
  endpoint: string,
  body?: B,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...fetchOptions,
  });

  return handleResponse<T>(response);
}

export async function apiPatch<T, B = unknown>(
  endpoint: string,
  body?: B,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...fetchOptions,
  });

  return handleResponse<T>(response);
}

export async function apiDelete<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { params, ...fetchOptions } = options;
  const url = buildUrl(endpoint, params);

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...fetchOptions.headers,
    },
    ...fetchOptions,
  });

  return handleResponse<T>(response);
}

