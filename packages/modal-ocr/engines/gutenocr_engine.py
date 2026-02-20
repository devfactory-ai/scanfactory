"""GutenOCR Engine - OCR using Roots Automation's GutenOCR VLM.

GutenOCR is a Vision Language Model based on Qwen2.5-VL, specialized for OCR tasks.
Supports two model sizes:
- GutenOCR-3B: Faster, lower memory (8GB), good for standard documents
- GutenOCR-7B: Higher accuracy, requires GPU (16GB), best for complex documents

Features:
- Multi-format output: TEXT, TEXT2D, LINES, WORDS, PARAGRAPHS, LATEX
- Multilingual support (100+ languages)
- Manuscript and handwriting recognition
- Table and form extraction
"""

import logging
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine

logger = logging.getLogger(__name__)


class GutenOCROutputFormat(Enum):
    """Output formats supported by GutenOCR."""
    TEXT = "TEXT"           # Plain text
    TEXT2D = "TEXT2D"       # Text with 2D position preservation
    LINES = "LINES"         # Line-by-line output
    WORDS = "WORDS"         # Word-level output with bounding boxes
    PARAGRAPHS = "PARAGRAPHS"  # Paragraph-level output
    LATEX = "LATEX"         # LaTeX format (for equations/formulas)


class GutenOCREngine(BaseEngine):
    """
    GutenOCR Engine implementation.

    Uses Roots Automation's GutenOCR models via HuggingFace transformers.
    Based on Qwen2.5-VL architecture.
    """

    # Model configurations
    MODELS = {
        "3b": {
            "name": "rootsautomation/GutenOCR-3B",
            "min_ram": 8,
            "recommended_device": "cpu",
        },
        "7b": {
            "name": "rootsautomation/GutenOCR-7B",
            "min_ram": 16,
            "recommended_device": "cuda",
        },
    }

    DEFAULT_MODEL = "3b"

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize GutenOCR Engine.

        Args:
            config: Configuration dictionary with optional keys:
                - model_size: "3b" or "7b" (default: "3b")
                - output_format: GutenOCROutputFormat value (default: TEXT)
                - use_cpu: Force CPU mode (default: False)
                - max_new_tokens: Maximum tokens to generate (default: 4096)
        """
        super().__init__(config)

        # Model configuration
        self.model_size = config.get("model_size", self.DEFAULT_MODEL).lower()
        if self.model_size not in self.MODELS:
            logger.warning(f"Unknown model size '{self.model_size}', using {self.DEFAULT_MODEL}")
            self.model_size = self.DEFAULT_MODEL

        self.model_config = self.MODELS[self.model_size]
        self.model_name = config.get("model_name", self.model_config["name"])

        # Output configuration
        output_format = config.get("output_format", "TEXT")
        if isinstance(output_format, str):
            self.output_format = GutenOCROutputFormat[output_format.upper()]
        else:
            self.output_format = output_format

        # Generation parameters
        self.max_new_tokens = config.get("max_new_tokens", 4096)
        self.do_sample = config.get("do_sample", False)
        self.temperature = config.get("temperature", 0.0)

        # Force CPU if requested
        if config.get("use_cpu", False):
            self.device = "cpu"

        # Model components (initialized lazily)
        self._processor = None

        logger.info(
            f"GutenOCR Engine configured: model={self.model_name}, "
            f"device={self.device}, format={self.output_format.value}"
        )

    def initialize(self) -> None:
        """Initialize the GutenOCR model from HuggingFace."""
        try:
            import torch
            from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

            logger.info(f"Loading GutenOCR model: {self.model_name}")

            # Determine dtype based on device
            if self.device == "cuda":
                dtype = torch.float16
            elif self.device == "mps":
                dtype = torch.float32  # MPS doesn't support float16 well
            else:
                dtype = torch.float32

            # Load processor
            self._processor = AutoProcessor.from_pretrained(
                self.model_name,
                trust_remote_code=True,
            )

            # Load model with appropriate device mapping
            if self.device == "cuda":
                self._model = Qwen2VLForConditionalGeneration.from_pretrained(
                    self.model_name,
                    torch_dtype=dtype,
                    device_map="auto",
                    trust_remote_code=True,
                )
            else:
                self._model = Qwen2VLForConditionalGeneration.from_pretrained(
                    self.model_name,
                    torch_dtype=dtype,
                    trust_remote_code=True,
                )
                if self.device == "mps":
                    self._model = self._model.to("mps")

            logger.info(f"✅ GutenOCR {self.model_size.upper()} initialized on {self.device}")

        except ImportError as e:
            raise ImportError(
                f"GutenOCR requires transformers and torch. Install with: "
                f"pip install transformers torch qwen-vl-utils. Error: {e}"
            )
        except Exception as e:
            raise RuntimeError(f"Failed to initialize GutenOCR: {e}")

    def _build_prompt(self, output_format: GutenOCROutputFormat) -> str:
        """
        Build the OCR prompt based on output format.

        Args:
            output_format: Desired output format

        Returns:
            Prompt string for the model
        """
        prompts = {
            GutenOCROutputFormat.TEXT: "Extract all text from this image.",
            GutenOCROutputFormat.TEXT2D: (
                "Extract all text from this image, preserving the 2D spatial layout. "
                "Use spaces and newlines to maintain the original positioning."
            ),
            GutenOCROutputFormat.LINES: (
                "Extract text from this image line by line. "
                "Output each line on a separate line."
            ),
            GutenOCROutputFormat.WORDS: (
                "Extract all words from this image. "
                "For each word, provide: word, confidence, bounding_box (x, y, width, height). "
                "Format as JSON array."
            ),
            GutenOCROutputFormat.PARAGRAPHS: (
                "Extract text from this image organized by paragraphs. "
                "Separate each paragraph with a blank line."
            ),
            GutenOCROutputFormat.LATEX: (
                "Extract all mathematical expressions and formulas from this image. "
                "Output in LaTeX format. For regular text, output as plain text."
            ),
        }
        return prompts.get(output_format, prompts[GutenOCROutputFormat.TEXT])

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """
        Process image with GutenOCR.

        Args:
            image: PIL Image to process
            source: Source identifier (filename or 'bytes')

        Returns:
            OCRResult with extracted text and metadata
        """
        import torch

        image = self.ensure_rgb(image)

        # Build conversation for Qwen2-VL
        prompt = self._build_prompt(self.output_format)

        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        # Apply chat template
        text_prompt = self._processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
        )

        # Prepare inputs
        inputs = self._processor(
            text=[text_prompt],
            images=[image],
            padding=True,
            return_tensors="pt",
        )

        # Move to device
        if self.device == "cuda":
            inputs = {k: v.cuda() if hasattr(v, 'cuda') else v for k, v in inputs.items()}
        elif self.device == "mps":
            inputs = {k: v.to("mps") if hasattr(v, 'to') else v for k, v in inputs.items()}

        # Generate
        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                do_sample=self.do_sample,
                temperature=self.temperature if self.do_sample else None,
            )

        # Decode output
        # Get only the generated tokens (skip input tokens)
        generated_ids = output_ids[:, inputs["input_ids"].shape[1]:]
        text = self._processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=True,
        )[0]

        # Parse output based on format
        blocks = self._parse_output(text)
        confidence = self._estimate_confidence(text, blocks)

        return OCRResult(
            text=text,
            confidence=confidence,
            blocks=blocks,
            layout={
                "structured_text": text,
                "output_format": self.output_format.value,
                "width": image.width,
                "height": image.height,
            },
            metadata=self.create_metadata(
                source=source,
                model=self.model_name,
                model_size=self.model_size,
                output_format=self.output_format.value,
            ),
        )

    def _parse_output(self, text: str) -> List[Dict[str, Any]]:
        """
        Parse the model output into blocks based on output format.

        Args:
            text: Raw model output

        Returns:
            List of text blocks with metadata
        """
        blocks = []

        if self.output_format == GutenOCROutputFormat.WORDS:
            # Try to parse JSON output for WORDS format
            try:
                import json
                # Look for JSON array in the output
                json_start = text.find('[')
                json_end = text.rfind(']') + 1
                if json_start >= 0 and json_end > json_start:
                    words = json.loads(text[json_start:json_end])
                    for word_data in words:
                        if isinstance(word_data, dict):
                            blocks.append({
                                "text": word_data.get("word", ""),
                                "confidence": word_data.get("confidence", 0.9),
                                "bbox": word_data.get("bounding_box"),
                                "type": "word",
                            })
                        elif isinstance(word_data, str):
                            blocks.append({
                                "text": word_data,
                                "confidence": 0.9,
                                "type": "word",
                            })
            except (json.JSONDecodeError, ValueError):
                # Fallback: split by whitespace
                for word in text.split():
                    blocks.append({
                        "text": word,
                        "confidence": 0.9,
                        "type": "word",
                    })

        elif self.output_format == GutenOCROutputFormat.LINES:
            for i, line in enumerate(text.split('\n')):
                if line.strip():
                    blocks.append({
                        "text": line,
                        "confidence": 0.9,
                        "line_number": i + 1,
                        "type": "line",
                    })

        elif self.output_format == GutenOCROutputFormat.PARAGRAPHS:
            paragraphs = text.split('\n\n')
            for i, para in enumerate(paragraphs):
                if para.strip():
                    blocks.append({
                        "text": para.strip(),
                        "confidence": 0.9,
                        "paragraph_number": i + 1,
                        "type": "paragraph",
                    })

        elif self.output_format == GutenOCROutputFormat.LATEX:
            # Extract LaTeX expressions
            import re
            latex_pattern = r'(\$\$?[^$]+\$\$?|\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})'
            matches = re.findall(latex_pattern, text)
            for i, match in enumerate(matches):
                blocks.append({
                    "text": match,
                    "confidence": 0.9,
                    "type": "latex",
                    "index": i,
                })
            # Also add plain text blocks
            plain_text = re.sub(latex_pattern, '', text).strip()
            if plain_text:
                blocks.append({
                    "text": plain_text,
                    "confidence": 0.9,
                    "type": "text",
                })

        else:
            # TEXT and TEXT2D: single block
            if text.strip():
                blocks.append({
                    "text": text.strip(),
                    "confidence": 0.9,
                    "type": "text",
                })

        return blocks

    def _estimate_confidence(self, text: str, blocks: List[Dict]) -> float:
        """
        Estimate overall confidence score.

        Args:
            text: Extracted text
            blocks: Parsed blocks

        Returns:
            Confidence score between 0.0 and 1.0
        """
        if not text or not text.strip():
            return 0.0

        # Base confidence for VLM-based extraction
        base_confidence = 0.85

        # Adjust based on text characteristics
        adjustments = 0.0

        # Longer text generally means more content extracted
        if len(text) > 100:
            adjustments += 0.05

        # Multiple blocks indicate structure detection
        if len(blocks) > 3:
            adjustments += 0.05

        # Cap at 0.95 (never 100% confident)
        return min(base_confidence + adjustments, 0.95)

    def process_with_format(
        self,
        file_path: Path,
        output_format: GutenOCROutputFormat,
    ) -> OCRResult:
        """
        Process a document with a specific output format.

        Args:
            file_path: Path to the document
            output_format: Desired output format

        Returns:
            OCRResult with extracted content
        """
        # Temporarily change output format
        original_format = self.output_format
        self.output_format = output_format

        try:
            result = self.process(file_path)
        finally:
            self.output_format = original_format

        return result

    def extract_tables(self, file_path: Path) -> List[Dict[str, Any]]:
        """
        Extract tables from a document.

        Args:
            file_path: Path to the document

        Returns:
            List of extracted tables with structure
        """
        self._ensure_initialized()
        image = self.load_image(file_path)
        image = self.ensure_rgb(image)

        import torch

        # Use specialized table extraction prompt
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": (
                        "Extract all tables from this image. "
                        "For each table, provide the structure as a JSON object with: "
                        "- headers: list of column headers "
                        "- rows: list of rows (each row is a list of cell values) "
                        "- caption: table caption if present"
                    )},
                ],
            }
        ]

        text_prompt = self._processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
        )

        inputs = self._processor(
            text=[text_prompt],
            images=[image],
            padding=True,
            return_tensors="pt",
        )

        if self.device == "cuda":
            inputs = {k: v.cuda() if hasattr(v, 'cuda') else v for k, v in inputs.items()}
        elif self.device == "mps":
            inputs = {k: v.to("mps") if hasattr(v, 'to') else v for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = self._model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                do_sample=False,
            )

        generated_ids = output_ids[:, inputs["input_ids"].shape[1]:]
        text = self._processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )[0]

        # Parse tables from JSON
        tables = []
        try:
            import json
            # Find JSON objects in output
            json_start = text.find('[')
            json_end = text.rfind(']') + 1
            if json_start >= 0 and json_end > json_start:
                tables = json.loads(text[json_start:json_end])
            elif '{' in text:
                # Single table
                json_start = text.find('{')
                json_end = text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    tables = [json.loads(text[json_start:json_end])]
        except (json.JSONDecodeError, ValueError):
            logger.warning("Could not parse table structure from output")

        return tables

    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Process multiple documents efficiently.

        GutenOCR can process images in batches for better throughput on GPU.

        Args:
            file_paths: List of file paths to process

        Returns:
            List of OCRResults
        """
        self._ensure_initialized()

        # For CPU mode or small batches, use sequential processing
        if self.device == "cpu" or len(file_paths) <= 2:
            return super().batch_process(file_paths)

        # GPU batch processing
        import torch

        results = []
        batch_size = self.config.get("batch_size", 4)

        for i in range(0, len(file_paths), batch_size):
            batch_paths = file_paths[i:i + batch_size]
            batch_images = []

            for fp in batch_paths:
                try:
                    img = self.load_image(fp)
                    img = self.ensure_rgb(img)
                    batch_images.append(img)
                except Exception as e:
                    logger.error(f"Error loading {fp}: {e}")
                    results.append(OCRResult(
                        text="",
                        confidence=0.0,
                        metadata={
                            "error": str(e),
                            "file": str(fp),
                            "engine": self.name,
                        },
                    ))
                    batch_images.append(None)

            # Process valid images in batch
            valid_images = [(img, path) for img, path in zip(batch_images, batch_paths) if img is not None]

            if valid_images:
                for img, path in valid_images:
                    try:
                        result = self._process_image(img, str(path))
                        results.append(result)
                    except Exception as e:
                        logger.error(f"Error processing {path}: {e}")
                        results.append(OCRResult(
                            text="",
                            confidence=0.0,
                            metadata={
                                "error": str(e),
                                "file": str(path),
                                "engine": self.name,
                            },
                        ))

            # Cleanup after each batch
            if self.config.get("memory_cleanup", True):
                self.cleanup()

        return results
