# syntax=docker/dockerfile:1

# The lab is a static site served by the dependency-free Python launcher.
FROM python:3.12-alpine@sha256:e064671ca452259bab50e8e2c7bd896e39e9a343bb06ca25234adf6fe18d0fc7

# Build metadata is baked into public/version.json and shown on the home page.
ARG APP_VERSION=dev
ARG IMAGE_TAG=local
ARG GIT_SHA=local
ARG BUILD_DATE=

LABEL org.opencontainers.image.title="Learning Lab" \
      org.opencontainers.image.version="$APP_VERSION" \
      org.opencontainers.image.revision="$GIT_SHA" \
      io.onegate.build.version="$APP_VERSION" \
      io.onegate.build.image-tag="$IMAGE_TAG" \
      io.onegate.build.revision="$GIT_SHA" \
      io.onegate.build.date="$BUILD_DATE"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Run as an unprivileged user; the image only needs read access to the site.
RUN addgroup -S app && adduser -S -G app app

COPY --chown=app:app start.py ./start.py
COPY --chown=app:app public ./public

RUN APP_VERSION="$APP_VERSION" IMAGE_TAG="$IMAGE_TAG" GIT_SHA="$GIT_SHA" BUILD_DATE="$BUILD_DATE" \
    python3 -c "import json, os; data = {'version': os.environ['APP_VERSION'], 'imageTag': os.environ['IMAGE_TAG'], 'commit': os.environ['GIT_SHA'], 'buildDate': os.environ.get('BUILD_DATE') or None}; open('public/version.json', 'w', encoding='utf-8').write(json.dumps(data, indent=2) + '\n')" \
    && chown app:app public/version.json

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:8080/', timeout=2).read()"]

CMD ["python3", "start.py", "--host", "0.0.0.0", "--port", "8080", "--no-browser"]
