# Image worker thường: PDF (qua Stirling-PDF, Gotenberg), ảnh (Pillow), video/âm thanh (FFmpeg).
FROM python:3.12-slim

# FFmpeg: video, âm thanh.  libgxps-utils (xpstopdf): XPS sang PDF.  djvulibre-bin (ddjvu): DjVu sang PDF.
# rawtherapee (rawtherapee-cli) + libimage-exiftool-perl (exiftool): rửa ảnh RAW (WORKER_PROFILE=photo).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgxps-utils djvulibre-bin \
       rawtherapee libimage-exiftool-perl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

ENV WORKER_PROFILE=main \
    PYTHONUNBUFFERED=1
CMD ["python", "main.py"]
