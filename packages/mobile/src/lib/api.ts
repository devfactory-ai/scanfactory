import * as SecureStore from 'expo-secure-store';
import { secureFetch, getSecurityStatus } from './security';

// Configuration
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787/api';
const TOKEN_KEY = 'scanfactory_token';

// Log security status on startup (debug)
if (__DEV__) {
  console.log('[API] Security status:', getSecurityStatus());
}

interface ApiError {
  code: string;
  message: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
};

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  // Add jitter (0-25% of the delay)
  const jitter = Math.random() * exponentialDelay * 0.25;
  // Cap at max delay
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    // Retry on network errors and 5xx server errors, but not 4xx client errors
    if (status) {
      return status >= 500 || status === 429; // Server error or rate limited
    }
    // Network errors (no status)
    return true;
  }
  return false;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiClient {
  private token: string | null = null;

  /**
   * Initialize the API client by loading the stored token
   */
  async init(): Promise<void> {
    this.token = await SecureStore.getItemAsync(TOKEN_KEY);
  }

  /**
   * Store or clear the authentication token
   */
  async setToken(token: string | null): Promise<void> {
    this.token = token;
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  }

  /**
   * Get the current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.token !== null;
  }

  /**
   * Make an authenticated API request with retry support
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    const headers: Record<string, string> = {};

    // Add content-type for JSON requests (not for FormData)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    // Add auth token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        // Use secureFetch with certificate pinning validation
        const response = await secureFetch(`${API_BASE}${endpoint}`, {
          ...options,
          headers: {
            ...headers,
            ...options.headers,
          },
        });

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as { error?: ApiError };
          const error = new Error(
            errorData.error?.message ?? `HTTP error ${response.status}`
          ) as Error & { code?: string; status: number };
          error.code = errorData.error?.code;
          error.status = response.status;
          throw error;
        }

        return response.json() as Promise<T>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry if not retryable or last attempt
        if (!isRetryableError(error) || attempt >= retryConfig.maxRetries) {
          throw lastError;
        }

        // Wait before retrying with exponential backoff
        const delay = calculateBackoff(attempt, retryConfig);
        console.log(`Request failed, retrying in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries})`);
        await sleep(delay);
      }
    }

    throw lastError ?? new Error('Request failed after retries');
  }

  // Auth endpoints
  async requestOtp(phone: string): Promise<{ message: string }> {
    return this.request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOtp(phone: string, code: string): Promise<{
    user: {
      id: string;
      phone: string;
      name: string;
      role: 'admin' | 'operator' | 'consultant';
    };
  }> {
    // Note: Token is now set via httpOnly cookie by the server
    // Mobile app still uses Authorization header for backward compatibility
    // The token is returned in response for mobile apps only
    const result = await this.request<{
      token?: string; // Present for mobile backward compatibility
      user: {
        id: string;
        phone: string;
        name: string;
        role: 'admin' | 'operator' | 'consultant';
      };
    }>('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    // For mobile, we still need to store the token since cookies don't work well
    // The server includes the token in the response for mobile clients
    if (result.token) {
      await this.setToken(result.token);
    }
    return { user: result.user };
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      await this.setToken(null);
    }
  }

  // Pipelines
  async getPipelines(): Promise<{
    pipelines: Array<{
      id: string;
      name: string;
      display_name: string;
      description: string | null;
    }>;
  }> {
    return this.request('/admin/pipelines');
  }

  // Documents
  async scanDocument(
    imageUri: string,
    pipelineId: string
  ): Promise<{
    id: string;
    pipeline: { id: string; name: string; display_name: string };
    batch: { id: string; group_key: string; group_label: string };
    status: string;
    extracted_data: Record<string, unknown>;
    confidence_score: number;
  }> {
    const formData = new FormData();

    // Read the image and append to form data
    const filename = imageUri.split('/').pop() ?? 'scan.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('file', {
      uri: imageUri,
      name: filename,
      type,
    } as unknown as Blob);
    formData.append('pipeline', pipelineId);

    return this.request('/documents/scan', {
      method: 'POST',
      body: formData,
    });
  }

  // History
  async getMyDocuments(options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    documents: Array<{
      id: string;
      pipeline_name: string;
      pipeline_display_name: string;
      status: string;
      confidence_score: number | null;
      created_at: string;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', String(options.limit));
    if (options.offset) params.append('offset', String(options.offset));
    const query = params.toString();
    return this.request(`/documents/mine${query ? `?${query}` : ''}`);
  }
}

export const api = new ApiClient();
