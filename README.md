# 🤖 DocuAI — AI-Powered Document & Multimedia Q&A Platform

<div align="center">

![DocuAI Banner](https://img.shields.io/badge/DocuAI-v1.0.0-6d28d9?style=for-the-badge&logo=sparkles)
![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ed?style=for-the-badge&logo=docker)
![Coverage](https://img.shields.io/badge/Coverage-95%25+-00ff88?style=for-the-badge)

**Upload PDFs, audio, and video. Chat with AI. Navigate content by timestamp.**

</div>

---

## ✨ Features

| Feature | Details |
|---|---|
| 📄 **PDF Analysis** | Extract text, semantic search, Q&A |
| 🎵 **Audio Transcription** | Whisper-powered with word-level timestamps |
| 🎬 **Video Intelligence** | Transcribe, topic extraction, timestamp navigation |
| 🤖 **AI Chatbot** | GPT-4o-mini with RAG over your documents |
| ⚡ **Streaming Responses** | Real-time SSE-streamed chat answers |
| 🔍 **Vector Search** | FAISS semantic search across all documents |
| ⏱️ **Timestamp Navigation** | Click to jump to any moment in audio/video |
| 🔐 **JWT Auth** | Secure multi-user authentication |
| 📊 **Summaries** | Auto-generated summaries for all file types |
| 🐳 **Dockerized** | Full Docker Compose stack, CI/CD with GitHub Actions |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Browser Client                       │
│          React 18 + TypeScript + Tailwind CSS            │
│      Zustand State · Framer Motion · react-dropzone      │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP / SSE
┌──────────────────────▼──────────────────────────────────┐
│                   Nginx (Port 80)                        │
│               Reverse proxy + static files               │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              FastAPI Backend (Port 8000)                  │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │   Auth   │  │Documents │  │  Chat    │  │ Media  │  │
│  │  Router  │  │  Router  │  │  Router  │  │ Router │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Services Layer                      │    │
│  │  AI Service  │  Vector Store  │  Doc Processor  │    │
│  │  (OpenAI)    │    (FAISS)     │  (PyPDF2/Whisper│    │
│  └─────────────────────────────────────────────────┘    │
└──────┬─────────────────┬───────────────────┬────────────┘
       │                 │                   │
┌──────▼──────┐  ┌───────▼──────┐  ┌────────▼──────┐
│  PostgreSQL  │  │    Redis     │  │  FAISS Index  │
│  (Users,     │  │  (Cache,     │  │  + Metadata   │
│  Documents,  │  │   Sessions)  │  │  (Disk)       │
│  Messages)   │  └──────────────┘  └───────────────┘
└─────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker** & **Docker Compose** (v2+)
- **OpenAI API Key** ([get one here](https://platform.openai.com))

### 1. Clone & configure

```bash
git clone https://github.com/yourusername/docuai.git
cd docuai

# Copy and edit environment variables
cp .env.example .env
```

Edit `.env`:
```env
OPENAI_API_KEY=sk-your-key-here
SECRET_KEY=your-32-char-secret-key-here
```

### 2. Start all services

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`
- **Backend API** on port `8000`
- **Frontend** on port `80`

### 3. Open the app

Visit **http://localhost** → Create an account → Upload files → Start chatting!

---

## 🛠️ Tech Stack

### Backend
| Tech | Purpose |
|---|---|
| **FastAPI** | Async Python web framework |
| **SQLAlchemy 2.0** | Async ORM with PostgreSQL |
| **OpenAI GPT-4o-mini** | LLM for Q&A and summarization |
| **OpenAI Whisper** | Audio/video transcription with timestamps |
| **OpenAI Embeddings** | text-embedding-3-small for semantic search |
| **FAISS** | Vector similarity search |
| **PyPDF2** | PDF text extraction |
| **JWT + bcrypt** | Authentication & password hashing |
| **Redis** | Caching and rate limiting |
| **Alembic** | Database migrations |

### Frontend
| Tech | Purpose |
|---|---|
| **React 18** | UI framework with hooks |
| **TypeScript** | Type safety |
| **Tailwind CSS** | Utility-first styling |
| **Vite** | Lightning-fast build tool |
| **Zustand** | Lightweight state management |
| **Framer Motion** | Smooth animations |
| **react-dropzone** | File upload UX |
| **react-markdown** | Render AI responses as markdown |
| **SSE (EventSource)** | Real-time streaming responses |

### Infrastructure
| Tech | Purpose |
|---|---|
| **Docker + Compose** | Container orchestration |
| **Nginx** | Reverse proxy + static serving |
| **GitHub Actions** | CI/CD pipeline |
| **PostgreSQL 16** | Primary database |
| **Redis 7** | Cache and session store |

---

## 📁 Project Structure

```
docuai/
├── backend/
│   ├── app/
│   │   ├── api/               # Route handlers
│   │   │   ├── auth.py        # JWT auth endpoints
│   │   │   ├── chat.py        # Chat + SSE streaming
│   │   │   ├── documents.py   # File upload & management
│   │   │   ├── media.py       # Media streaming
│   │   │   └── health.py      # Health check
│   │   ├── core/
│   │   │   ├── config.py      # Pydantic settings
│   │   │   ├── database.py    # Async SQLAlchemy
│   │   │   └── security.py    # JWT + password utils
│   │   ├── models/
│   │   │   ├── user.py        # User model
│   │   │   ├── document.py    # Document model
│   │   │   └── message.py     # Chat session + message models
│   │   ├── services/
│   │   │   ├── ai_service.py        # OpenAI integration
│   │   │   ├── vector_store.py      # FAISS vector search
│   │   │   └── document_service.py  # PDF + audio processing
│   │   ├── tests/
│   │   │   └── test_main.py   # 95%+ coverage test suite
│   │   └── main.py            # FastAPI app entry point
│   ├── requirements.txt
│   ├── pyproject.toml         # pytest + coverage config
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppLayout.tsx   # Main layout
│   │   │   │   ├── AuthPage.tsx    # Login/register
│   │   │   │   └── Sidebar.tsx     # Session sidebar
│   │   │   ├── upload/
│   │   │   │   ├── UploadZone.tsx  # Drag & drop uploader
│   │   │   │   └── DocumentList.tsx # File list + summaries
│   │   │   ├── chat/
│   │   │   │   ├── ChatInterface.tsx # Main chat UI
│   │   │   │   └── TimestampBadge.tsx # Clickable timestamps
│   │   │   └── media/
│   │   │       └── MediaPlayer.tsx  # Audio/video player
│   │   ├── services/
│   │   │   └── api.ts          # Axios API client
│   │   ├── store/
│   │   │   └── index.ts        # Zustand global store
│   │   ├── styles/
│   │   │   └── globals.css     # Tailwind + custom styles
│   │   ├── tests/
│   │   │   └── app.test.tsx    # Frontend test suite
│   │   ├── App.tsx             # Router + providers
│   │   └── main.tsx            # Entry point
│   ├── nginx.conf
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI/CD
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
└── README.md
```

---

## 📡 API Documentation

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register new user |
| `POST` | `/api/v1/auth/login` | Login, get JWT token |
| `GET` | `/api/v1/auth/me` | Get current user |

**Register / Login request body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "username": "myusername"
}
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": 1, "email": "user@example.com", "username": "myusername" }
}
```

### Documents

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/documents/upload` | Upload a file (multipart) |
| `GET` | `/api/v1/documents/` | List all user documents |
| `GET` | `/api/v1/documents/{id}` | Get document details |
| `DELETE` | `/api/v1/documents/{id}` | Delete document |
| `GET` | `/api/v1/documents/{id}/stream` | Stream media file |

**Document response:**
```json
{
  "id": 1,
  "filename": "report.pdf",
  "file_type": "pdf",
  "status": "completed",
  "summary": "This document covers...",
  "timestamps": [
    { "start": 10.5, "end": 25.0, "text": "Introduction...", "topic": "Overview" }
  ],
  "duration_seconds": 300.0,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Chat

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/chat/sessions` | Create chat session |
| `GET` | `/api/v1/chat/sessions` | List sessions |
| `GET` | `/api/v1/chat/sessions/{id}` | Get session with messages |
| `POST` | `/api/v1/chat/sessions/{id}/messages` | Send message (stream or not) |
| `DELETE` | `/api/v1/chat/sessions/{id}` | Delete session |

**Send message (streaming):**
```json
{ "content": "What are the main topics?", "stream": true }
```

**Response** (SSE stream):
```
data: {"type": "chunk", "content": "The main"}
data: {"type": "chunk", "content": " topics are..."}
data: {"type": "done", "timestamps": [{"document_id": 1, "start_time": 45.2}]}
```

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health check |

---

## 🧪 Testing

### Backend Tests (95%+ coverage)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run tests with coverage report
pytest app/tests/ --cov=app --cov-report=term-missing -v

# Generate HTML coverage report
pytest app/tests/ --cov=app --cov-report=html
open htmlcov/index.html
```

The test suite covers:
- ✅ Health endpoints
- ✅ Auth: register, login, JWT validation, error cases
- ✅ Documents: upload, list, get, delete, access control
- ✅ Chat: session CRUD, message sending, streaming
- ✅ Services: text chunking, password hashing, JWT tokens
- ✅ Vector store: add chunks, search, delete
- ✅ AI Service: summarization, Q&A, topic extraction

### Frontend Tests

```bash
cd frontend
npm ci
npm test
```

Covers: store state management, Auth page, TimestampBadge, API service.

---

## 🔧 Development Setup (Without Docker)

### Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/docuai"
export OPENAI_API_KEY="sk-your-key"
export SECRET_KEY="your-secret-key-32-chars-minimum"

# Run development server
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Visit http://localhost:3000
```

### Interactive API Docs

Once backend is running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🚢 Production Deployment

### AWS / GCP / Azure (Docker)

```bash
# On your server
git clone https://github.com/yourusername/docuai.git
cd docuai

# Configure environment
cp .env.example .env
nano .env  # Add your OPENAI_API_KEY and SECRET_KEY

# Build and start
docker-compose up -d --build

# Check status
docker-compose ps
docker-compose logs -f backend
```

### Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | — | Your OpenAI API key |
| `SECRET_KEY` | ✅ | — | JWT signing key (32+ chars) |
| `DATABASE_URL` | ❌ | postgres in docker | PostgreSQL connection string |
| `REDIS_URL` | ❌ | redis in docker | Redis connection string |
| `OPENAI_MODEL` | ❌ | gpt-4o-mini | Chat model |
| `WHISPER_MODEL` | ❌ | whisper-1 | Transcription model |
| `MAX_FILE_SIZE_MB` | ❌ | 100 | Max upload size |
| `DEBUG` | ❌ | false | Enable debug mode |

---

## 💡 Key Design Decisions

1. **FAISS over Pinecone** — No external service required, runs fully in-container
2. **SSE over WebSockets** — Simpler for one-directional streaming, better proxy support  
3. **Background Tasks** — Document processing happens async, UI shows live status
4. **Segment-level chunking for audio** — Each Whisper segment becomes a vector chunk, preserving timestamps for playback navigation
5. **Zustand over Redux** — Much lighter, perfect for this app's needs
6. **SQLAlchemy async** — Full async stack from HTTP handler to database

---

## 📋 Supported File Formats

| Type | Formats |
|---|---|
| Documents | `.pdf` |
| Audio | `.mp3`, `.wav`, `.m4a`, `.ogg` |
| Video | `.mp4`, `.mov`, `.avi`, `.webm`, `.mkv` |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Run tests: `pytest` + `npm test`
4. Commit: `git commit -m 'feat: add amazing feature'`
5. Push and open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) file.
