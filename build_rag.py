#!/usr/bin/env python3
"""Offline RAG indexer for the Legal Aid Agent.

Reads the reference corpus in data/corpus/*.md, splits it into chunks, embeds
each chunk locally with Ollama's `nomic-embed-text` model, and writes a static
vector index to data/rag_index.json that the browser app loads for retrieval.

No pip dependencies — standard library only. Requires Ollama running with the
embedding model pulled:  ollama pull nomic-embed-text

Usage:  python3 build_rag.py
"""
import glob
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
CORPUS_DIR = os.path.join(ROOT, "data", "corpus")
OUT = os.path.join(ROOT, "data", "rag_index.json")
EMBED_MODEL = "nomic-embed-text"
EMBED_URL = "http://localhost:11434/api/embed"
MAX_CHARS = 900  # target chunk size


def embed(text):
    body = json.dumps({"model": EMBED_MODEL, "input": text}).encode()
    req = urllib.request.Request(EMBED_URL, data=body,
                                 headers={"Content-Type": "application/json"})
    d = json.loads(urllib.request.urlopen(req, timeout=120).read())
    e = d.get("embeddings") or d.get("embedding")
    return e[0] if e and isinstance(e[0], list) else e


def chunk_file(path):
    raw = open(path, encoding="utf-8").read()
    title = "Legal aid reference"
    m = re.search(r"^#\s+(.+)$", raw, re.M)
    if m:
        title = m.group(1).strip()
    # drop provenance blockquotes and headings from chunk text
    lines = [ln for ln in raw.splitlines() if not ln.strip().startswith(">")]
    body = "\n".join(lines)
    section = title
    chunks, buf = [], []

    def flush():
        text = "\n".join(buf).strip()
        if len(text) >= 40:
            chunks.append((section, text))

    for para in re.split(r"\n\s*\n", body):
        p = para.strip()
        if not p:
            continue
        h = re.match(r"^#{1,3}\s+(.+)$", p)
        if h:
            flush(); buf = []
            section = h.group(1).strip()
            continue
        cur = "\n".join(buf)
        if buf and len(cur) + len(p) > MAX_CHARS:
            flush(); buf = [p]
        else:
            buf.append(p)
    flush()
    return title, chunks


def main():
    files = sorted(glob.glob(os.path.join(CORPUS_DIR, "*.md")))
    if not files:
        raise SystemExit("No corpus files found in " + CORPUS_DIR)
    out_chunks, dim = [], None
    cid = 0
    for path in files:
        src = os.path.basename(path)
        title, chunks = chunk_file(path)
        for section, text in chunks:
            vec = embed(text)
            dim = dim or len(vec)
            out_chunks.append({"id": cid, "source": src, "title": title,
                               "section": section, "text": text, "vector": vec})
            cid += 1
            print(f"  embedded #{cid:>2}  [{src} :: {section[:40]}]")
    index = {"model": EMBED_MODEL, "dim": dim, "count": len(out_chunks),
             "chunks": out_chunks}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(index, f)
    kb = os.path.getsize(OUT) / 1024
    print(f"\nWrote {OUT}  ({len(out_chunks)} chunks, dim {dim}, {kb:.0f} KB)")


if __name__ == "__main__":
    main()
