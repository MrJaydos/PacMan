// Minimal in-memory sliding-window rate limiter, keyed by IP.
// No external dependency needed for the modest traffic a leaderboard sees.
// State is per-process; that's fine for a single-container deployment and
// resets on restart, which just means limits loosen after a redeploy.

function createRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip -> array of request timestamps (ms)

  // Periodically forget IPs with no recent activity so the map can't grow forever.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, timestamps] of hits) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) hits.delete(ip);
      else hits.set(ip, fresh);
    }
  }, windowMs);
  sweeper.unref();

  return function rateLimit(req, res, next) {
    const ip = req.ip || "unknown";
    const now = Date.now();
    const cutoff = now - windowMs;
    const timestamps = (hits.get(ip) || []).filter((t) => t > cutoff);

    if (timestamps.length >= max) {
      return res.status(429).json({ error: "Too many requests, slow down." });
    }

    timestamps.push(now);
    hits.set(ip, timestamps);
    next();
  };
}

module.exports = { createRateLimiter };
