import "dotenv/config";
import express from "express";
import jwt from "jsonwebtoken";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { cfg, DB_NAME } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET = process.env.JWT_SECRET || "change-me";
const TEST_SECONDS = Number(process.env.TEST_MINUTES || 120) * 60;
const MAX_VIOLATIONS = Number(process.env.MAX_TAB_SWITCHES || 3);
const SUBJECTS = ["Physics", "Chemistry", "Mathematics"];

/* ---------- questions.json (answers stay on the server) ---------- */
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8"));
const list = raw.map((q, i) => ({ id: q.id ?? i + 1, subject: q.subject, text: q.question, options: q.options, answer: String(q.answer).trim().toUpperCase() }));
list.forEach((q) => {
  if (!SUBJECTS.includes(q.subject)) throw new Error(`Question ${q.id}: subject must be ${SUBJECTS.join(" / ")}`);
  if (!Array.isArray(q.options) || q.options.length !== 4) throw new Error(`Question ${q.id}: needs exactly 4 options`);
  if (!"ABCD".includes(q.answer) || q.answer.length !== 1) throw new Error(`Question ${q.id}: answer must be A, B, C or D`);
});
if (new Set(list.map((q) => q.id)).size !== list.length) throw new Error("Duplicate ids in questions.json");
const QUESTIONS = SUBJECTS.flatMap((s) => list.filter((q) => q.subject === s));
console.log(`Loaded ${QUESTIONS.length} questions`);

/* ---------- running-test info (start time + tab switches), kept in a small file ----------
   The database has only two tables (users, score), so this lives here.
   It is saved to sessions.json so a server restart does not reset students' timers. */
const SESS_FILE = process.env.SESSIONS_FILE || path.join(__dirname, "sessions.json");
const sessions = new Map();
try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(SESS_FILE, "utf8")))) sessions.set(k, v); } catch {}
const persist = () => { try { fs.writeFileSync(SESS_FILE, JSON.stringify(Object.fromEntries(sessions))); } catch (e) { console.error("Could not save sessions.json:", e.message); } };

/* ---------- connect to RDS, create database + the two tables ---------- */
let pool;
try {
  const boot = await mysql.createConnection(cfg);
  await boot.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
  await boot.end();
  pool = mysql.createPool({ ...cfg, database: DB_NAME, connectionLimit: 10 });

  const [[old]] = await pool.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = ? AND table_name = 'users' AND column_name = 'password_hash'", [DB_NAME]);
  if (old.n) throw Object.assign(new Error(`Database "${DB_NAME}" has the OLD table layout. Set a new DB_NAME in .env (e.g. jeeexam2) or drop the old tables 'attempts' and 'users'.`), { code: "OLD_SCHEMA" });

  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    login_id VARCHAR(50) PRIMARY KEY,
    password VARCHAR(100) NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS score (
    login_id VARCHAR(50) PRIMARY KEY,
    marks INT NOT NULL,
    FOREIGN KEY (login_id) REFERENCES users(login_id) ON DELETE CASCADE)`);

  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM users");
  if (!n) {
    await pool.query("INSERT INTO users (login_id, password) VALUES (?,?)", ["student1", "pass123"]);
    console.log("Demo user created: student1 / pass123");
  }
  console.log(`Connected to MySQL (${cfg.host}) database "${DB_NAME}"`);
} catch (e) {
  console.error("\nDatabase problem:", e.code || "", e.message);
  if (e.code === "ETIMEDOUT") console.error("-> RDS security group must allow inbound MySQL (3306) from your IP, and the instance must be Publicly accessible.");
  if (e.code === "ER_ACCESS_DENIED_ERROR") console.error("-> Check DB_USER / DB_PASS in .env");
  if (e.code === "ENOTFOUND") console.error("-> Check DB_HOST in .env (RDS endpoint)");
  process.exit(1);
}

/* ---------- API ---------- */
const app = express();
app.use(express.json());
app.get("/health", (req, res) => res.send("ok"));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));   // the only static file served

const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || "").replace("Bearer ", ""), SECRET); next(); }
  catch { res.status(401).json({ error: "Session expired. Please login again." }); }
};
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: "Server error" }); });
const hasScore = async (id) => (await pool.query("SELECT 1 FROM score WHERE login_id = ?", [id]))[0].length > 0;
const passwordOk = (input, stored) => input === stored;   // plain-text password, as stored in the users table

// LOGIN: checked against the `users` table only
app.post("/api/login", wrap(async (req, res) => {
  const loginId = String(req.body.loginId || "").trim(), password = String(req.body.password || "");
  const [rows] = await pool.query("SELECT login_id, password FROM users WHERE login_id = ?", [loginId]);
  if (!rows[0] || !passwordOk(password, rows[0].password)) return res.status(401).json({ error: "Invalid Login ID or Password." });
  const id = rows[0].login_id;
  res.json({ token: jwt.sign({ loginId: id }, SECRET, { expiresIn: "4h" }), name: id,
    alreadySubmitted: await hasScore(id), inProgress: sessions.has(id) });
}));

// START: begins the 2-hour clock once; resuming gives the remaining time
app.post("/api/start", auth, wrap(async (req, res) => {
  const id = req.user.loginId;
  if (await hasScore(id)) return res.status(403).json({ error: "You have already submitted this test." });
  if (!sessions.has(id)) { sessions.set(id, { start: Date.now(), violations: 0 }); persist(); }
  const s = sessions.get(id);
  res.json({
    secondsLeft: Math.max(0, TEST_SECONDS - Math.floor((Date.now() - s.start) / 1000)),
    violations: s.violations, maxViolations: MAX_VIOLATIONS,
    questions: QUESTIONS.map(({ id, subject, text, options }) => ({ id, subject, text, options })),   // no answers
  });
}));

// tab / window switch counter (server-side, so a page refresh cannot reset it)
app.post("/api/violation", auth, wrap(async (req, res) => {
  const s = sessions.get(req.user.loginId);
  if (!s) return res.status(403).json({ error: "No active test." });
  s.violations++; persist();
  res.json({ count: s.violations, max: MAX_VIOLATIONS, terminate: s.violations >= MAX_VIOLATIONS });
}));

// SUBMIT: marks calculated on the server (+4 / -1) and saved in `score` (login_id, marks)
app.post("/api/submit", auth, wrap(async (req, res) => {
  const id = req.user.loginId, answers = req.body.answers || {};
  const s = sessions.get(id);
  if (!s) return res.status(400).json({ error: (await hasScore(id)) ? "You have already submitted this test." : "Test not started." });

  const sub = Object.fromEntries(SUBJECTS.map((x) => [x, { c: 0, w: 0, u: 0, m: 0 }]));
  for (const q of QUESTIONS) {
    const a = answers[q.id], t = sub[q.subject];
    if (!["A", "B", "C", "D"].includes(a)) { t.u++; continue; }
    if (a === q.answer) { t.c++; t.m += 4; } else { t.w++; t.m -= 1; }
  }
  const total = SUBJECTS.reduce((n, x) => n + sub[x].m, 0);
  try { await pool.query("INSERT INTO score (login_id, marks) VALUES (?, ?)", [id, total]); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return res.status(403).json({ error: "You have already submitted this test." }); throw e; }

  sessions.delete(id); persist();
  res.json({ total, max: QUESTIONS.length * 4, subjects: sub, terminated: s.violations >= MAX_VIOLATIONS, tabSwitches: s.violations });
}));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Open http://localhost:${PORT}`));
