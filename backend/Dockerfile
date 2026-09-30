FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libexpat1 is required by the GDAL bundled in the rasterio wheel.
RUN (ldconfig -p | grep -q libexpat.so.1) || ( \
        apt-get update \
        && apt-get install -y --no-install-recommends libexpat1 \
        && rm -rf /var/lib/apt/lists/* )

COPY pyproject.toml ./
RUN mkdir app && touch app/__init__.py \
    && pip install ".[dev]" \
    && rm -rf app build *.egg-info

COPY . .

EXPOSE 8000
CMD ["sh", "/app/docker-entrypoint.sh"]
