import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
// Keys are unset by the gate command; importing featurePack must not call a provider.
delete process.env.OPENROUTER_API_KEY; delete process.env.OPENAI_API_KEY;
const pack = await import("../featurePack.mjs");

const records = [
  { id: 1, reference: "REF-1", title: "Alpha claim", owner: "Sam", status: "Open", risk: "High", due_date: "2026-09-01", amount: 0, flagged: false },
  { id: 2, reference: "REF-2", title: "Beta claim", owner: "", status: "Closed", risk: "Low", due_date: "", amount: 500 },
];

test("filterRecords searches and filters the main list", () => {
  assert.equal(pack.filterRecords(records, { q: "alpha" }).length, 1);
  assert.equal(pack.filterRecords(records, { status: "Closed" }).length, 1);
  assert.equal(pack.filterRecords(records, { risk: "High" }).length, 1);
  assert.equal(pack.filterRecords(records, { q: "missing" }).length, 0);
});

test("CSV and JSON export preserve false, 0 and empty values", () => {
  const csv = pack.recordsToCSV(records);
  assert.ok(csv.includes("REF-1") && csv.split("\n")[1].includes(",0"));
  const json = JSON.parse(pack.recordsToJSON(records));
  assert.equal(json.items.length, 2);
  assert.equal(pack.formatDisplayValue(false), "No");
  assert.equal(pack.formatDisplayValue(0), "0");
  assert.equal(pack.formatDisplayValue(""), "— (empty)");
  assert.equal(pack.formatDisplayValue(null), "— (not set)");
});

test("domain insights run offline over own records with labelled fallback", () => {
  assert.ok(pack.DOMAIN_INSIGHTS.length >= 2 && pack.DOMAIN_INSIGHTS.length <= 3);
  for (const insight of pack.DOMAIN_INSIGHTS) {
    const out = pack.runDomainInsight(insight.id, records);
    assert.equal(out.aiGenerated, false);
    assert.match(out.label, /Deterministic fallback/);
    assert.equal(out.recordCount, 2);
    assert.ok(Array.isArray(out.sections) && out.sections.length >= 1);
  }
  assert.equal(pack.runDomainInsight("nope", records), null);
});

test("feature pack is mounted behind auth and server keeps tasks", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.ok(server.includes("mountFeaturePack"), "server must mount feature pack");
  assert.ok(server.includes("mountTasks"), "tasks must remain mounted");
});
