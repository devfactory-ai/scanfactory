"""SuryaOCR Engine - OCR using SuryaOCR with Docling."""

from pathlib import Path
from typing import Any, Dict

from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine


class SuryaEngine(BaseEngine):
    """Implémentation du moteur SuryaOCR avec Docling."""

    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self.pipeline_options = config.get("pipeline_options", {})

    def initialize(self) -> None:
        """Initialize SuryaOCR with Docling."""
        try:
            from docling.datamodel.base_models import InputFormat
            from docling.datamodel.pipeline_options import PdfPipelineOptions
            from docling.document_converter import DocumentConverter, PdfFormatOption
            from docling_surya import SuryaOcrOptions

            # Map device to accelerator
            accelerator = self._get_accelerator()

            pipeline_options = PdfPipelineOptions(
                do_ocr=self.pipeline_options.get("do_ocr", True),
                ocr_model="suryaocr",
                allow_external_plugins=self.pipeline_options.get("allow_external_plugins", True),
                accelerator=accelerator,
                ocr_options=SuryaOcrOptions(lang=self.languages),
            )

            self._model = DocumentConverter(
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                    InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options),
                }
            )

            # Store for direct image processing
            self._pipeline_options = pipeline_options

            print(f"✅ SuryaOCR (Docling) initialized on {self.device}")

        except ImportError as e:
            raise ImportError(
                "SuryaOCR requires docling and docling-surya. "
                "Install with: pip install docling docling-surya"
            ) from e

    def _get_accelerator(self) -> str:
        """Convert device to Docling accelerator format."""
        if self.device == "cuda":
            return "cuda"
        elif self.device == "mps":
            return "mps"
        return "cpu"

    def process(self, file_path: Path) -> OCRResult:
        """Process a document file with Docling."""
        self._ensure_initialized()

        result = self._model.convert(str(file_path))

        # Extract text and structure
        markdown_text = result.document.export_to_markdown()
        doc_dict = result.document.export_to_dict()

        # Get page count
        page_count = len(result.document.pages) if hasattr(result.document, "pages") else 1

        # Extract blocks if available
        blocks = self._extract_blocks(doc_dict)

        return OCRResult(
            text=markdown_text,
            confidence=0.95,  # Surya doesn't provide global confidence
            blocks=blocks,
            layout={
                "structured_text": markdown_text,
                "document_structure": doc_dict,
            },
            metadata=self.create_metadata(
                source=str(file_path),
                page_count=page_count,
                format="docling",
            ),
        )

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """Process PIL Image with Surya."""
        # For direct image processing, we need to save temporarily
        # or use surya directly without docling
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            image.save(tmp.name)
            tmp_path = Path(tmp.name)

        try:
            result = self.process(tmp_path)
            # Update source in metadata
            if result.metadata:
                result.metadata["source"] = source
            return result
        finally:
            tmp_path.unlink()

    def _extract_blocks(self, doc_dict: Dict) -> list:
        """Extract text blocks from Docling document structure."""
        blocks = []

        # Try to extract blocks from document structure
        if "texts" in doc_dict:
            for i, text_item in enumerate(doc_dict["texts"]):
                if isinstance(text_item, dict):
                    blocks.append(
                        {
                            "text": text_item.get("text", ""),
                            "confidence": text_item.get("confidence", 0.95),
                            "type": text_item.get("type", "text"),
                        }
                    )
                elif isinstance(text_item, str):
                    blocks.append(
                        {
                            "text": text_item,
                            "confidence": 0.95,
                            "type": "text",
                        }
                    )

        return blocks
