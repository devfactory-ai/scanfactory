"""Tests for GutenOCR engine."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ocr_strategy import OCRResult


class TestGutenOCREngine(unittest.TestCase):
    """Test cases for GutenOCR engine."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = {
            "enabled": True,
            "device": "cpu",
            "model_size": "3b",
            "output_format": "TEXT",
            "max_new_tokens": 4096,
            "use_cpu": True,
        }

    @patch("engines.gutenocr_engine.AutoProcessor")
    @patch("engines.gutenocr_engine.Qwen2VLForConditionalGeneration")
    def test_gutenocr_initialization(self, mock_model_class, mock_processor_class):
        """Test GutenOCR engine initialization."""
        from engines.gutenocr_engine import GutenOCREngine

        engine = GutenOCREngine(self.config)

        self.assertEqual(engine.model_size, "3b")
        self.assertEqual(engine.device, "cpu")
        self.assertEqual(engine.output_format.value, "TEXT")

    @patch("engines.gutenocr_engine.AutoProcessor")
    @patch("engines.gutenocr_engine.Qwen2VLForConditionalGeneration")
    def test_gutenocr_model_selection(self, mock_model_class, mock_processor_class):
        """Test model size selection."""
        from engines.gutenocr_engine import GutenOCREngine

        # Test 3B model
        config_3b = {**self.config, "model_size": "3b"}
        engine_3b = GutenOCREngine(config_3b)
        self.assertEqual(engine_3b.model_size, "3b")
        self.assertIn("3B", engine_3b.model_name)

        # Test 7B model
        config_7b = {**self.config, "model_size": "7b"}
        engine_7b = GutenOCREngine(config_7b)
        self.assertEqual(engine_7b.model_size, "7b")
        self.assertIn("7B", engine_7b.model_name)

    @patch("engines.gutenocr_engine.AutoProcessor")
    @patch("engines.gutenocr_engine.Qwen2VLForConditionalGeneration")
    def test_gutenocr_output_formats(self, mock_model_class, mock_processor_class):
        """Test different output formats."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

        formats = ["TEXT", "TEXT2D", "LINES", "WORDS", "PARAGRAPHS", "LATEX"]

        for fmt in formats:
            config = {**self.config, "output_format": fmt}
            engine = GutenOCREngine(config)
            self.assertEqual(engine.output_format, GutenOCROutputFormat[fmt])

    @patch("engines.gutenocr_engine.AutoProcessor")
    @patch("engines.gutenocr_engine.Qwen2VLForConditionalGeneration")
    def test_gutenocr_invalid_model_size_fallback(self, mock_model_class, mock_processor_class):
        """Test fallback for invalid model size."""
        from engines.gutenocr_engine import GutenOCREngine

        config = {**self.config, "model_size": "invalid"}
        engine = GutenOCREngine(config)

        # Should fallback to default (3b)
        self.assertEqual(engine.model_size, "3b")

    def test_gutenocr_build_prompt(self):
        """Test prompt building for different output formats."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

        engine = GutenOCREngine(self.config)

        # Test TEXT prompt
        engine.output_format = GutenOCROutputFormat.TEXT
        prompt = engine._build_prompt(GutenOCROutputFormat.TEXT)
        self.assertIn("Extract", prompt)

        # Test LATEX prompt
        prompt = engine._build_prompt(GutenOCROutputFormat.LATEX)
        self.assertIn("LaTeX", prompt)

        # Test WORDS prompt
        prompt = engine._build_prompt(GutenOCROutputFormat.WORDS)
        self.assertIn("word", prompt.lower())
        self.assertIn("JSON", prompt)

    def test_gutenocr_parse_output_text(self):
        """Test parsing TEXT output."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

        engine = GutenOCREngine(self.config)
        engine.output_format = GutenOCROutputFormat.TEXT

        text = "Hello World\nThis is a test."
        blocks = engine._parse_output(text)

        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "text")
        self.assertEqual(blocks[0]["text"], text.strip())

    def test_gutenocr_parse_output_lines(self):
        """Test parsing LINES output."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

        engine = GutenOCREngine(self.config)
        engine.output_format = GutenOCROutputFormat.LINES

        text = "Line 1\nLine 2\nLine 3"
        blocks = engine._parse_output(text)

        self.assertEqual(len(blocks), 3)
        self.assertEqual(blocks[0]["type"], "line")
        self.assertEqual(blocks[0]["line_number"], 1)
        self.assertEqual(blocks[1]["text"], "Line 2")

    def test_gutenocr_parse_output_paragraphs(self):
        """Test parsing PARAGRAPHS output."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

        engine = GutenOCREngine(self.config)
        engine.output_format = GutenOCROutputFormat.PARAGRAPHS

        text = "Paragraph 1 content.\n\nParagraph 2 content.\n\nParagraph 3 content."
        blocks = engine._parse_output(text)

        self.assertEqual(len(blocks), 3)
        self.assertEqual(blocks[0]["type"], "paragraph")
        self.assertEqual(blocks[0]["paragraph_number"], 1)

    def test_gutenocr_parse_output_words_json(self):
        """Test parsing WORDS output with JSON."""
        from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat
        import json

        engine = GutenOCREngine(self.config)
        engine.output_format = GutenOCROutputFormat.WORDS

        words_data = [
            {"word": "Hello", "confidence": 0.95, "bounding_box": {"x": 0, "y": 0}},
            {"word": "World", "confidence": 0.92, "bounding_box": {"x": 50, "y": 0}},
        ]
        text = json.dumps(words_data)
        blocks = engine._parse_output(text)

        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0]["type"], "word")
        self.assertEqual(blocks[0]["text"], "Hello")
        self.assertEqual(blocks[0]["confidence"], 0.95)

    def test_gutenocr_estimate_confidence(self):
        """Test confidence estimation."""
        from engines.gutenocr_engine import GutenOCREngine

        engine = GutenOCREngine(self.config)

        # Empty text should have 0 confidence
        confidence = engine._estimate_confidence("", [])
        self.assertEqual(confidence, 0.0)

        # Short text
        confidence = engine._estimate_confidence("Hello", [{"text": "Hello"}])
        self.assertGreater(confidence, 0.0)
        self.assertLessEqual(confidence, 1.0)

        # Longer text with more blocks should have higher confidence
        long_text = "A" * 150
        many_blocks = [{"text": f"block{i}"} for i in range(5)]
        confidence = engine._estimate_confidence(long_text, many_blocks)
        self.assertGreaterEqual(confidence, 0.9)
        self.assertLessEqual(confidence, 0.95)

    def test_gutenocr_device_detection(self):
        """Test device detection."""
        from engines.gutenocr_engine import GutenOCREngine

        # Test CPU forced
        config = {**self.config, "use_cpu": True}
        engine = GutenOCREngine(config)
        self.assertEqual(engine.device, "cpu")

        # Test auto detection (should be cpu without torch GPU)
        config = {**self.config, "device": "auto", "use_cpu": False}
        engine = GutenOCREngine(config)
        self.assertIn(engine.device, ["cuda", "mps", "cpu"])

    @patch("engines.gutenocr_engine.AutoProcessor")
    @patch("engines.gutenocr_engine.Qwen2VLForConditionalGeneration")
    def test_gutenocr_process_returns_ocr_result(self, mock_model_class, mock_processor_class):
        """Test that process returns OCRResult."""
        from engines.gutenocr_engine import GutenOCREngine
        from PIL import Image
        import torch
        import io

        # Setup mocks
        mock_processor = MagicMock()
        mock_processor.apply_chat_template.return_value = "formatted_prompt"
        mock_processor.return_value = {
            "input_ids": torch.tensor([[1, 2, 3]]),
            "attention_mask": torch.tensor([[1, 1, 1]]),
        }
        mock_processor.batch_decode.return_value = ["Extracted text from image."]
        mock_processor_class.from_pretrained.return_value = mock_processor

        mock_model = MagicMock()
        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 4, 5, 6]])
        mock_model_class.from_pretrained.return_value = mock_model

        engine = GutenOCREngine(self.config)
        engine._model = mock_model
        engine._processor = mock_processor

        # Create test image
        img = Image.new("RGB", (100, 100), color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        image_bytes = buffer.getvalue()

        result = engine.process_bytes(image_bytes)

        self.assertIsInstance(result, OCRResult)
        self.assertEqual(result.metadata["engine"], "gutenocr")
        self.assertEqual(result.metadata["model_size"], "3b")


class TestGutenOCRIntegration(unittest.TestCase):
    """Integration tests for GutenOCR (requires dependencies)."""

    @unittest.skipUnless(
        Path("tests/fixtures/sample.pdf").exists(),
        "Test fixtures not available"
    )
    def test_gutenocr_real_document(self):
        """Test with real document (requires fixtures)."""
        from core.document_processor import DocumentProcessor

        processor = DocumentProcessor()
        result = processor.process_document(
            Path("tests/fixtures/sample.pdf"),
            engine_name="gutenocr",
        )

        self.assertTrue(result.get("success", False))


if __name__ == "__main__":
    unittest.main()
