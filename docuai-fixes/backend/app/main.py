"""
FIX: main.py — Render-compatible FastAPI entry point
Changes vs original:
  1. CORS middleware uses settings.CORS_ORIGINS (reads from env)
  2. Redis connection is optional — startup won't crash if Redis is down
  3. DB migration check on startup (warns if tables missing)
  4. Proper lifespan context manager instead of deprecated on_event
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api import auth, chat, documents, health, media
from app.core.config import settings
from app.core.database import engine, Base

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────
    logger.info("Starting DocuAI backend…")

    # 1. Create DB tables (idempotent — Alembic should run first in prod,
    #    but this is a safe fallback so the app doesn't crash on cold start)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables OK")
    except Exception as exc:
        logger.error(f"DB init error: {exc}")
        # don't crash — let individual requests surface the real error

    # 2. Redis — optional
    if settings.REDIS_ENABLED:
        try:
            import redis.asyncio as aioredis
            redis_client = aioredis.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
            await redis_client.ping()
            app.state.redis = redis_client
            logger.info("Redis connected")
        except Exception as exc:
            logger.warning(
                f"Redis unavailable ({exc}). Running without cache/rate-limiting."
            )
            app.state.redis = None
    else:
        logger.info("Redis disabled via REDIS_ENABLED=false")
        app.state.redis = None

    yield

    # ── Shutdown ─────────────────────────────────────────────────────────
    if getattr(app.state, "redis", None):
        await app.state.redis.close()
    await engine.dispose()
    logger.info("DocuAI backend shut down cleanly")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,   # hide Swagger in prod
    redoc_url="/redoc" if settings.DEBUG else None,
)

# ── Middleware ────────────────────────────────────────────────────────────────

# FIX: CORS uses env-driven list — not hardcoded localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router,     prefix="/api/v1",           tags=["health"])
app.include_router(auth.router,       prefix="/api/v1/auth",      tags=["auth"])
app.include_router(documents.router,  prefix="/api/v1/documents", tags=["documents"])
app.include_router(chat.router,       prefix="/api/v1/chat",      tags=["chat"])
app.include_router(media.router,      prefix="/api/v1/media",     tags=["media"])


@app.get("/")
async def root():
    return {"message": f"{settings.APP_NAME} API is running"}
