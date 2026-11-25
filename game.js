// Pure game rules. owners = { [regionId]: teamAbbr | null }
export const initialOwners = regions => Object.fromEntries(regions.map(r => [r.id, r.team]));

export function aliveTeams(owners) {
  return [...new Set(Object.values(owners).filter(Boolean))];
}

export function conquer(owners, winner, loser) {
  const o = { ...owners };
  for (const id in o) if (o[id] === loser) o[id] = winner;
  return o;
}

export function claim(owners, team, regionId) {
  return { ...owners, [regionId]: team };
}

// Win chances [attacker, defender]. The defender is always home: +5 points in weighted mode.
export const HOME_EDGE = 0.05;
export function battleOdds(attacker, defender, mode, strengths) {
  if (mode !== 'weighted') return [0.5, 0.5];
  const sa = strengths[attacker], sd = strengths[defender];
  const pd = Math.min(0.95, sd / (sa + sd) + HOME_EDGE);
  return [1 - pd, pd];
}

export function resolveBattle(a, b, mode, strengths, rng = Math.random) {
  if (mode === 'pick') return null;
  return rng() < battleOdds(a, b, mode, strengths)[0] ? a : b;
}

export function teamCentroid(team, centroids, owners) {
  const pts = Object.keys(owners).filter(id => owners[id] === team).map(id => centroids[id]);
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// angleDeg in screen coords: 0 = right, 90 = down.
// Only land that shares a border with the team's territory can be hit. Of those, take the one closest to
// the arrow's direction, within `cone` degrees. Nothing there (water, Canada, Mexico) -> null, meaning respin.
export function pickTarget(team, angleDeg, centroids, owners, adjacency, cone = 45) {
  const [cx, cy] = teamCentroid(team, centroids, owners);
  const near = new Set();
  for (const [a, b] of adjacency) {
    if (owners[a] === team && owners[b] !== team) near.add(b);
    if (owners[b] === team && owners[a] !== team) near.add(a);
  }
  let best = null, bestDiff = Infinity;
  for (const id of near) {
    const [x, y] = centroids[id];
    const diff = angDiff(Math.atan2(y - cy, x - cx) * 180 / Math.PI, angleDeg);
    if (diff <= cone && diff < bestDiff) { bestDiff = diff; best = id; }
  }
  return best;
}

export function champion(owners) {
  const alive = aliveTeams(owners);
  return alive.length === 1 ? alive[0] : null;
}

// A border line shows unless the same team owns both sides. Lines between two open states stay.
export function showBorder(owners, a, b) {
  return owners[a] !== owners[b] || !owners[a];
}

// Connected pieces of land per team. adjacency = [[regionA, regionB], ...] for regions that share a border.
export function territories(owners, adjacency) {
  const nb = {};
  for (const [a, b] of adjacency) if (owners[a] && owners[a] === owners[b]) { (nb[a] ||= []).push(b); (nb[b] ||= []).push(a); }
  const seen = new Set(), out = [];
  for (const id in owners) {
    if (!owners[id] || seen.has(id)) continue;
    const ids = [], stack = [id];
    seen.add(id);
    while (stack.length) { const x = stack.pop(); ids.push(x); for (const y of nb[x] || []) if (!seen.has(y)) { seen.add(y); stack.push(y); } }
    out.push({ team: owners[id], ids });
  }
  return out;
}

// How many states each team holds any part of. A split state counts once; DC counts as Maryland.
export function stateCounts(owners, stateOf) {
  const seen = {};
  for (const id in owners) {
    const t = owners[id];
    if (!t) continue;
    const st = stateOf[id] === 'DC' ? 'MD' : stateOf[id];
    (seen[t] ||= new Set()).add(st);
  }
  return Object.fromEntries(Object.entries(seen).map(([t, s]) => [t, s.size]));
}

const touchesTeam = (team, id, owners, adjacency) =>
  adjacency.some(([a, b]) => (a === id && owners[b] === team) || (b === id && owners[a] === team));

// Follow the arrow's line from (ox, oy). labelAt(x, y) -> region id, or null for water / off the map.
// The first land not owned by the team is the target. Crossing open water is only allowed to land the
// team already borders by land (Packers -> Lions). Nothing reached -> null, meaning respin.
// crossWater: true (World map) lets the arrow cross oceans to whatever land it reaches first.
export function rayTarget(team, [ox, oy], angleDeg, labelAt, owners, adjacency, { maxDist = 1500, minGap = 4, step = 1, crossWater = false } = {}) {
  const dx = Math.cos(angleDeg * Math.PI / 180), dy = Math.sin(angleDeg * Math.PI / 180);
  let gap = 0, crossedWater = false;
  for (let t = 0; t <= maxDist; t += step) {
    const id = labelAt(ox + dx * t, oy + dy * t);
    if (!id) { gap += step; if (gap >= minGap) crossedWater = true; continue; }
    gap = 0;
    if (owners[id] === team) { crossedWater = false; continue; }
    if (!crossedWater || crossWater) return id;
    return touchesTeam(team, id, owners, adjacency) ? id : null;
  }
  return null;
}

// Empty pockets of land bordered by exactly one team go to that team. Returns { regionId: team }.
// coastal (optional): regions on open water; a pocket that touches the sea isn't surrounded.
export function enclosedClaims(owners, adjacency, coastal = null) {
  const nb = {};
  for (const [a, b] of adjacency) { (nb[a] ||= []).push(b); (nb[b] ||= []).push(a); }
  const seen = new Set(), out = {};
  for (const id in owners) {
    if (owners[id] || seen.has(id)) continue;
    const pocket = [], stack = [id], around = new Set();
    seen.add(id);
    while (stack.length) {
      const x = stack.pop(); pocket.push(x);
      for (const y of nb[x] || []) {
        if (!(y in owners)) continue;
        if (owners[y]) around.add(owners[y]);
        else if (!seen.has(y)) { seen.add(y); stack.push(y); }
      }
    }
    if (around.size === 1 && !(coastal && pocket.some(p => coastal.has(p)))) { const t = [...around][0]; for (const p of pocket) out[p] = t; }
  }
  return out;
}

// A win adds a tenth of the loser's strength: beating a 9 is worth +0.9, beating a 3 is worth +0.3. Max 10.
const round1 = x => Math.round(x * 10) / 10;
export const boostWinner = (strengths, winner, loser) =>
  ({ ...strengths, [winner]: Math.min(10, round1((strengths[winner] || 1) + (strengths[loser] || 1) / 10)) });

export const fillAll = (owners, team) => Object.fromEntries(Object.keys(owners).map(id => [id, team]));

// A made-up game whose final score agrees with an already-decided winner.
// Each game gets a pace: a defensive battle, a normal game, or a shootout. Ties after four quarters go to overtime (q 5).
// Returns { events: [{ q, clock, team, pts, kind, yards }], score: { [team]: points }, pace }.
// Combined points never go over 100: a game that would is played again.
export function simulateGame(winner, loser, rng = Math.random) {
  for (;;) {
    const g = simulateOnce(winner, loser, rng);
    if (g.score[winner] + g.score[loser] <= 100) return g;
  }
}
function simulateOnce(winner, loser, rng) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const score = { [winner]: 0, [loser]: 0 }, events = [];
  const r0 = rng();
  const pace = r0 < 0.22 ? { name: 'defensive', lo: 0, hi: 2 } : r0 < 0.75 ? { name: 'normal', lo: 1, hi: 3 } : { name: 'shootout', lo: 2, hi: 4 };
  const play = (q, team, clock) => {
    const r = rng();
    let pts, kind, yards;
    if (r < 0.58) { pts = 7; kind = pick(['pass', 'pass', 'run']); yards = kind === 'pass' ? 3 + Math.floor(rng() * 60) : 1 + Math.floor(rng() * 30); }
    else if (r < 0.88) { pts = 3; kind = 'fg'; yards = 22 + Math.floor(rng() * 33); }
    else if (r < 0.93) { pts = 6; kind = 'missed-xp'; yards = 2 + Math.floor(rng() * 40); }
    else if (r < 0.98) { pts = 8; kind = 'two-point'; yards = 2 + Math.floor(rng() * 40); }
    else { pts = 2; kind = 'safety'; yards = 0; }
    score[team] += pts;
    events.push({ q, clock, team, pts, kind, yards });
  };
  for (let q = 1; q <= 4; q++) {
    const n = pace.lo + Math.floor(rng() * (pace.hi - pace.lo + 1));
    const clocks = Array.from({ length: n }, () => 20 + Math.floor(rng() * 860)).sort((a, b) => b - a);
    for (const c of clocks) play(q, rng() < 0.55 ? winner : loser, c);
  }
  // comeback drives late in the 4th until the winner has caught up
  let clock = 150;
  while (score[winner] < score[loser]) { play(4, winner, clock); clock = Math.max(5, clock - 35); }
  // still tied: overtime, and the winner scores first
  if (score[winner] === score[loser]) play(5, winner, 600 - (60 + Math.floor(rng() * 480)));
  events.sort((a, b) => a.q - b.q || b.clock - a.clock);
  return { events, score, pace: pace.name };
}

// An upset: in weighted mode, the winner had less than a 35% chance (home field included).
export function isUpset(winner, attacker, defender, mode, strengths) {
  if (mode !== 'weighted') return false;
  const [pa, pd] = battleOdds(attacker, defender, mode, strengths);
  return (winner === attacker ? pa : pd) < 0.35;
}

// For the champion's victory lap: land not yet theirs, in rings spreading out from their territory.
export function spreadOrder(owners, team, adjacency) {
  const nb = {};
  for (const [a, b] of adjacency) { (nb[a] ||= []).push(b); (nb[b] ||= []).push(a); }
  const seen = new Set(Object.keys(owners).filter(id => owners[id] === team));
  let ring = [...seen];
  const layers = [];
  while (ring.length) {
    const next = [];
    for (const x of ring) for (const y of nb[x] || []) if (y in owners && !seen.has(y)) { seen.add(y); next.push(y); }
    if (next.length) layers.push(next);
    ring = next;
  }
  const rest = Object.keys(owners).filter(id => !seen.has(id));
  if (rest.length) layers.push(rest);
  return layers;
}

// Capitals mode. The winner takes only the land fought over: the arrow's target if the attacker wins,
// or the attacker's region touching the target if the defender wins. Taking a capital takes everything.
export function capitalsBattle(owners, winner, loser, attacker, targetId, capitals, adjacency, centroids) {
  let take;
  if (winner === attacker) take = targetId;
  else {
    const mine = Object.keys(owners).filter(id => owners[id] === loser);
    const touching = mine.filter(id => adjacency.some(([a, b]) => (a === id && b === targetId) || (b === id && a === targetId)));
    const pool = touching.length ? touching : mine;
    const [tx, ty] = centroids[targetId];
    take = pool.sort((p, q) => Math.hypot(centroids[p][0] - tx, centroids[p][1] - ty) - Math.hypot(centroids[q][0] - tx, centroids[q][1] - ty))[0];
  }
  const capitalFell = take === capitals[loser];
  const o = { ...owners };
  if (capitalFell) { for (const id in o) if (o[id] === loser) o[id] = winner; }
  else o[take] = winner;
  return { owners: o, taken: take, capitalFell };
}

// Rebellions: with probability `chance`, one eliminated team retakes its home region.
export function pickRebellion(owners, allTeams, capitals, rng = Math.random, chance = 0.08) {
  const alive = new Set(Object.values(owners).filter(Boolean));
  const out = allTeams.filter(t => !alive.has(t) && capitals[t] in owners);
  if (!out.length || rng() >= chance) return null;
  const team = out[Math.floor(rng() * out.length) % out.length];
  return { team, region: capitals[team] };
}

// Record book.
export function recordBattle(records, { winner, loser, winnerOdds, turn }) {
  const r = { ...records, current: { ...(records.current || {}) }, wins: { ...(records.wins || {}) } };
  r.wins[winner] = (r.wins[winner] || 0) + 1;
  if (!r.mostWins || r.wins[winner] > r.mostWins.n) r.mostWins = { team: winner, n: r.wins[winner] };
  r.current[winner] = (r.current[winner] || 0) + 1;
  r.current[loser] = 0;
  if (!r.streak || r.current[winner] > r.streak.n) r.streak = { team: winner, n: r.current[winner] };
  if (winnerOdds != null && winnerOdds < 0.5 && (!r.upset || winnerOdds * 100 < r.upset.pct)) r.upset = { team: winner, vs: loser, pct: Math.round(winnerOdds * 100), turn };
  return r;
}
export function recordTake(records, { team, from, n, turn }) {
  if (records.bigTake && records.bigTake.n >= n) return records;
  return { ...records, bigTake: { team, from, n, turn } };
}

// Strength from a real win-loss record: 1 + 9 x win percentage.
export function strengthFromRecord(w, l) {
  const g = w + l;
  return g ? Math.round((1 + 9 * w / g) * 10) / 10 : null;
}

// Compact map snapshots for the history replay: one character per region.
export const encodeOwners = (owners, ids, teams) => ids.map(id => owners[id] ? String.fromCharCode(65 + teams.indexOf(owners[id])) : '.').join('');
export const decodeOwners = (code, ids, teams) => Object.fromEntries(ids.map((id, i) => [id, code[i] === '.' ? null : teams[code.charCodeAt(i) - 65]]));

// Arrow directions (degrees, every `step`) that land on something the team can take. Used after repeated misses.
export function landAngles(team, origin, labelAt, owners, adjacency, { step = 3, ...opts } = {}) {
  const out = [];
  for (let a = 0; a < 360; a += step) if (rayTarget(team, origin, a, labelAt, owners, adjacency, opts)) out.push(a);
  return out;
}

// World map: each team gets a different random country from the eligible list.
export function assignHomes(eligible, teams, rng = Math.random) {
  const pool = [...eligible], out = {};
  for (const t of teams) out[t] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  return out;
}

// Power-ups.
export const POWERS = [
  { id: 'hail', name: 'Hail Mary', glyph: '✦', desc: '+20% win chance in your next battle.' },
  { id: 'blitz', name: 'Blitz', glyph: '»', desc: 'Take an extra turn right away.' },
  { id: 'bye', name: 'Bye Week', glyph: '◆', desc: 'The next attack on you is blocked.' },
  { id: 'draft', name: 'Draft Pick', glyph: '✚', desc: '+1.5 strength right away.' },
  { id: 'onside', name: 'Onside Kick', glyph: '↗', desc: 'Steal one neighboring piece of land right away, no battle.' },
  { id: 'flag', name: 'Challenge Flag', glyph: '⚑', desc: 'Lose your next battle? It gets replayed once.' },
  { id: 'tag', name: 'Franchise Tag', glyph: '★', desc: 'Knocked out? Keep your home land and stay alive (once).' },
  { id: 'home', name: 'Home Crowd', glyph: '⌂', desc: '+15% the next time you defend at home.' },
];
// Put power-up tokens on empty land (one per region), up to `count`. Each power-up exists once per game:
// never two of the same on the map, and never one listed in `used` (already picked up).
// prefer (optional): regions to fill first, such as empty land next to a team.
export function placeTokens(owners, tokens, count, rng = Math.random, prefer = null, used = new Set()) {
  const out = { ...tokens };
  const pool = POWERS.map(p => p.id).filter(id => !used.has(id) && !Object.values(out).includes(id));
  const open = Object.keys(owners).filter(id => !owners[id] && !(id in out));
  const near = prefer ? open.filter(id => prefer.has(id)) : [];
  while (Object.keys(out).length < count && open.length && pool.length) {
    const from = near.length ? near : open;
    const id = from.splice(Math.floor(rng() * from.length), 1)[0];
    if (from === near) open.splice(open.indexOf(id), 1);
    out[id] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
  }
  return out;
}
// Attacker's win chance after power-up boosts: each side's chance plus its boost, then shared out again.
export function applyBonuses(pa, bonusA, bonusD) {
  const a = pa + bonusA, d = (1 - pa) + bonusD;
  return Math.min(0.95, Math.max(0.05, a / (a + d)));
}

// ---------- other sports ----------
// Each returns { events: [{ p, clock, team, pts, kind }], score, periods } with the decided winner ahead.
const pickFrom = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const fromDist = (rng, dist) => { let r = rng(); for (let i = 0; i < dist.length; i++) { r -= dist[i]; if (r < 0) return i; } return dist.length - 1; };

// Baseball: nine innings, runs in bunches, extra innings if tied. clock = 0 (top) or 1 (bottom) is decided by the screen.
export function simulateBaseball(winner, loser, rng = Math.random) {
  const score = { [winner]: 0, [loser]: 0 }, events = [];
  const KIND = { 1: ['solo home run', 'RBI single', 'RBI double', 'sacrifice fly', 'RBI triple'], 2: ['two-run homer', 'two-run double', 'two-run single'], 3: ['three-run homer', 'bases-clearing double'], 4: ['grand slam'] };
  const add = (p, team, runs) => { if (!runs) return; score[team] += runs; events.push({ p, clock: 0, team, pts: runs, kind: pickFrom(rng, KIND[Math.min(4, runs)]) }); };
  const DIST = [0.73, 0.15, 0.07, 0.035, 0.015];
  for (let p = 1; p <= 9; p++) for (const t of [winner, loser]) add(p, t, fromDist(rng, DIST));
  if (score[winner] < score[loser]) add(9, winner, score[loser] - score[winner] + (rng() < 0.6 ? 1 : 2));
  let p = 9;
  while (score[winner] === score[loser]) { p++; if (rng() < 0.45 || p >= 15) add(p, winner, 1 + (rng() < 0.25 ? 1 : 0)); }
  events.sort((a, b) => a.p - b.p);
  return { events, score, periods: p };
}

// Hockey: three 20-minute periods; a tie goes to overtime (period 4) or a shootout (period 5, the winner gets 1 goal).
export function simulateHockey(winner, loser, rng = Math.random) {
  const score = { [winner]: 0, [loser]: 0 }, events = [];
  const KIND = ['wrist shot', 'snap shot', 'one-timer', 'power-play goal', 'deflection', 'breakaway goal', 'rebound goal', 'slap shot'];
  const add = (p, team, clock, kind) => { score[team]++; events.push({ p, clock, team, pts: 1, kind: kind || pickFrom(rng, KIND) }); };
  const DIST = [0.36, 0.37, 0.19, 0.06, 0.02];
  for (let p = 1; p <= 3; p++) for (const t of [winner, loser]) { const n = fromDist(rng, DIST); for (let k = 0; k < n; k++) add(p, t, 30 + Math.floor(rng() * 1140)); }
  if (score[loser] > score[winner]) {
    if (rng() < 0.75) { // usually just flip which team scored which goals
      for (const e of events) e.team = e.team === winner ? loser : winner;
      [score[winner], score[loser]] = [score[loser], score[winner]];
    } else { let late = 1150; while (score[winner] < score[loser]) { add(3, winner, late, 'late goal'); late = Math.min(1195, late + 15); } }
  }
  let periods = 3;
  if (score[winner] === score[loser]) {
    if (rng() < 0.6) { periods = 4; add(4, winner, 20 + Math.floor(rng() * 280), 'overtime winner'); }
    else { periods = 5; add(5, winner, 0, 'shootout winner'); }
  }
  events.sort((a, b) => a.p - b.p || a.clock - b.clock);
  return { events, score, periods };
}

// Basketball: four 12-minute quarters of baskets; a tie goes to a 5-minute overtime (period 5).
export function simulateBasketball(winner, loser, rng = Math.random) {
  const score = { [winner]: 0, [loser]: 0 }, events = [];
  const quarter = (p, team, pts, len) => {
    let left = pts;
    while (left > 0) {
      const r = rng(), v = left >= 3 && r < 0.36 ? 3 : left >= 2 && r < 0.86 ? 2 : 1;
      const kind = v === 3 ? '3-pointer' : v === 1 ? 'free throw' : pickFrom(rng, ['layup', 'dunk', 'jumper', 'floater', 'alley-oop', 'putback']);
      events.push({ p, clock: Math.floor(rng() * len), team, pts: v, kind });
      score[team] += v; left -= v;
    }
  };
  const qs = { [winner]: [], [loser]: [] };
  for (let p = 1; p <= 4; p++) for (const t of [winner, loser]) qs[t].push(21 + Math.floor(rng() * 16));
  const tot = t => qs[t].reduce((a, b) => a + b, 0);
  if (tot(winner) < tot(loser)) [qs[winner], qs[loser]] = [qs[loser], qs[winner]]; // flip so the decided winner is ahead
  for (let p = 1; p <= 4; p++) for (const t of [winner, loser]) quarter(p, t, qs[t][p - 1], 720);
  let periods = 4;
  if (score[winner] === score[loser]) { periods = 5; const l = 6 + Math.floor(rng() * 7); quarter(5, loser, l, 300); quarter(5, winner, l + 1 + Math.floor(rng() * 6), 300); }
  events.sort((a, b) => a.p - b.p || a.clock - b.clock);
  return { events, score, periods };
}

// Power-up names for each league. The effects are the same everywhere; only the names fit the sport.
const POWER_NAMES = {
  nfl: {},
  cfb: { draft: ['Transfer Portal', '+1.5 strength right away.'], flag: ['Booth Review', 'Lose your next battle? It gets replayed once.'], tag: ['Redshirt', 'Knocked out? Sit a year in your home land and stay alive (once).'], home: ['Student Section', '+15% the next time you defend at home.'] },
  mlb: { hail: ['Rally Cap', '+20% win chance in your next battle.'], blitz: ['Doubleheader', 'Play again right away: an extra turn.'], bye: ['Rainout', 'The next attack on you gets rained out.'], draft: ['Deadline Deal', '+1.5 strength right away.'], onside: ['Stolen Base', 'Steal one neighboring piece of land right away, no battle.'], flag: ["Manager's Challenge", 'Lose your next battle? It gets replayed once.'], tag: ['Extra Innings', 'Knocked out? The game goes on: keep your home land and stay alive (once).'], home: ['Packed Ballpark', '+15% the next time you defend at home.'] },
  nba: { hail: ['Buzzer Beater', '+20% win chance in your next battle.'], blitz: ['Fast Break', 'Take an extra turn right away.'], bye: ['Load Management', 'Sit out the next attack on you: it is blocked.'], draft: ['Lottery Pick', '+1.5 strength right away.'], onside: ['Steal', 'Steal one neighboring piece of land right away, no battle.'], flag: ["Coach's Challenge", 'Lose your next battle? It gets replayed once.'], tag: ['Final Timeout', 'Knocked out? Call timeout: keep your home land and stay alive (once).'], home: ['Sixth Man', '+15% the next time you defend at home.'] },
  nhl: { hail: ['Power Play', '+20% win chance in your next battle.'], blitz: ['Odd-Man Rush', 'Take an extra turn right away.'], bye: ['Hot Goalie', 'Your goalie stops the next attack on you.'], draft: ['Top Prospect', '+1.5 strength right away.'], onside: ['Takeaway', 'Steal one neighboring piece of land right away, no battle.'], flag: ["Coach's Challenge", 'Lose your next battle? It gets replayed once.'], tag: ['Overtime', 'Knocked out? Head to overtime: keep your home land and stay alive (once).'], home: ['Home Ice', '+15% the next time you defend at home.'] },
};
export function powerInfo(id, league = 'nfl') {
  const P = POWERS.find(p => p.id === id), o = (POWER_NAMES[league] || {})[id];
  return { id, glyph: P.glyph, name: o ? o[0] : P.name, desc: o ? o[1] : P.desc };
}
