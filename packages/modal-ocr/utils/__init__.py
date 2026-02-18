"""Utility modules for ScanFactory OCR."""

from .hardware_detector import detect_device, get_device_info
from .format_converter import convert_to_markdown, convert_to_json
from .logger import setup_logger, get_logger

__all__ = [
    "detect_device",
    "get_device_info",
    "convert_to_markdown",
    "convert_to_json",
    "setup_logger",
    "get_logger",
]
