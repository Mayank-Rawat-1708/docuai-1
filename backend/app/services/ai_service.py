import openai
from typing import AsyncGenerator, List, Optional
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)


async def get_chat_completion(
    messages: List[dict],
    stream: bool = False,
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    """Get a chat completion from OpenAI."""
    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=False,
    )
    return response.choices[0].message.content


async def stream_chat_completion(
    messages: List[dict],
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> AsyncGenerator[str, None]:
    """Stream a chat completion from OpenAI."""
    stream = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content


async def transcribe_audio(file_path: str) -> dict:
    """Transcribe audio file using Whisper with timestamps."""
    with open(file_path, "rb") as audio_file:
        response = await client.audio.transcriptions.create(
            model=settings.WHISPER_MODEL,
            file=audio_file,
            response_format="verbose_json",
            timestamp_granularities=["segment", "word"],
        )
    segments = []
    if hasattr(response, "segments") and response.segments:
        for seg in response.segments:
            segments.append({
                "start": seg.get("start", 0),
                "end": seg.get("end", 0),
                "text": seg.get("text", "").strip(),
            })
    return {
        "text": response.text,
        "segments": segments,
        "language": getattr(response, "language", "en"),
    }


async def get_embedding(text: str) -> List[float]:
    """Get text embedding from OpenAI."""
    response = await client.embeddings.create(
        model=settings.EMBEDDING_MODEL,
        input=text[:8000],  # truncate to avoid token limit
    )
    return response.data[0].embedding


async def summarize_content(text: str, content_type: str = "document") -> str:
    """Generate a summary of content."""
    prompt = f"""You are an expert summarizer. Summarize the following {content_type} content concisely but comprehensively. 
Include:
- Main topics covered
- Key points and findings  
- Important details

Content:
{text[:12000]}

Provide a well-structured summary in 3-5 paragraphs."""

    messages = [
        {"role": "system", "content": "You are a helpful AI assistant specialized in summarizing documents."},
        {"role": "user", "content": prompt},
    ]
    return await get_chat_completion(messages, max_tokens=1000)


async def extract_topics_from_segments(segments: List[dict]) -> List[dict]:
    """Extract topic labels from transcript segments."""
    if not segments:
        return []
    
    # Batch segments into groups
    segment_text = "\n".join([
        f"[{seg['start']:.1f}s - {seg['end']:.1f}s]: {seg['text']}"
        for seg in segments[:50]  # limit to first 50 segments
    ])
    
    prompt = f"""Analyze these transcript segments and identify the main topics discussed at each time range.
For each segment or group of segments on the same topic, provide:
- start_time (seconds)
- end_time (seconds)  
- topic (short label, max 5 words)

Transcript segments:
{segment_text}

Respond in JSON format as an array: [{{"start_time": 0.0, "end_time": 10.0, "topic": "Introduction"}}]
Only return the JSON array, no other text."""

    messages = [
        {"role": "system", "content": "You are an expert at analyzing transcripts and identifying topics. Always respond with valid JSON."},
        {"role": "user", "content": prompt},
    ]
    
    result = await get_chat_completion(messages, temperature=0.3)
    
    import json
    try:
        # Clean up the response
        result = result.strip()
        if result.startswith("```"):
            result = result.split("```")[1]
            if result.startswith("json"):
                result = result[4:]
        return json.loads(result)
    except Exception as e:
        logger.error(f"Failed to parse topics JSON: {e}")
        return []


async def answer_question_with_context(
    question: str,
    context_chunks: List[dict],
    session_history: Optional[List[dict]] = None,
) -> dict:
    """Answer a question using provided context chunks."""
    context_text = "\n\n---\n\n".join([
        f"Source: {chunk.get('source', 'Unknown')}\n{chunk.get('text', '')}"
        for chunk in context_chunks
    ])
    
    system_prompt = """You are DocuAI, an intelligent assistant that answers questions based on uploaded documents, audio, and video content.

Rules:
1. Answer ONLY based on the provided context
2. If the answer is not in the context, say so clearly
3. Cite your sources (document name, page, or timestamp)
4. For audio/video questions, mention relevant timestamps
5. Be concise but thorough
6. Format responses with markdown for readability"""

    messages = [{"role": "system", "content": system_prompt}]
    
    if session_history:
        messages.extend(session_history[-6:])  # last 3 exchanges
    
    messages.append({
        "role": "user",
        "content": f"""Context from uploaded files:
{context_text}

Question: {question}

Please answer based on the context above. Include relevant timestamps if available."""
    })
    
    answer = await get_chat_completion(messages, temperature=0.5)
    
    # Extract relevant timestamps from context
    relevant_timestamps = []
    for chunk in context_chunks:
        if chunk.get("timestamp") is not None:
            relevant_timestamps.append({
                "document_id": chunk.get("document_id"),
                "start_time": chunk.get("timestamp"),
                "end_time": chunk.get("end_time"),
                "text": chunk.get("text", "")[:200],
            })
    
    return {
        "answer": answer,
        "sources": [{"document_id": c.get("document_id"), "source": c.get("source")} for c in context_chunks],
        "relevant_timestamps": relevant_timestamps[:5],
    }
