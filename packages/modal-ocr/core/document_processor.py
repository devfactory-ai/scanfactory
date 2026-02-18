"""Document Processor - Main pipeline for document processing."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .ocr_factory import OCREngineFactory
from .ocr_strategy import OCRResult


class DocumentProcessor:
    """Pipeline principal pour le traitement de documents."""

    SUPPORTED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".bmp", ".webp"}

    def __init__(self, config: Optional[Dict[str, Any]] = None, config_path: Optional[str] = None):
        """
        Initialise le processeur avec la configuration.

        Args:
            config: Configuration dictionary (if provided directly)
            config_path: Chemin vers le fichier de configuration YAML
        """
        if config is not None:
            self.config = config
        elif config_path is not None:
            from config.settings import load_config

            self.config = load_config(config_path)
        else:
            from config.settings import load_config

            self.config = load_config()

        self.default_engine = self.config["ocr"]["default_engine"]
        self.output_dir = Path(self.config["ocr"].get("output_dir", "./output"))
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Cache for engine instances
        self._engine_cache: Dict[str, Any] = {}

    def process_document(
        self,
        file_path: Path,
        engine_name: Optional[str] = None,
        output_formats: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Traite un document avec le moteur spécifié.

        Args:
            file_path: Chemin vers le document
            engine_name: Nom du moteur (None = utiliser default)
            output_formats: Formats de sortie (markdown, json)

        Returns:
            Dict avec chemins des fichiers générés et métadonnées
        """
        file_path = Path(file_path)

        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {file_path}",
                "input_file": str(file_path),
            }

        if file_path.suffix.lower() not in self.SUPPORTED_EXTENSIONS:
            return {
                "success": False,
                "error": f"Unsupported file format: {file_path.suffix}",
                "input_file": str(file_path),
            }

        # Sélection du moteur
        engine_name = engine_name or self.default_engine
        engine = self._get_engine(engine_name)

        if engine is None:
            return {
                "success": False,
                "error": f"Failed to create engine: {engine_name}",
                "input_file": str(file_path),
            }

        try:
            # Traitement
            print(f"🔄 Processing {file_path.name} with {engine_name}...")
            result = engine.process(file_path)

            # Sauvegarde des résultats
            output_formats = output_formats or self.config["ocr"]["output"]["formats"]
            outputs = self._save_results(file_path, result, output_formats)

            # Nettoyage
            engine.cleanup()

            return {
                "success": True,
                "engine": engine_name,
                "input_file": str(file_path),
                "outputs": outputs,
                "confidence": result.confidence,
                "metadata": result.metadata,
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "engine": engine_name,
                "input_file": str(file_path),
            }

    def process_bytes(
        self,
        image_bytes: bytes,
        engine_name: Optional[str] = None,
        filename: str = "document",
    ) -> Dict[str, Any]:
        """
        Traite une image en bytes.

        Args:
            image_bytes: Image en bytes
            engine_name: Nom du moteur
            filename: Nom du fichier pour les métadonnées

        Returns:
            Dict avec résultat OCR
        """
        engine_name = engine_name or self.default_engine
        engine = self._get_engine(engine_name)

        if engine is None:
            return {
                "success": False,
                "error": f"Failed to create engine: {engine_name}",
            }

        try:
            result = engine.process_bytes(image_bytes)

            return {
                "success": True,
                "engine": engine_name,
                "text": result.text,
                "confidence": result.confidence,
                "blocks": result.blocks,
                "layout": result.layout,
                "metadata": result.metadata,
            }

        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "engine": engine_name,
            }

    def batch_process(
        self,
        input_dir: Path,
        engine_name: Optional[str] = None,
        recursive: bool = True,
        output_formats: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Traite tous les documents d'un répertoire.

        Args:
            input_dir: Répertoire contenant les documents
            engine_name: Nom du moteur à utiliser
            recursive: Parcourir les sous-dossiers
            output_formats: Formats de sortie

        Returns:
            Liste des résultats de traitement
        """
        input_dir = Path(input_dir)

        if not input_dir.exists():
            return [{"success": False, "error": f"Directory not found: {input_dir}"}]

        # Find all supported files
        if recursive:
            files = [
                f for f in input_dir.rglob("*") if f.suffix.lower() in self.SUPPORTED_EXTENSIONS
            ]
        else:
            files = [
                f for f in input_dir.glob("*") if f.suffix.lower() in self.SUPPORTED_EXTENSIONS
            ]

        if not files:
            return [{"success": False, "error": "No supported files found"}]

        print(f"📁 Found {len(files)} documents to process")

        results = []
        for i, file_path in enumerate(files, 1):
            print(f"[{i}/{len(files)}] ", end="")
            result = self.process_document(file_path, engine_name, output_formats)
            results.append(result)

        return results

    def _get_engine(self, engine_name: str):
        """Get or create an engine instance."""
        if engine_name in self._engine_cache:
            return self._engine_cache[engine_name]

        try:
            engine_config = self.config["ocr"]["engines"].get(engine_name, {})
            engine_config["enabled"] = engine_config.get("enabled", True)

            engine = OCREngineFactory.create_engine(engine_name, engine_config)
            self._engine_cache[engine_name] = engine
            return engine

        except Exception as e:
            print(f"❌ Failed to create engine '{engine_name}': {e}")
            return None

    def _save_results(
        self, input_path: Path, result: OCRResult, formats: List[str]
    ) -> Dict[str, str]:
        """
        Sauvegarde les résultats dans les formats demandés.

        Returns:
            Dict avec chemins des fichiers créés
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{input_path.stem}_{timestamp}"
        outputs = {}

        if "markdown" in formats:
            md_path = self.output_dir / f"{base_name}.md"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(result.to_markdown())
            outputs["markdown"] = str(md_path)
            print(f"   📄 Saved: {md_path.name}")

        if "json" in formats:
            json_path = self.output_dir / f"{base_name}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(result.to_json(), f, indent=2, ensure_ascii=False)
            outputs["json"] = str(json_path)
            print(f"   📄 Saved: {json_path.name}")

        return outputs
