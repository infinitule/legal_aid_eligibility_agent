# Architecture

## Project Flow
```mermaid
flowchart TD
    A[User goal/input: questionnaire or uploaded document] --> B[Agent understands task]
    B --> C[Ask missing questions: income / category]
    C --> D[Tools + retrieval + memory: rules engine, checklist, doc text]
    D --> E[Apply legal-advice guardrail]
    E --> F[Structured output: verdict + citation + checklist + summary]
    F --> G[Log result to localStorage / export JSON]
```

## System / Pipeline Architecture
```mermaid
flowchart LR
    A[User Interface: React SPA] --> B[Agent Controller: App / views]
    B --> C[Prompt Workflow: system prompts]
    B --> D[Tools / Functions: assessEligibility, buildChecklist, extractText]
    B --> E[Memory / KB: /data CSVs + localStorage log]
    C --> F[LLM Response: local model via Ollama]
    D --> F
    E --> F
    F --> G[Guardrail Check: guardrailScan]
    G --> H[Final Answer + Logs]
```

## Offline vector RAG (Legal Q&A)
```mermaid
flowchart LR
    C[data/corpus/*.md<br/>NALSA reference notes] --> K[build_rag.py: chunk + embed]
    K -->|nomic-embed-text 768d| I[data/rag_index.json]
    Q[User question] --> E[Embed query: Ollama /api/embed]
    I --> R[Cosine top-k in browser]
    E --> R
    R --> P[Grounded prompt with cited passages]
    P --> M[Local chat model: Ollama /api/chat]
    M --> A[Answer with citations + shown sources]
```
The index is built once, offline, by `build_rag.py`; retrieval and generation at query time are entirely on-device (local embeddings + local model), and every answer cites the passages it used.

## Module map (code)
| Module (brief) | Implementation in `src_app.jsx` |
|---|---|
| User input form | `LegalAidView` questionnaire, `DocumentHelperView` upload/paste |
| Prompt workflow | `DOC_SYSTEM`, the eligibility system prompt in `aiSummary` |
| Tool / function layer | `assessEligibility`, `buildChecklist`, `laCeiling`, `extractText` |
| Memory / retrieval | `localStorage` screening log; `/data` reference tables; **vector RAG** over `data/rag_index.json` (`embedQuery`, `cosineSim`, `RagView`); document text passed to the model |
| Guardrails & fallback | `guardrailScan`; AI-unavailable fallback keeps the rule-based summary |
| Logs / evaluation sheet | screening log + JSON export; `LA_SCENARIOS` test suite |
| AI component | `askModel` → Ollama `/api/chat` (local, offline) |

## Why deterministic core + LLM shell
The eligibility decision is **pure code** so it is correct, repeatable, and testable; the LLM only turns that decision (and uploaded documents) into plain language. The model is never in the decision path, which is the right safety posture for a sensitive legal domain.

## Runtime / serving
- Served over `http://localhost:8000` by `serve.py` (Python stdlib). An `http` origin is required: Ollama's CORS rejects `file://`, and `localStorage` needs an http origin.
- All JS libraries (React, mammoth, pdf.js) and the compiled app are vendored in `/vendor` → the UI works with no internet.
- The model runs locally via Ollama → no API key, no cost, data stays on device.
