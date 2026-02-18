"""HunyuanOCR Engine - OCR using Tencent's HunyuanOCR VLM."""

from pathlib import Path
from typing import Any, Dict, List

from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine


class HunyuanEngine(BaseEngine):
    """Implémentation du moteur HunyuanOCR (VLM 1B paramètres)."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.tasks = config.get("tasks", ["detection", "parsing", "layout"])
        self.batch_size = config.get("batch_size", 32)

    def initialize(self) -> None:
        """Initialize HunyuanOCR model."""
        try:
            # Note: HunyuanOCR may need to be installed from GitHub
            # This is a placeholder for the actual import
            from hunyuan_ocr import HunyuanOCR

            self._model = HunyuanOCR(
                device=self.device,
                lang=self.languages,
                batch_size=self.batch_size,
            )

            print(f"✅ HunyuanOCR initialized on {self.device}")

        except ImportError:
            # Fallback: Try to use transformers-based loading
            self._initialize_with_transformers()

    def _initialize_with_transformers(self) -> None:
        """Initialize using Hugging Face transformers if direct import fails."""
        try:
            import torch
            from transformers import AutoModelForVision2Seq, AutoProcessor

            model_name = "tencent/HunyuanOCR"  # Placeholder - actual model name may vary

            self._processor = AutoProcessor.from_pretrained(model_name)
            self._model = AutoModelForVision2Seq.from_pretrained(
                model_name,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map=self.device if self.device != "cpu" else None,
            )

            if self.device == "cuda":
                self._model = self._model.cuda()
            elif self.device == "mps":
                self._model = self._model.to("mps")

            self._use_transformers = True
            print(f"✅ HunyuanOCR (transformers) initialized on {self.device}")

        except Exception as e:
            raise ImportError(
                f"HunyuanOCR initialization failed: {e}. "
                "Install from: https://github.com/tencent/HunyuanOCR"
            )

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """Process image with HunyuanOCR."""
        image = self.ensure_rgb(image)

        if hasattr(self, "_use_transformers") and self._use_transformers:
            return self._process_with_transformers(image, source)

        # Use native HunyuanOCR API
        result = self._model.process(
            image,
            tasks=self.tasks,
        )

        # Extract markdown text
        markdown_text = result.export_to_markdown() if hasattr(result, "export_to_markdown") else str(result)

        # Get confidence score
        confidence = result.get_confidence_score() if hasattr(result, "get_confidence_score") else 0.9

        # Get layout info
        layout_info = result.get_layout_info() if hasattr(result, "get_layout_info") else {}

        # Get page count
        page_count = result.page_count if hasattr(result, "page_count") else 1

        # Extract blocks
        blocks = self._extract_blocks(result)

        return OCRResult(
            text=markdown_text,
            confidence=confidence,
            blocks=blocks,
            layout={
                "structured_text": markdown_text,
                "layout_info": layout_info,
                "width": image.width,
                "height": image.height,
            },
            metadata=self.create_metadata(
                source=source,
                tasks=self.tasks,
                page_count=page_count,
            ),
        )

    def _process_with_transformers(self, image: Image.Image, source: str) -> OCRResult:
        """Process image using transformers-based model."""
        import torch

        # Prepare inputs
        inputs = self._processor(images=image, return_tensors="pt")

        if self.device == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}
        elif self.device == "mps":
            inputs = {k: v.to("mps") for k, v in inputs.items()}

        # Generate
        with torch.no_grad():
            outputs = self._model.generate(
                **inputs,
                max_new_tokens=2048,
                do_sample=False,
            )

        # Decode
        text = self._processor.batch_decode(outputs, skip_special_tokens=True)[0]

        return OCRResult(
            text=text,
            confidence=0.9,
            blocks=[],
            layout={
                "structured_text": text,
                "width": image.width,
                "height": image.height,
            },
            metadata=self.create_metadata(
                source=source,
                tasks=self.tasks,
                model_type="transformers",
            ),
        )

    def _extract_blocks(self, result: Any) -> List[Dict]:
        """Extract text blocks from HunyuanOCR result."""
        blocks = []

        if hasattr(result, "blocks"):
            for block in result.blocks:
                blocks.append(
                    {
                        "text": block.text if hasattr(block, "text") else str(block),
                        "confidence": block.confidence if hasattr(block, "confidence") else 0.9,
                        "bbox": block.bbox if hasattr(block, "bbox") else None,
                        "type": block.type if hasattr(block, "type") else "text",
                    }
                )

        return blocks

    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Batch processing optimisé pour HunyuanOCR.

        HunyuanOCR supporte le batch processing natif.
        """
        self._ensure_initialized()

        if hasattr(self._model, "batch_process"):
            # Use native batch processing
            images = [self.load_image(fp) for fp in file_paths]
            results = self._model.batch_process(images, tasks=self.tasks)

            ocr_results = []
            for i, result in enumerate(results):
                ocr_results.append(
                    OCRResult(
                        text=result.export_to_markdown() if hasattr(result, "export_to_markdown") else str(result),
                        confidence=result.get_confidence_score() if hasattr(result, "get_confidence_score") else 0.9,
                        blocks=self._extract_blocks(result),
                        layout=result.get_layout_info() if hasattr(result, "get_layout_info") else {},
                        metadata=self.create_metadata(
                            source=str(file_paths[i]),
                            batch_index=i,
                        ),
                    )
                )

            return ocr_results

        # Fallback to sequential processing
        return super().batch_process(file_paths)
