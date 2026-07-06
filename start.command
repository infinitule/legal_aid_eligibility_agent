#!/bin/bash
# One-click launcher for the Legal Aid Eligibility & Document Preparation Agent.
# Double-click this file in Finder, or run:  ./start.command
# It (1) starts Ollama with browser access, (2) serves the app, (3) opens it.

cd "$(dirname "$0")" || exit 1

echo "Legal Aid Agent — starting…"

# 1. Ollama (only if not already running). OLLAMA_ORIGINS='*' lets the browser reach it.
if ! curl -s -o /dev/null --max-time 3 http://localhost:11434/api/tags; then
  echo "  • starting Ollama (ollama serve)…"
  OLLAMA_ORIGINS='*' ollama serve >/tmp/ollama_legalaid.log 2>&1 &
  # wait up to ~15s for it to come up
  for i in $(seq 1 15); do
    curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags && break
    sleep 1
  done
else
  echo "  • Ollama already running."
fi

# Make sure the default model is present (small, ~1 GB). Comment out if offline.
if ! curl -s --max-time 3 http://localhost:11434/api/tags | grep -q "qwen3.5:0.8b"; then
  echo "  • pulling default model qwen3.5:0.8b (one-time)…"
  ollama pull qwen3.5:0.8b
fi

# 2. Static web server on :8000 (required — Ollama/localStorage reject file://).
if ! curl -s -o /dev/null --max-time 3 http://localhost:8000/index.html; then
  echo "  • serving app at http://localhost:8000 …"
  python3 serve.py >/tmp/legalaid_server.log 2>&1 &
  sleep 2
else
  echo "  • web server already running."
fi

# 3. Open the app.
echo "  • opening http://localhost:8000/"
open "http://localhost:8000/"

echo "Done. Leave this window open while you use the app."
echo "(Close it or press Ctrl-C to stop the web server.)"
wait
