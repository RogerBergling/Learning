#!/usr/bin/env python3
"""Learning Lab — zero-dependency static server.

Serves ./public over HTTP so the ES modules and the Markdown chapters load
correctly (file:// URLs cannot fetch /docs/*.md).

    python3 start.py                 # auto-pick a port, open a browser
    python3 start.py --no-browser    # just serve
    python3 start.py --port 8080     # try one port first
    python3 start.py --host 0.0.0.0  # reachable from the LAN (careful)

Works the same on Linux, macOS and Windows. No packages required.
"""

from __future__ import annotations

import argparse
import contextlib
import functools
import http.server
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "public"
WEB_ROOT_REAL = WEB_ROOT.resolve()
PORT_RANGE = range(8080, 8100)

# Only these hash-router entry points may fall back to the app shell. Unknown
# extension-less paths (/.git/config, /admin, /server, ...) must stay 404s.
APP_ROUTE_PREFIXES = (
    "/learn",
    "/topic",
    "/sim",
    "/scenarios",
    "/compare",
    "/glossary",
    "/quiz",
    "/selftest",
)

NO_CACHE = "no-store, no-cache, must-revalidate, max-age=0"

# The site has no inline scripts and no forms. Inline *styles* are used by the
# static markup and by the simulator, so style-src needs 'unsafe-inline'.
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "object-src 'none'; "
        "base-uri 'none'; "
        "frame-ancestors 'none'; "
        "form-action 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


def _is_app_route(path: str) -> bool:
    """True only for the exact SPA entry prefixes, not lookalike names."""
    return any(path == prefix or path.startswith(prefix + "/") for prefix in APP_ROUTE_PREFIXES)


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler with sane MIME types and no caching (this is a lab)."""

    # Do not disclose the Python runtime version in the Server response header.
    server_version = "LearningLab"
    sys_version = ""

    def version_string(self) -> str:  # noqa: N802 (stdlib naming)
        return self.server_version

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".md": "text/markdown; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".xml": "application/xml; charset=utf-8",
        ".txt": "text/plain; charset=utf-8",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", NO_CACHE)
        self.send_header("X-Content-Type-Options", "nosniff")
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        with contextlib.suppress(Exception):
            super().end_headers()

    def list_directory(self, path):  # noqa: N802 (stdlib naming)
        """Do not expose directory indexes; the lab only needs known files."""
        self.send_error(404, "Not found")
        return None

    def translate_path(self, path: str) -> str:  # noqa: N802 (stdlib naming)
        """Keep symlinks inside public/ instead of following them elsewhere."""
        translated = super().translate_path(path)
        resolved = Path(translated).resolve()
        if resolved != WEB_ROOT_REAL and WEB_ROOT_REAL not in resolved.parents:
            return str(WEB_ROOT_REAL / "__not_found__")
        return translated

    def _resolve_route(self) -> None:
        # Hash routing means the app is served from "/". For convenience, send
        # known extension-less app routes to the app shell. Anything else keeps
        # its normal 404 so scanners and users are not told that a missing path
        # exists.
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path in ("/", "") or Path(path).suffix:
            return
        if not _is_app_route(path):
            return
        candidate = (WEB_ROOT / path.lstrip("/")).resolve()
        if not candidate.exists() and (candidate == WEB_ROOT_REAL or WEB_ROOT_REAL in candidate.parents):
            self.path = "/"

    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        self._resolve_route()
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802 (stdlib naming)
        self._resolve_route()
        super().do_HEAD()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("  %s\n" % (fmt % args))


def port_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def choose_port(host: str, requested: int | None) -> int:
    if requested:
        if port_available(host, requested):
            return requested
        print(f"Port {requested} is busy; looking for a free port instead…")
    for port in PORT_RANGE:
        if port_available(host, port):
            return port
    raise SystemExit("No free port in 8080–8099. Pass --port with another number.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Learning Lab.")
    parser.add_argument("--port", type=int, default=None, help="preferred port (default: first free 8080–8099)")
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    args = parser.parse_args()

    if not (WEB_ROOT / "index.html").exists():
        print(f"Could not find {WEB_ROOT / 'index.html'}.", file=sys.stderr)
        return 1

    port = choose_port(args.host, args.port)
    handler = functools.partial(Handler, directory=str(WEB_ROOT))
    try:
        server = http.server.ThreadingHTTPServer((args.host, port), handler)
    except OSError as exc:
        print(f"Could not start the server: {exc}", file=sys.stderr)
        return 1

    shown_host = "localhost" if args.host in ("127.0.0.1", "0.0.0.0") else args.host
    url = f"http://{shown_host}:{port}/"

    print()
    print("  Learning Lab")
    print("  --------------------")
    print(f"  Serving : {WEB_ROOT}")
    print(f"  Open    : {url}")
    print("  Stop    : Ctrl+C")
    print()

    if not args.no_browser:
        timer = threading.Timer(0.7, lambda: webbrowser.open(url))
        timer.daemon = True
        timer.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
