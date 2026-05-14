"""
FIX: config.py — Render-compatible settings
Changes vs original:
  1. CORS_ORIGINS now reads from env var (supports Render frontend URL)
  2. Redis is optional — app won't crash if Redis is absent
  3. UPLOAD_DIR / VECTOR_STORE_DIR configurable for Render Persistent Disk
  4. All secrets read from env, never hardcoded
"""
import json
import os
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────
    APP_NAME: str = "DocuAI"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production-32chars-minimum!!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 h

    # ── Database ─────────────────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://docuai:docuai_pass@localhost:5432/docuai"

    # ── Redis (OPTIONAL — app works without it) ───────────────────────────
    # Set REDIS_ENABLED=false in Render env if you have no Redis instance.
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_ENABLED: bool = True          # ← set false in Render if no Redis

    # ── OpenAI ───────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""            # REQUIRED — set in Render env vars
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── CORS ─────────────────────────────────────────────────────────────
    # FIX: read from env so Render URLs are included without rebuilding
    # In Render backend env vars set:
    #   CORS_ORIGINS=["https://docuai-frontend.onrender.com"]
    # or for quick testing:
    #   CORS_ORIGINS=["*"]
    CORS_ORIGINS_JSON: str = (
        '["http://localhost:3000","http://localhost:80","http://localhost:5173"]'
    )

    @property
    def CORS_ORIGINS(self) -> List[str]:
        """Parse CORS_ORIGINS_JSON env var into a list."""
        try:
            origins = json.loads(self.CORS_ORIGINS_JSON)
            if isinstance(origins, list):
                return origins
        except (json.JSONDecodeError, TypeError):
            pass
        # fallback — split on comma if someone passed a plain comma-sep string
        return [o.strip() for o in self.CORS_ORIGINS_JSON.split(",") if o.strip()]

    # ── File Storage ──────────────────────────────────────────────────────
    # On Render add a Persistent Disk mounted at /data
    # then set UPLOAD_DIR=/data/uploads  VECTOR_STORE_DIR=/data/vector_store
    UPLOAD_DIR: str = "./uploads"
    VECTOR_STORE_DIR: str = "./vector_store"
    MAX_UPLOAD_SIZE_MB: int = 100

    # ── Misc ─────────────────────────────────────────────────────────────
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 200
    MAX_SEARCH_RESULTS: int = 5


settings = Settings()

# Create storage dirs on startup (safe on Render Persistent Disk)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.VECTOR_STORE_DIR, exist_ok=True)
