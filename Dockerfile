# Stage 1: Install Python deps
FROM python:3.11-slim-bookworm AS python-deps

WORKDIR /app/ml
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final image (Node.js + Python)
FROM node:20-bookworm-slim

# System libs required by opencv-python-headless and mediapipe
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-distutils \
    ffmpeg \
    libglib2.0-0 \
    libgl1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from stage 1
COPY --from=python-deps /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY --from=python-deps /usr/local/lib/libpython3.11.so.1.0 /usr/local/lib/libpython3.11.so.1.0
COPY --from=python-deps /usr/local/lib/libpython3.11.so /usr/local/lib/libpython3.11.so
COPY --from=python-deps /usr/local/bin/python3.11  /usr/local/bin/python3.11
COPY --from=python-deps /usr/local/bin/pip3.11     /usr/local/bin/pip3.11
ENV LD_LIBRARY_PATH=/usr/local/lib
RUN ln -sf /usr/local/bin/python3.11 /usr/local/bin/python3 \
    && ln -sf /usr/local/bin/python3.11 /usr/local/bin/python

WORKDIR /app

# --- Backend ---
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate

# --- ML ---
COPY ml/ ./ml/

EXPOSE 3001

ENV DATABASE_URL="postgresql://postgres:QwzRURvPCLkQzViNieAm@boxing-analytics-db.clck0uii4xz2.ap-southeast-2.rds.amazonaws.com:5432/boxing-analytics"
ENV JWT_SECRET="1dd3060889757d14f8d921c8f553a5bad668133bdd72e3c78cb6d092276364ae"

CMD ["node", "backend/index.js"]
