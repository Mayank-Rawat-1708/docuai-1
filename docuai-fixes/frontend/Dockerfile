# FIX: frontend/Dockerfile — Render-compatible multi-stage build
# Changes vs original:
#   1. Accepts VITE_API_URL as a build ARG — Vite bakes it into the JS bundle
#   2. envsubst replaces ${BACKEND_URL} in nginx.conf at container start
#   3. Uses nginx:alpine for a smaller image

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# FIX: VITE_API_URL must be present at BUILD time (Vite uses import.meta.env)
# Pass via: docker build --build-arg VITE_API_URL=https://your-backend.onrender.com
# In Render: set VITE_API_URL in the frontend service's Environment tab
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build


# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.25-alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx template (uses ${BACKEND_URL} placeholder)
COPY nginx.conf /etc/nginx/templates/default.conf.template

# FIX: BACKEND_URL for nginx proxy_pass
# Default to Docker Compose service name; override in Render via env var
ENV BACKEND_URL=http://backend:8000

# nginx docker image auto-runs envsubst on /etc/nginx/templates/*.template
# and writes result to /etc/nginx/conf.d/
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
