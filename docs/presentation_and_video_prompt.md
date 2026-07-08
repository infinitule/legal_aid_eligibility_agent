# Master prompt — Presentation deck + Demo video (paste into Claude)

Copy everything in the fenced block below into Claude (with the design/artifact
skill) to generate the slide deck. A second prompt for the demo-video script
follows. All facts are drawn from this repo so the output stays accurate.

---

## A) Slide deck prompt

```
You are a senior presentation designer. Create a polished, visually striking 10-slide
deck (16:9) for a student capstone project. Output it as a self-contained HTML artifact
I can present full-screen and export to PDF. Use a refined editorial aesthetic:
warm paper background (#f5f1e8), deep ink text (#1a1a1a), a legal-crimson accent
(#8b0000) and muted gold (#b08d3c); serif display headings (e.g. Fraunces/Playfair),
mono labels (e.g. JetBrains Mono). Generous whitespace, one clear idea per slide,
simple diagrams drawn as clean SVG/CSS (no clip art). Add small slide numbers.

PROJECT: "Legal Aid Eligibility & Document Preparation Agent" — an AAI capstone in the
access-to-justice domain, built on India's NALSA / Legal Services Authorities Act, 1987.
It runs 100% offline on a local model (Ollama) — no API key, no cost, data stays on device.

SLIDES (one idea each):
1. TITLE — project name, "AAI Capstone · Access to Justice", team: Chandandeep Sharma,
   Amey Chorge, Neal Balsara, and
   the tagline: "Am I eligible for free legal aid, and what do I bring? — answered offline."
2. PROBLEM & IMPACT — Millions in India qualify for free legal aid but don't know it or
   which documents to bring; rules (S.12 of the LSA Act 1987) are opaque and income
   ceilings vary by state. People give up or pay money they can't afford. Users: the
   applicant, and the Para-Legal Volunteer (PLV) doing intake at a District Legal
   Services Authority (DLSA).
3. DATA / REFERENCE — NALSA reference material (nalsa.gov.in): S.12(a)-(h) categories +
   indicative state income ceilings, encoded as auditable CSVs, plus a curated corpus of
   reference notes used for retrieval. Ceilings are indicative and verified with SLSA/DLSA.
4. SYSTEM WORKFLOW — a clean flow: User input → agent → ask missing questions → tools
   (rules engine + checklist + vector RAG) → legal-advice guardrail → structured output
   (verdict + citation + checklist) → log/export.
5. AI / INNOVATION — three parts: (a) a DETERMINISTIC rules engine decides eligibility in
   code (repeatable, testable) — the model never decides it; (b) a local LLM rephrases the
   verdict into plain 6th-grade language and explains uploaded documents; (c) TRUE OFFLINE
   VECTOR RAG: local nomic-embed-text embeddings + cosine retrieval over the NALSA corpus,
   with grounded, CITED answers. Plus a guardrail that refuses case-specific advice.
6. WHY A LOCAL MODEL — runs offline, zero cost, privacy-preserving for sensitive intake
   data; selectable model; verdict is deterministic so any model is safe. Note: qwen3.5:0.8b
   (a reasoning model) proved it runs on a 1 GB model; gemma4 gives the best explanations.
7. PROTOTYPE / DEMO — describe 3 screenshots (eligibility verdict + checklist; Legal Q&A
   with cited sources; validation 7/7). Leave labelled image placeholders.
8. RESULTS — rules engine passes 7/7 test scenarios; every verdict cites its provision;
   every RAG answer cites clickable sources; runs fully offline.
9. LIMITATIONS & RESPONSIBLE USE — indicative screening, NOT legal advice; ceilings vary
   by state/time; Legal Services Authority makes the final decision; guardrail blocks
   advice; helpline 15100. Avoid unsafe claims in a sensitive domain.
10. CONCLUSION & FUTURE — a working, safe, explainable access-to-justice agent; future:
    multilingual output, fuller RAG corpus, OCR, one-click PLV hand-off. End with the repo URL.

Keep copy tight (max ~30 words/slide, use bullets sparingly). Make the diagrams the hero of
slides 4, 5 and 6. Return ONE HTML artifact with all 10 slides.
```

---

## B) Demo-video script prompt (5–8 minutes)

```
Write a tight 6-minute demo-video script (spoken narration + on-screen action cues) for the
project below. Structure it exactly to these beats and keep the tone calm and credible.
Output as a two-column table: [Time / On-screen action] | [Narration].

PROJECT: "Legal Aid Eligibility & Document Preparation Agent" (AAI capstone, NALSA / LSA Act
1987), runs 100% offline on a local Ollama model. Repo: github.com/infinitule/legal_aid_eligibility_agent

BEATS:
0:00 Hook + problem — millions qualify for free legal aid but don't know it or what to bring.
0:45 Who it's for — the applicant and the DLSA Para-Legal Volunteer.
1:15 Data/source — NALSA S.12 categories + state income ceilings (CSVs) + reference corpus.
1:45 DEMO 1 Eligibility — tick "A woman", enter income; show live verdict "Eligible under
     S.12(c)" + the tailored document checklist; note the mutually-exclusive category tooltips.
3:00 DEMO 2 Legal Q&A (RAG) — ask "What documents should I carry to apply at the DLSA?";
     show the grounded answer and the CLICKABLE cited sources; open one source doc.
4:15 Where the AI is (and isn't) — deterministic rules engine decides eligibility; the model
     only rephrases + does RAG; show the guardrail refusing an advice question.
5:00 Validation — click "Run 7 scenarios" → 7/7; show the exportable JSON log.
5:30 Responsible use + offline story — not legal advice; final call is the DLSA's; runs on a
     local model with no data leaving the device; helpline 15100.
5:50 Close — recap + repo link.

Add a one-line "record these first" shot list at the end.
```

---

### Assets to drop into the deck / video
- `screenshots/01_eligibility.png` — verdict + checklist
- `screenshots/06_exclusivity.png` — mutually-exclusive categories + tooltip
- `screenshots/07_qa_sources.png` — Legal Q&A grounded answer + cited sources
- `screenshots/02_validation.png` — 7/7 scenarios + log
- Diagrams: see the mermaid flows in `docs/architecture.md` and the README.
