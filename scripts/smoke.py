#!/usr/bin/env python3
"""HTTP smoke test for the primary Python launcher.

Starts start.py on a free localhost port, checks the app shell, an ES module,
a Markdown chapter, the SPA fallback route, a 404 and the security headers,
then shuts the server down. No dependencies beyond the stdlib.

    python3 scripts/smoke.py
"""

from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # ignore HTTP_PROXY for localhost
failures: list[str] = []
checks = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if not ok:
        failures.append(f"{label}{f' — {detail}' if detail else ''}")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def fetch(url: str, method: str = "GET") -> tuple[int, dict[str, str], bytes]:
    request = urllib.request.Request(url, method=method)
    try:
        with opener.open(request, timeout=4) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def header(headers: dict[str, str], name: str) -> str:
    target = name.lower()
    for key, value in headers.items():
        if key.lower() == target:
            return value
    return ""


def main() -> int:
    port = free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            "start.py",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--no-browser",
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"

    try:
        ready = False
        for _ in range(60):
            if process.poll() is not None:
                break
            try:
                status, _, _ = fetch(f"{base}/")
                if status == 200:
                    ready = True
                    break
            except (urllib.error.URLError, TimeoutError):
                pass
            time.sleep(0.1)
        check(ready, "launcher starts and serves /")
        if not ready:
            return report(process)

        status, headers, body = fetch(f"{base}/")
        check(status == 200, "GET / returns 200", str(status))
        check(b"<main id=\"view\"" in body, "app shell contains the router mount")
        check("default-src 'self'" in header(headers, "Content-Security-Policy"),
              "CSP header is present")
        check(header(headers, "X-Content-Type-Options") == "nosniff", "nosniff header is present")
        check(header(headers, "X-Frame-Options") == "DENY", "frame protection header is present")

        status, headers, body = fetch(f"{base}/assets/js/app.js")
        check(status == 200, "ES module returns 200", str(status))
        check("javascript" in header(headers, "Content-Type"), "ES module MIME type",
              header(headers, "Content-Type"))
        check(len(body) > 500, "ES module has content")

        status, headers, body = fetch(f"{base}/assets/css/app.css")
        check(status == 200, "stylesheet returns 200", str(status))
        check("text/css" in header(headers, "Content-Type"), "stylesheet MIME type",
              header(headers, "Content-Type"))

        status, headers, body = fetch(f"{base}/docs/01-architecture.md")
        check(status == 200, "Markdown chapter returns 200", str(status))
        check("markdown" in header(headers, "Content-Type"), "Markdown MIME type",
              header(headers, "Content-Type"))
        check(b"# The big picture" in body, "Markdown chapter has its heading")

        status, headers, body = fetch(f"{base}/version.json")
        check(status == 200, "version.json returns 200", str(status))
        check("json" in header(headers, "Content-Type"), "version.json MIME type",
              header(headers, "Content-Type"))
        try:
            version_info = json.loads(body)
            check(bool(version_info.get("version")), "version.json has a version", str(version_info.get("version")))
            check("imageTag" in version_info and "commit" in version_info and "buildDate" in version_info,
                  "version.json has deployment metadata")
        except json.JSONDecodeError as exc:
            check(False, "version.json is valid JSON", str(exc))

        status, _, body = fetch(f"{base}/sim/bff-login")
        check(status == 200, "SPA fallback route returns the app shell", str(status))
        check(b"<main id=\"view\"" in body, "SPA fallback serves index.html")

        status, _, _ = fetch(f"{base}/missing-file.js")
        check(status == 404, "unknown file returns 404", str(status))

        status, _, _ = fetch(f"{base}/assets/")
        check(status == 404, "directory indexes are disabled", str(status))

        status, headers, body = fetch(f"{base}/", method="HEAD")
        check(status == 200, "HEAD / returns 200", str(status))
        check(body == b"", "HEAD / has no response body")

        return report(process)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def report(process: subprocess.Popen) -> int:
    if failures:
        print(f"\n{len(failures)} smoke check(s) failed; {checks - len(failures)} passed.\n")
        for failure in failures:
            print(f"  FAIL  {failure}")
        print(f"\nLauncher exit code: {process.poll()}")
        return 1
    print(f"All {checks} smoke checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
