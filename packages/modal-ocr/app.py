"""
ScanFactory Modal OCR Service

Service de traitement OCR pour documents médicaux avec PaddleOCR.
L'extraction LLM est gérée par Cloudflare Workers AI (gratuit).

Architecture:
  Image → Modal (PaddleOCR) → Cloudflare Workers AI (Llama/Mistral) → Données
"""

import modal

# Configuration de l'application Modal
app = modal.App("scanfactory-ocr")

# Image Docker avec PaddleOCR
ocr_image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender-dev",
        "libgomp1",
    )
    .pip_install(
        "paddlepaddle==2.5.2",
        "paddleocr==2.7.3",
        "opencv-python-headless==4.8.1.78",
        "numpy==1.24.3",
        "Pillow==10.1.0",
        "httpx==0.25.2",
        "pydantic==2.5.2",
    )
)

# Volume pour le cache des modèles PaddleOCR
model_cache = modal.Volume.from_name("scanfactory-model-cache", create_if_missing=True)


@app.cls(
    image=ocr_image,
    volumes={"/root/.paddleocr": model_cache},
    cpu=2,
    memory=4096,
    timeout=300,
    container_idle_timeout=60,
)
class OCRService:
    """Service OCR avec PaddleOCR pour la reconnaissance de texte français."""

    def __init__(self):
        self.ocr = None

    @modal.enter()
    def setup(self):
        """Initialise PaddleOCR au démarrage du conteneur."""
        from paddleocr import PaddleOCR

        self.ocr = PaddleOCR(
            use_angle_cls=True,
            lang="fr",
            use_gpu=False,
            show_log=False,
            det_db_thresh=0.3,
            det_db_box_thresh=0.5,
            det_db_unclip_ratio=1.6,
            rec_batch_num=6,
        )
        print("PaddleOCR initialized successfully")

    @modal.method()
    def extract_text(self, image_bytes: bytes) -> dict:
        """
        Extrait le texte d'une image.

        Args:
            image_bytes: Image en bytes (JPEG ou PNG)

        Returns:
            dict avec:
                - text: Texte complet extrait
                - blocks: Liste des blocs de texte avec positions et confiances
                - confidence: Score de confiance moyen
        """
        import io

        import numpy as np
        from PIL import Image

        # Charger l'image
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        img_array = np.array(image)

        # Exécuter l'OCR
        result = self.ocr.ocr(img_array, cls=True)

        if not result or not result[0]:
            return {"text": "", "blocks": [], "confidence": 0.0}

        # Parser les résultats
        blocks = []
        texts = []
        confidences = []

        for line in result[0]:
            box, (text, confidence) = line
            blocks.append(
                {
                    "text": text,
                    "confidence": float(confidence),
                    "bbox": {
                        "x1": int(box[0][0]),
                        "y1": int(box[0][1]),
                        "x2": int(box[2][0]),
                        "y2": int(box[2][1]),
                    },
                }
            )
            texts.append(text)
            confidences.append(confidence)

        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        return {
            "text": "\n".join(texts),
            "blocks": blocks,
            "confidence": round(avg_confidence, 4),
        }

    @modal.method()
    def extract_text_with_layout(self, image_bytes: bytes) -> dict:
        """
        Extrait le texte avec analyse de layout pour documents structurés.

        Returns:
            dict avec text, blocks, et layout_info
        """
        import io

        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")
        img_array = np.array(image)

        result = self.ocr.ocr(img_array, cls=True)

        if not result or not result[0]:
            return {
                "text": "",
                "blocks": [],
                "layout_info": {"width": image.width, "height": image.height, "regions": []},
                "confidence": 0.0,
            }

        # Analyser la structure du document
        blocks = []
        lines_by_y = {}

        for line in result[0]:
            box, (text, confidence) = line
            y_center = (box[0][1] + box[2][1]) / 2
            x_center = (box[0][0] + box[2][0]) / 2

            block = {
                "text": text,
                "confidence": float(confidence),
                "bbox": {
                    "x1": int(box[0][0]),
                    "y1": int(box[0][1]),
                    "x2": int(box[2][0]),
                    "y2": int(box[2][1]),
                },
                "center": {"x": x_center, "y": y_center},
            }
            blocks.append(block)

            # Grouper par ligne (tolérance de 20px)
            y_key = int(y_center / 20) * 20
            if y_key not in lines_by_y:
                lines_by_y[y_key] = []
            lines_by_y[y_key].append(block)

        # Reconstruire les lignes dans l'ordre de lecture
        sorted_lines = []
        for y_key in sorted(lines_by_y.keys()):
            line_blocks = sorted(lines_by_y[y_key], key=lambda b: b["center"]["x"])
            sorted_lines.append(" ".join(b["text"] for b in line_blocks))

        # Détecter les régions (header, body, footer)
        regions = self._detect_regions(blocks, image.height)

        return {
            "text": "\n".join(sorted_lines),
            "blocks": blocks,
            "layout_info": {
                "width": image.width,
                "height": image.height,
                "regions": regions,
            },
            "confidence": round(
                sum(b["confidence"] for b in blocks) / len(blocks) if blocks else 0.0, 4
            ),
        }

    def _detect_regions(self, blocks: list, image_height: int) -> list:
        """Détecte les régions du document (header, body, footer)."""
        if not blocks:
            return []

        header_threshold = image_height * 0.15
        footer_threshold = image_height * 0.85

        header_blocks = [b for b in blocks if b["bbox"]["y1"] < header_threshold]
        footer_blocks = [b for b in blocks if b["bbox"]["y1"] > footer_threshold]
        body_blocks = [
            b
            for b in blocks
            if b["bbox"]["y1"] >= header_threshold and b["bbox"]["y1"] <= footer_threshold
        ]

        regions = []
        if header_blocks:
            regions.append(
                {
                    "type": "header",
                    "y_start": 0,
                    "y_end": int(header_threshold),
                    "block_count": len(header_blocks),
                }
            )
        if body_blocks:
            regions.append(
                {
                    "type": "body",
                    "y_start": int(header_threshold),
                    "y_end": int(footer_threshold),
                    "block_count": len(body_blocks),
                }
            )
        if footer_blocks:
            regions.append(
                {
                    "type": "footer",
                    "y_start": int(footer_threshold),
                    "y_end": image_height,
                    "block_count": len(footer_blocks),
                }
            )

        return regions


# =============================================================================
# Web Endpoints
# =============================================================================


@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
@modal.web_endpoint(method="POST", docs=True)
async def process_ocr(request: dict) -> dict:
    """
    Endpoint pour le traitement OCR.

    Body:
        image_url: URL de l'image à traiter
        ou
        image_base64: Image encodée en base64

        with_layout: bool - Inclure l'analyse de layout (défaut: true)

    Returns:
        Résultat OCR avec texte et blocs
    """
    import base64

    import httpx

    # Récupérer l'image
    if "image_url" in request:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request["image_url"])
            response.raise_for_status()
            image_bytes = response.content
    elif "image_base64" in request:
        image_bytes = base64.b64decode(request["image_base64"])
    else:
        return {"error": "image_url or image_base64 required", "success": False}

    # Traiter avec OCR
    ocr_service = OCRService()
    with_layout = request.get("with_layout", True)

    if with_layout:
        result = ocr_service.extract_text_with_layout.remote(image_bytes)
    else:
        result = ocr_service.extract_text.remote(image_bytes)

    return {"success": True, **result}


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def health() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "scanfactory-ocr",
        "version": "1.1.0",
        "features": ["paddleocr", "layout_detection"],
        "note": "LLM extraction moved to Cloudflare Workers AI (free)",
    }


# =============================================================================
# Direct Function Calls (pour appel depuis Cloudflare)
# =============================================================================


@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
def ocr_from_url(image_url: str, with_layout: bool = True) -> dict:
    """
    Traitement OCR depuis une URL d'image.
    Appelable directement depuis l'API Cloudflare.
    """
    import httpx

    with httpx.Client(timeout=30.0) as client:
        response = client.get(image_url)
        response.raise_for_status()
        image_bytes = response.content

    ocr_service = OCRService()
    if with_layout:
        return ocr_service.extract_text_with_layout.remote(image_bytes)
    return ocr_service.extract_text.remote(image_bytes)


@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
def ocr_from_bytes(image_bytes: bytes, with_layout: bool = True) -> dict:
    """
    Traitement OCR depuis des bytes d'image.
    Appelable directement depuis l'API Cloudflare.
    """
    ocr_service = OCRService()
    if with_layout:
        return ocr_service.extract_text_with_layout.remote(image_bytes)
    return ocr_service.extract_text.remote(image_bytes)


# =============================================================================
# CLI pour tests locaux
# =============================================================================


@app.local_entrypoint()
def main():
    """Point d'entrée pour tests locaux."""
    print("ScanFactory OCR Service")
    print("=" * 50)
    print("Endpoints:")
    print("  - POST /process_ocr  - OCR avec layout")
    print("  - GET  /health       - Health check")
    print("")
    print("Note: L'extraction LLM est gérée par Cloudflare Workers AI")
    print("      (gratuit, modèles: Llama 3.1, Mistral, Qwen)")
