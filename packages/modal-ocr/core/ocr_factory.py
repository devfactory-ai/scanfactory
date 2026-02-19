"""OCR Engine Factory - Creates instances of OCR engines."""

import logging
from typing import Any, Dict, List, Optional, Type

from .ocr_strategy import OCRStrategy

logger = logging.getLogger(__name__)

# OCR-02: Default fallback engine
DEFAULT_ENGINE = "paddleocr"
FALLBACK_CHAIN = ["paddleocr", "tesseract", "easyocr"]


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
