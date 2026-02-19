import type { Env } from '../../index';
import type { ExtractionResult, FieldExtraction } from './adapter';

/**
 * Configuration pour le client Modal
 */
interface ModalConfig {
  baseUrl: string;
  timeout?: number;
  /** Secret for HMAC signature (optional, but recommended in production) */
  hmacSecret?: string;
}

/**
 * Réponse de l'endpoint OCR Modal
 */
interface ModalOCRResponse {
  text: string;
  blocks: Array<{
    text: string;
    confidence: number;
    bbox: {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
  }>;
  confidence: number;
  layout_info?: {
    width: number;
    height: number;
    regions: Array<{
      type: string;
      y_start: number;
      y_end: number;
      block_count: number;
    }>;
  };
}

/**
 * Réponse de l'endpoint extraction Modal
 */
interface ModalExtractionResponse {
  success: boolean;
  data?: Record<string, {
    value: unknown;
    confidence: number;
  }>;
  error?: string;
  raw_response?: string;
  model?: string;
}

/**
 * Réponse du pipeline complet Modal
 */
interface ModalDocumentResponse {
  ocr_result: ModalOCRResponse;
  extracted_data: ModalExtractionResponse;
  pipeline: string;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const DEFAULT_TIMEOUT_MS = 60000; // 1 minute

/**
 * Generate HMAC-SHA256 signature for request authentication
 * SEC-06: Authenticate requests to Modal service
 */
async function generateHMACSignature(
  body: string,
  timestamp: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = `${timestamp}.${body}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));

  // Convert to hex string
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Adapter pour le service OCR/Extraction sur Modal
 */
export class ModalOCRAdapter {
  private config: ModalConfig;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.config = {
      baseUrl: env.MODAL_OCR_URL || 'https://devfactory-ai--scanfactory-ocr',
      timeout: DEFAULT_TIMEOUT_MS,
      hmacSecret: env.MODAL_HMAC_SECRET,
    };
  }

  /**
   * Build authenticated headers for Modal requests
   */
  private async buildAuthHeaders(body: string): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add HMAC signature if secret is configured
    if (this.config.hmacSecret) {
      const timestamp = Date.now().toString();
      const signature = await generateHMACSignature(body, timestamp, this.config.hmacSecret);

      headers['X-Modal-Timestamp'] = timestamp;
      headers['X-Modal-Signature'] = signature;
    }

    return headers;
  }

  /**
   * Effectue l'OCR seul sur une image
   */
  async ocr(imageUrl: string, withLayout: boolean = true): Promise<ModalOCRResponse> {
    const endpoint = `${this.config.baseUrl}-process-ocr.modal.run`;
    const body = JSON.stringify({
      image_url: imageUrl,
      with_layout: withLayout,
    });

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: await this.buildAuthHeaders(body),
      body,
    });

    return response as ModalOCRResponse;
  }

  /**
   * Effectue l'OCR avec image en base64
   */
  async ocrFromBase64(imageBase64: string, withLayout: boolean = true): Promise<ModalOCRResponse> {
    const endpoint = `${this.config.baseUrl}-process-ocr.modal.run`;
    const body = JSON.stringify({
      image_base64: imageBase64,
      with_layout: withLayout,
    });

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: await this.buildAuthHeaders(body),
      body,
    });

    return response as ModalOCRResponse;
  }

  /**
   * Effectue l'extraction de données à partir du texte OCR
   */
  async extract(ocrText: string, pipeline: string, ocrBlocks?: unknown[]): Promise<ModalExtractionResponse> {
    const endpoint = `${this.config.baseUrl}-process-extraction.modal.run`;
    const body = JSON.stringify({
      ocr_text: ocrText,
      ocr_blocks: ocrBlocks || [],
      pipeline,
    });

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: await this.buildAuthHeaders(body),
      body,
    });

    return response as ModalExtractionResponse;
  }

  /**
   * Pipeline complète: OCR + Extraction en une seule requête
   */
  async processDocument(imageUrl: string, pipeline: string): Promise<ModalDocumentResponse> {
    const endpoint = `${this.config.baseUrl}-process-document.modal.run`;
    const body = JSON.stringify({
      image_url: imageUrl,
      pipeline,
    });

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: await this.buildAuthHeaders(body),
      body,
    });

    return response as ModalDocumentResponse;
  }

  /**
   * Pipeline complète avec image en base64
   */
  async processDocumentFromBase64(imageBase64: string, pipeline: string): Promise<ModalDocumentResponse> {
    const endpoint = `${this.config.baseUrl}-process-document.modal.run`;
    const body = JSON.stringify({
      image_base64: imageBase64,
      pipeline,
    });

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: await this.buildAuthHeaders(body),
      body,
    });

    return response as ModalDocumentResponse;
  }

  /**
   * Transforme la réponse Modal au format ExtractionResult standard
   */
  transformToExtractionResult(
    modalResponse: ModalDocumentResponse,
    schema: string
  ): ExtractionResult {
    const extractionData = modalResponse.extracted_data;

    if (!extractionData.success || !extractionData.data) {
      return {
        success: false,
        schema,
        fields: {},
        overallConfidence: 0,
        extractionModes: { replace: [], table: [], direct: [] },
        error: extractionData.error || 'Extraction failed',
      };
    }

    const fields: Record<string, FieldExtraction> = {};
    let totalConfidence = 0;
    let fieldCount = 0;

    for (const [key, fieldData] of Object.entries(extractionData.data)) {
      if (fieldData && typeof fieldData === 'object' && 'value' in fieldData) {
        fields[key] = {
          value: fieldData.value,
          confidence: fieldData.confidence || 0,
        };
        totalConfidence += fieldData.confidence || 0;
        fieldCount++;
      }
    }

    const overallConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;

    return {
      success: true,
      schema,
      fields,
      overallConfidence,
      extractionModes: {
        replace: Object.keys(fields),
        table: [],
        direct: []
      },
      rawResponse: modalResponse,
    };
  }

  /**
   * Vérifie la santé du service Modal
   */
  async healthCheck(): Promise<boolean> {
    try {
      const endpoint = `${this.config.baseUrl}-health.modal.run`;
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json() as { status: string };
        return data.status === 'healthy';
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Fetch avec retry et backoff exponentiel
   */
  private async fetchWithRetry(url: string, options: RequestInit): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout || DEFAULT_TIMEOUT_MS
        );

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Modal API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (lastError.message.includes('400') ||
            lastError.message.includes('401') ||
            lastError.message.includes('403') ||
            lastError.message.includes('404')) {
          break;
        }

        // Exponential backoff
        if (attempt < MAX_RETRIES - 1) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError || new Error('Unknown error after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function pour créer l'adapter approprié
 */
export function createOCRAdapter(env: Env, useModal: boolean = true) {
  if (useModal && env.MODAL_OCR_URL) {
    return new ModalOCRAdapter(env);
  }
  // Import dynamique pour éviter les dépendances circulaires
  const { OCRAdapter } = require('./adapter');
  return new OCRAdapter(env);
}
