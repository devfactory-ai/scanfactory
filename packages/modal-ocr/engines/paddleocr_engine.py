"""PaddleOCR Engine - OCR using PaddleOCR."""

from pathlib import Path
from typing import Any, Dict, List

import numpy as np
from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine


class PaddleOCREngine(BaseEngine):
    """Implémentation du moteur PaddleOCR."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.det_db_thresh = config.get("det_db_thresh", 0.3)
        self.det_db_box_thresh = config.get("det_db_box_thresh", 0.5)
        self.det_db_unclip_ratio = config.get("det_db_unclip_ratio", 1.6)
        self.rec_batch_num = config.get("rec_batch_num", 6)

    def initialize(self) -> None:
        """Initialize PaddleOCR model."""
        from paddleocr import PaddleOCR

        # Map language codes
        lang = self._get_paddle_lang()

        self._model = PaddleOCR(
            use_angle_cls=True,
            lang=lang,
            use_gpu=(self.device == "cuda"),
            show_log=False,
            det_db_thresh=self.det_db_thresh,
            det_db_box_thresh=self.det_db_box_thresh,
            det_db_unclip_ratio=self.det_db_unclip_ratio,
            rec_batch_num=self.rec_batch_num,
        )

        print(f"✅ PaddleOCR initialized on {self.device}")

    def _get_paddle_lang(self) -> str:
        """Convert language codes to PaddleOCR format."""
        lang_map = {
            "en": "en",
            "fr": "fr",
            "ar": "ar",
            "zh": "ch",
            "de": "german",
            "es": "es",
            "it": "it",
            "pt": "pt",
            "ru": "ru",
            "ja": "japan",
            "ko": "korean",
        }

        # Use first language or default to french
        if self.languages:
            first_lang = self.languages[0]
            return lang_map.get(first_lang, "fr")
        return "fr"

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """Process image with PaddleOCR."""
        image = self.ensure_rgb(image)
        img_array = np.array(image)

        # Run OCR
        result = self._model.ocr(img_array, cls=True)

        if not result or not result[0]:
            return OCRResult(
                text="",
                confidence=0.0,
                blocks=[],
                layout={"width": image.width, "height": image.height, "regions": []},
                metadata=self.create_metadata(source=source, page_count=1),
            )

        # Parse results
        blocks = []
        texts = []
        confidences = []
        lines_by_y: Dict[int, List[Dict]] = {}

        for line in result[0]:
            box, (text, confidence) = line
            y_center = (box[0][1] + box[2][1]) / 2
            x_center = (box[0][0] + box[2][0]) / 2

            block = {
                "text": text,
                "confidence": float(confidence),
                "bbox": {
                    "x1": int(box[0][0]),
                    "y1": int(box[0][1]),
                    "x2": int(box[2][0]),
                    "y2": int(box[2][1]),
                },
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
            metadata=self.create_metadata(source=source, page_count=1, block_count=len(blocks)),
        )
