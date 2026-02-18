#!/usr/bin/env python3
"""
ScanFactory Multi-OCR Processor

CLI tool for document OCR processing with multiple engine support.
Supports: PaddleOCR, SuryaOCR, HunyuanOCR, Tesseract, EasyOCR
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from core.document_processor import DocumentProcessor
from core.ocr_factory import OCREngineFactory
from utils.hardware_detector import detect_device, get_device_info
from utils.logger import setup_logger


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="ScanFactory Multi-OCR Processor",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process single document with SuryaOCR
  python main.py --input ./docs/sample.pdf --engine surya

  # Batch process with HunyuanOCR
  python main.py --input ./docs/ --engine hunyuan --batch

  # Use default engine from config
  python main.py --input ./docs/invoice.pdf

  # List available engines
  python main.py --list-engines

  # Show device info
  python main.py --device-info
        """,
    )

    parser.add_argument(
        "--input",
        type=Path,
        help="File or directory to process",
    )

    parser.add_argument(
        "--engine",
        choices=["paddleocr", "tesseract", "easyocr", "hunyuan", "surya"],
        help="OCR engine to use (default: from config)",
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./output"),
        help="Output directory (default: ./output)",
    )

    parser.add_argument(
        "--batch",
        action="store_true",
        help="Batch mode: process all files in directory",
    )

    parser.add_argument(
        "--recursive",
        action="store_true",
        default=True,
        help="Recursively process subdirectories (default: True)",
    )

    parser.add_argument(
        "--formats",
        nargs="+",
        choices=["markdown", "json"],
        default=["markdown"],
        help="Output formats (default: markdown)",
    )

    parser.add_argument(
        "--config",
        type=Path,
        help="Path to configuration file",
    )

    parser.add_argument(
        "--list-engines",
        action="store_true",
        help="List available OCR engines",
    )

    parser.add_argument(
        "--device-info",
        action="store_true",
        help="Show device information",
    )

    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Verbose output",
    )

    parser.add_argument(
        "--quiet",
        "-q",
        action="store_true",
        help="Quiet mode (errors only)",
    )

    return parser.parse_args()


def list_engines() -> None:
    """List available OCR engines."""
    print("\n📋 Available OCR Engines:")
    print("=" * 50)

    engines = {
        "paddleocr": {
            "name": "PaddleOCR",
            "description": "High-accuracy OCR with French support",
            "features": ["Layout detection", "Table recognition", "Multi-language"],
            "requirements": "paddleocr, paddlepaddle",
        },
        "surya": {
            "name": "SuryaOCR (Docling)",
            "description": "Advanced document understanding with layout analysis",
            "features": ["PDF support", "Structure extraction", "Markdown export"],
            "requirements": "docling, docling-surya",
        },
        "hunyuan": {
            "name": "HunyuanOCR",
            "description": "1B parameter VLM for OCR (90+ languages)",
            "features": ["LaTeX OCR", "Handwriting", "Reading order"],
            "requirements": "hunyuan_ocr (GitHub)",
        },
        "tesseract": {
            "name": "Tesseract",
            "description": "Classic OCR engine",
            "features": ["Fast", "Lightweight", "Wide language support"],
            "requirements": "pytesseract, tesseract-ocr",
        },
        "easyocr": {
            "name": "EasyOCR",
            "description": "Ready-to-use OCR with GPU support",
            "features": ["Easy setup", "80+ languages", "Scene text"],
            "requirements": "easyocr",
        },
    }

    for engine_id, info in engines.items():
        print(f"\n🔧 {info['name']} ({engine_id})")
        print(f"   {info['description']}")
        print(f"   Features: {', '.join(info['features'])}")
        print(f"   Requirements: {info['requirements']}")

    print("\n")


def show_device_info() -> None:
    """Show device information."""
    print("\n💻 Device Information:")
    print("=" * 50)

    info = get_device_info()

    print(f"\n  Detected device: {info['detected_device']}")
    print(f"  CPU cores: {info.get('cpu_count', 'N/A')}")

    if info.get("torch_version"):
        print(f"\n  PyTorch version: {info['torch_version']}")
        print(f"  CUDA available: {info.get('cuda_available', False)}")
        print(f"  MPS available: {info.get('mps_available', False)}")

        if info.get("cuda_available"):
            print(f"\n  CUDA devices: {info.get('cuda_device_count', 0)}")
            print(f"  CUDA device: {info.get('cuda_device_name', 'N/A')}")
            if "cuda_memory_total" in info:
                total_gb = info["cuda_memory_total"] / 1024**3
                print(f"  CUDA memory: {total_gb:.2f} GB")
    else:
        print("\n  ⚠️  PyTorch not installed")

    print("\n")


def process_single(
    processor: DocumentProcessor,
    input_path: Path,
    engine: Optional[str],
    formats: List[str],
) -> bool:
    """Process a single document."""
    result = processor.process_document(
        input_path,
        engine_name=engine,
        output_formats=formats,
    )

    if result["success"]:
        print(f"\n✅ Document processed successfully!")
        print(f"   Engine: {result['engine']}")
        print(f"   Confidence: {result.get('confidence', 0):.2%}")
        print(f"\n📁 Output files:")
        for fmt, path in result.get("outputs", {}).items():
            print(f"   - {fmt}: {path}")
        return True
    else:
        print(f"\n❌ Error: {result.get('error', 'Unknown error')}")
        return False


def process_batch(
    processor: DocumentProcessor,
    input_dir: Path,
    engine: Optional[str],
    formats: List[str],
    recursive: bool,
) -> bool:
    """Process multiple documents."""
    results = processor.batch_process(
        input_dir,
        engine_name=engine,
        recursive=recursive,
        output_formats=formats,
    )

    successes = sum(1 for r in results if r.get("success"))
    failures = len(results) - successes

    print(f"\n📊 Batch Processing Summary:")
    print(f"   Total: {len(results)}")
    print(f"   ✅ Success: {successes}")
    print(f"   ❌ Failed: {failures}")

    if failures > 0:
        print(f"\n⚠️  Failed documents:")
        for r in results:
            if not r.get("success"):
                print(f"   - {r.get('input_file', 'Unknown')}: {r.get('error', 'Unknown error')}")

    return failures == 0


def main() -> int:
    """Main entry point."""
    args = parse_args()

    # Setup logging
    log_level = "DEBUG" if args.verbose else ("ERROR" if args.quiet else "INFO")
    setup_logger(level=log_level)

    # Handle info commands
    if args.list_engines:
        list_engines()
        return 0

    if args.device_info:
        show_device_info()
        return 0

    # Validate input
    if not args.input:
        print("❌ Error: --input is required")
        print("   Use --help for usage information")
        return 1

    if not args.input.exists():
        print(f"❌ Error: Input not found: {args.input}")
        return 1

    # Initialize processor
    print("\n🚀 ScanFactory Multi-OCR Processor")
    print("=" * 50)

    config_path = str(args.config) if args.config else None
    processor = DocumentProcessor(config_path=config_path)
    processor.output_dir = args.output_dir
    processor.output_dir.mkdir(parents=True, exist_ok=True)

    # Show configuration
    print(f"\n📌 Configuration:")
    print(f"   Device: {detect_device()}")
    print(f"   Engine: {args.engine or processor.default_engine} (default)")
    print(f"   Output: {args.output_dir}")
    print(f"   Formats: {', '.join(args.formats)}")

    # Process
    if args.batch or args.input.is_dir():
        success = process_batch(
            processor,
            args.input,
            args.engine,
            args.formats,
            args.recursive,
        )
    else:
        success = process_single(
            processor,
            args.input,
            args.engine,
            args.formats,
        )

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
