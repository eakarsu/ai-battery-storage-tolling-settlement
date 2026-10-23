// Feature pack: search/filter helpers, CSV/JSON export, labelled display values,
// and domain AI features over the caller's own records with a deterministic
// offline fallback (aiGenerated:false). No provider call is made here; when a
// provider is configured the server may still use its existing AI endpoints.
export const FALLBACK_LABEL = "Deterministic fallback (no AI provider configured) — Deterministic fallback only; validate settlement statements against the tolling agreement before payment.";

export function formatDisplayValue(value) {
  if (value === false) return "No";
  if (value === true) return "Yes";
  if (value === 0) return "0";
  if (value === "") return "— (empty)";
  if (value === null || value === undefined) return "— (not set)";
  if (Array.isArray(value) && !value.length) return "— (none)";
  return String(value);
}

export function filterRecords(records, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (records || []).filter((r) => {
    if (status && String(r.status ?? r.state ?? "") !== status) return false;
    if (risk && String(r.risk ?? "") !== risk) return false;
    if (!needle) return true;
    return [r.reference, r.title, r.subject, r.owner, r.status, r.state, r.risk]
      .some((v) => String(v ?? "").toLowerCase().includes(needle));
  });
}

function csvCell(v) {
  const s = v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function recordsToCSV(records) {
  const cols = ["id","reference","title","subject","status","state","owner","risk","due_date","amount"];
  const head = cols.join(",");
  const lines = (records || []).map((r) => cols.map((c) => csvCell(r[c])).join(","));
  return [head, ...lines].join("\n") + "\n";
}
export function recordsToJSON(records) { return JSON.stringify({ items: records || [] }, null, 2); }

function base(records, id, title, summary, sections) {
  return { id, title, aiGenerated: false, label: FALLBACK_LABEL, provider: "deterministic-fallback",
    summary, sections, recordCount: (records || []).length };
}
function stats(records) {
  const list = records || [];
  const total = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const high = list.filter((r) => ["High","Critical"].includes(String(r.risk || ""))).length;
  const open = list.filter((r) => !["Closed","Approved","closed","approved"].includes(String(r.status ?? r.state ?? ""))).length;
  const missing = list.filter((r) => !r.owner || !(r.due_date || r.dueDate)).length;
  return { count: list.length, total, high, open, missing };
}

export const DOMAIN_INSIGHTS = [
  { id: "settlement-variance", title: "Settlement variance explainer", description: "Explains represented value and open-record concentration behind settlement variances.", run(records) { const s=stats(records); return base(records,"settlement-variance","Settlement variance explainer",`Reviewed ${s.count} of your own records representing ${s.total} in recorded amount, with ${s.open} still open.`,[{title:"Finding",detail:`${s.count} records reviewed; ${s.open} open; recorded amount ${s.total}.`},{title:"Next step",detail:"Open the listed records, validate source evidence, and assign an accountable owner."}]); } },
  { id: "performance-shortfall", title: "Availability and performance shortfall flagger", description: "Flags high-risk open records that may indicate availability or performance shortfalls.", run(records) { const s=stats(records); return base(records,"performance-shortfall","Availability and performance shortfall flagger",`${s.high} of ${s.count} records are High or Critical risk.`,[{title:"Flagged records",detail:String(s.high)},{title:"Next step",detail:"Prioritise flagged records for reviewer attention before closure."}]); } },
  { id: "invoice-reconciliation", title: "Invoice reconciliation helper", description: "Summarises your own records into an invoice reconciliation starting point.", run(records) { const s=stats(records); return base(records,"invoice-reconciliation","Invoice reconciliation helper",`${s.missing} of ${s.count} records are missing an owner or due date.`,[{title:"Incomplete records",detail:String(s.missing)},{title:"Next step",detail:"Complete owner and due-date fields so the record can be governed to closure."}]); } },
];

export function runDomainInsight(id, records) {
  const fn = DOMAIN_INSIGHTS.find((i) => i.id === id);
  if (!fn) return null;
  return fn.run(records || []);
}

export function mountFeaturePack(app, { loadRecords }) {
  app.get("/api/feature-pack/export", async (req, res) => {
    const format = String(req.query.format || "json").toLowerCase();
    const records = filterRecords(await loadRecords(req), req.query);
    if (format === "csv") { res.type("text/csv").set("Content-Disposition", "attachment; filename=records.csv"); return res.send(recordsToCSV(records)); }
    if (format === "json") { res.type("application/json").set("Content-Disposition", "attachment; filename=records.json"); return res.send(recordsToJSON(records)); }
    return res.status(422).json({ error: "format must be csv or json" });
  });
  app.post("/api/feature-pack/insights/:insightId", async (req, res) => {
    const all = await loadRecords(req);
    const ids = Array.isArray(req.body?.recordIds) ? new Set(req.body.recordIds.map(Number)) : null;
    const records = ids ? all.filter((r) => ids.has(Number(r.id))) : all;
    const result = runDomainInsight(req.params.insightId, records);
    if (!result) return res.status(404).json({ error: "Unknown domain insight" });
    return res.json({ result });
  });
  app.get("/api/feature-pack/insights", async (req, res) => {
    const records = await loadRecords(req);
    return res.json({ items: DOMAIN_INSIGHTS.map((i) => ({ id: i.id, title: i.title, description: i.description })), results: DOMAIN_INSIGHTS.map((i) => i.run(records)) });
  });
}
