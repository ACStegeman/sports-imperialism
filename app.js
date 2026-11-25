// Browser UI. Uses TEAMS, TEAM_BY_ABBR, logoUrl (teams.js) and game.js functions, concatenated by build.mjs.
const W = 975, H = 610, BLANK = 'var(--blank)', STORE = 'nflImperialism.v1';
const NAME_TO_CODE = { Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE', 'District of Columbia':'DC', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY' };
Object.assign(NAME_TO_CODE, { Alberta: 'AB', 'British Columbia': 'BC', Manitoba: 'MB', 'New Brunswick': 'NB', 'Newfoundland and Labrador': 'NL', 'Nova Scotia': 'NS', Ontario: 'ON', 'Prince Edward Island': 'PE', Quebec: 'QC', Saskatchewan: 'SK' });
const SKIP = new Set(['Alaska', 'Hawaii']);
const CODE_TO_NAME = Object.fromEntries(Object.entries(NAME_TO_CODE).map(([n, c]) => [c, n]));

const $ = id => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
// The league being played: its teams, logos and sport.
let LEAGUE = 'nfl', TEAMS = [], TEAM_BY_ABBR = {};
const logoUrl = a => LEAGUES[LEAGUE].logo(a);
function setLeague(key) { LEAGUE = LEAGUES[key] ? key : 'nfl'; TEAMS = LEAGUES[LEAGUE].teams; TEAM_BY_ABBR = Object.fromEntries(TEAMS.map(t => [t.abbr, t])); }
const needsCanada = () => TEAMS.some(t => CANADA.has(t.state));
const homeMap = () => needsCanada() ? 'na' : 'usa';   // the USA map, or North America when the league has Canadian teams
const teamName = a => TEAM_BY_ABBR[a].short || TEAM_BY_ABBR[a].name.split(' ').slice(-1)[0];
let MAP = 'usa';
const regionName = r => r.name ? r.name : r.clip ? `${r.state === 'DC' ? 'DC' : CODE_TO_NAME[r.state]} (${teamName(r.team)} part)` : CODE_TO_NAME[r.state];

let REGIONS = [], BY_ID = {}, CENT = {}, STATE_OF = {};
const LABEL = new Int16Array(W * H);
let state = null; // { owners, strengths, mode, log, turn }
let turn = { step: 'wheel' }; // wheel | arrow | battle | done
let wheelRot = 0, arrowRot = 0, busy = false;
let CAPITALS = {};            // team -> its home region id
let autoplay = false, autoSpeed = 2, replaying = false;
const SPEED = () => autoplay ? autoSpeed : 1;
const opt = k => !!(state && state.options && state.options[k]);
const UNIT = n => MAP === 'world' ? (n === 1 ? 'country' : 'countries') : MAP === 'na' ? (n === 1 ? 'state or province' : 'states and provinces') : (n === 1 ? 'state' : 'states');
const stateLabel = code => MAP === 'world' ? BY_ID[code].name : CODE_TO_NAME[code];
const usaKey = g => SKIP.has(g.properties.name) ? null : NAME_TO_CODE[g.properties.name];
const worldKey = g => g.properties.name === 'Antarctica' ? null : 'W-' + g.properties.name.replace(/[^A-Za-z]+/g, '');

// ---------- geometry ----------
const GRID = new Uint8Array(W * H);
function anchor(points, fallback) {
  if (!points.length) return fallback;
  const mx = points.reduce((s, p) => s + p[0], 0) / points.length, my = points.reduce((s, p) => s + p[1], 0) / points.length;
  // mark the region's pixels, then pick the sample point near the middle with the most room around it
  for (const [x, y] of points) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const gx = x + dx, gy = y + dy; if (gx >= 0 && gy >= 0 && gx < W && gy < H) GRID[gy * W + gx] = 1; }
  const inside = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && GRID[y * W + x] === 1; };
  const dirs = [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]];
  let best = points[0], bestScore = -Infinity;
  for (const p of points) {
    let room = 0;
    for (const r of [4, 8, 12, 16, 20]) { if (dirs.every(([dx, dy]) => inside(p[0] + dx * r, p[1] + dy * r))) room = r; else break; }
    const score = room * 3 - Math.hypot(p[0] - mx, p[1] - my);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  for (const [x, y] of points) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const gx = x + dx, gy = y + dy; if (gx >= 0 && gy >= 0 && gx < W && gy < H) GRID[gy * W + gx] = 0; }
  return best;
}

const naKey = g => g.properties.code;
function buildUSA(topo, na = false) {
  const object = na ? topo.objects.regions : topo.objects.states, keyOf = na ? naKey : usaKey;
  const all = topojson.feature(topo, object);
  const fc = { type: 'FeatureCollection', features: all.features.filter(f => keyOf(f)) };
  const proj = (na ? d3.geoConicEqualArea().parallels([33, 58]).rotate([96, 0]) : d3.geoAlbersUsa()).fitExtent([[8, 8], [W - 8, H - 8]], fc);
  const path = d3.geoPath(proj);
  const ctx = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const f of fc.features) {
    const code = keyOf(f);
    const d = code && path(f);
    if (!d) continue;
    const p2 = new Path2D(d);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const teams = code === 'DC' ? TEAMS.filter(t => t.dc) : TEAMS.filter(t => t.state === code);
    const seeds = teams.map(t => proj([t.lon, t.lat]));
    const step = 2;
    const buckets = teams.length > 1 ? teams.map(() => []) : [[]];
    for (let y = Math.floor(y0); y <= y1; y += step) for (let x = Math.floor(x0); x <= x1; x += step) {
      if (!ctx.isPointInPath(p2, x, y)) continue;
      let k = 0;
      if (teams.length > 1) { let b = Infinity; seeds.forEach((s, i) => { const dd = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (dd < b) { b = dd; k = i; } }); }
      buckets[k].push([x, y]);
    }
    if (teams.length <= 1) {
      out.push({ id: code, state: code, team: teams[0]?.abbr ?? null, d, clip: null, at: anchor(buckets[0], path.centroid(f)), area: path.area(f), pts: buckets[0] });
    } else {
      const vor = d3.Delaunay.from(seeds).voronoi([x0 - 10, y0 - 10, x1 + 10, y1 + 10]);
      teams.forEach((t, i) => out.push({ id: `${code}-${t.abbr}`, state: code, team: t.abbr, d: vor.renderCell(i), clip: code, stateD: d, at: anchor(buckets[i], seeds[i]), area: buckets[i].length * step * step, pts: buckets[i] }));
    }
  }
  const [[bx0, by0], [bx1, by1]] = path.bounds(fc);
  const frame = na ? { x: bx0 - 6, y: by0 - 6, w: bx1 - bx0 + 12, h: by1 - by0 + 12 } : null;
  return { frame, regions: out, path, fc, topo, object, keyOf, segments: buildSegments(topo, object, keyOf, proj, out, ctx) };
}

function buildWorld(topo) {
  const all = topojson.feature(topo, topo.objects.countries);
  const fc = { type: 'FeatureCollection', features: all.features.filter(f => worldKey(f)) };
  const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], fc);
  const path = d3.geoPath(proj);
  const ctx = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const f of fc.features) {
    const d = path(f);
    if (!d) continue;
    const p2 = new Path2D(d);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const step = (x1 - x0) * (y1 - y0) < 900 ? 1 : 2, pts = [];
    for (let y = Math.floor(y0); y <= y1; y += step) for (let x = Math.floor(x0); x <= x1; x += step) if (ctx.isPointInPath(p2, x, y)) pts.push([x, y]);
    out.push({ id: worldKey(f), state: worldKey(f), name: f.properties.name, team: null, d, clip: null, at: anchor(pts, path.centroid(f)), area: path.area(f), pts });
  }
  const [[bx0, by0], [bx1, by1]] = path.bounds(fc);
  return { frame: { x: bx0 - 6, y: by0 - 6, w: bx1 - bx0 + 12, h: by1 - by0 + 12 }, regions: out, path, fc, topo, object: topo.objects.countries, keyOf: worldKey, segments: buildSegments(topo, topo.objects.countries, worldKey, proj, out, ctx) };
}

// Every piece of border, tagged with the region on each side, so lines can vanish inside one team's land.
function buildSegments(topo, object, keyOf, proj, regions, ctx) {
  const parts = {}; // state code -> [{id, xy}] for split states
  for (const r of regions) if (r.clip) {
    const t = TEAM_BY_ABBR[r.team];
    (parts[r.state] ||= []).push({ id: r.id, xy: proj([t.lon, t.lat]), d: r.stateD });
  }
  const regionAt = (code, [x, y]) => {
    const ps = parts[code];
    if (!ps) return code;
    let best = ps[0], b = Infinity;
    for (const p of ps) { const dd = (p.xy[0] - x) ** 2 + (p.xy[1] - y) ** 2; if (dd < b) { b = dd; best = p; } }
    return best.id;
  };
  // which states use each arc
  const users = new Map();
  for (const g of object.geometries) {
    const code = keyOf(g);
    if (!code) continue;
    const walk = a => Array.isArray(a) ? a.forEach(walk) : (k => { const set = users.get(k) || new Set(); set.add(code); users.set(k, set); })(a < 0 ? ~a : a);
    walk(g.arcs);
  }
  const segs = [];
  segs.coastal = new Set();
  for (const [arc, set] of users) {
    if (set.size === 1) segs.coastal.add([...set][0]); // coastline: this region touches open water
    if (set.size !== 2) continue; // coastline / country edge: drawn by the outline
    const [sa, sb] = [...set];
    const pts = topojson.feature(topo, { type: 'LineString', arcs: [arc] }).geometry.coordinates.map(c => proj(c));
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      if (!p || !q) continue;
      const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      segs.push({ p, q, a: regionAt(sa, m), b: regionAt(sb, m) });
    }
  }
  // dividing lines inside split states: sample along each pair's bisector inside the state
  for (const code in parts) {
    const ps = parts[code], p2 = new Path2D(ps[0].d);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const [ax, ay] = ps[i].xy, [bx, by] = ps[j].xy;
      const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = -(by - ay), dy = bx - ax, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      const step = 1.5;
      for (let t = -600; t < 600; t += step) {
        const p = [mx + ux * t, my + uy * t], q = [mx + ux * (t + step), my + uy * (t + step)], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        if (!ctx.isPointInPath(p2, m[0], m[1])) continue;
        // keep only where i and j are the two closest seeds (otherwise a third part owns this spot)
        const near = regionAt(code, [m[0] + (ax - bx) * 0.001, m[1] + (ay - by) * 0.001]);
        const near2 = regionAt(code, [m[0] - (ax - bx) * 0.001, m[1] - (ay - by) * 0.001]);
        if (near === ps[i].id && near2 === ps[j].id) segs.push({ p, q, a: ps[i].id, b: ps[j].id });
      }
    }
  }
  return segs;
}

// ---------- map render ----------
let gRegions, gLogos, gArrow, gAim, gBorders, SEGS = [], ADJ = [], COASTAL = new Set();
const ANCHOR_CACHE = new Map();
function drawMap({ regions, path, topo, segments, object, keyOf }) {
  SEGS = segments;
  COASTAL = segments.coastal;
  const pairs = new Set();
  for (const g of segments) pairs.add([g.a, g.b].sort().join('|'));
  ADJ = [...pairs].map(k => k.split('|'));
  const svg = $('map');
  svg.innerHTML = '';
  const defs = el('defs', {}, svg);
  const clipped = new Set();
  for (const r of regions) if (r.clip && !clipped.has(r.clip)) {
    clipped.add(r.clip);
    const cp = el('clipPath', { id: `clip-${r.clip}` }, defs);
    el('path', { d: r.stateD }, cp);
  }
  gRegions = el('g', {}, svg);
  for (const r of regions) {
    const p = el('path', { d: r.d, class: 'region', 'data-id': r.id }, gRegions);
    if (r.clip) p.setAttribute('clip-path', `url(#clip-${r.clip})`);
    el('title', {}, p);
    p.addEventListener('click', () => { if (!dragged) onRegionClick(r.id); });
  }
  gBorders = el('path', { class: 'borders' }, svg);
  el('path', { d: path(topojson.mesh(topo, object, (a, b) => a === b && keyOf(a))), class: 'outline' }, svg);
  gLogos = el('g', {}, svg);
  gAim = el('g', {}, svg);
  gArrow = el('g', {}, svg);
}


function territorySpot(t) {
  const key = [...t.ids].sort().join(',');
  let spot = ANCHOR_CACHE.get(key);
  if (!spot) {
    const rs = t.ids.map(id => BY_ID[id]);
    const area = rs.reduce((n, r) => n + r.area, 0);
    const at = rs.length === 1 ? rs[0].at : anchor(rs.flatMap(r => r.pts), rs[0].at);
    spot = { at, area };
    ANCHOR_CACHE.set(key, spot);
  }
  return spot;
}
// Where a team's logo sits: the middle of its biggest territory. The arrow spins from here.
function teamSpot(team) {
  let best = null;
  for (const t of territories(state.owners, ADJ)) if (t.team === team) { const sp = territorySpot(t); if (!best || sp.area > best.area) best = sp; }
  return best ? best.at : teamCentroid(team, CENT, state.owners);
}
const labelAt = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const i = LABEL[y * W + x]; return i >= 0 ? REGIONS[i].id : null; };

function paint(owners = state.owners) {
  for (const p of gRegions.children) {
    const r = BY_ID[p.dataset.id], o = owners[r.id];
    const fill = o ? TEAM_BY_ABBR[o].color : BLANK;
    p.setAttribute('fill', fill); p.setAttribute('stroke', fill); p.setAttribute('stroke-width', '0.8');
    p.querySelector('title').textContent = `${regionName(r)}: ${o ? TEAM_BY_ABBR[o].name : 'nobody yet'}`;
  }
  let bd = '';
  for (const g of SEGS) if (showBorder(owners, g.a, g.b)) bd += `M${g.p[0].toFixed(1)},${g.p[1].toFixed(1)}L${g.q[0].toFixed(1)},${g.q[1].toFixed(1)}`;
  gBorders.setAttribute('d', bd);
  gLogos.innerHTML = '';
  const logoSpots = [];
  for (const t of territories(owners, ADJ)) {
    const spot = territorySpot(t);
    if (spot.area < (MAP === 'world' ? 12 : 120)) continue;
    const s = Math.max(MAP === 'world' ? 10 : 14, Math.min(110, Math.sqrt(spot.area) * 0.42)), color = TEAM_BY_ABBR[t.team].color;
    el('circle', { cx: spot.at[0], cy: spot.at[1], r: s * 0.5, fill: '#eef2ea', 'fill-opacity': 0.92, stroke: color, 'stroke-width': 1.5, class: 'logo' }, gLogos);
    const li = s * 0.78;
    el('image', { href: logoUrl(t.team), x: spot.at[0] - li / 2, y: spot.at[1] - li / 2, width: li, height: li, class: 'logo' }, gLogos);
    logoSpots.push({ x: spot.at[0], y: spot.at[1], r: s / 2, team: t.team, area: spot.area });
  }
  // power-ups a team is holding ride along on the edge of its main logo
  if (opt('powerups')) {
    for (const [team, held] of Object.entries(state.powers || {})) {
      if (!held.length) continue;
      const main = logoSpots.filter(L => L.team === team).sort((p, q) => q.area - p.area)[0];
      if (!main) continue;
      const br = Math.max(5.5, Math.min(11, main.r * 0.42));
      held.forEach((pid, k) => {
        const P = PW(pid), ang = (40 + k * 38) * Math.PI / 180;
        const bx = main.x + Math.cos(ang) * (main.r + br * 0.35), by = main.y + Math.sin(ang) * (main.r + br * 0.35);
        const g = el('g', { class: 'held', transform: `translate(${bx.toFixed(1)} ${by.toFixed(1)}) scale(${(br / 8.5).toFixed(2)})` }, gLogos);
        el('circle', { r: 8.5 }, g);
        el('text', { y: 0.5 }, g).textContent = P.glyph;
        el('title', {}, g).textContent = `${TEAM_BY_ABBR[team].name} are holding ${P.name}: ${P.desc}`;
      });
    }
  }
  if (opt('powerups')) {
    for (const [id, pid] of Object.entries(state.tokens || {})) {
      const r = BY_ID[id], P = POWERS.some(p => p.id === pid) && PW(pid); if (!r || !P) continue;
      const g = el('g', { class: 'token', transform: `translate(${r.at[0].toFixed(1)} ${r.at[1].toFixed(1)}) scale(${MAP === 'world' ? 1.05 : 1.5})` }, gLogos);
      el('circle', { r: 8.5 }, g);
      el('text', { y: 0.5 }, g).textContent = P.glyph;
      el('title', {}, g).textContent = `${P.name}: ${P.desc}`;
    }
  }
  if (opt('capitals')) {
    for (const [team, cap] of Object.entries(CAPITALS)) {
      if (owners[cap] !== team) continue;
      let [x, y] = BY_ID[cap].at;
      const near = logoSpots.find(L => Math.hypot(L.x - x, L.y - y) < L.r + 6);
      if (near) { x = near.x + near.r * 0.78; y = near.y - near.r * 0.78; }
      const pts = Array.from({ length: 10 }, (_, k) => { const rr = k % 2 ? 3.2 : 7.5, a = -Math.PI / 2 + k * Math.PI / 5; return `${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`; }).join(' ');
      const star = el('polygon', { points: pts, class: 'capital' }, gLogos);
      el('title', {}, star).textContent = `${TEAM_BY_ABBR[team].name} capital`;
    }
  }
  drawWheel();
  drawPowers();
  drawStandings();
  drawLog();
  const alive = aliveTeams(owners).length;
  const blanks = Object.values(owners).filter(v => !v).length;
  $('tally').textContent = `${alive} ${alive === 1 ? 'team' : 'teams'} left · ${blanks} open ${UNIT(blanks)} · turn ${state.turn}`;
}

// ---------- wheel ----------
function wheelTeams() { const alive = new Set(aliveTeams(state.owners)); return TEAMS.filter(t => alive.has(t.abbr)); }
function drawWheel() {
  const svg = $('wheel'); svg.innerHTML = '';
  const teams = wheelTeams(), n = teams.length, cx = 150, cy = 150, R = 146, s = 360 / n;
  const g = el('g', { id: 'wheel-rot', transform: `rotate(${wheelRot} ${cx} ${cy})` }, svg);
  const pt = (deg, r) => { const a = deg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
  teams.forEach((t, i) => {
    const a0 = i * s, a1 = (i + 1) * s, [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R);
    const d = n === 1 ? `M${cx - R},${cy}a${R},${R} 0 1,0 ${2 * R},0a${R},${R} 0 1,0 ${-2 * R},0` : `M${cx},${cy}L${x0},${y0}A${R},${R} 0 ${s > 180 ? 1 : 0},1 ${x1},${y1}Z`;
    el('path', { d, fill: t.color, stroke: '#10201b', 'stroke-width': 1 }, g);
    const sz = n === 1 ? 110 : Math.max(n > 40 ? 8 : 14, Math.min(48, (2 * Math.PI * R * 0.72 / n) * 0.8));
    const [lx, ly] = n === 1 ? [cx, cy] : pt(a0 + s / 2, R * 0.74);
    el('circle', { cx: lx, cy: ly, r: sz * 0.55, fill: '#eef2ea' }, g);
    const li = sz * 0.82;
    el('image', { href: logoUrl(t.abbr), x: lx - li / 2, y: ly - li / 2, width: li, height: li, transform: `rotate(${-wheelRot} ${lx} ${ly})` }, g);
  });
  if (n > 1) el('circle', { cx, cy, r: 16, fill: '#10201b', stroke: '#eef2ea', 'stroke-width': 2 }, svg);
}
function setWheel(rot) {
  wheelRot = rot;
  const g = $('wheel-rot'); if (!g) return;
  g.setAttribute('transform', `rotate(${rot} 150 150)`);
  for (const img of g.querySelectorAll('image')) { const x = +img.getAttribute('x') + +img.getAttribute('width') / 2, y = +img.getAttribute('y') + +img.getAttribute('height') / 2; img.setAttribute('transform', `rotate(${-rot} ${x} ${y})`); }
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function animate(from, to, ms, onFrame) {
  return new Promise(res => {
    if (reduced) { onFrame(to); return res(); }
    const t0 = performance.now();
    const tick = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); onFrame(from + (to - from) * e); k < 1 ? requestAnimationFrame(tick) : res(); };
    requestAnimationFrame(tick);
  });
}
const mod = (a, n) => ((a % n) + n) % n;

async function spinWheel() {
  busy = true; render();
  const teams = wheelTeams(), n = teams.length, idx = Math.floor(Math.random() * n), center = (idx + 0.5) * (360 / n);
  const jitter = (Math.random() - 0.5) * (360 / n) * 0.6;
  const target = wheelRot + 360 * 5 + mod(-center - jitter - wheelRot, 360);
  await animate(wheelRot, target, 3800 / SPEED(), setWheel);
  wheelRot = mod(target, 360);
  turn = { step: 'arrow', attacker: teams[idx].abbr };
  follow(teamSpot(teams[idx].abbr));
  busy = false; render();
}

// ---------- arrow ----------
function drawArrow(team, rot) {
  gArrow.innerHTML = '';
  if (!team) return;
  const [cx, cy] = teamSpot(team);
  const g = el('g', { transform: `translate(${cx} ${cy}) rotate(${rot})` }, gArrow);
  el('circle', { r: 9, fill: TEAM_BY_ABBR[team].color, stroke: '#fff', 'stroke-width': 2.5 }, g);
  el('path', { d: 'M8,-5 L62,-5 L62,-14 L88,0 L62,14 L62,5 L8,5 Z', fill: '#f0b429', stroke: '#1d1503', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
}
async function spinArrow() {
  busy = true; render();
  const a = turn.attacker, misses = turn.misses || 0;
  let final = Math.random() * 360;
  if (misses >= 2) { // two misses in a row: this spin can only land on land
    const ok = landAngles(a, teamSpot(a), labelAt, state.owners, ADJ, { step: 2, crossWater: MAP === 'world' });
    if (!ok.length) { turn = { step: 'done', attacker: a, msg: `The <b>${TEAM_BY_ABBR[a].name}</b> have nothing they can reach. Turn skipped.` }; busy = false; render(); return; }
    final = ok[Math.floor(Math.random() * ok.length)] + Math.random() * 1.5;
  }
  const target = arrowRot + 720 + mod(final - arrowRot, 360);
  await animate(arrowRot, target, 2600 / SPEED(), r => drawArrow(a, r));
  arrowRot = mod(target, 360);
  const tid = rayTarget(a, teamSpot(a), arrowRot, labelAt, state.owners, ADJ, { crossWater: MAP === 'world' });
  if (!tid) {
    // pointed at water or nobody it borders: respin automatically
    turn = { step: 'arrow', attacker: a, missed: true, misses: misses + 1 };
    render();
    await sleep(800 / SPEED());
    return spinArrow();
  }
  showAim(a, tid);
  const defender = state.owners[tid];
  if (defender && usePower(defender, 'bye')) {
    addLog(`<b>${teamName(defender)}</b> used ${PW('bye').name}. The ${teamName(a)} attack is blocked`);
    turn = { step: 'done', attacker: a, msg: `<b>${PW('bye').name}!</b> The <b>${TEAM_BY_ABBR[defender].name}</b> block the ${teamName(a)} attack on ${regionName(BY_ID[tid])}.` };
    nextTurnCount(); commit();
  } else if (!defender) {
    state.owners = claim(state.owners, a, tid);
    addLog(`<b>${teamName(a)}</b> claim open land in ${regionName(BY_ID[tid])}`);
    const got = collect(a, [tid]);
    turn = { step: 'done', attacker: a, msg: `The <b>${TEAM_BY_ABBR[a].name}</b> march into ${regionName(BY_ID[tid])}. Nobody was home.` + got + afterMove() };
    nextTurnCount(); commit();
  } else {
    turn = { step: 'battle', attacker: a, defender, region: tid };
  }
  busy = false; paint(); render();
}
function showAim(team, tid) {
  gAim.innerHTML = '';
  for (const p of gRegions.children) p.classList.toggle('target', p.dataset.id === tid);
  if (!team || !tid) return;
  const [x0, y0] = teamSpot(team), dx = Math.cos(arrowRot * Math.PI / 180), dy = Math.sin(arrowRot * Math.PI / 180);
  let t = 0;
  while (t < 1500 && labelAt(x0 + dx * t, y0 + dy * t) !== tid) t++;
  el('line', { x1: x0, y1: y0, x2: x0 + dx * (t + 6), y2: y0 + dy * (t + 6), class: 'aim' }, gAim);
}
function clearAim() { showAim(null, null); drawArrow(null); }

// ---------- battle ----------
const odds = (a, b) => battleOdds(a, b, state.mode, state.strengths);
// Win chances for a battle with power-ups: the +20% one for either side, the +15% home one for the defender.
function battleSetup(a, b) {
  const [pa] = odds(a, b);
  if (state.mode === 'pick' || !opt('powerups')) return { p: pa, uses: [], notes: { [a]: [], [b]: [] } };
  let ba = 0, bd = 0; const uses = [], notes = { [a]: [], [b]: [] };
  if (hasPower(a, 'hail')) { ba += 0.2; uses.push([a, 'hail']); notes[a].push(`${PW('hail').name} +20%`); }
  if (hasPower(b, 'hail')) { bd += 0.2; uses.push([b, 'hail']); notes[b].push(`${PW('hail').name} +20%`); }
  if (hasPower(b, 'home')) { bd += 0.15; uses.push([b, 'home']); notes[b].push(`${PW('home').name} +15%`); }
  return { p: applyBonuses(pa, ba, bd), uses, notes };
}
async function fight() {
  busy = true; render();
  const { attacker: a, defender: b } = turn;
  const setup = battleSetup(a, b);
  for (const [t, id] of setup.uses) usePower(t, id);
  let winner = Math.random() < setup.p ? a : b, extra = '';
  const flagTeam = winner === a ? b : a;
  if (opt('powerups') && usePower(flagTeam, 'flag')) {
    const again = Math.random() < setup.p ? a : b;
    extra = again === flagTeam ? ` <b>${PW('flag').name}!</b> The ${teamName(flagTeam)} challenged the result and won the replay.` : ` The ${teamName(flagTeam)} used <b>${PW('flag').name}</b>, but the result stood.`;
    winner = again;
  }
  const loser = winner === a ? b : a;
  const winnerOdds = winner === a ? setup.p : 1 - setup.p;
  const upset = state.mode === 'weighted' && winnerOdds < 0.35;
  const sport = LEAGUES[LEAGUE].sport;
  if (sport === 'football') await playGame(a, b, simulateGame(winner, loser), upset);
  else await playOther(a, b, (sport === 'baseball' ? simulateBaseball : sport === 'hockey' ? simulateHockey : simulateBasketball)(winner, loser), upset, sport);
  busy = false;
  finishBattle(winner, upset, winnerOdds, extra);
}

// ---------- simulated game popup ----------
const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const qName = q => q === 5 ? 'OT' : `Q${q}`;
function playText(e) {
  const n = teamName(e.team);
  if (e.kind === 'pass') return `${n} ${e.yards}-yard touchdown pass`;
  if (e.kind === 'run') return `${n} ${e.yards}-yard touchdown run`;
  if (e.kind === 'fg') return `${n} ${e.yards}-yard field goal is good`;
  if (e.kind === 'missed-xp') return `${n} touchdown, extra point no good`;
  if (e.kind === 'two-point') return `${n} touchdown and the two-point try is good`;
  return `Safety! ${n} get 2`;
}
const STOP_TEXT = { punt: 'punt it away', int: 'throw an interception', downs: 'turn it over on downs', fumble: 'fumble, and it\'s recovered by the defense', kneel: 'take a knee to run out the clock' };

// Turn the scoring list into drives the field can show: each score gets a drive that ends in it,
// long gaps get a stalled drive by the other team, and the winner kneels out the clock at the end.
function planDrives(a, b, game, QMS) {
  const other = t => t === a ? b : a;
  const at = e => e.q === 5 ? 4 * QMS + (1 - e.clock / 600) * QMS * 0.8 : (e.q - 1) * QMS + (1 - e.clock / 900) * QMS;
  const total = 4 * QMS + (game.events.some(e => e.q === 5) ? QMS * 0.8 : 0);
  const gap = QMS * 0.16, drives = [];
  const make = (team, t0, t1, result, event) => {
    const start = result === 'safety-against' ? 2 + Math.random() * 6 : 15 + Math.random() * 20;
    const target = result === 'td' ? 100 : result === 'fg' ? 62 + Math.random() * 18 : result === 'safety-against' ? -2
      : result === 'kneel' ? start + 1 : Math.min(92, start + 12 + Math.random() * 35);
    const k = result === 'kneel' ? 3 : 3 + Math.floor(Math.random() * 6);
    const w = Array.from({ length: k }, () => 0.4 + Math.random());
    const sum = w.reduce((x, y) => x + y, 0);
    let y = start; const plays = [];
    w.forEach((wi, idx) => { y += (target - start) * wi / sum; if (idx === k - 1) y = target; plays.push({ t: t0 + (t1 - t0) * (idx + 1) / (k + 0.4), y }); });
    drives.push({ team, t0, t1, start, plays, result, event });
  };
  let prev = 0;
  for (const e of game.events) {
    const t = at(e), team = e.kind === 'safety' ? other(e.team) : e.team;
    const ws = prev + gap;
    if (t - ws > QMS * 1.25) {
      const mid = ws + (t - ws) * 0.42;
      make(other(team), ws, mid, ['punt', 'punt', 'int', 'downs', 'fumble'][Math.floor(Math.random() * 5)]);
      make(team, mid + gap, t, e.kind === 'safety' ? 'safety-against' : e.kind === 'fg' ? 'fg' : 'td', e);
    } else make(team, ws, Math.max(ws + gap, t), e.kind === 'safety' ? 'safety-against' : e.kind === 'fg' ? 'fg' : 'td', e);
    e.at = t; prev = t;
  }
  if (total - prev > QMS * 0.7) {
    const w = game.score[a] > game.score[b] ? a : b;
    if (total - prev > QMS * 1.6) make(other(w), prev + gap, prev + (total - prev) * 0.5, 'punt');
    make(w, Math.max(prev + gap, total - QMS * 0.55), total - QMS * 0.05, 'kneel');
  }
  return { drives, total };
}

function playGame(a, b, game, upset = false) {
  return new Promise(resolve => {
    const ov = $('overlay'), A = TEAM_BY_ABBR[a], B = TEAM_BY_ABBR[b];
    // field geometry: 260 x 110, end zones 0-20 and 240-260, a yard = 2.2 units. Away attacks right.
    const X = (team, y) => team === a ? 20 + y * 2.2 : 240 - y * 2.2;
    const yardLines = Array.from({ length: 19 }, (_, k) => { const x = 20 + (k + 1) * 11; return `<line x1="${x}" y1="6" x2="${x}" y2="104" stroke="rgba(255,255,255,${k % 2 ? .28 : .5})" stroke-width="${k === 9 ? 1.3 : .7}"/>`; }).join('');
    const nums = [10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, k) => `<text x="${20 + (k + 1) * 22}" y="98" class="ynum">${n}</text><text x="${20 + (k + 1) * 22}" y="20" class="ynum flip">${n}</text>`).join('');
    const hashes = Array.from({ length: 99 }, (_, k) => { const x = 20 + (k + 1) * 2.2; return `<line x1="${x}" y1="40" x2="${x}" y2="43" stroke="rgba(255,255,255,.35)" stroke-width=".5"/><line x1="${x}" y1="67" x2="${x}" y2="70" stroke="rgba(255,255,255,.35)" stroke-width=".5"/>`; }).join('');
    const post = x => `<g stroke="#f0d34a" stroke-width="1.6" fill="none"><line x1="${x}" y1="55" x2="${x + (x < 130 ? -6 : 6)}" y2="55"/><line x1="${x + (x < 130 ? -6 : 6)}" y1="44" x2="${x + (x < 130 ? -6 : 6)}" y2="66"/></g>`;
    ov.innerHTML = `<div class="game" id="game-open" role="dialog" aria-label="${A.name} at ${B.name}">
      <div class="board">
        <div class="bt" id="bt-a"><img src="${logoUrl(a)}" alt=""><span>${teamName(a)}<small>AWAY</small></span><i class="poss" aria-hidden="true"></i><b id="sc-a">0</b></div>
        <div class="clock"><span id="g-q">1st</span><span id="g-clock">15:00</span></div>
        <div class="bt" id="bt-b"><img src="${logoUrl(b)}" alt=""><span>${teamName(b)}<small>HOME</small></span><i class="poss" aria-hidden="true"></i><b id="sc-b">0</b></div>
      </div>
      <div class="wp" aria-hidden="true"><div class="wp-a" id="wp-a" style="background:${A.color}"></div><div class="wp-b" style="background:${B.color}"></div><span class="wp-l" id="wp-l"></span></div>
      <svg class="gfield" viewBox="0 0 260 110" aria-hidden="true">
        <rect x="0" y="0" width="260" height="110" fill="#2c6a37"/>
        ${Array.from({ length: 10 }, (_, k) => `<rect x="${20 + k * 22}" y="0" width="11" height="110" fill="rgba(255,255,255,.035)"/>`).join('')}
        <rect x="0" y="0" width="20" height="110" fill="${A.color}"/><rect x="240" y="0" width="20" height="110" fill="${B.color}"/>
        <text x="10" y="55" class="ez" transform="rotate(-90 10 55)">${teamName(a).toUpperCase()}</text>
        <text x="250" y="55" class="ez" transform="rotate(90 250 55)">${teamName(b).toUpperCase()}</text>
        ${yardLines}${hashes}${nums}
        <rect x="0.5" y="0.5" width="259" height="109" fill="none" stroke="#fff" stroke-width="1"/>
        <line x1="20" y1="0" x2="20" y2="110" stroke="#fff" stroke-width="1.4"/><line x1="240" y1="0" x2="240" y2="110" stroke="#fff" stroke-width="1.4"/>
        ${post(20)}${post(240)}
        <image href="${logoUrl(b)}" x="116" y="41" width="28" height="28" opacity=".32"/>
        <line id="g-los" x1="130" y1="4" x2="130" y2="106" stroke="#3b82f6" stroke-width="1.4" opacity="0"/>
        <line id="g-fd" x1="152" y1="4" x2="152" y2="106" stroke="#facc15" stroke-width="1.4" opacity="0"/>
        <g id="g-ballg" transform="translate(130 55)"><ellipse rx="4.2" ry="2.6" fill="#8a4b20" stroke="#fff" stroke-width=".7"/><line x1="-1.6" y1="0" x2="1.6" y2="0" stroke="#fff" stroke-width=".6"/></g>
        <text id="g-flash" x="130" y="62" class="flash" opacity="0"></text>
      </svg>
      <div class="linescore" id="g-line" hidden></div>
      <ul class="plays" id="g-plays"><li>Kickoff!</li></ul>
      <div class="row"><button class="btn ghost" id="g-skip">Skip to final</button></div>
    </div>`;
    ov.hidden = false;
    const scA = $('sc-a'), scB = $('sc-b'), qEl = $('g-q'), clockEl = $('g-clock'), plays = $('g-plays');
    const ballG = $('g-ballg'), los = $('g-los'), fd = $('g-fd'), flash = $('g-flash'), wpA = $('wp-a'), wpL = $('wp-l');
    const QMS = reduced ? 0 : 2300 / SPEED();
    sfx.kickoff(); sfx.crowdStart();
    const score = { [a]: 0, [b]: 0 };
    const { drives, total } = QMS ? planDrives(a, b, game, QMS) : { drives: [], total: 0 };
    let idx = 0, done = false, raf = 0, t0 = performance.now(), di = 0, flashUntil = 0, kick = null;
    const addPlay = (html, cls = '') => { const li = document.createElement('li'); li.innerHTML = html; if (cls) li.className = cls; plays.prepend(li); while (plays.children.length > 4) plays.lastChild.remove(); };
    const setScore = () => { scA.textContent = score[a]; scB.textContent = score[b]; };
    const showFlash = (text, color, ms) => { flash.textContent = text; flash.setAttribute('fill', color); flash.setAttribute('opacity', 1); flash.classList.remove('pop'); void flash.getBoundingClientRect(); flash.classList.add('pop'); flashUntil = performance.now() + ms; };
    const setPoss = team => { $('bt-a').classList.toggle('has', team === a); $('bt-b').classList.toggle('has', team === b); };
    const winProb = (el) => {
      const diff = score[a] - score[b], rem = Math.max(0, 1 - el / Math.max(1, total));
      const p = 1 / (1 + Math.exp(-diff / (4 + 10 * rem)));
      wpA.style.width = `${(p * 100).toFixed(1)}%`;
      wpL.textContent = p >= 0.5 ? `${teamName(a)} ${Math.round(p * 100)}%` : `${teamName(b)} ${Math.round((1 - p) * 100)}%`;
    };
    const lineScore = () => {
      const hasOT = game.events.some(e => e.q === 5), qs = hasOT ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
      const by = (t, q) => game.events.filter(e => e.team === t && e.q === q).reduce((n, e) => n + e.pts, 0);
      const row = t => `<tr><th><img src="${logoUrl(t)}" alt="">${teamName(t)}</th>${qs.map(q => `<td>${by(t, q)}</td>`).join('')}<td class="tot">${game.score[t]}</td></tr>`;
      $('g-line').innerHTML = `<table><thead><tr><th></th>${qs.map(q => `<th>${q === 5 ? 'OT' : q}</th>`).join('')}<th>T</th></tr></thead><tbody>${row(a)}${row(b)}</tbody></table>`;
      $('g-line').hidden = false;
    };
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      for (; idx < game.events.length; idx++) score[game.events[idx].team] += game.events[idx].pts;
      setScore(); setPoss(null); flash.setAttribute('opacity', 0);
      const wA = score[a] > score[b]; wpA.style.width = wA ? '100%' : '0%'; wpL.textContent = `${teamName(wA ? a : b)} win`;
      qEl.textContent = game.events.some(e => e.q === 5) ? 'FINAL/OT' : 'FINAL'; clockEl.textContent = '0:00';
      los.setAttribute('opacity', 0); fd.setAttribute('opacity', 0);
      const w = score[a] > score[b] ? a : b;
      addPlay(`<b>${upset ? 'UPSET! ' : ''}Final: ${TEAM_BY_ABBR[w].name} win ${Math.max(score[a], score[b])}–${Math.min(score[a], score[b])}</b>`);
      $(w === a ? 'bt-a' : 'bt-b').classList.add('won');
      lineScore();
      sfx.final();
      const btn = $('g-skip'); btn.textContent = 'Continue'; btn.className = 'btn';
      let closed = false;
      const close = () => { if (closed) return; closed = true; sfx.crowdStop(); ov.hidden = true; ov.innerHTML = ''; resolve(); };
      btn.onclick = close;
      if (autoplay) setTimeout(close, 1400 / SPEED()); else btn.focus();
    };
    $('g-skip').onclick = finish;
    if (!QMS) return finish();
    let lastDrive = -1;
    const tick = now => {
      const el = now - t0;
      const q = el >= 4 * QMS ? 5 : Math.floor(el / QMS) + 1;
      if (q === 5) { qEl.textContent = 'OT'; clockEl.textContent = fmtClock(Math.max(0, Math.round(600 - ((el - 4 * QMS) / (QMS * 0.8)) * 600))); }
      else { qEl.textContent = ['1st', '2nd', '3rd', '4th'][q - 1]; clockEl.textContent = fmtClock(Math.max(0, Math.round(900 - ((el % QMS) / QMS) * 900))); }
      // scores
      while (idx < game.events.length && el >= game.events[idx].at) {
        const e = game.events[idx]; idx++;
        score[e.team] += e.pts; setScore();
        addPlay(`<span class="q">${qName(e.q)} ${fmtClock(e.clock)}</span> ${playText(e)}`);
        const col = TEAM_BY_ABBR[e.team].color;
        if (e.kind === 'fg') { showFlash("IT'S GOOD!", col, 900); sfx.fieldGoal(); kick = { team: e.team, from: X(e.team, drives.find(d => d.event === e)?.plays.at(-1).y ?? 70), t: now }; }
        else if (e.kind === 'safety') { showFlash('SAFETY!', col, 900); sfx.fieldGoal(); }
        else { showFlash('TOUCHDOWN!', col, 1100); sfx.touchdown(); }
      }
      // current drive: ball, line of scrimmage, first-down line
      while (di < drives.length - 1 && el > drives[di].t1 + QMS * 0.1) di++;
      const d = drives[di];
      if (d && el >= d.t0) {
        if (lastDrive !== di) { lastDrive = di; setPoss(d.team); }
        let last = d.start, nextY = d.start, nextT = d.t0, lastT = d.t0;
        for (const p of d.plays) { if (p.t <= el) { last = p.y; lastT = p.t; } else { nextY = p.y; nextT = p.t; break; } }
        const moving = Math.min(1, Math.max(0, (el - lastT) / (Math.max(1, nextT - lastT) * 0.45)));
        const pending = d.plays.find(p => p.t > el);
        const y = pending && el > lastT + (nextT - lastT) * 0.55 ? last + (nextY - last) * Math.min(1, (el - lastT - (nextT - lastT) * 0.55) / ((nextT - lastT) * 0.3)) : last;
        let bx = X(d.team, Math.max(-3, Math.min(103, y))), by = 55 + Math.sin(el / 300 + di) * 6;
        if (kick && now - kick.t < 700) { const k = (now - kick.t) / 700; bx = kick.from + ((d.team === a ? 246 : 14) - kick.from) * k; by = 55 - Math.sin(k * Math.PI) * 30; }
        ballG.setAttribute('transform', `translate(${bx.toFixed(1)} ${by.toFixed(1)})`);
        const showLines = el < d.t1 && d.result !== 'kneel';
        const losX = X(d.team, Math.max(0, Math.min(100, last))), fdY = Math.min(100, last + 10);
        los.setAttribute('x1', losX); los.setAttribute('x2', losX); los.setAttribute('opacity', showLines ? 0.9 : 0);
        fd.setAttribute('x1', X(d.team, fdY)); fd.setAttribute('x2', X(d.team, fdY)); fd.setAttribute('opacity', showLines && fdY < 100 ? 0.9 : 0);
        if (!d.ended && el >= d.t1 && !d.event) { d.ended = true; addPlay(`${teamName(d.team)} ${STOP_TEXT[d.result]}`, 'dim'); }
      }
      if (now > flashUntil) flash.setAttribute('opacity', 0);
      winProb(el);
      if (el >= total) return finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
// ---------- baseball, hockey and basketball game screen ----------
const SPORT = {
  baseball: { start: 'Play ball!', unit: 'Inning', base: 9, len: p => 1, scale: (d, rem) => d / (1.3 + 3 * rem) },
  hockey: { start: 'Puck drop!', unit: 'Period', base: 3, len: p => p === 4 ? 0.5 : p === 5 ? 0.45 : 1, scale: (d, rem) => d / (1 + 2.5 * rem) },
  basketball: { start: 'Tip-off!', unit: 'Quarter', base: 4, len: p => p > 4 ? 0.45 : 1, scale: (d, rem) => d / (5 + 14 * rem) },
};
function courtSVG(sport, A, B, home) {
  if (sport === 'baseball') return `
    <rect width="260" height="110" fill="#2f6b3a"/>
    <path d="M130 104 L40 20 A125 125 0 0 1 220 20 Z" fill="#3a7d44"/>
    <path d="M130 104 L92 66 L130 30 L168 66 Z" fill="#b5835a"/>
    <path d="M130 98 L98 66 L130 36 L162 66 Z" fill="#3a7d44"/>
    <circle cx="130" cy="66" r="5" fill="#b5835a"/>
    <line x1="130" y1="104" x2="34" y2="14" stroke="#fff" stroke-width=".8"/><line x1="130" y1="104" x2="226" y2="14" stroke="#fff" stroke-width=".8"/>
    ${[[130, 101], [165, 66], [130, 33], [95, 66]].map(([x, y]) => `<rect x="${x - 2.5}" y="${y - 2.5}" width="5" height="5" fill="#fff" transform="rotate(45 ${x} ${y})"/>`).join('')}
    <image href="${logoUrl(home)}" x="118" y="54" width="24" height="24" opacity=".35"/>`;
  if (sport === 'hockey') return `
    <rect width="260" height="110" rx="26" fill="#eef3f7" stroke="#9fb3c4" stroke-width="1.2"/>
    <line x1="130" y1="2" x2="130" y2="108" stroke="#d0213a" stroke-width="2"/>
    <line x1="92" y1="2" x2="92" y2="108" stroke="#2c5fb3" stroke-width="2"/><line x1="168" y1="2" x2="168" y2="108" stroke="#2c5fb3" stroke-width="2"/>
    <line x1="18" y1="4" x2="18" y2="106" stroke="#d0213a" stroke-width=".8"/><line x1="242" y1="4" x2="242" y2="106" stroke="#d0213a" stroke-width=".8"/>
    <path d="M18 47 A8 8 0 0 1 18 63" fill="#9fc4ec"/><path d="M242 47 A8 8 0 0 0 242 63" fill="#9fc4ec"/>
    <rect x="12" y="50" width="6" height="10" fill="none" stroke="${A.color}" stroke-width="1.4"/><rect x="242" y="50" width="6" height="10" fill="none" stroke="${B.color}" stroke-width="1.4"/>
    <circle cx="130" cy="55" r="13" fill="none" stroke="#2c5fb3" stroke-width="1"/>
    <image href="${logoUrl(home)}" x="118" y="43" width="24" height="24" opacity=".3"/>`;
  return `
    <rect width="260" height="110" fill="#c8915a"/>
    <rect x="4" y="4" width="252" height="102" fill="none" stroke="#fff" stroke-width="1"/>
    <line x1="130" y1="4" x2="130" y2="106" stroke="#fff" stroke-width="1"/><circle cx="130" cy="55" r="12" fill="none" stroke="#fff" stroke-width="1"/>
    <rect x="4" y="38" width="38" height="34" fill="${A.color}" opacity=".55" stroke="#fff" stroke-width="1"/><rect x="218" y="38" width="38" height="34" fill="${B.color}" opacity=".55" stroke="#fff" stroke-width="1"/>
    <path d="M4 12 L22 12 A44 44 0 0 1 22 98 L4 98" fill="none" stroke="#fff" stroke-width="1"/><path d="M256 12 L238 12 A44 44 0 0 0 238 98 L256 98" fill="none" stroke="#fff" stroke-width="1"/>
    <circle cx="13" cy="55" r="3" fill="none" stroke="#f26b1d" stroke-width="1.5"/><circle cx="247" cy="55" r="3" fill="none" stroke="#f26b1d" stroke-width="1.5"/>
    <image href="${logoUrl(home)}" x="118" y="43" width="24" height="24" opacity=".35"/>`;
}
function playOther(a, b, game, upset, sport) {
  return new Promise(resolve => {
    const S = SPORT[sport], ov = $('overlay'), A = TEAM_BY_ABBR[a], B = TEAM_BY_ABBR[b];
    ov.innerHTML = `<div class="game" id="game-open" role="dialog" aria-label="${A.name} at ${B.name}">
      <div class="board">
        <div class="bt" id="bt-a"><img src="${logoUrl(a)}" alt=""><span>${teamName(a)}<small>AWAY</small></span><b id="sc-a">0</b></div>
        <div class="clock"><span id="g-q"></span><span id="g-clock"></span></div>
        <div class="bt" id="bt-b"><img src="${logoUrl(b)}" alt=""><span>${teamName(b)}<small>HOME</small></span><b id="sc-b">0</b></div>
      </div>
      <div class="wp" aria-hidden="true"><div class="wp-a" id="wp-a" style="background:${A.color}"></div><div class="wp-b" style="background:${B.color}"></div><span class="wp-l" id="wp-l"></span></div>
      <svg class="gfield" viewBox="0 0 260 110" aria-hidden="true">${courtSVG(sport, A, B, b)}
        <g id="g-ballg"><circle r="${sport === 'basketball' ? 3.6 : 2.6}" fill="${sport === 'hockey' ? '#111' : sport === 'basketball' ? '#e0661c' : '#fff'}" stroke="${sport === 'baseball' ? '#c33' : '#000'}" stroke-width=".5"/></g>
        <text id="g-flash" x="130" y="62" class="flash" opacity="0"></text>
      </svg>
      <div class="linescore" id="g-line" hidden></div>
      <ul class="plays" id="g-plays"><li>${S.start}</li></ul>
      <div class="row"><button class="btn ghost" id="g-skip">Skip to final</button></div>
    </div>`;
    ov.hidden = false;
    const scA = $('sc-a'), scB = $('sc-b'), qEl = $('g-q'), clockEl = $('g-clock'), plays = $('g-plays'), ballG = $('g-ballg'), flash = $('g-flash'), wpA = $('wp-a'), wpL = $('wp-l');
    const PMS = reduced ? 0 : (2300 * 4 / S.base) / SPEED();
    sfx.kickoff(); sfx.crowdStart();
    // when each period starts and how long it lasts, in real milliseconds
    const starts = []; let acc = 0;
    for (let p = 1; p <= game.periods; p++) { starts[p] = acc; acc += S.len(p) * PMS; }
    const total = acc;
    const periodLen = p => sport === 'hockey' ? (p === 4 ? 300 : 1200) : sport === 'basketball' ? (p > 4 ? 300 : 720) : 1;
    for (const e of game.events) {
      const frac = sport === 'baseball' ? (e.team === a ? 0.1 + Math.random() * 0.35 : 0.55 + Math.random() * 0.4) : sport === 'hockey' && e.p === 5 ? 0.6 : e.clock / periodLen(e.p);
      e.at = starts[e.p] + frac * S.len(e.p) * PMS;
    }
    game.events.sort((x, y) => x.at - y.at);
    const score = { [a]: 0, [b]: 0 };
    let idx = 0, done = false, raf = 0, t0 = performance.now(), flashUntil = 0, ball = { x: 130, y: 55 }, shot = null, shown = 0;
    const addPlay = html => { const li = document.createElement('li'); li.innerHTML = html; plays.prepend(li); while (plays.children.length > 4) plays.lastChild.remove(); };
    const setScore = () => { scA.textContent = score[a]; scB.textContent = score[b]; };
    const showFlash = (text, color, ms) => { flash.textContent = text; flash.setAttribute('fill', color); flash.setAttribute('opacity', 1); flash.classList.remove('pop'); void flash.getBoundingClientRect(); flash.classList.add('pop'); flashUntil = performance.now() + ms; };
    const pLabel = p => sport === 'hockey' ? (p === 4 ? 'OT' : p === 5 ? 'SO' : `P${p}`) : sport === 'basketball' ? (p > 4 ? 'OT' : `Q${p}`) : `${p}`;
    const winProb = el => {
      const rem = Math.max(0, 1 - el / Math.max(1, total)), p = 1 / (1 + Math.exp(-S.scale(score[a] - score[b], rem)));
      wpA.style.width = `${(p * 100).toFixed(1)}%`;
      wpL.textContent = p >= 0.5 ? `${teamName(a)} ${Math.round(p * 100)}%` : `${teamName(b)} ${Math.round((1 - p) * 100)}%`;
    };
    const lineScore = () => {
      const ps = Array.from({ length: game.periods }, (_, i) => i + 1);
      const by = (t, p) => game.events.filter(e => e.team === t && e.p === p).reduce((n, e) => n + e.pts, 0);
      const row = t => `<tr><th><img src="${logoUrl(t)}" alt="">${teamName(t)}</th>${ps.map(p => `<td>${by(t, p)}</td>`).join('')}<td class="tot">${game.score[t]}</td></tr>`;
      $('g-line').innerHTML = `<table><thead><tr><th></th>${ps.map(p => `<th>${sport === 'baseball' ? p : pLabel(p).replace(/^[PQ]/, '')}</th>`).join('')}<th>${sport === 'baseball' ? 'R' : 'T'}</th></tr></thead><tbody>${row(a)}${row(b)}</tbody></table>`;
      $('g-line').hidden = false;
    };
    const finalLabel = () => sport === 'baseball' ? (game.periods > 9 ? `FINAL/${game.periods}` : 'FINAL') : sport === 'hockey' ? (game.periods === 4 ? 'FINAL/OT' : game.periods === 5 ? 'FINAL/SO' : 'FINAL') : game.periods > 4 ? 'FINAL/OT' : 'FINAL';
    const finish = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      score[a] = game.score[a]; score[b] = game.score[b]; setScore();
      flash.setAttribute('opacity', 0);
      const w = score[a] > score[b] ? a : b;
      wpA.style.width = w === a ? '100%' : '0%'; wpL.textContent = `${teamName(w)} win`;
      qEl.textContent = finalLabel(); clockEl.textContent = '';
      addPlay(`<b>${upset ? 'UPSET! ' : ''}Final: ${TEAM_BY_ABBR[w].name} win ${Math.max(score[a], score[b])}–${Math.min(score[a], score[b])}</b>`);
      $(w === a ? 'bt-a' : 'bt-b').classList.add('won');
      lineScore(); sfx.final();
      const btn = $('g-skip'); btn.textContent = 'Continue'; btn.className = 'btn';
      let closed = false;
      const close = () => { if (closed) return; closed = true; sfx.crowdStop(); ov.hidden = true; ov.innerHTML = ''; resolve(); };
      btn.onclick = close;
      if (autoplay) setTimeout(close, 1400 / SPEED()); else btn.focus();
    };
    $('g-skip').onclick = finish;
    if (!PMS) return finish();
    const tick = now => {
      const el = now - t0;
      let p = 1; while (p < game.periods && el >= starts[p + 1]) p++;
      const into = (el - starts[p]) / (S.len(p) * PMS);
      if (sport === 'baseball') { qEl.textContent = `${into < 0.5 ? 'Top' : 'Bot'} ${p}`; clockEl.textContent = `${into < 0.5 ? teamName(a) : teamName(b)} batting`; }
      else if (sport === 'hockey' && p === 5) { qEl.textContent = 'Shootout'; clockEl.textContent = ''; }
      else { qEl.textContent = pLabel(p); clockEl.textContent = fmtClock(Math.max(0, Math.round(periodLen(p) * (1 - Math.min(1, into))))); }
      while (idx < game.events.length && el >= game.events[idx].at) {
        const e = game.events[idx]; idx++;
        score[e.team] += e.pts; setScore();
        const col = TEAM_BY_ABBR[e.team].color, n = teamName(e.team);
        if (sport === 'baseball') {
          const hr = /home run|homer|slam/.test(e.kind);
          addPlay(`<span class="q">${e.team === a ? 'Top' : 'Bot'} ${e.p}</span> ${n}: ${e.kind}${e.pts > 1 ? `, ${e.pts} runs score` : ''}`);
          showFlash(hr ? (e.kind === 'grand slam' ? 'GRAND SLAM!' : 'HOME RUN!') : e.pts > 1 ? `${e.pts} RUNS!` : 'RUN SCORES!', col, 1000);
          hr ? sfx.touchdown() : sfx.fieldGoal();
          shot = { from: [130, 101], to: hr ? [60 + Math.random() * 140, 8] : [100 + Math.random() * 60, 40], t: now, ms: 650 };
        } else if (sport === 'hockey') {
          addPlay(`<span class="q">${pLabel(e.p)}${e.p < 5 ? ' ' + fmtClock(periodLen(e.p) - e.clock) : ''}</span> ${n} goal: ${e.kind}`);
          showFlash(e.p === 5 ? 'SHOOTOUT WIN!' : 'GOAL!', col, 1000); sfx.touchdown();
          shot = { from: [ball.x, ball.y], to: [e.team === a ? 245 : 15, 55], t: now, ms: 300 };
        } else {
          const big = e.kind === '3-pointer' || e.kind === 'dunk' || e.kind === 'alley-oop';
          if (big && Math.random() < 0.35) { addPlay(`<span class="q">${pLabel(e.p)} ${fmtClock(periodLen(e.p) - e.clock)}</span> ${n} ${e.kind}`); shown++; }
          if (big && Math.random() < 0.3) { showFlash(e.kind === '3-pointer' ? 'FROM DOWNTOWN!' : 'SLAM!', col, 700); sfx.fieldGoal(); }
          shot = { from: [ball.x, ball.y], to: [e.team === a ? 247 : 13, 55], t: now, ms: 220 };
        }
      }
      // ball or puck: flies on a score, otherwise drifts toward whoever scores next
      if (shot && now - shot.t < shot.ms) {
        const k = (now - shot.t) / shot.ms;
        ball.x = shot.from[0] + (shot.to[0] - shot.from[0]) * k; ball.y = shot.from[1] + (shot.to[1] - shot.from[1]) * k - (sport === 'baseball' ? Math.sin(k * Math.PI) * 18 : 0);
      } else if (sport === 'baseball') { if (!shot || now - shot.t > shot.ms + 300) { ball.x = 130 + (Math.random() - 0.5) * 2; ball.y = 70 + (Math.random() - 0.5) * 2; } }
      else {
        const next = game.events[idx], gx = next ? (next.team === a ? 200 : 60) : 130;
        ball.x = Math.max(16, Math.min(244, ball.x + (gx - ball.x) * 0.03 + (Math.random() - 0.5) * 4));
        ball.y = Math.max(10, Math.min(100, ball.y + (55 - ball.y) * 0.02 + (Math.random() - 0.5) * 4));
      }
      ballG.setAttribute('transform', `translate(${ball.x.toFixed(1)} ${ball.y.toFixed(1)})`);
      if (now > flashUntil) flash.setAttribute('opacity', 0);
      winProb(el);
      if (el >= total) return finish();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
function finishBattle(winner, upset = false, winnerOdds = null, extra = '') {
  const { attacker: a, defender: b, region } = turn, loser = winner === a ? b : a;
  const prev = { ...state.owners };
  let capTaken = null;
  const up = upset ? '<b class="up">UPSET!</b> ' : '';
  let story;
  const loserStates = stateCounts(state.owners, STATE_OF)[loser] || 0;
  let takenStates = loserStates;
  if (opt('capitals')) {
    const r = capitalsBattle(state.owners, winner, loser, a, region, CAPITALS, ADJ, CENT);
    const place = regionName(BY_ID[r.taken]);
    if (!r.capitalFell) takenStates = 1; else capTaken = r.taken;
    state.owners = r.owners;
    if (r.capitalFell) story = `The <b>${TEAM_BY_ABBR[winner].name}</b> capture the ${teamName(loser)}' capital in ${place} and take all their land. The ${teamName(loser)} are out.`;
    else if (winner === a) story = `The <b>${TEAM_BY_ABBR[winner].name}</b> win and take ${place} from the ${teamName(loser)}.`;
    else story = `The <b>${TEAM_BY_ABBR[winner].name}</b> hold at home and take ${place} from the ${teamName(loser)}.`;
    if (!r.capitalFell && !aliveTeams(state.owners).includes(loser)) story += ` The ${teamName(loser)} are out.`;
  } else {
    const names = [...new Set(Object.keys(state.owners).filter(id => state.owners[id] === loser).map(id => STATE_OF[id] === 'DC' ? 'MD' : STATE_OF[id]))].map(stateLabel);
    const where = names.length <= 3 ? listJoin(names) : `${names.length} ${UNIT(names.length)}`;
    state.owners = conquer(state.owners, winner, loser);
    story = `The <b>${TEAM_BY_ABBR[winner].name}</b> win and take over the ${teamName(loser)}' land in ${where}. The ${teamName(loser)} are out.`;
  }
  if (opt('powerups') && !aliveTeams(state.owners).includes(loser) && usePower(loser, 'tag')) {
    const home = CAPITALS[loser];
    const mine = Object.keys(prev).filter(id => prev[id] === loser && id !== capTaken);
    const keep = mine.includes(home) ? home : mine[0];
    if (keep) {
      state.owners = claim(state.owners, loser, keep);
      story = story.replace(/ The [A-Za-z0-9]+ are out\./, '') + ` <b>${PW('tag').name}!</b> The ${teamName(loser)} hang on to ${regionName(BY_ID[keep])} and stay alive.`;
    }
  }
  story += extra;
  const before = state.strengths[winner];
  state.strengths = boostWinner(state.strengths, winner, loser);
  const grew = state.strengths[winner] > before ? ` Strength ${before} → ${state.strengths[winner]} (beat ${String(state.strengths[loser]).startsWith('8') ? 'an' : 'a'} ${state.strengths[loser]}).` : '';
  state.records = recordBattle(state.records, { winner, loser, winnerOdds, turn: state.turn + 1 });
  state.records = recordTake(state.records, { team: winner, from: loser, n: takenStates, turn: state.turn + 1 });
  addLog(`${up}${story.replace(/<b>|<\/b>/g, '')}${grew}`);
  turn = { step: 'done', attacker: a, defender: b, winner, msg: `${upset ? '<b>UPSET!</b> ' : ''}${story}${grew}` + afterMove() };
  syncStrengthInputs();
  nextTurnCount(); commit(); paint(); render();
  if (upset) showUpset(winner);
  celebrate();
}

// Save the move: record-book peak, a history snapshot for the replay, then store.
function commit() {
  dropDeadPowers();
  state.history.push({ t: state.turn, c: encodeOwners(state.owners, REGIONS.map(r => r.id), TEAMS.map(t => t.abbr)) });
  if (state.history.length > 500) state.history.splice(1, state.history.length - 500);
  save(); drawReplay(); drawRecords();
}

function nextTurn() {
  turn = { step: 'wheel' }; clearAim();
  if (opt('powerups')) {
    if (state.bonusTurn && aliveTeams(state.owners).includes(state.bonusTurn)) turn = { step: 'arrow', attacker: state.bonusTurn, bonus: true };
    state.bonusTurn = null;
  }
  if (opt('rebellions')) {
    const r = pickRebellion(state.owners, TEAMS.map(t => t.abbr), CAPITALS, Math.random, 0.08);
    if (r) {
      const from = state.owners[r.region];
      state.owners = claim(state.owners, r.team, r.region);
      addLog(`<b class="up">REBELLION!</b> The ${teamName(r.team)} rise up and retake ${regionName(BY_ID[r.region])}${from ? ` from the ${teamName(from)}` : ''}`, `Turn ${state.turn}`);
      showBanner(r.team, 'REBELLION!');
      sfx.rebellion();
      commit(); paint();
    }
  }
  render();
}

// ---------- turn panel ----------
function teamCard(abbr, pct, extra = '', tag = '') {
  const t = TEAM_BY_ABBR[abbr];
  return `<div class="side-team ${extra}"><img src="${logoUrl(abbr)}" alt=""><span class="nm">${t.name}</span>${tag ? `<span class="tag">${tag}</span>` : ''}${pct != null ? `<span class="pct">${Math.round(pct * 100)}%</span>` : ''}</div>`;
}
function render() {
  const st = $('status'), mu = $('matchup'), ac = $('actions');
  for (const b of document.querySelectorAll('.seg:not(.mapseg) button')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  mu.innerHTML = ''; ac.innerHTML = '';
  const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.disabled = busy || autoplay || replaying; b.onclick = fn; ac.appendChild(b); return b; };
  const champ = champion(state.owners);
  if (champ) {
    const t = TEAM_BY_ABBR[champ];
    st.innerHTML = `<b>The ${t.name} rule ${MAP === 'world' ? 'the world' : 'America'}!</b> Last team standing after ${state.turn} ${state.turn === 1 ? 'turn' : 'turns'}.`;
    mu.innerHTML = `<div class="matchup" style="grid-template-columns:1fr">${teamCard(champ, null, 'win')}</div><ul class="records final">${recordLines().join('')}</ul>`;
    btn('Reset map', doReset);
  } else if (turn.step === 'wheel') {
    st.innerHTML = busy ? 'Spinning…' : 'Spin the wheel to pick who attacks.';
    btn('Spin the wheel', spinWheel);
  } else if (turn.step === 'arrow') {
    st.innerHTML = turn.missed
      ? `${MAP === 'world' ? 'Nothing but ocean' : 'No land border'} that way for the <b>${TEAM_BY_ABBR[turn.attacker].name}</b>. Respinning…`
      : busy ? 'Aiming…' : turn.bonus ? `<b>${PW('blitz').name}!</b> The <b>${TEAM_BY_ABBR[turn.attacker].name}</b> attack again. Spin the arrow.` : `The <b>${TEAM_BY_ABBR[turn.attacker].name}</b> are on the move. Spin the arrow to pick a direction.`;
    btn('Spin the arrow', spinArrow);
  } else if (turn.step === 'battle') {
    const { attacker: a, defender: b } = turn, setup = battleSetup(a, b), pa = setup.p, pb = 1 - setup.p, showPct = state.mode !== 'pick';
    st.innerHTML = `The arrow points at ${regionName(BY_ID[turn.region])}. Battle!`;
    const chips = t => [...setup.notes[t], ...((state.powers || {})[t] || []).filter(p => p === 'flag' || p === 'tag' || p === 'bye').map(p => PW(p).name)].map(n => `<span class="chip">${n}</span>`).join('');
    mu.innerHTML = `<div class="matchup">${teamCard(a, showPct ? pa : null, '', 'Away')}<span class="vs">@</span>${teamCard(b, showPct ? pb : null, '', 'Home')}</div><div class="chips"><div>${chips(a)}</div><div>${chips(b)}</div></div>`;
    if (state.mode === 'pick') {
      btn(`${teamName(a)} win`, () => finishBattle(a));
      btn(`${teamName(b)} win`, () => finishBattle(b));
    } else {
      btn('Fight!', fight);
    }
  } else if (turn.step === 'done') {
    st.innerHTML = turn.msg;
    if (turn.winner) mu.innerHTML = `<div class="matchup">${teamCard(turn.attacker, null, turn.winner === turn.attacker ? 'win' : '')}<span class="vs">VS</span>${teamCard(turn.defender, null, turn.winner === turn.defender ? 'win' : '')}</div>`;
    btn('Next turn', nextTurn);
  }
  if (!$('game-open')) $('overlay').hidden = true;
  drawAuto();
}
// After every claim or battle: empty pockets a single team surrounds become theirs; the last team standing gets everything.
function afterMove() {
  let msg = '';
  // last team standing: the celebration fills the rest of the map, so skip the surround rule
  if (champion(state.owners)) { pendingChamp = champion(state.owners); return msg; }
  const enclosed = enclosedClaims(state.owners, ADJ, MAP === 'world' ? COASTAL : null);
  const byTeam = {};
  const idsBy = {};
  for (const [id, t] of Object.entries(enclosed)) { state.owners = claim(state.owners, t, id); (byTeam[t] ||= []).push(regionName(BY_ID[id])); (idsBy[t] ||= []).push(id); }
  for (const [t, names] of Object.entries(byTeam)) {
    addLog(`<b>${teamName(t)}</b> surround and take ${listJoin(names)}`);
    msg += ` The ${teamName(t)} surround ${listJoin(names)} and take ${names.length === 1 ? 'it' : 'them'} too.` + collect(t, idsBy[t]);
  }
  if (champion(state.owners)) pendingChamp = champion(state.owners);
  return msg;
}
let pendingChamp = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// The champion's color and logo spread across the map ring by ring, then confetti.
async function celebrate() {
  const champ = pendingChamp; pendingChamp = null;
  if (!champ) return;
  clearAim();
  busy = true; render();
  if (!reduced) {
    // one state at a time: nearest ring first, and within a ring, closest to the champion's logo first
    const [lx, ly] = teamSpot(champ);
    const order = spreadOrder(state.owners, champ, ADJ).flatMap(layer => layer.sort((p, q) => Math.hypot(CENT[p][0] - lx, CENT[p][1] - ly) - Math.hypot(CENT[q][0] - lx, CENT[q][1] - ly)));
    const delay = Math.max(60, Math.min(220, 2400 / Math.max(1, order.length)));
    const shown = { ...state.owners };
    for (const id of order) { shown[id] = champ; paint(shown); await sleep(delay); }
  }
  state.owners = fillAll(state.owners, champ);
  commit(); paint();
  busy = false; render();
  if (!reduced) confetti(TEAM_BY_ABBR[champ]);
  sfx.champion();
  stopAuto();
}
function confetti(team) {
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const ctx = c.getContext('2d'), k = devicePixelRatio, colors = [team.color, team.color2, '#eef2ea', '#f0b429'];
  const bits = Array.from({ length: 180 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, col: colors[Math.floor(Math.random() * colors.length)] }));
  const t0 = performance.now();
  const frame = now => {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const b of bits) {
      b.x += b.vx; b.y += b.vy; b.vy += 0.03; b.r += b.vr;
      ctx.save(); ctx.translate(b.x * k, b.y * k); ctx.rotate(b.r); ctx.fillStyle = b.col; ctx.fillRect(-b.w * k / 2, -b.h * k / 2, b.w * k, b.h * k); ctx.restore();
    }
    if (now - t0 < 4500) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
function showUpset(winner) { showBanner(winner, 'UPSET!'); sfx.upset(); }
function showBanner(winner, text) {
  const box = $('upset'), field = $('field');
  box.innerHTML = `<img src="${logoUrl(winner)}" alt=""><span>${text}</span>`;
  box.hidden = false;
  box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
  if (!reduced) { field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake'); }
  clearTimeout(showBanner.t);
  showBanner.t = setTimeout(() => { box.hidden = true; field.classList.remove('shake'); }, 2400);
}
const listJoin = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
function nextTurnCount() { state.turn++; }

// ---------- side panels ----------
function drawStandings() {
  const counts = stateCounts(state.owners, STATE_OF);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  $('standings').innerHTML = top.map(([a, n]) => `<li><img src="${logoUrl(a)}" alt=""><span>${TEAM_BY_ABBR[a].name}</span><span class="n">${n} ${UNIT(n)}</span></li>`).join('');
}
function addLog(html, label = `Turn ${state.turn + 1}`) { state.log.unshift(`${label}: ${html}`); state.log = state.log.slice(0, 60); }
function drawLog() { $('log').innerHTML = state.log.length ? state.log.map(l => `<li>${l}</li>`).join('') : '<li>No moves yet.</li>'; }

function drawStrengths() {
  const useWL = opt('useRecords');
  $('opt-records').checked = useWL;
  $('strengths').innerHTML = TEAMS.map(t => {
    const [w, l] = state.wl[t.abbr] || ['', ''];
    return useWL
      ? `<label class="wl"><img src="${logoUrl(t.abbr)}" alt=""><span>${t.name}</span><input type="number" min="0" max="17" id="w-${t.abbr}" value="${w}" aria-label="${t.name} wins"><span class="dash">–</span><input type="number" min="0" max="17" id="l-${t.abbr}" value="${l}" aria-label="${t.name} losses"><output id="str-${t.abbr}">${state.strengths[t.abbr]}</output></label>`
      : `<label><img src="${logoUrl(t.abbr)}" alt=""><span>${t.name}</span><input type="number" min="1" max="10" step="0.1" id="str-${t.abbr}" value="${state.strengths[t.abbr]}"></label>`;
  }).join('');
  for (const t of TEAMS) {
    if (useWL) {
      const upd = () => {
        const w = Math.max(0, Math.round(+$(`w-${t.abbr}`).value || 0)), l = Math.max(0, Math.round(+$(`l-${t.abbr}`).value || 0));
        state.wl[t.abbr] = [w, l];
        const v = strengthFromRecord(w, l);
        if (v != null) { state.strengths[t.abbr] = v; $(`str-${t.abbr}`).textContent = v; }
        save(); render();
      };
      $(`w-${t.abbr}`).addEventListener('change', upd); $(`l-${t.abbr}`).addEventListener('change', upd);
    } else $(`str-${t.abbr}`).addEventListener('change', e => {
      const v = Math.max(1, Math.min(10, Math.round((+e.target.value || 1) * 10) / 10));
      e.target.value = v; state.strengths[t.abbr] = v; save(); render();
    });
  }
}
function syncStrengthInputs() { for (const t of TEAMS) { const i = $(`str-${t.abbr}`); if (i) { if ('value' in i && i.tagName === 'INPUT') i.value = state.strengths[t.abbr]; else i.textContent = state.strengths[t.abbr]; } } }
function drawAssign() {
  const s = $('assign');
  s.innerHTML = `<option value="">Off</option>` + TEAMS.map(t => `<option value="${t.abbr}">${t.name}</option>`).join('') + `<option value="__blank">Nobody (make it blank)</option>`;
  s.onchange = () => $('field').classList.toggle('assigning', !!s.value);
}
function onRegionClick(id) {
  const v = $('assign').value;
  if (!v || busy || autoplay || replaying) return;
  const team = v === '__blank' ? null : v, before = state.owners[id];
  if (before === team) return;
  state.owners = claim(state.owners, team, id);
  addLog(`${regionName(BY_ID[id])} handed to <b>${team ? teamName(team) : 'nobody'}</b>`, 'By hand');
  const alive = new Set(aliveTeams(state.owners));
  if ((turn.attacker && !alive.has(turn.attacker)) || (turn.defender && turn.step === 'battle' && !alive.has(turn.defender))) { turn = { step: 'wheel' }; clearAim(); }
  else if (turn.step === 'arrow') drawArrow(turn.attacker, arrowRot);
  if (champion(state.owners)) pendingChamp = champion(state.owners);
  commit(); paint(); render();
  celebrate();
}

// ---------- state ----------
const DEFAULT_OPTIONS = { sound: false, capitals: false, rebellions: false, useRecords: false, powerups: true };
const usaHomes = () => Object.fromEntries(TEAMS.map(t => [t.abbr, REGIONS.find(r => r.team === t.abbr && r.state !== 'DC').id]));
function startStrengths(options, wl) {
  return Object.fromEntries(TEAMS.map(t => {
    const fromWL = options.useRecords && wl[t.abbr] ? strengthFromRecord(...wl[t.abbr]) : null;
    return [t.abbr, fromWL ?? t.strength];
  }));
}
function fresh(keep = {}) {
  const options = { ...DEFAULT_OPTIONS, ...(keep.options || {}) }, wl = (keep.league || 'nfl') === LEAGUE ? keep.wl || {} : {};
  let owners, home;
  if (MAP === 'world') {
    const big = REGIONS.filter(r => r.pts.length).sort((p, q) => q.area - p.area);
    const eligible = big.filter((r, i) => r.area >= 350 || i < TEAMS.length + 10).map(r => r.id);
    home = assignHomes(eligible, TEAMS.map(t => t.abbr));
    owners = Object.fromEntries(REGIONS.map(r => [r.id, null]));
    for (const [t, id] of Object.entries(home)) owners[id] = t;
  } else {
    owners = initialOwners(REGIONS);
    home = usaHomes();
  }
  const tokens = options.powerups ? placeTokens(owners, {}, POWERS.length, Math.random, frontier(owners)) : {};
  return { league: LEAGUE, map: MAP, owners, home, tokens, powers: {}, usedPowers: [], bonusTurn: null, strengths: startStrengths(options, wl), mode: keep.mode || 'pick', log: [], turn: 0, options, wl, records: {},
    history: [{ t: 0, c: encodeOwners(owners, REGIONS.map(r => r.id), TEAMS.map(t => t.abbr)) }] };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    // saved games from older versions may have extra regions (Alaska, Hawaii): keep only today's regions
    if (s && s.owners && (s.map || 'usa') === MAP && (s.league || 'nfl') === LEAGUE && REGIONS.every(r => r.id in s.owners)) {
      const f = fresh(s);
      const owners = Object.fromEntries(REGIONS.map(r => [r.id, s.owners[r.id]]));
      return { ...f, ...s, map: MAP, options: f.options, wl: f.wl, records: s.records || {}, history: s.history && s.history.length ? s.history : f.history, owners,
        home: s.home || f.home, tokens: s.tokens || (f.options.powerups ? placeTokens(owners, {}, POWERS.length, Math.random, frontier(owners), new Set(s.usedPowers || [])) : {}), powers: s.powers || {}, usedPowers: s.usedPowers || [] };
    }
  } catch {}
  return fresh();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }

let resetArmed = null;
function doReset() {
  stopAuto(); exitReplay(false);
  state = fresh(state); CAPITALS = state.home; turn = { step: 'wheel' }; wheelRot = 0; arrowRot = 0;
  clearAim(); save(); drawStrengths(); paint(); render(); drawReplay(); drawRecords();
}

// ---------- zoom and pan ----------
let BASE = { x: 0, y: 0, w: W, h: H }, VIEW = { ...BASE }, dragged = false;
function setView(v) {
  const w = Math.max(BASE.w / 8, Math.min(BASE.w, v.w)), h = w * BASE.h / BASE.w;
  const x = Math.max(BASE.x, Math.min(BASE.x + BASE.w - w, v.x)), y = Math.max(BASE.y, Math.min(BASE.y + BASE.h - h, v.y));
  VIEW = { x, y, w, h };
  $('map').setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  const z = $('zoom-fit'); if (z) z.disabled = w >= BASE.w - 0.5;
}
// Screen pixels -> map coordinates. The map keeps its shape, so it may sit centered with empty bands at the sides.
function fitScale() { const r = $('map').getBoundingClientRect(); const k = Math.min(r.width / VIEW.w, r.height / VIEW.h); return { r, k, ox: (r.width - VIEW.w * k) / 2, oy: (r.height - VIEW.h * k) / 2 }; }
function toMap(clientX, clientY) {
  const { r, k, ox, oy } = fitScale();
  return [VIEW.x + (clientX - r.left - ox) / k, VIEW.y + (clientY - r.top - oy) / k];
}
function zoomAt(factor, cx, cy) {
  const w = VIEW.w / factor, h = VIEW.h / factor;
  setView({ x: cx - (cx - VIEW.x) * (w / VIEW.w), y: cy - (cy - VIEW.y) * (h / VIEW.h), w, h });
}
function animateView(target, ms = 450) {
  const from = { ...VIEW };
  return animate(0, 1, reduced ? 0 : ms, k => setView({ x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, w: from.w + (target.w - from.w) * k, h: from.h + (target.h - from.h) * k }));
}
// When zoomed in, slide the view so the attacking team is in the middle.
function follow([x, y]) {
  if (VIEW.w >= BASE.w - 0.5) return;
  animateView({ x: x - VIEW.w / 2, y: y - VIEW.h / 2, w: VIEW.w, h: VIEW.h });
}
function wireZoom() {
  const svg = $('map'), ptrs = new Map();
  let start = null, pinch = null;
  $('zoom-in').onclick = () => zoomAt(1.6, VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2);
  $('zoom-out').onclick = () => zoomAt(1 / 1.6, VIEW.x + VIEW.w / 2, VIEW.y + VIEW.h / 2);
  $('zoom-fit').onclick = () => animateView({ ...BASE });
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const [cx, cy] = toMap(e.clientX, e.clientY);
    zoomAt(Math.exp(-e.deltaY * 0.0022), cx, cy);
  }, { passive: false });
  svg.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { start = { cx: e.clientX, cy: e.clientY, view: { ...VIEW } }; dragged = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), view: { ...VIEW }, mid: toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) }; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      VIEW = { ...pinch.view }; zoomAt(d / pinch.d, pinch.mid[0], pinch.mid[1]); dragged = true;
    } else if (ptrs.size === 1 && start) {
      const dx = e.clientX - start.cx, dy = e.clientY - start.cy;
      if (!dragged && Math.hypot(dx, dy) < 5) return;
      if (start.view.w >= BASE.w - 0.5) return; // nothing to pan at full view
      dragged = true; svg.setPointerCapture(e.pointerId);
      const { k } = fitScale();
      setView({ ...start.view, x: start.view.x - dx / k, y: start.view.y - dy / k });
    }
  });
  const end = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { start = null; setTimeout(() => { dragged = false; }, 0); } };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
}

// ---------- power-ups ----------
// Power-ups that have already been picked up this game (each one exists only once).
const usedSet = () => new Set([...(state.usedPowers || []), ...Object.values(state.powers || {}).flat()]);
// A knocked-out team's unused power-ups are gone for good.
function dropDeadPowers() {
  const alive = new Set(aliveTeams(state.owners));
  for (const [team, held] of Object.entries(state.powers || {})) {
    if (!held.length || alive.has(team)) continue;
    addLog(`The ${teamName(team)}' ${listJoin(held.map(p => PW(p).name))} ${held.length === 1 ? 'is' : 'are'} gone for good`);
    state.powers[team] = [];
  }
}
// Empty land that touches some team's territory: where new power-up tokens go first.
function frontier(owners) {
  const f = new Set();
  for (const [p, q] of ADJ) { if (owners[p] && !owners[q]) f.add(q); if (owners[q] && !owners[p]) f.add(p); }
  return f;
}
const PW = id => powerInfo(id, LEAGUE);   // this league's name for a power-up
const hasPower = (team, id) => ((state.powers || {})[team] || []).includes(id);
function usePower(team, id) {
  const list = (state.powers || {})[team] || [], k = list.indexOf(id);
  if (k < 0) return false;
  list.splice(k, 1); return true;
}
// A team picks up any tokens on land it just took. Instant power-ups happen now; the rest are held.
function collect(team, ids) {
  if (!opt('powerups')) return '';
  let msg = '';
  for (const id of ids) {
    const pid = (state.tokens || {})[id]; if (!pid) continue;
    delete state.tokens[id];
    (state.usedPowers ||= []).push(pid);
    const P = PW(pid);
    addLog(`<b>${teamName(team)}</b> pick up <b class="up">${P.name}</b> in ${regionName(BY_ID[id])}`);
    msg += ` They pick up <b>${P.name}</b>: ${P.desc}`;
    if (pid === 'draft') { state.strengths[team] = Math.min(10, Math.round((state.strengths[team] + 1.5) * 10) / 10); syncStrengthInputs(); }
    else if (pid === 'blitz') state.bonusTurn = team;
    else if (pid === 'onside') msg += onside(team);
    else ((state.powers ||= {})[team] ||= []).push(pid);
  }
  return msg;
}
function onside(team) {
  const near = new Set();
  for (const [p, q] of ADJ) {
    if (state.owners[p] === team && state.owners[q] !== team) near.add(q);
    if (state.owners[q] === team && state.owners[p] !== team) near.add(p);
  }
  // never an instant knockout: skip a team's last piece of land and (with capitals) any capital
  const counts = {};
  for (const o of Object.values(state.owners)) if (o) counts[o] = (counts[o] || 0) + 1;
  const pool = [...near].filter(id => { const o = state.owners[id]; return !o || (counts[o] > 1 && !(opt('capitals') && CAPITALS[o] === id)); });
  if (!pool.length) return ' But there was nothing nearby to steal.';
  const id = pool[Math.floor(Math.random() * pool.length)], from = state.owners[id];
  state.owners = claim(state.owners, team, id);
  addLog(`<b>${teamName(team)}</b> use ${PW('onside').name} and take ${regionName(BY_ID[id])}${from ? ` from the ${teamName(from)}` : ''}`);
  return ` ${PW('onside').name}: they take ${regionName(BY_ID[id])}${from ? ` from the ${teamName(from)}` : ''}.` + collect(team, [id]);
}
function drawPowers() {
  const box = $('powers'); if (!box || !state) return;
  $('powers-card').hidden = !opt('powerups');
  const held = Object.entries(state.powers || {}).filter(([t, l]) => l.length && aliveTeams(state.owners).includes(t));
  box.innerHTML = (held.length ? held.map(([t, l]) => `<li><img src="${logoUrl(t)}" alt=""><span>${TEAM_BY_ABBR[t].name}</span><span class="glyphs">${l.map(p => { const P = PW(p); return `<i title="${P.name}: ${P.desc}">${P.glyph}</i>`; }).join('')}</span></li>`).join('') : '<li class="none">Nobody is holding a power-up yet.</li>');
  $('power-legend').innerHTML = POWERS.map(Q => PW(Q.id)).map(P => `<li><i>${P.glyph}</i><span><b>${P.name}</b>${P.desc}</span></li>`).join('');
}

// ---------- options ----------
function wireOptions() {
  $('settings-btn').onclick = () => { const p = $('settings'), open = p.hidden; p.hidden = !open; $('settings-btn').setAttribute('aria-expanded', String(open)); };
  for (const k of ['sound', 'capitals', 'rebellions', 'powerups']) {
    const box = $(`opt-${k}`);
    box.checked = opt(k);
    box.onchange = () => { state.options[k] = box.checked; if (k === 'sound' && box.checked) { ac(); sfx.touchdown(); } if (k === 'powerups' && box.checked) state.tokens = placeTokens(state.owners, state.tokens || {}, POWERS.length, Math.random, frontier(state.owners), usedSet()); save(); paint(); render(); };
  }
  $('opt-records').onchange = e => {
    state.options.useRecords = e.target.checked;
    if (e.target.checked) for (const t of TEAMS) { const wl = state.wl[t.abbr]; const v = wl ? strengthFromRecord(...wl) : null; if (v != null) state.strengths[t.abbr] = v; }
    save(); drawStrengths(); render();
  };
  $('auto-btn').onclick = () => autoplay ? stopAuto() : startAuto();
  $('auto-speed').onchange = e => { autoSpeed = +e.target.value; };
  $('replay-slider').oninput = e => showReplay(+e.target.value);
  $('replay-play').onclick = playReplay;
  $('replay-exit').onclick = () => exitReplay(true);
}

// ---------- sound (made in the browser, no files) ----------
let AC = null, MASTER = null, NOISE = null, BED = null;
function ac() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    MASTER = AC.createGain(); MASTER.gain.value = 1.4; MASTER.connect(comp).connect(AC.destination);
    // 3 seconds of soft "pink" noise: the raw material for crowd sounds
    const n = AC.sampleRate * 3; NOISE = AC.createBuffer(1, n, AC.sampleRate);
    const d = NOISE.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.1) * 0.9; }
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
const now = () => ac().currentTime;
function shape(g, t, attack, peak, hold, release) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  return t + attack + hold + release;
}
function band(freq, q, t, attack, peak, hold, release) {
  const a = ac(), src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = NOISE; src.loop = true; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  src.connect(f).connect(g).connect(MASTER);
  const end = shape(g, t, attack, peak, hold, release);
  src.start(t, Math.random() * 2.5); src.stop(end + 0.05);
}
function osc(type, freq, t, attack, peak, hold, release, { glide, vibrato, filter } = {}) {
  const a = ac(), o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + attack + hold * 0.6);
  if (vibrato) { const l = a.createOscillator(), lg = a.createGain(); l.frequency.value = vibrato; lg.gain.value = freq * 0.03; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + attack + hold + release + 0.05); }
  let out = o;
  if (filter) { const f = a.createBiquadFilter(); f.type = filter.type || 'bandpass'; f.frequency.value = filter.freq; f.Q.value = filter.q || 1; o.connect(f); out = f; }
  out.connect(g).connect(MASTER);
  const end = shape(g, t, attack, peak, hold, release);
  o.start(t); o.stop(end + 0.05);
}
// A crowd: four noise bands from low rumble to hiss, plus a few dozen "voices" cheering upward.
function crowd(t, level, dur, voices = 0) {
  band(220, 0.7, t, 0.25, 0.55 * level, dur * 0.4, dur * 0.6);
  band(700, 0.9, t, 0.2, 0.45 * level, dur * 0.4, dur * 0.6);
  band(1700, 1.1, t, 0.18, 0.28 * level, dur * 0.35, dur * 0.6);
  band(3800, 1.3, t, 0.15, 0.12 * level, dur * 0.3, dur * 0.5);
  for (let i = 0; i < voices; i++) {
    const st = t + Math.random() * 0.35, f0 = 230 + Math.random() * 320;
    osc('sawtooth', f0, st, 0.12 + Math.random() * 0.15, 0.018 * level, dur * (0.25 + Math.random() * 0.3), dur * 0.5,
      { glide: 1.25 + Math.random() * 0.3, vibrato: 5 + Math.random() * 2.5, filter: { freq: 750 + Math.random() * 700, q: 2.5 } });
  }
}
function airhorn(t, blasts = 2) {
  for (let b = 0; b < blasts; b++) {
    const st = t + b * 0.55;
    for (const f of [233, 235.5, 466, 470]) osc('sawtooth', f, st, 0.03, 0.07, 0.38, 0.12, { filter: { type: 'lowpass', freq: 2600, q: 0.8 } });
  }
}
function claps(t, n = 6, gap = 0.32) { for (let k = 0; k < n; k++) band(2400, 0.6, t + k * gap + (k % 2 ? 0.02 : 0), 0.004, 0.5, 0.01, 0.06); }
function drum(t) {
  const a = ac(), o = a.createOscillator(), g = a.createGain();
  o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
  o.connect(g).connect(MASTER); shape(g, t, 0.005, 0.6, 0.02, 0.35); o.start(t); o.stop(t + 0.45);
  band(1800, 0.7, t, 0.002, 0.2, 0.005, 0.05);
}
function charge(t) { // the stadium organ "Charge!" riff
  const notes = [[392, 0], [523, 0.14], [659, 0.28], [784, 0.42], [659, 0.7], [784, 0.84]];
  notes.forEach(([f, d], k) => { osc('square', f, t + d, 0.01, 0.05, k === 5 ? 0.45 : 0.08, 0.08, { filter: { type: 'lowpass', freq: 3000 } }); osc('sine', f * 2, t + d, 0.01, 0.03, k === 5 ? 0.45 : 0.08, 0.08); });
}
function whistle(t) { for (let k = 0; k < 7; k++) osc('sine', 2750 + (k % 2) * 280, t + k * 0.06, 0.008, 0.07, 0.04, 0.02); }

const sfx = {
  kickoff() { if (!opt('sound')) return; const t = now(); whistle(t); crowd(t + 0.3, 0.6, 1.6, 10); },
  crowdStart() { // low murmur under the whole game
    if (!opt('sound') || BED) return;
    const a = ac(), t = now(), nodes = [];
    for (const [f, q, lv] of [[400, 0.5, 0.07], [1200, 0.8, 0.035]]) {
      const src = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      src.buffer = NOISE; src.loop = true; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lv, t + 0.8);
      lfo.frequency.value = 0.18 + Math.random() * 0.1; lg.gain.value = lv * 0.35; lfo.connect(lg).connect(g.gain);
      src.connect(fl).connect(g).connect(MASTER); src.start(t, Math.random() * 2.5); lfo.start(t);
      nodes.push({ src, g, lfo });
    }
    BED = { stop() { const t2 = now(); for (const n of nodes) { n.g.gain.cancelScheduledValues(t2); n.g.gain.setValueAtTime(n.g.gain.value || 0.03, t2); n.g.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.6); n.src.stop(t2 + 0.7); n.lfo.stop(t2 + 0.7); } } };
  },
  crowdStop() { if (BED) { BED.stop(); BED = null; } },
  touchdown() { if (!opt('sound')) return; const t = now(); crowd(t, 1, 2.2, 28); airhorn(t + 0.25); },
  fieldGoal() { if (!opt('sound')) return; const t = now(); crowd(t, 0.6, 1.3, 12); claps(t + 0.9, 4); },
  final() { if (!opt('sound')) return; const t = now(); airhorn(t, 1); crowd(t + 0.1, 0.8, 2, 18); },
  upset() { if (!opt('sound')) return; const t = now(); crowd(t, 1.2, 3, 40); charge(t + 0.4); airhorn(t + 1.6); },
  rebellion() { if (!opt('sound')) return; const t = now(); [0, 0.3, 0.6, 0.75, 0.9].forEach(d => drum(t + d)); crowd(t + 0.8, 1, 2.2, 24); },
  champion() { if (!opt('sound')) return; const t = now(); charge(t); crowd(t + 0.3, 1.3, 4, 48); airhorn(t + 1.4, 3); claps(t + 3, 8, 0.3); },
};

// ---------- auto-play ----------
function drawAuto() {
  const b = $('auto-btn'); if (!b) return;
  const can = state.mode !== 'pick' && !champion(state.owners) && !replaying;
  b.textContent = autoplay ? 'Stop auto-play' : 'Auto-play';
  b.className = autoplay ? 'btn danger' : 'btn ghost';
  b.disabled = !autoplay && (!can || busy);
  $('auto-hint').hidden = state.mode !== 'pick';
}
function startAuto() { if (state.mode === 'pick') return; autoplay = true; render(); autoLoop(); }
function stopAuto() { autoplay = false; if (state) render(); }
async function autoLoop() {
  while (autoplay && !champion(state.owners)) {
    if (busy) { await sleep(100); continue; }
    if (turn.step === 'wheel') await spinWheel();
    else if (turn.step === 'arrow') await spinArrow();
    else if (turn.step === 'battle') await fight();
    else if (turn.step === 'done') { await sleep(1400 / autoSpeed); if (autoplay) nextTurn(); }
    await sleep(300 / autoSpeed);
  }
  autoplay = false; render();
}

// ---------- history replay ----------
function drawReplay() {
  const sl = $('replay-slider'); if (!sl || !state) return;
  const n = state.history.length;
  sl.max = Math.max(0, n - 1);
  if (!replaying) sl.value = n - 1;
  $('replay-label').textContent = replaying ? `Turn ${state.history[+sl.value].t} of ${state.turn}` : `${n - 1} ${n - 1 === 1 ? 'move' : 'moves'} recorded`;
  $('replay-exit').hidden = !replaying;
  sl.disabled = n < 2; $('replay-play').disabled = n < 2;
}
function showReplay(i) {
  if (busy || autoplay) return;
  replaying = true; clearAim();
  $('replay-slider').value = i;
  paint(decodeOwners(state.history[i].c, REGIONS.map(r => r.id), TEAMS.map(t => t.abbr)));
  drawReplay(); render();
}
let replayTimer = null;
async function playReplay() {
  if (busy || autoplay) return;
  if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; $('replay-play').textContent = 'Play'; return; }
  let i = replaying && +$('replay-slider').value < state.history.length - 1 ? +$('replay-slider').value : 0;
  $('replay-play').textContent = 'Pause';
  const step = () => {
    showReplay(i);
    if (++i < state.history.length) replayTimer = setTimeout(step, 450);
    else { replayTimer = null; $('replay-play').textContent = 'Play'; }
  };
  step();
}
function exitReplay(redraw) {
  if (replayTimer) { clearTimeout(replayTimer); replayTimer = null; }
  const b = $('replay-play'); if (b) b.textContent = 'Play';
  if (!replaying) return;
  replaying = false;
  if (redraw) { paint(); drawReplay(); render(); }
}

// ---------- record book ----------
function recordLines() {
  const r = state.records || {}, nm = a => TEAM_BY_ABBR[a].name;
  return [
    `<li><span>Biggest upset</span><b>${r.upset ? `${nm(r.upset.team)} over the ${teamName(r.upset.vs)} (${r.upset.pct}%)` : '—'}</b></li>`,
    `<li><span>Most wins</span><b>${r.mostWins ? `${nm(r.mostWins.team)}, ${r.mostWins.n} ${r.mostWins.n === 1 ? 'win' : 'wins'}` : '—'}</b></li>`,
    `<li><span>Longest win streak</span><b>${r.streak ? `${nm(r.streak.team)}, ${r.streak.n} ${r.streak.n === 1 ? 'win' : 'wins'}` : '—'}</b></li>`,
    `<li><span>Most ${UNIT(2)} taken in one win</span><b>${r.bigTake ? `${nm(r.bigTake.team)}, ${r.bigTake.n} ${UNIT(r.bigTake.n)} from the ${teamName(r.bigTake.from)}` : '—'}</b></li>`,
  ];
}
function drawRecords() { const e = $('records'); if (e && state) e.innerHTML = recordLines().join(''); }

// Load a map's data and build its regions, borders and lookup tables.
async function loadMap(key) {
  MAP = key;
  const topo = await (await fetch(key === 'world' ? 'countries-110m.json' : key === 'na' ? 'na-50m.json' : 'states-10m.json')).json();
  const built = key === 'world' ? buildWorld(topo) : buildUSA(topo, key === 'na');
  REGIONS = built.regions;
  BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
  STATE_OF = Object.fromEntries(REGIONS.map(r => [r.id, r.state]));
  CENT = Object.fromEntries(REGIONS.map(r => [r.id, r.at]));
  LABEL.fill(-1);
  REGIONS.forEach((r, i) => { for (const [x, y] of r.pts) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const gx = x + dx, gy = y + dy; if (gx < W && gy < H) LABEL[gy * W + gx] = i; } });
  ANCHOR_CACHE.clear();
  drawMap(built);
  BASE = built.frame || { x: 0, y: 0, w: W, h: H };
  setView({ ...BASE });
  drawAssign();
}
let mapArmed = null;
async function switchMap(key) {
  if (key === MAP) return;
  stopAuto(); exitReplay(false);
  while (busy) await sleep(100); // let a battle that's already playing finish first
  $('loading').hidden = false; $('loading').textContent = 'Loading map…';
  await loadMap(key);
  state = fresh({ ...state, map: key }); CAPITALS = state.home;
  turn = { step: 'wheel' }; wheelRot = 0; arrowRot = 0;
  $('loading').hidden = true;
  save(); drawMapSwitch(); drawStrengths(); paint(); render(); drawReplay(); drawRecords();
}
function drawMapSwitch() {
  const home = document.querySelector('.mapseg button[data-map="home"]');
  home.textContent = needsCanada() ? 'North America' : 'USA';
  for (const b of document.querySelectorAll('.mapseg button')) b.setAttribute('aria-pressed', String(b.dataset.map === 'world' ? MAP === 'world' : MAP !== 'world'));
  const L = LEAGUES[LEAGUE].name;
  $('map').setAttribute('aria-label', `${MAP === 'world' ? 'World map' : MAP === 'na' ? 'Map of North America' : 'Map of the United States'} colored by ${L} team territory`);
  $('league-name').textContent = L;
  document.title = `${L} Imperialism`;
  $('league').value = LEAGUE;
}
const preloadLogos = () => Promise.all(TEAMS.map(t => new Promise(res => { const im = new Image(); im.onload = im.onerror = res; im.src = logoUrl(t.abbr); })));
// Pick a different league: new teams, new logos, the right map, and a new game.
async function switchLeague(key) {
  if (key === LEAGUE) return;
  stopAuto(); exitReplay(false);
  while (busy) await sleep(100); // let a battle that's already playing finish first
  $('loading').hidden = false; $('loading').textContent = 'Loading teams…';
  setLeague(key);
  await preloadLogos();
  await loadMap(MAP === 'world' ? 'world' : homeMap());
  state = fresh({ ...state, league: key }); CAPITALS = state.home;
  turn = { step: 'wheel' }; wheelRot = 0; arrowRot = 0;
  $('loading').hidden = true;
  save(); drawMapSwitch(); drawStrengths(); paint(); render(); drawReplay(); drawRecords();
}

async function boot() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch {}
  setLeague(saved.league || 'nfl');
  $('league').innerHTML = Object.values(LEAGUES).map(L => `<option value="${L.key}">${L.name}</option>`).join('');
  await preloadLogos();
  await loadMap(saved.map === 'world' ? 'world' : homeMap());
  state = load(); CAPITALS = state.home;
  $('loading').hidden = true;
  drawStrengths(); wireOptions(); wireZoom(); drawReplay(); drawRecords(); drawMapSwitch();
  for (const b of document.querySelectorAll('.seg:not(.mapseg) button')) b.onclick = () => { state.mode = b.dataset.mode; if (state.mode === 'pick') stopAuto(); save(); render(); };
  $('league').onchange = e => {
    const key = e.target.value;
    if (state.turn === 0) { switchLeague(key); return; }
    $('league-confirm').hidden = false;
    $('league-confirm-text').textContent = `Start a new ${LEAGUES[key].name} game? This one will end.`;
    $('league-yes').onclick = () => { $('league-confirm').hidden = true; switchLeague(key); };
    $('league-no').onclick = () => { $('league-confirm').hidden = true; e.target.value = LEAGUE; };
  };
  for (const b of document.querySelectorAll('.mapseg button')) b.onclick = () => {
    const target = b.dataset.map === 'world' ? 'world' : homeMap();
    if (target === MAP) return;
    const hint = $('map-hint');
    if (mapArmed === b.dataset.map) { clearTimeout(mapArmed.t); mapArmed = null; hint.hidden = true; switchMap(target); return; }
    mapArmed = b.dataset.map; hint.hidden = false;
    setTimeout(() => { if (mapArmed === b.dataset.map) { mapArmed = null; hint.hidden = true; } }, 3500);
  };
  $('reset').onclick = () => {
    const b = $('reset');
    if (resetArmed) { clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Reset map'; b.className = 'btn ghost'; doReset(); return; }
    b.textContent = 'Click again to reset'; b.className = 'btn danger';
    resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Reset map'; b.className = 'btn ghost'; }, 3000);
  };
  paint(); render();
}
boot().catch(err => { $('loading').textContent = `The map didn't load (${err.message}). Reload the page to try again.`; });
