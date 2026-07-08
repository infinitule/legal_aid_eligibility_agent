#!/usr/bin/env python3
"""Static server for the T-2142-24 workspace, served over http://localhost:8000
so the browser origin is allowed by Ollama's CORS policy (file:// is rejected)."""
import os
import http.server
import socketserver

ROOT = os.path.dirname(os.path.abspath(__file__))  # the folder this script lives in
PORT = 8000

os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # Disable caching so edits to vendor/app.js are always picked up on reload.
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True  # avoid "Address already in use" on quick restarts


with Server(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{PORT}")
    httpd.serve_forever()
