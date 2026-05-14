# DocuAI — Bug Fixes for Render Deployment

## What was broken and what was fixed

| # | Bug | Root cause | Fix |
|---|-----|-----------|-----|
| 1 | **Nothing works at all** | CORS blocked all browser→API calls | `CORS_ORIGINS_JSON` env var; reads Render frontend URL |
| 2 | **API calls hit localhost** | `VITE_API_URL` not set; Vite baked in `localhost:8000` | `VITE_API_URL` build arg in frontend Dockerfile |
| 3 | **No AI responses** | `OPENAI_API_KEY` not set on Render backend | Documented in render.yaml; validated at startup |
| 4 | **DB errors on cold start** | Alembic migrations never ran | Dockerfile CMD runs `alembic upgrade head` first |
| 5 | **Documents lost on restart** | Ephemeral Render filesystem | Render Persistent Disk at `/data`; configurable dirs |
| 6 | **App crash if Redis down** | Redis connection was mandatory | `REDIS_ENABLED=false` makes Redis optional |
| 7 | **Stale DB connections** | Render Postgres free tier sleeps | `pool_pre_ping=True`, `pool_recycle=300` |
| 8 | **SSE streaming broken** | nginx buffered SSE responses | `proxy_buffering off` in nginx.conf |

---

## Files changed

```
backend/
  app/
    core/
      config.py          ← CORS from env, optional Redis, configurable paths
      database.py        ← pool_pre_ping, pool_recycle for Render DB
    main.py              ← lifespan, optional Redis startup
    services/
      ai_service.py      ← API key validation, error handling per call
      vector_store.py    ← saves to configurable path, survives restarts
      document_service.py← configurable upload dir, PDF fallback chain
  Dockerfile             ← runs migrations before uvicorn

frontend/
  src/services/api.ts    ← reads VITE_API_URL, 401 redirect, SSE streaming
  nginx.conf             ← proxy_buffering off for SSE, SPA fallback
  Dockerfile             ← passes VITE_API_URL build arg

docker-compose.yml       ← CORS_ORIGINS_JSON, VITE_API_URL build arg
render.yaml              ← NEW: Render Blueprint for one-click deploy
```

---

## How to apply the fixes

### Step 1 — Copy files into your repo

```bash
# From the repo root:
cp fixes/backend/app/core/config.py      backend/app/core/config.py
cp fixes/backend/app/core/database.py    backend/app/core/database.py
cp fixes/backend/app/main.py             backend/app/main.py
cp fixes/backend/app/services/ai_service.py      backend/app/services/ai_service.py
cp fixes/backend/app/services/vector_store.py    backend/app/services/vector_store.py
cp fixes/backend/app/services/document_service.py backend/app/services/document_service.py
cp fixes/backend/Dockerfile              backend/Dockerfile
cp fixes/frontend/src/services/api.ts    frontend/src/services/api.ts
cp fixes/frontend/nginx.conf             frontend/nginx.conf
cp fixes/frontend/Dockerfile             frontend/Dockerfile
cp fixes/docker-compose.yml              docker-compose.yml
cp fixes/render.yaml                     render.yaml
```

### Step 2 — Set environment variables on Render

Go to your **backend** service in Render → Environment tab. Add:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | `sk-your-real-key` |
| `SECRET_KEY` | (run `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `CORS_ORIGINS_JSON` | `["https://docuai-frontend.onrender.com"]` |
| `REDIS_ENABLED` | `false` |
| `UPLOAD_DIR` | `/data/uploads` |
| `VECTOR_STORE_DIR` | `/data/vector_store` |

Go to your **frontend** service in Render → Environment tab. Add:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://docuai-backend.onrender.com` (your actual backend URL) |
| `BACKEND_URL` | `https://docuai-backend.onrender.com` |

> **Important:** `VITE_API_URL` must be set **before** you deploy/build the frontend.
> It is baked into the JS bundle at build time by Vite.

### Step 3 — Add a Persistent Disk to the backend service

In Render → your backend service → Disks → Add Disk:
- **Name:** docuai-storage
- **Mount Path:** `/data`
- **Size:** 1 GB (free)

### Step 4 — Set the backend Start Command

In Render → your backend service → Settings → Start Command:
```
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```
(The Dockerfile already does this, but setting it here makes it explicit and overridable.)

### Step 5 — Redeploy both services

Redeploy backend first, then frontend.

---

## Local dev (Docker Compose)

```bash
cp .env.example .env
# Edit .env — set OPENAI_API_KEY and SECRET_KEY
docker compose up --build
# Visit http://localhost
```

---

## Quick smoke test after deploying

```bash
# 1. Health check
curl https://docuai-backend.onrender.com/api/v1/health

# 2. Login
curl -X POST https://docuai-backend.onrender.com/api/v1/auth/login \
  -d "username=xyz1@test.com&password=zxcvbn25" \
  -H "Content-Type: application/x-www-form-urlencoded"

# 3. CORS check (should return 200, not 403)
curl -H "Origin: https://docuai-frontend.onrender.com" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     https://docuai-backend.onrender.com/api/v1/health -v
```
