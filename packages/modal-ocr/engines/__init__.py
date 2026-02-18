"""OCR Engine implementations."""

from .base_engine import BaseEngine

__all__ = ["BaseEngine"]

# Lazy imports for specific engines to avoid import errors
# when dependencies are not installed


def get_paddleocr_engine():
    from .paddleocr_engine import PaddleOCREngine

    return PaddleOCREngine


def get_surya_engine():
    from .surya_engine import SuryaEngine

    return SuryaEngine


def get_hunyuan_engine():
    from .hunyuan_engine import HunyuanEngine

    return HunyuanEngine


def get_tesseract_engine():
    from .tesseract_engine import TesseractEngine

    return TesseractEngine


def get_easyocr_engine():
    from .easyocr_engine import EasyOCREngine

    return EasyOCREngine
