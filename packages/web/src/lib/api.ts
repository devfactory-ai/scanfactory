const API_BASE = '/api';

interface ApiError {
  code: string;
  message: string;
}

class ApiClient {
  private csrfToken: string | null = null;

  /**
   * Fetch CSRF token from server (needed for state-changing requests)
   */
  async fetchCsrfToken(): Promise<string> {
    if (this.csrfToken) {
      return this.csrfToken;
    }

    const response = await fetch(`${API_BASE}/csrf-token`, {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch CSRF token');
    }

    const data = await response.json() as { csrfToken: string };
    this.csrfToken = data.csrfToken;
    return this.csrfToken;
  }

  /**
   * Clear CSRF token (should be called after state-changing requests
   * since token is rotated server-side)
   */
  clearCsrfToken(): void {
    this.csrfToken = null;
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

    // Add CSRF token for state-changing requests (POST, PUT, DELETE, PATCH)
    const method = options.method?.toUpperCase() ?? 'GET';
    const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);

    if (needsCsrf) {
      const csrfToken = await this.fetchCsrfToken();
      (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Send cookies with requests
    });

    // Clear CSRF token after state-changing request (server rotates it)
    if (needsCsrf) {
      this.clearCsrfToken();
    }

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
    return result;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
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
      user: {
        id: string;
        email: string;
        name: string;
        role: 'admin' | 'operator' | 'consultant';
      };
    }>('/auth/refresh', { method: 'POST' });
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

  // Get adjacent documents for navigation
  async getAdjacentDocuments(
    documentId: string,
    pipelineId?: string
  ) {
    const params = new URLSearchParams();
    if (pipelineId) {
      params.append('pipeline_id', pipelineId);
    }
    const query = params.toString();
    return this.request<{
      previous: string | null;
      next: string | null;
      position: number;
      total: number;
    }>(`/validation/${documentId}/adjacent${query ? `?${query}` : ''}`);
  }
}

export const api = new ApiClient();
