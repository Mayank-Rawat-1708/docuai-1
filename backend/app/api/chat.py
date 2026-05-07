from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
import json

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.message import ChatSession, Message, MessageRole
from app.models.document import Document
from app.services.ai_service import stream_chat_completion, answer_question_with_context
from app.services.vector_store import search

router = APIRouter()


class CreateSessionRequest(BaseModel):
    title: Optional[str] = "New Chat"
    document_ids: Optional[List[int]] = []


class SendMessageRequest(BaseModel):
    content: str
    stream: bool = True


def message_to_dict(msg: Message) -> dict:
    return {
        "id": msg.id,
        "role": msg.role.value,
        "content": msg.content,
        "sources": msg.sources,
        "relevant_timestamps": msg.relevant_timestamps,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


@router.post("/sessions")
async def create_session(
    data: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate document IDs belong to user
    for doc_id in (data.document_ids or []):
        doc = await db.get(Document, doc_id)
        if not doc or doc.user_id != current_user.id:
            raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")
    
    session = ChatSession(
        user_id=current_user.id,
        title=data.title,
        document_ids=data.document_ids or [],
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    
    return {
        "id": session.id,
        "title": session.title,
        "document_ids": session.document_ids,
        "created_at": session.created_at.isoformat(),
        "messages": [],
    }


@router.get("/sessions")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(ChatSession.updated_at.desc().nullslast(), ChatSession.created_at.desc())
    )
    sessions = result.scalars().all()
    return [
        {
            "id": s.id,
            "title": s.title,
            "document_ids": s.document_ids,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "id": session.id,
        "title": session.title,
        "document_ids": session.document_ids,
        "created_at": session.created_at.isoformat(),
        "messages": [message_to_dict(m) for m in session.messages],
    }


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: int,
    data: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Save user message
    user_msg = Message(
        session_id=session_id,
        role=MessageRole.USER,
        content=data.content,
    )
    db.add(user_msg)
    await db.commit()
    
    # Search for relevant context
    context_chunks = await search(
        data.content,
        document_ids=session.document_ids if session.document_ids else None,
        top_k=8,
    )
    
    if data.stream:
        async def generate():
            # Build messages for LLM
            context_text = "\n\n---\n\n".join([
                f"Source: {c.get('source', 'doc')}\n{c.get('text', '')}"
                for c in context_chunks
            ])
            
            history = [message_to_dict(m) for m in session.messages[-6:]]
            
            system_prompt = """You are DocuAI, an intelligent assistant that answers questions based on uploaded documents, audio, and video content.
Answer based on the provided context. If the answer isn't in the context, say so clearly.
Cite sources and mention timestamps for audio/video content. Use markdown formatting."""
            
            messages = [{"role": "system", "content": system_prompt}]
            for h in history:
                messages.append({"role": h["role"], "content": h["content"]})
            
            messages.append({
                "role": "user",
                "content": f"Context:\n{context_text}\n\nQuestion: {data.content}"
            })
            
            full_response = ""
            async for chunk in stream_chat_completion(messages):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
            
            # Save assistant message
            relevant_timestamps = [
                {"document_id": c.get("document_id"), "start_time": c.get("timestamp"),
                 "end_time": c.get("end_time"), "text": c.get("text", "")[:200]}
                for c in context_chunks if c.get("timestamp") is not None
            ][:5]
            
            async with db.begin():
                assistant_msg = Message(
                    session_id=session_id,
                    role=MessageRole.ASSISTANT,
                    content=full_response,
                    sources=[{"document_id": c.get("document_id"), "source": c.get("source")} for c in context_chunks],
                    relevant_timestamps=relevant_timestamps,
                )
                db.add(assistant_msg)
            
            yield f"data: {json.dumps({'type': 'done', 'timestamps': relevant_timestamps})}\n\n"
        
        return StreamingResponse(generate(), media_type="text/event-stream")
    
    # Non-streaming
    result = await answer_question_with_context(
        data.content,
        context_chunks,
        session_history=[message_to_dict(m) for m in session.messages[-6:]],
    )
    
    assistant_msg = Message(
        session_id=session_id,
        role=MessageRole.ASSISTANT,
        content=result["answer"],
        sources=result["sources"],
        relevant_timestamps=result["relevant_timestamps"],
    )
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(assistant_msg)
    
    return message_to_dict(assistant_msg)


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await db.get(ChatSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.delete(session)
    await db.commit()
    return {"message": "Session deleted"}
