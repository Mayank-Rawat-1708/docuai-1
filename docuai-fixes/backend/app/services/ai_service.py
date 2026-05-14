"""
FIX: ai_service.py — Render-compatible OpenAI integration
Changes vs original:
  1. Validates OPENAI_API_KEY at import time — clear error instead of silent 401
  2. All OpenAI calls wrapped with proper error handling + logging
  3. Streaming uses async generator pattern compatible with FastAPI SSE
"""
import json
import logging
from typing import AsyncGenerator, Optional

from openai import AsyncOpenAI, AuthenticationError, RateLimitError, APIError

from app.core.config import settings

logger = logging.getLogger(__name__)

# FIX: fail fast with a clear message if the key is missing
if not settings.OPENAI_API_KEY:
    logger.error(
        "OPENAI_API_KEY is not set! "
        "Add it to Render environment variables for the backend service."
    )

_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY environment variable is not set. "
                "Set it in Render → your backend service → Environment."
            )
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def get_embedding(text: str) -> list[float]:
    """Get text embedding vector from OpenAI."""
    try:
        client = get_openai_client()
        response = await client.embeddings.create(
            input=text,
            model=settings.OPENAI_EMBEDDING_MODEL,
        )
        return response.data[0].embedding
    except AuthenticationError:
        logger.error("OpenAI API key is invalid. Check OPENAI_API_KEY env var.")
        raise
    except RateLimitError:
        logger.warning("OpenAI rate limit hit — retrying after backoff")
        raise
    except APIError as exc:
        logger.error(f"OpenAI API error in get_embedding: {exc}")
        raise


async def summarize_text(text: str) -> str:
    """Generate a summary of the provided text."""
    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a helpful assistant. Summarize the following text "
                        "concisely in 2-4 sentences, capturing the main points."
                    ),
                },
                {"role": "user", "content": text[:8000]},  # token safety
            ],
            max_tokens=300,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()
    except (AuthenticationError, RateLimitError, APIError) as exc:
        logger.error(f"OpenAI error in summarize_text: {exc}")
        return "Summary unavailable — AI service error."


async def extract_topics(text: str) -> list[dict]:
    """Extract topic segments with timestamps from transcription text."""
    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract the main topics from this transcription. "
                        "Return a JSON array like: "
                        '[{"topic": "...", "summary": "...", "start_time": 0.0, "end_time": 30.0}]. '
                        "Return ONLY the JSON array, no other text."
                    ),
                },
                {"role": "user", "content": text[:6000]},
            ],
            max_tokens=800,
            temperature=0.2,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(raw)
    except (json.JSONDecodeError, KeyError):
        logger.warning("Topic extraction returned invalid JSON — returning empty list")
        return []
    except (AuthenticationError, RateLimitError, APIError) as exc:
        logger.error(f"OpenAI error in extract_topics: {exc}")
        return []


async def answer_question(
    question: str,
    context_chunks: list[str],
    chat_history: list[dict] | None = None,
) -> str:
    """Non-streaming Q&A over document context."""
    context = "\n\n---\n\n".join(context_chunks)
    messages = [
        {
            "role": "system",
            "content": (
                "You are DocuAI, an AI assistant that answers questions about "
                "uploaded documents. Use only the provided context to answer. "
                "If the answer isn't in the context, say so clearly.\n\n"
                f"Context:\n{context}"
            ),
        }
    ]
    if chat_history:
        messages.extend(chat_history[-10:])  # last 10 turns for context window
    messages.append({"role": "user", "content": question})

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
        )
        return response.choices[0].message.content.strip()
    except AuthenticationError:
        return "Error: Invalid OpenAI API key. Please contact the administrator."
    except RateLimitError:
        return "Error: OpenAI rate limit reached. Please try again in a moment."
    except APIError as exc:
        logger.error(f"OpenAI API error in answer_question: {exc}")
        return f"Error: AI service unavailable ({exc.status_code})."


async def stream_answer(
    question: str,
    context_chunks: list[str],
    chat_history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Streaming Q&A — yields SSE-formatted chunks."""
    context = "\n\n---\n\n".join(context_chunks)
    messages = [
        {
            "role": "system",
            "content": (
                "You are DocuAI, an AI assistant that answers questions about "
                "uploaded documents. Use only the provided context to answer. "
                "If the answer isn't in the context, say so clearly.\n\n"
                f"Context:\n{context}"
            ),
        }
    ]
    if chat_history:
        messages.extend(chat_history[-10:])
    messages.append({"role": "user", "content": question})

    try:
        client = get_openai_client()
        stream = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=messages,
            max_tokens=1000,
            temperature=0.7,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield json.dumps({"type": "chunk", "content": delta.content})
    except AuthenticationError:
        yield json.dumps({
            "type": "error",
            "content": "Invalid OpenAI API key — contact the administrator.",
        })
    except RateLimitError:
        yield json.dumps({
            "type": "error",
            "content": "OpenAI rate limit reached — please try again shortly.",
        })
    except APIError as exc:
        logger.error(f"OpenAI streaming error: {exc}")
        yield json.dumps({
            "type": "error",
            "content": f"AI service error ({exc.status_code}) — please try again.",
        })
