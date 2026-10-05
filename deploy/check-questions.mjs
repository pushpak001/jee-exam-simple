// Run by GitHub Actions before deploy: stops the deploy if questions.json is broken.
import fs from "fs";
const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];
const qs = JSON.parse(fs.readFileSync(new URL("../questions.json", import.meta.url), "utf8"));
const ids = new Set();
let bad = 0;
qs.forEach((q, i) => {
  const id = q.id ?? i + 1, err = [];
  if (!SUBJECTS.includes(q.subject)) err.push("subject must be Physics / Chemistry / Mathematics");
  if (!q.question) err.push("missing question text");
  if (!Array.isArray(q.options) || q.options.length !== 4) err.push("needs exactly 4 options");
  if (!["A", "B", "C", "D"].includes(String(q.answer).toUpperCase())) err.push("answer must be A, B, C or D");
  if (ids.has(id)) err.push("duplicate id");
  ids.add(id);
  if (err.length) { console.error(`Question ${id}: ${err.join("; ")}`); bad++; }
});
SUBJECTS.forEach((s) => {
  const c = qs.filter((q) => q.subject === s).length;
  if (c !== 30) console.warn(`::warning::${s} has ${c} questions (expected 30)`);
});
if (bad) process.exit(1);
console.log(`questions.json OK (${qs.length} questions)`);
