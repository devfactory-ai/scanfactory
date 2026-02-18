"""Base Engine - Common functionality for all OCR engines."""

import io
from pathlib import Path
from typing import Any, Dict, List, Union

from PIL import Image

from core.ocr_strategy import OCRResult, OCRStrategy


class BaseEngine(OCRStrategy):
    """Base class with common functionality for all OCR engines."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.languages = config.get("languages", ["en"])

    def load_image(self, source: Union[Path, bytes]) -> Image.Image:
        """
        Load image from file path or bytes.

        Args:
            source: Path to image file or image bytes

        Returns:
            PIL Image object
        """
        if isinstance(source, bytes):
            return Image.open(io.BytesIO(source))
        else:
            return Image.open(source)

    def ensure_rgb(self, image: Image.Image) -> Image.Image:
        """Ensure image is in RGB mode."""
        if image.mode != "RGB":
            return image.convert("RGB")
        return image

    def image_to_bytes(self, image: Image.Image, format: str = "JPEG") -> bytes:
        """Convert PIL Image to bytes."""
        buffer = io.BytesIO()
        image.save(buffer, format=format)
        return buffer.getvalue()

    def detect_regions(
        self, blocks: List[Dict[str, Any]], image_height: int
    ) -> List[Dict[str, Any]]:
        """
        Detect document regions (header, body, footer).

        Args:
            blocks: List of text blocks with bbox
            image_height: Height of the image

        Returns:
            List of region dictionaries
        """
        if not blocks:
            return []

        header_threshold = image_height * 0.15
        footer_threshold = image_height * 0.85

        header_blocks = [b for b in blocks if b.get("bbox", {}).get("y1", 0) < header_threshold]
        footer_blocks = [b for b in blocks if b.get("bbox", {}).get("y1", 0) > footer_threshold]
        body_blocks = [
            b
            for b in blocks
            if header_threshold <= b.get("bbox", {}).get("y1", 0) <= footer_threshold
        ]

        regions = []
        if header_blocks:
            regions.append(
                {
                    "type": "header",
                    "y_start": 0,
                    "y_end": int(header_threshold),
                    "block_count": len(header_blocks),
                }
            )
        if body_blocks:
            regions.append(
                {
                    "type": "body",
                    "y_start": int(header_threshold),
                    "y_end": int(footer_threshold),
                    "block_count": len(body_blocks),
                }
            )
        if footer_blocks:
            regions.append(
                {
                    "type": "footer",
                    "y_start": int(footer_threshold),
                    "y_end": image_height,
                    "block_count": len(footer_blocks),
                }
            )

        return regions

    def create_metadata(self, **kwargs) -> Dict[str, Any]:
        """Create standard metadata dictionary."""
        return {
            "engine": self.name,
            "device": self.device,
            "languages": self.languages,
            **kwargs,
        }

    def process(self, file_path: Path) -> OCRResult:
        """Process a document file."""
        self._ensure_initialized()
        image = self.load_image(file_path)
        return self._process_image(image, str(file_path))

    def process_bytes(self, image_bytes: bytes) -> OCRResult:
        """Process image bytes."""
        self._ensure_initialized()
        image = self.load_image(image_bytes)
        return self._process_image(image, "bytes")

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """
        Process a PIL Image. To be implemented by subclasses.

        Args:
            image: PIL Image object
            source: Source identifier (filename or 'bytes')

        Returns:
            OCRResult
        """
        raise NotImplementedError("Subclasses must implement _process_image")
