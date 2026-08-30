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
  {
    division_id: 'dhaka', district_id: 'dhaka', area: 'Mirpur 10', provider_id: 'dpdc',
    status: 'load_shedding', ...window_(155, 40), confirmations: 19, created_at: minutesAgo(38),
    note: 'Two outages back to back this evening.',
  },
  {
    division_id: 'dhaka', district_id: 'dhaka', area: 'Uttara', provider_id: 'desco',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 2, created_at: minutesAgo(20),
  },
  {
    division_id: 'dhaka', district_id: 'tangail', area: 'Tangail Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(600, 520), confirmations: 5, created_at: minutesAgo(180),
    note: 'Morning outage, restored within the hour.',
  },
  {
    division_id: 'chattogram', district_id: 'coxsbazar', area: "Cox's Bazar Sadar", provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(910), confirmations: 13, created_at: minutesAgo(65),
    note: 'Coastal feeder, still out.',
  },
  {
    division_id: 'chattogram', district_id: 'feni', area: 'Feni Sadar', provider_id: 'bpdb',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Fine since morning.', confirmations: 1, created_at: minutesAgo(210),
  },
  {
    division_id: 'rajshahi', district_id: 'natore', area: 'Natore Sadar', provider_id: 'nesco',
    status: 'load_shedding', ...window_(1030, 970), confirmations: 3, created_at: minutesAgo(320),
    note: '',
  },
  {
    division_id: 'khulna', district_id: 'jashore', area: 'Jashore Sadar', provider_id: 'wzpdcl',
    status: 'load_shedding', ...window_(1200), confirmations: 24, created_at: minutesAgo(15),
    note: 'Ongoing since early morning, no ETA.',
  },
  {
    division_id: 'khulna', district_id: 'kushtia', area: 'Kushtia Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 4, created_at: minutesAgo(250),
  },
  {
    division_id: 'barishal', district_id: 'bhola', area: 'Bhola Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(730, 660), confirmations: 7, created_at: minutesAgo(290),
    note: 'Ferry ghat area, brief outage.',
  },
  {
    division_id: 'sylhet', district_id: 'moulvibazar', area: 'Moulvibazar Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(400), confirmations: 9, created_at: minutesAgo(55),
    note: '',
  },
  {
    division_id: 'sylhet', district_id: 'habiganj', area: 'Habiganj Sadar', provider_id: 'bpdb',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Stable all day.', confirmations: 2, created_at: minutesAgo(410),
  },
  {
    division_id: 'rangpur', district_id: 'dinajpur', area: 'Dinajpur Sadar', provider_id: 'nesco',
    status: 'load_shedding', ...window_(870, 800), confirmations: 6, created_at: minutesAgo(340),
    note: 'Substation maintenance.',
  },
  {
    division_id: 'rangpur', district_id: 'kurigram', area: 'Kurigram Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(1350), confirmations: 15, created_at: minutesAgo(100),
    note: 'Long overnight outage, still going.',
  },
  {
    division_id: 'mymensingh', district_id: 'jamalpur', area: 'Jamalpur Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 3, created_at: minutesAgo(500),
  },
  {
    division_id: 'dhaka', district_id: 'faridpur', area: 'Faridpur Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(140), confirmations: 6, created_at: minutesAgo(45),
    note: '',
  },
  {
    division_id: 'dhaka', district_id: 'kishoreganj', area: 'Kishoreganj Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 2, created_at: minutesAgo(190),
  },
  {
    division_id: 'dhaka', district_id: 'manikganj', area: 'Manikganj Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(430, 380), confirmations: 5, created_at: minutesAgo(370),
    note: 'Short evening outage.',
  },
  {
    division_id: 'dhaka', district_id: 'munshiganj', area: 'Munshiganj Sadar', provider_id: 'dpdc',
    status: 'load_shedding', ...window_(1080), confirmations: 12, created_at: minutesAgo(80),
    note: 'Riverside feeder, still out.',
  },
  {
    division_id: 'dhaka', district_id: 'narsingdi', area: 'Narsingdi Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Back on since morning.', confirmations: 3, created_at: minutesAgo(260),
  },
  {
    division_id: 'chattogram', district_id: 'brahmanbaria', area: 'Brahmanbaria Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(510, 460), confirmations: 4, created_at: minutesAgo(450),
    note: '',
  },
  {
    division_id: 'chattogram', district_id: 'chandpur', area: 'Chandpur Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(90), confirmations: 8, created_at: minutesAgo(12),
    note: 'Third time today.',
  },
  {
    division_id: 'chattogram', district_id: 'noakhali', area: 'Noakhali Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 1, created_at: minutesAgo(300),
  },
  {
    division_id: 'chattogram', district_id: 'lakshmipur', area: 'Lakshmipur Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(1460), confirmations: 18, created_at: minutesAgo(120),
    note: 'Overnight outage, still going into the morning.',
  },
  {
    division_id: 'rajshahi', district_id: 'pabna', area: 'Pabna Sadar', provider_id: 'nesco',
    status: 'load_shedding', ...window_(200, 150), confirmations: 7, created_at: minutesAgo(155),
    note: '',
  },
  {
    division_id: 'rajshahi', district_id: 'sirajganj', area: 'Sirajganj Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(680), confirmations: 10, created_at: minutesAgo(200),
    note: 'Transformer fault reported by neighbours.',
  },
  {
    division_id: 'rajshahi', district_id: 'naogaon', area: 'Naogaon Sadar', provider_id: 'nesco',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 2, created_at: minutesAgo(330),
  },
  {
    division_id: 'khulna', district_id: 'bagerhat', area: 'Bagerhat Sadar', provider_id: 'wzpdcl',
    status: 'load_shedding', ...window_(60), confirmations: 3, created_at: minutesAgo(7),
    note: '',
  },
  {
    division_id: 'khulna', district_id: 'satkhira', area: 'Satkhira Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(950, 890), confirmations: 9, created_at: minutesAgo(280),
    note: 'Coastal storm knocked out a feeder line earlier.',
  },
  {
    division_id: 'khulna', district_id: 'narail', area: 'Narail Sadar', provider_id: 'wzpdcl',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Stable all day.', confirmations: 1, created_at: minutesAgo(390),
  },
  {
    division_id: 'barishal', district_id: 'patuakhali', area: 'Patuakhali Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(370), confirmations: 6, created_at: minutesAgo(60),
    note: '',
  },
  {
    division_id: 'barishal', district_id: 'pirojpur', area: 'Pirojpur Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 2, created_at: minutesAgo(220),
  },
  {
    division_id: 'sylhet', district_id: 'sunamganj', area: 'Sunamganj Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(1550), confirmations: 14, created_at: minutesAgo(90),
    note: 'Haor area feeder, long overnight outage.',
  },
  {
    division_id: 'rangpur', district_id: 'gaibandha', area: 'Gaibandha Sadar', provider_id: 'nesco',
    status: 'load_shedding', ...window_(320, 260), confirmations: 5, created_at: minutesAgo(230),
    note: '',
  },
  {
    division_id: 'rangpur', district_id: 'thakurgaon', area: 'Thakurgaon Sadar', provider_id: 'nesco',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: '', confirmations: 1, created_at: minutesAgo(310),
  },
  {
    division_id: 'rangpur', district_id: 'lalmonirhat', area: 'Lalmonirhat Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(830), confirmations: 8, created_at: minutesAgo(140),
    note: 'Border town feeder, unresolved since afternoon.',
  },
  {
    division_id: 'mymensingh', district_id: 'netrokona', area: 'Netrokona Sadar', provider_id: 'palli_bidyut',
    status: 'load_shedding', ...window_(110), confirmations: 4, created_at: minutesAgo(22),
    note: '',
  },
  {
    division_id: 'mymensingh', district_id: 'sherpur', area: 'Sherpur Sadar', provider_id: 'palli_bidyut',
    status: 'power_on', outage_date: null, start_time: null, end_time: null,
    note: 'Fine since noon.', confirmations: 2, created_at: minutesAgo(270),
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
