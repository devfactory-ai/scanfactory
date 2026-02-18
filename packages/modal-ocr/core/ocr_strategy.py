"""OCR Strategy interface - Abstract base class for all OCR engines."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass
class OCRResult:
    """Résultat standardisé pour tous les moteurs OCR."""

    text: str
    confidence: float
    blocks: List[Dict[str, Any]] = field(default_factory=list)
    layout: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_markdown(self) -> str:
        """Conversion en Markdown."""
        if self.layout and self.layout.get("structured_text"):
            return self.layout["structured_text"]
        return self.text

    def to_json(self) -> Dict[str, Any]:
        """Conversion en JSON."""
        return {
            "text": self.text,
            "confidence": self.confidence,
            "blocks": self.blocks,
            "layout": self.layout,
            "metadata": self.metadata,
        }

    def to_dict(self) -> Dict[str, Any]:
        """Alias for to_json."""
        return self.to_json()


class OCRStrategy(ABC):
    """Interface abstraite pour tous les moteurs OCR."""

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the OCR strategy.

        Args:
            config: Engine-specific configuration
        """
        self.config = config
        self.device = self._detect_device()
        self._model = None

    @property
    def name(self) -> str:
        """Return engine name."""
        return self.__class__.__name__.replace("Engine", "").lower()

    @abstractmethod
    def initialize(self) -> None:
        """
        Initialize the OCR model.

        This is called lazily on first use to avoid loading models unnecessarily.
        """
        pass

    @abstractmethod
    def process(self, file_path: Path) -> OCRResult:
        """
        Traite un document et retourne le résultat OCR.

        Args:
            file_path: Chemin vers le fichier (PDF/Image)

        Returns:
            OCRResult: Résultat structuré
        """
        pass

    @abstractmethod
    def process_bytes(self, image_bytes: bytes) -> OCRResult:
        """
        Traite une image en bytes.

        Args:
            image_bytes: Image en bytes (JPEG, PNG, etc.)

        Returns:
            OCRResult: Résultat structuré
        """
        pass

    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Traite plusieurs documents en batch.

        Args:
            file_paths: Liste des chemins de fichiers

        Returns:
            List[OCRResult]: Liste des résultats
        """
        results = []
        for file_path in file_paths:
            try:
                result = self.process(file_path)
                results.append(result)
            except Exception as e:
                # Create error result
                results.append(
                    OCRResult(
                        text="",
                        confidence=0.0,
                        metadata={
                            "error": str(e),
                            "file": str(file_path),
                            "engine": self.name,
                        },
                    )
                )

            # Memory cleanup after each document if configured
            if self.config.get("memory_cleanup", True):
                self.cleanup()

        return results

    def cleanup(self) -> None:
        """Libère les ressources (GPU cache, etc.)."""
        import gc

        try:
            import torch

            if self.device == "cuda" and torch.cuda.is_available():
                torch.cuda.empty_cache()
            elif self.device == "mps" and hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()
        except ImportError:
            pass

        gc.collect()

    def _detect_device(self) -> str:
        """Détecte le meilleur device disponible."""
        device_config = self.config.get("device", "auto")

        if device_config != "auto":
            return device_config

        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass

        return "cpu"

    def _ensure_initialized(self) -> None:
        """Ensure model is initialized before use."""
        if self._model is None:
            self.initialize()
