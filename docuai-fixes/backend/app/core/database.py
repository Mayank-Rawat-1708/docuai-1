"""
FIX: database.py — Render-compatible async SQLAlchemy setup
Changes vs original:
  1. Pool pre-ping enabled (handles Render DB sleeping on free tier)
  2. pool_recycle=300 — prevents stale connections after Render DB wakes up
  3. Explicit pool_size + max_overflow for the free tier's connection limits
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,      # FIX: re-validate connections (Render DB can sleep)
    pool_recycle=300,        # FIX: recycle connections every 5 min
    pool_size=5,             # safe for Render free-tier Postgres (25 conn limit)
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session and closes it after the request."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
