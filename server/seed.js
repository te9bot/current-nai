import { get, run } from "./db.js";

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Outage dates and times are local wall-clock values (an outage that began at
 * 14:00 in Dhaka is "14:00" on that local date). Deriving them with
 * toISOString() would use UTC and shift the date across midnight, which made
 * every ongoing outage look hours longer than it was.
 */
const pad = (n) => String(n).padStart(2, "0");
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** An outage window that began `startMin` ago, optionally ending `endMin` ago. */
function window_(startMin, endMin = null) {
  const start = new Date(Date.now() - startMin * 60_000);
  return {
    outage_date: localDate(start),
    start_time: localTime(start),
    end_time: endMin === null ? null : localTime(new Date(Date.now() - endMin * 60_000)),
  };
}

const seedReports = [
  {
    division_id: 'dhaka', district_id: 'dhaka', area: 'Dhanmondi', provider_id: 'dpdc',
    status: 'load_shedding', ...window_(95), confirmations: 14, created_at: minutesAgo(6),
    note: 'Frequent evening outages this week, roughly every 2 hours.',
  },
  {
    division_id: 'dhaka', district_id: 'gazipur', area: 'Tongi', provider_id: 'desco',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Stable since this morning.', confirmations: 3, created_at: minutesAgo(14),
  },
  {
    division_id: 'chattogram', district_id: 'chattogram', area: 'Agrabad', provider_id: 'bpdb',
    status: 'load_shedding', ...window_(220, 130), confirmations: 8, created_at: minutesAgo(41),
    note: 'Scheduled maintenance by PDB, restored on time.',
  },
  {
    division_id: 'rajshahi', district_id: 'rajshahi', area: 'Shaheb Bazar', provider_id: 'nesco',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 2, created_at: minutesAgo(58),
  },
  {
    division_id: 'khulna', district_id: 'khulna', area: 'Sonadanga', provider_id: 'wzpdcl',
    status: 'load_shedding', ...window_(165), confirmations: 21, created_at: minutesAgo(75),
    note: 'Still out, no update from the office yet.',
  },
  {
    division_id: 'sylhet', district_id: 'sylhet', area: 'Zindabazar', provider_id: 'bpdb',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Back since noon.', confirmations: 5, created_at: minutesAgo(95),
  },
  {
    division_id: 'rangpur', district_id: 'rangpur', area: 'Station Road', provider_id: 'nesco',
    status: 'load_shedding', ...window_(300, 200), confirmations: 6, created_at: minutesAgo(130),
    note: '',
  },
  {
    division_id: 'barishal', district_id: 'barishal', area: 'Band Road', provider_id: 'bpdb',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 1, created_at: minutesAgo(160),
  },
  {
    division_id: 'mymensingh', district_id: 'mymensingh', area: 'Ganginarpar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(48), confirmations: 17, created_at: minutesAgo(3),
    note: 'Third outage today, very frustrating.',
  },
  {
    division_id: 'dhaka', district_id: 'narayanganj', area: 'Chashara', provider_id: 'dpdc',
    status: 'load_shedding', ...window_(25), confirmations: 9, created_at: minutesAgo(1),
    note: '',
  },
  {
    division_id: 'chattogram', district_id: 'cumilla', area: 'Kandirpar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(70), confirmations: 4, created_at: minutesAgo(9),
    note: '',
  },
  {
    division_id: 'dhaka', district_id: 'dhaka', area: 'Mirpur 10', provider_id: 'dpdc',
    status: 'load_shedding', ...window_(155, 40), confirmations: 19, created_at: minutesAgo(38),
    note: 'Two outages back to back this evening.',
  },
  {
    division_id: 'khulna', district_id: 'jashore', area: 'Jashore Sadar', provider_id: 'wzpdcl',
    status: 'load_shedding', ...window_(1200), confirmations: 24, created_at: minutesAgo(15),
    note: 'Ongoing since early morning, no ETA.',
  },
  {
    division_id: 'chattogram', district_id: 'coxsbazar', area: "Cox's Bazar Sadar", provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(910), confirmations: 13, created_at: minutesAgo(65),
    note: 'Coastal feeder, still out.',
  },
  {
    division_id: 'khulna', district_id: 'bagerhat', area: 'Bagerhat Sadar', provider_id: 'wzpdcl',
    status: 'load_shedding', ...window_(60), confirmations: 3, created_at: minutesAgo(7),
    note: '',
  },
];

export async function seedIfEmpty() {
  const row = await get("SELECT COUNT(*) AS count FROM reports");
  if (Number(row.count) > 0) {
    console.log(`[seed] ${row.count} existing reports, skipping seed.`);
    return;
  }
  await insertSeedReports();
}

async function insertSeedReports() {
  for (const r of seedReports) {
    await run(
      `INSERT INTO reports (division_id, district_id, area, provider_id, status, outage_date, start_time, end_time, note, confirmations, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        r.division_id,
        r.district_id,
        r.area,
        r.provider_id,
        r.status,
        r.outage_date,
        r.start_time,
        r.end_time,
        r.note ?? "",
        r.confirmations ?? 0,
        r.created_at,
      ]
    );
  }
  console.log(`[seed] inserted ${seedReports.length} sample reports.`);
}

/**
 * Wipes every existing report (real or seeded) and replaces them with the
 * current seedReports list. Unlike seedIfEmpty(), this always runs — it's
 * for deliberately resetting a database that already has data, e.g. trimming
 * a live demo dataset back down to size. Never called automatically; only
 * from the `--reset` CLI flag below.
 */
export async function resetAndSeed() {
  const before = Number((await get("SELECT COUNT(*) AS count FROM reports")).count);
  await run("DELETE FROM reports");
  await run("ALTER SEQUENCE reports_id_seq RESTART WITH 1");
  await insertSeedReports();
  console.log(`[seed] reset: removed ${before} existing reports, inserted ${seedReports.length}.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  if (process.argv.includes("--reset")) {
    await resetAndSeed();
  } else {
    await seedIfEmpty();
  }
  process.exit(0);
}
