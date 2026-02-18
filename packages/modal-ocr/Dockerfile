# ScanFactory Multi-OCR Service
# Supports: PaddleOCR, SuryaOCR, HunyuanOCR, Tesseract, EasyOCR

FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3.10-venv \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    tesseract-ocr \
    tesseract-ocr-fra \
    tesseract-ocr-eng \
    tesseract-ocr-ara \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.10 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.10 1 \
    && update-alternatives --install /usr/bin/pip pip /usr/bin/pip3 1

WORKDIR /app

# Install base dependencies
COPY requirements/base.txt ./requirements/
RUN pip install --upgrade pip && pip install -r requirements/base.txt

# Install OCR engines (can be customized via build args)
ARG INSTALL_PADDLEOCR=true
ARG INSTALL_SURYA=true
ARG INSTALL_EASYOCR=true
ARG INSTALL_GPU=true

COPY requirements/ ./requirements/

RUN if [ "$INSTALL_GPU" = "true" ]; then \
        pip install -r requirements/gpu.txt; \
    fi

RUN if [ "$INSTALL_PADDLEOCR" = "true" ]; then \
        pip install -r requirements/paddleocr.txt; \
    fi

RUN if [ "$INSTALL_SURYA" = "true" ]; then \
        pip install -r requirements/surya.txt; \
    fi

RUN if [ "$INSTALL_EASYOCR" = "true" ]; then \
        pip install -r requirements/easyocr.txt; \
    fi

# Tesseract is installed via apt, just need pytesseract
RUN pip install -r requirements/tesseract.txt

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /app/input /app/output

# Volumes for input/output
VOLUME ["/app/input", "/app/output"]

# Default command
ENTRYPOINT ["python", "main.py"]
CMD ["--input", "/app/input", "--batch", "--output-dir", "/app/output"]
