"""Tests for HunyuanOCR engine."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ocr_strategy import OCRResult


class TestHunyuanEngine(unittest.TestCase):
    """Test cases for HunyuanOCR engine."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = {
            "enabled": True,
            "device": "cpu",
            "languages": ["en", "fr", "zh"],
            "tasks": ["detection", "parsing", "layout"],
            "batch_size": 32,
            "memory_cleanup": True,
        }

    def test_hunyuan_config(self):
        """Test HunyuanOCR configuration."""
        from engines.hunyuan_engine import HunyuanEngine

        engine = HunyuanEngine(self.config)

        self.assertEqual(engine.device, "cpu")
        self.assertEqual(engine.languages, ["en", "fr", "zh"])
        self.assertEqual(engine.tasks, ["detection", "parsing", "layout"])
        self.assertEqual(engine.batch_size, 32)

    @patch("engines.hunyuan_engine.HunyuanOCR")
    def test_hunyuan_initialization(self, mock_hunyuan):
        """Test HunyuanOCR initialization."""
        from engines.hunyuan_engine import HunyuanEngine

        mock_model = MagicMock()
        mock_hunyuan.return_value = mock_model

        engine = HunyuanEngine(self.config)
        engine.initialize()

        mock_hunyuan.assert_called_once_with(
            device="cpu",
            lang=["en", "fr", "zh"],
            batch_size=32,
        )

    def test_hunyuan_metadata_creation(self):
        """Test metadata creation."""
        from engines.hunyuan_engine import HunyuanEngine

        engine = HunyuanEngine(self.config)
        metadata = engine.create_metadata(source="test.pdf", page_count=5)

        self.assertEqual(metadata["engine"], "hunyuan")
        self.assertEqual(metadata["source"], "test.pdf")
        self.assertEqual(metadata["page_count"], 5)


class TestHunyuanBatch(unittest.TestCase):
    """Test batch processing for HunyuanOCR."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = {
            "enabled": True,
            "device": "cpu",
            "languages": ["en"],
            "tasks": ["detection"],
            "memory_cleanup": True,
        }

    @patch("engines.hunyuan_engine.HunyuanOCR")
    def test_batch_process(self, mock_hunyuan):
        """Test batch processing."""
        from engines.hunyuan_engine import HunyuanEngine

        # Mock model
        mock_model = MagicMock()
        mock_result = MagicMock()
        mock_result.export_to_markdown.return_value = "Test content"
        mock_result.get_confidence_score.return_value = 0.95
        mock_result.get_layout_info.return_value = {}
        mock_result.page_count = 1
        mock_result.blocks = []

        mock_model.process.return_value = mock_result
        mock_hunyuan.return_value = mock_model

        engine = HunyuanEngine(self.config)
        engine._model = mock_model

        # Create temp files
        import tempfile
        temp_files = []
        for i in range(3):
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
                # Write minimal PNG
                f.write(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
                temp_files.append(Path(f.name))

        try:
            results = engine.batch_process(temp_files)

            self.assertEqual(len(results), 3)
            for result in results:
                self.assertIsInstance(result, OCRResult)
        finally:
            for f in temp_files:
                f.unlink()


if __name__ == "__main__":
    unittest.main()
