"""Tests for SuryaOCR engine."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ocr_strategy import OCRResult


class TestSuryaEngine(unittest.TestCase):
    """Test cases for SuryaOCR engine."""

    def setUp(self):
        """Set up test fixtures."""
        self.test_file = Path("tests/fixtures/sample.pdf")
        self.config = {
            "enabled": True,
            "device": "cpu",
            "languages": ["en", "fr"],
            "pipeline_options": {
                "do_ocr": True,
                "allow_external_plugins": True,
            },
        }

    @patch("engines.surya_engine.DocumentConverter")
    @patch("engines.surya_engine.SuryaOcrOptions")
    @patch("engines.surya_engine.PdfPipelineOptions")
    def test_surya_initialization(self, mock_pipeline, mock_options, mock_converter):
        """Test SuryaOCR engine initialization."""
        from engines.surya_engine import SuryaEngine

        engine = SuryaEngine(self.config)
        engine.initialize()

        self.assertEqual(engine.device, "cpu")
        self.assertEqual(engine.languages, ["en", "fr"])

    @patch("engines.surya_engine.DocumentConverter")
    @patch("engines.surya_engine.SuryaOcrOptions")
    @patch("engines.surya_engine.PdfPipelineOptions")
    def test_surya_process_returns_ocr_result(self, mock_pipeline, mock_options, mock_converter):
        """Test that process returns OCRResult."""
        from engines.surya_engine import SuryaEngine

        # Mock converter result
        mock_doc = MagicMock()
        mock_doc.export_to_markdown.return_value = "# Test Document\n\nContent here."
        mock_doc.export_to_dict.return_value = {"text": "Test"}
        mock_doc.pages = [MagicMock()]

        mock_result = MagicMock()
        mock_result.document = mock_doc

        mock_converter_instance = MagicMock()
        mock_converter_instance.convert.return_value = mock_result
        mock_converter.return_value = mock_converter_instance

        engine = SuryaEngine(self.config)
        engine._model = mock_converter_instance

        # Create a temporary test file
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"PDF content")
            temp_path = Path(f.name)

        try:
            result = engine.process(temp_path)

            self.assertIsInstance(result, OCRResult)
            self.assertIn("Test Document", result.text)
            self.assertEqual(result.metadata["engine"], "surya")
        finally:
            temp_path.unlink()

    def test_surya_gpu_detection(self):
        """Test GPU detection for Surya."""
        from engines.surya_engine import SuryaEngine

        # Test CPU fallback
        config = {**self.config, "device": "cpu"}
        engine = SuryaEngine(config)
        self.assertEqual(engine.device, "cpu")

        # Test auto detection
        config = {**self.config, "device": "auto"}
        engine = SuryaEngine(config)
        self.assertIn(engine.device, ["cuda", "mps", "cpu"])


class TestSuryaIntegration(unittest.TestCase):
    """Integration tests for SuryaOCR (requires dependencies)."""

    @unittest.skipUnless(
        Path("tests/fixtures/sample.pdf").exists(),
        "Test fixtures not available"
    )
    def test_surya_real_document(self):
        """Test with real document (requires fixtures)."""
        from core.document_processor import DocumentProcessor

        processor = DocumentProcessor()
        result = processor.process_document(
            Path("tests/fixtures/sample.pdf"),
            engine_name="surya",
        )

        self.assertTrue(result.get("success", False))


if __name__ == "__main__":
    unittest.main()
