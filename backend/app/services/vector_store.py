"""
FIX: vector_store.py — persistent FAISS vector store
Changes vs original:
  1. Index path uses settings.VECTOR_STORE_DIR (configurable for Render Persistent Disk)
  2. save() called after every add/delete — survives Render cold restarts
  3. load() at startup — restores index from disk after a restart
  4. Thread-safe with asyncio.Lock
"""
import asyncio
import json
import logging
import os
import pickle
from pathlib import Path
from typing import Optional

import numpy as np

from app.core.config import settings
from app.services.ai_service import get_embedding

logger = logging.getLogger(__name__)

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    logger.error("faiss-cpu not installed! Run: pip install faiss-cpu")
    FAISS_AVAILABLE = False

DIMENSION = 1536  # text-embedding-3-small output dimension
INDEX_PATH = Path(settings.VECTOR_STORE_DIR) / "faiss.index"
META_PATH  = Path(settings.VECTOR_STORE_DIR) / "metadata.pkl"

_lock = asyncio.Lock()


class VectorStore:
    def __init__(self):
        self.index: Optional["faiss.IndexFlatIP"] = None
        self.metadata: list[dict] = []   # parallel to FAISS internal IDs
        self._load()

    def _load(self):
        """Load index + metadata from disk (called at startup)."""
        if not FAISS_AVAILABLE:
            return
        if INDEX_PATH.exists() and META_PATH.exists():
            try:
                self.index = faiss.read_index(str(INDEX_PATH))
                with open(META_PATH, "rb") as f:
                    self.metadata = pickle.load(f)
                logger.info(
                    f"Loaded FAISS index with {self.index.ntotal} vectors from disk"
                )
                return
            except Exception as exc:
                logger.warning(f"Failed to load FAISS index from disk: {exc}. Starting fresh.")
        # Fresh index
        self.index = faiss.IndexFlatIP(DIMENSION)  # inner-product (cosine after normalize)
        self.metadata = []
        logger.info("Created new FAISS index")

    def _save(self):
        """Persist index + metadata to disk."""
        if not FAISS_AVAILABLE or self.index is None:
            return
        try:
            os.makedirs(settings.VECTOR_STORE_DIR, exist_ok=True)
            faiss.write_index(self.index, str(INDEX_PATH))
            with open(META_PATH, "wb") as f:
                pickle.dump(self.metadata, f)
        except Exception as exc:
            logger.error(f"Failed to save FAISS index to disk: {exc}")

    async def add_chunks(
        self,
        document_id: int,
        chunks: list[str],
        extra_meta: dict | None = None,
    ) -> int:
        """Embed and add text chunks to the index. Returns number added."""
        if not FAISS_AVAILABLE or not chunks:
            return 0

        vectors = []
        metas = []
        for i, chunk in enumerate(chunks):
            try:
                embedding = await get_embedding(chunk)
                vec = np.array(embedding, dtype=np.float32)
                # Normalize for cosine similarity via inner product
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec /= norm
                vectors.append(vec)
                metas.append({
                    "document_id": document_id,
                    "chunk_index": i,
                    "text": chunk,
                    **(extra_meta or {}),
                })
            except Exception as exc:
                logger.warning(f"Failed to embed chunk {i} for doc {document_id}: {exc}")

        if not vectors:
            return 0

        matrix = np.stack(vectors)
        async with _lock:
            self.index.add(matrix)
            self.metadata.extend(metas)
            self._save()   # FIX: persist immediately

        return len(vectors)

    async def search(
        self,
        query: str,
        document_ids: list[int] | None = None,
        top_k: int | None = None,
    ) -> list[dict]:
        """Semantic search. Optionally filter by document_ids."""
        if not FAISS_AVAILABLE or self.index is None or self.index.ntotal == 0:
            return []

        k = top_k or settings.MAX_SEARCH_RESULTS

        try:
            embedding = await get_embedding(query)
            vec = np.array(embedding, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec /= norm
            query_matrix = vec.reshape(1, -1)
        except Exception as exc:
            logger.error(f"Failed to embed search query: {exc}")
            return []

        async with _lock:
            search_k = min(self.index.ntotal, k * 5 if document_ids else k)
            scores, indices = self.index.search(query_matrix, search_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.metadata):
                continue
            meta = self.metadata[idx]
            if document_ids and meta["document_id"] not in document_ids:
                continue
            results.append({**meta, "score": float(score)})
            if len(results) >= k:
                break

        return results

    async def delete_document(self, document_id: int):
        """Remove all chunks for a document. Rebuilds the index."""
        if not FAISS_AVAILABLE or self.index is None:
            return

        async with _lock:
            keep_vecs = []
            keep_meta = []
            removed = 0

            # We need to re-extract vectors for kept entries
            # FAISS IndexFlatIP doesn't support selective deletion,
            # so we rebuild from scratch keeping non-target entries.
            new_index = faiss.IndexFlatIP(DIMENSION)

            for i, meta in enumerate(self.metadata):
                if meta["document_id"] == document_id:
                    removed += 1
                    continue
                # Reconstruct vector from index
                vec = self.index.reconstruct(i)
                keep_vecs.append(vec)
                keep_meta.append(meta)

            if keep_vecs:
                matrix = np.stack(keep_vecs)
                new_index.add(matrix)

            self.index = new_index
            self.metadata = keep_meta
            self._save()
            logger.info(f"Deleted {removed} chunks for document {document_id}")


# Singleton — shared across requests
vector_store = VectorStore()
