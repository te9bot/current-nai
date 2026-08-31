import os
import ssl

import asyncpg

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required — set it to your Postgres connection string "
        "(e.g. from Supabase: Project Settings → Database → Connection string)."
    )

_pool: asyncpg.Pool | None = None


def _make_ssl_context() -> ssl.SSLContext:
    # Supabase's certificate chain isn't always present in every runtime's
    # default trust store; this is the standard accommodation for that
    # without turning encryption off outright.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def init_pool() -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=DATABASE_URL,
        min_size=1,
        # asyncpg's default (10) queues requests for a free connection under
        # concurrent polling traffic well before Supabase's own pooler limit
        # is anywhere close. Raised so that ceiling isn't the first thing to
        # bottleneck.
        max_size=20,
        ssl=_make_ssl_context(),
    )
    await _init_schema(_pool)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Pool not initialized — call init_pool() first.")
    return _pool


async def all(sql: str, *params) -> list[asyncpg.Record]:
    return await get_pool().fetch(sql, *params)


async def get(sql: str, *params) -> asyncpg.Record | None:
    return await get_pool().fetchrow(sql, *params)


async def run(sql: str, *params) -> str:
    return await get_pool().execute(sql, *params)


async def _init_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
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
                reporter_ip_hash TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )

        # Added after the table already existed in production — plain CREATE
        # TABLE above won't retrofit existing rows, so it's added separately here.
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_ip_hash TEXT;"
        )

        # Anonymous-identity redesign: reporter_ip_hash and resolve_token_hash
        # (above/CREATE TABLE) are kept but no longer used for authorization —
        # see reporter_anon_hash and report_confirmations below.
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS reporter_anon_hash TEXT;"
        )
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;"
        )
        await conn.execute(
            "UPDATE reports SET updated_at = COALESCE(updated_at, created_at);"
        )
        await conn.execute(
            "ALTER TABLE reports ALTER COLUMN updated_at SET DEFAULT now();"
        )
        await conn.execute(
            "ALTER TABLE reports ALTER COLUMN updated_at SET NOT NULL;"
        )

        # Exact reporter-supplied coordinates (GPS fix or a manually placed
        # map pin) — distinct from division/district/area, which stay
        # administrative context only. Range/finite-value validation happens
        # in main.py before insert; these columns just store what already
        # passed that check.
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;"
        )
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;"
        )
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_accuracy DOUBLE PRECISION;"
        )
        await conn.execute(
            "ALTER TABLE reports ADD COLUMN IF NOT EXISTS location_source TEXT;"
        )

        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_provider ON reports (provider_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_division ON reports (division_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_district ON reports (district_id);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_reports_reporter_ip ON reports (reporter_ip_hash);"
        )

        # Anonymous per-visitor confirm dedup: one row per (report, anon_hash)
        # replaces the old client-side localStorage "already confirmed" set —
        # enforced here via the primary key instead of trusting the browser.
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS report_confirmations (
                report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                anon_hash  TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (report_id, anon_hash)
            );
            """
        )

        # Anonymous per-visitor restore-vote dedup — structurally identical to
        # report_confirmations above, but for "power's back" votes. A report
        # only actually resolves once enough distinct anon votes land (see
        # required_restore_votes() in main.py); this table is what makes "one
        # visitor, one vote" enforceable without accounts or localStorage.
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS report_restore_votes (
                report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
                anon_hash  TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                PRIMARY KEY (report_id, anon_hash)
            );
            """
        )
