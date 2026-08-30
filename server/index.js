import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json());

const VALID_STATUS = new Set(["power_on", "load_shedding"]);
const VALID_SORT = new Set(["latest", "longest", "confirmed"]);

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

app.post("/api/reports/:id/confirm", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "invalid_id" });

  const existing = db.prepare("SELECT id FROM reports WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "not_found" });

  db.prepare("UPDATE reports SET confirmations = confirmations + 1 WHERE id = ?").run(id);
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
  res.json({ report: serializeReport(row) });
});

app.post("/api/reports", (req, res) => {
  const { divisionId, districtId, area, providerId, status, outageDate, startTime, endTime, note } = req.body || {};

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

  const insert = db.prepare(`
    INSERT INTO reports (division_id, district_id, area, provider_id, status, outage_date, start_time, end_time, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = insert.run(
    divisionId,
    districtId,
    area.trim(),
    typeof providerId === "string" && providerId ? providerId : "unknown",
    status,
    status === "load_shedding" ? outageDate : null,
    status === "load_shedding" ? startTime : null,
    status === "load_shedding" ? endTime || null : null,
    (note || "").trim()
  );

  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ report: serializeReport(row) });
});

// In production the frontend is a static build served by this same process
// (single Render web service instead of a separate static site).
if (process.env.NODE_ENV === "production") {
  const distDir = path.join(__dirname, "..", "dist");
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (req, res) => {
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
  console.log(`[server] Current Nai API listening on http://localhost:${PORT}`);
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
