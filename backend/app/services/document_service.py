import os
import uuid
import asyncio
from typing import List, Optional
from pathlib import Path
import PyPDF2
import io
from app.core.config import settings
from app.services.ai_service import transcribe_audio, summarize_content, extract_topics_from_segments, get_embedding
from app.services.vector_store import add_chunks
import logging

logger = logging.getLogger(__name__)


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks."""
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        
        # Try to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind(". ")
            if last_period > chunk_size // 2:
                chunk = text[start:start + last_period + 1]
                end = start + last_period + 1
        
        chunks.append(chunk.strip())
        start = end - overlap
    
    return [c for c in chunks if c]


async def extract_pdf_text(file_path: str) -> str:
    """Extract text from PDF file."""
    text_parts = []
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                text_parts.append(f"[Page {page_num + 1}]\n{text}")
    return "\n\n".join(text_parts)


async def process_pdf(document_id: int, file_path: str, filename: str) -> dict:
    """Process a PDF document: extract text, embed, summarize."""
    logger.info(f"Processing PDF: {filename}")
    
    # Extract text
    text = await asyncio.get_event_loop().run_in_executor(
        None, lambda: extract_pdf_text_sync(file_path)
    )
    
    if not text.strip():
        return {"status": "failed", "error": "No text could be extracted from PDF"}
    
    # Generate summary
    summary = await summarize_content(text, "PDF document")
    
    # Create chunks and add to vector store
    chunks = chunk_text(text)
    chunk_dicts = [
        {"text": chunk, "source": filename, "page": None}
        for chunk in chunks
    ]
    await add_chunks(document_id, chunk_dicts)
    
    return {
        "status": "completed",
        "extracted_text": text,
        "summary": summary,
    }


def extract_pdf_text_sync(file_path: str) -> str:
    text_parts = []
    with open(file_path, "rb") as f:
        reader = PyPDF2.PdfReader(f)
        for page_num, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                text_parts.append(f"[Page {page_num + 1}]\n{text}")
    return "\n\n".join(text_parts)


async def process_audio_video(document_id: int, file_path: str, filename: str) -> dict:
    """Process audio/video: transcribe, extract timestamps, embed, summarize."""
    logger.info(f"Processing audio/video: {filename}")
    
    # Transcribe
    transcription_result = await transcribe_audio(file_path)
    text = transcription_result["text"]
    segments = transcription_result["segments"]
    
    if not text.strip():
        return {"status": "failed", "error": "Could not transcribe audio/video"}
    
    # Get duration
    duration = segments[-1]["end"] if segments else 0
    
    # Extract topics from segments
    topic_timestamps = await extract_topics_from_segments(segments)
    
    # Merge topics with segments
    enhanced_timestamps = []
    for seg in segments:
        topic = "General"
        for t in topic_timestamps:
            if t["start_time"] <= seg["start"] <= t["end_time"]:
                topic = t["topic"]
                break
        enhanced_timestamps.append({
            "start": seg["start"],
            "end": seg["end"],
            "text": seg["text"],
            "topic": topic,
        })
    
    # Generate summary
    summary = await summarize_content(text, "audio/video transcription")
    
    # Create chunks for vector store with timestamps
    chunk_dicts = []
    for seg in segments:
        if seg["text"].strip():
            chunk_dicts.append({
                "text": seg["text"],
                "source": filename,
                "timestamp": seg["start"],
                "end_time": seg["end"],
            })
    
    if chunk_dicts:
        await add_chunks(document_id, chunk_dicts)
    
    return {
        "status": "completed",
        "extracted_text": text,
        "transcription": text,
        "summary": summary,
        "timestamps": enhanced_timestamps,
        "duration_seconds": duration,
    }


async def save_uploaded_file(file_content: bytes, original_filename: str) -> str:
    """Save uploaded file and return path."""
    ext = Path(original_filename).suffix.lower()
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, unique_name)
    
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    return file_path, unique_name
