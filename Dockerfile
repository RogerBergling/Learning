# syntax=docker/dockerfile:1

# The lab is a static site served by the dependency-free Python launcher.
FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Run as an unprivileged user; the image only needs read access to the site.
RUN addgroup -S app && adduser -S -G app app

COPY --chown=app:app start.py ./start.py
COPY --chown=app:app public ./public

USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["python3", "-c", "import urllib.request; urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:8080/', timeout=2).read()"]

CMD ["python3", "start.py", "--host", "0.0.0.0", "--port", "8080", "--no-browser"]
