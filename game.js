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
// Target = the closest region roughly in the arrow's direction: distance grows with how far off-angle it is,
// and regions more than 90 degrees off (behind the arrow) only count if nothing is ahead.
export function pickTarget(team, angleDeg, centroids, owners, spread = 30) {
  const [cx, cy] = teamCentroid(team, centroids, owners);
  const cands = Object.keys(owners).filter(id => owners[id] !== team && centroids[id]).map(id => {
    const [x, y] = centroids[id];
    const dist = Math.hypot(x - cx, y - cy), diff = angDiff(Math.atan2(y - cy, x - cx) * 180 / Math.PI, angleDeg);
    return { id, diff, score: dist * (1 + (diff / spread) ** 2) };
  });
  const ahead = cands.filter(c => c.diff <= 90).sort((a, b) => a.score - b.score);
  if (ahead.length) return ahead[0].id;
  return cands.sort((a, b) => a.diff - b.diff)[0]?.id;
}

export function champion(owners) {
  const alive = aliveTeams(owners);
  return alive.length === 1 ? alive[0] : null;
}

// A border line shows unless the same team owns both sides. Lines between two open states stay.
export function showBorder(owners, a, b) {
  return owners[a] !== owners[b] || !owners[a];
}
