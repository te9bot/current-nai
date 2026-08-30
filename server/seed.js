import { db } from "./db.js";

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString().replace("Z", "") + "Z";

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
    division_id: 'rajshahi', district_id: 'bogura', area: 'Satmatha', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(310, 160), confirmations: 11, created_at: minutesAgo(52),
    note: 'Rural feeder, out for two and a half hours.',
  },
  {
    division_id: 'chattogram', district_id: 'cumilla', area: 'Kandirpar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(70), confirmations: 4, created_at: minutesAgo(9),
    note: '',
  },
];

export function seedIfEmpty() {
  const row = db.prepare("SELECT COUNT(*) AS count FROM reports").get();
  if (row.count > 0) {
    console.log(`[seed] ${row.count} existing reports, skipping seed.`);
    return;
  }
  const insert = db.prepare(`
    INSERT INTO reports (division_id, district_id, area, provider_id, status, outage_date, start_time, end_time, note, confirmations, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of seedReports) {
    insert.run(
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
      r.created_at
    );
  }
  console.log(`[seed] inserted ${seedReports.length} sample reports.`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isMain) {
  seedIfEmpty();
}
