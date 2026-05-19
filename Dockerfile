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

# Stage 2: Final image (Node.js + Python 3.11)
FROM node:20-slim

# python3 runtime + ffmpeg (video re-encoding) + opencv system libs (libgl1/libglib2.0-0)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-distutils \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python 3.11 interpreter and installed packages from stage 1
COPY --from=python-deps /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=python-deps /usr/local/bin/python3.11  /usr/local/bin/python3.11
RUN ln -sf /usr/local/bin/python3.11 /usr/local/bin/python3

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
