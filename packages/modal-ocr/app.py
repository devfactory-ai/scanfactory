"""
ScanFactory Modal OCR Service

Service de traitement OCR et d'extraction de données pour documents médicaux.
Déployé sur Modal pour bénéficier du GPU et de la scalabilité automatique.
"""

import modal

# Configuration de l'application Modal
app = modal.App("scanfactory-ocr")

# Image Docker avec PaddleOCR et dépendances
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

# Image pour l'extraction IA (plus légère)
extraction_image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "httpx==0.25.2",
        "pydantic==2.5.2",
        "anthropic==0.39.0",
    )
)


# Volume pour le cache des modèles
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
    """Service OCR avec PaddleOCR pour la reconnaissance de texte."""

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
            dict avec text, blocks, tables, et layout_info
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
                "tables": [],
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
            "tables": [],  # TODO: Implémenter détection de tables
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


@app.cls(
    image=extraction_image,
    cpu=1,
    memory=1024,
    timeout=120,
    secrets=[modal.Secret.from_name("anthropic-api-key")],
)
class ExtractionService:
    """Service d'extraction de données structurées avec Claude."""

    def __init__(self):
        self.client = None

    @modal.enter()
    def setup(self):
        """Initialise le client Anthropic."""
        import os

        from anthropic import Anthropic

        self.client = Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        print("Anthropic client initialized")

    @modal.method()
    def extract_bulletin_soin(self, ocr_text: str, ocr_blocks: list) -> dict:
        """
        Extrait les données d'un bulletin de soins.

        Args:
            ocr_text: Texte OCR brut
            ocr_blocks: Blocs OCR avec positions

        Returns:
            Données structurées du bulletin de soins
        """
        prompt = f"""Tu es un expert en extraction de données de documents médicaux français.
Analyse ce texte OCR d'un bulletin de soins et extrait les informations structurées.

TEXTE OCR:
{ocr_text}

Extrait les champs suivants au format JSON:
- patient_nom: Nom de famille du patient
- patient_prenom: Prénom du patient
- patient_nir: Numéro de sécurité sociale (13 ou 15 chiffres)
- patient_date_naissance: Date de naissance (format YYYY-MM-DD)
- date_soins: Date des soins (format YYYY-MM-DD)
- prescripteur_nom: Nom du médecin prescripteur
- prescripteur_finess: Numéro FINESS du prescripteur
- actes: Liste des actes médicaux avec code et montant
- montant_total: Montant total en euros
- organisme: Nom de l'organisme de remboursement

Pour chaque champ, indique aussi un score de confiance entre 0 et 1.
Si un champ n'est pas trouvé, mets null.

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication."""

        response = self.client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        import json

        try:
            result = json.loads(response.content[0].text)
            return {"success": True, "data": result, "model": "claude-3-haiku"}
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": "Invalid JSON response",
                "raw_response": response.content[0].text,
            }

    @modal.method()
    def extract_facture(self, ocr_text: str, ocr_blocks: list) -> dict:
        """
        Extrait les données d'une facture médicale.

        Args:
            ocr_text: Texte OCR brut
            ocr_blocks: Blocs OCR avec positions

        Returns:
            Données structurées de la facture
        """
        prompt = f"""Tu es un expert en extraction de données de factures médicales françaises.
Analyse ce texte OCR d'une facture et extrait les informations structurées.

TEXTE OCR:
{ocr_text}

Extrait les champs suivants au format JSON:
- numero_facture: Numéro de la facture
- date_facture: Date de la facture (format YYYY-MM-DD)
- emetteur_nom: Nom de l'établissement émetteur
- emetteur_siret: Numéro SIRET
- emetteur_adresse: Adresse complète
- patient_nom: Nom complet du patient
- lignes: Liste des lignes de facture avec description, quantité, prix_unitaire, montant
- sous_total_ht: Sous-total HT
- tva: Montant TVA (si applicable)
- total_ttc: Total TTC
- mode_paiement: Mode de paiement mentionné

Pour chaque champ, indique aussi un score de confiance entre 0 et 1.
Si un champ n'est pas trouvé, mets null.

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication."""

        response = self.client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        import json

        try:
            result = json.loads(response.content[0].text)
            return {"success": True, "data": result, "model": "claude-3-haiku"}
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": "Invalid JSON response",
                "raw_response": response.content[0].text,
            }

    @modal.method()
    def extract_generic(self, ocr_text: str, fields: list[dict]) -> dict:
        """
        Extraction générique basée sur une liste de champs à extraire.

        Args:
            ocr_text: Texte OCR brut
            fields: Liste de champs à extraire avec nom, type et description

        Returns:
            Données structurées selon les champs demandés
        """
        fields_desc = "\n".join(
            f"- {f['name']} ({f['type']}): {f.get('description', '')}" for f in fields
        )

        prompt = f"""Tu es un expert en extraction de données de documents.
Analyse ce texte OCR et extrait les informations demandées.

TEXTE OCR:
{ocr_text}

CHAMPS À EXTRAIRE:
{fields_desc}

Réponds au format JSON avec chaque champ demandé.
Pour chaque champ, fournis la valeur et un score de confiance (0-1).
Si un champ n'est pas trouvé, mets null pour la valeur.

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication."""

        response = self.client.messages.create(
            model="claude-3-haiku-20240307",
            max_tokens=2000,
            messages=[{"role": "user", "content": prompt}],
        )

        import json

        try:
            result = json.loads(response.content[0].text)
            return {"success": True, "data": result, "model": "claude-3-haiku"}
        except json.JSONDecodeError:
            return {
                "success": False,
                "error": "Invalid JSON response",
                "raw_response": response.content[0].text,
            }


# API Web endpoints
@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
@modal.web_endpoint(method="POST", docs=True)
async def process_ocr(request: dict) -> dict:
    """
    Endpoint pour le traitement OCR.

    Body:
        image_url: URL de l'image à traiter
        ou
        image_base64: Image encodée en base64

        with_layout: bool - Inclure l'analyse de layout (défaut: false)

    Returns:
        Résultat OCR avec texte et blocs
    """
    import base64

    import httpx

    # Récupérer l'image
    if "image_url" in request:
        async with httpx.AsyncClient() as client:
            response = await client.get(request["image_url"])
            image_bytes = response.content
    elif "image_base64" in request:
        image_bytes = base64.b64decode(request["image_base64"])
    else:
        return {"error": "image_url or image_base64 required"}

    # Traiter avec OCR
    ocr_service = OCRService()
    if request.get("with_layout", False):
        result = ocr_service.extract_text_with_layout.remote(image_bytes)
    else:
        result = ocr_service.extract_text.remote(image_bytes)

    return result


@app.function(
    image=extraction_image,
    secrets=[modal.Secret.from_name("anthropic-api-key")],
)
@modal.web_endpoint(method="POST", docs=True)
async def process_extraction(request: dict) -> dict:
    """
    Endpoint pour l'extraction de données structurées.

    Body:
        ocr_text: Texte OCR
        ocr_blocks: Blocs OCR (optionnel)
        pipeline: Type de pipeline (bulletin_soin, facture, generic)
        fields: Liste de champs pour pipeline generic

    Returns:
        Données extraites structurées
    """
    ocr_text = request.get("ocr_text", "")
    ocr_blocks = request.get("ocr_blocks", [])
    pipeline = request.get("pipeline", "generic")

    extraction_service = ExtractionService()

    if pipeline == "bulletin_soin":
        result = extraction_service.extract_bulletin_soin.remote(ocr_text, ocr_blocks)
    elif pipeline == "facture":
        result = extraction_service.extract_facture.remote(ocr_text, ocr_blocks)
    else:
        fields = request.get("fields", [])
        if not fields:
            return {"error": "fields required for generic pipeline"}
        result = extraction_service.extract_generic.remote(ocr_text, fields)

    return result


@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
@modal.web_endpoint(method="POST", docs=True)
async def process_document(request: dict) -> dict:
    """
    Pipeline complète: OCR + Extraction en une seule requête.

    Body:
        image_url: URL de l'image
        ou
        image_base64: Image en base64

        pipeline: Type de pipeline (bulletin_soin, facture)

    Returns:
        ocr_result: Résultat OCR
        extracted_data: Données extraites
    """
    import base64

    import httpx

    # Récupérer l'image
    if "image_url" in request:
        async with httpx.AsyncClient() as client:
            response = await client.get(request["image_url"])
            image_bytes = response.content
    elif "image_base64" in request:
        image_bytes = base64.b64decode(request["image_base64"])
    else:
        return {"error": "image_url or image_base64 required"}

    pipeline = request.get("pipeline", "bulletin_soin")

    # Étape 1: OCR
    ocr_service = OCRService()
    ocr_result = ocr_service.extract_text_with_layout.remote(image_bytes)

    # Étape 2: Extraction
    extraction_service = ExtractionService()
    if pipeline == "bulletin_soin":
        extraction_result = extraction_service.extract_bulletin_soin.remote(
            ocr_result["text"], ocr_result["blocks"]
        )
    elif pipeline == "facture":
        extraction_result = extraction_service.extract_facture.remote(
            ocr_result["text"], ocr_result["blocks"]
        )
    else:
        return {"error": f"Unknown pipeline: {pipeline}"}

    return {
        "ocr_result": ocr_result,
        "extracted_data": extraction_result,
        "pipeline": pipeline,
    }


@app.function()
@modal.web_endpoint(method="GET", docs=True)
async def health() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "scanfactory-ocr",
        "version": "1.0.0",
    }


# Fonctions pour appel depuis l'API Cloudflare (sans web endpoint)
@app.function(image=ocr_image, volumes={"/root/.paddleocr": model_cache}, cpu=2, memory=4096)
def ocr_process(image_bytes: bytes, with_layout: bool = False) -> dict:
    """Fonction appelable pour le traitement OCR."""
    ocr_service = OCRService()
    if with_layout:
        return ocr_service.extract_text_with_layout.remote(image_bytes)
    return ocr_service.extract_text.remote(image_bytes)


@app.function(
    image=extraction_image,
    secrets=[modal.Secret.from_name("anthropic-api-key")],
)
def extraction_process(ocr_text: str, ocr_blocks: list, pipeline: str, fields: list = None) -> dict:
    """Fonction appelable pour l'extraction de données."""
    extraction_service = ExtractionService()

    if pipeline == "bulletin_soin":
        return extraction_service.extract_bulletin_soin.remote(ocr_text, ocr_blocks)
    elif pipeline == "facture":
        return extraction_service.extract_facture.remote(ocr_text, ocr_blocks)
    else:
        return extraction_service.extract_generic.remote(ocr_text, fields or [])
