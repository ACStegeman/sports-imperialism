// Browser UI. Uses TEAMS, TEAM_BY_ABBR, logoUrl (teams.js) and game.js functions, concatenated by build.mjs.
const W = 975, H = 610, BLANK = 'var(--blank)', STORE = 'nflImperialism.v1';
const NAME_TO_CODE = { Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE', 'District of Columbia':'DC', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY' };
const CODE_TO_NAME = Object.fromEntries(Object.entries(NAME_TO_CODE).map(([n, c]) => [c, n]));

const $ = id => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const teamName = a => TEAM_BY_ABBR[a].name.split(' ').slice(-1)[0];
const regionName = r => r.clip ? `${r.state === 'DC' ? 'DC' : CODE_TO_NAME[r.state]} (${teamName(r.team)} part)` : CODE_TO_NAME[r.state];

let REGIONS = [], BY_ID = {}, CENT = {};
let state = null; // { owners, strengths, mode, log, turn }
let turn = { step: 'wheel' }; // wheel | arrow | battle | done
let wheelRot = 0, arrowRot = 0, busy = false;

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

function buildRegions(topo) {
  const fc = topojson.feature(topo, topo.objects.states);
  const proj = d3.geoAlbersUsa().fitExtent([[8, 8], [W - 8, H - 8]], fc);
  const path = d3.geoPath(proj);
  const ctx = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const f of fc.features) {
    const code = NAME_TO_CODE[f.properties.name];
    const d = code && path(f);
    if (!d) continue;
    const p2 = new Path2D(d);
    const [[x0, y0], [x1, y1]] = path.bounds(f);
    const teams = code === 'DC' ? [TEAM_BY_ABBR.wsh] : TEAMS.filter(t => t.state === code);
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
      out.push({ id: code, state: code, team: teams[0]?.abbr ?? null, d, clip: null, at: anchor(buckets[0], path.centroid(f)), area: path.area(f) });
    } else {
      const vor = d3.Delaunay.from(seeds).voronoi([x0 - 10, y0 - 10, x1 + 10, y1 + 10]);
      teams.forEach((t, i) => out.push({ id: `${code}-${t.abbr}`, state: code, team: t.abbr, d: vor.renderCell(i), clip: code, stateD: d, at: anchor(buckets[i], seeds[i]), area: buckets[i].length * step * step }));
    }
  }
  return { regions: out, path, fc, topo, segments: buildSegments(topo, proj, out, ctx) };
}

// Every piece of border, tagged with the region on each side, so lines can vanish inside one team's land.
function buildSegments(topo, proj, regions, ctx) {
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
  for (const g of topo.objects.states.geometries) {
    const code = NAME_TO_CODE[g.properties.name];
    if (!code) continue;
    const walk = a => Array.isArray(a) ? a.forEach(walk) : (k => { const set = users.get(k) || new Set(); set.add(code); users.set(k, set); })(a < 0 ? ~a : a);
    walk(g.arcs);
  }
  const segs = [];
  for (const [arc, set] of users) {
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
let gRegions, gLogos, gArrow, gAim, gBorders, SEGS = [];
function drawMap({ regions, path, topo, segments }) {
  SEGS = segments;
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
    p.addEventListener('click', () => onRegionClick(r.id));
  }
  gBorders = el('path', { class: 'borders' }, svg);
  el('path', { d: path(topojson.mesh(topo, topo.objects.states, (a, b) => a === b)), class: 'outline' }, svg);
  gLogos = el('g', {}, svg);
  gAim = el('g', {}, svg);
  gArrow = el('g', {}, svg);
}

function logoSize(r) { return Math.max(14, Math.min(46, Math.sqrt(r.area) * 0.42)); }

function paint() {
  const { owners } = state;
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
  for (const r of REGIONS) {
    const o = owners[r.id];
    if (!o || r.area < 120) continue;
    const s = logoSize(r);
    el('circle', { cx: r.at[0], cy: r.at[1], r: s * 0.5, fill: '#eef2ea', 'fill-opacity': 0.92, stroke: TEAM_BY_ABBR[o].color, 'stroke-width': 1.5, class: 'logo' }, gLogos);
    const li = s * 0.78;
    el('image', { href: logoUrl(o), x: r.at[0] - li / 2, y: r.at[1] - li / 2, width: li, height: li, class: 'logo' }, gLogos);
  }
  drawWheel();
  drawStandings();
  drawLog();
  const alive = aliveTeams(owners).length;
  const blanks = Object.values(owners).filter(v => !v).length;
  $('tally').textContent = `${alive} teams left · ${blanks} open states · turn ${state.turn}`;
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
    const sz = Math.max(14, Math.min(48, (2 * Math.PI * R * 0.72 / n) * 0.8));
    const [lx, ly] = n === 1 ? [cx, cy] : pt(a0 + s / 2, R * 0.74);
    el('image', { href: logoUrl(t.abbr), x: lx - sz / 2, y: ly - sz / 2, width: sz, height: sz, transform: `rotate(${-wheelRot} ${lx} ${ly})`, 'data-up': '1' }, g);
  });
  el('circle', { cx, cy, r: 16, fill: '#10201b', stroke: '#eef2ea', 'stroke-width': 2 }, svg);
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
  await animate(wheelRot, target, 3800, setWheel);
  wheelRot = mod(target, 360);
  turn = { step: 'arrow', attacker: teams[idx].abbr };
  busy = false; render();
}

// ---------- arrow ----------
function drawArrow(team, rot) {
  gArrow.innerHTML = '';
  if (!team) return;
  const [cx, cy] = teamCentroid(team, CENT, state.owners);
  const g = el('g', { transform: `translate(${cx} ${cy}) rotate(${rot})` }, gArrow);
  el('circle', { r: 9, fill: TEAM_BY_ABBR[team].color, stroke: '#fff', 'stroke-width': 2.5 }, g);
  el('path', { d: 'M8,-5 L62,-5 L62,-14 L88,0 L62,14 L62,5 L8,5 Z', fill: '#f0b429', stroke: '#1d1503', 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
}
async function spinArrow() {
  busy = true; render();
  const a = turn.attacker, final = Math.random() * 360;
  const target = arrowRot + 720 + mod(final - arrowRot, 360);
  await animate(arrowRot, target, 2600, r => drawArrow(a, r));
  arrowRot = mod(target, 360);
  const tid = pickTarget(a, arrowRot, CENT, state.owners);
  showAim(a, tid);
  const defender = state.owners[tid];
  if (!defender) {
    state.owners = claim(state.owners, a, tid);
    addLog(`<b>${teamName(a)}</b> claim open land in ${regionName(BY_ID[tid])}`);
    turn = { step: 'done', attacker: a, msg: `The <b>${TEAM_BY_ABBR[a].name}</b> march into ${regionName(BY_ID[tid])}. Nobody was home.` };
    nextTurnCount(); save();
  } else {
    turn = { step: 'battle', attacker: a, defender, region: tid };
  }
  busy = false; paint(); render();
}
function showAim(team, tid) {
  gAim.innerHTML = '';
  for (const p of gRegions.children) p.classList.toggle('target', p.dataset.id === tid);
  if (!team || !tid) return;
  const [x0, y0] = teamCentroid(team, CENT, state.owners), [x1, y1] = CENT[tid];
  el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'aim' }, gAim);
}
function clearAim() { showAim(null, null); drawArrow(null); }

// ---------- battle ----------
function odds(a, b) {
  if (state.mode === 'weighted') { const sa = state.strengths[a], sb = state.strengths[b]; return [sa / (sa + sb), sb / (sa + sb)]; }
  return [0.5, 0.5];
}
async function fight() {
  busy = true; render();
  const { attacker: a, defender: b } = turn;
  const winner = resolveBattle(a, b, state.mode, state.strengths);
  const sides = [...document.querySelectorAll('.side-team')];
  if (!reduced) {
    let delay = 60, i = 0;
    while (delay < 340) {
      sides.forEach((s, j) => s.classList.toggle('lit', j === i % 2));
      await new Promise(r => setTimeout(r, delay)); delay *= 1.18; i++;
    }
  }
  busy = false;
  finishBattle(winner);
}
function finishBattle(winner) {
  const { attacker: a, defender: b } = turn, loser = winner === a ? b : a;
  const taken = Object.keys(state.owners).filter(id => state.owners[id] === loser).length;
  state.owners = conquer(state.owners, winner, loser);
  addLog(`<b>${teamName(winner)}</b> beat the ${teamName(loser)} and take ${taken} ${taken === 1 ? 'state' : 'states'}`);
  turn = { step: 'done', attacker: a, defender: b, winner, msg: `The <b>${TEAM_BY_ABBR[winner].name}</b> win and take over ${taken === 1 ? `the ${teamName(loser)}' only state` : `all ${taken} of the ${teamName(loser)}' states`}. The ${teamName(loser)} are out.` };
  nextTurnCount(); save(); paint(); render();
}

// ---------- turn panel ----------
function teamCard(abbr, pct, extra = '') {
  const t = TEAM_BY_ABBR[abbr];
  return `<div class="side-team ${extra}"><img src="${logoUrl(abbr)}" alt=""><span class="nm">${t.name}</span>${pct != null ? `<span class="pct">${Math.round(pct * 100)}%</span>` : ''}</div>`;
}
function render() {
  const st = $('status'), mu = $('matchup'), ac = $('actions');
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  mu.innerHTML = ''; ac.innerHTML = '';
  const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = `btn ${cls}`; b.textContent = label; b.disabled = busy; b.onclick = fn; ac.appendChild(b); return b; };
  if (turn.step === 'wheel') {
    st.innerHTML = busy ? 'Spinning…' : 'Spin the wheel to pick who attacks.';
    btn('Spin the wheel', spinWheel);
  } else if (turn.step === 'arrow') {
    st.innerHTML = busy ? 'Aiming…' : `The <b>${TEAM_BY_ABBR[turn.attacker].name}</b> are on the move. Spin the arrow to pick a direction.`;
    btn('Spin the arrow', spinArrow);
  } else if (turn.step === 'battle') {
    const { attacker: a, defender: b } = turn, [pa, pb] = odds(a, b), showPct = state.mode !== 'pick';
    st.innerHTML = `The arrow points at ${regionName(BY_ID[turn.region])}. Battle!`;
    mu.innerHTML = `<div class="matchup">${teamCard(a, showPct ? pa : null)}<span class="vs">VS</span>${teamCard(b, showPct ? pb : null)}</div>`;
    if (state.mode === 'pick') {
      btn(`${teamName(a)} win`, () => finishBattle(a));
      btn(`${teamName(b)} win`, () => finishBattle(b));
    } else {
      btn('Fight!', fight);
    }
  } else if (turn.step === 'done') {
    st.innerHTML = turn.msg;
    if (turn.winner) mu.innerHTML = `<div class="matchup">${teamCard(turn.attacker, null, turn.winner === turn.attacker ? 'win' : '')}<span class="vs">VS</span>${teamCard(turn.defender, null, turn.winner === turn.defender ? 'win' : '')}</div>`;
    btn('Next turn', () => { turn = { step: 'wheel' }; clearAim(); render(); });
  }
  const champ = champion(state.owners);
  $('overlay').hidden = !champ;
  if (champ) {
    const t = TEAM_BY_ABBR[champ];
    $('overlay').innerHTML = `<div class="champ"><img src="${logoUrl(champ)}" alt=""><h2>The ${t.name} rule America</h2><p>Last team standing after ${state.turn} turns.</p><button class="btn" id="again">Play again</button></div>`;
    $('again').onclick = doReset;
  }
}
function nextTurnCount() { state.turn++; }

// ---------- side panels ----------
function drawStandings() {
  const counts = {};
  for (const o of Object.values(state.owners)) if (o) counts[o] = (counts[o] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6);
  $('standings').innerHTML = top.map(([a, n]) => `<li><img src="${logoUrl(a)}" alt=""><span>${TEAM_BY_ABBR[a].name}</span><span class="n">${n} ${n === 1 ? 'state' : 'states'}</span></li>`).join('');
}
function addLog(html, label = `Turn ${state.turn + 1}`) { state.log.unshift(`${label}: ${html}`); state.log = state.log.slice(0, 60); }
function drawLog() { $('log').innerHTML = state.log.length ? state.log.map(l => `<li>${l}</li>`).join('') : '<li>No moves yet.</li>'; }

function drawStrengths() {
  $('strengths').innerHTML = TEAMS.map(t => `<label><img src="${logoUrl(t.abbr)}" alt=""><span>${t.name}</span><input type="number" min="1" max="10" step="1" id="str-${t.abbr}" value="${state.strengths[t.abbr]}"></label>`).join('');
  for (const t of TEAMS) $(`str-${t.abbr}`).addEventListener('change', e => {
    const v = Math.max(1, Math.min(10, Math.round(+e.target.value) || 1));
    e.target.value = v; state.strengths[t.abbr] = v; save(); render();
  });
}
function drawAssign() {
  const s = $('assign');
  s.innerHTML = `<option value="">Off</option>` + TEAMS.map(t => `<option value="${t.abbr}">${t.name}</option>`).join('') + `<option value="__blank">Nobody (make it blank)</option>`;
  s.onchange = () => $('field').classList.toggle('assigning', !!s.value);
}
function onRegionClick(id) {
  const v = $('assign').value;
  if (!v || busy) return;
  const team = v === '__blank' ? null : v, before = state.owners[id];
  if (before === team) return;
  state.owners = claim(state.owners, team, id);
  addLog(`${regionName(BY_ID[id])} handed to <b>${team ? teamName(team) : 'nobody'}</b>`, 'By hand');
  const alive = new Set(aliveTeams(state.owners));
  if ((turn.attacker && !alive.has(turn.attacker)) || (turn.defender && turn.step === 'battle' && !alive.has(turn.defender))) { turn = { step: 'wheel' }; clearAim(); }
  else if (turn.step === 'arrow') drawArrow(turn.attacker, arrowRot);
  save(); paint(); render();
}

// ---------- state ----------
function fresh() {
  return { owners: initialOwners(REGIONS), strengths: Object.fromEntries(TEAMS.map(t => [t.abbr, t.strength])), mode: 'pick', log: [], turn: 0 };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.owners && REGIONS.every(r => r.id in s.owners) && Object.keys(s.owners).length === REGIONS.length) return { ...fresh(), ...s };
  } catch {}
  return fresh();
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {} }

let resetArmed = null;
function doReset() {
  state = fresh(); turn = { step: 'wheel' }; wheelRot = 0; arrowRot = 0;
  clearAim(); save(); drawStrengths(); paint(); render();
}

async function boot() {
  const topo = await (await fetch('states-10m.json')).json();
  const built = buildRegions(topo);
  REGIONS = built.regions;
  BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
  CENT = Object.fromEntries(REGIONS.map(r => [r.id, r.at]));
  drawMap(built);
  state = load();
  $('loading').hidden = true;
  drawStrengths(); drawAssign();
  for (const b of document.querySelectorAll('.seg button')) b.onclick = () => { state.mode = b.dataset.mode; save(); render(); };
  $('reset').onclick = () => {
    const b = $('reset');
    if (resetArmed) { clearTimeout(resetArmed); resetArmed = null; b.textContent = 'Reset map'; b.className = 'btn ghost'; doReset(); return; }
    b.textContent = 'Click again to reset'; b.className = 'btn danger';
    resetArmed = setTimeout(() => { resetArmed = null; b.textContent = 'Reset map'; b.className = 'btn ghost'; }, 3000);
  };
  paint(); render();
}
boot().catch(err => { $('loading').textContent = `The map didn't load (${err.message}). Reload the page to try again.`; });
