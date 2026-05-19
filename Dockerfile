# Stage 1: Python dependencies + MediaPipe model download
FROM python:3.11-slim AS python-deps

WORKDIR /app/ml
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download MediaPipe pose model at build time so the container runs offline
RUN python -c "\
import urllib.request; \
urllib.request.urlretrieve( \
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task', \
  '/tmp/pose_landmarker_heavy.task' \
)"

# Stage 2: Final image (Python 3.11 base + Node.js 20)
# Using python:3.11-slim as base avoids GLIBC version mismatch when copying
# libpython3.11.so from stage 1 into a node:20-slim image.
FROM python:3.11-slim

# Node.js 20 + ffmpeg + opencv system libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    ffmpeg \
    libgl1 \
    libgles2 \
    libegl1 \
    libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy pip-installed packages from stage 1
COPY --from=python-deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

WORKDIR /app

# --- Backend ---
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate

# --- ML ---
COPY ml/ ./ml/

# --- Video Analysis ---
COPY video_analysis/ ./video_analysis/
COPY --from=python-deps /tmp/pose_landmarker_heavy.task ./video_analysis/pose_landmarker_heavy.task

EXPOSE 3001

CMD ["node", "backend/index.js"]
