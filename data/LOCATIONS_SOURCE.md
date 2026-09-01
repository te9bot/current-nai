# Where the area-level coordinates come from

## Source

[GeoNames](https://www.geonames.org) Bangladesh export (`BD.zip` from
`download.geonames.org/export/dump/`), snapshot dated 2026-09-01, licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). GeoNames aggregates
national gazetteer/admin-boundary data; for Bangladesh this corresponds to the
BBS (Bangladesh Bureau of Statistics) administrative hierarchy — divisions,
districts, upazilas/thanas, and unions — plus named populated places.

Attribution required by the license: "Data © GeoNames contributors, CC BY 4.0."

## What it provides

GeoNames' admin hierarchy for Bangladesh maps cleanly onto three of this
app's four levels:

| GeoNames feature code | Count (national) | Maps to |
|---|---|---|
| ADM1 | 8 | Division |
| ADM2 | 64 | District |
| ADM3 | 493 | Upazila / Thana / city-corporation seat |
| ADM4 | 4,699 | Union / ward (not yet used here) |

This app's existing `areas` array (in `locations.json`) was already, in most
districts, populated at upazila/thana granularity — it just had no
coordinates of its own and fell back to the district centroid
(`districts-geo.json`) for map placement. That's the bug this data fixes:
Bheramara (an upazila of Kushtia district) now resolves to its own point
(24.06, 88.99) instead of Kushtia's district centroid (23.9013, 89.1206), a
real ~16km difference.

## What was done

A one-time script (not checked into this repo — it's a data-generation step,
not application code) matched each of the 574 existing `areas` entries
against GeoNames' ADM3 rows (falling back to other populated-place feature
codes — PPLA/PPLA2/PPLA3/PPLA4/PPLX/PPL — for areas that aren't themselves an
administrative seat) within the correct parent district, by normalized name
(including GeoNames' recorded alternate-name spellings). Matches got a real
`lat`/`lng` added to their existing entry in `locations.json` — no other
field was touched, and no existing `id` was renamed or removed (those ids
are referenced by real submitted reports).

**Result: 513 of 574 existing areas (89.4%) now have a real, sourced
coordinate.** The other 61 are listed below — verbatim from GeoNames doesn't
cover these; **they still use the district-centroid fallback and will keep
doing so until a source is available.** They are overwhelmingly Dhaka and
Chattogram's own internal police-thana breakdown (e.g. "Kotwali",
"Kalabagan", "Mirpur 10") — GeoNames' gazetteer represents Dhaka/Chattogram
as single administrative units and doesn't carry their constituent thanas as
separate features. The rest are a handful of newer or very small upazilas
this GeoNames snapshot doesn't have under any recorded spelling.

Two divisional-capital cities — Khulna and Rajshahi — were missing a
city/sadar-level area entry entirely (every other divisional capital already
had one, e.g. "Sylhet Sadar", "Barishal Sadar"). Added "Khulna City" and
"Rajshahi City" as new area entries, sourced from GeoNames' PPLA (admin seat)
rows for those cities: Khulna 22.80979, 89.56439 (geonameid 1336135);
Rajshahi 24.374, 88.60114 (geonameid 1185128).

### Areas still on district-centroid fallback (61)

Dhaka district: Shahbagh, New Market, Kalabagan, Hazaribagh, Chawkbazar,
Kotwali, Sutrapur, Kamrangirchar, Sabujbagh, Mugda, Banani, Uttara East,
Uttara West, Cantonment, Adabor, Sher-e-Bangla Nagar, Tejgaon Industrial
Area, Khilkhet, Bimanbandar, Darus Salam, Vatara, Bhashantek, Hatirjheel,
Dakshinkhan, Uttarkhan, Mirpur 1/2/6/7/9/10/11/12/13/14.

Chattogram district: Halishahar, Double Mooring, Bakalia, Bayazid, Khulshi,
Chawkbazar, Sadarghat, Akbarshah, EPZ, Karnaphuli.

Elsewhere: Faridpur/Saltha, Cumilla/Cumilla Adarsha Sadar, Cumilla/Lalmai,
Cumilla/Monohorganj, Cox's Bazar/Eidgaon, Lakshmipur/Kamalnagar,
Rangamati/Naniyachar, Bogura/Mokamtola, Bogura/Sonatola,
Chapainawabganj/Chapainawabganj Sadar, Khulna/Rupsha,
Habiganj/Shayestaganj, Sunamganj/Bishwambharpur, Sunamganj/Shantiganj,
Sylhet/Osmani Nagar, Thakurgaon/Bhully.

## What's still missing: true neighborhood-level localities

The app's target hierarchy is Division → District → City/Upazila/Thana →
Locality/Area/Neighborhood. GeoNames' finest reliable Bangladesh tier is the
upazila/thana level above — it does **not** carry intra-city neighborhoods
(e.g. Rajshahi's Alupotti, Kalaimari, Sahebbazar).

**OpenStreetMap does carry some of this**, tagged `place=suburb` /
`neighbourhood` / `quarter` / `square`, license ODbL (attribution +
share-alike required for derived data). Verified live during this
investigation via the Overpass API — a bounding-box query over central
Rajshahi returned real, named, coordinate-bearing places including
"Alupotti More" (24.3635351, 88.6043489), "Talaimari" (24.3617221,
88.6268824), "Sultanabad", "Kadirgonj", "Sagorpara", "Beldarpara",
"Tikapara", "Kazla More", "Dhorompur", and "Padma Residential Area" — but a
direct name search for "Kalaimari" specifically returned nothing, confirming
coverage is real but genuinely inconsistent from place to place, not just
slow to query.

This was **not** integrated into `locations.json`: populating it for one
city while leaving the other ~500 upazilas' neighborhood tier empty would
look like broken/incomplete coverage rather than an honestly-scoped partial
rollout, and the public Overpass API is rate-limited and was intermittently
timing out during testing (some queries needed 2+ retries) — building
complete national coverage means one bounding-box query per
upazila/city-thana (roughly 500+ queries), each result hand-checked against
duplicate/junk tags before it's trustworthy enough to put on a live map.

**To finish this level, one of the following is needed:**

1. Approval to run the multi-hour Overpass extraction + review pass as a
   dedicated follow-up (the pipeline above is proven to work; it just needs
   the query-per-upazila loop, de-duplication, and manual spot-checking time
   this session didn't spend on it), or
2. A locality-level extract you already have rights to use — e.g. a BBS
   mouza/mahalla list, a city corporation ward-boundary GIS export, or your
   own vetted CSV/GeoJSON — with, at minimum: locality name (en/bn), parent
   upazila/thana id, latitude, longitude.

Either way, the schema is ready: `Area` (`src/types/index.ts`) already
carries optional `lat`/`lng`, and the same shape extends cleanly to a fourth
`localities` tier without changing how `locations.ts`, `geo.ts`, `MapView`,
`NearbyPanel`, or `ReportForm` consume the dataset.
