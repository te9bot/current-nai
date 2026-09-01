import hashlib
import hmac
import math
import os
import secrets
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import db, seed

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "dist"

VALID_STATUS = {"power_on", "load_shedding"}
VALID_SORT = {"latest", "longest", "confirmed"}

IS_PRODUCTION = os.environ.get("NODE_ENV") == "production"


def _required_secret(env_var: str, dev_fallback: str) -> str:
    """Peppers used to HMAC low-entropy values (an IP address) or gate a
    forgeable identity cookie must be real secrets in production — a fallback
    baked into public source code defeats the point (e.g. it would let anyone
    precompute a rainbow table over the ~4 billion IPv4 space and reverse a
    leaked reporter_ip_hash back to a real IP). Only production enforces
    this; local dev keeps a fixed fallback so `npm run dev` works without
    extra setup, matching DATABASE_URL's already-required-in-all-envs
    strictness being the exception, not the rule, for local ergonomics."""
    value = os.environ.get(env_var)
    if value:
        return value
    if IS_PRODUCTION:
        raise RuntimeError(f"{env_var} is required in production — set it to a random secret string.")
    return dev_fallback


# IP hashing is kept only as a secondary anti-abuse signal (rate limiting,
# and reporter_ip_hash for future abuse heuristics) — never as the primary
# way of recognizing a visitor. See ANON_ID_SECRET below for that. HMAC (not
# a bare hash) because raw IPv4 space is only ~4 billion values and trivially
# reversible otherwise; the pepper keeps the stored hash from being useful
# outside this server.
IP_HASH_SECRET = _required_secret("IP_HASH_SECRET", "current-nai-ip-pepper-fallback")

# The app is fully anonymous — no accounts, no login — but still needs a way
# to (a) stop one visitor from confirming the same report over and over and
# (b) let anyone nearby resolve a report without proving they created it.
# Both are handled with a random, HttpOnly, server-issued identifier stored
# in a cookie: never readable by frontend JS, never sent anywhere but back to
# this server, and never itself stored — only its HMAC (anon_hash) is, so a
# leaked database still can't be used to forge or replay a visitor's cookie.
ANON_ID_SECRET = _required_secret("ANON_ID_SECRET", "current-nai-anon-pepper-fallback")
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


# --- rate limit configuration -------------------------------------------------
# Every limit enforced anywhere in this file is defined here — never inline a
# limit string directly on a route decorator — so tuning abuse protection is a
# one-place edit instead of a hunt through the routes below.
#
# Storage: slowapi's default in-memory MemoryStorage (per-process, per-IP
# sliding window). That's a deliberate fit for the current deployment, not an
# oversight — see the TRUST_PROXY_HOPS comment above for the IP resolution
# side of this, and the module docstring-style note below for the instance
# scaling side:
#
# This Render service (render.yaml) runs a single "web" service on the free
# plan with no autoscaling/multi-instance configuration, so a single
# in-memory limiter sees every request and its counts are authoritative. If
# this is ever scaled to multiple Render instances, an in-memory limiter
# would under-enforce (each instance would allow up to N * instance_count
# requests, since IPs aren't sticky across instances) — at that point, switch
# Limiter(storage_uri=...) to a shared store (e.g. Redis) rather than
# in-memory. No such shared datastore is configured for this project today
# (Postgres/Supabase is used for application data only, not as a rate-limit
# store), so one isn't introduced here.
class RateLimit:
    REPORT_CREATE = "5/minute"  # POST /api/reports
    SUGGESTION_CREATE = "3/10minutes"  # POST /api/suggestions
    REPORT_VOTE = "20/minute"  # POST /api/reports/{id}/confirm|resolve
    GEOCODING = "30/minute"  # /api/geocode, /api/reverse-geocode
    READ_DEFAULT = "100/minute"  # public read-only GET endpoints (reports/suggestions lists, summary, stats, patterns)


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = await db.init_pool()
    await seed.seed_if_empty(pool)
    yield
    await db.close_pool()


# /docs, /redoc, and /openapi.json default to publicly reachable, which in
# production only helps an attacker enumerate every route (this is how a
# leftover debug endpoint would get found) — nothing here needs interactive
# API docs in production, so they're switched off there and left on for local
# development/testing.
app = FastAPI(
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Same flat-JSON shape as http_exception_handler below (the frontend
    only ever reads response bodies in that shape), but with a
    human-readable message instead of slowapi's default "Rate limit
    exceeded: 5 per 1 minute" wording.

    Retry-After is computed by hand here rather than via slowapi's built-in
    headers_enabled=True, which was tried and reverted: it makes slowapi's
    route decorator also try to inject X-RateLimit-* headers into every
    *successful* response, but every route in this file returns a plain
    dict rather than a Response object, which crashes that path outright.
    request.state.view_rate_limit — the (limit item, identifiers) pair that
    was just evaluated — is set unconditionally before RateLimitExceeded is
    raised (independent of headers_enabled), so it's reused here to query
    the same in-memory limiter storage slowapi itself would have read.
    """
    response = JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please try again later."},
    )
    current_limit = getattr(request.state, "view_rate_limit", None)
    if current_limit is not None:
        item, identifiers = current_limit
        reset_time, _ = limiter.limiter.get_window_stats(item, *identifiers)
        response.headers["Retry-After"] = str(max(int(reset_time - time.time()), 1))
    return response

# The frontend is always served same-origin by this same process in
# production, so no third-party origin has a legitimate reason to call this
# API directly — a wildcard here would let any website drive the anonymous,
# rate-limited write endpoints (reports/confirm/resolve/suggestions) from a
# visitor's own browser. Configurable via ALLOWED_ORIGINS (comma-separated)
# in case the production domain changes without a code deploy; defaults cover
# the known production domain, the Render fallback URL, and local dev.
DEFAULT_ALLOWED_ORIGINS = [
    "https://karentkoi.live",
    "https://www.karentkoi.live",
    "https://current-nai-k2e1.onrender.com",
    "http://localhost:5173",
    "http://localhost:4000",
]
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS)).split(",")
    if origin.strip()
]

app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])
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
            secure=IS_PRODUCTION,
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


def valid_coordinates(lat: Optional[float], lng: Optional[float]) -> bool:
    return (
        lat is not None
        and lng is not None
        and math.isfinite(lat)
        and math.isfinite(lng)
        and -90 <= lat <= 90
        and -180 <= lng <= 180
    )


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
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "locationAccuracy": row["location_accuracy"],
        "locationSource": row["location_source"],
        "confirmations": confirmations,
        "confirmedByYou": confirmed_by_you,
        "restoreVotes": restore_votes,
        "restoreVotesNeeded": required_restore_votes(confirmations),
        "restoredByYou": restored_by_you,
        "durationMinutes": outage_minutes(row),
        "createdAt": _iso_z(created_at) if isinstance(created_at, datetime) else created_at,
        "updatedAt": _iso_z(updated_at) if isinstance(updated_at, datetime) else updated_at,
    }


def serialize_suggestion(row) -> dict:
    created_at = row["created_at"]
    return {
        "id": row["id"],
        "message": row["message"],
        "category": row["category"],
        "createdAt": _iso_z(created_at) if isinstance(created_at, datetime) else created_at,
    }


async def fetch_restore_state(report_id: int, anon_hash: str) -> tuple[int, bool]:
    """(distinct vote count, whether this anon has voted) for a single report."""
    rows = await db.all("SELECT anon_hash FROM report_restore_votes WHERE report_id = $1", report_id)
    hashes = {r["anon_hash"] for r in rows}
    return len(hashes), anon_hash in hashes


# --- request bodies -----------------------------------------------------------

VALID_LOCATION_SOURCE = {"gps", "manual"}


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
    # Exact reporter-supplied coordinates — the division/district/area fields
    # above are administrative context, not the report's actual position.
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    locationAccuracy: Optional[float] = None
    locationSource: Optional[str] = None


VALID_SUGGESTION_CATEGORY = {"new_feature", "improvement", "bug", "design", "other"}
MAX_SUGGESTION_MESSAGE_LENGTH = 2000


class NewSuggestionInput(BaseModel):
    message: Optional[str] = None
    category: Optional[str] = None


# --- routes --------------------------------------------------------------------

@app.get("/api/reports")
@limiter.limit(RateLimit.READ_DEFAULT)
async def list_reports(
    request: Request,
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


@app.get("/api/suggestions")
@limiter.limit(RateLimit.READ_DEFAULT)
async def list_suggestions(request: Request):
    """Public feedback wall — same anonymity guarantee as the write side
    (see create_suggestion below): rows carry no reporter identity at all,
    so there's nothing sensitive to gate this read behind. Newest first,
    capped the same way /api/reports is."""
    rows = await db.all("SELECT * FROM suggestions ORDER BY created_at DESC LIMIT 200")
    return {"suggestions": [serialize_suggestion(r) for r in rows]}


@app.post("/api/suggestions", status_code=201)
@limiter.limit(RateLimit.SUGGESTION_CREATE)
async def create_suggestion(request: Request, body: NewSuggestionInput):
    """Fully anonymous site-feedback submission — no anon cookie is read or
    issued here (unlike every report route), so nothing ties a suggestion
    back to a visitor even indirectly. Anti-spam is the same per-IP limiter
    used everywhere else in this file, tighter than reports' since a bare
    text field is a cheaper spam target than the multi-field report form."""
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail={"error": "message_required"})
    if len(message) > MAX_SUGGESTION_MESSAGE_LENGTH:
        raise HTTPException(status_code=400, detail={"error": "message_too_long"})
    if not body.category or body.category not in VALID_SUGGESTION_CATEGORY:
        raise HTTPException(status_code=400, detail={"error": "category_required"})

    row = await db.get(
        "INSERT INTO suggestions (message, category) VALUES ($1, $2) RETURNING *",
        message,
        body.category,
    )
    return {"suggestion": serialize_suggestion(row)}


# --- short-lived response cache -----------------------------------------------
# summary/stats/patterns each scan the full `reports` table on every call. The
# rate limits above cap outright abuse, but under legitimate heavy read
# traffic (e.g. many visitors with the homepage open at once) every one of
# those requests would still still hit Postgres. A short TTL absorbs that:
# a few seconds of staleness on aggregate stats is a fine trade for the DB
# load saved, and new reports/confirmations still surface within one TTL
# window with no manual invalidation to wire up on the write side.
#
# Deliberately separate from the geocode caches below (OrderedDict, LRU-only,
# no expiry) — that data is genuinely static; this data changes continuously,
# so it needs an actual TTL rather than permanent caching.
READ_CACHE_TTL_SECONDS = 15
_READ_CACHE_MAX_ENTRIES = 200
_read_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()


async def _cached_read(key: str, compute) -> dict:
    now = time.monotonic()
    cached = _read_cache.get(key)
    if cached is not None:
        expires_at, value = cached
        if expires_at > now:
            _read_cache.move_to_end(key)
            return value

    value = await compute()
    _read_cache[key] = (now + READ_CACHE_TTL_SECONDS, value)
    _read_cache.move_to_end(key)
    if len(_read_cache) > _READ_CACHE_MAX_ENTRIES:
        _read_cache.popitem(last=False)
    return value


@app.get("/api/summary")
@limiter.limit(RateLimit.READ_DEFAULT)
async def summary(request: Request):
    async def compute() -> dict:
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

    return await _cached_read("summary", compute)


@app.get("/api/stats")
@limiter.limit(RateLimit.READ_DEFAULT)
async def stats(request: Request):
    """Aggregate ledger stats, in the spirit of a public accountability record:
    how much outage time has been reported, how much of it is still unresolved,
    and a provider x division breakdown of where it is concentrated."""

    async def compute() -> dict:
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

            p = by_provider.setdefault(
                r["provider_id"], {"id": r["provider_id"], "reports": 0, "minutes": 0, "ongoing": 0}
            )
            p["reports"] += 1
            p["minutes"] += mins
            if not r["end_time"]:
                p["ongoing"] += 1

            d = by_division.setdefault(
                r["division_id"], {"id": r["division_id"], "reports": 0, "minutes": 0, "ongoing": 0}
            )
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

    return await _cached_read("stats", compute)


@app.post("/api/reports/{report_id}/confirm")
@limiter.limit(RateLimit.REPORT_VOTE)
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
@limiter.limit(RateLimit.REPORT_VOTE)
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
@limiter.limit(RateLimit.READ_DEFAULT)
async def patterns(
    request: Request, division: Optional[str] = None, district: Optional[str] = None, area: Optional[str] = None
):
    """Hour-of-day breakdown of reported outages, so an area can see when it
    tends to lose power (e.g. "6-8pm most nights") rather than just aggregate
    totals."""

    async def compute() -> dict:
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

    # Bounded by the app's finite division/district/area combinations (see
    # _READ_CACHE_MAX_ENTRIES), unlike summary/stats which use one fixed key.
    cache_key = f"patterns:{division or ''}:{district or ''}:{area or ''}"
    return await _cached_read(cache_key, compute)


# A descriptive User-Agent (required by usage policy on the Nominatim
# fallback below) identifying the calling application.
GEOCODE_USER_AGENT = os.environ.get(
    "GEOCODE_USER_AGENT", "current-nai/1.0 (+https://github.com/te9bot/current-nai)"
)

# Confirmed in production: Nominatim's free public API sustainedly returns
# HTTP 429 to Render's shared outbound IP range — not a burst, not a bug
# here, an external rate limit tied to that IP range that this server can't
# lift. LocationIQ hosts the same Nominatim dataset behind a per-API-key
# rate limit instead of a shared-IP one, and mirrors Nominatim's exact
# request/response shape (same params, same address.state/state_district/
# suburb fields), so switching is a same-shape swap, not a rewrite — the
# parsing below is identical either way.
#
# Falls back to calling Nominatim directly only when no key is configured
# (e.g. this deploy hasn't had one added to Render's env vars yet) — still
# functional, just back to the same rate-limited behaviour already seen in
# production until a key is set. Get a free key at https://locationiq.com
# (5,000 requests/day, no credit card required) and set LOCATIONIQ_API_KEY
# in Render's dashboard.
LOCATIONIQ_API_KEY = os.environ.get("LOCATIONIQ_API_KEY")


def _geocode_url(kind: str) -> str:
    if LOCATIONIQ_API_KEY:
        return f"https://us1.locationiq.com/v1/{kind}"
    return f"https://nominatim.openstreetmap.org/{kind}"


def _geocode_provider_params() -> dict:
    return {"key": LOCATIONIQ_API_KEY} if LOCATIONIQ_API_KEY else {}


# In-memory, process-lifetime cache for successful lookups only — a miss or
# upstream failure is never cached, since it may just be transient and
# should always be retried on the next request rather than permanently
# treated as unresolvable. Capped and LRU-evicted so a long-running process
# can't grow this unboundedly; admin-boundary data is effectively static, so
# no TTL expiry is needed beyond that cap.
_CACHE_MAX_ENTRIES = 2000
_geocode_cache: "OrderedDict[str, dict]" = OrderedDict()
_reverse_geocode_cache: "OrderedDict[tuple[float, float], dict]" = OrderedDict()


def _cache_get(cache: "OrderedDict", key):
    if key not in cache:
        return None
    cache.move_to_end(key)
    return cache[key]


def _cache_put(cache: "OrderedDict", key, value: dict) -> None:
    cache[key] = value
    cache.move_to_end(key)
    if len(cache) > _CACHE_MAX_ENTRIES:
        cache.popitem(last=False)


def _reverse_cache_key(lat: float, lng: float) -> tuple[float, float]:
    # ~111m precision at the equator — coarse enough that repeat lookups
    # near the same spot (the same visitor reporting again, or several
    # visitors in the same neighbourhood) hit the cache, fine-grained
    # enough to still resolve the correct thana-level area.
    return (round(lat, 3), round(lng, 3))


@app.get("/api/geocode")
@limiter.limit(RateLimit.GEOCODING)
async def geocode(request: Request, q: str):
    """Best-effort address -> coordinates lookup for the report form's
    "pin my exact address" flow. A miss or upstream failure just means no
    pin update on the frontend — never a fabricated coordinate."""
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail={"error": "query_required"})

    cache_key = query.lower()
    cached = _cache_get(_geocode_cache, cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _geocode_url("search"),
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "bd",
                    **_geocode_provider_params(),
                },
                headers={"User-Agent": GEOCODE_USER_AGENT},
            )
            resp.raise_for_status()
            results = resp.json()
    except httpx.HTTPStatusError as e:
        # Logged, not returned to the client — a miss is a normal, expected
        # outcome for callers — so this stays diagnosable from Render's own
        # logs without another deploy.
        print(f"[geocode] upstream {e.response.status_code}: {e.response.text[:200]!r}")
        return {"found": False}
    except (httpx.HTTPError, ValueError) as e:
        print(f"[geocode] request failed: {e!r}")
        return {"found": False}

    if not results:
        return {"found": False}

    try:
        lat = float(results[0]["lat"])
        lng = float(results[0]["lon"])
    except (KeyError, TypeError, ValueError):
        return {"found": False}

    if not valid_coordinates(lat, lng):
        return {"found": False}

    result = {"found": True, "lat": lat, "lng": lng, "displayName": results[0].get("display_name")}
    _cache_put(_geocode_cache, cache_key, result)
    return result


@app.get("/api/reverse-geocode")
@limiter.limit(RateLimit.GEOCODING)
async def reverse_geocode(request: Request, lat: float, lng: float):
    """Coordinates -> address lookup for the report form's "use my location"
    auto-fill: turns a GPS fix into candidate division/district/area names,
    which the frontend then matches against its own location list (never
    trusted blindly — the provider's admin boundaries don't line up 1:1 with
    this app's district/thana list, hence returning several candidates per
    level instead of picking one here)."""
    if not valid_coordinates(lat, lng):
        raise HTTPException(status_code=400, detail={"error": "invalid_location"})

    cache_key = _reverse_cache_key(lat, lng)
    cached = _cache_get(_reverse_geocode_cache, cache_key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                _geocode_url("reverse"),
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "addressdetails": 1,
                    "zoom": 16,
                    "accept-language": "en",
                    **_geocode_provider_params(),
                },
                headers={"User-Agent": GEOCODE_USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as e:
        print(f"[reverse-geocode] upstream {e.response.status_code}: {e.response.text[:200]!r}")
        return {"found": False}
    except (httpx.HTTPError, ValueError) as e:
        print(f"[reverse-geocode] request failed: {e!r}")
        return {"found": False}

    address = data.get("address") if isinstance(data, dict) else None
    if not address:
        return {"found": False}

    result = {
        "found": True,
        "division": address.get("state"),
        "districtCandidates": [
            c for c in [address.get("state_district"), address.get("county"), address.get("city")] if c
        ],
        "areaCandidates": [
            c
            for c in [
                address.get("suburb"),
                address.get("residential"),
                address.get("neighbourhood"),
                address.get("quarter"),
                address.get("city_district"),
                address.get("town"),
                address.get("village"),
            ]
            if c
        ],
    }
    _cache_put(_reverse_geocode_cache, cache_key, result)
    return result


@app.post("/api/reports", status_code=201)
@limiter.limit(RateLimit.REPORT_CREATE)
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

    # Exact coordinates are optional (division/district/area alone is still a
    # valid report), but if either is present both must be, in-range, and
    # finite — never a fabricated or partial position. locationAccuracy is
    # meaningless without coordinates, so it only survives alongside them.
    has_coords = body.latitude is not None or body.longitude is not None
    location_lat = location_lng = location_accuracy = location_source = None
    if has_coords:
        if not valid_coordinates(body.latitude, body.longitude):
            raise HTTPException(status_code=400, detail={"error": "invalid_location"})
        if body.locationSource not in VALID_LOCATION_SOURCE:
            raise HTTPException(status_code=400, detail={"error": "invalid_location_source"})
        location_lat = body.latitude
        location_lng = body.longitude
        location_source = body.locationSource
        if body.locationAccuracy is not None and math.isfinite(body.locationAccuracy) and body.locationAccuracy >= 0:
            location_accuracy = body.locationAccuracy

    row = await db.get(
        """
        INSERT INTO reports (
            division_id, district_id, area, area_id, landmark, provider_id, status,
            outage_date, start_time, end_time, note, reporter_ip_hash, reporter_anon_hash,
            latitude, longitude, location_accuracy, location_source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
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
        location_lat,
        location_lng,
        location_accuracy,
        location_source,
    )

    return {"report": serialize_report(row)}


# In production the frontend is a static build served by this same process
# (single Render service instead of a separate static site).
if IS_PRODUCTION and DIST_DIR.is_dir():
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
                # Not fingerprinted like assets/, so not "immutable" — a
                # future content change (e.g. swapping the team photo) needs
                # to be visible within a bounded window, not cached for a
                # year. A week is long enough to meaningfully cut repeat-visit
                # bytes without that risk; browsers still revalidate (via the
                # ETag/Last-Modified FileResponse already sets) once it lapses.
                #
                # robots.txt/sitemap.xml get an explicit media_type rather
                # than relying on the container's system mimetypes database —
                # that guessed text/xml for .xml locally, and an SEO crawler
                # validating these files cares about the exact Content-Type.
                media_type = {"robots.txt": "text/plain", "sitemap.xml": "application/xml"}.get(candidate.name)
                return FileResponse(
                    candidate, media_type=media_type, headers={"Cache-Control": "public, max-age=604800"}
                )

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
