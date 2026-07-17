// Fetches the curated star systems for Explore mode from the NASA Exoplanet
// Archive (TAP, table pscomppars) and writes src/data/systems.json.
// Run once (or to refresh): node scripts/fetch-systems.mjs
// The JSON is committed — build and runtime never need the network.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HOSTS = [
  'TRAPPIST-1', 'KOI-351', 'Kepler-11', 'HR 8799', '55 Cnc',
  'Proxima Cen', 'GJ 667 C', 'Kepler-186', 'TOI-700', 'K2-18',
  'HD 209458', '51 Peg', 'GJ 1214', 'Kepler-16', 'Kepler-452',
  'HD 189733', 'GJ 581', 'WASP-12', 'LHS 1140', 'HD 40307',
  'Kepler-22', 'GJ 876', 'tau Cet', 'HAT-P-7', 'Kepler-444',
];

const PC_TO_LY = 3.26156;

// archive-internal designations → common names
const ALIAS = { 'KOI-351': 'Kepler-90' };
const aliased = (name) => {
  for (const [from, to] of Object.entries(ALIAS)) {
    if (name.startsWith(from)) return to + name.slice(from.length);
  }
  return name;
};

const query = `select pl_name,hostname,sy_dist,pl_rade,pl_bmasse,pl_orbper,pl_eqt,disc_year,discoverymethod,st_spectype,st_teff,st_rad,sy_pnum from pscomppars where hostname in (${HOSTS.map((h) => `'${h}'`).join(',')})`;
const url = `https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=${encodeURIComponent(query)}&format=json`;

console.log('fetching', HOSTS.length, 'systems from NASA Exoplanet Archive …');
const rows = await (await fetch(url)).json();

const byHost = new Map();
for (const r of rows) {
  if (!byHost.has(r.hostname)) {
    byHost.set(r.hostname, {
      host: aliased(r.hostname),
      spectype: r.st_spectype || null,
      teff: r.st_teff ?? null,
      stRad: r.st_rad ?? null,
      distLy: r.sy_dist != null ? +(r.sy_dist * PC_TO_LY).toFixed(1) : null,
      planets: [],
    });
  }
  byHost.get(r.hostname).planets.push({
    name: aliased(r.pl_name),
    rade: r.pl_rade ?? null,       // radius, Earth radii
    masse: r.pl_bmasse ?? null,    // mass, Earth masses
    period: r.pl_orbper ?? null,   // orbital period, days
    eqt: r.pl_eqt ?? null,         // equilibrium temperature, K
    discYear: r.disc_year ?? null,
    discMethod: r.discoverymethod || null,
  });
}

const missing = HOSTS.filter((h) => !byHost.has(h));
if (missing.length) console.warn('NOT FOUND in archive:', missing);

const systems = [...byHost.values()];
for (const s of systems) {
  s.planets.sort((a, b) => (a.period ?? 1e12) - (b.period ?? 1e12));
}
systems.sort((a, b) => (a.distLy ?? 1e9) - (b.distLy ?? 1e9));

// our own system as the familiar starting point
systems.unshift({
  host: 'Sol',
  spectype: 'G2 V',
  teff: 5772,
  stRad: 1.0,
  distLy: 0,
  planets: [
    { name: 'Mercury', rade: 0.383, masse: 0.055, period: 88.0, eqt: 440, discYear: null, discMethod: null },
    { name: 'Venus', rade: 0.949, masse: 0.815, period: 224.7, eqt: 227, discYear: null, discMethod: null },
    { name: 'Earth', rade: 1.0, masse: 1.0, period: 365.25, eqt: 255, discYear: null, discMethod: null },
    { name: 'Mars', rade: 0.532, masse: 0.107, period: 687.0, eqt: 210, discYear: null, discMethod: null },
    { name: 'Jupiter', rade: 11.21, masse: 317.8, period: 4332.6, eqt: 122, discYear: null, discMethod: null },
    { name: 'Saturn', rade: 9.45, masse: 95.2, period: 10759, eqt: 90, discYear: null, discMethod: null },
    { name: 'Uranus', rade: 4.01, masse: 14.5, period: 30688, eqt: 64, discYear: 1781, discMethod: 'Telescope' },
    { name: 'Neptune', rade: 3.88, masse: 17.1, period: 60182, eqt: 51, discYear: 1846, discMethod: 'Telescope' },
  ],
});

const out = {
  source: 'NASA Exoplanet Archive (pscomppars) + Sol (manual)',
  fetched: new Date().toISOString().slice(0, 10),
  systems,
};

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'systems.json');
await writeFile(target, JSON.stringify(out, null, 2) + '\n');
console.log(`${systems.length} systems, ${systems.reduce((n, s) => n + s.planets.length, 0)} planets -> ${target}`);
