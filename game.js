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
