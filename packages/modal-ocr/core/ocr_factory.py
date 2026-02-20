"""OCR Engine Factory - Creates instances of OCR engines."""

import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Type

from .ocr_strategy import OCRStrategy

logger = logging.getLogger(__name__)

# OCR-02: Default fallback engine
DEFAULT_ENGINE = "paddleocr"
FALLBACK_CHAIN = ["paddleocr", "tesseract", "easyocr"]


class SelectionPriority(Enum):
    """Priority for automatic engine selection."""
    SPEED = "speed"
    ACCURACY = "accuracy"
    COST = "cost"
    BALANCED = "balanced"


class DocumentComplexity(Enum):
    """Document complexity levels for engine selection."""
    LOW = "low"          # Simple text documents
    MEDIUM = "medium"    # Tables, forms
    HIGH = "high"        # Manuscripts, complex layouts


class OCREngineFactory:
    """Factory pour créer les instances de moteurs OCR."""

    _engines: Dict[str, Type[OCRStrategy]] = {}
    _instances: Dict[str, OCRStrategy] = {}  # OCR-01: Cache instances

    @classmethod
    def register_engine(cls, name: str, engine_class: Type[OCRStrategy]) -> None:
        """
        Enregistre un nouveau moteur OCR.

        Args:
            name: Nom du moteur
            engine_class: Classe du moteur
        """
        cls._engines[name] = engine_class

    @classmethod
    def create_engine(
        cls,
        engine_name: str,
        config: Dict[str, Any],
        use_fallback: bool = True,
        cache_instance: bool = True,
    ) -> OCRStrategy:
        """
        Crée une instance du moteur OCR demandé.

        Args:
            engine_name: Nom du moteur (paddleocr, hunyuan, surya, etc.)
            config: Configuration du moteur
            use_fallback: Si True, utilise un moteur de secours si le moteur demandé échoue
            cache_instance: Si True, met en cache l'instance pour réutilisation

        Returns:
            Instance de OCRStrategy

        Raises:
            ValueError: Si le moteur n'existe pas et qu'aucun fallback n'est disponible
        """
        # Lazy import engines to avoid circular imports
        cls._ensure_engines_registered()

        # OCR-01: Return cached instance if available
        cache_key = f"{engine_name}:{hash(str(config))}"
        if cache_instance and cache_key in cls._instances:
            return cls._instances[cache_key]

        # OCR-02: Fallback if engine not found
        if engine_name not in cls._engines:
            if use_fallback:
                logger.warning(
                    f"Moteur '{engine_name}' inconnu, fallback vers {DEFAULT_ENGINE}"
                )
                return cls._create_with_fallback(config, cache_key, cache_instance)
            available = list(cls._engines.keys())
            raise ValueError(
                f"Moteur '{engine_name}' inconnu. Moteurs disponibles: {available}"
            )

        if not config.get("enabled", True):
            if use_fallback:
                logger.warning(
                    f"Moteur '{engine_name}' désactivé, fallback vers {DEFAULT_ENGINE}"
                )
                return cls._create_with_fallback(config, cache_key, cache_instance)
            raise ValueError(f"Moteur '{engine_name}' désactivé dans la configuration")

        try:
            engine_class = cls._engines[engine_name]
            instance = engine_class(config)

            # OCR-01: Cache the instance
            if cache_instance:
                cls._instances[cache_key] = instance

            return instance

        except Exception as e:
            if use_fallback:
                logger.warning(
                    f"Erreur création moteur '{engine_name}': {e}, fallback"
                )
                return cls._create_with_fallback(config, cache_key, cache_instance)
            raise

    @classmethod
    def _create_with_fallback(
        cls,
        config: Dict[str, Any],
        cache_key: str,
        cache_instance: bool,
    ) -> OCRStrategy:
        """
        OCR-02: Try fallback engines in order until one works.
        """
        errors = []

        for fallback_engine in FALLBACK_CHAIN:
            if fallback_engine not in cls._engines:
                continue

            try:
                engine_class = cls._engines[fallback_engine]
                instance = engine_class(config)

                if cache_instance:
                    cls._instances[cache_key] = instance

                logger.info(f"Using fallback engine: {fallback_engine}")
                return instance

            except Exception as e:
                errors.append(f"{fallback_engine}: {e}")
                continue

        raise ValueError(
            f"Aucun moteur disponible. Erreurs: {'; '.join(errors)}"
        )

    @classmethod
    def clear_cache(cls) -> None:
        """Clear cached engine instances."""
        for instance in cls._instances.values():
            try:
                instance.cleanup()
            except Exception:
                pass
        cls._instances.clear()

    @classmethod
    def get_available_engines(cls) -> list:
        """Return list of available engine names."""
        cls._ensure_engines_registered()
        return list(cls._engines.keys())

    @classmethod
    def _ensure_engines_registered(cls) -> None:
        """Ensure all engines are registered."""
        if cls._engines:
            return

        # Import and register engines
        try:
            from engines.paddleocr_engine import PaddleOCREngine

            cls._engines["paddleocr"] = PaddleOCREngine
        except ImportError:
            pass

        try:
            from engines.surya_engine import SuryaEngine

            cls._engines["surya"] = SuryaEngine
        except ImportError:
            pass

        try:
            from engines.hunyuan_engine import HunyuanEngine

            cls._engines["hunyuan"] = HunyuanEngine
        except ImportError:
            pass

        try:
            from engines.tesseract_engine import TesseractEngine

            cls._engines["tesseract"] = TesseractEngine
        except ImportError:
            pass

        try:
            from engines.easyocr_engine import EasyOCREngine

            cls._engines["easyocr"] = EasyOCREngine
        except ImportError:
            pass

        try:
            from engines.gutenocr_engine import GutenOCREngine

            cls._engines["gutenocr"] = GutenOCREngine
            cls._engines["gutenocr-3b"] = GutenOCREngine
            cls._engines["gutenocr-7b"] = GutenOCREngine
        except ImportError:
            pass

        try:
            from engines.mistral_ocr_engine import MistralOCREngine

            cls._engines["mistral_ocr"] = MistralOCREngine
            cls._engines["mistral"] = MistralOCREngine
        except ImportError:
            pass

    @classmethod
    def auto_select_engine(
        cls,
        priority: SelectionPriority = SelectionPriority.BALANCED,
        document_type: Optional[str] = None,
        complexity: DocumentComplexity = DocumentComplexity.MEDIUM,
        has_gpu: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Automatically select the best OCR engine based on criteria.

        Args:
            priority: Optimization priority (speed, accuracy, cost, balanced)
            document_type: Type of document (manuscript, form, invoice, etc.)
            complexity: Document complexity level
            has_gpu: Whether GPU is available (auto-detected if None)
            config: Optional configuration to check engine availability

        Returns:
            Name of the recommended engine
        """
        cls._ensure_engines_registered()

        # Auto-detect GPU if not specified
        if has_gpu is None:
            has_gpu = cls._detect_gpu()

        # Cost priority: use free engines
        if priority == SelectionPriority.COST:
            if "tesseract" in cls._engines:
                return "tesseract"
            if "easyocr" in cls._engines:
                return "easyocr"
            return "paddleocr"

        # Speed priority
        if priority == SelectionPriority.SPEED:
            if complexity == DocumentComplexity.LOW:
                return "tesseract" if "tesseract" in cls._engines else "paddleocr"
            else:
                return "gutenocr-3b" if "gutenocr" in cls._engines else "surya"

        # Accuracy priority
        if priority == SelectionPriority.ACCURACY:
            if document_type in ["manuscript", "historical", "handwriting"]:
                # GutenOCR 7B is best for manuscripts
                if "gutenocr" in cls._engines and has_gpu:
                    return "gutenocr-7b"
                return "gutenocr-3b" if "gutenocr" in cls._engines else "hunyuan"

            elif document_type in ["form", "invoice", "technical", "structured"]:
                # Mistral OCR is best for structured documents
                if "mistral_ocr" in cls._engines:
                    return "mistral_ocr"
                return "gutenocr-3b" if "gutenocr" in cls._engines else "surya"

            elif document_type in ["table", "spreadsheet"]:
                # Mistral OCR excels at tables
                if "mistral_ocr" in cls._engines:
                    return "mistral_ocr"
                return "surya" if "surya" in cls._engines else "paddleocr"

            else:
                # Default accuracy: GutenOCR 3B (good balance)
                if "gutenocr" in cls._engines:
                    return "gutenocr-3b"
                return "surya" if "surya" in cls._engines else "paddleocr"

        # Balanced priority (default)
        if complexity == DocumentComplexity.HIGH:
            if has_gpu and "gutenocr" in cls._engines:
                return "gutenocr-7b"
            if "mistral_ocr" in cls._engines:
                return "mistral_ocr"
            return "gutenocr-3b" if "gutenocr" in cls._engines else "surya"

        elif complexity == DocumentComplexity.MEDIUM:
            if "gutenocr" in cls._engines:
                return "gutenocr-3b"
            return "surya" if "surya" in cls._engines else "paddleocr"

        else:  # LOW complexity
            if "surya" in cls._engines:
                return "surya"
            return "paddleocr" if "paddleocr" in cls._engines else "tesseract"

    @classmethod
    def _detect_gpu(cls) -> bool:
        """Detect if GPU is available."""
        try:
            import torch
            return torch.cuda.is_available() or torch.backends.mps.is_available()
        except ImportError:
            return False

    @classmethod
    def compare_engines(
        cls,
        image_path: str,
        engines: Optional[List[str]] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Compare multiple OCR engines on the same document.

        Args:
            image_path: Path to the document image
            engines: List of engine names to compare (all if None)
            config: Optional configuration for engines

        Returns:
            Dictionary with comparison results for each engine
        """
        from pathlib import Path
        import time

        cls._ensure_engines_registered()

        if engines is None:
            # Use a subset of engines for comparison
            engines = ["gutenocr-3b", "mistral_ocr", "surya", "paddleocr"]
            engines = [e for e in engines if e in cls._engines]

        config = config or {}
        results = {}
        file_path = Path(image_path)

        for engine_name in engines:
            if engine_name not in cls._engines:
                results[engine_name] = {
                    "error": f"Engine '{engine_name}' not available",
                    "success": False,
                }
                continue

            try:
                engine = cls.create_engine(engine_name, config, use_fallback=False)

                start_time = time.time()
                result = engine.process(file_path)
                elapsed_time = time.time() - start_time

                results[engine_name] = {
                    "success": True,
                    "text_length": len(result.text),
                    "confidence": result.confidence,
                    "block_count": len(result.blocks),
                    "processing_time_ms": round(elapsed_time * 1000, 2),
                    "has_layout": bool(result.layout),
                    "text_preview": result.text[:200] if result.text else "",
                }

            except Exception as e:
                results[engine_name] = {
                    "success": False,
                    "error": str(e),
                }

        return {
            "image_path": image_path,
            "engines_compared": engines,
            "results": results,
        }

    @classmethod
    def get_engine_info(cls) -> Dict[str, Dict[str, Any]]:
        """
        Get information about all registered engines.

        Returns:
            Dictionary with engine info including capabilities and requirements
        """
        cls._ensure_engines_registered()

        engine_info = {
            "gutenocr": {
                "name": "GutenOCR",
                "type": "vlm",
                "variants": ["gutenocr-3b", "gutenocr-7b"],
                "requires_gpu": False,
                "gpu_recommended": True,
                "cost": "free",
                "strengths": ["manuscripts", "multilingual", "layout"],
                "min_ram_gb": {"3b": 8, "7b": 16},
            },
            "mistral_ocr": {
                "name": "Mistral OCR",
                "type": "api",
                "variants": ["mistral_ocr"],
                "requires_gpu": False,
                "gpu_recommended": False,
                "cost": "$2/1000 pages",
                "strengths": ["structured_data", "tables", "forms"],
                "requires_api_key": True,
            },
            "surya": {
                "name": "Surya OCR",
                "type": "vlm",
                "variants": ["surya"],
                "requires_gpu": False,
                "gpu_recommended": True,
                "cost": "free",
                "strengths": ["layout", "reading_order"],
            },
            "hunyuan": {
                "name": "HunyuanOCR",
                "type": "vlm",
                "variants": ["hunyuan"],
                "requires_gpu": True,
                "cost": "free",
                "strengths": ["multilingual", "layout"],
            },
            "paddleocr": {
                "name": "PaddleOCR",
                "type": "traditional",
                "variants": ["paddleocr"],
                "requires_gpu": False,
                "cost": "free",
                "strengths": ["speed", "chinese"],
            },
            "tesseract": {
                "name": "Tesseract",
                "type": "traditional",
                "variants": ["tesseract"],
                "requires_gpu": False,
                "cost": "free",
                "strengths": ["simple_docs", "many_languages"],
            },
            "easyocr": {
                "name": "EasyOCR",
                "type": "traditional",
                "variants": ["easyocr"],
                "requires_gpu": False,
                "cost": "free",
                "strengths": ["handwriting", "scene_text"],
            },
        }

        # Filter to only available engines
        available = {}
        for key, info in engine_info.items():
            if any(v in cls._engines for v in info.get("variants", [key])):
                available[key] = info
                available[key]["available"] = True

        return available
