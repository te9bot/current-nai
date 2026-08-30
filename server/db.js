import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required — set it to your Postgres connection string " +
      "(e.g. from Supabase: Project Settings → Database → Connection string)."
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase's certificate chain isn't always present in every runtime's
  // default trust store; this is the standard accommodation for that
  // without turning encryption off outright.
  ssl: { rejectUnauthorized: false },
});

export async function all(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function get(sql, params = []) {
  const { rows } = await pool.query(sql, params);
  return rows[0];
}

export async function run(sql, params = []) {
  return pool.query(sql, params);
}

await pool.query(`
  CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    division_id TEXT NOT NULL,
    district_id TEXT NOT NULL,
    area TEXT NOT NULL,
    area_id TEXT,
    landmark TEXT,
    provider_id TEXT NOT NULL DEFAULT 'unknown',
    status TEXT NOT NULL CHECK (status IN ('power_on', 'load_shedding')),
    outage_date TEXT,
    start_time TEXT,
    end_time TEXT,
    note TEXT,
    confirmations INTEGER NOT NULL DEFAULT 0,
    resolve_token_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_provider ON reports (provider_id);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_division ON reports (division_id);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_district ON reports (district_id);`);
await pool.query(`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);`);
