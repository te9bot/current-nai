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

Khulna was missing a city/sadar-level area entry entirely (every other
divisional capital already had one, e.g. "Sylhet Sadar", "Barishal Sadar").
Added "Khulna City", sourced from GeoNames' PPLA (admin seat) row: 22.80979,
89.56439 (geonameid 1336135). Rajshahi got the fuller treatment below instead
of the same one-entry stand-in, since a single "Rajshahi City" area doesn't
reflect how the city corporation is actually organized administratively.

## The Thana/Upazila → Locality tier

`Area` (the tier described above) can now optionally carry a `localities`
array — the next level down: Division → District → Area (Thana/Upazila,
labeled that way in the report form) → Locality (labeled "Area" in the form,
confusingly — see the docstring on `Area` in `src/types/index.ts`).

**Rajshahi City Corporation** was rebuilt properly instead of the single
"Rajshahi City" stand-in from the previous pass: it's actually organized into
4 real thanas, all present in GeoNames as ADM3 rows —

| Thana | Coordinate | GeoNames row |
|---|---|---|
| Boalia | 24.37, 88.605 | "Boalia Upazila", geonameid 9295781 |
| Rajpara | 24.37434, 88.57137 | "RCC (Rajpara)", geonameid 11288029 |
| Motihar | 24.36801, 88.64067 | "RCC (Motihar)", geonameid 11288030 |
| Shah Mokhdum | 24.40294, 88.60855 | "RCC (Shahmokhdum)", geonameid 11288031 |

Two verified localities were added under these:

- **Talaimari** (তালাইমারি), 24.3617221, 88.6268824 — under **Motihar**.
  Coordinate from an OSM node (`place=suburb`, id 13925711108, ODbL);
  thana parentage confirmed via a mindat.org gazetteer record: "Talaimari,
  Ward - 25, RCC (Motihar), Rajshahi." **Not Boalia** — a request for this
  work assumed Boalia, but that doesn't match this source and wasn't used.
- **Laxmipur** (লক্ষ্মীপুর), 24.3739, 88.5822 — under **Rajpara**.
  Coordinate from OSM/Nominatim ("Laxmipur Govt Primary School" / "T.B. Road
  Laxmipur Kacha Bazar", near Kadirgonj); thana parentage is a distance-based
  inference (~1.1km from Rajpara's own seat coordinate, no polygon boundary
  or named-ward source found to confirm it directly the way Talaimari's was)
  — flagged here as weaker confidence than Talaimari's, not fabricated, but
  not independently confirmed either.

No other district's areas have a `localities` entry yet. Every locality
lookup (`getLocalities`/`getLocality`/`findAreaContainingLocality` in
`src/data/locations.ts`) returns an empty result for them, and the report
form simply doesn't render the fourth dropdown in that case — same behavior
as before this tier existed.

**No backend/database change was needed or made.** A report's existing
`areaId` field now records whichever level (thana or locality) the reporter
actually selected — geo.ts's `areaCoords`/`findAreaContainingLocality`
recover a locality's parent thana from the static dataset alone, without a
separate stored column, so this works within the existing schema. One
consequence: if any report was submitted using the removed "rajshahi-city"
id (it was live briefly, one commit before this one), that report's `areaId`
lookup now falls back to the district centroid — a graceful degradation, not
an error, since the schema stores no *other* reference to it.

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

## What's still missing: nationwide neighborhood-level localities

The app's target hierarchy is Division → District → City/Upazila/Thana →
Locality/Area/Neighborhood. GeoNames' finest reliable Bangladesh tier is the
upazila/thana level above — it does **not** carry intra-city neighborhoods.
Rajshahi's Motihar and Rajpara thanas now have one verified locality each
(above) as a proof that the pipeline and schema work end-to-end; the other
~570 areas nationwide (including Rajshahi's own Boalia and Shah Mokhdum
thanas) still have none.

**OpenStreetMap does carry some of this**, tagged `place=suburb` /
`neighbourhood` / `quarter` / `square`, license ODbL (attribution +
share-alike required for derived data). Verified live via the Overpass API —
a bounding-box query over central Rajshahi returned real, named,
coordinate-bearing places including "Alupotti More" (24.3635351,
88.6043489), "Talaimari", "Sultanabad", "Kadirgonj", "Sagorpara",
"Beldarpara", "Tikapara", "Kazla More", "Dhorompur", and "Padma Residential
Area" — but a direct name search for "Kalaimari" specifically returned
nothing, confirming coverage is real but genuinely inconsistent from place
to place, not just slow to query. Thana-level *parentage* (which of the 4
Rajshahi thanas a given locality belongs to) isn't tagged on these OSM points
at all — OSM has no administrative-boundary polygons for these 4 thanas
either — so confirming it takes an independent source per locality
(Talaimari's came from a mindat.org gazetteer entry; Laxmipur's is a
distance-based inference, noted above as unconfirmed).

This was **not** extended to the other ~570 areas: populating a handful more
while leaving most of the country's neighborhood tier empty would look like
broken/incomplete coverage rather than an honestly-scoped partial rollout,
and the public Overpass API is rate-limited and was intermittently timing
out during testing (some queries needed 2+ retries) — building complete
national coverage means one bounding-box query per upazila/city-thana
(roughly 500+ queries), each result hand-checked against duplicate/junk tags
and, where possible, an independent source for thana parentage, before it's
trustworthy enough to put on a live map.

**To finish this level nationwide, one of the following is needed:**

1. Approval to run the multi-hour Overpass extraction + review pass as a
   dedicated follow-up (the pipeline above is proven to work; it just needs
   the query-per-upazila loop, de-duplication, and manual spot-checking time
   this session didn't spend on it), or
2. A locality-level extract you already have rights to use — e.g. a BBS
   mouza/mahalla list, a city corporation ward-boundary GIS export, or your
   own vetted CSV/GeoJSON — with, at minimum: locality name (en/bn), parent
   upazila/thana id, latitude, longitude.

Either way, no further schema work is needed: the `localities` tier already
exists and is live for Motihar/Rajpara above, with `ReportForm`, `geo.ts`,
`MapView`, and `NearbyPanel` all reading through the same
`locations.ts`/`locations.json`. Adding more districts' localities is purely
a data-population task — just fill in more `localities` arrays with the
same shape (`id`, `en`, `bn`, `lat`, `lng`).
