const {
  useState,
  useEffect,
  useRef,
  useMemo
} = React;

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
const DEFAULT_MODEL = "qwen3.5:0.8b";
function getModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
}
function setModel(m) {
  try {
    localStorage.setItem(MODEL_KEY, m);
  } catch {}
}
async function askModel(userMsg, systemMsg = "", maxTokens = 800) {
  const messages = [];
  if (systemMsg) messages.push({
    role: "system",
    content: systemMsg
  });
  messages.push({
    role: "user",
    content: userMsg
  });
  const body = {
    model: getModel(),
    stream: false,
    think: false,
    options: {
      num_predict: maxTokens
    },
    messages
  };
  let res;
  try {
    res = await fetch(MODEL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error("Cannot reach local model. Start Ollama (ollama serve) and pull the model: ollama pull " + getModel());
  }
  const data = await res.json().catch(() => ({}));
  if (data.error) throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Local model error");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const text = data.message?.content?.trim();
  if (!text) throw new Error("Empty model response");
  return text;
}
async function extractText(file) {
  const n = file.name.toLowerCase();
  if (n.endsWith(".docx")) {
    const ab = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({
      arrayBuffer: ab
    });
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
    const pdf = await window.pdfjsLib.getDocument({
      data: ab
    }).promise;
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
    fetch("http://localhost:11434/api/tags").then(r => r.json()).then(d => {
      const names = (d.models || []).map(m => m.name).sort();
      setModels(names);
      setStatus(names.length ? 'ok' : 'empty');
    }).catch(() => setStatus('offline'));
  }, []);
  const onChange = e => {
    setCurrent(e.target.value);
    setModel(e.target.value);
  };
  const options = models.length ? models : [current];
  return /*#__PURE__*/React.createElement("div", {
    className: "path-config"
  }, /*#__PURE__*/React.createElement("label", null, "Local model ", status === 'ok' ? '· online' : status === 'offline' ? '· offline' : ''), /*#__PURE__*/React.createElement("select", {
    value: current,
    onChange: onChange,
    style: {
      width: '100%',
      padding: '6px',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '12px',
      background: 'var(--paper-light)',
      border: '1px solid var(--border)',
      borderRadius: '4px',
      color: 'var(--ink)'
    }
  }, options.map(m => /*#__PURE__*/React.createElement("option", {
    key: m,
    value: m
  }, m))), /*#__PURE__*/React.createElement("small", null, status === 'offline' ? "Ollama not reachable. Run: OLLAMA_ORIGINS='*' ollama serve" : "Runs fully offline via Ollama. No API key, no cost."));
}

// ============================================================
// DOMAIN DATA — NALSA / Legal Services Authorities Act, 1987
// ============================================================
const LA_LOG_KEY = 'LA_eligibility_log';

// Section 12 statutory categories (a)–(g) qualify regardless of income.
// Senior citizen / transgender are state-scheme based (indicative).
const NALSA_CATEGORIES = [{
  id: 'scst',
  label: 'Member of a Scheduled Caste or Scheduled Tribe',
  cite: 'S.12(a)'
}, {
  id: 'trafficking',
  label: 'Victim of human trafficking or begar (forced labour)',
  cite: 'S.12(b) · Art.23'
}, {
  id: 'woman',
  label: 'A woman',
  cite: 'S.12(c)'
}, {
  id: 'child',
  label: 'A child (under 18 years)',
  cite: 'S.12(c)'
}, {
  id: 'disability',
  label: 'A person with disability',
  cite: 'S.12(d)'
}, {
  id: 'disaster',
  label: 'Victim of mass disaster, ethnic / caste violence, flood, drought, earthquake or industrial disaster',
  cite: 'S.12(e)'
}, {
  id: 'workman',
  label: 'An industrial workman',
  cite: 'S.12(f)'
}, {
  id: 'custody',
  label: 'A person in custody (jail, protective / juvenile home, psychiatric facility)',
  cite: 'S.12(g)'
}, {
  id: 'senior',
  label: 'A senior citizen (state scheme)',
  cite: 'State scheme'
}, {
  id: 'transgender',
  label: 'A transgender person (state scheme)',
  cite: 'State scheme'
}];
const CATEGORICAL_IDS = ['scst', 'trafficking', 'woman', 'child', 'disability', 'disaster', 'workman', 'custody'];
const STATE_SCHEME_IDS = ['senior', 'transgender'];

// Indicative annual-income ceilings under S.12(h). These vary by state and are
// revised periodically — the applicant MUST verify with their SLSA/DLSA.
const INCOME_CEILINGS = {
  'Supreme Court (SCLSC)': 900000,
  'Delhi': 100000,
  'Maharashtra': 300000,
  'Karnataka': 100000,
  'Tamil Nadu': 300000,
  'Uttar Pradesh': 100000,
  'West Bengal': 100000,
  'Rajasthan': 150000,
  'Other State (default)': 300000
};
const MATTER_TYPES = [{
  id: 'criminal',
  label: 'Criminal defence / bail'
}, {
  id: 'family',
  label: 'Family / domestic violence / maintenance'
}, {
  id: 'property',
  label: 'Property / land / civil dispute'
}, {
  id: 'labour',
  label: 'Labour / employment / wages'
}, {
  id: 'consumer',
  label: 'Consumer complaint'
}, {
  id: 'welfare',
  label: 'Government welfare / pension / benefits'
}, {
  id: 'other',
  label: 'Other / not sure'
}];
const DOC_FOR_CAT = {
  scst: {
    name: 'Caste certificate (SC/ST)',
    why: 'Required to claim eligibility under S.12(a)'
  },
  child: {
    name: 'Proof of age / birth certificate',
    why: 'Confirms the applicant is a child — S.12(c)'
  },
  disability: {
    name: 'Disability certificate (UDID card)',
    why: 'Required for eligibility under S.12(d)'
  },
  disaster: {
    name: 'FIR / official certificate of the incident',
    why: 'Confirms victim status under S.12(e)'
  },
  trafficking: {
    name: 'FIR / rescue or rehabilitation record',
    why: 'Confirms victim status under S.12(b)'
  },
  workman: {
    name: 'Employment proof / ESI card / wage slip',
    why: 'Confirms industrial-workman status — S.12(f)'
  },
  custody: {
    name: 'Custody reference from jail / home authority',
    why: 'Confirms person-in-custody status — S.12(g)'
  },
  senior: {
    name: 'Age proof showing 60+ years',
    why: 'For senior-citizen state schemes'
  }
};
const MATTER_DOCS = {
  criminal: [{
    name: 'Copy of FIR / charge-sheet',
    why: 'Identifies the case against you'
  }, {
    name: 'Bail order / arrest memo (if any)',
    why: 'Shows current custody status'
  }, {
    name: 'Short written summary of the facts',
    why: 'Helps the legal-aid lawyer prepare'
  }],
  family: [{
    name: 'Marriage certificate / proof of relationship',
    why: 'Establishes the relationship'
  }, {
    name: 'Any DV complaint or protection-order copies',
    why: 'Records prior proceedings'
  }, {
    name: "Children's birth certificates (if relevant)",
    why: 'For maintenance or custody claims'
  }, {
    name: "Proof of respondent's income (if known)",
    why: 'For computing maintenance'
  }],
  property: [{
    name: 'Title deed / sale agreement / lease',
    why: 'Establishes your property interest'
  }, {
    name: 'Mutation entries / tax receipts',
    why: 'Shows possession or ownership record'
  }, {
    name: 'Prior notices or correspondence',
    why: 'Background of the dispute'
  }],
  labour: [{
    name: 'Appointment letter / employee ID',
    why: 'Proves the employment relationship'
  }, {
    name: 'Salary slips / wage record',
    why: 'Quantifies the claim'
  }, {
    name: 'Termination / suspension letter (if any)',
    why: 'The action being challenged'
  }],
  consumer: [{
    name: 'Bill / invoice / receipt',
    why: 'Proof of the transaction'
  }, {
    name: 'Warranty / guarantee card',
    why: 'Basis of the claim'
  }, {
    name: 'Correspondence with the seller',
    why: 'Shows the grievance was raised'
  }],
  welfare: [{
    name: 'Relevant scheme / pension document',
    why: 'Identifies the benefit claimed'
  }, {
    name: 'Rejection / non-payment communication',
    why: 'The grievance being raised'
  }, {
    name: 'Bank passbook / account proof',
    why: 'For disbursal of the benefit'
  }],
  other: [{
    name: 'Any documents related to your problem',
    why: 'The intake officer will identify specifics'
  }]
};
function fmtINR(n) {
  try {
    return Number(n).toLocaleString('en-IN');
  } catch {
    return String(n);
  }
}
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
  hardCats.forEach(c => provisions.push({
    cite: c.cite,
    label: c.label,
    basis: 'category'
  }));
  if (incomeOk) provisions.push({
    cite: 'S.12(h)',
    label: `Annual income ₹${fmtINR(a.income)} is within the ₹${fmtINR(ceiling)} ceiling`,
    basis: 'income'
  });
  schemeCats.forEach(c => provisions.push({
    cite: c.cite,
    label: c.label,
    basis: 'scheme'
  }));
  let status;
  if (hardCats.length || incomeOk) status = 'eligible';else if (schemeCats.length) status = 'likely';else if (!hasIncome) status = 'review';else status = 'no';
  let notes;
  if (status === 'eligible') notes = 'You appear to qualify for free legal aid. The Legal Services Authority makes the final determination.';else if (status === 'likely') notes = 'You may qualify under a state-specific scheme. Confirm with your State / District Legal Services Authority.';else if (status === 'review') notes = 'Add your annual income (or tick any category that applies) for a complete screening.';else notes = `On these inputs you do not meet a standard category and the stated income exceeds the indicative ₹${fmtINR(ceiling)} ceiling for this forum. You may still apply — authorities can consider special circumstances.`;
  return {
    status,
    provisions,
    ceiling,
    notes
  };
}
function buildChecklist(a, r) {
  const groups = [];
  groups.push({
    group: 'Core documents (all applicants)',
    items: [{
      name: 'Completed Legal Services Authority application form',
      why: 'The prescribed NALSA / SLSA intake form'
    }, {
      name: 'Proof of identity — Aadhaar / Voter ID / Passport / Driving Licence',
      why: 'Confirms applicant identity'
    }, {
      name: 'Proof of residence / address',
      why: 'Establishes which DLSA has jurisdiction'
    }, {
      name: 'Two recent passport-size photographs',
      why: 'Attached to the application'
    }, {
      name: 'Self-declaration / affidavit of facts and eligibility',
      why: 'Sworn statement supporting the application'
    }]
  });
  const cats = a.cats || {};
  const checked = Object.keys(cats).filter(k => cats[k]);
  const catItems = [];
  checked.forEach(id => {
    if (DOC_FOR_CAT[id]) catItems.push(DOC_FOR_CAT[id]);
  });
  if (a.income !== null && a.income !== undefined && !isNaN(a.income)) {
    catItems.push({
      name: 'Income certificate / BPL or ration card / affidavit of income',
      why: 'Supports income-based eligibility under S.12(h)'
    });
  }
  if (catItems.length) groups.push({
    group: 'Eligibility-specific documents',
    items: catItems
  });
  const md = MATTER_DOCS[a.matter] || MATTER_DOCS.other;
  groups.push({
    group: 'Documents for your matter',
    items: md
  });
  return groups;
}

// legal-advice guardrail: screen for requests that cross into advice / prediction
function guardrailScan(text) {
  if (!text || !text.trim()) return {
    blocked: false,
    reason: ''
  };
  const t = text.toLowerCase();
  const advice = [/will i win/, /can i win/, /my chances/, /chances of winning/, /should i (sue|file|plead|settle|appeal|fight)/, /what should i do/, /best (argument|strategy|defen[cs]e|option)/, /guarantee/, /predict/, /represent me/, /be my lawyer/, /draft my (petition|plaint|reply|case)/, /give me legal advice/, /how do i beat/];
  const hit = advice.some(re => re.test(t));
  return {
    blocked: hit,
    reason: hit ? 'Your message asks for case-specific legal advice or an outcome prediction.' : ''
  };
}
function explainPlain(a, r, cl) {
  const head = {
    eligible: 'You appear ELIGIBLE for free legal aid.',
    likely: 'You are LIKELY eligible under a state scheme.',
    review: 'We need a little more information to complete your screening.',
    no: 'Based on these inputs you may NOT meet the standard criteria.'
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
const LA_SCENARIOS = [{
  name: 'Woman, ₹5,00,000, Delhi',
  input: {
    cats: {
      woman: true
    },
    income: 500000,
    forum: 'Delhi',
    matter: 'family'
  },
  expect: 'eligible'
}, {
  name: 'SC man, ₹12,00,000 (income-blind)',
  input: {
    cats: {
      scst: true
    },
    income: 1200000,
    forum: 'Other State (default)',
    matter: 'property'
  },
  expect: 'eligible'
}, {
  name: 'General, ₹2,00,000, default (≤₹3L)',
  input: {
    cats: {},
    income: 200000,
    forum: 'Other State (default)',
    matter: 'consumer'
  },
  expect: 'eligible'
}, {
  name: 'General, ₹8,00,000, Delhi (>₹1L)',
  input: {
    cats: {},
    income: 800000,
    forum: 'Delhi',
    matter: 'property'
  },
  expect: 'no'
}, {
  name: 'Senior citizen, ₹10,00,000',
  input: {
    cats: {
      senior: true
    },
    income: 1000000,
    forum: 'Other State (default)',
    matter: 'welfare'
  },
  expect: 'likely'
}, {
  name: 'No income, no category',
  input: {
    cats: {},
    income: null,
    forum: 'Other State (default)',
    matter: 'other'
  },
  expect: 'review'
}, {
  name: 'Person in custody (income-blind)',
  input: {
    cats: {
      custody: true
    },
    income: null,
    forum: 'Other State (default)',
    matter: 'criminal'
  },
  expect: 'eligible'
}];

// ============================================================
// VIEW 1 — ELIGIBILITY SCREENING + CHECKLIST + VALIDATION/LOGS
// ============================================================
function LegalAidView() {
  const [cats, setCats] = useState({});
  const [income, setIncome] = useState('');
  const [forum, setForum] = useState('Other State (default)');
  const [matter, setMatter] = useState('other');
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [guard, setGuard] = useState(null);
  const [plain, setPlain] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [tests, setTests] = useState(null);
  const [logs, setLogs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LA_LOG_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const toggleCat = id => setCats(p => ({
    ...p,
    [id]: !p[id]
  }));
  const run = () => {
    const a = {
      cats,
      income: income.trim() === '' ? null : Number(income),
      forum,
      matter,
      problem
    };
    const g = guardrailScan(problem);
    const r = assessEligibility(a);
    const cl = buildChecklist(a, r);
    setGuard(g);
    setResult(r);
    setChecklist(cl);
    setPlain(explainPlain(a, r, cl));
    const entry = {
      ts: new Date().toISOString(),
      forum,
      income: a.income,
      matter,
      cats: Object.keys(cats).filter(k => cats[k]),
      status: r.status,
      provisions: r.provisions.map(p => p.cite),
      guardBlocked: g.blocked
    };
    const next = [entry, ...logs].slice(0, 50);
    setLogs(next);
    try {
      localStorage.setItem(LA_LOG_KEY, JSON.stringify(next));
    } catch {}
  };
  const reset = () => {
    setCats({});
    setIncome('');
    setForum('Other State (default)');
    setMatter('other');
    setProblem('');
    setResult(null);
    setChecklist(null);
    setGuard(null);
    setPlain('');
  };
  const runTests = () => setTests(LA_SCENARIOS.map(s => {
    const got = assessEligibility(s.input).status;
    return {
      name: s.name,
      expect: s.expect,
      got,
      pass: got === s.expect
    };
  }));
  const downloadLogs = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = 'legal_aid_logs.json';
    el.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded legal_aid_logs.json');
  };
  const clearLogs = () => {
    setLogs([]);
    try {
      localStorage.removeItem(LA_LOG_KEY);
    } catch {}
  };
  const aiSummary = async () => {
    if (!result) return;
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
      setPlain(out);
      showToast('AI summary generated');
    } catch (e) {
      setPlain(p => p + `\n\n[AI summary unavailable: ${e.message}. The rule-based explanation above still applies.]`);
    } finally {
      setAiBusy(false);
    }
  };
  const ceiling = laCeiling(forum);
  const verdictClass = result ? result.status : '';
  const verdictMain = result ? {
    eligible: 'Eligible for free legal aid',
    likely: 'Likely eligible (state scheme)',
    review: 'More information needed',
    no: 'May not qualify'
  }[result.status] : '';
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "view-header"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "view-title"
  }, "Legal Aid ", /*#__PURE__*/React.createElement("em", null, "Eligibility")), /*#__PURE__*/React.createElement("div", {
    className: "view-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "NALSA"), " · Legal Services Authorities Act, 1987"), /*#__PURE__*/React.createElement("div", null, logs.length, " screening", logs.length === 1 ? '' : 's', " logged"))), /*#__PURE__*/React.createElement("div", {
    className: "la-guard"
  }, /*#__PURE__*/React.createElement("strong", null, "Not legal advice."), "\xA0 This tool screens eligibility for ", /*#__PURE__*/React.createElement("em", null, "free legal aid"), " and lists documents you may need. It does not give legal advice, predict outcomes, or replace a lawyer. Income ceilings are ", /*#__PURE__*/React.createElement("em", null, "indicative"), " and vary by state — your District / State Legal Services Authority makes the final decision. In an emergency, call the NALSA helpline ", /*#__PURE__*/React.createElement("strong", null, "15100"), "."), /*#__PURE__*/React.createElement("div", {
    className: "la-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Eligibility questionnaire"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Answer what you can. Categories (a)–(g) qualify regardless of income; income is only the deciding factor when no category applies."), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Forum / State (for income ceiling)"), /*#__PURE__*/React.createElement("select", {
    className: "la-select",
    value: forum,
    onChange: e => setForum(e.target.value)
  }, Object.keys(INCOME_CEILINGS).map(k => /*#__PURE__*/React.createElement("option", {
    key: k,
    value: k
  }, k, " — ₹", fmtINR(INCOME_CEILINGS[k]))))), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Annual household income (₹) — optional"), /*#__PURE__*/React.createElement("input", {
    className: "la-input",
    type: "number",
    min: "0",
    inputMode: "numeric",
    value: income,
    onChange: e => setIncome(e.target.value),
    placeholder: `e.g. 250000  ·  ceiling here ₹${fmtINR(ceiling)}`
  })), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Which of these describe you?"), /*#__PURE__*/React.createElement("div", {
    className: "la-checks"
  }, NALSA_CATEGORIES.map(c => /*#__PURE__*/React.createElement("label", {
    key: c.id,
    className: `la-check ${cats[c.id] ? 'on' : ''}`
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    checked: !!cats[c.id],
    onChange: () => toggleCat(c.id)
  }), /*#__PURE__*/React.createElement("span", null, c.label, /*#__PURE__*/React.createElement("span", {
    className: "la-cite"
  }, c.cite)))))), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "What is your matter about?"), /*#__PURE__*/React.createElement("select", {
    className: "la-select",
    value: matter,
    onChange: e => setMatter(e.target.value)
  }, MATTER_TYPES.map(m => /*#__PURE__*/React.createElement("option", {
    key: m.id,
    value: m.id
  }, m.label)))), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Briefly describe your problem — optional"), /*#__PURE__*/React.createElement("textarea", {
    className: "la-textarea",
    value: problem,
    onChange: e => setProblem(e.target.value),
    placeholder: "e.g. My landlord locked my house and kept my belongings."
  })), /*#__PURE__*/React.createElement("div", {
    className: "la-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "la-btn",
    onClick: run
  }, "Check eligibility"), /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: reset
  }, "Reset"))), /*#__PURE__*/React.createElement("div", null, guard && guard.blocked && /*#__PURE__*/React.createElement("div", {
    className: "la-guard block"
  }, /*#__PURE__*/React.createElement("strong", null, "I can't advise on legal strategy or outcomes."), "\xA0 ", guard.reason, " I can only screen eligibility and prepare your document checklist. For advice on your case you'll be connected to a Legal Aid lawyer or Para-Legal Volunteer through your DLSA."), !result ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, "Fill the questionnaire and select ", /*#__PURE__*/React.createElement("strong", null, "Check eligibility"), " to see your result, the governing NALSA provision, and a tailored document checklist.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: `la-verdict ${verdictClass}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-vlabel"
  }, "Indicative screening result"), /*#__PURE__*/React.createElement("div", {
    className: "la-vmain"
  }, verdictMain), /*#__PURE__*/React.createElement("div", {
    className: "la-vbody"
  }, result.notes), result.provisions.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "la-prov"
  }, result.provisions.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "la-prov-item"
  }, /*#__PURE__*/React.createElement("strong", null, p.cite), " ", /*#__PURE__*/React.createElement("span", {
    className: "la-cite"
  }, "[", p.basis, "]"), /*#__PURE__*/React.createElement("br", null), p.label)))), /*#__PURE__*/React.createElement("div", {
    className: "la-panel",
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Document checklist"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Carry originals plus one photocopy of each. A PLV at the DLSA can certify copies."), checklist.map((g, gi) => /*#__PURE__*/React.createElement("div", {
    key: gi,
    className: "la-clgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-clhead"
  }, g.group), g.items.map((it, ii) => /*#__PURE__*/React.createElement("div", {
    key: ii,
    className: "la-clitem"
  }, /*#__PURE__*/React.createElement("span", {
    className: "la-box"
  }), /*#__PURE__*/React.createElement("span", null, it.name, /*#__PURE__*/React.createElement("span", {
    className: "la-why"
  }, it.why))))))), /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Plain-language summary"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Rule-based explanation. Optionally regenerate with your local model (Ollama) — the verdict above is fixed by the rules engine; the model only rephrases it."), /*#__PURE__*/React.createElement("div", {
    className: "prose",
    style: {
      marginBottom: 14
    }
  }, plain), /*#__PURE__*/React.createElement("div", {
    className: "la-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: aiSummary,
    disabled: aiBusy
  }, aiBusy ? 'Generating…' : 'Regenerate with AI')))))), /*#__PURE__*/React.createElement("div", {
    className: "section-head",
    style: {
      marginTop: 34
    }
  }, "Validation & Logs"), /*#__PURE__*/React.createElement("div", {
    className: "section-sub"
  }, "Built-in test scenarios prove the rules engine; every screening is logged for evaluation."), /*#__PURE__*/React.createElement("div", {
    className: "la-grid",
    style: {
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Test scenarios"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Asserts the engine returns the expected verdict for representative cases."), /*#__PURE__*/React.createElement("div", {
    className: "la-actions",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: runTests
  }, "Run ", LA_SCENARIOS.length, " scenarios"), tests && /*#__PURE__*/React.createElement("span", {
    className: "la-pill"
  }, tests.filter(t => t.pass).length, "/", tests.length, " passing")), tests && tests.map((t, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: `la-test ${t.pass ? 'pass' : 'fail'}`
  }, /*#__PURE__*/React.createElement("span", null, t.name), /*#__PURE__*/React.createElement("span", {
    className: "la-tv"
  }, t.pass ? '✓ ' : '✗ ', t.got, t.pass ? '' : ` (≠ ${t.expect})`)))), /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Screening log"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Stored locally in your browser. Download as JSON for your evaluation sheet."), /*#__PURE__*/React.createElement("div", {
    className: "la-actions",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: downloadLogs,
    disabled: !logs.length
  }, "Download JSON"), /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: clearLogs,
    disabled: !logs.length
  }, "Clear")), logs.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "empty-state",
    style: {
      padding: '18px'
    }
  }, "No screenings yet.") : /*#__PURE__*/React.createElement("div", {
    style: {
      maxHeight: 280,
      overflowY: 'auto',
      border: '1px solid var(--border)',
      borderRadius: 3
    }
  }, logs.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "la-logrow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "la-ts"
  }, l.ts.slice(0, 19).replace('T', ' ')), " · ", /*#__PURE__*/React.createElement("strong", null, l.status.toUpperCase()), " · ", l.forum, " · ₹", l.income == null ? '—' : fmtINR(l.income), " · ", l.matter, l.provisions.length > 0 && ' · ' + l.provisions.join(', '), l.guardBlocked && ' · ⚠ advice-guardrail', l.cats.length > 0 && /*#__PURE__*/React.createElement("span", null, " · [", l.cats.join(', '), "]")))))));
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
  const onFile = async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr('');
    setName(f.name);
    try {
      const t = await extractText(f);
      setText(t);
      showToast(`Loaded ${f.name} (${t.length.toLocaleString()} chars)`);
    } catch (ex) {
      setErr(ex.message || 'Could not read that file.');
    }
  };
  const explain = async () => {
    const g = guardrailScan(text);
    setGuardMsg(g.blocked ? g.reason : '');
    if (!text.trim()) {
      setErr('Paste or upload a document first.');
      return;
    }
    setErr('');
    setBusy(true);
    setOut('');
    const clipped = text.slice(0, 8000);
    try {
      const res = await askModel(`Document${name ? ` (${name})` : ''}:\n"""\n${clipped}\n"""\n\nExplain this document in plain language for the person who received it.`, DOC_SYSTEM, 900);
      setOut(res);
      showToast('Explanation ready');
    } catch (ex) {
      setErr(ex.message || 'Model error.');
    } finally {
      setBusy(false);
    }
  };
  const clear = () => {
    setText('');
    setName('');
    setOut('');
    setErr('');
    setGuardMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "view-header"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "view-title"
  }, "Document ", /*#__PURE__*/React.createElement("em", null, "Helper")), /*#__PURE__*/React.createElement("div", {
    className: "view-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Plain-language"), " · on-device AI"), /*#__PURE__*/React.createElement("div", null, "PDF · DOCX · text"))), /*#__PURE__*/React.createElement("div", {
    className: "la-guard"
  }, /*#__PURE__*/React.createElement("strong", null, "Explanation only, not advice."), "\xA0 This reads a legal notice or letter you received and explains it in simple words. It does not tell you what to do about your case — take the document to your DLSA or a Para-Legal Volunteer for that. Documents are processed ", /*#__PURE__*/React.createElement("em", null, "on your device"), " by the local model; nothing is uploaded to any server."), /*#__PURE__*/React.createElement("div", {
    className: "la-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Your document"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Upload a PDF/DOCX legal notice or paste the text. Long documents are trimmed to the first ~8,000 characters."), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Upload a file — optional"), /*#__PURE__*/React.createElement("input", {
    ref: fileRef,
    type: "file",
    accept: ".pdf,.docx,.txt",
    onChange: onFile,
    style: {
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: '12px'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "la-field"
  }, /*#__PURE__*/React.createElement("label", null, "Document text ", name && /*#__PURE__*/React.createElement("span", {
    className: "la-cite"
  }, name)), /*#__PURE__*/React.createElement("textarea", {
    className: "la-textarea",
    style: {
      minHeight: 220
    },
    value: text,
    onChange: e => setText(e.target.value),
    placeholder: "Paste the text of the legal notice, summons, or letter here…"
  })), err && /*#__PURE__*/React.createElement("div", {
    className: "la-guard block"
  }, /*#__PURE__*/React.createElement("strong", null, "Couldn't process:"), "\xA0 ", err), /*#__PURE__*/React.createElement("div", {
    className: "la-actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "la-btn",
    onClick: explain,
    disabled: busy
  }, busy ? 'Reading…' : 'Explain in plain language'), /*#__PURE__*/React.createElement("button", {
    className: "la-btn ghost",
    onClick: clear
  }, "Clear"))), /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "Plain-language explanation"), /*#__PURE__*/React.createElement("div", {
    className: "la-sub"
  }, "Generated by your local model. Slower on CPU — a page can take up to a couple of minutes."), guardMsg && /*#__PURE__*/React.createElement("div", {
    className: "la-guard block"
  }, /*#__PURE__*/React.createElement("strong", null, "Note:"), "\xA0 ", guardMsg, " I'll still explain the document, but for advice on what to do, please see a DLSA lawyer."), out ? /*#__PURE__*/React.createElement("div", {
    className: "prose",
    style: {
      whiteSpace: 'pre-wrap'
    }
  }, out) : /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, "Upload or paste a document and select ", /*#__PURE__*/React.createElement("strong", null, "Explain in plain language"), "."))));
}

// ============================================================
// VIEW 3 — ABOUT (problem, users, how it works, responsible use)
// ============================================================
function AboutView() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "view-header"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "view-title"
  }, "About this ", /*#__PURE__*/React.createElement("em", null, "Agent")), /*#__PURE__*/React.createElement("div", {
    className: "view-meta"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "AAI Capstone"), " · Access to Justice"), /*#__PURE__*/React.createElement("div", null, "Offline · local model"))), /*#__PURE__*/React.createElement("div", {
    className: "la-grid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "The problem"), /*#__PURE__*/React.createElement("div", {
    className: "prose"
  }, "Many citizens do not know whether they qualify for ", /*#__PURE__*/React.createElement("strong", null, "free legal aid"), ", or which documents they need to apply. Legal-aid rules (the Legal Services Authorities Act, 1987 and NALSA schemes) are hard to read, and income ceilings differ by state. People give up, or pay money they cannot afford."), /*#__PURE__*/React.createElement("h3", {
    style: {
      marginTop: 18
    }
  }, "Who it helps"), /*#__PURE__*/React.createElement("div", {
    className: "prose"
  }, "Applicants and the Para-Legal Volunteers (PLVs) who do intake at District Legal Services Authorities — as a fast, consistent first screening before a human takes over."), /*#__PURE__*/React.createElement("h3", {
    style: {
      marginTop: 18
    }
  }, "Data / reference source"), /*#__PURE__*/React.createElement("div", {
    className: "prose"
  }, "NALSA reference material — ", /*#__PURE__*/React.createElement("strong", null, "Section 12"), " categories of the Legal Services Authorities Act, 1987 and indicative state income ceilings (nalsa.gov.in). Ceilings are encoded as indicative starter values that the user verifies with their SLSA/DLSA.")), /*#__PURE__*/React.createElement("div", {
    className: "la-panel"
  }, /*#__PURE__*/React.createElement("h3", null, "How it works"), /*#__PURE__*/React.createElement("div", {
    className: "prose"
  }, /*#__PURE__*/React.createElement("strong", null, "1. Deterministic rules engine."), " Eligibility is decided by code, not the model — Section 12(a)–(g) categories qualify regardless of income; income only decides when no category applies. This makes the verdict correct and repeatable, and it's covered by built-in test scenarios.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "2. Document checklist builder."), " Generates a checklist tailored to the applicant's category and matter type.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "3. AI layer (local model)."), " The model only ", /*#__PURE__*/React.createElement("em", null, "rephrases"), " the rules-engine verdict into plain, supportive language, and explains uploaded legal documents. It never decides eligibility.", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("strong", null, "4. Legal-advice guardrail."), " Requests for case strategy or outcome predictions are detected and refused, with a hand-off to a human lawyer."), /*#__PURE__*/React.createElement("h3", {
    style: {
      marginTop: 18
    }
  }, "Responsible use & limitations"), /*#__PURE__*/React.createElement("div", {
    className: "prose"
  }, "This is an ", /*#__PURE__*/React.createElement("strong", null, "indicative screening tool, not legal advice"), ". Income ceilings vary by state and change over time. The final decision always rests with the Legal Services Authority. The AI explanation can occasionally be imperfect — the deterministic verdict and citations are the source of truth. Runs fully offline on a local model, so sensitive intake data stays on the user's device."))));
}

// ============================================================
// ROOT
// ============================================================
function App() {
  const [view, setView] = useState('screening');
  const NAV = [{
    id: 'screening',
    icon: '✚',
    label: 'Eligibility'
  }, {
    id: 'documents',
    icon: '❖',
    label: 'Document Helper'
  }, {
    id: 'about',
    icon: 'ℹ',
    label: 'About'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "app"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "sidebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crest"
  }, "National Legal Services Authority"), /*#__PURE__*/React.createElement("div", {
    className: "case-no"
  }, "Legal Aid"), /*#__PURE__*/React.createElement("div", {
    className: "case-title"
  }, "Eligibility & Document Preparation Agent"), /*#__PURE__*/React.createElement("div", {
    className: "meta-block"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Track"), " · AAI Capstone"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Basis"), " · LSA Act, 1987"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Source"), " · NALSA (S.12)"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Runs"), " · Offline / local"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, "Helpline"), " · 15100")), /*#__PURE__*/React.createElement("div", {
    className: "nav-label"
  }, "Workspace"), NAV.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    className: `nav-item ${view === n.id ? 'active' : ''}`,
    onClick: () => setView(n.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "nav-icon"
  }, n.icon), n.label)), /*#__PURE__*/React.createElement(ModelPicker, null)), /*#__PURE__*/React.createElement("main", {
    className: "main"
  }, view === 'screening' && /*#__PURE__*/React.createElement(LegalAidView, null), view === 'documents' && /*#__PURE__*/React.createElement(DocumentHelperView, null), view === 'about' && /*#__PURE__*/React.createElement(AboutView, null)));
}

// ============================================================
// MOUNT
// ============================================================
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/React.createElement(App, null));