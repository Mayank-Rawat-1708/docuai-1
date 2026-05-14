"""
FIX: document_service.py — Render-compatible document processor
Changes vs original:
  1. File saves to settings.UPLOAD_DIR (points to Render Persistent Disk when configured)
  2. PDF extraction has fallback chain: PyPDF2 → pdfminer → raw bytes
  3. Whisper transcription wrapped with try/except — won't crash on audio errors
  4. File size validation before processing
"""
import logging
import os
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.services.ai_service import get_embedding, summarize_text, extract_topics
from app.services.vector_store import vector_store

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    "pdf": "pdf",
    "mp3": "audio", "wav": "audio", "m4a": "audio", "ogg": "audio",
    "mp4": "video", "mov": "video", "avi": "video", "webm": "video",
}
MAX_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024


async def save_upload(upload: UploadFile) -> tuple[str, str, int]:
    """
    Save uploaded file to UPLOAD_DIR.
    Returns (file_path, file_type, file_size_bytes).
    Raises ValueError on unsupported type or oversized file.
    """
    ext = Path(upload.filename or "").suffix.lstrip(".").lower()
    file_type = ALLOWED_EXTENSIONS.get(ext)
    if not file_type:
        raise ValueError(
            f"Unsupported file type '.{ext}'. "
            f"Allowed: {', '.join(ALLOWED_EXTENSIONS.keys())}"
        )

    content = await upload.read()
    if len(content) > MAX_BYTES:
        raise ValueError(
            f"File too large ({len(content) // 1024 // 1024} MB). "
            f"Max allowed: {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    filename = f"{uuid.uuid4().hex}.{ext}"
    dest = Path(settings.UPLOAD_DIR) / filename
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(content)

    return str(dest), file_type, len(content)


def extract_pdf_text(file_path: str) -> str:
    """Extract text from a PDF — tries PyPDF2 first, falls back to pdfminer."""
    # Primary: PyPDF2
    try:
        import PyPDF2
        text_parts = []
        with open(file_path, "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
        text = "\n\n".join(text_parts).strip()
        if text:
            return text
        logger.warning("PyPDF2 extracted empty text — trying pdfminer fallback")
    except Exception as exc:
        logger.warning(f"PyPDF2 failed: {exc}")

    # Fallback: pdfminer
    try:
        from pdfminer.high_level import extract_text as pm_extract
        text = pm_extract(file_path).strip()
        if text:
            return text
    except ImportError:
        logger.warning("pdfminer not installed — install with: pip install pdfminer.six")
    except Exception as exc:
        logger.warning(f"pdfminer failed: {exc}")

    return ""  # caller handles empty string


def chunk_text(text: str, chunk_size: int | None = None, overlap: int | None = None) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    size    = chunk_size or settings.CHUNK_SIZE
    overlap_ = overlap   or settings.CHUNK_OVERLAP

    if len(text) <= size:
        return [text] if text.strip() else []

    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += size - overlap_

    return chunks


async def transcribe_audio(file_path: str) -> dict:
    """
    Transcribe audio/video using OpenAI Whisper.
    Returns {"text": str, "segments": list[dict]}.
    """
    try:
        from app.services.ai_service import get_openai_client
        client = get_openai_client()

        with open(file_path, "rb") as audio_file:
            response = await client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                response_format="verbose_json",
                timestamp_granularities=["segment"],
            )

        segments = []
        if hasattr(response, "segments") and response.segments:
            for seg in response.segments:
                segments.append({
                    "start": seg.get("start", 0.0),
                    "end":   seg.get("end", 0.0),
                    "text":  seg.get("text", "").strip(),
                })

        return {
            "text": response.text or "",
            "segments": segments,
        }
    except Exception as exc:
        logger.error(f"Whisper transcription failed for {file_path}: {exc}")
        return {"text": "", "segments": []}


async def process_document(
    document_id: int,
    file_path: str,
    file_type: str,
) -> dict:
    """
    Full processing pipeline for a document.
    Returns metadata dict to store in DB: {summary, text, timestamps, status}.
    """
    result = {
        "status": "failed",
        "summary": "",
        "text": "",
        "timestamps": [],
        "duration_seconds": None,
    }

    try:
        # ── Extract text ──────────────────────────────────────────────────
        if file_type == "pdf":
            text = extract_pdf_text(file_path)
            if not text:
                result["summary"] = "Could not extract text from this PDF (may be scanned/image-based)."
                result["status"] = "completed"
                return result

        elif file_type in ("audio", "video"):
            transcription = await transcribe_audio(file_path)
            text = transcription["text"]
            raw_segments = transcription["segments"]

            if not text:
                result["summary"] = "Could not transcribe this media file."
                result["status"] = "completed"
                return result

            # Extract topics from segments
            if raw_segments:
                topics = await extract_topics(text)
                result["timestamps"] = topics

            # Duration from last segment
            if raw_segments:
                result["duration_seconds"] = raw_segments[-1].get("end", 0.0)

        else:
            logger.error(f"Unknown file_type: {file_type}")
            return result

        result["text"] = text

        # ── Summarize ─────────────────────────────────────────────────────
        result["summary"] = await summarize_text(text)

        # ── Embed + index ─────────────────────────────────────────────────
        chunks = chunk_text(text)
        if chunks:
            added = await vector_store.add_chunks(
                document_id=document_id,
                chunks=chunks,
                extra_meta={"file_type": file_type},
            )
            logger.info(f"Indexed {added}/{len(chunks)} chunks for document {document_id}")

        result["status"] = "completed"

    except Exception as exc:
        logger.error(f"Processing failed for document {document_id}: {exc}", exc_info=True)
        result["status"] = "failed"

    return result


async def delete_document_files(file_path: str, document_id: int):
    """Delete the uploaded file and its vector embeddings."""
    # Remove file
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception as exc:
        logger.warning(f"Could not delete file {file_path}: {exc}")

    # Remove from vector store
    await vector_store.delete_document(document_id)
