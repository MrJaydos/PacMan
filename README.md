# Pac-Man + Leaderboard

Classic Pac-Man in the browser (vanilla JS + Canvas, no build step), backed
by a small Express API and a persistent SQLite leaderboard.

## Stack

- **Frontend:** static HTML/CSS/JS in `public/`, no framework, no bundler.
- **Backend:** Node.js + Express (`server.js`), serves the frontend and a
  JSON API.
- **Database:** SQLite via `better-sqlite3`, file path set by `DB_PATH`.

## Local development

```bash
npm install
npm start
```

Then open http://localhost:3000. By default the leaderboard database is
created at `./data/leaderboard.db` (gitignored) so local dev needs no setup.

## Controls

Arrow keys or WASD to move, `P` or `Esc` to pause.

## Environment variables

| Var       | Default                        | Purpose                          |
|-----------|---------------------------------|-----------------------------------|
| `PORT`    | `3000`                          | HTTP port the server listens on   |
| `DB_PATH` | `./data/leaderboard.db` (local) / `/data/leaderboard.db` (Docker) | Path to the SQLite file |

## Running with Docker

```bash
docker build -t pacman .
docker run -d \
  --name pacman \
  -p 3000:3000 \
  -v pacman_data:/data \
  pacman
```

The `-v pacman_data:/data` volume is what makes the leaderboard survive
container restarts and redeploys -- without it, scores live only inside the
container's writable layer and disappear when the container is removed.

Health check: `GET /healthz` returns `200 OK` once the DB connection is
confirmed alive.

## Coolify deployment

1. Create a new resource in Coolify from this Dockerfile (build pack:
   **Dockerfile**). The Dockerfile lives at the repo root, so no extra
   config is needed for the build itself.
2. Set environment variables in Coolify: `PORT` (e.g. `3000`) and `DB_PATH`
   (`/data/leaderboard.db`).
3. Add a **persistent volume** mounted at `/data` in Coolify's storage
   settings, so the SQLite file survives redeploys.
4. Point Coolify's health check at `/healthz`.

## GitHub -> Coolify workflow

This repo is meant to be watched by Coolify for auto-deploy:

- Point Coolify at this GitHub repository, build pack = **Dockerfile**.
- Confirm the `/data` volume and the `PORT` / `DB_PATH` env vars from the
  section above are configured in Coolify (they need to be set once in the
  Coolify UI -- they aren't part of the repo).
- Every push to `main` triggers Coolify to rebuild the image from the
  Dockerfile and redeploy automatically. Because the leaderboard lives on
  the mounted `/data` volume rather than inside the container image, scores
  persist across every one of those redeploys.
- Coolify uses `GET /healthz` to confirm the new container is healthy
  before it finishes rolling out.

## API

- `GET /api/leaderboard` -> top 10 scores: `[{ name, score, created_at }]`
- `POST /api/scores` -> body `{ name, score }`, validates + rate-limits +
  inserts, returns the updated top 10
- `GET /healthz` -> `200 OK`

Server-side anti-cheat is intentionally basic (integer/bounds checks on
score, sanitized/length-limited names, a per-IP rate limit on submissions).
It rejects obviously bogus payloads but does not make cheating impossible --
a fully cheat-proof leaderboard would require the server to simulate the
run itself (server-authoritative gameplay), which is out of scope here.
