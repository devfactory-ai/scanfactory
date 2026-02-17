import * as SecureStore from 'expo-secure-store';

// Configuration
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787/api';
const TOKEN_KEY = 'scanfactory_token';

interface ApiError {
  code: string;
  message: string;
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
   * Make an authenticated API request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
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

    const response = await fetch(`${API_BASE}${endpoint}`, {
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
  }

  // Auth endpoints
  async requestOtp(phone: string): Promise<{ message: string }> {
    return this.request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOtp(phone: string, code: string): Promise<{
    token: string;
    user: {
      id: string;
      phone: string;
      name: string;
      role: 'admin' | 'operator' | 'consultant';
    };
  }> {
    const result = await this.request<{
      token: string;
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
    await this.setToken(result.token);
    return result;
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
