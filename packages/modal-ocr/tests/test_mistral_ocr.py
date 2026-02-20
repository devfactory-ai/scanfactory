"""Tests for Mistral OCR engine."""

import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock
import sys
import json

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.ocr_strategy import OCRResult


class TestMistralOCREngine(unittest.TestCase):
    """Test cases for Mistral OCR engine."""

    def setUp(self):
        """Set up test fixtures."""
        self.config = {
            "enabled": True,
            "api_key": "test_api_key",
            "api_url": "https://api.mistral.ai/v1/ocr",
            "model": "mistral-ocr-2512",
            "timeout": 60,
            "retry_attempts": 3,
            "extract_tables": True,
            "extract_structure": True,
        }

    def test_mistral_initialization(self):
        """Test Mistral OCR engine initialization."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)

        self.assertEqual(engine.api_key, "test_api_key")
        self.assertEqual(engine.model, "mistral-ocr-2512")
        self.assertEqual(engine.timeout, 60)
        self.assertEqual(engine.device, "api")

    def test_mistral_initialization_env_api_key(self):
        """Test initialization with API key from environment."""
        from engines.mistral_ocr_engine import MistralOCREngine
        import os

        # Config without API key
        config = {**self.config}
        del config["api_key"]

        # Mock environment variable
        with patch.dict(os.environ, {"MISTRAL_API_KEY": "env_api_key"}):
            engine = MistralOCREngine(config)
            self.assertEqual(engine.api_key, "env_api_key")

    def test_mistral_engine_name(self):
        """Test engine name property."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)
        self.assertEqual(engine.name, "mistral_ocr")

    def test_mistral_cost_tracking(self):
        """Test cost tracking functionality."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)

        # Initial state
        cost_info = engine.get_cost_estimate()
        self.assertEqual(cost_info["pages_processed"], 0)
        self.assertEqual(cost_info["estimated_cost_usd"], 0.0)

        # Simulate page processing
        engine._pages_processed = 100
        engine._estimated_cost = 0.2

        cost_info = engine.get_cost_estimate()
        self.assertEqual(cost_info["pages_processed"], 100)
        self.assertEqual(cost_info["estimated_cost_usd"], 0.2)

        # Reset
        engine.reset_cost_tracking()
        cost_info = engine.get_cost_estimate()
        self.assertEqual(cost_info["pages_processed"], 0)

    def test_mistral_table_to_text(self):
        """Test table to text conversion."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)

        table = {
            "headers": ["Name", "Age", "City"],
            "rows": [
                ["Alice", "30", "Paris"],
                ["Bob", "25", "Lyon"],
            ],
        }

        text = engine._table_to_text(table)

        self.assertIn("Name", text)
        self.assertIn("Alice", text)
        self.assertIn("Bob", text)
        self.assertIn("|", text)

    def test_mistral_parse_response(self):
        """Test response parsing."""
        from engines.mistral_ocr_engine import MistralOCREngine
        from PIL import Image

        engine = MistralOCREngine(self.config)

        # Mock response
        response = {
            "text": "Document content here.",
            "confidence": 0.95,
            "tables": [
                {"headers": ["Col1", "Col2"], "rows": [["A", "B"]]}
            ],
            "headers": ["Header 1"],
            "footers": ["Footer 1"],
        }

        image = Image.new("RGB", (100, 100))
        result = engine._parse_response(response, image, "test.pdf")

        self.assertIsInstance(result, OCRResult)
        self.assertEqual(result.text, "Document content here.")
        self.assertEqual(result.confidence, 0.95)
        self.assertIn("tables", result.layout["structured_data"])

    def test_mistral_extract_blocks_from_response(self):
        """Test block extraction from various response formats."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)

        # Test with 'blocks' field
        response = {
            "blocks": [
                {"text": "Block 1", "confidence": 0.9, "type": "text"},
                {"text": "Block 2", "confidence": 0.85, "type": "header"},
            ]
        }
        blocks = engine._extract_blocks(response)
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0]["text"], "Block 1")

        # Test with 'pages' structure
        response = {
            "pages": [
                {"blocks": [{"text": "Page 1 Block", "confidence": 0.9}]}
            ]
        }
        blocks = engine._extract_blocks(response)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["page"], 1)

        # Test with tables
        response = {
            "tables": [
                {"headers": ["A", "B"], "rows": [["1", "2"]]}
            ]
        }
        blocks = engine._extract_blocks(response)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["type"], "table")

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_make_request_success(self, mock_httpx):
        """Test successful API request."""
        from engines.mistral_ocr_engine import MistralOCREngine

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"text": "Success", "confidence": 0.9}
        mock_httpx.post.return_value = mock_response

        engine = MistralOCREngine(self.config)

        result = engine._make_request("", {"test": "data"})

        self.assertEqual(result["text"], "Success")
        mock_httpx.post.assert_called_once()

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_make_request_retry_on_500(self, mock_httpx):
        """Test retry logic on server error."""
        from engines.mistral_ocr_engine import MistralOCREngine
        import time

        # First two calls fail, third succeeds
        mock_response_error = MagicMock()
        mock_response_error.status_code = 500

        mock_response_success = MagicMock()
        mock_response_success.status_code = 200
        mock_response_success.json.return_value = {"text": "Success"}

        mock_httpx.post.side_effect = [
            mock_response_error,
            mock_response_error,
            mock_response_success,
        ]

        config = {**self.config, "retry_attempts": 3}
        engine = MistralOCREngine(config)

        # Patch time.sleep to speed up test
        with patch("time.sleep"):
            result = engine._make_request("", {"test": "data"})

        self.assertEqual(result["text"], "Success")
        self.assertEqual(mock_httpx.post.call_count, 3)

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_make_request_no_retry_on_400(self, mock_httpx):
        """Test no retry on client error."""
        from engines.mistral_ocr_engine import MistralOCREngine

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.json.return_value = {"error": {"message": "Bad request"}}
        mock_httpx.post.return_value = mock_response

        engine = MistralOCREngine(self.config)

        with self.assertRaises(RuntimeError) as context:
            engine._make_request("", {"test": "data"})

        self.assertIn("400", str(context.exception))
        self.assertEqual(mock_httpx.post.call_count, 1)

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_make_request_rate_limit(self, mock_httpx):
        """Test rate limit handling."""
        from engines.mistral_ocr_engine import MistralOCREngine

        mock_response_limited = MagicMock()
        mock_response_limited.status_code = 429
        mock_response_limited.headers = {"Retry-After": "1"}

        mock_response_success = MagicMock()
        mock_response_success.status_code = 200
        mock_response_success.json.return_value = {"text": "Success"}

        mock_httpx.post.side_effect = [
            mock_response_limited,
            mock_response_success,
        ]

        engine = MistralOCREngine(self.config)

        with patch("time.sleep"):
            result = engine._make_request("", {"test": "data"})

        self.assertEqual(result["text"], "Success")

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_process_document_url(self, mock_httpx):
        """Test processing document by URL."""
        from engines.mistral_ocr_engine import MistralOCREngine

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "text": "Document from URL",
            "confidence": 0.9,
        }
        mock_httpx.post.return_value = mock_response
        mock_httpx.get.return_value = MagicMock(status_code=200)

        engine = MistralOCREngine(self.config)
        engine._model = True  # Mark as initialized

        result = engine.process_document_url("https://example.com/doc.pdf")

        self.assertIsInstance(result, OCRResult)
        self.assertEqual(result.text, "Document from URL")

    def test_mistral_cleanup(self):
        """Test cleanup method."""
        from engines.mistral_ocr_engine import MistralOCREngine

        engine = MistralOCREngine(self.config)

        # Cleanup should not raise for API-based engine
        engine.cleanup()

    @patch("engines.mistral_ocr_engine.httpx")
    def test_mistral_extract_structured_data(self, mock_httpx):
        """Test structured data extraction."""
        from engines.mistral_ocr_engine import MistralOCREngine
        from PIL import Image
        import tempfile

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "text": "Invoice content",
            "tables": [{"headers": ["Item", "Price"], "rows": [["A", "100"]]}],
            "fields": {"invoice_number": "INV-001"},
        }
        mock_httpx.post.return_value = mock_response
        mock_httpx.get.return_value = MagicMock(status_code=200)

        engine = MistralOCREngine(self.config)
        engine._model = True

        # Create temp image file
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            img = Image.new("RGB", (100, 100))
            img.save(f, format="PNG")
            temp_path = Path(f.name)

        try:
            result = engine.extract_structured_data(temp_path)

            self.assertIn("text", result)
            self.assertIn("tables", result)
            self.assertIn("fields", result)
        finally:
            temp_path.unlink()


class TestMistralOCRIntegration(unittest.TestCase):
    """Integration tests for Mistral OCR (requires API key)."""

    @unittest.skipUnless(
        "MISTRAL_API_KEY" in __import__("os").environ,
        "MISTRAL_API_KEY not set"
    )
    def test_mistral_real_api_call(self):
        """Test with real API (requires valid API key)."""
        from engines.mistral_ocr_engine import MistralOCREngine
        from PIL import Image
        import tempfile
        import os

        config = {
            "api_key": os.environ["MISTRAL_API_KEY"],
            "model": "mistral-ocr-2512",
        }

        engine = MistralOCREngine(config)
        engine.initialize()

        # Create simple test image with text
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            img = Image.new("RGB", (200, 50), color="white")
            img.save(f, format="PNG")
            temp_path = Path(f.name)

        try:
            result = engine.process(temp_path)
            self.assertIsInstance(result, OCRResult)
        finally:
            temp_path.unlink()


if __name__ == "__main__":
    unittest.main()
