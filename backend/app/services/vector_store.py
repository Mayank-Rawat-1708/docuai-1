import faiss
import numpy as np
import json
import os
import asyncio
from typing import List, Optional, Tuple
from app.core.config import settings
from app.services.ai_service import get_embedding
import logging
import pickle

logger = logging.getLogger(__name__)

INDEX_PATH = os.path.join(settings.VECTOR_STORE_PATH, "faiss.index")
METADATA_PATH = os.path.join(settings.VECTOR_STORE_PATH, "metadata.pkl")

_index: Optional[faiss.Index] = None
_metadata: List[dict] = []
_lock = asyncio.Lock()

EMBEDDING_DIM = 1536  # text-embedding-3-small


def _load_or_create_index():
    global _index, _metadata
    if os.path.exists(INDEX_PATH) and os.path.exists(METADATA_PATH):
        try:
            _index = faiss.read_index(INDEX_PATH)
            with open(METADATA_PATH, "rb") as f:
                _metadata = pickle.load(f)
            logger.info(f"Loaded FAISS index with {_index.ntotal} vectors")
        except Exception as e:
            logger.error(f"Failed to load index: {e}")
            _index = faiss.IndexFlatL2(EMBEDDING_DIM)
            _metadata = []
    else:
        _index = faiss.IndexFlatL2(EMBEDDING_DIM)
        _metadata = []


def _save_index():
    faiss.write_index(_index, INDEX_PATH)
    with open(METADATA_PATH, "wb") as f:
        pickle.dump(_metadata, f)


def get_index():
    global _index
    if _index is None:
        _load_or_create_index()
    return _index


async def add_chunks(document_id: int, chunks: List[dict]) -> int:
    """Add text chunks to the vector store. Returns number of chunks added."""
    global _metadata
    async with _lock:
        index = get_index()
        embeddings = []
        valid_chunks = []
        
        for chunk in chunks:
            try:
                embedding = await get_embedding(chunk["text"])
                embeddings.append(embedding)
                valid_chunks.append(chunk)
            except Exception as e:
                logger.error(f"Failed to embed chunk: {e}")
        
        if not embeddings:
            return 0
        
        vectors = np.array(embeddings, dtype=np.float32)
        start_id = index.ntotal
        index.add(vectors)
        
        for i, chunk in enumerate(valid_chunks):
            _metadata.append({
                "id": start_id + i,
                "document_id": document_id,
                "text": chunk["text"],
                "source": chunk.get("source", ""),
                "page": chunk.get("page"),
                "timestamp": chunk.get("timestamp"),
                "end_time": chunk.get("end_time"),
            })
        
        _save_index()
        logger.info(f"Added {len(valid_chunks)} chunks for document {document_id}")
        return len(valid_chunks)


async def search(
    query: str,
    document_ids: Optional[List[int]] = None,
    top_k: int = 8,
) -> List[dict]:
    """Search for relevant chunks."""
    index = get_index()
    if index.ntotal == 0:
        return []
    
    try:
        query_embedding = await get_embedding(query)
        query_vector = np.array([query_embedding], dtype=np.float32)
        
        distances, indices = index.search(query_vector, min(top_k * 3, index.ntotal))
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(_metadata):
                continue
            meta = _metadata[idx]
            if document_ids and meta["document_id"] not in document_ids:
                continue
            results.append({**meta, "score": float(1 / (1 + dist))})
            if len(results) >= top_k:
                break
        
        return results
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []


async def delete_document_chunks(document_id: int):
    """Remove chunks for a document (marks as deleted in metadata)."""
    global _metadata
    async with _lock:
        _metadata = [m for m in _metadata if m["document_id"] != document_id]
        _save_index()
