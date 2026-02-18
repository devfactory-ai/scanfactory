"""Logging utilities."""

import logging
import sys
from typing import Optional


_logger: Optional[logging.Logger] = None


def setup_logger(
    name: str = "scanfactory",
    level: str = "INFO",
    log_file: Optional[str] = None,
    format_string: Optional[str] = None,
) -> logging.Logger:
    """
    Setup and configure the logger.

    Args:
        name: Logger name
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        log_file: Optional file path for logging
        format_string: Custom format string

    Returns:
        Configured logger
    """
    global _logger

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level.upper()))

    # Clear existing handlers
    logger.handlers.clear()

    # Default format
    if format_string is None:
        format_string = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"

    formatter = logging.Formatter(format_string, datefmt="%Y-%m-%d %H:%M:%S")

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    _logger = logger
    return logger


def get_logger() -> logging.Logger:
    """
    Get the configured logger.

    Returns:
        Logger instance
    """
    global _logger

    if _logger is None:
        _logger = setup_logger()

    return _logger


class LogContext:
    """Context manager for logging with additional context."""

    def __init__(self, logger: logging.Logger, operation: str, **kwargs):
        self.logger = logger
        self.operation = operation
        self.context = kwargs
        self.start_time = None

    def __enter__(self):
        import time

        self.start_time = time.time()
        context_str = ", ".join(f"{k}={v}" for k, v in self.context.items())
        self.logger.info(f"Starting {self.operation} ({context_str})")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import time

        duration = time.time() - self.start_time

        if exc_type is not None:
            self.logger.error(
                f"Failed {self.operation} after {duration:.2f}s: {exc_val}"
            )
        else:
            self.logger.info(f"Completed {self.operation} in {duration:.2f}s")

        return False  # Don't suppress exceptions


def log_progress(
    current: int,
    total: int,
    prefix: str = "Progress",
    logger: Optional[logging.Logger] = None,
) -> None:
    """
    Log progress information.

    Args:
        current: Current item number
        total: Total items
        prefix: Prefix string
        logger: Logger to use (default: get_logger())
    """
    if logger is None:
        logger = get_logger()

    percentage = (current / total) * 100 if total > 0 else 0
    logger.info(f"{prefix}: {current}/{total} ({percentage:.1f}%)")
