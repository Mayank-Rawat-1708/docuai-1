"""
Comprehensive test suite for DocuAI Backend
Covers: auth, documents, chat, services, vector store
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import StaticPool
import json
import io

from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_password_hash
from app.models.user import User
from app.models.document import Document, FileType, ProcessingStatus
from app.models.message import ChatSession, Message, MessageRole


# ─── Test Database Setup ───────────────────────────────────────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(test_engine, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def db_session():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db_session):
    user = User(
        email="test@example.com",
        username="testuser",
        hashed_password=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(client, test_user):
    response = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "password123",
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ─── Health Tests ──────────────────────────────────────────────────────────────
class TestHealth:
    async def test_health_check(self, client):
        r = await client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    async def test_root_endpoint(self, client):
        r = await client.get("/")
        assert r.status_code == 200
        assert "DocuAI" in r.json()["message"]


# ─── Auth Tests ────────────────────────────────────────────────────────────────
class TestAuth:
    async def test_register_success(self, client):
        r = await client.post("/api/v1/auth/register", json={
            "email": "new@example.com",
            "username": "newuser",
            "password": "password123",
        })
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "new@example.com"

    async def test_register_duplicate_email(self, client, test_user):
        r = await client.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "username": "other",
            "password": "password123",
        })
        assert r.status_code == 400
        assert "already registered" in r.json()["detail"]

    async def test_register_short_password(self, client):
        r = await client.post("/api/v1/auth/register", json={
            "email": "short@example.com",
            "username": "shortpass",
            "password": "123",
        })
        assert r.status_code == 400

    async def test_login_success(self, client, test_user):
        r = await client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "password123",
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_login_wrong_password(self, client, test_user):
        r = await client.post("/api/v1/auth/login", json={
            "email": "test@example.com",
            "password": "wrongpassword",
        })
        assert r.status_code == 401

    async def test_login_nonexistent_user(self, client):
        r = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "password123",
        })
        assert r.status_code == 401

    async def test_get_me(self, client, auth_headers):
        r = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["email"] == "test@example.com"

    async def test_get_me_no_token(self, client):
        r = await client.get("/api/v1/auth/me")
        assert r.status_code == 401

    async def test_get_me_invalid_token(self, client):
        r = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"})
        assert r.status_code == 401


# ─── Document Tests ────────────────────────────────────────────────────────────
class TestDocuments:
    async def test_list_documents_empty(self, client, auth_headers):
        r = await client.get("/api/v1/documents/", headers=auth_headers)
        assert r.status_code == 200
        assert r.json() == []

    async def test_upload_pdf(self, client, auth_headers):
        with patch("app.api.documents.process_document_background") as mock_bg:
            mock_bg.return_value = None
            pdf_content = b"%PDF-1.4 test content"
            r = await client.post(
                "/api/v1/documents/upload",
                headers=auth_headers,
                files={"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )
        assert r.status_code == 200
        data = r.json()
        assert data["document"]["filename"] == "test.pdf"

    async def test_upload_unsupported_type(self, client, auth_headers):
        r = await client.post(
            "/api/v1/documents/upload",
            headers=auth_headers,
            files={"file": ("test.txt", io.BytesIO(b"text"), "text/plain")},
        )
        assert r.status_code == 400
        assert "Unsupported" in r.json()["detail"]

    async def test_get_document(self, client, auth_headers, db_session, test_user):
        doc = Document(
            user_id=test_user.id,
            filename="stored.pdf",
            original_filename="original.pdf",
            file_type=FileType.PDF,
            file_path="/tmp/stored.pdf",
            status=ProcessingStatus.COMPLETED,
        )
        db_session.add(doc)
        await db_session.commit()
        await db_session.refresh(doc)

        r = await client.get(f"/api/v1/documents/{doc.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["filename"] == "original.pdf"

    async def test_get_document_not_found(self, client, auth_headers):
        r = await client.get("/api/v1/documents/9999", headers=auth_headers)
        assert r.status_code == 404

    async def test_delete_document(self, client, auth_headers, db_session, test_user):
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as f:
            f.write(b"test")
            tmp_path = f.name

        doc = Document(
            user_id=test_user.id,
            filename="del.pdf",
            original_filename="del.pdf",
            file_type=FileType.PDF,
            file_path=tmp_path,
            status=ProcessingStatus.COMPLETED,
        )
        db_session.add(doc)
        await db_session.commit()
        await db_session.refresh(doc)

        r = await client.delete(f"/api/v1/documents/{doc.id}", headers=auth_headers)
        assert r.status_code == 200

    async def test_list_documents_after_upload(self, client, auth_headers, db_session, test_user):
        doc = Document(
            user_id=test_user.id,
            filename="list_test.pdf",
            original_filename="list_test.pdf",
            file_type=FileType.PDF,
            file_path="/tmp/list_test.pdf",
            status=ProcessingStatus.COMPLETED,
        )
        db_session.add(doc)
        await db_session.commit()

        r = await client.get("/api/v1/documents/", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 1

    async def test_cannot_access_other_user_doc(self, client, db_session):
        other_user = User(
            email="other@example.com",
            username="otheruser",
            hashed_password=get_password_hash("password123"),
        )
        db_session.add(other_user)
        await db_session.commit()
        await db_session.refresh(other_user)

        doc = Document(
            user_id=other_user.id,
            filename="private.pdf",
            original_filename="private.pdf",
            file_type=FileType.PDF,
            file_path="/tmp/private.pdf",
            status=ProcessingStatus.COMPLETED,
        )
        db_session.add(doc)
        await db_session.commit()
        await db_session.refresh(doc)

        # Login as test_user
        r = await client.post("/api/v1/auth/register", json={
            "email": "test2@example.com", "username": "test2", "password": "password123"
        })
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = await client.get(f"/api/v1/documents/{doc.id}", headers=headers)
        assert r.status_code == 404


# ─── Chat Tests ────────────────────────────────────────────────────────────────
class TestChat:
    async def test_create_session(self, client, auth_headers):
        r = await client.post("/api/v1/chat/sessions", headers=auth_headers, json={
            "title": "Test Session",
            "document_ids": [],
        })
        assert r.status_code == 200
        assert r.json()["title"] == "Test Session"

    async def test_list_sessions(self, client, auth_headers):
        await client.post("/api/v1/chat/sessions", headers=auth_headers, json={"title": "S1"})
        await client.post("/api/v1/chat/sessions", headers=auth_headers, json={"title": "S2"})
        r = await client.get("/api/v1/chat/sessions", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()) == 2

    async def test_get_session(self, client, auth_headers):
        cr = await client.post("/api/v1/chat/sessions", headers=auth_headers, json={"title": "My Session"})
        session_id = cr.json()["id"]
        r = await client.get(f"/api/v1/chat/sessions/{session_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["title"] == "My Session"

    async def test_get_session_not_found(self, client, auth_headers):
        r = await client.get("/api/v1/chat/sessions/9999", headers=auth_headers)
        assert r.status_code == 404

    async def test_send_message_no_stream(self, client, auth_headers):
        cr = await client.post("/api/v1/chat/sessions", headers=auth_headers, json={})
        session_id = cr.json()["id"]

        with patch("app.api.chat.search", new_callable=AsyncMock) as mock_search, \
             patch("app.api.chat.answer_question_with_context", new_callable=AsyncMock) as mock_answer:
            mock_search.return_value = []
            mock_answer.return_value = {
                "answer": "This is a test answer.",
                "sources": [],
                "relevant_timestamps": [],
            }
            r = await client.post(
                f"/api/v1/chat/sessions/{session_id}/messages",
                headers=auth_headers,
                json={"content": "What is this about?", "stream": False},
            )
        assert r.status_code == 200
        assert r.json()["content"] == "This is a test answer."
        assert r.json()["role"] == "assistant"

    async def test_delete_session(self, client, auth_headers):
        cr = await client.post("/api/v1/chat/sessions", headers=auth_headers, json={})
        session_id = cr.json()["id"]
        r = await client.delete(f"/api/v1/chat/sessions/{session_id}", headers=auth_headers)
        assert r.status_code == 200

        r2 = await client.get(f"/api/v1/chat/sessions/{session_id}", headers=auth_headers)
        assert r2.status_code == 404


# ─── Service Unit Tests ────────────────────────────────────────────────────────
class TestDocumentService:
    def test_chunk_text_short(self):
        from app.services.document_service import chunk_text
        text = "Short text."
        chunks = chunk_text(text)
        assert chunks == ["Short text."]

    def test_chunk_text_long(self):
        from app.services.document_service import chunk_text
        text = "word " * 500  # 2500 chars
        chunks = chunk_text(text, chunk_size=1000, overlap=100)
        assert len(chunks) > 1
        for chunk in chunks:
            assert len(chunk) <= 1200  # some tolerance

    def test_chunk_text_empty(self):
        from app.services.document_service import chunk_text
        assert chunk_text("") == []


class TestSecurityUtils:
    def test_password_hashing(self):
        from app.core.security import get_password_hash, verify_password
        hashed = get_password_hash("mypassword")
        assert verify_password("mypassword", hashed)
        assert not verify_password("wrongpassword", hashed)

    def test_create_access_token(self):
        from app.core.security import create_access_token
        from jose import jwt
        from app.core.config import settings
        token = create_access_token({"sub": "42"})
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        assert payload["sub"] == "42"

    def test_token_with_expiry(self):
        from app.core.security import create_access_token
        from datetime import timedelta
        token = create_access_token({"sub": "1"}, expires_delta=timedelta(hours=1))
        assert token is not None


class TestVectorStore:
    async def test_search_empty_index(self):
        from app.services import vector_store
        # Reset state
        vector_store._index = None
        vector_store._metadata = []

        with patch("app.services.vector_store.get_embedding", new_callable=AsyncMock) as mock_embed:
            mock_embed.return_value = [0.1] * 1536
            results = await vector_store.search("test query")
        assert results == []

    async def test_add_chunks(self):
        from app.services import vector_store
        import numpy as np

        # Reset
        import faiss
        vector_store._index = faiss.IndexFlatL2(1536)
        vector_store._metadata = []

        with patch("app.services.vector_store.get_embedding", new_callable=AsyncMock) as mock_embed, \
             patch("app.services.vector_store._save_index"):
            mock_embed.return_value = [0.1] * 1536
            count = await vector_store.add_chunks(1, [
                {"text": "Hello world", "source": "test.pdf"},
                {"text": "Another chunk", "source": "test.pdf"},
            ])
        assert count == 2
        assert len(vector_store._metadata) == 2


# ─── AI Service Tests ──────────────────────────────────────────────────────────
class TestAIService:
    async def test_summarize_content(self):
        with patch("app.services.ai_service.get_chat_completion", new_callable=AsyncMock) as mock:
            mock.return_value = "This is a summary."
            from app.services.ai_service import summarize_content
            result = await summarize_content("Some long text here")
            assert result == "This is a summary."

    async def test_answer_question_with_context(self):
        with patch("app.services.ai_service.get_chat_completion", new_callable=AsyncMock) as mock:
            mock.return_value = "The answer is 42."
            from app.services.ai_service import answer_question_with_context
            result = await answer_question_with_context(
                "What is the answer?",
                [{"text": "The answer is 42", "source": "doc.pdf", "document_id": 1}],
            )
            assert "42" in result["answer"]
            assert len(result["sources"]) == 1

    async def test_extract_topics(self):
        with patch("app.services.ai_service.get_chat_completion", new_callable=AsyncMock) as mock:
            mock.return_value = '[{"start_time": 0, "end_time": 10, "topic": "Introduction"}]'
            from app.services.ai_service import extract_topics_from_segments
            topics = await extract_topics_from_segments([
                {"start": 0, "end": 10, "text": "Welcome everyone"}
            ])
            assert len(topics) == 1
            assert topics[0]["topic"] == "Introduction"
