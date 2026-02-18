"""Configuration loading utilities."""

import os
from pathlib import Path
from typing import Any, Dict, Optional

import yaml


def load_config(config_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Load configuration from YAML file.

    Args:
        config_path: Path to config file. If None, uses default location.

    Returns:
        Configuration dictionary
    """
    if config_path is None:
        # Default config path relative to this file
        config_path = Path(__file__).parent / "ocr_config.yaml"
    else:
        config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Apply environment variable overrides
    config = _apply_env_overrides(config)

    return config


def get_engine_config(config: Dict[str, Any], engine_name: str) -> Dict[str, Any]:
    """
    Get configuration for a specific OCR engine.

    Args:
        config: Full configuration dictionary
        engine_name: Name of the engine

    Returns:
        Engine-specific configuration

    Raises:
        ValueError: If engine not found or disabled
    """
    engines = config.get("ocr", {}).get("engines", {})

    if engine_name not in engines:
        available = list(engines.keys())
        raise ValueError(
            f"Engine '{engine_name}' not found. Available: {available}"
        )

    engine_config = engines[engine_name]

    if not engine_config.get("enabled", False):
        raise ValueError(f"Engine '{engine_name}' is disabled in configuration")

    return engine_config


def _apply_env_overrides(config: Dict[str, Any]) -> Dict[str, Any]:
    """Apply environment variable overrides to configuration."""
    # Override default engine
    if env_engine := os.environ.get("OCR_DEFAULT_ENGINE"):
        config["ocr"]["default_engine"] = env_engine

    # Override output directory
    if env_output := os.environ.get("OCR_OUTPUT_DIR"):
        config["ocr"]["output_dir"] = env_output

    # Override device for all engines
    if env_device := os.environ.get("OCR_DEVICE"):
        for engine_name in config.get("ocr", {}).get("engines", {}):
            if "device" in config["ocr"]["engines"][engine_name]:
                config["ocr"]["engines"][engine_name]["device"] = env_device

    return config
