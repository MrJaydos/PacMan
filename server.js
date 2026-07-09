// Pac-Man leaderboard server: serves the static game and a small JSON API
// backed by SQLite. Keep this file dependency-light (Express + better-sqlite3
// only) and defensive about untrusted input, since every request here comes
// straight from the browser.
const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
const { createRateLimiter } = require("./rateLimiter");

const PORT = Number(process.env.PORT) || 3000;
// Default to a repo-local path for painless `npm start` on a laptop. The
// Dockerfile sets DB_PATH=/data/leaderboard.db so the container writes to
// the mounted volume instead.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "leaderboard.db");

const MAX_NAME_LEN = 12;
const MIN_NAME_LEN = 3;
// Generous upper bound for a legitimate run of this game. Anything above this
// is certainly bogus and gets rejected outright. Note: this (and the rest of
// this file's checks) is only casual, server-side sanity checking -- a
// determined cheater can still script the HTTP API. A truly cheat-proof
// leaderboard would require server-authoritative gameplay (the server
// simulating the run and computing the score itself), which is out of scope
// for a static-frontend game like this one.
const MAX_SCORE = 500000;

function ensureDatabase() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);
  `);
  return db;
}

let db;
try {
  db = ensureDatabase();
} catch (err) {
  console.error("Fatal: could not initialize the leaderboard database.", err);
  process.exit(1);
}

const topTenStmt = db.prepare(
  "SELECT name, score, created_at FROM scores ORDER BY score DESC, created_at ASC LIMIT 10"
);
const insertStmt = db.prepare(
  "INSERT INTO scores (name, score) VALUES (?, ?)"
);

function getTopTen() {
  return topTenStmt.all();
}

// Strip anything but letters, numbers, and spaces, then collapse/trim
// whitespace. Keeps stored names simple and safe to render as plain text.
function sanitizeName(rawName) {
  if (typeof rawName !== "string") return null;
  const cleaned = rawName
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_NAME_LEN);
  if (cleaned.length < MIN_NAME_LEN) return null;
  return cleaned;
}

function isValidScore(rawScore) {
  return (
    typeof rawScore === "number" &&
    Number.isInteger(rawScore) &&
    rawScore >= 0 &&
    rawScore <= MAX_SCORE
  );
}

const app = express();
// Coolify/Traefik sit in front of the app; trust the X-Forwarded-For header
// so rate limiting keys on the real client IP instead of the proxy's.
app.set("trust proxy", true);
app.use(express.json({ limit: "2kb" }));

// Malformed JSON bodies should 400, not crash the process.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body." });
  }
  next(err);
});

const scoreRateLimit = createRateLimiter({ windowMs: 60_000, max: 5 });

app.get("/healthz", (req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.status(200).send("OK");
  } catch (err) {
    res.status(500).send("DB unavailable");
  }
});

app.get("/api/leaderboard", (req, res) => {
  try {
    res.json(getTopTen());
  } catch (err) {
    console.error("Failed to read leaderboard", err);
    res.status(500).json({ error: "Could not read leaderboard." });
  }
});

app.post("/api/scores", scoreRateLimit, (req, res) => {
  const body = req.body || {};
  const name = sanitizeName(body.name);
  const score = body.score;

  if (!name) {
    return res.status(400).json({
      error: `Name must be ${MIN_NAME_LEN}-${MAX_NAME_LEN} letters/numbers/spaces.`,
    });
  }
  if (!isValidScore(score)) {
    return res.status(400).json({ error: "Score must be a valid integer." });
  }

  try {
    insertStmt.run(name, score);
    res.status(201).json(getTopTen());
  } catch (err) {
    console.error("Failed to insert score", err);
    res.status(500).json({ error: "Could not save score." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

// Catch-all error handler so an unexpected exception never crashes the process.
app.use((err, req, res, next) => {
  console.error("Unhandled request error", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`Pac-Man leaderboard server listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
