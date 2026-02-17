/**
 * Extraction Module
 *
 * Ce module fournit les adaptateurs pour l'OCR et l'extraction de données.
 *
 * Architecture:
 * - OCR: Modal (PaddleOCR) ou API externe
 * - Extraction LLM: Cloudflare Workers AI (gratuit, modèles open-source)
 *
 * Flux: Image → Modal OCR → Workers AI Extraction → Données structurées
 */

// OCR Adapters
export { OCRAdapter, type ExtractionResult, type FieldExtraction } from './adapter';
export { ModalOCRAdapter, createOCRAdapter } from './modal-adapter';

// LLM Extraction (Cloudflare Workers AI - gratuit)
export {
  WorkersAIExtractor,
  createAIExtractor,
  AI_MODELS,
  type AIExtractionResult,
  type FieldConfig,
} from './workers-ai-extractor';

// Routes
export { extractionRoutes } from './routes';
