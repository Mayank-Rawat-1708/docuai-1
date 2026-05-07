from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum, JSON, func
from sqlalchemy.orm import relationship
import enum
from app.core.database import Base


class FileType(str, enum.Enum):
    PDF = "pdf"
    AUDIO = "audio"
    VIDEO = "video"


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=False)
    file_type = Column(Enum(FileType), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String)
    file_path = Column(String, nullable=False)
    status = Column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)
    extracted_text = Column(Text)
    summary = Column(Text)
    duration_seconds = Column(Float)  # for audio/video
    transcription = Column(Text)  # for audio/video
    timestamps = Column(JSON)  # [{time: float, text: str, topic: str}]
    vector_id = Column(String)  # FAISS index id
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", backref="documents")
