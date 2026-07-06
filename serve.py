#!/usr/bin/env python3
"""Static server for the T-2142-24 workspace, served over http://localhost:8000
so the browser origin is allowed by Ollama's CORS policy (file:// is rejected)."""
import os
import http.server
import socketserver

ROOT = "/Users/f1thkdmlk24538/Desktop/HIMSHIKHAR CLASSES/JUN 30/CAPSTONE"
PORT = 8000

os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)


class Server(socketserver.TCPServer):
    allow_reuse_address = True  # avoid "Address already in use" on quick restarts


with Server(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{PORT}")
    httpd.serve_forever()
