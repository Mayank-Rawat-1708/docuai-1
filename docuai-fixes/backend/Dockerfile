# FIX: backend/Dockerfile — Render-compatible
# Changes vs original:
#   1. Runs `alembic upgrade head` BEFORE starting uvicorn
#      (ensures DB tables exist on every cold start)
#   2. Creates /app/uploads and /app/vector_store dirs
#      (safe to pre-create; Render Persistent Disk will overlay these)
#   3. Runs as non-root user (security best practice)

FROM python:3.11-slim

# System deps for PyPDF2, pdfminer, faiss-cpu, Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Deps layer (cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Pre-create storage directories
# On Render, mount a Persistent Disk at /app/uploads and /app/vector_store
RUN mkdir -p /app/uploads /app/vector_store

# Non-root user
RUN useradd -m -u 1001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# FIX: Run migrations first, then start the server
# This ensures tables exist after every Render deploy / cold start
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2"]
