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

export function resolveBattle(a, b, mode, strengths, rng = Math.random) {
  if (mode === 'pick') return null;
  const pa = mode === 'weighted' ? strengths[a] / (strengths[a] + strengths[b]) : 0.5;
  return rng() < pa ? a : b;
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
export function rayTarget(team, [ox, oy], angleDeg, labelAt, owners, adjacency, { maxDist = 1500, minGap = 4, step = 1 } = {}) {
  const dx = Math.cos(angleDeg * Math.PI / 180), dy = Math.sin(angleDeg * Math.PI / 180);
  let gap = 0, crossedWater = false;
  for (let t = 0; t <= maxDist; t += step) {
    const id = labelAt(ox + dx * t, oy + dy * t);
    if (!id) { gap += step; if (gap >= minGap) crossedWater = true; continue; }
    gap = 0;
    if (owners[id] === team) { crossedWater = false; continue; }
    if (!crossedWater) return id;
    return touchesTeam(team, id, owners, adjacency) ? id : null;
  }
  return null;
}

// Empty pockets of land bordered by exactly one team go to that team. Returns { regionId: team }.
export function enclosedClaims(owners, adjacency) {
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
    if (around.size === 1) { const t = [...around][0]; for (const p of pocket) out[p] = t; }
  }
  return out;
}

// A win adds a tenth of the loser's strength: beating a 9 is worth +0.9, beating a 3 is worth +0.3. Max 10.
const round1 = x => Math.round(x * 10) / 10;
export const boostWinner = (strengths, winner, loser) =>
  ({ ...strengths, [winner]: Math.min(10, round1((strengths[winner] || 1) + (strengths[loser] || 1) / 10)) });

export const fillAll = (owners, team) => Object.fromEntries(Object.keys(owners).map(id => [id, team]));

// A made-up game whose final score agrees with an already-decided winner.
// Returns { events: [{ q, clock, team, pts, kind, yards }], score: { [team]: points } }.
export function simulateGame(winner, loser, rng = Math.random) {
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const score = { [winner]: 0, [loser]: 0 }, events = [];
  const play = (q, team, clock) => {
    const r = rng();
    let pts, kind, yards;
    if (r < 0.52) { pts = 7; kind = pick(['pass', 'run']); yards = kind === 'pass' ? 3 + Math.floor(rng() * 60) : 1 + Math.floor(rng() * 30); }
    else if (r < 0.88) { pts = 3; kind = 'fg'; yards = 22 + Math.floor(rng() * 33); }
    else if (r < 0.94) { pts = 6; kind = 'missed-xp'; yards = 2 + Math.floor(rng() * 40); }
    else if (r < 0.98) { pts = 8; kind = 'two-point'; yards = 2 + Math.floor(rng() * 40); }
    else { pts = 2; kind = 'safety'; yards = 0; }
    score[team] += pts;
    events.push({ q, clock, team, pts, kind, yards });
  };
  for (let q = 1; q <= 4; q++) {
    const n = Math.floor(rng() * 3); // 0-2 scores a quarter
    const clocks = Array.from({ length: n }, () => 1 + Math.floor(rng() * 14 * 60)).sort((a, b) => b - a);
    for (const c of clocks) play(q, rng() < 0.55 ? winner : loser, c);
  }
  // late drives until the winner is ahead
  let clock = 120;
  while (score[winner] <= score[loser]) { play(4, winner, clock); clock = Math.max(1, clock - 40); }
  events.sort((a, b) => a.q - b.q || b.clock - a.clock);
  return { events, score };
}

// An upset: in weighted mode, the winner had less than a 35% chance.
export function isUpset(winner, loser, strengths, mode) {
  if (mode !== 'weighted') return false;
  const w = strengths[winner], l = strengths[loser];
  return w / (w + l) < 0.35;
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
