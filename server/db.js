import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "current-nai.sqlite");

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    division_id TEXT NOT NULL,
    district_id TEXT NOT NULL,
    area TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('power_on', 'load_shedding')),
    outage_date TEXT,
    start_time TEXT,
    end_time TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);`);

// Lightweight migration: add columns introduced after the first release so an
// existing current-nai.sqlite keeps its reports instead of needing a wipe.
const existingColumns = new Set(db.prepare(`PRAGMA table_info(reports)`).all().map((c) => c.name));

if (!existingColumns.has("provider_id")) {
  db.exec(`ALTER TABLE reports ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'unknown'`);
}
if (!existingColumns.has("confirmations")) {
  db.exec(`ALTER TABLE reports ADD COLUMN confirmations INTEGER NOT NULL DEFAULT 0`);
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_provider ON reports (provider_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_division ON reports (division_id);`);
