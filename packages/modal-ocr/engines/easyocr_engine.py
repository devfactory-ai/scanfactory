"""EasyOCR Engine - OCR using EasyOCR."""

from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine


class EasyOCREngine(BaseEngine):
    """Implémentation du moteur EasyOCR."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.gpu = config.get("gpu", True) and self.device in ["cuda", "mps"]

    def initialize(self) -> None:
        """Initialize EasyOCR Reader."""
        try:
            import easyocr

            self._model = easyocr.Reader(
                self.languages,
                gpu=self.gpu,
                verbose=False,
            )

            print(f"✅ EasyOCR initialized (GPU: {self.gpu})")

        except ImportError as e:
            raise ImportError(
                f"EasyOCR initialization failed: {e}. "
                "Install with: pip install easyocr"
            )

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """Process image with EasyOCR."""
        image = self.ensure_rgb(image)
        img_array = np.array(image)

        # Run OCR
        results = self._model.readtext(img_array)

        if not results:
            return OCRResult(
                text="",
                confidence=0.0,
                blocks=[],
                layout={"width": image.width, "height": image.height, "regions": []},
                metadata=self.create_metadata(source=source),
            )

        # Parse results
        blocks = []
        texts = []
        confidences = []
        lines_by_y: Dict[int, List[Dict]] = {}

        for bbox, text, confidence in results:
            # bbox is [[x1,y1], [x2,y1], [x2,y2], [x1,y2]]
            x1 = int(min(p[0] for p in bbox))
            y1 = int(min(p[1] for p in bbox))
            x2 = int(max(p[0] for p in bbox))
            y2 = int(max(p[1] for p in bbox))

            y_center = (y1 + y2) / 2
            x_center = (x1 + x2) / 2

            block = {
                "text": text,
                "confidence": float(confidence),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "center": {"x": x_center, "y": y_center},
            }
            blocks.append(block)
            texts.append(text)
            confidences.append(confidence)

            # Group by line (20px tolerance)
            y_key = int(y_center / 20) * 20
            if y_key not in lines_by_y:
                lines_by_y[y_key] = []
            lines_by_y[y_key].append(block)

        # Reconstruct lines in reading order
        sorted_lines = []
        for y_key in sorted(lines_by_y.keys()):
            line_blocks = sorted(lines_by_y[y_key], key=lambda b: b["center"]["x"])
            sorted_lines.append(" ".join(b["text"] for b in line_blocks))

        # Detect regions
        regions = self.detect_regions(blocks, image.height)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        return OCRResult(
            text="\n".join(sorted_lines),
            confidence=round(avg_confidence, 4),
            blocks=blocks,
            layout={
                "width": image.width,
                "height": image.height,
                "regions": regions,
                "structured_text": "\n".join(sorted_lines),
            },
            metadata=self.create_metadata(
                source=source,
                block_count=len(blocks),
                gpu_used=self.gpu,
            ),
        )
