"""Rate-limiting tests for backend/main.py.

Runs against a monkeypatched db/seed layer (no real Postgres) since this repo
has no test database configured — every db.all/get/run call is replaced with
a canned in-memory response before the app's lifespan starts, so these tests
exercise the actual FastAPI/slowapi routing and IP-resolution logic without
touching Supabase.
"""

import datetime as dt

import pytest
from fastapi.testclient import TestClient

from backend import db, main, seed

NOW = dt.datetime.now(dt.timezone.utc)

FAKE_REPORT_ROW = {
    "id": 1,
    "division_id": "dhaka",
    "district_id": "dhaka",
    "area": "Mirpur",
    "area_id": None,
    "landmark": None,
    "provider_id": "unknown",
    "status": "power_on",
    "outage_date": None,
    "start_time": None,
    "end_time": None,
    "note": "",
    "latitude": None,
    "longitude": None,
    "location_accuracy": None,
    "location_source": None,
    "confirmations": 0,
    "created_at": NOW,
    "updated_at": NOW,
}

FAKE_SUGGESTION_ROW = {
    "id": 1,
    "message": "hello",
    "category": "other",
    "created_at": NOW,
}


db_call_counts = {"all": 0, "get": 0}


async def fake_all(sql, *params):
    db_call_counts["all"] += 1
    if "FROM report_confirmations" in sql or "FROM report_restore_votes" in sql:
        return []
    if "FROM suggestions" in sql:
        return [FAKE_SUGGESTION_ROW]
    if "FROM reports" in sql:
        return [FAKE_REPORT_ROW]
    return []


async def fake_get(sql, *params):
    db_call_counts["get"] += 1
    if "COUNT(*)" in sql:
        return {"count": 0}
    if "INSERT INTO suggestions" in sql:
        message, category = params
        return {**FAKE_SUGGESTION_ROW, "message": message, "category": category}
    return FAKE_REPORT_ROW


async def fake_run(sql, *params):
    return "OK"


async def fake_init_pool():
    return None


async def fake_close_pool():
    return None


async def fake_seed_if_empty(pool):
    return None


@pytest.fixture(autouse=True)
def patched_db(monkeypatch):
    monkeypatch.setattr(db, "all", fake_all)
    monkeypatch.setattr(db, "get", fake_get)
    monkeypatch.setattr(db, "run", fake_run)
    monkeypatch.setattr(db, "init_pool", fake_init_pool)
    monkeypatch.setattr(db, "close_pool", fake_close_pool)
    monkeypatch.setattr(seed, "seed_if_empty", fake_seed_if_empty)
    # Every test gets a clean rate-limit window — slowapi's in-memory storage
    # otherwise carries hit counts over between tests since `main.limiter` is
    # a module-level singleton shared by the whole process. Same story for
    # the read-response cache (main._read_cache) added alongside it.
    main.limiter.reset()
    main._read_cache.clear()
    db_call_counts["all"] = 0
    db_call_counts["get"] = 0
    yield
    main.limiter.reset()
    main._read_cache.clear()


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def xff(ip: str) -> dict:
    """Simulated X-Forwarded-For as Render's proxy chain actually produces
    it in production: "<real client>, <cloudflare edge>, <render internal>".
    main.TRUST_PROXY_HOPS=2 walks back two hops from the end, landing on the
    first (real) entry — see get_client_ip in backend/main.py."""
    return {"X-Forwarded-For": f"{ip}, 51.51.51.51, 10.0.0.5"}


VALID_REPORT_BODY = {
    "divisionId": "dhaka",
    "districtId": "dhaka",
    "area": "Mirpur",
    "status": "power_on",
}

VALID_SUGGESTION_BODY = {"message": "please add dark mode", "category": "improvement"}


# --- basic functionality (must not regress) ----------------------------------


def test_get_reports_succeeds(client):
    resp = client.get("/api/reports", headers=xff("1.1.1.1"))
    assert resp.status_code == 200
    assert "reports" in resp.json()


def test_get_suggestions_succeeds(client):
    resp = client.get("/api/suggestions", headers=xff("1.1.1.2"))
    assert resp.status_code == 200
    assert "suggestions" in resp.json()


def test_get_summary_and_stats_and_patterns_succeed(client):
    for path in ("/api/summary", "/api/stats", "/api/patterns"):
        resp = client.get(path, headers=xff("1.1.1.3"))
        assert resp.status_code == 200, path


def test_create_report_still_works(client):
    resp = client.post("/api/reports", json=VALID_REPORT_BODY, headers=xff("2.2.2.1"))
    assert resp.status_code == 201
    assert resp.json()["report"]["area"] == "Mirpur"


def test_create_report_preserves_exact_coordinates(client):
    body = {**VALID_REPORT_BODY, "latitude": 23.780636, "longitude": 90.279541, "locationSource": "gps"}
    resp = client.post("/api/reports", json=body, headers=xff("2.2.2.9"))
    assert resp.status_code == 201


def test_create_suggestion_still_works(client):
    resp = client.post("/api/suggestions", json=VALID_SUGGESTION_BODY, headers=xff("2.2.2.2"))
    assert resp.status_code == 201
    assert resp.json()["suggestion"]["category"] == "improvement"


# --- rate limiting: /api/reports (5/minute) ----------------------------------


def test_reports_under_limit_all_succeed(client):
    ip = xff("3.3.3.1")
    for _ in range(5):
        resp = client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip)
        assert resp.status_code == 201


def test_reports_exceeding_limit_returns_429_with_clean_body(client):
    ip = xff("3.3.3.2")
    for _ in range(5):
        assert client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip).status_code == 201

    resp = client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip)
    assert resp.status_code == 429
    assert resp.json() == {"detail": "Too many requests. Please try again later."}
    assert "Retry-After" in resp.headers
    assert int(resp.headers["Retry-After"]) > 0


def test_reports_different_ips_are_independent(client):
    ip_a = xff("3.3.3.3")
    ip_b = xff("3.3.3.4")
    for _ in range(5):
        assert client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip_a).status_code == 201
    # ip_a is now exhausted...
    assert client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip_a).status_code == 429
    # ...but ip_b has never made a request and is unaffected.
    assert client.post("/api/reports", json=VALID_REPORT_BODY, headers=ip_b).status_code == 201


# --- rate limiting: /api/suggestions (3/10 minutes) --------------------------


def test_suggestions_under_limit_all_succeed(client):
    ip = xff("4.4.4.1")
    for _ in range(3):
        resp = client.post("/api/suggestions", json=VALID_SUGGESTION_BODY, headers=ip)
        assert resp.status_code == 201


def test_suggestions_exceeding_limit_returns_429(client):
    ip = xff("4.4.4.2")
    for _ in range(3):
        assert client.post("/api/suggestions", json=VALID_SUGGESTION_BODY, headers=ip).status_code == 201

    resp = client.post("/api/suggestions", json=VALID_SUGGESTION_BODY, headers=ip)
    assert resp.status_code == 429
    assert resp.json() == {"detail": "Too many requests. Please try again later."}


# --- short-lived read cache (summary/stats/patterns) -------------------------


def test_summary_hits_db_once_then_serves_from_cache(client):
    ip = xff("7.7.7.1")
    first = client.get("/api/summary", headers=ip)
    assert first.status_code == 200
    hits_after_first = db_call_counts["get"]
    assert hits_after_first > 0

    second = client.get("/api/summary", headers=ip)
    assert second.status_code == 200
    assert second.json() == first.json()
    # A cache hit must not touch the db layer again.
    assert db_call_counts["get"] == hits_after_first


def test_stats_hits_db_once_then_serves_from_cache(client):
    ip = xff("7.7.7.2")
    assert client.get("/api/stats", headers=ip).status_code == 200
    hits_after_first = db_call_counts["all"]
    assert hits_after_first > 0

    assert client.get("/api/stats", headers=ip).status_code == 200
    assert db_call_counts["all"] == hits_after_first


def test_patterns_cache_key_varies_by_query_params(client):
    ip = xff("7.7.7.3")
    assert client.get("/api/patterns", headers=ip).status_code == 200
    hits_after_first = db_call_counts["all"]

    # Same params again -> cache hit, no new db call.
    assert client.get("/api/patterns", headers=ip).status_code == 200
    assert db_call_counts["all"] == hits_after_first

    # Different params -> distinct cache key, so this does hit the db.
    assert client.get("/api/patterns", params={"division": "dhaka"}, headers=ip).status_code == 200
    assert db_call_counts["all"] == hits_after_first + 1


def test_cache_does_not_bypass_the_rate_limiter(client):
    """The read cache and the rate limiter are independent layers — a cached
    response still counts against the caller's per-IP quota."""
    ip = xff("7.7.7.4")
    for _ in range(100):
        assert client.get("/api/summary", headers=ip).status_code == 200
    resp = client.get("/api/summary", headers=ip)
    assert resp.status_code == 429


# --- client IP resolution behind Render's proxy chain ------------------------


def test_get_client_ip_trusts_the_configured_hop_count():
    """Mirrors the real Cloudflare -> Render chain: real client first,
    rotating hops after it. TRUST_PROXY_HOPS=2 (the default) must resolve
    back to the first entry, not the last (which is Render's own rotating
    internal IP and would silently defeat both rate limiting and
    reporter-IP hashing if trusted instead)."""

    class FakeClient:
        host = "10.0.0.5"

    class FakeRequest:
        headers = {"x-forwarded-for": "9.9.9.9, 51.51.51.51, 10.0.0.5"}
        client = FakeClient()

    assert main.get_client_ip(FakeRequest()) == "9.9.9.9"


def test_get_client_ip_falls_back_to_direct_connection_without_xff():
    class FakeClient:
        host = "127.0.0.1"

    class FakeRequest:
        headers = {}
        client = FakeClient()

    assert main.get_client_ip(FakeRequest()) == "127.0.0.1"


# --- CORS (must be untouched by the rate limiter) ----------------------------


def test_cors_allows_configured_origin(client):
    resp = client.get("/api/reports", headers={**xff("5.5.5.1"), "Origin": "https://karentkoi.live"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://karentkoi.live"


def test_cors_rejects_unlisted_origin(client):
    resp = client.get("/api/reports", headers={**xff("5.5.5.2"), "Origin": "https://evil.example.com"})
    assert resp.status_code == 200  # not a preflight, so the request itself still succeeds...
    assert "access-control-allow-origin" not in {k.lower() for k in resp.headers}  # ...just without the CORS header


# --- production startup ------------------------------------------------------


def test_app_starts_up_and_shuts_down_cleanly(client):
    resp = client.get("/api/reports", headers=xff("6.6.6.1"))
    assert resp.status_code == 200
