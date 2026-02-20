"""Mistral OCR Engine - OCR using Mistral AI's OCR API.

Mistral OCR 3 is a commercial API-based OCR service that provides:
- High-quality text extraction
- Structured data extraction (tables, headers, footers)
- Document layout understanding
- Multi-format support (PDF, images)

API Documentation: https://docs.mistral.ai/capabilities/vision/
Pricing: $2 per 1000 pages
"""

import base64
import logging
import os
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from core.ocr_strategy import OCRResult

from .base_engine import BaseEngine

logger = logging.getLogger(__name__)


class MistralOCREngine(BaseEngine):
    """
    Mistral OCR Engine implementation.

    Uses Mistral AI's OCR API for document text extraction.
    Supports both file upload and URL-based processing.
    """

    DEFAULT_API_URL = "https://api.mistral.ai/v1/ocr"
    DEFAULT_MODEL = "mistral-ocr-2512"
    DEFAULT_TIMEOUT = 60
    MAX_RETRIES = 3
    INITIAL_BACKOFF = 1.0  # seconds

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize Mistral OCR Engine.

        Args:
            config: Configuration dictionary with keys:
                - api_key: Mistral API key (or from MISTRAL_API_KEY env var)
                - api_url: API endpoint URL (optional)
                - model: Model name (default: mistral-ocr-2512)
                - timeout: Request timeout in seconds (default: 60)
                - retry_attempts: Number of retry attempts (default: 3)
                - extract_tables: Extract table structures (default: True)
                - extract_structure: Extract document structure (default: True)
        """
        super().__init__(config)

        # API configuration
        self.api_key = config.get("api_key") or os.environ.get("MISTRAL_API_KEY")
        if not self.api_key:
            logger.warning(
                "Mistral API key not configured. Set 'api_key' in config or "
                "MISTRAL_API_KEY environment variable."
            )

        self.api_url = config.get("api_url", self.DEFAULT_API_URL)
        self.model = config.get("model", self.DEFAULT_MODEL)
        self.timeout = config.get("timeout", self.DEFAULT_TIMEOUT)
        self.retry_attempts = config.get("retry_attempts", self.MAX_RETRIES)

        # Feature flags
        self.extract_tables = config.get("extract_tables", True)
        self.extract_structure = config.get("extract_structure", True)

        # Cost tracking
        self._pages_processed = 0
        self._estimated_cost = 0.0
        self.cost_per_1000_pages = config.get("cost_per_1000_pages", 2.0)

        # Device is always "api" for this engine
        self.device = "api"

        logger.info(
            f"Mistral OCR Engine configured: model={self.model}, "
            f"api_url={self.api_url}"
        )

    @property
    def name(self) -> str:
        """Return engine name."""
        return "mistral_ocr"

    def initialize(self) -> None:
        """
        Initialize the Mistral OCR client.

        Verifies API key is available and valid.
        """
        if not self.api_key:
            raise ValueError(
                "Mistral API key is required. Set MISTRAL_API_KEY environment variable "
                "or provide 'api_key' in configuration."
            )

        # Verify API key with a test request
        try:
            import httpx

            response = httpx.get(
                "https://api.mistral.ai/v1/models",
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=10,
            )

            if response.status_code == 401:
                raise ValueError("Invalid Mistral API key")
            elif response.status_code != 200:
                logger.warning(f"API verification returned status {response.status_code}")

            logger.info("✅ Mistral OCR API initialized successfully")

        except ImportError:
            # httpx not available, try requests
            try:
                import requests

                response = requests.get(
                    "https://api.mistral.ai/v1/models",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=10,
                )

                if response.status_code == 401:
                    raise ValueError("Invalid Mistral API key")

                logger.info("✅ Mistral OCR API initialized successfully (using requests)")

            except ImportError:
                # Neither httpx nor requests available, skip validation
                logger.warning(
                    "Cannot validate API key (install httpx or requests). "
                    "Proceeding without validation."
                )

        self._model = True  # Mark as initialized

    def _make_request(
        self,
        endpoint: str,
        data: Dict[str, Any],
        files: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Make an API request with retry logic.

        Args:
            endpoint: API endpoint
            data: Request data (JSON)
            files: Optional files to upload

        Returns:
            API response as dictionary

        Raises:
            RuntimeError: If all retries fail
        """
        url = f"{self.api_url.rstrip('/')}/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
        }

        last_error = None
        backoff = self.INITIAL_BACKOFF

        for attempt in range(self.retry_attempts):
            try:
                # Try httpx first
                try:
                    import httpx

                    if files:
                        response = httpx.post(
                            url,
                            headers=headers,
                            data=data,
                            files=files,
                            timeout=self.timeout,
                        )
                    else:
                        headers["Content-Type"] = "application/json"
                        import json
                        response = httpx.post(
                            url,
                            headers=headers,
                            json=data,
                            timeout=self.timeout,
                        )

                    response_data = response.json()

                except ImportError:
                    import requests

                    if files:
                        response = requests.post(
                            url,
                            headers=headers,
                            data=data,
                            files=files,
                            timeout=self.timeout,
                        )
                    else:
                        headers["Content-Type"] = "application/json"
                        response = requests.post(
                            url,
                            headers=headers,
                            json=data,
                            timeout=self.timeout,
                        )

                    response_data = response.json()

                # Check for errors
                if response.status_code == 429:
                    # Rate limited - wait and retry
                    retry_after = int(response.headers.get("Retry-After", backoff * 2))
                    logger.warning(f"Rate limited, waiting {retry_after}s")
                    time.sleep(retry_after)
                    backoff *= 2
                    continue

                elif response.status_code >= 500:
                    # Server error - retry
                    logger.warning(f"Server error {response.status_code}, retrying...")
                    time.sleep(backoff)
                    backoff *= 2
                    continue

                elif response.status_code >= 400:
                    # Client error - don't retry
                    error_msg = response_data.get("error", {}).get("message", str(response_data))
                    raise RuntimeError(f"API error {response.status_code}: {error_msg}")

                return response_data

            except (ConnectionError, TimeoutError) as e:
                last_error = e
                logger.warning(f"Connection error on attempt {attempt + 1}: {e}")
                time.sleep(backoff)
                backoff *= 2
                continue

        raise RuntimeError(f"All {self.retry_attempts} attempts failed. Last error: {last_error}")

    def _process_image(self, image: Image.Image, source: str) -> OCRResult:
        """
        Process image with Mistral OCR API.

        Args:
            image: PIL Image to process
            source: Source identifier

        Returns:
            OCRResult with extracted text and structured data
        """
        image = self.ensure_rgb(image)

        # Convert image to base64
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        # Build request payload
        payload = {
            "model": self.model,
            "document": {
                "type": "image_base64",
                "data": image_base64,
            },
            "options": {
                "extract_tables": self.extract_tables,
                "extract_structure": self.extract_structure,
            },
        }

        # Make API request
        response = self._make_request("", payload)

        # Update cost tracking
        self._pages_processed += 1
        self._estimated_cost = (self._pages_processed / 1000) * self.cost_per_1000_pages

        # Parse response
        return self._parse_response(response, image, source)

    def process_document_url(self, document_url: str) -> OCRResult:
        """
        Process a document by URL.

        Args:
            document_url: URL of the document to process

        Returns:
            OCRResult with extracted text and structured data
        """
        self._ensure_initialized()

        payload = {
            "model": self.model,
            "document": {
                "type": "url",
                "url": document_url,
            },
            "options": {
                "extract_tables": self.extract_tables,
                "extract_structure": self.extract_structure,
            },
        }

        response = self._make_request("", payload)

        # Estimate pages (rough guess for URL-based documents)
        self._pages_processed += 1
        self._estimated_cost = (self._pages_processed / 1000) * self.cost_per_1000_pages

        return self._parse_response(response, None, document_url)

    def _parse_response(
        self,
        response: Dict[str, Any],
        image: Optional[Image.Image],
        source: str,
    ) -> OCRResult:
        """
        Parse the Mistral OCR API response.

        Args:
            response: API response dictionary
            image: Original image (optional, for metadata)
            source: Source identifier

        Returns:
            OCRResult with parsed data
        """
        # Extract text content
        text = response.get("text", "")
        if not text:
            # Try alternative response formats
            text = response.get("content", "")
            if isinstance(text, list):
                text = "\n".join(str(item) for item in text)

        # Extract confidence
        confidence = response.get("confidence", 0.9)
        if isinstance(confidence, dict):
            confidence = confidence.get("overall", 0.9)

        # Extract structured data
        structured_data = {}

        # Tables
        tables = response.get("tables", [])
        if tables:
            structured_data["tables"] = tables

        # Headers/Footers
        headers = response.get("headers", [])
        footers = response.get("footers", [])
        if headers:
            structured_data["headers"] = headers
        if footers:
            structured_data["footers"] = footers

        # Document structure
        structure = response.get("structure", {})
        if structure:
            structured_data["structure"] = structure

        # Build blocks
        blocks = self._extract_blocks(response)

        # Build layout info
        layout = {
            "structured_text": text,
        }
        if image:
            layout["width"] = image.width
            layout["height"] = image.height
        if structured_data:
            layout["structured_data"] = structured_data

        # Build metadata
        metadata = self.create_metadata(
            source=source,
            model=self.model,
            api_version=response.get("api_version"),
            pages_processed=self._pages_processed,
            estimated_cost=self._estimated_cost,
        )

        # Add any response-level metadata
        if "metadata" in response:
            metadata["api_metadata"] = response["metadata"]

        return OCRResult(
            text=text,
            confidence=confidence,
            blocks=blocks,
            layout=layout,
            metadata=metadata,
        )

    def _extract_blocks(self, response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract text blocks from API response.

        Args:
            response: API response dictionary

        Returns:
            List of text blocks
        """
        blocks = []

        # Extract from 'blocks' field if present
        if "blocks" in response:
            for block in response["blocks"]:
                blocks.append({
                    "text": block.get("text", ""),
                    "confidence": block.get("confidence", 0.9),
                    "bbox": block.get("bounding_box") or block.get("bbox"),
                    "type": block.get("type", "text"),
                })

        # Extract from 'pages' structure if present
        elif "pages" in response:
            for page_idx, page in enumerate(response["pages"]):
                for block in page.get("blocks", []):
                    blocks.append({
                        "text": block.get("text", ""),
                        "confidence": block.get("confidence", 0.9),
                        "bbox": block.get("bounding_box") or block.get("bbox"),
                        "type": block.get("type", "text"),
                        "page": page_idx + 1,
                    })

        # Extract tables as blocks
        for table_idx, table in enumerate(response.get("tables", [])):
            blocks.append({
                "text": self._table_to_text(table),
                "type": "table",
                "table_index": table_idx,
                "table_data": table,
                "confidence": table.get("confidence", 0.9),
            })

        return blocks

    def _table_to_text(self, table: Dict[str, Any]) -> str:
        """
        Convert table structure to text representation.

        Args:
            table: Table dictionary with headers and rows

        Returns:
            Text representation of the table
        """
        lines = []

        # Headers
        headers = table.get("headers", [])
        if headers:
            lines.append(" | ".join(str(h) for h in headers))
            lines.append("-" * len(lines[0]))

        # Rows
        rows = table.get("rows", [])
        for row in rows:
            if isinstance(row, list):
                lines.append(" | ".join(str(cell) for cell in row))
            elif isinstance(row, dict):
                lines.append(" | ".join(str(v) for v in row.values()))

        return "\n".join(lines)

    def get_cost_estimate(self) -> Dict[str, Any]:
        """
        Get current cost estimates.

        Returns:
            Dictionary with cost information
        """
        return {
            "pages_processed": self._pages_processed,
            "cost_per_1000_pages": self.cost_per_1000_pages,
            "estimated_cost_usd": self._estimated_cost,
            "currency": "USD",
        }

    def reset_cost_tracking(self) -> None:
        """Reset cost tracking counters."""
        self._pages_processed = 0
        self._estimated_cost = 0.0

    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Process multiple documents.

        Note: Mistral OCR API processes documents sequentially.
        Batch optimization is handled at the API level.

        Args:
            file_paths: List of file paths

        Returns:
            List of OCRResults
        """
        self._ensure_initialized()

        results = []

        for file_path in file_paths:
            try:
                result = self.process(file_path)
                results.append(result)
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                results.append(OCRResult(
                    text="",
                    confidence=0.0,
                    metadata={
                        "error": str(e),
                        "file": str(file_path),
                        "engine": self.name,
                    },
                ))

        return results

    def extract_structured_data(
        self,
        file_path: Path,
        schema: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Extract structured data from a document.

        Args:
            file_path: Path to the document
            schema: Optional JSON schema for extraction

        Returns:
            Dictionary with extracted structured data
        """
        self._ensure_initialized()
        image = self.load_image(file_path)
        image = self.ensure_rgb(image)

        # Convert to base64
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

        payload = {
            "model": self.model,
            "document": {
                "type": "image_base64",
                "data": image_base64,
            },
            "options": {
                "extract_tables": True,
                "extract_structure": True,
                "structured_output": True,
            },
        }

        if schema:
            payload["options"]["output_schema"] = schema

        response = self._make_request("", payload)

        # Extract structured data from response
        structured = {
            "text": response.get("text", ""),
            "tables": response.get("tables", []),
            "headers": response.get("headers", []),
            "footers": response.get("footers", []),
            "structure": response.get("structure", {}),
            "fields": response.get("fields", {}),
        }

        self._pages_processed += 1
        self._estimated_cost = (self._pages_processed / 1000) * self.cost_per_1000_pages

        return structured

    def cleanup(self) -> None:
        """
        Cleanup resources.

        For API-based engine, this is a no-op but included for interface consistency.
        """
        pass  # No local resources to clean up
