from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import os
import mimetypes

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.document import Document, FileType, ProcessingStatus
from app.services.document_service import save_upload, process_document
from app.core.config import settings

router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf": FileType.PDF,
    ".mp3": FileType.AUDIO,
    ".wav": FileType.AUDIO,
    ".m4a": FileType.AUDIO,
    ".ogg": FileType.AUDIO,
    ".mp4": FileType.VIDEO,
    ".mov": FileType.VIDEO,
    ".avi": FileType.VIDEO,
    ".webm": FileType.VIDEO,
    ".mkv": FileType.VIDEO,
}


async def process_document_background(document_id: int, file_path: str, file_type: str, filename: str):
    """Background task for document processing."""
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        doc = await db.get(Document, document_id)
        if not doc:
            return
        
        doc.status = ProcessingStatus.PROCESSING
        await db.commit()
        
        try:
            result = await process_document(document_id, file_path, file_type.value)
            
            doc.status = ProcessingStatus(result["status"]) if result["status"] in ["completed", "failed"] else ProcessingStatus.COMPLETED
            doc.extracted_text = result.get("extracted_text")
            doc.summary = result.get("summary")
            doc.transcription = result.get("transcription")
            doc.timestamps = result.get("timestamps")
            doc.duration_seconds = result.get("duration_seconds")
            doc.error_message = result.get("error")
            await db.commit()
        except Exception as e:
            doc.status = ProcessingStatus.FAILED
            doc.error_message = str(e)
            await db.commit()


def document_to_dict(doc: Document) -> dict:
    return {
        "id": doc.id,
        "filename": doc.original_filename,
        "file_type": doc.file_type.value if doc.file_type else None,
        "file_size": doc.file_size,
        "status": doc.status.value if doc.status else None,
        "summary": doc.summary,
        "duration_seconds": doc.duration_seconds,
        "timestamps": doc.timestamps,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }


@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate file
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")
    
    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File too large. Max size: {settings.MAX_FILE_SIZE_MB}MB")
    
    # We must seek to 0 because we just read it
    await file.seek(0)
    
    file_path, file_type_str, file_size = await save_upload(file)
    file_type_enum = FileType(file_type_str)
    
    doc = Document(
        user_id=current_user.id,
        filename=os.path.basename(file_path),
        original_filename=file.filename,
        file_type=file_type_enum,
        file_size=file_size,
        mime_type=file.content_type,
        file_path=file_path,
        status=ProcessingStatus.PENDING,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    
    background_tasks.add_task(
        process_document_background,
        doc.id, file_path, file_type_str, file.filename
    )
    
    return {"message": "Document uploaded successfully", "document": document_to_dict(doc)}


@router.get("/")
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return [document_to_dict(d) for d in docs]


@router.get("/{document_id}")
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    return document_to_dict(doc)


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file
    if os.path.exists(doc.file_path):
        os.remove(doc.file_path)
    
    await db.delete(doc)
    await db.commit()
    return {"message": "Document deleted"}


@router.get("/{document_id}/stream")
async def stream_media(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await db.get(Document, document_id)
    if not doc or doc.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Document not found")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(doc.file_path, media_type=doc.mime_type or "application/octet-stream")
