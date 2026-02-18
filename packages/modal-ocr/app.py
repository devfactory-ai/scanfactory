"""
ScanFactory Modal Multi-OCR Service

Service de traitement OCR multi-moteurs pour documents médicaux.
Supporte: PaddleOCR, SuryaOCR, HunyuanOCR, Tesseract, EasyOCR

Architecture:
  Image → Modal (OCR Engine) → Cloudflare Workers AI (Extraction) → Données
"""

import modal

# Configuration de l'application Modal
app = modal.App("scanfactory-ocr")

# Image Docker de base avec dépendances communes
base_image = (
    modal.Image.debian_slim(python_version="3.10")
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
# Web Endpoints
# =============================================================================

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
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request["image_url"])
            response.raise_for_status()
            image_bytes = response.content
    elif "image_base64" in request:
        image_bytes = base64.b64decode(request["image_base64"])
    else:
        return {"error": "image_url or image_base64 required", "success": False}

    # Select engine
    engine = request.get("engine", "paddleocr")
    with_layout = request.get("with_layout", True)

    if engine == "paddleocr":
        service = PaddleOCRService()
        result = service.process.remote(image_bytes, with_layout)
    elif engine == "surya":
        service = SuryaOCRService()
        result = service.process.remote(image_bytes)
    elif engine == "easyocr":
        service = EasyOCRService()
        result = service.process.remote(image_bytes)
    else:
        return {"error": f"Unknown engine: {engine}", "success": False}

    return {"success": True, **result}


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def health() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "scanfactory-ocr",
        "version": "2.0.0",
        "engines": ["paddleocr", "surya", "easyocr"],
        "note": "Multi-OCR service with engine selection",
    }


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def list_engines() -> dict:
    """List available OCR engines."""
    return {
        "engines": [
            {
                "id": "paddleocr",
                "name": "PaddleOCR",
                "description": "High-accuracy OCR with layout detection",
                "languages": ["fr", "en", "zh", "ar"],
                "gpu_required": False,
            },
            {
                "id": "surya",
                "name": "SuryaOCR",
                "description": "Advanced document understanding with Docling",
                "languages": ["fr", "en"],
                "gpu_required": True,
            },
            {
                "id": "easyocr",
                "name": "EasyOCR",
                "description": "Ready-to-use OCR for images",
                "languages": ["fr", "en"],
                "gpu_required": False,
            },
        ],
        "default": "paddleocr",
    }


# =============================================================================
# CLI
# =============================================================================

@app.local_entrypoint()
def main():
    """Point d'entrée pour tests locaux."""
    print("ScanFactory Multi-OCR Service v2.0")
    print("=" * 50)
    print("\nEngines disponibles:")
    print("  - paddleocr : PaddleOCR (défaut)")
    print("  - surya     : SuryaOCR + Docling (GPU)")
    print("  - easyocr   : EasyOCR")
    print("\nEndpoints:")
    print("  - POST /process_ocr  - OCR avec sélection moteur")
    print("  - GET  /health       - Health check")
    print("  - GET  /list_engines - Liste des moteurs")
