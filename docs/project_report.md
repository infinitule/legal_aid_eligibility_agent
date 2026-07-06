# Project Report — Legal Aid Eligibility & Document Preparation Agent

**Track:** AAI · **Domain:** Access to justice and support navigation
**Reference:** NALSA — Legal Services Authorities Act, 1987 (Section 12) · https://nalsa.gov.in/

---

## 1. Problem Understanding & Stakeholders

**Problem.** Free legal aid exists in India for crores of people, but eligibility rules and document requirements are opaque. A person does not know (a) *am I eligible?* and (b) *what do I bring?* The rules live in a statute (S.12 of the LSA Act, 1987) plus state-specific income ceilings that change over time.

**Users / stakeholders.**
- **Primary:** a citizen considering applying for free legal aid — often low-income, first-time, not legally literate.
- **Secondary:** the **Para-Legal Volunteer (PLV)** or intake clerk at a District Legal Services Authority (DLSA), who can use the tool as a fast, consistent first screen before a human decision.

**Success criteria.** Correct, explainable eligibility screening with the governing citation; an accurate, tailored document checklist; a clear "what to do next"; and hard safety boundaries (no legal advice, human makes the final call).

## 2. Data / Reference Material

The knowledge base is derived from **NALSA reference material** and encoded as auditable CSVs in `/data`:

| File | Contents |
|---|---|
| `nalsa_section12_categories.csv` | The S.12(a)–(g) statutory categories (income-blind) and the state-scheme categories (senior citizen, transgender). |
| `state_income_ceilings.csv` | Indicative annual-income ceilings by forum/state (Supreme Court, Delhi, Maharashtra, …, default). |
| `document_requirements.csv` | Core documents (all applicants), category-specific documents, and matter-specific documents. |
| `sample_intake.csv` | **Synthetic** fictional applicants used to validate the rules engine. |

Ceilings are flagged as *indicative* — they vary by state and are revised periodically; the applicant verifies with their SLSA/DLSA.

## 3. Working Workflow (input → output)

1. The applicant fills a short **questionnaire**: forum/state, optional annual income, applicable categories, matter type, and a free-text description.
2. The **agent controller** runs the deterministic **rules engine** (`assessEligibility`) and the **checklist builder** (`buildChecklist`).
3. The **guardrail** (`guardrailScan`) inspects the free-text for advice/outcome requests and refuses them.
4. The app produces a **structured result**: verdict (`eligible` / `likely` / `review` / `no`), the governing **provision citations**, a grouped **document checklist**, and a **plain-language summary**.
5. The screening is **logged** to `localStorage` and can be exported as JSON for the evaluation sheet.
6. Optionally, the local model **rephrases** the summary in supportive plain language.

## 4. AI / Agent / Software Logic

- **Deterministic core (software logic).** Eligibility and the checklist are pure functions — no model in the decision path. This is the correct engineering choice for a sensitive legal domain: the output is repeatable, auditable, and unit-tested.
- **AI component (local LLM via Ollama).**
  1. *Plain-language rephrasing* of the rules-engine verdict (system prompt pins it to 6th-grade reading level, supportive tone, no advice, and it is **given** the verdict to explain — it cannot overturn it).
  2. *Document Helper* — extracts text from an uploaded PDF/DOCX notice and asks the model to explain what the document is, what it asks, any deadline, and what to gather. This is the RAG-style "retrieval over provided document" component.
- **Why AI here is useful, not decorative.** The hard part for a real user is *understanding* — turning "ELIGIBLE under S.12(c)" and a legal notice into words they can act on. That is exactly a language task, and it is fenced so it cannot make an unsafe eligibility claim.

## 5. Output Explanation (simple English)

Example: a woman in Delhi with annual income ₹5,00,000, family matter.
- **Verdict:** *Eligible for free legal aid.*
- **Why:** *S.12(c) — "A woman" qualifies regardless of income.* (The Delhi income ceiling is not even reached, because the category alone qualifies.)
- **Checklist:** core documents (form, ID, address proof, photos, affidavit) + matter documents for a family case (marriage proof, any DV/protection orders, children's certificates, respondent's income).
- **Next step:** visit the nearest DLSA or apply at nalsa.gov.in; a PLV helps fill the form free of charge.

## 6. Validation

- **Built-in test suite** (`LA_SCENARIOS`, mirrored in `data/sample_intake.csv`): 7 representative scenarios covering each verdict branch and each basis (category, income, scheme, review, boundary). The app shows **7/7 passing** via *Run 7 scenarios*.
- **Boundary tests** in the sample data (`₹3,00,000` eligible vs `₹3,00,001` not) confirm the `<=` ceiling logic.
- **Guardrail tests:** phrases like "will I win?", "should I sue?" trigger the advice refusal.
- **Logging:** every screening is recorded (timestamp, inputs, status, provisions, guardrail flag) and exportable as JSON — this is the evaluation sheet.

## 7. Responsible Use & Limitations

See `docs/limitations_and_responsible_use.md`. Headlines: indicative-only, not legal advice; ceilings vary by state; final decision rests with the Legal Services Authority; fully offline so sensitive intake data stays on device; guardrail blocks advice/prediction.

## 8. How AI/agent innovation maps to the brief

| Brief asks for | In this project |
|---|---|
| Eligibility questionnaire | Questionnaire on the Eligibility tab |
| Map to rules from provided documents | Deterministic S.12 rules engine over `/data` reference tables |
| Document checklist | `buildChecklist` — core + category + matter |
| RAG over legal aid docs | Document Helper (text extraction + LLM explanation) |
| Legal-advice guardrail | `guardrailScan` + refusal + human handoff |
| Logs / evaluation sheet | localStorage log + JSON export + 7-scenario test suite |
| Keep humans in control | Verdict is indicative; DLSA/PLV decides; advice refused |

## 9. Conclusion

The project delivers a working, safe, explainable agent for a real access-to-justice need. It combines a deterministic legal-rules core with a fenced local-LLM language layer, runs entirely offline at near-zero cost, and produces an actionable output — verdict, citation, checklist, and next step — rather than stopping at code execution.
