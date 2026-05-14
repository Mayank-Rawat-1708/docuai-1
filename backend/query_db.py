import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.document import Document

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Document))
        docs = result.scalars().all()
        for doc in docs:
            print(f"ID: {doc.id}, User: {doc.user_id}, Filename: {doc.filename}, Status: {doc.status}")

asyncio.run(main())
