import os

# backend/db.py requires DATABASE_URL to even import (it opens no real
# connection at import time, just validates the env var is set) — tests
# monkeypatch every db call, so this never needs to resolve to a real
# database, only to satisfy that import-time check.
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
