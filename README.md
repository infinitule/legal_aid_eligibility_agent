# Legal Aid Eligibility & Document Preparation Agent

> AAI Capstone · Access to Justice · Built on NALSA / Legal Services Authorities Act, 1987
> Runs **fully offline** on a small local model (Ollama) — no API key, no cost, no data leaves the device.

---

## 1. Project Title
**Legal Aid Eligibility and Document Preparation Agent**

## 2. Problem Statement
Many citizens in India do not know whether they qualify for **free legal aid**, or which documents they must gather to apply. The governing rules — Section 12 of the Legal Services Authorities Act, 1987 and NALSA/state schemes — are hard to read, and income ceilings differ by state and change over time. People give up, miss deadlines, or pay money they cannot afford.

This agent asks a short set of eligibility questions, maps the answers to the statutory rules, gives an **indicative eligibility verdict with the exact governing provision**, and produces a **tailored document checklist** so the applicant knows exactly what to carry to their District Legal Services Authority (DLSA). It keeps a human in the loop for the final decision and refuses to give case-specific legal advice.

## 3. Dataset / Reference Source
- **Reference:** NALSA reference material — <https://nalsa.gov.in/> — Section 12 categories of the Legal Services Authorities Act, 1987 and indicative state income ceilings.
- **In this repo (`/data`):**
  - `nalsa_section12_categories.csv` — the (a)–(g) statutory categories + state-scheme categories.
  - `state_income_ceilings.csv` — indicative annual-income ceilings by forum/state.
  - `document_requirements.csv` — core + category-specific + matter-specific documents.
  - `sample_intake.csv` — **synthetic** fictional applicants used for validation (not real people).
- Income ceilings are **indicative starter values** and are clearly flagged for verification with the applicant's SLSA/DLSA.

## 4. Tools Used
- **Frontend / agent UI:** single-page React app (React 18 UMD, vendored locally).
- **LLM:** any local model served by **Ollama** (default `qwen3.5:0.8b`; `llama3.1` recommended for best explanations) via the native `/api/chat` endpoint.
- **Document parsing:** `mammoth` (DOCX) and `pdf.js` (PDF), vendored locally.
- **Server:** Python standard-library `http.server` (`serve.py`) — no pip dependencies.
- **Build:** `@babel/standalone` (vendored) compiles `src_app.jsx` → `vendor/app.js`.
- **Storage / memory:** browser `localStorage` (screening log, model choice).

## 5. Project Workflow
```
User input (questionnaire / uploaded document)
        │
        ▼
Agent controller  ──►  Ask missing questions (income / category)
        │
        ▼
Tools / rules engine  ──►  assessEligibility()  +  buildChecklist()
        │                    (deterministic NALSA S.12 logic)
        ▼
Guardrail check  ──►  guardrailScan()  refuses advice / outcome prediction
        │
        ▼
Structured output:  verdict + citation + checklist + plain-language summary
        │
        ▼
Log result (localStorage, exportable JSON)  +  optional AI rephrasing (local model)
```
See `docs/architecture.md` for the full flow and pipeline diagrams.

## 6. AI / Agent / Software Component
The AI is used **where it adds value and nowhere it could do harm**:
- **Deterministic rules engine (software logic):** eligibility is decided by code, not the model. S.12(a)–(g) categories qualify regardless of income; income only decides when no category applies. This makes the verdict correct, repeatable, and testable.
- **AI layer (local LLM):** *rephrases* the rules-engine verdict into plain, supportive, 6th-grade-level language, and powers the **Document Helper**, which reads an uploaded legal notice and explains it in simple words (a lightweight retrieval-over-document / RAG-style step). The model **never decides eligibility**.
- **Legal-advice guardrail:** requests for case strategy or outcome predictions are detected and refused, with a hand-off to a human lawyer/PLV.

## 7. How to Run the Project
**Prerequisites:** [Ollama](https://ollama.com) installed, and Python 3.

**Easiest — one click:** double-click **`start.command`** (macOS). It starts Ollama with browser access, serves the app, and opens `http://localhost:8000/`. Leave that window open while using the app.

**Manual:**

```bash
# 1. Pull at least one model (small default, or the recommended one)
ollama pull qwen3.5:0.8b       # tiny, ~1 GB  (default)
ollama pull llama3.1           # 8B, better explanations (recommended)

# 2. Make sure Ollama is running (the desktop app or:)
ollama serve

# 3. Serve the app over localhost (required — see note below)
cd legal_aid_agent
python3 serve.py               # serves http://localhost:8000

# 4. Open the app
#    http://localhost:8000/
```
**Important:** open it at `http://localhost:8000/`, **not** by double-clicking `index.html`. Ollama's CORS policy rejects the `file://` origin, and browser `localStorage` also requires an `http` origin.

To edit the app: change `src_app.jsx`, then `node build.js` to recompile `vendor/app.js`, then reload.

## 8. Demo Screenshots
See `screenshots/`:
- `01_eligibility.png` — questionnaire + verdict + citation + checklist
- `02_validation.png` — 7/7 test scenarios passing + screening log
- `03_document_helper.png` — plain-language explanation of an uploaded notice
- `04_about.png` — problem, how-it-works, responsible-use

## 9. Results & Insights
- The rules engine passes **7/7 built-in validation scenarios** (click *Run 7 scenarios* on the Eligibility tab; also in `data/sample_intake.csv`).
- Verdicts always cite the governing provision (e.g. `S.12(c)` for a woman, `S.12(h)` for income-based).
- The small default model proves the app runs on a **1 GB** local model; `llama3.1` gives noticeably cleaner plain-language output.
- Because eligibility is deterministic, model choice never changes the verdict — only the wording of the explanation.

## 10. Limitations
- Income ceilings are **indicative** and vary by state / change over time — must be verified with the SLSA/DLSA.
- This is an **indicative screening tool, not legal advice**; the Legal Services Authority makes the final decision.
- The AI explanation can occasionally be imperfect; the deterministic verdict + citation are the source of truth.
- The Document Helper reads text only (image-only/scanned PDFs need OCR or pasted text).
- Small local models are slower on CPU-only machines (a page can take a couple of minutes).
See `docs/limitations_and_responsible_use.md` for the full notes.

## 11. Future Improvements
- Load the `/data` CSVs at runtime so non-developers can update ceilings/categories without touching code.
- True vector RAG over a corpus of NALSA circulars and state rules.
- Multilingual output (Hindi and regional languages).
- OCR for scanned documents; auto-fill of the DLSA application form.
- A real handoff/ticket to a PLV with the screening log attached.

## 12. Team Members
_Add your name(s) here._

---
### License / Responsible Use
Educational capstone project. Not affiliated with NALSA. Provides indicative information only and must not be relied on as legal advice. In an emergency, call the NALSA helpline **15100**.
