"""Tesseract Engine - OCR using Tesseract."""

from pathlib import Path
from typing import Any, Dict

from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine


class TesseractEngine(BaseEngine):
    """Implémentation du moteur Tesseract OCR."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.lang = config.get("lang", "fra+eng")
        self.tesseract_config = config.get("config", "--psm 3")

    def initialize(self) -> None:
        """Initialize Tesseract (verify installation)."""
        try:
            import pytesseract

            # Verify tesseract is installed
            pytesseract.get_tesseract_version()
            self._model = pytesseract

            print(f"✅ Tesseract initialized (lang: {self.lang})")

        except Exception as e:
            raise ImportError(
                f"Tesseract initialization failed: {e}. "
                "Install Tesseract: apt-get install tesseract-ocr tesseract-ocr-fra"
            )

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """Process image with Tesseract."""
        image = self.ensure_rgb(image)

        # Get full OCR data
        data = self._model.image_to_data(
            image,
            lang=self.lang,
            config=self.tesseract_config,
            output_type=self._model.Output.DICT,
        )

        # Extract text and blocks
        text = self._model.image_to_string(
            image,
            lang=self.lang,
            config=self.tesseract_config,
        )

        blocks = []
        confidences = []

        n_boxes = len(data["level"])
        for i in range(n_boxes):
            # Level 5 = word level
            if data["level"][i] == 5 and data["text"][i].strip():
                conf = float(data["conf"][i])
                if conf > 0:  # Filter out invalid confidence
                    blocks.append(
                        {
                            "text": data["text"][i],
                            "confidence": conf / 100.0,  # Normalize to 0-1
                            "bbox": {
                                "x1": data["left"][i],
                                "y1": data["top"][i],
                                "x2": data["left"][i] + data["width"][i],
                                "y2": data["top"][i] + data["height"][i],
                            },
                            "block_num": data["block_num"][i],
                            "line_num": data["line_num"][i],
                            "word_num": data["word_num"][i],
                        }
                    )
                    confidences.append(conf / 100.0)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        # Detect regions
        regions = self.detect_regions(blocks, image.height)

        return OCRResult(
            text=text.strip(),
            confidence=round(avg_confidence, 4),
            blocks=blocks,
            layout={
                "width": image.width,
                "height": image.height,
                "regions": regions,
                "structured_text": text.strip(),
            },
            metadata=self.create_metadata(
                source=source,
                lang=self.lang,
                word_count=len(blocks),
            ),
        )
