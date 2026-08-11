FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      postgis \
      postgresql-16-postgis-3 \
      postgresql-16-postgis-3-scripts \
    && rm -rf /var/lib/apt/lists/*
