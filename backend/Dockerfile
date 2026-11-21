# ==============================================================================
# Sentinel-Chain Backend Production Dockerfile
# ==============================================================================
FROM python:3.11-slim AS builder

WORKDIR /install

# Install build dependencies if needed for C extensions (e.g. tree-sitter, psycopg2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Final runtime stage
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install runtime libpq for PostgreSQL connectivity
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed dependencies from builder
COPY --from=builder /install /usr/local

# Create non-root user and group
RUN groupadd -g 10001 appuser && \
    useradd -u 10001 -g appuser -s /bin/bash -m appuser

# Copy application source code
COPY --chown=appuser:appuser . /app

# Set production environment defaults
ENV PYTHONUNBUFFERED=1 \
    ENABLE_SANDBOX=false \
    PORT=8000

# Switch to unprivileged non-root user
USER appuser

EXPOSE 8000

# Docker healthcheck querying the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/api/health').getcode() == 200 else 1)"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
