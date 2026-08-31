import argparse
import asyncio
from datetime import datetime, timedelta
from typing import Optional

from backend import db


def _minutes_ago(m: float) -> datetime:
    return datetime.now() - timedelta(minutes=m)


# Outage dates and times are local wall-clock values (an outage that began at
# 14:00 in Dhaka is "14:00" on that local date). Deriving them from a UTC
# timestamp would shift the date across midnight, which made every ongoing
# outage look hours longer than it was.
def _local_date(d: datetime) -> str:
    return d.strftime("%Y-%m-%d")


def _local_time(d: datetime) -> str:
    return d.strftime("%H:%M")


def _window(start_min: float, end_min: Optional[float] = None) -> dict:
    """An outage window that began `start_min` ago, optionally ending `end_min` ago."""
    start = datetime.now() - timedelta(minutes=start_min)
    return {
        "outage_date": _local_date(start),
        "start_time": _local_time(start),
        "end_time": None if end_min is None else _local_time(datetime.now() - timedelta(minutes=end_min)),
    }


def _report(division_id, district_id, area, provider_id, status, confirmations, created_at_min_ago, note="", **window):
    return {
        "division_id": division_id,
        "district_id": district_id,
        "area": area,
        "provider_id": provider_id,
        "status": status,
        "outage_date": window.get("outage_date"),
        "start_time": window.get("start_time"),
        "end_time": window.get("end_time"),
        "confirmations": confirmations,
        "created_at": _minutes_ago(created_at_min_ago),
        "note": note,
    }


SEED_REPORTS = [
    _report(
        "dhaka", "dhaka", "Dhanmondi", "dpdc", "load_shedding", 14, 6,
        note="Frequent evening outages this week, roughly every 2 hours.",
        **_window(95),
    ),
    _report(
        "dhaka", "gazipur", "Tongi", "desco", "power_on", 3, 14,
        note="Stable since this morning.",
    ),
    _report(
        "chattogram", "chattogram", "Agrabad", "bpdb", "load_shedding", 8, 41,
        note="Scheduled maintenance by PDB, restored on time.",
        **_window(220, 130),
    ),
    _report(
        "rajshahi", "rajshahi", "Shaheb Bazar", "nesco", "power_on", 2, 58,
    ),
    _report(
        "khulna", "khulna", "Sonadanga", "wzpdcl", "load_shedding", 21, 75,
        note="Still out, no update from the office yet.",
        **_window(165),
    ),
    _report(
        "sylhet", "sylhet", "Zindabazar", "bpdb", "power_on", 5, 95,
        note="Back since noon.",
    ),
    _report(
        "rangpur", "rangpur", "Station Road", "nesco", "load_shedding", 6, 130,
        **_window(300, 200),
    ),
    _report(
        "barishal", "barishal", "Band Road", "bpdb", "power_on", 1, 160,
    ),
    _report(
        "mymensingh", "mymensingh", "Ganginarpar", "palli_bidyut", "load_shedding", 17, 3,
        note="Third outage today, very frustrating.",
        **_window(48),
    ),
    _report(
        "dhaka", "narayanganj", "Chashara", "dpdc", "load_shedding", 9, 1,
        **_window(25),
    ),
    _report(
        "chattogram", "cumilla", "Kandirpar", "palli_bidyut", "load_shedding", 4, 9,
        **_window(70),
    ),
    _report(
        "dhaka", "dhaka", "Mirpur 10", "dpdc", "load_shedding", 19, 38,
        note="Two outages back to back this evening.",
        **_window(155, 40),
    ),
    _report(
        "khulna", "jashore", "Jashore Sadar", "wzpdcl", "load_shedding", 24, 15,
        note="Ongoing since early morning, no ETA.",
        **_window(1200),
    ),
    _report(
        "chattogram", "coxsbazar", "Cox's Bazar Sadar", "palli_bidyut", "load_shedding", 13, 65,
        note="Coastal feeder, still out.",
        **_window(910),
    ),
    _report(
        "khulna", "bagerhat", "Bagerhat Sadar", "wzpdcl", "load_shedding", 3, 7,
        **_window(60),
    ),
]


async def seed_if_empty(pool) -> None:
    row = await db.get("SELECT COUNT(*) AS count FROM reports")
    if row["count"] > 0:
        print(f"[seed] {row['count']} existing reports, skipping seed.")
        return
    await _insert_seed_reports()


async def _insert_seed_reports() -> None:
    for r in SEED_REPORTS:
        await db.run(
            """
            INSERT INTO reports (division_id, district_id, area, provider_id, status, outage_date, start_time, end_time, note, confirmations, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
            r["division_id"],
            r["district_id"],
            r["area"],
            r["provider_id"],
            r["status"],
            r["outage_date"],
            r["start_time"],
            r["end_time"],
            r["note"] or "",
            r["confirmations"] or 0,
            r["created_at"],
        )
    print(f"[seed] inserted {len(SEED_REPORTS)} sample reports.")


async def reset_and_seed() -> None:
    """
    Wipes every existing report (real or seeded) and replaces them with the
    current SEED_REPORTS list. Unlike seed_if_empty(), this always runs — it's
    for deliberately resetting a database that already has data, e.g. trimming
    a live demo dataset back down to size. Never called automatically; only
    from the --reset CLI flag below.
    """
    before = (await db.get("SELECT COUNT(*) AS count FROM reports"))["count"]
    await db.run("DELETE FROM reports")
    await db.run("ALTER SEQUENCE reports_id_seq RESTART WITH 1")
    await _insert_seed_reports()
    print(f"[seed] reset: removed {before} existing reports, inserted {len(SEED_REPORTS)}.")


async def _main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()

    pool = await db.init_pool()
    try:
        if args.reset:
            await reset_and_seed()
        else:
            await seed_if_empty(pool)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(_main())
