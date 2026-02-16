import type { Env } from '../../index';

export interface FieldExtraction {
  value: unknown;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ExtractionResult {
  success: boolean;
  schema: string;
  fields: Record<string, FieldExtraction>;
  tables?: Array<{
    name: string;
    rows: Array<Record<string, FieldExtraction>>;
  }>;
  overallConfidence: number;
  extractionModes: {
    replace: string[];
    table: string[];
    direct: string[];
  };
  rawResponse?: unknown;
  error?: string;
}

interface OCRApiResponse {
  success: boolean;
  data?: {
    fields: Record<string, {
      value: unknown;
      confidence: number;
      bounding_box?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }>;
    tables?: Array<{
      name: string;
      rows: Array<Record<string, {
        value: unknown;
        confidence: number;
      }>>;
    }>;
    extraction_modes?: {
      replace: string[];
      table: string[];
      direct: string[];
    };
  };
  error?: string;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export class OCRAdapter {
  private apiUrl: string;
  private apiKey: string;

  constructor(env: Env) {
    this.apiUrl = env.OCR_API_URL;
    this.apiKey = env.OCR_API_KEY;
  }

  async extract(image: ArrayBuffer, schema: string): Promise<ExtractionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.makeRequest(image, schema);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        if (lastError.message.includes('4')) {
          break;
        }

        // Exponential backoff
        if (attempt < MAX_RETRIES - 1) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await this.sleep(backoffMs);
        }
      }
    }

    return {
      success: false,
      schema,
      fields: {},
      overallConfidence: 0,
      extractionModes: { replace: [], table: [], direct: [] },
      error: lastError?.message ?? 'Unknown error after retries',
    };
  }

  private async makeRequest(image: ArrayBuffer, schema: string): Promise<ExtractionResult> {
    const formData = new FormData();
    formData.append('file', new Blob([image]), 'document.jpg');
    formData.append('schema', schema);

    const response = await fetch(`${this.apiUrl}/extract`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OCR API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as OCRApiResponse;

    if (!json.success || !json.data) {
      return {
        success: false,
        schema,
        fields: {},
        overallConfidence: 0,
        extractionModes: { replace: [], table: [], direct: [] },
        error: json.error ?? 'OCR extraction failed',
      };
    }

    // Transform API response to our format
    const fields: Record<string, FieldExtraction> = {};
    let totalConfidence = 0;
    let fieldCount = 0;

    for (const [key, value] of Object.entries(json.data.fields)) {
      fields[key] = {
        value: value.value,
        confidence: value.confidence,
        boundingBox: value.bounding_box ? {
          x: value.bounding_box.x,
          y: value.bounding_box.y,
          width: value.bounding_box.width,
          height: value.bounding_box.height,
        } : undefined,
      };
      totalConfidence += value.confidence;
      fieldCount++;
    }

    const tables = json.data.tables?.map((table) => ({
      name: table.name,
      rows: table.rows.map((row) => {
        const transformedRow: Record<string, FieldExtraction> = {};
        for (const [key, value] of Object.entries(row)) {
          transformedRow[key] = {
            value: value.value,
            confidence: value.confidence,
          };
          totalConfidence += value.confidence;
          fieldCount++;
        }
        return transformedRow;
      }),
    }));

    const overallConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;

    return {
      success: true,
      schema,
      fields,
      tables,
      overallConfidence,
      extractionModes: json.data.extraction_modes ?? { replace: [], table: [], direct: [] },
      rawResponse: json,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
