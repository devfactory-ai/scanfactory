"""
ScanFactory Modal Multi-OCR Service

Service de traitement OCR multi-moteurs pour documents médicaux.
Supporte: GutenOCR, Mistral OCR, PaddleOCR, SuryaOCR, EasyOCR, Tesseract

Architecture:
  Image → Modal (OCR Engine) → Cloudflare Workers AI (Extraction) → Données
"""

import modal
import os

# Configuration de l'application Modal
app = modal.App("scanfactory-ocr")

# Image Docker de base avec dépendances communes
base_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender-dev",
        "libgomp1",
        "tesseract-ocr",
        "tesseract-ocr-fra",
        "tesseract-ocr-eng",
    )
    .pip_install(
        "pyyaml>=6.0",
        "Pillow>=10.1.0",
        "numpy>=1.24.3",
        "httpx>=0.25.2",
        "pydantic>=2.5.2",
    )
)

# Image PaddleOCR
paddleocr_image = base_image.pip_install(
    "paddlepaddle==2.5.2",
    "paddleocr==2.7.3",
    "opencv-python-headless==4.8.1.78",
)

# Image SuryaOCR avec Docling
surya_image = base_image.pip_install(
    "torch>=2.2.0",
    "docling>=2.0.0",
    "docling-surya>=1.0.0",
    "surya-ocr>=0.6.0",
)

# Image EasyOCR
easyocr_image = base_image.pip_install(
    "torch>=2.2.0",
    "easyocr>=1.7.0",
)

# Image GutenOCR (VLM based on Qwen2.5-VL)
gutenocr_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "git",
    )
    .pip_install(
        "torch>=2.2.0",
        "transformers>=4.37.0",
        "accelerate>=0.26.0",
        "qwen-vl-utils>=0.0.8",
        "Pillow>=10.1.0",
        "numpy>=1.24.3",
        "pydantic>=2.5.2",
    )
)

# Image Mistral OCR (API-based)
mistral_image = base_image.pip_install(
    "mistralai>=1.0.0",
)

# Volume pour le cache des modèles
model_cache = modal.Volume.from_name("scanfactory-model-cache", create_if_missing=True)


# =============================================================================
# PaddleOCR Service
# =============================================================================

@app.cls(
    image=paddleocr_image,
    volumes={"/root/.paddleocr": model_cache},
    cpu=2,
    memory=4096,
    timeout=300,
    container_idle_timeout=60,
)
class PaddleOCRService:
    """Service OCR avec PaddleOCR."""

    def __init__(self):
        self.ocr = None

    @modal.enter()
    def setup(self):
        from paddleocr import PaddleOCR

        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang="fr",
            use_gpu=False,
            show_log=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            det_db_unclip_ratio=1.6,
        )
        print("✅ PaddleOCR initialized")

    @modal.method()
    def process(self, image_bytes: bytes, with_layout: bool = True) -> dict:
        import io
        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        result = self.ocr.ocr(np.array(image), cls=True)

        if not result or not result[0]:
            return {"text": "", "blocks": [], "confidence": 0.0, "engine": "paddleocr"}

        blocks = []
        texts = []
        confidences = []

        for line in result[0]:
            box, (text, confidence) = line
            blocks.append({
                "text": text,
                "confidence": float(confidence),
                "bbox": {
                    "x1": int(box[0][0]), "y1": int(box[0][1]),
                    "x2": int(box[2][0]), "y2": int(box[2][1]),
                },
            })
            texts.append(text)
            confidences.append(confidence)

        return {
            "text": "\n".join(texts),
            "blocks": blocks,
            "confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
            "engine": "paddleocr",
            "layout": {"width": image.width, "height": image.height} if with_layout else None,
        }


# =============================================================================
# SuryaOCR Service
# =============================================================================

@app.cls(
    image=surya_image,
    volumes={"/root/.cache": model_cache},
    cpu=2,
    memory=8192,
    gpu="T4",
    timeout=600,
    container_idle_timeout=120,
)
class SuryaOCRService:
    """Service OCR avec SuryaOCR + Docling."""

    def __init__(self):
        self.converter = None

    @modal.enter()
    def setup(self):
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
        from docling_surya import SuryaOcrOptions

        pipeline_options = PdfPipelineOptions(
            do_ocr=True,
            ocr_model="suryaocr",
            allow_external_plugins=True,
            accelerator="cuda",
            ocr_options=SuryaOcrOptions(lang=["en", "fr"]),
        )

        self.converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options),
            }
        )
        print("✅ SuryaOCR (Docling) initialized")

    @modal.method()
    def process(self, image_bytes: bytes) -> dict:
        import tempfile
        from pathlib import Path

        # Save to temp file for Docling
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(image_bytes)
            temp_path = Path(f.name)

        try:
            result = self.converter.convert(str(temp_path))
            markdown = result.document.export_to_markdown()
            doc_dict = result.document.export_to_dict()

            return {
                "text": markdown,
                "blocks": [],
                "confidence": 0.95,
                "engine": "surya",
                "layout": doc_dict,
            }
        finally:
            temp_path.unlink()


# =============================================================================
# EasyOCR Service
# =============================================================================

@app.cls(
    image=easyocr_image,
    volumes={"/root/.EasyOCR": model_cache},
    cpu=2,
    memory=4096,
    timeout=300,
    container_idle_timeout=60,
)
class EasyOCRService:
    """Service OCR avec EasyOCR."""

    def __init__(self):
        self.reader = None

    @modal.enter()
    def setup(self):
        import easyocr

        self.reader = easyocr.Reader(["fr", "en"], gpu=False, verbose=False)
        print("✅ EasyOCR initialized")

    @modal.method()
    def process(self, image_bytes: bytes) -> dict:
        import io
        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        results = self.reader.readtext(np.array(image))

        if not results:
            return {"text": "", "blocks": [], "confidence": 0.0, "engine": "easyocr"}

        blocks = []
        texts = []
        confidences = []

        for bbox, text, confidence in results:
            x1 = int(min(p[0] for p in bbox))
            y1 = int(min(p[1] for p in bbox))
            x2 = int(max(p[0] for p in bbox))
            y2 = int(max(p[1] for p in bbox))

            blocks.append({
                "text": text,
                "confidence": float(confidence),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
            texts.append(text)
            confidences.append(confidence)

        return {
            "text": "\n".join(texts),
            "blocks": blocks,
            "confidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
            "engine": "easyocr",
        }


# =============================================================================
# GutenOCR Service (VLM-based)
# =============================================================================

@app.cls(
    image=gutenocr_image,
    volumes={"/root/.cache": model_cache},
    cpu=4,
    memory=16384,
    gpu="T4",
    timeout=600,
    container_idle_timeout=120,
)
class GutenOCRService:
    """Service OCR avec GutenOCR (VLM basé sur Qwen2.5-VL)."""

    def __init__(self):
        self.processor = None
        self.model = None
        self.model_size = os.getenv("GUTENOCR_MODEL_SIZE", "3b")

    @modal.enter()
    def setup(self):
        import torch
        from transformers import AutoProcessor, Qwen2VLForConditionalGeneration

        model_name = f"rootsautomation/GutenOCR-{self.model_size.upper()}"
        print(f"Loading GutenOCR model: {model_name}")

        self.processor = AutoProcessor.from_pretrained(
            model_name,
            trust_remote_code=True,
        )

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_name,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )
        print(f"✅ GutenOCR {self.model_size.upper()} initialized")

    @modal.method()
    def process(self, image_bytes: bytes, output_format: str = "TEXT") -> dict:
        import io
        import torch
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Build prompt based on format
        prompts = {
            "TEXT": "Extract all text from this image.",
            "LINES": "Extract text from this image line by line.",
            "WORDS": "Extract all words from this image with their positions.",
            "LATEX": "Extract mathematical expressions in LaTeX format.",
        }
        prompt = prompts.get(output_format.upper(), prompts["TEXT"])

        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text_prompt = self.processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
        )

        inputs = self.processor(
            text=[text_prompt],
            images=[image],
            padding=True,
            return_tensors="pt",
        )

        inputs = {k: v.cuda() if hasattr(v, 'cuda') else v for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=4096,
                do_sample=False,
            )

        generated_ids = output_ids[:, inputs["input_ids"].shape[1]:]
        text = self.processor.batch_decode(
            generated_ids,
            skip_special_tokens=True,
        )[0]

        return {
            "text": text,
            "blocks": [],
            "confidence": 0.90,
            "engine": f"gutenocr-{self.model_size}",
            "layout": {"width": image.width, "height": image.height},
        }


# =============================================================================
# Mistral OCR Service (API-based)
# =============================================================================

@app.cls(
    image=mistral_image,
    secrets=[modal.Secret.from_name("mistral-api-key", required=False)],
    cpu=1,
    memory=512,
    timeout=120,
    container_idle_timeout=60,
)
class MistralOCRService:
    """Service OCR avec Mistral AI API."""

    def __init__(self):
        self.client = None

    @modal.enter()
    def setup(self):
        from mistralai import Mistral

        api_key = os.getenv("MISTRAL_API_KEY")
        if api_key:
            self.client = Mistral(api_key=api_key)
            print("✅ Mistral OCR initialized")
        else:
            print("⚠️ MISTRAL_API_KEY not set, Mistral OCR unavailable")

    @modal.method()
    def process(self, image_bytes: bytes, extract_tables: bool = True) -> dict:
        import base64
        import io
        from PIL import Image

        if not self.client:
            return {
                "text": "",
                "blocks": [],
                "confidence": 0.0,
                "engine": "mistral_ocr",
                "error": "Mistral API key not configured",
            }

        # Get image dimensions
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to base64
        image_base64 = base64.b64encode(image_bytes).decode("utf-8")
        mime_type = "image/png"

        # Determine mime type
        if image_bytes[:2] == b'\xff\xd8':
            mime_type = "image/jpeg"
        elif image_bytes[:4] == b'%PDF':
            mime_type = "application/pdf"

        # Call Mistral OCR API
        try:
            response = self.client.ocr.process(
                model="mistral-ocr-2512",
                document={
                    "type": "image_url",
                    "image_url": f"data:{mime_type};base64,{image_base64}",
                },
            )

            # Extract text from response
            text_parts = []
            blocks = []

            if hasattr(response, 'pages'):
                for page in response.pages:
                    if hasattr(page, 'markdown'):
                        text_parts.append(page.markdown)

            text = "\n".join(text_parts) if text_parts else str(response)

            return {
                "text": text,
                "blocks": blocks,
                "confidence": 0.95,
                "engine": "mistral_ocr",
                "layout": {"width": image.width, "height": image.height},
            }

        except Exception as e:
            return {
                "text": "",
                "blocks": [],
                "confidence": 0.0,
                "engine": "mistral_ocr",
                "error": str(e),
            }


# =============================================================================
# Web Endpoints
# =============================================================================

# OCR-01: Use cached service instances instead of creating new ones
# These are module-level singletons that persist across requests
_paddle_service = None
_surya_service = None
_easyocr_service = None
_gutenocr_service = None
_mistral_service = None

def get_paddle_service():
    global _paddle_service
    if _paddle_service is None:
        _paddle_service = PaddleOCRService()
    return _paddle_service

def get_surya_service():
    global _surya_service
    if _surya_service is None:
        _surya_service = SuryaOCRService()
    return _surya_service

def get_easyocr_service():
    global _easyocr_service
    if _easyocr_service is None:
        _easyocr_service = EasyOCRService()
    return _easyocr_service

def get_gutenocr_service():
    global _gutenocr_service
    if _gutenocr_service is None:
        _gutenocr_service = GutenOCRService()
    return _gutenocr_service

def get_mistral_service():
    global _mistral_service
    if _mistral_service is None:
        _mistral_service = MistralOCRService()
    return _mistral_service

# Default engine for fallback
DEFAULT_ENGINE = "gutenocr"

@app.function(image=paddleocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
@modal.web_endpoint(method="POST", docs=True)
async def process_ocr(request: dict) -> dict:
    """
    Endpoint OCR unifié avec sélection du moteur.

    Body:
        image_url: URL de l'image (optionnel)
        image_base64: Image en base64 (optionnel)
        engine: Moteur OCR (paddleocr, surya, easyocr) - défaut: paddleocr
        with_layout: Inclure les infos de layout (défaut: true)

    Returns:
        Résultat OCR avec texte, blocs, et confiance
    """
    import base64
    import httpx

    # Get image bytes
    if "image_url" in request:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(request["image_url"])
                response.raise_for_status()
                image_bytes = response.content
        except Exception as e:
            return {"error": f"Failed to fetch image: {str(e)}", "success": False}
    elif "image_base64" in request:
        try:
            image_bytes = base64.b64decode(request["image_base64"])
        except Exception as e:
            return {"error": f"Invalid base64: {str(e)}", "success": False}
    else:
        return {"error": "image_url or image_base64 required", "success": False}

    # Select engine with fallback
    engine = request.get("engine", DEFAULT_ENGINE)
    with_layout = request.get("with_layout", True)
    output_format = request.get("output_format", "TEXT")
    extract_tables = request.get("extract_tables", False)

    # OCR-02: Fallback to default engine if unknown engine specified
    valid_engines = ["paddleocr", "surya", "easyocr", "gutenocr", "gutenocr-3b", "gutenocr-7b", "mistral", "mistral_ocr"]
    if engine not in valid_engines:
        print(f"Unknown engine '{engine}', falling back to {DEFAULT_ENGINE}")
        engine = DEFAULT_ENGINE

    try:
        if engine == "paddleocr":
            service = get_paddle_service()
            result = service.process.remote(image_bytes, with_layout)
        elif engine == "surya":
            service = get_surya_service()
            result = service.process.remote(image_bytes)
        elif engine == "easyocr":
            service = get_easyocr_service()
            result = service.process.remote(image_bytes)
        elif engine in ["gutenocr", "gutenocr-3b", "gutenocr-7b"]:
            service = get_gutenocr_service()
            result = service.process.remote(image_bytes, output_format)
        elif engine in ["mistral", "mistral_ocr"]:
            service = get_mistral_service()
            result = service.process.remote(image_bytes, extract_tables)
        else:
            # This shouldn't happen due to fallback above, but just in case
            service = get_gutenocr_service()
            result = service.process.remote(image_bytes, output_format)

        return {"success": True, **result}

    except Exception as e:
        # OCR-02: If primary engine fails, try fallback
        if engine != DEFAULT_ENGINE:
            print(f"Engine {engine} failed, falling back to {DEFAULT_ENGINE}: {str(e)}")
            try:
                service = get_paddle_service()
                result = service.process.remote(image_bytes, with_layout)
                return {"success": True, "fallback_used": True, "original_engine": engine, **result}
            except Exception as fallback_error:
                return {"error": f"All engines failed. Primary: {str(e)}, Fallback: {str(fallback_error)}", "success": False}
        return {"error": str(e), "success": False}


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def health() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "scanfactory-ocr",
        "version": "3.0.0",
        "engines": ["gutenocr-3b", "gutenocr-7b", "mistral_ocr", "paddleocr", "surya", "easyocr"],
        "note": "Multi-OCR service with VLM and API engines",
    }


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def list_engines() -> dict:
    """List available OCR engines."""
    return {
        "engines": [
            {
                "id": "gutenocr-3b",
                "name": "GutenOCR 3B",
                "description": "VLM-based OCR (Qwen2.5-VL), fast and efficient",
                "type": "vlm",
                "languages": ["fr", "en", "de", "es", "100+ langues"],
                "gpu_required": False,
                "cost_per_page": 0,
            },
            {
                "id": "gutenocr-7b",
                "name": "GutenOCR 7B",
                "description": "VLM-based OCR (Qwen2.5-VL), high accuracy for complex documents",
                "type": "vlm",
                "languages": ["fr", "en", "de", "es", "100+ langues"],
                "gpu_required": True,
                "cost_per_page": 0,
            },
            {
                "id": "mistral_ocr",
                "name": "Mistral OCR",
                "description": "API-based OCR by Mistral AI, excellent for structured data",
                "type": "api",
                "languages": ["fr", "en", "de", "es", "100+ langues"],
                "gpu_required": False,
                "cost_per_page": 0.002,
            },
            {
                "id": "paddleocr",
                "name": "PaddleOCR",
                "description": "High-accuracy OCR with layout detection",
                "type": "traditional",
                "languages": ["fr", "en", "zh", "ar"],
                "gpu_required": False,
                "cost_per_page": 0,
            },
            {
                "id": "surya",
                "name": "SuryaOCR",
                "description": "Advanced document understanding with Docling",
                "type": "vlm",
                "languages": ["fr", "en"],
                "gpu_required": True,
                "cost_per_page": 0,
            },
            {
                "id": "easyocr",
                "name": "EasyOCR",
                "description": "Ready-to-use OCR for images",
                "type": "traditional",
                "languages": ["fr", "en"],
                "gpu_required": False,
                "cost_per_page": 0,
            },
        ],
        "default": "gutenocr-3b",
    }


# =============================================================================
# CLI
# =============================================================================

@app.local_entrypoint()
def main():
    """Point d'entrée pour tests locaux."""
    print("ScanFactory Multi-OCR Service v3.0")
    print("=" * 60)
    print("\nEngines disponibles:")
    print("  VLM (Vision Language Models):")
    print("    - gutenocr-3b  : GutenOCR 3B (défaut, CPU/GPU)")
    print("    - gutenocr-7b  : GutenOCR 7B (haute précision, GPU)")
    print("    - surya        : SuryaOCR + Docling (GPU)")
    print("  API:")
    print("    - mistral_ocr  : Mistral OCR API ($0.002/page)")
    print("  Traditional:")
    print("    - paddleocr    : PaddleOCR (layout detection)")
    print("    - easyocr      : EasyOCR (simple)")
    print("\nEndpoints:")
    print("  - POST /process_ocr  - OCR avec sélection moteur")
    print("  - GET  /health       - Health check")
    print("  - GET  /list_engines - Liste des moteurs")
    print("\nStandalone API:")
    print("  python api.py --host 0.0.0.0 --port 8000")
