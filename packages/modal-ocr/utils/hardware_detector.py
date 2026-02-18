"""Hardware detection utilities."""

from typing import Dict, Any


def detect_device() -> str:
    """
    Detect the best available compute device.

    Returns:
        Device string: 'cuda', 'mps', or 'cpu'
    """
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass

    return "cpu"


def get_device_info() -> Dict[str, Any]:
    """
    Get detailed information about available compute devices.

    Returns:
        Dictionary with device information
    """
    info = {
        "detected_device": detect_device(),
        "cuda_available": False,
        "mps_available": False,
        "cpu_count": 1,
    }

    # CPU info
    try:
        import os

        info["cpu_count"] = os.cpu_count() or 1
    except Exception:
        pass

    # PyTorch info
    try:
        import torch

        info["torch_version"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
        info["mps_available"] = torch.backends.mps.is_available()

        if info["cuda_available"]:
            info["cuda_device_count"] = torch.cuda.device_count()
            info["cuda_device_name"] = torch.cuda.get_device_name(0)
            info["cuda_memory_total"] = torch.cuda.get_device_properties(0).total_memory
            info["cuda_memory_allocated"] = torch.cuda.memory_allocated(0)

    except ImportError:
        info["torch_available"] = False

    return info


def get_memory_usage() -> Dict[str, Any]:
    """
    Get current memory usage.

    Returns:
        Dictionary with memory information
    """
    import gc

    info = {"gc_objects": len(gc.get_objects())}

    try:
        import torch

        if torch.cuda.is_available():
            info["cuda_memory_allocated"] = torch.cuda.memory_allocated(0)
            info["cuda_memory_reserved"] = torch.cuda.memory_reserved(0)
            info["cuda_memory_cached"] = torch.cuda.memory_reserved(0) - torch.cuda.memory_allocated(0)

        if torch.backends.mps.is_available():
            # MPS doesn't have detailed memory API
            info["mps_available"] = True

    except ImportError:
        pass

    try:
        import psutil

        process = psutil.Process()
        info["ram_used_mb"] = process.memory_info().rss / 1024 / 1024
        info["ram_percent"] = process.memory_percent()

    except ImportError:
        pass

    return info


def clear_gpu_memory() -> None:
    """Clear GPU memory cache."""
    import gc

    gc.collect()

    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()

        if torch.backends.mps.is_available() and hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()

    except ImportError:
        pass
