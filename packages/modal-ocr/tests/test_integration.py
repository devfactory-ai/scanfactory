"""Integration tests for ScanFactory OCR."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ocr_strategy import OCRResult


class TestOCRFactory(unittest.TestCase):
    """Test OCR Factory functionality."""

    def test_get_available_engines(self):
        """Test listing available engines."""
        from core.ocr_factory import OCREngineFactory

        # Should not raise even if engines are not installed
        engines = OCREngineFactory.get_available_engines()
        self.assertIsInstance(engines, list)

    def test_create_unknown_engine(self):
        """Test creating unknown engine raises error."""
        from core.ocr_factory import OCREngineFactory

        with self.assertRaises(ValueError) as ctx:
            OCREngineFactory.create_engine("unknown_engine", {"enabled": True})

        self.assertIn("unknown_engine", str(ctx.exception))

    def test_create_disabled_engine(self):
        """Test creating disabled engine raises error."""
        from core.ocr_factory import OCREngineFactory

        with self.assertRaises(ValueError) as ctx:
            OCREngineFactory.create_engine("paddleocr", {"enabled": False})

        self.assertIn("désactivé", str(ctx.exception))


class TestDocumentProcessor(unittest.TestCase):
    """Test Document Processor functionality."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = {
            "ocr": {
                "default_engine": "paddleocr",
                "output_dir": "./test_output",
                "engines": {
                    "paddleocr": {"enabled": True, "device": "cpu", "languages": ["en"]},
                },
                "output": {
                    "formats": ["markdown"],
                },
            }
        }

    def test_processor_initialization(self):
        """Test processor initialization."""
        from core.document_processor import DocumentProcessor

        processor = DocumentProcessor(config=self.config)

        self.assertEqual(processor.default_engine, "paddleocr")
        self.assertEqual(str(processor.output_dir), "test_output")

    def test_supported_extensions(self):
        """Test supported file extensions."""
        from core.document_processor import DocumentProcessor

        extensions = DocumentProcessor.SUPPORTED_EXTENSIONS

        self.assertIn(".pdf", extensions)
        self.assertIn(".png", extensions)
        self.assertIn(".jpg", extensions)
        self.assertIn(".jpeg", extensions)

    def test_process_nonexistent_file(self):
        """Test processing non-existent file."""
        from core.document_processor import DocumentProcessor

        processor = DocumentProcessor(config=self.config)
        result = processor.process_document(Path("/nonexistent/file.pdf"))

        self.assertFalse(result["success"])
        self.assertIn("not found", result["error"])

    def test_process_unsupported_format(self):
        """Test processing unsupported file format."""
        import tempfile
        from core.document_processor import DocumentProcessor

        processor = DocumentProcessor(config=self.config)

        with tempfile.NamedTemporaryFile(suffix=".xyz", delete=False) as f:
            f.write(b"test")
            temp_path = Path(f.name)

        try:
            result = processor.process_document(temp_path)
            self.assertFalse(result["success"])
            self.assertIn("Unsupported", result["error"])
        finally:
            temp_path.unlink()


class TestOCRResult(unittest.TestCase):
    """Test OCRResult dataclass."""

    def test_ocr_result_creation(self):
        """Test creating OCRResult."""
        from core.ocr_strategy import OCRResult

        result = OCRResult(
            text="Hello World",
            confidence=0.95,
            blocks=[{"text": "Hello", "confidence": 0.9}],
            layout={"width": 100, "height": 200},
            metadata={"engine": "test"},
        )

        self.assertEqual(result.text, "Hello World")
        self.assertEqual(result.confidence, 0.95)
        self.assertEqual(len(result.blocks), 1)

    def test_ocr_result_to_markdown(self):
        """Test OCRResult to markdown conversion."""
        from core.ocr_strategy import OCRResult

        result = OCRResult(
            text="Plain text",
            confidence=0.9,
            layout={"structured_text": "# Markdown Text"},
        )

        markdown = result.to_markdown()
        self.assertEqual(markdown, "# Markdown Text")

    def test_ocr_result_to_json(self):
        """Test OCRResult to JSON conversion."""
        from core.ocr_strategy import OCRResult

        result = OCRResult(
            text="Test",
            confidence=0.85,
            metadata={"engine": "test"},
        )

        json_data = result.to_json()

        self.assertEqual(json_data["text"], "Test")
        self.assertEqual(json_data["confidence"], 0.85)
        self.assertEqual(json_data["metadata"]["engine"], "test")


class TestEngineSwitching(unittest.TestCase):
    """Test switching between different engines."""

    @patch("engines.paddleocr_engine.PaddleOCR")
    def test_engine_switching(self, mock_paddle):
        """Test switching engines at runtime."""
        from core.document_processor import DocumentProcessor

        config = {
            "ocr": {
                "default_engine": "paddleocr",
                "output_dir": "./test_output",
                "engines": {
                    "paddleocr": {"enabled": True, "device": "cpu"},
                },
                "output": {"formats": ["json"]},
            }
        }

        processor = DocumentProcessor(config=config)

        # Verify we can get the engine
        engine = processor._get_engine("paddleocr")
        self.assertIsNotNone(engine)


if __name__ == "__main__":
    unittest.main()
