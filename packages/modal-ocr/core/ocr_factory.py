"""OCR Engine Factory - Creates instances of OCR engines."""

from typing import Any, Dict, Type

from .ocr_strategy import OCRStrategy


class OCREngineFactory:
    """Factory pour créer les instances de moteurs OCR."""

    _engines: Dict[str, Type[OCRStrategy]] = {}

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
    def create_engine(cls, engine_name: str, config: Dict[str, Any]) -> OCRStrategy:
        """
        Crée une instance du moteur OCR demandé.

        Args:
            engine_name: Nom du moteur (paddleocr, hunyuan, surya, etc.)
            config: Configuration du moteur

        Returns:
            Instance de OCRStrategy

        Raises:
            ValueError: Si le moteur n'existe pas ou n'est pas activé
        """
        # Lazy import engines to avoid circular imports
        cls._ensure_engines_registered()

        if engine_name not in cls._engines:
            available = list(cls._engines.keys())
            raise ValueError(
                f"Moteur '{engine_name}' inconnu. Moteurs disponibles: {available}"
            )

        if not config.get("enabled", True):
            raise ValueError(f"Moteur '{engine_name}' désactivé dans la configuration")

        engine_class = cls._engines[engine_name]
        return engine_class(config)

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
