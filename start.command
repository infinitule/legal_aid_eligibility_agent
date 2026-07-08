#!/bin/bash
# One-click launcher for the Legal Aid Eligibility & Document Preparation Agent.
# Double-click this file in Finder, or run:  ./start.command
# It (1) starts Ollama with browser access, (2) serves the app, (3) opens it.

cd "$(dirname "$0")" || exit 1

# ── decorative banner ───────────────────────────────────────────────
printf '\n'
printf '   ╔══════════════════════════════════════════════════════════╗\n'
printf '   ║                                                          ║\n'
printf '   ║      ⚖️   LEGAL AID ELIGIBILITY  &  DOCUMENT AGENT        ║\n'
printf '   ║          NALSA · runs 100%% offline · no API key          ║\n'
printf '   ║                                                          ║\n'
printf '   ╚══════════════════════════════════════════════════════════╝\n'
printf '\n   Starting everything for you — please keep this window open.\n\n'

# 1. Ollama (only if not already running). OLLAMA_ORIGINS='*' lets the browser reach it.
if ! curl -s -o /dev/null --max-time 3 http://localhost:11434/api/tags; then
  printf '   [1/4] Starting the local AI engine (Ollama)…\n'
  OLLAMA_ORIGINS='*' ollama serve >/tmp/ollama_legalaid.log 2>&1 &
  for i in $(seq 1 15); do
    curl -s -o /dev/null --max-time 2 http://localhost:11434/api/tags && break
    sleep 1
  done
else
  printf '   [1/4] Local AI engine already running ✓\n'
fi

# 2. Ensure models exist: embeddings (for Q&A) + a guaranteed-small chat model.
#    gemma4 gives the best answers but is large — pick it in the app when ready.
printf '   [2/4] Checking local models…\n'
TAGS=$(curl -s --max-time 3 http://localhost:11434/api/tags)
echo "$TAGS" | grep -q "nomic-embed-text" || { printf '         • pulling nomic-embed-text (embeddings)…\n'; ollama pull nomic-embed-text; }
if ! echo "$TAGS" | grep -qE "gemma4|llama3.1|qwen3"; then
  printf '         • pulling a small chat model (qwen3.5:0.8b, one-time)…\n'
  ollama pull qwen3.5:0.8b
fi

# 3. Static web server on :8000 (required — Ollama/localStorage reject file://).
if ! curl -s -o /dev/null --max-time 3 http://localhost:8000/index.html; then
  printf '   [3/4] Serving the app at http://localhost:8000 …\n'
  python3 serve.py >/tmp/legalaid_server.log 2>&1 &
  sleep 2
else
  printf '   [3/4] Web server already running ✓\n'
fi

# 4. Open the app.
printf '   [4/4] Opening the app in your browser…\n'
open "http://localhost:8000/"

printf '\n   ──────────────────────────────────────────────────────────\n'
printf '   ✓  Ready!   Open →  http://localhost:8000/\n'
printf '   💡 Tip: in the sidebar, pick "gemma4:latest" for the best answers.\n'
printf '   ⏹  To stop: close this window (or press Ctrl-C).\n'
printf '   ──────────────────────────────────────────────────────────\n\n'
wait
