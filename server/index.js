import express from "express";
import cors from "cors";
import compression from "compression";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { db } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

seedIfEmpty();

const app = express();
// Render terminates TLS and proxies to this process — without trusting the
// proxy, every request looks like it comes from the same internal IP, which
// would make the rate limiter below block everyone as one client.
app.set("trust proxy", 1);
app.use(cors());
app.use(compression());
app.use(express.json());

// Anonymous, no-auth write endpoints are the abuse surface under real
// traffic (or just a buggy client retry-looping) — cap them per IP rather
// than the whole API, so normal browsing/polling is never affected.
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const VALID_STATUS = new Set(["power_on", "load_shedding"]);
const VALID_SORT = new Set(["latest", "longest", "confirmed"]);

/**
 * Local calendar date/time, not UTC — reports are keyed to Bangladesh wall-clock
 * time (matches the same convention already used in server/seed.js).
 */
const pad = (n) => String(n).padStart(2, "0");
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Per-report resolve authorization. There are no accounts, so ownership is
 * proven by possessing a random secret handed back only once, at creation
 * time — never a guessable value like the report's own sequential id. Only
 * the hash is persisted; the raw token exists just long enough to be
 * returned to the client and compared against on resolve.
 */
function generateResolveToken() {
  return crypto.randomBytes(32).toString("base64url");
}
function hashResolveToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function resolveTokenMatches(providedToken, storedHash) {
  if (!storedHash || typeof providedToken !== "string" || !providedToken) return false;
  const provided = Buffer.from(hashResolveToken(providedToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return provided.length === stored.length && crypto.timingSafeEqual(provided, stored);
}

/**
 * Outage length in minutes. A report with no end time is still ongoing, so it is
 * measured up to now. Returns 0 for "power on" reports, which have no window.
 */
function outageMinutes(row, now = Date.now()) {
  if (row.status !== "load_shedding" || !row.outage_date || !row.start_time) return 0;
  const start = new Date(`${row.outage_date}T${row.start_time}:00`).getTime();
  if (Number.isNaN(start)) return 0;
  const end = row.end_time
    ? new Date(`${row.outage_date}T${row.end_time}:00`).getTime()
    : now;
  if (Number.isNaN(end) || end < start) return 0;
  // Guard against a stale "ongoing" report inflating totals indefinitely.
  return Math.min(Math.round((end - start) / 60_000), 24 * 60);
}

function serializeReport(row) {
  return {
    id: row.id,
    divisionId: row.division_id,
    districtId: row.district_id,
    area: row.area,
    areaId: row.area_id || null,
    landmark: row.landmark || null,
    providerId: row.provider_id || "unknown",
    status: row.status,
    outageDate: row.outage_date,
    startTime: row.start_time,
    endTime: row.end_time,
    note: row.note || "",
    confirmations: row.confirmations || 0,
    durationMinutes: outageMinutes(row),
    createdAt: row.created_at,
  };
}

app.get("/api/reports", (req, res) => {
  const { division, status, provider, q, sort } = req.query;

  let sql = "SELECT * FROM reports WHERE 1=1";
  const params = [];

  if (division && typeof division === "string") {
    sql += " AND division_id = ?";
    params.push(division);
  }
  if (status && VALID_STATUS.has(status)) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (provider && typeof provider === "string") {
    sql += " AND provider_id = ?";
    params.push(provider);
  }
  if (q && typeof q === "string" && q.trim()) {
    sql += " AND (area LIKE ? OR district_id LIKE ?)";
    const like = `%${q.trim()}%`;
    params.push(like, like);
  }

  // "longest" depends on the computed duration, so it is sorted after mapping.
  const sortKey = VALID_SORT.has(sort) ? sort : "latest";
  sql += sortKey === "confirmed" ? " ORDER BY confirmations DESC, created_at DESC" : " ORDER BY created_at DESC";
  sql += " LIMIT 500";

  let reports = db.prepare(sql).all(...params).map(serializeReport);
  if (sortKey === "longest") {
    reports.sort((a, b) => b.durationMinutes - a.durationMinutes);
  }

  res.json({ reports });
});

app.get("/api/summary", (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS count FROM reports").get().count;
  const powerOn = db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'power_on'").get().count;
  const loadShedding = db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'load_shedding'").get().count;
  res.json({ total, powerOn, loadShedding });
});

/**
 * Aggregate ledger stats, in the spirit of a public accountability record:
 * how much outage time has been reported, how much of it is still unresolved,
 * and a provider x division breakdown of where it is concentrated.
 */
app.get("/api/stats", (req, res) => {
  const rows = db.prepare("SELECT * FROM reports").all();
  const now = Date.now();

  const outages = rows.filter((r) => r.status === "load_shedding");
  const ongoing = outages.filter((r) => !r.end_time);
  const totalMinutes = outages.reduce((sum, r) => sum + outageMinutes(r, now), 0);
  const totalConfirmations = rows.reduce((sum, r) => sum + (r.confirmations || 0), 0);

  const byProvider = new Map();
  const byDivision = new Map();

  for (const r of outages) {
    const mins = outageMinutes(r, now);

    const p = byProvider.get(r.provider_id) || { id: r.provider_id, reports: 0, minutes: 0, ongoing: 0 };
    p.reports += 1;
    p.minutes += mins;
    if (!r.end_time) p.ongoing += 1;
    byProvider.set(r.provider_id, p);

    const d = byDivision.get(r.division_id) || { id: r.division_id, reports: 0, minutes: 0, ongoing: 0 };
    d.reports += 1;
    d.minutes += mins;
    if (!r.end_time) d.ongoing += 1;
    byDivision.set(r.division_id, d);
  }

  const sortByMinutes = (a, b) => b.minutes - a.minutes;

  res.json({
    totalReports: rows.length,
    outageReports: outages.length,
    ongoingCount: ongoing.length,
    ongoingRate: outages.length ? Math.round((ongoing.length / outages.length) * 100) : 0,
    totalOutageMinutes: totalMinutes,
    averageOutageMinutes: outages.length ? Math.round(totalMinutes / outages.length) : 0,
    totalConfirmations,
    divisionsCovered: byDivision.size,
    providersCovered: byProvider.size,
    byProvider: [...byProvider.values()].sort(sortByMinutes),
    byDivision: [...byDivision.values()].sort(sortByMinutes),
  });
});

app.post("/api/reports/:id/confirm", writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });

  const existing = db.prepare("SELECT id FROM reports WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  db.prepare("UPDATE reports SET confirmations = confirmations + 1 WHERE id = ?").run(id);
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  res.json({ report: serializeReport(row) });
});

/**
 * Marks an ongoing outage report as resolved ("power's back") by setting its
 * end time to now, instead of the reporter filing a duplicate new report.
 * Requires the per-report resolve token issued at creation time — report ids
 * are sequential and therefore guessable, so the id alone proves nothing.
 */
app.post("/api/reports/:id/resolve", writeLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });

  const { resolveToken } = req.body || {};
  if (typeof resolveToken !== "string" || !resolveToken) {
    return res.status(401).json({ error: "resolve_token_required" });
  }

  const existing = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  if (!resolveTokenMatches(resolveToken, existing.resolve_token_hash)) {
    return res.status(403).json({ error: "invalid_resolve_token" });
  }
  if (existing.status !== "load_shedding" || existing.end_time) {
    return res.status(409).json({ error: "not_resolvable" });
  }

  db.prepare("UPDATE reports SET end_time = ? WHERE id = ?").run(localTime(new Date()), id);
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  res.json({ report: serializeReport(row) });
});

/**
 * Hour-of-day breakdown of reported outages, so an area can see when it tends
 * to lose power (e.g. "6-8pm most nights") rather than just aggregate totals.
 */
app.get("/api/patterns", (req, res) => {
  const { division, district, area } = req.query;

  let sql = "SELECT start_time FROM reports WHERE status = 'load_shedding'";
  const params = [];
  if (division && typeof division === "string") {
    sql += " AND division_id = ?";
    params.push(division);
  }
  if (district && typeof district === "string") {
    sql += " AND district_id = ?";
    params.push(district);
  }
  if (area && typeof area === "string") {
    sql += " AND area_id = ?";
    params.push(area);
  }

  const rows = db.prepare(sql).all(...params);
  const counts = new Array(24).fill(0);
  for (const r of rows) {
    if (!r.start_time) continue;
    const hour = Number(r.start_time.split(":")[0]);
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) counts[hour] += 1;
  }

  res.json({ hourly: counts.map((count, hour) => ({ hour, count })) });
});

app.post("/api/reports", writeLimiter, (req, res) => {
  const { divisionId, districtId, area, areaId, landmark, providerId, status, outageDate, startTime, endTime, note } =
    req.body || {};

  if (!divisionId || typeof divisionId !== "string") {
    return res.status(400).json({ error: "division_required" });
  }
  if (!districtId || typeof districtId !== "string") {
    return res.status(400).json({ error: "district_required" });
  }
  if (!area || typeof area !== "string" || !area.trim()) {
    return res.status(400).json({ error: "area_required" });
  }
  if (!status || !VALID_STATUS.has(status)) {
    return res.status(400).json({ error: "status_required" });
  }
  if (status === "load_shedding" && !outageDate) {
    return res.status(400).json({ error: "date_required" });
  }
  if (status === "load_shedding" && !startTime) {
    return res.status(400).json({ error: "start_time_required" });
  }

  const resolveToken = generateResolveToken();

  const insert = db.prepare(`
    INSERT INTO reports (division_id, district_id, area, area_id, landmark, provider_id, status, outage_date, start_time, end_time, note, resolve_token_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(
    divisionId,
    districtId,
    area.trim(),
    typeof areaId === "string" && areaId ? areaId : null,
    typeof landmark === "string" && landmark.trim() ? landmark.trim() : null,
    typeof providerId === "string" && providerId ? providerId : "unknown",
    status,
    status === "load_shedding" ? outageDate : null,
    status === "load_shedding" ? startTime : null,
    status === "load_shedding" ? endTime || null : null,
    (note || "").trim(),
    hashResolveToken(resolveToken)
  );

  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(result.lastInsertRowid);
  // resolveToken is returned exactly once, here — it is never included in
  // serializeReport(), so it never comes back on GET /api/reports, confirm,
  // or resolve responses.
  res.status(201).json({ report: serializeReport(row), resolveToken });
});

// In production the frontend is a static build served by this same process
// (single Render web service instead of a separate static site).
if (process.env.NODE_ENV === "production") {
  const distDir = path.join(__dirname, "..", "dist");
  // Vite fingerprints everything under assets/ with a content hash, so those
  // files are safe to cache indefinitely; index.html is not (it's what
  // points at the current hashes), so it stays revalidate-on-every-request.
  app.use(
    "/assets",
    express.static(path.join(distDir, "assets"), {
      immutable: true,
      maxAge: "1y",
    })
  );
  // index: false — otherwise this would auto-serve dist/index.html for "/"
  // with its own default cache headers before the explicit no-cache below.
  app.use(express.static(distDir, { index: false }));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Any error thrown inside a route handler becomes a 500 instead of taking the
// whole process down.
app.use((err, req, res, _next) => {
  console.error("[server] request failed:", err);
  res.status(500).json({ error: "internal_error" });
});

const server = app.listen(PORT, () => {
  console.log(`[server] কারেন্ট Koi? API listening on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${PORT} is already in use — another copy of the API is probably still running.\n` +
        `[server] Close it (or run: npx kill-port ${PORT}) and try 'npm run dev' again.`
    );
  } else {
    console.error("[server] failed to start:", err);
  }
  process.exit(1);
});

// Without these, an unexpected error exits with a bare code 1 and no explanation.
process.on("uncaughtException", (err) => {
  console.error("[server] uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("[server] unhandled promise rejection:", err);
  process.exit(1);
});

// Being signalled from outside (Ctrl+C, a parent process going away, a task
// runner reaping the group) looks identical to a crash in the logs otherwise:
// a bare "exited with code 1" with no message. Say so explicitly, and close
// the listener so the port is released cleanly.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    console.log(`[server] received ${signal} — shutting down (not a crash).`);
    server.close(() => process.exit(0));
    // Don't hang forever if a connection refuses to drain.
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
