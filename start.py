#!/usr/bin/env python3
"""OneGate Learning Lab — zero-dependency static server.

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
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "public"
PORT_RANGE = range(8080, 8100)

NO_CACHE = "no-store, no-cache, must-revalidate, max-age=0"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static handler with sane MIME types and no caching (this is a lab)."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".md": "text/markdown; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
    }

    def end_headers(self) -> None:
        self.send_header("Cache-Control", NO_CACHE)
        self.send_header("X-Content-Type-Options", "nosniff")
        with contextlib.suppress(Exception):
            super().end_headers()

    def do_GET(self) -> None:  # noqa: N802 (stdlib naming)
        # Hash routing means every app route is "/"; for convenience, send
        # unknown extension-less paths to the app shell instead of a 404.
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path not in ("/", "") and not Path(path).suffix:
            candidate = (WEB_ROOT / path.lstrip("/")).resolve()
            if not candidate.exists() and WEB_ROOT in candidate.parents:
                self.path = "/"
        super().do_GET()

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
    parser = argparse.ArgumentParser(description="Serve the OneGate Learning Lab.")
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
    print("  OneGate Learning Lab")
    print("  --------------------")
    print(f"  Serving : {WEB_ROOT}")
    print(f"  Open    : {url}")
    print("  Stop    : Ctrl+C")
    print()

    if not args.no_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
