# Limitations & Responsible Use

## This is not legal advice
The agent provides an **indicative eligibility screening** and a **document checklist** only. It does not give legal advice, predict case outcomes, or recommend legal strategy. The **final eligibility decision always rests with the Legal Services Authority (SLSA/DLSA)** and a human PLV/lawyer.

## Guardrails in the system
- **Legal-advice guardrail** (`guardrailScan`): detects requests such as "will I win?", "should I sue?", "represent me", "best strategy", and refuses them with a human hand-off message.
- **AI cannot change the verdict:** eligibility is computed by the deterministic rules engine. The local model is only given the finished verdict to rephrase, so it cannot declare someone eligible/ineligible on its own.
- **Fallback:** if the local model is unavailable, the rule-based plain-language summary is still shown — the app never depends on the LLM for a correct answer.

## Known limitations
1. **Indicative income ceilings.** The state ceilings in `data/state_income_ceilings.csv` are representative starter values. Real ceilings vary by state and are revised periodically — always verify with the SLSA/DLSA.
2. **Not exhaustive.** Section 12 and state schemes contain nuances (special circumstances, discretionary admission) that a short questionnaire cannot fully capture. A "may not qualify" result does **not** mean an application will be rejected.
3. **AI wording can be imperfect.** Small local models can occasionally phrase things loosely. The **verdict + statutory citation** are the source of truth, not the prose.
4. **Document Helper reads text only.** Scanned/image-only PDFs need OCR or pasted text; the tool does not perform legal analysis of the document.
5. **Performance.** On CPU-only machines a model call can take up to a couple of minutes; the deterministic screening and checklist are instant and need no model.
6. **Scope.** Built for Indian legal aid under the LSA Act, 1987 / NALSA. Not applicable to other jurisdictions.

## Data & privacy
- Runs **fully offline**: the UI is vendored locally and the model runs on-device via Ollama. **No applicant data is sent to any external server.**
- The screening log is stored only in the browser's `localStorage` and can be cleared or exported by the user.

## Safe-use reminders shown in the app
- A persistent "Not legal advice" banner with the **NALSA helpline 15100**.
- The verdict is labelled "indicative screening result".
- Every screening explains the governing provision so the user (and a PLV) can check the reasoning.

## Responsible-use statement
This is an educational capstone, not an official NALSA product. It should be used to **orient** an applicant and speed up intake, always followed by a human review at a Legal Services Authority.
