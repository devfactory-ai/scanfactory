const API_BASE = '/api';

interface ApiError {
  code: string;
  message: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage on init
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: HeadersInit = {
      ...options.headers,
    };

    // Add content-type for JSON requests (not for FormData)
    if (!(options.body instanceof FormData)) {
      (headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    // Add auth token if available
    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: ApiError };
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
  async login(email: string, password: string) {
    const result = await this.request<{
      token: string;
      user: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'operator' | 'consultant';
      };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(result.token);
    return result;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getMe() {
    return this.request<{
      user: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'operator' | 'consultant';
      };
    }>('/auth/me');
  }

  async refreshToken() {
    const result = await this.request<{
      token: string;
      user: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'operator' | 'consultant';
      };
    }>('/auth/refresh', { method: 'POST' });
    this.setToken(result.token);
    return result;
  }

  // Pipelines
  async getPipelines() {
    return this.request<{
      pipelines: Array<{
        id: string;
        name: string;
        display_name: string;
        description: string | null;
      }>;
    }>('/admin/pipelines');
  }

  // Documents
  async scanDocument(file: File, pipeline: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pipeline', pipeline);

    return this.request<{
      id: string;
      pipeline: {
        id: string;
        name: string;
        display_name: string;
      };
      batch: {
        id: string;
        group_key: string;
        group_label: string;
      };
      status: string;
      extracted_data: Record<string, unknown>;
      confidence_score: number;
      extraction_modes: {
        replace: string[];
        table: string[];
        direct: string[];
      };
      scan_url: string;
    }>('/documents/scan', {
      method: 'POST',
      body: formData,
    });
  }

  // Validation
  async getValidationQueue(params: {
    pipeline_id?: string;
    status?: string;
    min_confidence?: number;
    max_confidence?: number;
    batch_id?: string;
    sort_by?: 'created_at' | 'confidence_score';
    sort_order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  } = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const query = searchParams.toString();
    return this.request<{
      documents: Array<{
        id: string;
        pipeline_id: string;
        pipeline_name: string;
        pipeline_display_name: string;
        batch_id: string | null;
        status: string;
        extracted_data: Record<string, unknown>;
        computed_data: Record<string, unknown> | null;
        confidence_score: number | null;
        anomalies: Array<{ type: string; message: string; severity: string }> | null;
        created_at: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/validation/queue${query ? `?${query}` : ''}`);
  }

  async getDocument(id: string) {
    return this.request<{
      document: {
        id: string;
        pipeline_id: string;
        pipeline_name: string;
        pipeline_display_name: string;
        batch_id: string | null;
        status: string;
        extracted_data: Record<string, unknown>;
        computed_data: Record<string, unknown> | null;
        confidence_score: number | null;
        extraction_modes: { replace: string[]; table: string[]; direct: string[] } | null;
        anomalies: Array<{ type: string; message: string; severity: string }> | null;
        created_at: string;
        updated_at: string;
      };
      field_display: {
        groups: Array<{
          name: string;
          label: string;
          fields: string[];
        }>;
      } | null;
      scan_url: string;
    }>(`/validation/${id}`);
  }

  async updateDocument(
    id: string,
    data: {
      extracted_data?: Record<string, unknown>;
      action?: 'validate' | 'reject';
    }
  ) {
    return this.request<{
      document: {
        id: string;
        status: string;
        extracted_data: Record<string, unknown>;
      };
    }>(`/validation/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async batchValidate(documentIds: string[], action: 'validate' | 'reject') {
    return this.request<{
      results: Array<{ id: string; success: boolean; error?: string }>;
      success_count: number;
      error_count: number;
    }>('/validation/batch', {
      method: 'POST',
      body: JSON.stringify({ document_ids: documentIds, action }),
    });
  }

  // Get scan image URL
  getScanUrl(documentId: string): string {
    return `${API_BASE}/documents/${documentId}/scan`;
  }
}

export const api = new ApiClient();
