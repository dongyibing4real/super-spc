# Stage 1: Build frontend
FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY index.html vite.config.js ./
COPY src/ src/
RUN npm run build

# Stage 2: Production backend
FROM python:3.13-slim AS production
WORKDIR /app

# Install system dependencies for scipy/numpy wheels
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml ./
COPY algo/ algo/
COPY api/ api/
RUN pip install --no-cache-dir -e .

# Copy built frontend from stage 1
COPY --from=frontend /build/dist /app/dist

# Create non-root user and data directory
RUN groupadd -r spc && useradd -r -g spc -d /app spc && \
    mkdir -p /app/data && chown -R spc:spc /app

USER spc

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
