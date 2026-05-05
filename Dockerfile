# Stage 1: Install Python deps
FROM python:3.11-slim AS python-deps

WORKDIR /app/ml
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Final image (Node.js + Python)
FROM node:20-slim

# Install Python 3 runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-distutils \
    && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages from stage 1
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

EXPOSE 3001

CMD ["node", "backend/index.js"]
