/**
 * Extraction Module
 *
 * Ce module fournit les adaptateurs pour l'OCR et l'extraction de données.
 * Supporte deux backends:
 * - OCRAdapter: API OCR externe traditionnelle
 * - ModalOCRAdapter: Service OCR sur Modal avec PaddleOCR + Claude
 */

export { OCRAdapter, type ExtractionResult, type FieldExtraction } from './adapter';
export { ModalOCRAdapter, createOCRAdapter } from './modal-adapter';
export { extractionRoutes } from './routes';
