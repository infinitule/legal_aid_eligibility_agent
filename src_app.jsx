const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Legal Aid Eligibility & Document Preparation Agent
// AAI Capstone · NALSA · Legal Services Authorities Act, 1987
// Runs fully offline on a local model (Ollama). No API key, no cost.
// ============================================================

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ============================================================
// LOCAL MODEL (Ollama native /api/chat). No API key, runs offline.
// think:false suppresses the reasoning dump on models like Qwen3 so the
// answer lands in message.content instead of the hidden thinking field.
// ============================================================
const MODEL_ENDPOINT = "http://localhost:11434/api/chat";
const MODEL_KEY = "la_model";
const DEFAULT_MODEL = "gemma4:latest";  // best results here; any installed model is selectable in the sidebar
function getModel() { try { return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; } }
function setModel(m) { try { localStorage.setItem(MODEL_KEY, m); } catch {} }

async function askModel(userMsg, systemMsg = "", maxTokens = 800) {
  const messages = [];
  if (systemMsg) messages.push({ role: "system", content: systemMsg });
  messages.push({ role: "user", content: userMsg });

  const body = {
    model: getModel(),
    stream: false,
    think: false,
    options: { num_predict: maxTokens },
    messages,
  };

  let res;
  try {
    res = await fetch(MODEL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Cannot reach local model. Start Ollama (ollama serve) and pull the model: ollama pull " + getModel());
  }
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : (data.error.message || "Local model error"));
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = data.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}

// ---- Local embeddings + vector retrieval (offline RAG) --------------------
const EMBED_MODEL = "nomic-embed-text";
async function embedQuery(text) {
  const res = await fetch("http://localhost:11434/api/embed", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  const d = await res.json().catch(() => ({}));
  if (d.error) throw new Error(typeof d.error === "string" ? d.error : "Embedding error");
  const e = d.embeddings || d.embedding;
  if (!e) throw new Error("No embedding returned (is '" + EMBED_MODEL + "' pulled?)");
  return Array.isArray(e[0]) ? e[0] : e;
}
function cosineSim(a, b) {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return s / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function extractText(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx")) {
    const ab = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: ab });
    if (!result.value?.trim()) throw new Error("DOCX has no readable text");
    return result.value;
  }
  if (n.endsWith(".pdf")) {
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "vendor/pdf.min.js";
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
          resolve();
        };
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const ab = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map(x => x.str).join(" "));
    }
    const text = pages.join("\n\n").trim();
    if (text.length < 30) throw new Error("PDF appears image-only — paste text instead");
    return text;
  }
  return file.text();
}

// ============================================================
// MODEL PICKER (sidebar)
// ============================================================
function ModelPicker() {
  const [models, setModels] = useState([]);
  const [current, setCurrent] = useState(getModel());
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    fetch("http://localhost:11434/api/tags")
      .then(r => r.json())
      .then(d => {
        const names = (d.models || []).map(m => m.name).sort();
        setModels(names);
        setStatus(names.length ? 'ok' : 'empty');
      })
      .catch(() => setStatus('offline'));
  }, []);

  const onChange = (e) => { setCurrent(e.target.value); setModel(e.target.value); };
  const options = models.length ? models : [current];

  return (
    <div className="path-config">
      <label>Local model {status === 'ok' ? '· online' : status === 'offline' ? '· offline' : ''}</label>
      <select value={current} onChange={onChange}
              style={{width:'100%',padding:'6px',fontFamily:'JetBrains Mono, monospace',fontSize:'12px',
                      background:'var(--paper-light)',border:'1px solid var(--border)',borderRadius:'4px',color:'var(--ink)'}}>
        {options.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <small>{status === 'offline'
        ? "Ollama not reachable. Run: OLLAMA_ORIGINS='*' ollama serve"
        : "Runs fully offline via Ollama. No API key, no cost."}</small>
    </div>
  );
}

// ============================================================
// DOMAIN DATA — NALSA / Legal Services Authorities Act, 1987
// ============================================================
const LA_LOG_KEY = 'LA_eligibility_log';

// Section 12 statutory categories (a)–(g) qualify regardless of income.
// Senior citizen / transgender are state-scheme based (indicative).
const NALSA_CATEGORIES = [
  { id:'scst',        label:'Member of a Scheduled Caste or Scheduled Tribe',                          cite:'S.12(a)' },
  { id:'trafficking', label:'Victim of human trafficking or begar (forced labour)',                    cite:'S.12(b) · Art.23' },
  { id:'woman',       label:'A woman',                                                                 cite:'S.12(c)' },
  { id:'child',       label:'A child (under 18 years)',                                                cite:'S.12(c)' },
  { id:'disability',  label:'A person with disability',                                                cite:'S.12(d)' },
  { id:'disaster',    label:'Victim of mass disaster, ethnic / caste violence, flood, drought, earthquake or industrial disaster', cite:'S.12(e)' },
  { id:'workman',     label:'An industrial workman',                                                   cite:'S.12(f)' },
  { id:'custody',     label:'A person in custody (jail, protective / juvenile home, psychiatric facility)', cite:'S.12(g)' },
  { id:'senior',      label:'A senior citizen (state scheme)',                                          cite:'State scheme' },
  { id:'transgender', label:'A transgender person (state scheme)',                                      cite:'State scheme' },
];
const CATEGORICAL_IDS = ['scst','trafficking','woman','child','disability','disaster','workman','custody'];
const STATE_SCHEME_IDS = ['senior','transgender'];

// Mutually-contradictory self-descriptors. A single applicant cannot be two of
// these at the same time, so ticking one makes the conflicting ones unselectable
// (with a short reason on hover). Only genuine contradictions are listed — real
// combinations like "senior + woman" or "woman + disability" stay allowed.
const CONFLICT_REASON = {
  'woman|child':        "A woman is an adult and a child is under 18 — the same person can't be both.",
  'woman|transgender':  "‘A woman’ (S.12(c)) and ‘transgender’ (state scheme) are separate categories — pick the one you're applying under.",
  'child|senior':       "A child is under 18 and a senior citizen is 60+ — nobody is both at once.",
  'child|transgender':  "For an applicant under 18, tick ‘a child’; the transgender state scheme is a separate adult-identity category.",
};
function conflictKey(a, b) { return [a, b].sort().join('|'); }
// Adjacency built from the reason keys (symmetric).
const CATEGORY_CONFLICTS = (() => {
  const m = {};
  Object.keys(CONFLICT_REASON).forEach(k => {
    const [a, b] = k.split('|');
    (m[a] = m[a] || {})[b] = CONFLICT_REASON[k];
    (m[b] = m[b] || {})[a] = CONFLICT_REASON[k];
  });
  return m;
})();

// Indicative annual-income ceilings under S.12(h). These vary by state and are
// revised periodically — the applicant MUST verify with their SLSA/DLSA.
const INCOME_CEILINGS = {
  'Supreme Court (SCLSC)':   900000,
  'Delhi':                   100000,
  'Maharashtra':             300000,
  'Karnataka':               100000,
  'Tamil Nadu':              300000,
  'Uttar Pradesh':           100000,
  'West Bengal':             100000,
  'Rajasthan':               150000,
  'Other State (default)':   300000,
};

const MATTER_TYPES = [
  { id:'criminal', label:'Criminal defence / bail' },
  { id:'family',   label:'Family / domestic violence / maintenance' },
  { id:'property', label:'Property / land / civil dispute' },
  { id:'labour',   label:'Labour / employment / wages' },
  { id:'consumer', label:'Consumer complaint' },
  { id:'welfare',  label:'Government welfare / pension / benefits' },
  { id:'other',    label:'Other / not sure' },
];

const DOC_FOR_CAT = {
  scst:        { name:'Caste certificate (SC/ST)',                         why:'Required to claim eligibility under S.12(a)' },
  child:       { name:'Proof of age / birth certificate',                  why:'Confirms the applicant is a child — S.12(c)' },
  disability:  { name:'Disability certificate (UDID card)',                why:'Required for eligibility under S.12(d)' },
  disaster:    { name:'FIR / official certificate of the incident',        why:'Confirms victim status under S.12(e)' },
  trafficking: { name:'FIR / rescue or rehabilitation record',             why:'Confirms victim status under S.12(b)' },
  workman:     { name:'Employment proof / ESI card / wage slip',           why:'Confirms industrial-workman status — S.12(f)' },
  custody:     { name:'Custody reference from jail / home authority',      why:'Confirms person-in-custody status — S.12(g)' },
  senior:      { name:'Age proof showing 60+ years',                       why:'For senior-citizen state schemes' },
};

const MATTER_DOCS = {
  criminal: [
    { name:'Copy of FIR / charge-sheet',              why:'Identifies the case against you' },
    { name:'Bail order / arrest memo (if any)',       why:'Shows current custody status' },
    { name:'Short written summary of the facts',      why:'Helps the legal-aid lawyer prepare' },
  ],
  family: [
    { name:'Marriage certificate / proof of relationship', why:'Establishes the relationship' },
    { name:'Any DV complaint or protection-order copies',  why:'Records prior proceedings' },
    { name:"Children's birth certificates (if relevant)",  why:'For maintenance or custody claims' },
    { name:"Proof of respondent's income (if known)",      why:'For computing maintenance' },
  ],
  property: [
    { name:'Title deed / sale agreement / lease',     why:'Establishes your property interest' },
    { name:'Mutation entries / tax receipts',         why:'Shows possession or ownership record' },
    { name:'Prior notices or correspondence',         why:'Background of the dispute' },
  ],
  labour: [
    { name:'Appointment letter / employee ID',        why:'Proves the employment relationship' },
    { name:'Salary slips / wage record',              why:'Quantifies the claim' },
    { name:'Termination / suspension letter (if any)',why:'The action being challenged' },
  ],
  consumer: [
    { name:'Bill / invoice / receipt',                why:'Proof of the transaction' },
    { name:'Warranty / guarantee card',               why:'Basis of the claim' },
    { name:'Correspondence with the seller',          why:'Shows the grievance was raised' },
  ],
  welfare: [
    { name:'Relevant scheme / pension document',      why:'Identifies the benefit claimed' },
    { name:'Rejection / non-payment communication',   why:'The grievance being raised' },
    { name:'Bank passbook / account proof',           why:'For disbursal of the benefit' },
  ],
  other: [
    { name:'Any documents related to your problem',   why:'The intake officer will identify specifics' },
  ],
};

function fmtINR(n) { try { return Number(n).toLocaleString('en-IN'); } catch { return String(n); } }
function laCeiling(forum) {
  return INCOME_CEILINGS[forum] !== undefined ? INCOME_CEILINGS[forum] : INCOME_CEILINGS['Other State (default)'];
}

// --- pure rules engine (unit-testable) --------------------------------------
function assessEligibility(a) {
  const cats = a.cats || {};
  const checked = Object.keys(cats).filter(k => cats[k]);
  const catObjs = NALSA_CATEGORIES.filter(c => checked.includes(c.id));
  const hardCats = catObjs.filter(c => CATEGORICAL_IDS.includes(c.id));
  const schemeCats = catObjs.filter(c => STATE_SCHEME_IDS.includes(c.id));
  const ceiling = laCeiling(a.forum);
  const hasIncome = a.income !== null && a.income !== undefined && !isNaN(a.income);
  const incomeOk = hasIncome && Number(a.income) <= ceiling;

  const provisions = [];
  hardCats.forEach(c => provisions.push({ cite:c.cite, label:c.label, basis:'category' }));
  if (incomeOk) provisions.push({ cite:'S.12(h)', label:`Annual income ₹${fmtINR(a.income)} is within the ₹${fmtINR(ceiling)} ceiling`, basis:'income' });
  schemeCats.forEach(c => provisions.push({ cite:c.cite, label:c.label, basis:'scheme' }));

  let status;
  if (hardCats.length || incomeOk) status = 'eligible';
  else if (schemeCats.length) status = 'likely';
  else if (!hasIncome) status = 'review';
  else status = 'no';

  let notes;
  if (status === 'eligible') notes = 'You appear to qualify for free legal aid. The Legal Services Authority makes the final determination.';
  else if (status === 'likely') notes = 'You may qualify under a state-specific scheme. Confirm with your State / District Legal Services Authority.';
  else if (status === 'review') notes = 'Add your annual income (or tick any category that applies) for a complete screening.';
  else notes = `On these inputs you do not meet a standard category and the stated income exceeds the indicative ₹${fmtINR(ceiling)} ceiling for this forum. You may still apply — authorities can consider special circumstances.`;

  return { status, provisions, ceiling, notes };
}

function buildChecklist(a, r) {
  const groups = [];
  groups.push({ group:'Core documents (all applicants)', items:[
    { name:'Completed Legal Services Authority application form', why:'The prescribed NALSA / SLSA intake form' },
    { name:'Proof of identity — Aadhaar / Voter ID / Passport / Driving Licence', why:'Confirms applicant identity' },
    { name:'Proof of residence / address', why:'Establishes which DLSA has jurisdiction' },
    { name:'Two recent passport-size photographs', why:'Attached to the application' },
    { name:'Self-declaration / affidavit of facts and eligibility', why:'Sworn statement supporting the application' },
  ]});

  const cats = a.cats || {};
  const checked = Object.keys(cats).filter(k => cats[k]);
  const catItems = [];
  checked.forEach(id => { if (DOC_FOR_CAT[id]) catItems.push(DOC_FOR_CAT[id]); });
  if (a.income !== null && a.income !== undefined && !isNaN(a.income)) {
    catItems.push({ name:'Income certificate / BPL or ration card / affidavit of income', why:'Supports income-based eligibility under S.12(h)' });
  }
  if (catItems.length) groups.push({ group:'Eligibility-specific documents', items:catItems });

  const md = MATTER_DOCS[a.matter] || MATTER_DOCS.other;
  groups.push({ group:'Documents for your matter', items:md });
  return groups;
}

// legal-advice guardrail: screen for requests that cross into advice / prediction
function guardrailScan(text) {
  if (!text || !text.trim()) return { blocked:false, reason:'' };
  const t = text.toLowerCase();
  const advice = [
    /will i win/, /can i win/, /my chances/, /chances of winning/,
    /should i (sue|file|plead|settle|appeal|fight)/, /what should i do/,
    /best (argument|strategy|defen[cs]e|option)/, /guarantee/, /predict/,
    /represent me/, /be my lawyer/, /draft my (petition|plaint|reply|case)/,
    /give me legal advice/, /how do i beat/,
  ];
  const hit = advice.some(re => re.test(t));
  return { blocked: hit, reason: hit ? 'Your message asks for case-specific legal advice or an outcome prediction.' : '' };
}

function explainPlain(a, r, cl) {
  const head = {
    eligible:'You appear ELIGIBLE for free legal aid.',
    likely:'You are LIKELY eligible under a state scheme.',
    review:'We need a little more information to complete your screening.',
    no:'Based on these inputs you may NOT meet the standard criteria.',
  }[r.status];
  const lines = [head];
  if (r.provisions.length) lines.push('Basis: ' + r.provisions.map(p => `${p.cite} — ${p.label}`).join('; ') + '.');
  lines.push('');
  lines.push('What this means: Free legal aid in India is provided under the Legal Services Authorities Act, 1987. Final eligibility is decided by your District Legal Services Authority (DLSA). This tool gives an indicative screening only — it is not legal advice.');
  lines.push('');
  const totalDocs = cl.reduce((s, g) => s + g.items.length, 0);
  lines.push(`Next step: Visit your nearest DLSA (usually in the district court complex) or apply online at nalsa.gov.in. Carry the ${totalDocs} documents listed in your checklist. A Para-Legal Volunteer (PLV) will help you fill the form free of charge.`);
  return lines.join('\n');
}

// built-in validation scenarios (acts as the agent's test/eval sheet)
const LA_SCENARIOS = [
  { name:'Woman, ₹5,00,000, Delhi',             input:{ cats:{woman:true},     income:500000,  forum:'Delhi',                 matter:'family'   }, expect:'eligible' },
  { name:'SC man, ₹12,00,000 (income-blind)',   input:{ cats:{scst:true},      income:1200000, forum:'Other State (default)', matter:'property' }, expect:'eligible' },
  { name:'General, ₹2,00,000, default (≤₹3L)',  input:{ cats:{},               income:200000,  forum:'Other State (default)', matter:'consumer' }, expect:'eligible' },
  { name:'General, ₹8,00,000, Delhi (>₹1L)',    input:{ cats:{},               income:800000,  forum:'Delhi',                 matter:'property' }, expect:'no'       },
  { name:'Senior citizen, ₹10,00,000',          input:{ cats:{senior:true},    income:1000000, forum:'Other State (default)', matter:'welfare'  }, expect:'likely'   },
  { name:'No income, no category',              input:{ cats:{},               income:null,    forum:'Other State (default)', matter:'other'    }, expect:'review'   },
  { name:'Person in custody (income-blind)',    input:{ cats:{custody:true},   income:null,    forum:'Other State (default)', matter:'criminal' }, expect:'eligible' },
];

// ============================================================
// VIEW 1 — ELIGIBILITY SCREENING + CHECKLIST + VALIDATION/LOGS
// ============================================================
function LegalAidView() {
  const [cats, setCats] = useState({});
  const [income, setIncome] = useState('');
  const [forum, setForum] = useState('Other State (default)');
  const [matter, setMatter] = useState('other');
  const [problem, setProblem] = useState('');
  const [aiPlain, setAiPlain] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [tests, setTests] = useState(null);
  const [logs, setLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LA_LOG_KEY) || '[]'); } catch { return []; }
  });

  const toggleCat = (id) => setCats(p => ({ ...p, [id]: !p[id] }));

  // Screening derives live from the inputs, so toggling a category or editing
  // income immediately updates the verdict, checklist and summary — no stale panel.
  const applicant = useMemo(
    () => ({ cats, income: income.trim() === '' ? null : Number(income), forum, matter, problem }),
    [cats, income, forum, matter, problem]
  );
  const hasInput = Object.values(cats).some(Boolean) || income.trim() !== '';
  const guard = useMemo(() => guardrailScan(problem), [problem]);
  const result = useMemo(() => assessEligibility(applicant), [applicant]);
  const checklist = useMemo(() => buildChecklist(applicant, result), [applicant, result]);
  // The model may rephrase the summary; any input change reverts to rule-based text.
  useEffect(() => { setAiPlain(''); }, [applicant]);
  const plain = aiPlain || explainPlain(applicant, result, checklist);

  // "Check eligibility" records the current screening to the local log (eval sheet).
  const logScreening = () => {
    const entry = {
      ts: new Date().toISOString(),
      forum, income: applicant.income, matter,
      cats: Object.keys(cats).filter(k => cats[k]),
      status: result.status,
      provisions: result.provisions.map(p => p.cite),
      guardBlocked: guard.blocked,
    };
    const next = [entry, ...logs].slice(0, 50);
    setLogs(next);
    try { localStorage.setItem(LA_LOG_KEY, JSON.stringify(next)); } catch {}
    showToast('Screening logged');
  };

  const reset = () => {
    setCats({}); setIncome(''); setForum('Other State (default)'); setMatter('other');
    setProblem(''); setAiPlain('');
  };

  const runTests = () => setTests(LA_SCENARIOS.map(s => {
    const got = assessEligibility(s.input).status;
    return { name:s.name, expect:s.expect, got, pass: got === s.expect };
  }));

  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a'); el.href = url; el.download = 'legal_aid_logs.json'; el.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded legal_aid_logs.json');
  };
  const clearLogs = () => { setLogs([]); try { localStorage.removeItem(LA_LOG_KEY); } catch {} };

  const aiSummary = async () => {
    if (!hasInput) return;
    setAiBusy(true);
    const sys = "You are a legal-aid intake assistant for India's NALSA system. Explain eligibility in plain, supportive language at a 6th-grade reading level. You do NOT give legal advice, predict case outcomes, or recommend legal strategy. End by noting that a Legal Services Authority makes the final decision.";
    const facts = `Applicant facts:
- Forum: ${forum}
- Annual income: ${income || 'not stated'}
- Categories ticked: ${Object.keys(cats).filter(k => cats[k]).join(', ') || 'none'}
- Matter type: ${matter}

Deterministic eligibility result: ${result.status.toUpperCase()} under ${result.provisions.map(p => p.cite).join(', ') || '—'}.

Write a short, two-paragraph plain-language explanation of what this means and the next step to apply at the District Legal Services Authority. Do not give legal advice.`;
    try {
      const out = await askModel(facts, sys, 700);
      setAiPlain(out);
      showToast('AI summary generated');
    } catch (e) {
      setAiPlain(plain + `\n\n[AI summary unavailable: ${e.message}. The rule-based explanation above still applies.]`);
    } finally { setAiBusy(false); }
  };

  const ceiling = laCeiling(forum);
  const verdictClass = result ? result.status : '';
  const verdictMain = result ? ({
    eligible:'Eligible for free legal aid', likely:'Likely eligible (state scheme)',
    review:'More information needed', no:'May not qualify',
  })[result.status] : '';

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Legal Aid <em>Eligibility</em></h1>
        <div className="view-meta">
          <div><strong>NALSA</strong> · Legal Services Authorities Act, 1987</div>
          <div>{logs.length} screening{logs.length === 1 ? '' : 's'} logged</div>
        </div>
      </div>

      <div className="la-guard">
        <strong>Not legal advice.</strong>&nbsp; This tool screens eligibility for <em>free legal aid</em> and lists documents you may need. It does not give legal advice, predict outcomes, or replace a lawyer. Income ceilings are <em>indicative</em> and vary by state — your District / State Legal Services Authority makes the final decision. In an emergency, call the NALSA helpline <strong>15100</strong>.
      </div>

      <div className="la-grid">
        {/* ---------- LEFT: questionnaire ---------- */}
        <div className="la-panel">
          <h3>Eligibility questionnaire</h3>
          <div className="la-sub">Answer what you can. Categories (a)–(g) qualify regardless of income; income is only the deciding factor when no category applies.</div>

          <div className="la-field">
            <label>Forum / State (for income ceiling)</label>
            <select className="la-select" value={forum} onChange={e => setForum(e.target.value)}>
              {Object.keys(INCOME_CEILINGS).map(k => (
                <option key={k} value={k}>{k} — ₹{fmtINR(INCOME_CEILINGS[k])}</option>
              ))}
            </select>
          </div>

          <div className="la-field">
            <label>Annual household income (₹) — optional</label>
            <input className="la-input" type="number" min="0" inputMode="numeric"
                   value={income} onChange={e => setIncome(e.target.value)}
                   placeholder={`e.g. 250000  ·  ceiling here ₹${fmtINR(ceiling)}`} />
          </div>

          <div className="la-field">
            <label>Which of these describe you?</label>
            <div className="la-checks">
              {NALSA_CATEGORIES.map(c => {
                const selected = !!cats[c.id];
                let reason = '';
                if (!selected && CATEGORY_CONFLICTS[c.id]) {
                  for (const other of Object.keys(cats)) {
                    if (cats[other] && CATEGORY_CONFLICTS[c.id][other]) { reason = CATEGORY_CONFLICTS[c.id][other]; break; }
                  }
                }
                const disabled = !!reason;
                return (
                  <label key={c.id} className={`la-check ${selected ? 'on' : ''} ${disabled ? 'disabled' : ''}`}>
                    <input type="checkbox" checked={selected} disabled={disabled}
                           onChange={() => { if (!disabled) toggleCat(c.id); }} />
                    <span>{c.label}<span className="la-cite">{c.cite}</span></span>
                    {disabled && <span className="la-tip" role="tooltip">🔒 {reason}</span>}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="la-field">
            <label>What is your matter about?</label>
            <select className="la-select" value={matter} onChange={e => setMatter(e.target.value)}>
              {MATTER_TYPES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div className="la-field">
            <label>Briefly describe your problem — optional</label>
            <textarea className="la-textarea" value={problem} onChange={e => setProblem(e.target.value)}
                      placeholder="e.g. My landlord locked my house and kept my belongings." />
          </div>

          <div className="la-actions">
            <button className="la-btn" onClick={logScreening} disabled={!hasInput}>Check &amp; log screening</button>
            <button className="la-btn ghost" onClick={reset}>Reset</button>
          </div>
          <div className="la-sub" style={{ marginTop: 8 }}>Results update live as you answer. Use <strong>Check &amp; log</strong> to save this screening to the log.</div>
        </div>

        {/* ---------- RIGHT: results ---------- */}
        <div>
          {guard && guard.blocked && (
            <div className="la-guard block">
              <strong>I can't advise on legal strategy or outcomes.</strong>&nbsp; {guard.reason} I can only screen eligibility and prepare your document checklist. For advice on your case you'll be connected to a Legal Aid lawyer or Para-Legal Volunteer through your DLSA.
            </div>
          )}

          {!hasInput ? (
            <div className="empty-state">Answer the questionnaire (tick a category or enter your income) to see your result, the governing NALSA provision, and a tailored document checklist — updated live.</div>
          ) : (
            <>
              <div className={`la-verdict ${verdictClass}`}>
                <div className="la-vlabel">Indicative screening result</div>
                <div className="la-vmain">{verdictMain}</div>
                <div className="la-vbody">{result.notes}</div>
                {result.provisions.length > 0 && (
                  <div className="la-prov">
                    {result.provisions.map((p, i) => (
                      <div key={i} className="la-prov-item">
                        <strong>{p.cite}</strong> <span className="la-cite">[{p.basis}]</span><br/>{p.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="la-panel" style={{ marginBottom:18 }}>
                <h3>Document checklist</h3>
                <div className="la-sub">Carry originals plus one photocopy of each. A PLV at the DLSA can certify copies.</div>
                {checklist.map((g, gi) => (
                  <div key={gi} className="la-clgroup">
                    <div className="la-clhead">{g.group}</div>
                    {g.items.map((it, ii) => (
                      <div key={ii} className="la-clitem">
                        <span className="la-box" />
                        <span>{it.name}<span className="la-why">{it.why}</span></span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <div className="la-panel">
                <h3>Plain-language summary</h3>
                <div className="la-sub">Rule-based explanation. Optionally regenerate with your local model (Ollama) — the verdict above is fixed by the rules engine; the model only rephrases it.</div>
                <div className="prose" style={{ marginBottom:14 }}>{plain}</div>
                <div className="la-actions">
                  <button className="la-btn ghost" onClick={aiSummary} disabled={aiBusy}>
                    {aiBusy ? 'Generating…' : 'Regenerate with AI'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- validation + logs ---------- */}
      <div className="section-head" style={{ marginTop:34 }}>Validation & Logs</div>
      <div className="section-sub">Built-in test scenarios prove the rules engine; every screening is logged for evaluation.</div>

      <div className="la-grid" style={{ marginTop:14 }}>
        <div className="la-panel">
          <h3>Test scenarios</h3>
          <div className="la-sub">Asserts the engine returns the expected verdict for representative cases.</div>
          <div className="la-actions" style={{ marginBottom:14 }}>
            <button className="la-btn ghost" onClick={runTests}>Run {LA_SCENARIOS.length} scenarios</button>
            {tests && <span className="la-pill">{tests.filter(t => t.pass).length}/{tests.length} passing</span>}
          </div>
          {tests && tests.map((t, i) => (
            <div key={i} className={`la-test ${t.pass ? 'pass' : 'fail'}`}>
              <span>{t.name}</span>
              <span className="la-tv">{t.pass ? '✓ ' : '✗ '}{t.got}{t.pass ? '' : ` (≠ ${t.expect})`}</span>
            </div>
          ))}
        </div>

        <div className="la-panel">
          <h3>Screening log</h3>
          <div className="la-sub">Stored locally in your browser. Download as JSON for your evaluation sheet.</div>
          <div className="la-actions" style={{ marginBottom:14 }}>
            <button className="la-btn ghost" onClick={downloadLogs} disabled={!logs.length}>Download JSON</button>
            <button className="la-btn ghost" onClick={clearLogs} disabled={!logs.length}>Clear</button>
          </div>
          {logs.length === 0
            ? <div className="empty-state" style={{ padding:'18px' }}>No screenings yet.</div>
            : <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid var(--border)', borderRadius:3 }}>
                {logs.map((l, i) => (
                  <div key={i} className="la-logrow">
                    <span className="la-ts">{l.ts.slice(0,19).replace('T',' ')}</span> · <strong>{l.status.toUpperCase()}</strong> · {l.forum} · ₹{l.income == null ? '—' : fmtINR(l.income)} · {l.matter}
                    {l.provisions.length > 0 && ' · ' + l.provisions.join(', ')}
                    {l.guardBlocked && ' · ⚠ advice-guardrail'}
                    {l.cats.length > 0 && <span> · [{l.cats.join(', ')}]</span>}
                  </div>
                ))}
              </div>
          }
        </div>
      </div>
    </>
  );
}

// ============================================================
// VIEW 2 — DOCUMENT HELPER (AI plain-language explainer over an uploaded doc)
// ============================================================
const DOC_SYSTEM = "You are a legal-aid document assistant for India's NALSA system. A person with no legal training has shared a legal document (notice, summons, court order, or government letter). Explain it in plain, supportive language at a 6th-grade reading level. Cover: (1) what kind of document this is, (2) what it is asking or telling the person, (3) any date or deadline mentioned, (4) which documents they should gather. You do NOT give legal advice, predict outcomes, or recommend legal strategy. End by advising them to take it to their District Legal Services Authority (DLSA) or a Para-Legal Volunteer. If the text is unclear, say so.";

function DocumentHelperView() {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [guardMsg, setGuardMsg] = useState('');
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(''); setName(f.name);
    try {
      const t = await extractText(f);
      setText(t);
      showToast(`Loaded ${f.name} (${t.length.toLocaleString()} chars)`);
    } catch (ex) {
      setErr(ex.message || 'Could not read that file.');
    }
  };

  const explain = async () => {
    // Note: the advice guardrail screens user *requests* (Eligibility problem box,
    // Legal Q&A). It is intentionally NOT run on an uploaded document's body — a
    // legal notice naturally contains words like "appeal" or "defence", which are
    // not the user asking for advice. The DOC_SYSTEM prompt keeps output to
    // explanation only.
    if (!text.trim()) { setErr('Paste or upload a document first.'); return; }
    setErr(''); setBusy(true); setOut('');
    const clipped = text.slice(0, 8000);
    try {
      const res = await askModel(`Document${name ? ` (${name})` : ''}:\n"""\n${clipped}\n"""\n\nExplain this document in plain language for the person who received it.`, DOC_SYSTEM, 900);
      setOut(res);
      showToast('Explanation ready');
    } catch (ex) {
      setErr(ex.message || 'Model error.');
    } finally { setBusy(false); }
  };

  const clear = () => { setText(''); setName(''); setOut(''); setErr(''); setGuardMsg(''); if (fileRef.current) fileRef.current.value = ''; };

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Document <em>Helper</em></h1>
        <div className="view-meta">
          <div><strong>Plain-language</strong> · on-device AI</div>
          <div>PDF · DOCX · text</div>
        </div>
      </div>

      <div className="la-guard">
        <strong>Explanation only, not advice.</strong>&nbsp; This reads a legal notice or letter you received and explains it in simple words. It does not tell you what to do about your case — take the document to your DLSA or a Para-Legal Volunteer for that. Documents are processed <em>on your device</em> by the local model; nothing is uploaded to any server.
      </div>

      <div className="la-grid">
        <div className="la-panel">
          <h3>Your document</h3>
          <div className="la-sub">Upload a PDF/DOCX legal notice or paste the text. Long documents are trimmed to the first ~8,000 characters.</div>

          <div className="la-field">
            <label>Upload a file — optional</label>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" onChange={onFile}
                   style={{fontFamily:'JetBrains Mono, monospace', fontSize:'12px'}} />
          </div>

          <div className="la-field">
            <label>Document text {name && <span className="la-cite">{name}</span>}</label>
            <textarea className="la-textarea" style={{ minHeight:220 }} value={text}
                      onChange={e => setText(e.target.value)}
                      placeholder="Paste the text of the legal notice, summons, or letter here…" />
          </div>

          {err && <div className="la-guard block"><strong>Couldn't process:</strong>&nbsp; {err}</div>}

          <div className="la-actions">
            <button className="la-btn" onClick={explain} disabled={busy}>{busy ? 'Reading…' : 'Explain in plain language'}</button>
            <button className="la-btn ghost" onClick={clear}>Clear</button>
          </div>
        </div>

        <div className="la-panel">
          <h3>Plain-language explanation</h3>
          <div className="la-sub">Generated by your local model. Slower on CPU — a page can take up to a couple of minutes.</div>
          {guardMsg && <div className="la-guard block"><strong>Note:</strong>&nbsp; {guardMsg} I'll still explain the document, but for advice on what to do, please see a DLSA lawyer.</div>}
          {out
            ? <div className="prose" style={{ whiteSpace:'pre-wrap' }}>{out}</div>
            : <div className="empty-state">Upload or paste a document and select <strong>Explain in plain language</strong>.</div>}
        </div>
      </div>
    </>
  );
}

// ============================================================
// VIEW 3 — ABOUT (problem, users, how it works, responsible use)
// ============================================================
function AboutView() {
  return (
    <>
      <div className="view-header">
        <h1 className="view-title">About this <em>Agent</em></h1>
        <div className="view-meta">
          <div><strong>AAI Capstone</strong> · Access to Justice</div>
          <div>Offline · local model</div>
        </div>
      </div>

      <div className="la-grid">
        <div className="la-panel">
          <h3>The problem</h3>
          <div className="prose">Many citizens do not know whether they qualify for <strong>free legal aid</strong>, or which documents they need to apply. Legal-aid rules (the Legal Services Authorities Act, 1987 and NALSA schemes) are hard to read, and income ceilings differ by state. People give up, or pay money they cannot afford.</div>
          <h3 style={{ marginTop:18 }}>Who it helps</h3>
          <div className="prose">Applicants and the Para-Legal Volunteers (PLVs) who do intake at District Legal Services Authorities — as a fast, consistent first screening before a human takes over.</div>
          <h3 style={{ marginTop:18 }}>Data / reference source</h3>
          <div className="prose">NALSA reference material — <strong>Section 12</strong> categories of the Legal Services Authorities Act, 1987 and indicative state income ceilings (nalsa.gov.in). Ceilings are encoded as indicative starter values that the user verifies with their SLSA/DLSA. A curated corpus of reference notes (in <code>data/corpus</code>) is embedded locally to power the grounded <strong>Legal Q&amp;A</strong>.</div>
        </div>

        <div className="la-panel">
          <h3>How it works</h3>
          <div className="prose">
            <strong>1. Deterministic rules engine.</strong> Eligibility is decided by code, not the model — Section 12(a)–(g) categories qualify regardless of income; income only decides when no category applies. This makes the verdict correct and repeatable, and it's covered by built-in test scenarios.<br/><br/>
            <strong>2. Document checklist builder.</strong> Generates a checklist tailored to the applicant's category and matter type.<br/><br/>
            <strong>3. AI layer (local model).</strong> The model only <em>rephrases</em> the rules-engine verdict into plain, supportive language, and explains uploaded legal documents. It never decides eligibility.<br/><br/>
            <strong>4. Offline vector RAG (Legal Q&amp;A).</strong> A corpus of NALSA / LSA-Act reference notes is chunked and embedded locally with <em>nomic-embed-text</em>. A question is embedded, matched by cosine similarity to the most relevant passages, and answered by the local model <em>grounded in and citing those passages</em> — fully on-device.<br/><br/>
            <strong>5. Legal-advice guardrail.</strong> Requests for case strategy or outcome predictions are detected and refused, with a hand-off to a human lawyer.
          </div>
          <h3 style={{ marginTop:18 }}>Responsible use & limitations</h3>
          <div className="prose">This is an <strong>indicative screening tool, not legal advice</strong>. Income ceilings vary by state and change over time. The final decision always rests with the Legal Services Authority. The AI explanation can occasionally be imperfect — the deterministic verdict and citations are the source of truth. Runs fully offline on a local model, so sensitive intake data stays on the user's device.</div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// VIEW 3 — LEGAL Q&A (offline vector RAG over the NALSA corpus)
// ============================================================
const RAG_SYSTEM = "You are a legal-aid information assistant for India's NALSA system. Answer ONLY using the numbered reference passages provided. Cite the passages you rely on like [1], [2]. If the answer is not in the passages, say you do not have that information and suggest contacting the District Legal Services Authority (DLSA). Use plain, supportive language at a 6th-grade reading level. Do NOT give case-specific legal advice or predict outcomes. End by noting that a Legal Services Authority makes the final decision.";

const RAG_SAMPLES = [
  "Does a woman with a high income qualify for free legal aid?",
  "What documents should I carry to apply at the DLSA?",
  "Is there any court fee in a Lok Adalat?",
  "What help is available for a victim of trafficking?",
];

function RagView() {
  const [index, setIndex] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [guardMsg, setGuardMsg] = useState('');

  useEffect(() => {
    fetch('data/rag_index.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(setIndex)
      .catch(e => setLoadErr('Could not load the knowledge base (data/rag_index.json). Run: python3 build_rag.py  · ' + e.message));
  }, []);

  const ask = async (question) => {
    const query = (question != null ? question : q).trim();
    if (question != null) setQ(query);
    if (!query) { setErr('Type a question first.'); return; }
    if (!index) { setErr('Knowledge base not loaded yet.'); return; }
    const g = guardrailScan(query);
    setGuardMsg(g.blocked ? g.reason : '');
    setErr(''); setBusy(true); setAnswer(''); setSources([]);
    try {
      const qv = await embedQuery(query);
      const scored = index.chunks
        .map(c => ({ c, score: cosineSim(qv, c.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);
      setSources(scored.map((s, i) => ({ n: i + 1, score: s.score, source: s.c.source, section: s.c.section, text: s.c.text })));
      const context = scored.map((s, i) => `[${i + 1}] (${s.c.source})\n${s.c.text}`).join('\n\n');
      const prompt = `Reference passages:\n${context}\n\nQuestion: ${query}\n\nAnswer using only the passages above, citing them like [1], [2].`;
      const res = await askModel(prompt, RAG_SYSTEM, 700);
      setAnswer(res);
      showToast('Answer grounded in ' + scored.length + ' passages');
    } catch (ex) {
      setErr(ex.message || 'Retrieval/model error.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">Legal <em>Q&amp;A</em></h1>
        <div className="view-meta">
          <div><strong>Offline RAG</strong> · local embeddings</div>
          <div>{index ? `${index.count} passages · ${EMBED_MODEL}` : 'loading…'}</div>
        </div>
      </div>

      <div className="la-guard">
        <strong>Grounded answers, not legal advice.</strong>&nbsp; This answers general questions about legal aid using a local knowledge base of NALSA / Legal Services Authorities Act reference notes. Every answer cites the passages it used. It runs fully on-device (local embeddings + local model) and does not give case-specific advice.
      </div>

      {loadErr && <div className="la-guard block"><strong>Knowledge base not loaded:</strong>&nbsp; {loadErr}</div>}

      <div className="la-grid">
        <div className="la-panel">
          <h3>Ask a question</h3>
          <div className="la-sub">Questions about eligibility, documents, how to apply, schemes, or Lok Adalats.</div>
          <div className="la-field">
            <textarea className="la-textarea" value={q} onChange={e => setQ(e.target.value)}
                      placeholder="e.g. What documents do I need to apply for free legal aid?" />
          </div>
          <div className="la-actions" style={{ marginBottom: 10 }}>
            <button className="la-btn" onClick={() => ask()} disabled={busy || !index}>{busy ? 'Retrieving…' : 'Ask'}</button>
            <button className="la-btn ghost" onClick={() => { setQ(''); setAnswer(''); setSources([]); setErr(''); setGuardMsg(''); }}>Clear</button>
          </div>
          <div className="la-sub">Try:</div>
          <div>
            {RAG_SAMPLES.map((s, i) => (
              <div key={i} className="la-logrow" style={{ cursor: 'pointer' }} onClick={() => ask(s)}>→ {s}</div>
            ))}
          </div>
          {err && <div className="la-guard block" style={{ marginTop: 12 }}><strong>Error:</strong>&nbsp; {err}</div>}
        </div>

        <div className="la-panel">
          <h3>Answer</h3>
          <div className="la-sub">Generated by your local model, grounded in the retrieved passages.</div>
          {guardMsg && <div className="la-guard block"><strong>Note:</strong>&nbsp; {guardMsg} I'll answer the general question from the reference notes, but for advice on your specific case please see a DLSA lawyer.</div>}
          {answer
            ? <div className="prose" style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>{answer}</div>
            : <div className="empty-state">Ask a question to get an answer grounded in the NALSA reference notes.</div>}

          {sources.length > 0 && (
            <>
              <div className="section-sub" style={{ marginTop: 4, marginBottom: 8 }}>Retrieved sources — click a filename to open the reference document</div>
              {sources.map(s => (
                <div key={s.n} className="la-clgroup">
                  <div className="la-clhead">
                    [{s.n}]{' '}
                    <a href={`data/corpus/${s.source}`} target="_blank" rel="noopener noreferrer" className="la-srclink">
                      {s.source} ↗
                    </a>
                    {s.section ? <span className="la-cite"> · {s.section}</span> : null}
                    <span className="la-cite"> · similarity {s.score.toFixed(3)}</span>
                  </div>
                  <div className="la-why" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{s.text}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ============================================================
// ROOT
// ============================================================
function App() {
  const [view, setView] = useState('screening');

  const NAV = [
    { id: 'screening', icon: '✚', label: 'Eligibility' },
    { id: 'qa',        icon: '?', label: 'Legal Q&A' },
    { id: 'documents', icon: '❖', label: 'Document Helper' },
    { id: 'about',     icon: 'ℹ', label: 'About' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="crest">National Legal Services Authority</div>
        <div className="case-no">Legal Aid</div>
        <div className="case-title">Eligibility &amp; Document Preparation Agent</div>

        <div className="meta-block">
          <div><strong>Track</strong> · AAI Capstone</div>
          <div><strong>Basis</strong> · LSA Act, 1987</div>
          <div><strong>Source</strong> · NALSA (S.12)</div>
          <div><strong>Runs</strong> · Offline / local</div>
          <div><strong>Helpline</strong> · 15100</div>
        </div>

        <div className="nav-label">Workspace</div>
        {NAV.map(n => (
          <div key={n.id}
               className={`nav-item ${view === n.id ? 'active' : ''}`}
               onClick={() => setView(n.id)}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </div>
        ))}

        <ModelPicker />
      </aside>

      <main className="main">
        {view === 'screening' && <LegalAidView />}
        {view === 'qa' && <RagView />}
        {view === 'documents' && <DocumentHelperView />}
        {view === 'about' && <AboutView />}
      </main>
    </div>
  );
}

// ============================================================
// MOUNT
// ============================================================
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
