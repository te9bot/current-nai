import hashlib
import hmac
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import db, seed

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"

VALID_STATUS = {"power_on", "load_shedding"}
VALID_SORT = {"latest", "longest", "confirmed"}

# IP hashing is kept only as a secondary anti-abuse signal (rate limiting,
# and reporter_ip_hash for future abuse heuristics) — never as the primary
# way of recognizing a visitor. See ANON_ID_SECRET below for that. HMAC (not
# a bare hash) because raw IPv4 space is only ~4 billion values and trivially
# reversible otherwise; the pepper keeps the stored hash from being useful
# outside this server.
IP_HASH_SECRET = os.environ.get("IP_HASH_SECRET", "current-nai-ip-pepper-fallback")

# The app is fully anonymous — no accounts, no login — but still needs a way
# to (a) stop one visitor from confirming the same report over and over and
# (b) let anyone nearby resolve a report without proving they created it.
# Both are handled with a random, HttpOnly, server-issued identifier stored
# in a cookie: never readable by frontend JS, never sent anywhere but back to
# this server, and never itself stored — only its HMAC (anon_hash) is, so a
# leaked database still can't be used to forge or replay a visitor's cookie.
ANON_ID_SECRET = os.environ.get("ANON_ID_SECRET", "current-nai-anon-pepper-fallback")
ANON_COOKIE_NAME = "cnai_anon"
ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2  # 2 years


# Requests reach this process through two hops — Cloudflare's edge, then
# Render's internal load balancer — confirmed via X-Forwarded-For sampling on
# the Node backend this replaces: "<real client ip>, <cloudflare edge ip>,
# <render internal ip>", where the middle and last entries rotate per-request
# but the first stays constant for the same visitor. Trusting only 1 hop
# resolves to Render's rotating internal IP, not the visitor — silently
# breaking both the rate limiter below and reporter-IP lookups in
# hash_ip()/reporter_ip_hash. Trusting 2 hops walks back to the real, stable
# IP. Kept configurable via TRUST_PROXY_HOPS in case the Docker deploy's
# network path differs from the old Node runtime's.
TRUST_PROXY_HOPS = int(os.environ.get("TRUST_PROXY_HOPS", "2"))


def get_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        entries = [ip.strip() for ip in xff.split(",") if ip.strip()]
        idx = len(entries) - 1 - TRUST_PROXY_HOPS
        if 0 <= idx < len(entries):
            return entries[idx]
        if entries:
            return entries[0]
    return request.client.host if request.client else ""


limiter = Limiter(key_func=get_client_ip)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await db.init_pool()
    await seed.seed_if_empty(pool)
    yield
    await db.close_pool()


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_middleware(GZipMiddleware)


# --- helpers -----------------------------------------------------------------

def hash_ip(ip: Optional[str]) -> str:
    return hmac.new(IP_HASH_SECRET.encode(), (ip or "").encode(), hashlib.sha256).hexdigest()


def hash_anon_id(raw: str) -> str:
    return hmac.new(ANON_ID_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()


def get_anon_hash(request: Request, response: Response) -> str:
    """Resolves this visitor's anonymous identity for dedup/anti-abuse
    purposes, issuing a fresh cookie on first contact if none exists yet.
    Secure is conditional on production because Vite's local dev proxy serves
    the app over plain http, where a Secure cookie would be silently dropped
    by the browser."""
    raw = request.cookies.get(ANON_COOKIE_NAME)
    if not raw:
        raw = secrets.token_urlsafe(32)
        response.set_cookie(
            ANON_COOKIE_NAME,
            raw,
            max_age=ANON_COOKIE_MAX_AGE,
            httponly=True,
            secure=os.environ.get("NODE_ENV") == "production",
            samesite="lax",
            path="/",
        )
    return hash_anon_id(raw)


def local_time(d: datetime) -> str:
    return d.strftime("%H:%M")


def outage_minutes(row, now: Optional[datetime] = None) -> int:
    """Outage length in minutes. A report with no end time is still ongoing, so
    it is measured up to now. Returns 0 for "power on" reports, which have no
    window."""
    now = now or datetime.now()
    if row["status"] != "load_shedding" or not row["outage_date"] or not row["start_time"]:
        return 0
    try:
        start = datetime.strptime(f"{row['outage_date']}T{row['start_time']}", "%Y-%m-%dT%H:%M")
    except ValueError:
        return 0
    if row["end_time"]:
        try:
            end = datetime.strptime(f"{row['outage_date']}T{row['end_time']}", "%Y-%m-%dT%H:%M")
        except ValueError:
            return 0
    else:
        end = now
    if end < start:
        return 0
    # Guard against a stale "ongoing" report inflating totals indefinitely.
    minutes = (end - start).total_seconds() / 60
    return min(round(minutes), 24 * 60)


def _iso_z(dt: datetime) -> str:
    """Same wire format as JS's Date.prototype.toISOString(): UTC, millisecond
    precision, trailing "Z" — not Python's default isoformat()."""
    dt = dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def required_restore_votes(confirmations: int) -> int:
    """How many distinct anonymous 'power's back' votes a report needs before
    it actually resolves. Barely-corroborated outages (few confirmations)
    resolve on a single vote; strongly-corroborated ones need independent
    agreement, capped at 3 so a heavily-confirmed report is never practically
    impossible to resolve."""
    return 1 if confirmations < 5 else 3


def serialize_report(row, confirmed_by_you: bool = False, restore_votes: int = 0, restored_by_you: bool = False) -> dict:
    created_at = row["created_at"]
    updated_at = row["updated_at"]
    confirmations = row["confirmations"] or 0
    return {
        "id": row["id"],
        "divisionId": row["division_id"],
        "districtId": row["district_id"],
        "area": row["area"],
        "areaId": row["area_id"],
        "landmark": row["landmark"],
        "providerId": row["provider_id"] or "unknown",
        "status": row["status"],
        "outageDate": row["outage_date"],
        "startTime": row["start_time"],
        "endTime": row["end_time"],
        "note": row["note"] or "",
        "confirmations": confirmations,
        "confirmedByYou": confirmed_by_you,
        "restoreVotes": restore_votes,
        "restoreVotesNeeded": required_restore_votes(confirmations),
        "restoredByYou": restored_by_you,
        "durationMinutes": outage_minutes(row),
        "createdAt": _iso_z(created_at) if isinstance(created_at, datetime) else created_at,
        "updatedAt": _iso_z(updated_at) if isinstance(updated_at, datetime) else updated_at,
    }


async def fetch_restore_state(report_id: int, anon_hash: str) -> tuple[int, bool]:
    """(distinct vote count, whether this anon has voted) for a single report."""
    rows = await db.all("SELECT anon_hash FROM report_restore_votes WHERE report_id = $1", report_id)
    hashes = {r["anon_hash"] for r in rows}
    return len(hashes), anon_hash in hashes


# --- request bodies -----------------------------------------------------------

class NewReportInput(BaseModel):
    divisionId: Optional[str] = None
    districtId: Optional[str] = None
    area: Optional[str] = None
    areaId: Optional[str] = None
    landmark: Optional[str] = None
    providerId: Optional[str] = None
    status: Optional[str] = None
    outageDate: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    note: Optional[str] = None


# --- routes --------------------------------------------------------------------

@app.get("/api/reports")
async def list_reports(
    division: Optional[str] = None,
    status: Optional[str] = None,
    provider: Optional[str] = None,
    q: Optional[str] = None,
    sort: Optional[str] = None,
    anon_hash: str = Depends(get_anon_hash),
):
    sql = "SELECT * FROM reports WHERE 1=1"
    params: list = []

    if division:
        params.append(division)
        sql += f" AND division_id = ${len(params)}"
    if status and status in VALID_STATUS:
        params.append(status)
        sql += f" AND status = ${len(params)}"
    if provider:
        params.append(provider)
        sql += f" AND provider_id = ${len(params)}"
    if q and q.strip():
        # ILIKE, not LIKE — Postgres's LIKE is case-sensitive.
        like = f"%{q.strip()}%"
        params.append(like)
        idx1 = len(params)
        params.append(like)
        idx2 = len(params)
        sql += f" AND (area ILIKE ${idx1} OR district_id ILIKE ${idx2})"

    # "longest" depends on the computed duration, so it is sorted after mapping.
    sort_key = sort if sort in VALID_SORT else "latest"
    sql += " ORDER BY confirmations DESC, created_at DESC" if sort_key == "confirmed" else " ORDER BY created_at DESC"
    sql += " LIMIT 500"

    rows = await db.all(sql, *params)

    confirmed_ids: set = set()
    restore_votes_by_report: dict = {}
    restored_by_you_ids: set = set()
    if rows:
        ids = [r["id"] for r in rows]
        confirmed_rows = await db.all(
            "SELECT report_id FROM report_confirmations WHERE anon_hash = $1 AND report_id = ANY($2::int[])",
            anon_hash,
            ids,
        )
        confirmed_ids = {r["report_id"] for r in confirmed_rows}

        restore_rows = await db.all(
            "SELECT report_id, anon_hash FROM report_restore_votes WHERE report_id = ANY($1::int[])",
            ids,
        )
        for r in restore_rows:
            restore_votes_by_report[r["report_id"]] = restore_votes_by_report.get(r["report_id"], 0) + 1
            if r["anon_hash"] == anon_hash:
                restored_by_you_ids.add(r["report_id"])

    reports = [
        serialize_report(
            r,
            confirmed_by_you=r["id"] in confirmed_ids,
            restore_votes=restore_votes_by_report.get(r["id"], 0),
            restored_by_you=r["id"] in restored_by_you_ids,
        )
        for r in rows
    ]
    if sort_key == "longest":
        reports.sort(key=lambda r: r["durationMinutes"], reverse=True)

    return {"reports": reports}


# TEMP DEBUG — remove before finalizing. Diagnosing req.ip/XFF behavior behind
# Render + Cloudflare + Docker; carried over from the Node backend this
# replaces so the new get_client_ip() can be verified in production before
# this is deleted.
@app.get("/api/debug/ip")
async def debug_ip(request: Request):
    xff = request.headers.get("x-forwarded-for")
    return {
        "ip": get_client_ip(request),
        "ips": [ip.strip() for ip in xff.split(",")] if xff else [],
        "xff": xff,
        "remoteAddress": request.client.host if request.client else None,
    }


@app.get("/api/summary")
async def summary():
    total = (await db.get("SELECT COUNT(*) AS count FROM reports"))["count"]
    # A load-shedding report whose reporter has since marked it resolved
    # (end_time set) means the area currently has power again, even though its
    # status column stays 'load_shedding' forever for the ledger's sake — so it
    # counts toward powerOn here, not loadShedding. Keep this in sync with the
    # client's isCurrentlyPowerOn() (src/utils/reportStatus.ts).
    power_on = (
        await db.get(
            "SELECT COUNT(*) AS count FROM reports WHERE status = 'power_on' OR (status = 'load_shedding' AND end_time IS NOT NULL)"
        )
    )["count"]
    load_shedding = (
        await db.get("SELECT COUNT(*) AS count FROM reports WHERE status = 'load_shedding' AND end_time IS NULL")
    )["count"]
    return {"total": total, "powerOn": power_on, "loadShedding": load_shedding}


@app.get("/api/stats")
async def stats():
    """Aggregate ledger stats, in the spirit of a public accountability record:
    how much outage time has been reported, how much of it is still unresolved,
    and a provider x division breakdown of where it is concentrated."""
    rows = await db.all("SELECT * FROM reports")
    now = datetime.now()

    outages = [r for r in rows if r["status"] == "load_shedding"]
    ongoing = [r for r in outages if not r["end_time"]]
    total_minutes = sum(outage_minutes(r, now) for r in outages)
    total_confirmations = sum(r["confirmations"] or 0 for r in rows)

    by_provider: dict = {}
    by_division: dict = {}

    for r in outages:
        mins = outage_minutes(r, now)

        p = by_provider.setdefault(r["provider_id"], {"id": r["provider_id"], "reports": 0, "minutes": 0, "ongoing": 0})
        p["reports"] += 1
        p["minutes"] += mins
        if not r["end_time"]:
            p["ongoing"] += 1

        d = by_division.setdefault(r["division_id"], {"id": r["division_id"], "reports": 0, "minutes": 0, "ongoing": 0})
        d["reports"] += 1
        d["minutes"] += mins
        if not r["end_time"]:
            d["ongoing"] += 1

    def sort_by_minutes(items):
        return sorted(items, key=lambda x: x["minutes"], reverse=True)

    return {
        "totalReports": len(rows),
        "outageReports": len(outages),
        "ongoingCount": len(ongoing),
        "ongoingRate": round((len(ongoing) / len(outages)) * 100) if outages else 0,
        "totalOutageMinutes": total_minutes,
        "averageOutageMinutes": round(total_minutes / len(outages)) if outages else 0,
        "totalConfirmations": total_confirmations,
        "divisionsCovered": len(by_division),
        "providersCovered": len(by_provider),
        "byProvider": sort_by_minutes(by_provider.values()),
        "byDivision": sort_by_minutes(by_division.values()),
    }


@app.post("/api/reports/{report_id}/confirm")
@limiter.limit("20/minute")
async def confirm_report(request: Request, report_id: int, anon_hash: str = Depends(get_anon_hash)):
    existing = await db.get("SELECT id FROM reports WHERE id = $1", report_id)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": "not_found"})

    # One confirmation per anonymous visitor per report, enforced by the
    # (report_id, anon_hash) primary key — replaces the old client-side
    # localStorage "already confirmed" set with a server-side guarantee.
    inserted = await db.get(
        "INSERT INTO report_confirmations (report_id, anon_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING report_id",
        report_id,
        anon_hash,
    )
    if inserted:
        await db.run(
            "UPDATE reports SET confirmations = confirmations + 1, updated_at = now() WHERE id = $1",
            report_id,
        )
    row = await db.get("SELECT * FROM reports WHERE id = $1", report_id)
    restore_votes, restored_by_you = await fetch_restore_state(report_id, anon_hash)
    return {"report": serialize_report(row, confirmed_by_you=True, restore_votes=restore_votes, restored_by_you=restored_by_you)}


@app.post("/api/reports/{report_id}/resolve")
@limiter.limit("20/minute")
async def resolve_report(request: Request, report_id: int, anon_hash: str = Depends(get_anon_hash)):
    """Casts one anonymous 'power's back' vote on an ongoing report. The area +
    current power state is the object here, not who filed the original
    report — so any nearby anonymous visitor can vote, gated only by the
    report still being ongoing and the usual per-IP rate limit (secondary
    anti-abuse signal, not identity). A barely-confirmed report resolves on
    the first vote; a strongly-confirmed one needs independent agreement from
    several distinct anonymous visitors first (required_restore_votes()) —
    otherwise a single visitor could falsely "restore" a widely-confirmed
    active outage with one click."""
    existing = await db.get("SELECT * FROM reports WHERE id = $1", report_id)
    if not existing:
        raise HTTPException(status_code=404, detail={"error": "not_found"})
    if existing["status"] != "load_shedding" or existing["end_time"]:
        raise HTTPException(status_code=409, detail={"error": "not_resolvable"})

    # Idempotent: a second vote from the same anon is a no-op here, counted
    # only once below via COUNT(DISTINCT anon_hash) semantics (the primary
    # key guarantees at most one row per (report, anon) anyway).
    await db.run(
        "INSERT INTO report_restore_votes (report_id, anon_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        report_id,
        anon_hash,
    )
    restore_votes, restored_by_you = await fetch_restore_state(report_id, anon_hash)
    required = required_restore_votes(existing["confirmations"] or 0)

    if restore_votes >= required:
        # end_time IS NULL guard makes this safe if two votes race past the
        # threshold concurrently — only the first UPDATE actually applies.
        await db.run(
            "UPDATE reports SET end_time = $1, updated_at = now() WHERE id = $2 AND end_time IS NULL",
            local_time(datetime.now()),
            report_id,
        )

    row = await db.get("SELECT * FROM reports WHERE id = $1", report_id)
    return {"report": serialize_report(row, restore_votes=restore_votes, restored_by_you=restored_by_you)}


@app.get("/api/patterns")
async def patterns(division: Optional[str] = None, district: Optional[str] = None, area: Optional[str] = None):
    """Hour-of-day breakdown of reported outages, so an area can see when it
    tends to lose power (e.g. "6-8pm most nights") rather than just aggregate
    totals."""
    sql = "SELECT start_time FROM reports WHERE status = 'load_shedding'"
    params: list = []
    if division:
        params.append(division)
        sql += f" AND division_id = ${len(params)}"
    if district:
        params.append(district)
        sql += f" AND district_id = ${len(params)}"
    if area:
        params.append(area)
        sql += f" AND area_id = ${len(params)}"

    rows = await db.all(sql, *params)
    counts = [0] * 24
    for r in rows:
        start_time = r["start_time"]
        if not start_time:
            continue
        try:
            hour = int(start_time.split(":")[0])
        except (ValueError, IndexError):
            continue
        if 0 <= hour < 24:
            counts[hour] += 1

    return {"hourly": [{"hour": hour, "count": count} for hour, count in enumerate(counts)]}


@app.post("/api/reports", status_code=201)
@limiter.limit("20/minute")
async def create_report(request: Request, body: NewReportInput, anon_hash: str = Depends(get_anon_hash)):
    if not body.divisionId or not isinstance(body.divisionId, str):
        raise HTTPException(status_code=400, detail={"error": "division_required"})
    if not body.districtId or not isinstance(body.districtId, str):
        raise HTTPException(status_code=400, detail={"error": "district_required"})
    if not body.area or not isinstance(body.area, str) or not body.area.strip():
        raise HTTPException(status_code=400, detail={"error": "area_required"})
    if not body.status or body.status not in VALID_STATUS:
        raise HTTPException(status_code=400, detail={"error": "status_required"})
    if body.status == "load_shedding" and not body.outageDate:
        raise HTTPException(status_code=400, detail={"error": "date_required"})
    if body.status == "load_shedding" and not body.startTime:
        raise HTTPException(status_code=400, detail={"error": "start_time_required"})

    row = await db.get(
        """
        INSERT INTO reports (division_id, district_id, area, area_id, landmark, provider_id, status, outage_date, start_time, end_time, note, reporter_ip_hash, reporter_anon_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
        """,
        body.divisionId,
        body.districtId,
        body.area.strip(),
        body.areaId if isinstance(body.areaId, str) and body.areaId else None,
        body.landmark.strip() if isinstance(body.landmark, str) and body.landmark.strip() else None,
        body.providerId if isinstance(body.providerId, str) and body.providerId else "unknown",
        body.status,
        body.outageDate if body.status == "load_shedding" else None,
        body.startTime if body.status == "load_shedding" else None,
        (body.endTime or None) if body.status == "load_shedding" else None,
        (body.note or "").strip(),
        hash_ip(get_client_ip(request)),
        anon_hash,
    )

    return {"report": serialize_report(row)}


# In production the frontend is a static build served by this same process
# (single Render service instead of a separate static site).
if os.environ.get("NODE_ENV") == "production" and DIST_DIR.is_dir():
    class ImmutableStaticFiles(StaticFiles):
        # Vite fingerprints everything under assets/ with a content hash, so
        # those files are safe to cache indefinitely.
        async def get_response(self, path, scope):
            response = await super().get_response(path, scope)
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return response

    app.mount("/assets", ImmutableStaticFiles(directory=DIST_DIR / "assets"), name="assets")

    DIST_DIR_RESOLVED = DIST_DIR.resolve()

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail={"error": "not_found"})

        # Anything under public/ (team photos, bolt.svg, map-dark.png, etc.) is
        # copied verbatim into dist/ by Vite — unlike assets/, it isn't
        # fingerprinted, so it isn't covered by the mount above. Without this
        # check every such file 200'd with index.html's HTML instead of its
        # actual bytes, silently breaking any non-fingerprinted asset (this is
        # exactly what broke the team photo). resolve() + is_relative_to()
        # guards against a full_path like "../../etc/passwd" escaping DIST_DIR.
        if full_path:
            candidate = (DIST_DIR / full_path).resolve()
            if candidate.is_relative_to(DIST_DIR_RESOLVED) and candidate.is_file():
                return FileResponse(candidate)

        # index.html is not fingerprinted — it's what points at the current
        # hashes — so it stays revalidate-on-every-request.
        return FileResponse(DIST_DIR / "index.html", headers={"Cache-Control": "no-cache"})


# FastAPI's default HTTPException handler wraps whatever is passed as
# `detail` inside {"detail": ...} — every route above raises HTTPException
# with a plain {"error": "..."} dict as detail specifically so this handler
# can unwrap it back to the flat shape the frontend expects (src/api/reports.ts
# reads body.error directly). Also covers Starlette's own framework-raised
# HTTPExceptions (e.g. no route matched), whose detail is a plain string.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    content = exc.detail if isinstance(exc.detail, dict) else {"error": "not_found" if exc.status_code == 404 else "internal_error"}
    return JSONResponse(status_code=exc.status_code, content=content)


# Any error thrown inside a route handler becomes a 500 instead of taking the
# whole process down.
@app.exception_handler(Exception)
async def internal_error_handler(request: Request, exc: Exception):
    print(f"[server] request failed: {exc!r}")
    return JSONResponse(status_code=500, content={"error": "internal_error"})
