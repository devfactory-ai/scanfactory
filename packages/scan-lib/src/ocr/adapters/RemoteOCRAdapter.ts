import type { ExtractionResult, FieldExtraction, TableExtraction } from '../../types';
import type { OCRAdapter } from '../OCRManager';

interface RemoteOCRConfig {
  endpoint?: string;
  timeout: number;
  retries: number;
  getAuthToken?: () => Promise<string>;
}

interface APIFieldResponse {
  name: string;
  value: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface APITableResponse {
  rows: Array<{
    cells: string[];
    confidence: number;
  }>;
  headers?: string[];
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface APIResponse {
  success: boolean;
  data?: {
    fields: APIFieldResponse[];
    tables?: APITableResponse[];
    rawText: string;
    confidence: number;
  };
  error?: string;
}

/**
 * Remote OCR Adapter
 *
 * Sends images to backend API for OCR processing.
 * Handles authentication, retry logic, and error handling.
 */
export class RemoteOCRAdapter implements OCRAdapter {
  private config: RemoteOCRConfig;
  private abortController: AbortController | null = null;

  constructor(config: RemoteOCRConfig) {
    this.config = config;
  }

  /**
   * Extract data from image using remote API
   */
  async extract(imageUri: string): Promise<ExtractionResult> {
    const endpoint = this.config.endpoint || '/api/ocr/extract';

    let lastError: Error | null = null;

    // Retry loop
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        return await this.doExtract(imageUri, endpoint);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.config.retries) {
          // Wait before retry with exponential backoff
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'OCR extraction failed after retries',
      fields: [] as FieldExtraction[],
      rawText: '',
      confidence: 0,
    };
  }

  /**
   * Check if remote API is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Check if we can get auth token
      if (this.config.getAuthToken) {
        await this.config.getAuthToken();
      }

      // Could also ping health endpoint
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cancel ongoing request
   */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  // Private methods

  private async doExtract(imageUri: string, endpoint: string): Promise<ExtractionResult> {
    this.abortController = new AbortController();

    // Get auth token
    let authToken: string | undefined;
    if (this.config.getAuthToken) {
      authToken = await this.config.getAuthToken();
    }

    // Prepare form data
    const formData = new FormData();

    // Handle different URI types
    if (imageUri.startsWith('data:')) {
      // Base64 data URI
      const blob = await this.dataURItoBlob(imageUri);
      formData.append('image', blob, 'document.jpg');
    } else if (imageUri.startsWith('file://') || imageUri.startsWith('/')) {
      // Local file - need to read as blob
      // In React Native, use fetch to read local file
      const response = await fetch(imageUri);
      const blob = await response.blob();
      formData.append('image', blob, 'document.jpg');
    } else {
      // Assume it's already a URL
      formData.append('imageUrl', imageUri);
    }

    // Make request
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: formData,
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status} ${response.statusText}`);
    }

    const apiResponse: APIResponse = await response.json();

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.error || 'OCR extraction failed');
    }

    // Transform API response to ExtractionResult
    return this.transformResponse(apiResponse.data);
  }

  private transformResponse(data: NonNullable<APIResponse['data']>): ExtractionResult {
    const fields: FieldExtraction[] = data.fields.map((f: APIFieldResponse) => ({
      name: f.name,
      value: f.value,
      confidence: f.confidence,
      boundingBox: f.boundingBox,
    }));

    const tables: TableExtraction[] | undefined = data.tables?.map((t: APITableResponse) => ({
      rows: t.rows.map((r) => ({
        cells: r.cells,
        confidence: r.confidence,
      })),
      headers: t.headers,
      confidence: t.confidence,
      boundingBox: t.boundingBox,
    }));

    return {
      success: true,
      fields,
      tables,
      rawText: data.rawText,
      confidence: data.confidence,
    };
  }

  private async dataURItoBlob(dataURI: string): Promise<Blob> {
    const [header, base64] = dataURI.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const byteString = atob(base64);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);

    for (let i = 0; i < byteString.length; i++) {
      uint8Array[i] = byteString.charCodeAt(i);
    }

    return new Blob([arrayBuffer], { type: mime });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
