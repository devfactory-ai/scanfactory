# Guide d'intégration Client - ScanFactory OCR API

Ce guide explique comment intégrer l'API OCR ScanFactory dans vos applications.

## Configuration

### URL de base

```
Production:  https://ocr.scanfactory.io/api/v1
Staging:     https://ocr-staging.scanfactory.io/api/v1
Local:       http://localhost:8000/api/v1
```

### Authentification

Toutes les requêtes doivent inclure le header `X-API-Key`:

```
X-API-Key: your_api_key_here
```

---

## Intégration TypeScript/JavaScript

### Installation

```bash
npm install axios form-data
# ou
yarn add axios form-data
```

### Client OCR complet

```typescript
// ocr-client.ts
import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import fs from 'fs';

interface OCRBlock {
  text: string;
  confidence: number;
  bbox?: { x1: number; y1: number; x2: number; y2: number };
  type?: string;
}

interface OCRResponse {
  success: boolean;
  text: string;
  confidence: number;
  blocks: OCRBlock[];
  engine: string;
  processing_time_ms: number;
  metadata: Record<string, unknown>;
  tables?: Array<Record<string, unknown>>;
}

interface OCREngine {
  id: string;
  name: string;
  description: string;
  type: 'vlm' | 'api' | 'traditional';
  languages: string[];
  gpu_required: boolean;
  available: boolean;
  cost_per_page: number | null;
}

interface EngineListResponse {
  engines: OCREngine[];
  default: string;
  total: number;
}

interface ProcessOptions {
  engine?: string;
  outputFormat?: 'text' | 'markdown' | 'json' | 'lines' | 'words';
  priority?: 'speed' | 'accuracy' | 'cost' | 'balanced';
  documentType?: string;
  extractTables?: boolean;
  extractStructure?: boolean;
}

export class ScanFactoryOCR {
  private client: AxiosInstance;

  constructor(
    private apiKey: string,
    private baseUrl: string = 'http://localhost:8000/api/v1'
  ) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-API-Key': apiKey,
      },
      timeout: 120000, // 2 minutes pour les gros documents
    });
  }

  /**
   * Liste les moteurs OCR disponibles
   */
  async listEngines(): Promise<EngineListResponse> {
    const response = await this.client.get<EngineListResponse>('/ocr/engines');
    return response.data;
  }

  /**
   * Traite un fichier local
   */
  async processFile(
    filePath: string,
    options: ProcessOptions = {}
  ): Promise<OCRResponse> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    if (options.engine) form.append('engine', options.engine);
    if (options.outputFormat) form.append('output_format', options.outputFormat);
    if (options.priority) form.append('priority', options.priority);
    if (options.documentType) form.append('document_type', options.documentType);
    if (options.extractTables) form.append('extract_tables', 'true');
    if (options.extractStructure) form.append('extract_structure', 'true');

    const response = await this.client.post<OCRResponse>('/ocr/process', form, {
      headers: form.getHeaders(),
    });

    return response.data;
  }

  /**
   * Traite un Buffer (image en mémoire)
   */
  async processBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    options: ProcessOptions = {}
  ): Promise<OCRResponse> {
    const form = new FormData();
    form.append('file', buffer, {
      filename,
      contentType: mimeType,
    });

    if (options.engine) form.append('engine', options.engine);
    if (options.outputFormat) form.append('output_format', options.outputFormat);
    if (options.priority) form.append('priority', options.priority);
    if (options.documentType) form.append('document_type', options.documentType);

    const response = await this.client.post<OCRResponse>('/ocr/process', form, {
      headers: form.getHeaders(),
    });

    return response.data;
  }

  /**
   * Traite une image en base64
   */
  async processBase64(
    base64Data: string,
    options: ProcessOptions = {}
  ): Promise<OCRResponse> {
    const response = await this.client.post<OCRResponse>('/ocr/process/json', {
      image_base64: base64Data,
      engine: options.engine || 'auto',
      output_format: options.outputFormat || 'text',
      priority: options.priority || 'balanced',
      document_type: options.documentType,
      extract_tables: options.extractTables || false,
      extract_structure: options.extractStructure || false,
    });

    return response.data;
  }

  /**
   * Traite une image depuis une URL
   */
  async processUrl(
    imageUrl: string,
    options: ProcessOptions = {}
  ): Promise<OCRResponse> {
    const response = await this.client.post<OCRResponse>('/ocr/process/json', {
      image_url: imageUrl,
      engine: options.engine || 'auto',
      output_format: options.outputFormat || 'text',
      priority: options.priority || 'balanced',
      document_type: options.documentType,
    });

    return response.data;
  }

  /**
   * Compare plusieurs moteurs OCR
   */
  async compareEngines(
    filePath: string,
    engines: string[] = ['gutenocr-3b', 'mistral_ocr']
  ): Promise<{
    success: boolean;
    results: Array<{
      engine: string;
      success: boolean;
      text?: string;
      confidence?: number;
      processing_time_ms: number;
      error?: string;
    }>;
  }> {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('engines', engines.join(','));

    const response = await this.client.post('/ocr/compare', form, {
      headers: form.getHeaders(),
    });

    return response.data;
  }

  /**
   * Estime le coût de traitement
   */
  async estimateCost(
    engine: string,
    pageCount: number
  ): Promise<{
    engine: string;
    page_count: number;
    cost_per_page: number;
    estimated_cost_usd: number;
    is_free: boolean;
  }> {
    const response = await this.client.get('/ocr/cost-estimate', {
      params: { engine, page_count: pageCount },
    });
    return response.data;
  }

  /**
   * Vérifie la santé du service
   */
  async healthCheck(): Promise<{
    status: string;
    service: string;
    version: string;
    engines: string[];
  }> {
    const response = await this.client.get('/health', {
      baseURL: this.baseUrl.replace('/api/v1', ''),
    });
    return response.data;
  }
}
```

### Utilisation dans une application

```typescript
// app.ts
import { ScanFactoryOCR } from './ocr-client';

const ocr = new ScanFactoryOCR(
  process.env.OCR_API_KEY!,
  process.env.OCR_API_URL || 'http://localhost:8000/api/v1'
);

// Exemple 1: Traiter un fichier local
async function processLocalFile() {
  const result = await ocr.processFile('./facture.pdf', {
    engine: 'mistral_ocr',  // ou 'auto' pour sélection automatique
    documentType: 'invoice',
    extractTables: true,
  });

  console.log('Texte extrait:', result.text);
  console.log('Confiance:', result.confidence);
  console.log('Moteur utilisé:', result.engine);
  console.log('Temps:', result.processing_time_ms, 'ms');
}

// Exemple 2: Traiter une image uploadée (Express.js)
import express from 'express';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post('/scan', upload.single('document'), async (req, res) => {
  try {
    const result = await ocr.processBuffer(
      req.file!.buffer,
      req.file!.originalname,
      req.file!.mimetype,
      { engine: 'auto', priority: 'accuracy' }
    );

    res.json({
      text: result.text,
      confidence: result.confidence,
      engine: result.engine,
    });
  } catch (error) {
    res.status(500).json({ error: 'OCR failed' });
  }
});
```

### Utilisation avec React/Frontend

```typescript
// hooks/useOCR.ts
import { useState, useCallback } from 'react';

const API_URL = import.meta.env.VITE_OCR_API_URL;
const API_KEY = import.meta.env.VITE_OCR_API_KEY;

interface UseOCRResult {
  processFile: (file: File) => Promise<OCRResponse>;
  isProcessing: boolean;
  error: string | null;
}

export function useOCR(): UseOCRResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('engine', 'auto');

      const response = await fetch(`${API_URL}/ocr/process`, {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OCR failed';
      setError(message);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { processFile, isProcessing, error };
}

// Composant React
function DocumentScanner() {
  const { processFile, isProcessing, error } = useOCR();
  const [result, setResult] = useState<OCRResponse | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ocrResult = await processFile(file);
      setResult(ocrResult);
    } catch {
      // Error handled by hook
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileChange} accept="image/*,.pdf" />
      {isProcessing && <p>Traitement en cours...</p>}
      {error && <p style={{ color: 'red' }}>Erreur: {error}</p>}
      {result && (
        <div>
          <p>Confiance: {(result.confidence * 100).toFixed(1)}%</p>
          <pre>{result.text}</pre>
        </div>
      )}
    </div>
  );
}
```

---

## Intégration Python

### Installation

```bash
pip install httpx pydantic
```

### Client OCR complet

```python
# ocr_client.py
import httpx
from pathlib import Path
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel
import base64


class OCRBlock(BaseModel):
    text: str
    confidence: float
    bbox: Optional[Dict[str, int]] = None
    type: Optional[str] = None


class OCRResponse(BaseModel):
    success: bool
    text: str
    confidence: float
    blocks: List[OCRBlock]
    engine: str
    processing_time_ms: int
    metadata: Dict[str, Any] = {}
    tables: Optional[List[Dict]] = None


class OCREngine(BaseModel):
    id: str
    name: str
    description: str
    type: str
    languages: List[str]
    gpu_required: bool
    available: bool
    cost_per_page: Optional[float] = None


class ScanFactoryOCR:
    """Client pour l'API OCR ScanFactory."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:8000/api/v1",
        timeout: float = 120.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = httpx.Client(
            headers={"X-API-Key": api_key},
            timeout=timeout,
        )

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self._client.close()

    def list_engines(self) -> Dict[str, Any]:
        """Liste les moteurs OCR disponibles."""
        response = self._client.get(f"{self.base_url}/ocr/engines")
        response.raise_for_status()
        return response.json()

    def process_file(
        self,
        file_path: Path | str,
        engine: str = "auto",
        output_format: Literal["text", "markdown", "json", "lines", "words"] = "text",
        priority: Literal["speed", "accuracy", "cost", "balanced"] = "balanced",
        document_type: Optional[str] = None,
        extract_tables: bool = False,
        extract_structure: bool = False,
    ) -> OCRResponse:
        """Traite un fichier local."""
        file_path = Path(file_path)

        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f, self._get_mime_type(file_path))}
            data = {
                "engine": engine,
                "output_format": output_format,
                "priority": priority,
                "extract_tables": str(extract_tables).lower(),
                "extract_structure": str(extract_structure).lower(),
            }
            if document_type:
                data["document_type"] = document_type

            response = self._client.post(
                f"{self.base_url}/ocr/process",
                files=files,
                data=data,
            )

        response.raise_for_status()
        return OCRResponse(**response.json())

    def process_bytes(
        self,
        content: bytes,
        filename: str,
        mime_type: str,
        engine: str = "auto",
        **kwargs,
    ) -> OCRResponse:
        """Traite des bytes (image en mémoire)."""
        files = {"file": (filename, content, mime_type)}
        data = {"engine": engine, **kwargs}

        response = self._client.post(
            f"{self.base_url}/ocr/process",
            files=files,
            data=data,
        )
        response.raise_for_status()
        return OCRResponse(**response.json())

    def process_base64(
        self,
        base64_data: str,
        engine: str = "auto",
        **kwargs,
    ) -> OCRResponse:
        """Traite une image en base64."""
        payload = {
            "image_base64": base64_data,
            "engine": engine,
            **kwargs,
        }

        response = self._client.post(
            f"{self.base_url}/ocr/process/json",
            json=payload,
        )
        response.raise_for_status()
        return OCRResponse(**response.json())

    def process_url(
        self,
        image_url: str,
        engine: str = "auto",
        **kwargs,
    ) -> OCRResponse:
        """Traite une image depuis une URL."""
        payload = {
            "image_url": image_url,
            "engine": engine,
            **kwargs,
        }

        response = self._client.post(
            f"{self.base_url}/ocr/process/json",
            json=payload,
        )
        response.raise_for_status()
        return OCRResponse(**response.json())

    def compare_engines(
        self,
        file_path: Path | str,
        engines: List[str] = None,
    ) -> Dict[str, Any]:
        """Compare plusieurs moteurs OCR."""
        engines = engines or ["gutenocr-3b", "mistral_ocr"]
        file_path = Path(file_path)

        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f)}
            data = {"engines": ",".join(engines)}

            response = self._client.post(
                f"{self.base_url}/ocr/compare",
                files=files,
                data=data,
            )

        response.raise_for_status()
        return response.json()

    def estimate_cost(self, engine: str, page_count: int) -> Dict[str, Any]:
        """Estime le coût de traitement."""
        response = self._client.get(
            f"{self.base_url}/ocr/cost-estimate",
            params={"engine": engine, "page_count": page_count},
        )
        response.raise_for_status()
        return response.json()

    def health_check(self) -> Dict[str, Any]:
        """Vérifie la santé du service."""
        response = self._client.get(
            self.base_url.replace("/api/v1", "/health")
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def _get_mime_type(file_path: Path) -> str:
        """Détermine le type MIME d'un fichier."""
        suffix = file_path.suffix.lower()
        mime_types = {
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".tiff": "image/tiff",
            ".tif": "image/tiff",
            ".bmp": "image/bmp",
        }
        return mime_types.get(suffix, "application/octet-stream")


# Client asynchrone
class AsyncScanFactoryOCR:
    """Client asynchrone pour l'API OCR ScanFactory."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:8000/api/v1",
        timeout: float = 120.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def process_file(
        self,
        file_path: Path | str,
        engine: str = "auto",
        **kwargs,
    ) -> OCRResponse:
        """Traite un fichier local (async)."""
        file_path = Path(file_path)

        async with httpx.AsyncClient(
            headers={"X-API-Key": self.api_key},
            timeout=self.timeout,
        ) as client:
            with open(file_path, "rb") as f:
                files = {"file": (file_path.name, f.read())}
                data = {"engine": engine, **kwargs}

                response = await client.post(
                    f"{self.base_url}/ocr/process",
                    files=files,
                    data=data,
                )

        response.raise_for_status()
        return OCRResponse(**response.json())
```

### Utilisation

```python
# Exemple d'utilisation
import os
from ocr_client import ScanFactoryOCR

# Configuration
ocr = ScanFactoryOCR(
    api_key=os.environ["OCR_API_KEY"],
    base_url=os.environ.get("OCR_API_URL", "http://localhost:8000/api/v1"),
)

# 1. Traiter un fichier local
result = ocr.process_file(
    "facture.pdf",
    engine="mistral_ocr",
    document_type="invoice",
    extract_tables=True,
)
print(f"Texte: {result.text[:200]}...")
print(f"Confiance: {result.confidence:.2%}")
print(f"Moteur: {result.engine}")

# 2. Traiter avec sélection automatique
result = ocr.process_file(
    "document.png",
    engine="auto",
    priority="accuracy",
)

# 3. Comparer les moteurs
comparison = ocr.compare_engines(
    "test.pdf",
    engines=["gutenocr-3b", "mistral_ocr", "paddleocr"],
)
for res in comparison["results"]:
    if res["success"]:
        print(f"{res['engine']}: {res['confidence']:.2%} ({res['processing_time_ms']}ms)")
    else:
        print(f"{res['engine']}: ERREUR - {res['error']}")

# 4. Utilisation async (FastAPI, etc.)
import asyncio
from ocr_client import AsyncScanFactoryOCR

async def process_documents():
    ocr = AsyncScanFactoryOCR(api_key="...", base_url="...")
    result = await ocr.process_file("document.pdf")
    return result

# 5. Intégration Django
# views.py
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.conf import settings

@require_POST
def scan_document(request):
    uploaded_file = request.FILES.get("document")
    if not uploaded_file:
        return JsonResponse({"error": "No file"}, status=400)

    ocr = ScanFactoryOCR(
        api_key=settings.OCR_API_KEY,
        base_url=settings.OCR_API_URL,
    )

    result = ocr.process_bytes(
        content=uploaded_file.read(),
        filename=uploaded_file.name,
        mime_type=uploaded_file.content_type,
        engine="auto",
    )

    return JsonResponse({
        "text": result.text,
        "confidence": result.confidence,
        "engine": result.engine,
    })
```

---

## Variables d'environnement

Configurez ces variables dans vos applications:

```bash
# .env
OCR_API_KEY=your_api_key_here
OCR_API_URL=http://localhost:8000/api/v1

# Production
OCR_API_URL=https://ocr.scanfactory.io/api/v1
```

---

## Gestion des erreurs

### Codes d'erreur HTTP

| Code | Description |
|------|-------------|
| 200 | Succès |
| 400 | Requête invalide (fichier manquant, format invalide) |
| 401 | API key manquante |
| 403 | API key invalide |
| 413 | Fichier trop volumineux (max 50MB) |
| 500 | Erreur serveur / moteur OCR |

### Exemple de gestion d'erreurs

```typescript
try {
  const result = await ocr.processFile('./document.pdf');
  // ...
} catch (error) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const detail = error.response?.data?.detail;

    switch (status) {
      case 400:
        console.error('Fichier invalide:', detail);
        break;
      case 401:
        console.error('API key manquante');
        break;
      case 403:
        console.error('API key invalide');
        break;
      case 413:
        console.error('Fichier trop volumineux');
        break;
      case 500:
        console.error('Erreur OCR:', detail);
        // Retry avec un autre moteur?
        break;
    }
  }
}
```

---

## Bonnes pratiques

### 1. Réutilisation du client

```typescript
// Créer une instance unique
const ocr = new ScanFactoryOCR(API_KEY, API_URL);
export { ocr };

// Utiliser partout
import { ocr } from './ocr';
```

### 2. Timeout approprié

```typescript
// Documents volumineux = timeout plus long
const ocr = new ScanFactoryOCR(apiKey, baseUrl);
ocr.client.defaults.timeout = 180000; // 3 minutes
```

### 3. Retry sur erreur

```typescript
async function processWithRetry(filePath: string, maxRetries = 3) {
  const engines = ['gutenocr-3b', 'mistral_ocr', 'paddleocr'];

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await ocr.processFile(filePath, {
        engine: engines[i] || 'auto',
      });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1} with engine ${engines[i + 1]}`);
    }
  }
}
```

### 4. Traitement par lots

```typescript
async function processBatch(files: string[], concurrency = 3) {
  const results = [];

  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(f => ocr.processFile(f, { engine: 'auto' }))
    );
    results.push(...batchResults);
  }

  return results;
}
```

---

## Support

- Documentation API: `http://localhost:8000/docs`
- Issues: GitHub Issues
- Email: support@scanfactory.io
