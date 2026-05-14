from fastapi import APIRouter
from app.core.config import settings

@router.get("/debug-db")
async def get_db_url():
    return {"url": settings.DATABASE_URL}
