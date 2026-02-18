"""Core OCR processing modules."""

from .ocr_strategy import OCRStrategy, OCRResult
from .ocr_factory import OCREngineFactory
from .document_processor import DocumentProcessor

__all__ = ["OCRStrategy", "OCRResult", "OCREngineFactory", "DocumentProcessor"]
