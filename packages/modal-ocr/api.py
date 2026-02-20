"""
ScanFactory OCR REST API
========================

Standalone FastAPI application for OCR processing.
Supports all engines: GutenOCR, Mistral OCR, SuryaOCR, PaddleOCR, EasyOCR, Tesseract.

Usage:
    python api.py --host 0.0.0.0 --port 8000

Environment Variables:
    - OCR_API_KEY: Required API key for authentication
    - OCR_DEFAULT_ENGINE: Default OCR engine (default: auto)
    - MISTRAL_API_KEY: Required for Mistral OCR engine
"""

import argparse
import base64
import io
import logging
import os
import sys
import tempfile
import time
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("scanfactory-ocr-api")

# =============================================================================
# Configuration
# =============================================================================

API_VERSION = "1.0.0"
API_KEY = os.getenv("OCR_API_KEY", "")
DEFAULT_ENGINE = os.getenv("OCR_DEFAULT_ENGINE", "auto")

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/bmp",
    "application/pdf",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


# =============================================================================
# Engine Registry
# =============================================================================

class EngineInfo(BaseModel):
    """OCR Engine information."""
    id: str
    name: str
    description: str
    type: str  # vlm, api, traditional
    languages: List[str]
    gpu_required: bool
    available: bool
    cost_per_page: Optional[float] = None


ENGINE_REGISTRY: Dict[str, EngineInfo] = {}
ENGINE_INSTANCES: Dict[str, Any] = {}


def register_engines():
    """Register all available OCR engines."""
    global ENGINE_REGISTRY

    # GutenOCR 3B
    try:
        from engines.gutenocr_engine import GutenOCREngine
        ENGINE_REGISTRY["gutenocr-3b"] = EngineInfo(
            id="gutenocr-3b",
            name="GutenOCR 3B",
            description="VLM-based OCR, 3B parameters, good for standard documents",
            type="vlm",
            languages=["fr", "en", "de", "es", "it", "100+ langues"],
            gpu_required=False,
            available=True,
            cost_per_page=0.0,
        )
        ENGINE_REGISTRY["gutenocr-7b"] = EngineInfo(
            id="gutenocr-7b",
            name="GutenOCR 7B",
            description="VLM-based OCR, 7B parameters, high accuracy for complex documents",
            type="vlm",
            languages=["fr", "en", "de", "es", "it", "100+ langues"],
            gpu_required=True,
            available=True,
            cost_per_page=0.0,
        )
        logger.info("✅ GutenOCR engines registered")
    except ImportError:
        logger.warning("⚠️ GutenOCR not available (missing dependencies)")

    # Mistral OCR
    try:
        from engines.mistral_ocr_engine import MistralOCREngine
        mistral_available = bool(os.getenv("MISTRAL_API_KEY"))
        ENGINE_REGISTRY["mistral_ocr"] = EngineInfo(
            id="mistral_ocr",
            name="Mistral OCR",
            description="API-based OCR by Mistral AI, excellent for structured data extraction",
            type="api",
            languages=["fr", "en", "de", "es", "it", "100+ langues"],
            gpu_required=False,
            available=mistral_available,
            cost_per_page=0.002,
        )
        logger.info(f"{'✅' if mistral_available else '⚠️'} Mistral OCR {'registered' if mistral_available else 'requires MISTRAL_API_KEY'}")
    except ImportError:
        logger.warning("⚠️ Mistral OCR not available (missing dependencies)")

    # SuryaOCR
    try:
        from engines.surya_engine import SuryaEngine
        ENGINE_REGISTRY["surya"] = EngineInfo(
            id="surya",
            name="SuryaOCR",
            description="Document understanding with Docling integration",
            type="vlm",
            languages=["fr", "en"],
            gpu_required=True,
            available=True,
            cost_per_page=0.0,
        )
        logger.info("✅ SuryaOCR registered")
    except ImportError:
        logger.warning("⚠️ SuryaOCR not available")

    # PaddleOCR
    try:
        from engines.paddleocr_engine import PaddleOCREngine
        ENGINE_REGISTRY["paddleocr"] = EngineInfo(
            id="paddleocr",
            name="PaddleOCR",
            description="High-accuracy OCR with layout detection",
            type="traditional",
            languages=["fr", "en", "zh", "ar", "80+ langues"],
            gpu_required=False,
            available=True,
            cost_per_page=0.0,
        )
        logger.info("✅ PaddleOCR registered")
    except ImportError:
        logger.warning("⚠️ PaddleOCR not available")

    # EasyOCR
    try:
        from engines.easyocr_engine import EasyOCREngine
        ENGINE_REGISTRY["easyocr"] = EngineInfo(
            id="easyocr",
            name="EasyOCR",
            description="Ready-to-use OCR for images",
            type="traditional",
            languages=["fr", "en", "80+ langues"],
            gpu_required=False,
            available=True,
            cost_per_page=0.0,
        )
        logger.info("✅ EasyOCR registered")
    except ImportError:
        logger.warning("⚠️ EasyOCR not available")

    # Tesseract
    try:
        from engines.tesseract_engine import TesseractEngine
        ENGINE_REGISTRY["tesseract"] = EngineInfo(
            id="tesseract",
            name="Tesseract",
            description="Classic OCR engine, lightweight and fast",
            type="traditional",
            languages=["fr", "en", "100+ langues"],
            gpu_required=False,
            available=True,
            cost_per_page=0.0,
        )
        logger.info("✅ Tesseract registered")
    except ImportError:
        logger.warning("⚠️ Tesseract not available")

    logger.info(f"📋 Registered {len(ENGINE_REGISTRY)} OCR engines")


def get_engine_instance(engine_id: str, config: Optional[Dict] = None) -> Any:
    """Get or create an engine instance."""
    if engine_id in ENGINE_INSTANCES:
        return ENGINE_INSTANCES[engine_id]

    if engine_id not in ENGINE_REGISTRY:
        raise ValueError(f"Unknown engine: {engine_id}")

    if not ENGINE_REGISTRY[engine_id].available:
        raise ValueError(f"Engine {engine_id} is not available")

    config = config or {}

    # Create engine instance
    if engine_id == "gutenocr-3b":
        from engines.gutenocr_engine import GutenOCREngine
        engine = GutenOCREngine({"model_size": "3b", **config})
    elif engine_id == "gutenocr-7b":
        from engines.gutenocr_engine import GutenOCREngine
        engine = GutenOCREngine({"model_size": "7b", **config})
    elif engine_id == "mistral_ocr":
        from engines.mistral_ocr_engine import MistralOCREngine
        engine = MistralOCREngine(config)
    elif engine_id == "surya":
        from engines.surya_engine import SuryaEngine
        engine = SuryaEngine(config)
    elif engine_id == "paddleocr":
        from engines.paddleocr_engine import PaddleOCREngine
        engine = PaddleOCREngine(config)
    elif engine_id == "easyocr":
        from engines.easyocr_engine import EasyOCREngine
        engine = EasyOCREngine(config)
    elif engine_id == "tesseract":
        from engines.tesseract_engine import TesseractEngine
        engine = TesseractEngine(config)
    else:
        raise ValueError(f"Engine {engine_id} not implemented")

    engine.initialize()
    ENGINE_INSTANCES[engine_id] = engine
    logger.info(f"✅ Engine {engine_id} initialized")

    return engine


def auto_select_engine(
    document_type: Optional[str] = None,
    priority: str = "balanced",
    has_gpu: bool = False,
) -> str:
    """Auto-select the best engine based on criteria."""
    available = [e for e in ENGINE_REGISTRY.values() if e.available]

    if not available:
        raise ValueError("No OCR engines available")

    # Priority: cost
    if priority == "cost":
        for engine in ["tesseract", "paddleocr", "easyocr", "gutenocr-3b"]:
            if engine in ENGINE_REGISTRY and ENGINE_REGISTRY[engine].available:
                return engine

    # Priority: accuracy
    if priority == "accuracy":
        if document_type in ["invoice", "form", "facture", "formulaire"]:
            if "mistral_ocr" in ENGINE_REGISTRY and ENGINE_REGISTRY["mistral_ocr"].available:
                return "mistral_ocr"
        if document_type in ["manuscript", "manuscrit", "handwriting"]:
            if "gutenocr-7b" in ENGINE_REGISTRY and ENGINE_REGISTRY["gutenocr-7b"].available and has_gpu:
                return "gutenocr-7b"
        if "gutenocr-7b" in ENGINE_REGISTRY and ENGINE_REGISTRY["gutenocr-7b"].available and has_gpu:
            return "gutenocr-7b"
        if "gutenocr-3b" in ENGINE_REGISTRY and ENGINE_REGISTRY["gutenocr-3b"].available:
            return "gutenocr-3b"

    # Priority: speed
    if priority == "speed":
        for engine in ["tesseract", "paddleocr", "gutenocr-3b"]:
            if engine in ENGINE_REGISTRY and ENGINE_REGISTRY[engine].available:
                return engine

    # Balanced (default)
    for engine in ["gutenocr-3b", "mistral_ocr", "paddleocr", "surya", "tesseract"]:
        if engine in ENGINE_REGISTRY and ENGINE_REGISTRY[engine].available:
            return engine

    # Fallback to first available
    return available[0].id


# =============================================================================
# Request/Response Models
# =============================================================================

class OutputFormat(str, Enum):
    """Supported output formats."""
    TEXT = "text"
    MARKDOWN = "markdown"
    JSON = "json"
    LINES = "lines"
    WORDS = "words"


class Priority(str, Enum):
    """Engine selection priority."""
    SPEED = "speed"
    ACCURACY = "accuracy"
    COST = "cost"
    BALANCED = "balanced"


class OCRRequest(BaseModel):
    """OCR processing request via JSON body."""
    image_base64: Optional[str] = Field(None, description="Base64 encoded image/document")
    image_url: Optional[str] = Field(None, description="URL to fetch image from")
    engine: str = Field("auto", description="OCR engine to use")
    output_format: OutputFormat = Field(OutputFormat.TEXT, description="Output format")
    priority: Priority = Field(Priority.BALANCED, description="Engine selection priority (for auto)")
    document_type: Optional[str] = Field(None, description="Document type hint for better engine selection")
    extract_tables: bool = Field(False, description="Extract table structures")
    extract_structure: bool = Field(False, description="Extract document structure")
    languages: List[str] = Field(["fr", "en"], description="Expected languages")


class OCRBlock(BaseModel):
    """Text block extracted from document."""
    text: str
    confidence: float
    bbox: Optional[Dict[str, int]] = None
    type: Optional[str] = None


class OCRResponse(BaseModel):
    """OCR processing response."""
    success: bool
    text: str
    confidence: float
    blocks: List[OCRBlock] = []
    engine: str
    processing_time_ms: int
    metadata: Dict[str, Any] = {}
    tables: Optional[List[Dict]] = None
    structured_data: Optional[Dict] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    service: str
    version: str
    engines: List[str]
    timestamp: str


class EngineListResponse(BaseModel):
    """List of available engines."""
    engines: List[EngineInfo]
    default: str
    total: int


class CompareRequest(BaseModel):
    """Compare multiple engines."""
    image_base64: Optional[str] = None
    image_url: Optional[str] = None
    engines: List[str] = Field(default_factory=list)


class CompareResult(BaseModel):
    """Result from one engine in comparison."""
    engine: str
    success: bool
    text: Optional[str] = None
    confidence: Optional[float] = None
    processing_time_ms: int
    error: Optional[str] = None


class CompareResponse(BaseModel):
    """Comparison results."""
    success: bool
    results: List[CompareResult]


class ErrorResponse(BaseModel):
    """Error response."""
    success: bool = False
    error: str
    error_code: str
    details: Optional[Dict] = None


# =============================================================================
# Authentication
# =============================================================================

async def verify_api_key(x_api_key: Optional[str] = Header(None, alias="X-API-Key")):
    """Verify API key from header."""
    if not API_KEY:
        # No API key configured = no auth required
        return True

    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail={"error": "API key required", "error_code": "MISSING_API_KEY"},
        )

    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=403,
            detail={"error": "Invalid API key", "error_code": "INVALID_API_KEY"},
        )

    return True


# =============================================================================
# FastAPI Application
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("🚀 Starting ScanFactory OCR API...")
    register_engines()
    yield
    # Shutdown
    logger.info("🛑 Shutting down ScanFactory OCR API...")
    for engine_id, engine in ENGINE_INSTANCES.items():
        try:
            engine.cleanup()
            logger.info(f"Cleaned up {engine_id}")
        except Exception as e:
            logger.warning(f"Error cleaning up {engine_id}: {e}")


app = FastAPI(
    title="ScanFactory OCR API",
    description="""
Multi-engine OCR API for document processing.

## Features

- **Multiple OCR Engines**: GutenOCR (VLM), Mistral OCR (API), SuryaOCR, PaddleOCR, EasyOCR, Tesseract
- **Auto-selection**: Automatically select the best engine based on document type and priority
- **Structured Extraction**: Extract tables, forms, and structured data
- **Multilingual**: Support for 100+ languages

## Authentication

All endpoints require an API key passed in the `X-API-Key` header (if configured).
    """,
    version=API_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Helper Functions
# =============================================================================

async def get_image_bytes(
    file: Optional[UploadFile] = None,
    image_base64: Optional[str] = None,
    image_url: Optional[str] = None,
) -> bytes:
    """Get image bytes from file upload, base64, or URL."""
    import httpx

    if file:
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail={"error": f"File too large (max {MAX_FILE_SIZE // 1024 // 1024}MB)", "error_code": "FILE_TOO_LARGE"},
            )
        return content

    if image_base64:
        try:
            return base64.b64decode(image_base64)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail={"error": f"Invalid base64: {e}", "error_code": "INVALID_BASE64"},
            )

    if image_url:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                return response.content
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail={"error": f"Failed to fetch image: {e}", "error_code": "FETCH_ERROR"},
            )

    raise HTTPException(
        status_code=400,
        detail={"error": "No image provided (file, image_base64, or image_url required)", "error_code": "NO_IMAGE"},
    )


def process_with_engine(engine_id: str, image_bytes: bytes, config: Dict = None) -> Dict:
    """Process image with specified engine."""
    start_time = time.time()

    try:
        engine = get_engine_instance(engine_id, config)

        # Save to temp file for processing
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(image_bytes)
            temp_path = Path(f.name)

        try:
            result = engine.process(temp_path)

            processing_time = int((time.time() - start_time) * 1000)

            return {
                "success": True,
                "text": result.text,
                "confidence": result.confidence,
                "blocks": [
                    OCRBlock(
                        text=b.get("text", ""),
                        confidence=b.get("confidence", 0.0),
                        bbox=b.get("bbox"),
                        type=b.get("type"),
                    ).model_dump()
                    for b in result.blocks
                ] if result.blocks else [],
                "engine": engine_id,
                "processing_time_ms": processing_time,
                "metadata": result.metadata or {},
            }
        finally:
            temp_path.unlink(missing_ok=True)

    except Exception as e:
        logger.error(f"Error processing with {engine_id}: {e}")
        processing_time = int((time.time() - start_time) * 1000)
        return {
            "success": False,
            "text": "",
            "confidence": 0.0,
            "blocks": [],
            "engine": engine_id,
            "processing_time_ms": processing_time,
            "metadata": {"error": str(e)},
        }


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint redirect to docs."""
    return {"message": "ScanFactory OCR API", "docs": "/docs", "version": API_VERSION}


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        service="scanfactory-ocr-api",
        version=API_VERSION,
        engines=list(ENGINE_REGISTRY.keys()),
        timestamp=datetime.utcnow().isoformat(),
    )


@app.get("/api/v1/ocr/engines", response_model=EngineListResponse, tags=["OCR"])
async def list_engines(_: bool = Depends(verify_api_key)):
    """List all available OCR engines."""
    return EngineListResponse(
        engines=list(ENGINE_REGISTRY.values()),
        default=DEFAULT_ENGINE,
        total=len(ENGINE_REGISTRY),
    )


@app.post("/api/v1/ocr/process", response_model=OCRResponse, tags=["OCR"])
async def process_document(
    file: Optional[UploadFile] = File(None, description="Document file to process"),
    engine: str = Form("auto", description="OCR engine to use"),
    output_format: str = Form("text", description="Output format"),
    priority: str = Form("balanced", description="Engine selection priority"),
    document_type: Optional[str] = Form(None, description="Document type hint"),
    extract_tables: bool = Form(False, description="Extract tables"),
    extract_structure: bool = Form(False, description="Extract structure"),
    _: bool = Depends(verify_api_key),
):
    """
    Process a document with OCR.

    Accepts file upload via multipart form data.

    **Engines available:**
    - `auto`: Auto-select based on document type and priority
    - `gutenocr-3b`: GutenOCR 3B (fast, good for standard documents)
    - `gutenocr-7b`: GutenOCR 7B (high accuracy, requires GPU)
    - `mistral_ocr`: Mistral OCR (API-based, excellent for forms/invoices)
    - `paddleocr`: PaddleOCR (high accuracy with layout detection)
    - `surya`: SuryaOCR (document understanding)
    - `easyocr`: EasyOCR (simple and fast)
    - `tesseract`: Tesseract (lightweight, classic OCR)
    """
    if not file:
        raise HTTPException(
            status_code=400,
            detail={"error": "No file provided", "error_code": "NO_FILE"},
        )

    # Validate file type
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail={"error": f"Unsupported file type: {file.content_type}", "error_code": "INVALID_FILE_TYPE"},
        )

    image_bytes = await get_image_bytes(file=file)

    # Select engine
    if engine == "auto":
        import torch
        has_gpu = torch.cuda.is_available() if "torch" in sys.modules else False
        engine = auto_select_engine(
            document_type=document_type,
            priority=priority,
            has_gpu=has_gpu,
        )
        logger.info(f"Auto-selected engine: {engine}")

    # Process
    result = process_with_engine(engine, image_bytes, {
        "output_format": output_format.upper(),
        "extract_tables": extract_tables,
        "extract_structure": extract_structure,
    })

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail={
                "error": result["metadata"].get("error", "Processing failed"),
                "error_code": "PROCESSING_ERROR",
            },
        )

    return OCRResponse(**result)


@app.post("/api/v1/ocr/process/json", response_model=OCRResponse, tags=["OCR"])
async def process_document_json(
    request: OCRRequest,
    _: bool = Depends(verify_api_key),
):
    """
    Process a document with OCR using JSON body.

    Accepts base64 encoded image or image URL in JSON body.
    """
    image_bytes = await get_image_bytes(
        image_base64=request.image_base64,
        image_url=request.image_url,
    )

    # Select engine
    engine = request.engine
    if engine == "auto":
        import torch
        has_gpu = torch.cuda.is_available() if "torch" in sys.modules else False
        engine = auto_select_engine(
            document_type=request.document_type,
            priority=request.priority.value,
            has_gpu=has_gpu,
        )
        logger.info(f"Auto-selected engine: {engine}")

    # Process
    result = process_with_engine(engine, image_bytes, {
        "output_format": request.output_format.value.upper(),
        "extract_tables": request.extract_tables,
        "extract_structure": request.extract_structure,
    })

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail={
                "error": result["metadata"].get("error", "Processing failed"),
                "error_code": "PROCESSING_ERROR",
            },
        )

    return OCRResponse(**result)


@app.post("/api/v1/ocr/compare", response_model=CompareResponse, tags=["OCR"])
async def compare_engines(
    file: Optional[UploadFile] = File(None),
    engines: str = Form("", description="Comma-separated list of engines to compare"),
    _: bool = Depends(verify_api_key),
):
    """
    Compare multiple OCR engines on the same document.

    Useful for benchmarking and selecting the best engine for your use case.
    """
    if not file:
        raise HTTPException(
            status_code=400,
            detail={"error": "No file provided", "error_code": "NO_FILE"},
        )

    image_bytes = await get_image_bytes(file=file)

    # Parse engines
    engine_list = [e.strip() for e in engines.split(",") if e.strip()]
    if not engine_list:
        engine_list = list(ENGINE_REGISTRY.keys())[:3]  # Default: first 3 available

    results = []
    for engine_id in engine_list:
        if engine_id not in ENGINE_REGISTRY:
            results.append(CompareResult(
                engine=engine_id,
                success=False,
                processing_time_ms=0,
                error=f"Unknown engine: {engine_id}",
            ))
            continue

        if not ENGINE_REGISTRY[engine_id].available:
            results.append(CompareResult(
                engine=engine_id,
                success=False,
                processing_time_ms=0,
                error=f"Engine not available: {engine_id}",
            ))
            continue

        result = process_with_engine(engine_id, image_bytes)
        results.append(CompareResult(
            engine=engine_id,
            success=result["success"],
            text=result["text"][:500] if result["text"] else None,  # Truncate for comparison
            confidence=result["confidence"],
            processing_time_ms=result["processing_time_ms"],
            error=result["metadata"].get("error") if not result["success"] else None,
        ))

    return CompareResponse(
        success=any(r.success for r in results),
        results=results,
    )


@app.post("/api/v1/ocr/compare/json", response_model=CompareResponse, tags=["OCR"])
async def compare_engines_json(
    request: CompareRequest,
    _: bool = Depends(verify_api_key),
):
    """Compare engines using JSON body."""
    image_bytes = await get_image_bytes(
        image_base64=request.image_base64,
        image_url=request.image_url,
    )

    engine_list = request.engines or list(ENGINE_REGISTRY.keys())[:3]

    results = []
    for engine_id in engine_list:
        if engine_id not in ENGINE_REGISTRY:
            results.append(CompareResult(
                engine=engine_id,
                success=False,
                processing_time_ms=0,
                error=f"Unknown engine: {engine_id}",
            ))
            continue

        if not ENGINE_REGISTRY[engine_id].available:
            results.append(CompareResult(
                engine=engine_id,
                success=False,
                processing_time_ms=0,
                error=f"Engine not available: {engine_id}",
            ))
            continue

        result = process_with_engine(engine_id, image_bytes)
        results.append(CompareResult(
            engine=engine_id,
            success=result["success"],
            text=result["text"][:500] if result["text"] else None,
            confidence=result["confidence"],
            processing_time_ms=result["processing_time_ms"],
            error=result["metadata"].get("error") if not result["success"] else None,
        ))

    return CompareResponse(
        success=any(r.success for r in results),
        results=results,
    )


@app.get("/api/v1/ocr/cost-estimate", tags=["OCR"])
async def get_cost_estimate(
    engine: str = "mistral_ocr",
    page_count: int = 1,
    _: bool = Depends(verify_api_key),
):
    """
    Get cost estimate for processing documents.

    Only applicable for API-based engines (Mistral OCR).
    """
    if engine not in ENGINE_REGISTRY:
        raise HTTPException(status_code=404, detail={"error": "Engine not found"})

    engine_info = ENGINE_REGISTRY[engine]

    return {
        "engine": engine,
        "page_count": page_count,
        "cost_per_page": engine_info.cost_per_page or 0,
        "estimated_cost_usd": (engine_info.cost_per_page or 0) * page_count,
        "is_free": (engine_info.cost_per_page or 0) == 0,
    }


# =============================================================================
# CLI
# =============================================================================

def main():
    """Run the API server."""
    parser = argparse.ArgumentParser(description="ScanFactory OCR API Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind to")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    parser.add_argument("--workers", type=int, default=1, help="Number of workers")
    args = parser.parse_args()

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           ScanFactory OCR API v{API_VERSION}                        ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                  ║
║    POST /api/v1/ocr/process       - Process document         ║
║    POST /api/v1/ocr/process/json  - Process (JSON body)      ║
║    POST /api/v1/ocr/compare       - Compare engines          ║
║    GET  /api/v1/ocr/engines       - List engines             ║
║    GET  /health                   - Health check             ║
║    GET  /docs                     - OpenAPI documentation    ║
╚══════════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(
        "api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        workers=args.workers,
        log_level="info",
    )


if __name__ == "__main__":
    main()
