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

// angleDeg in screen coords: 0 = right, 90 = down
export function pickTarget(team, angleDeg, centroids, owners, cone = 25) {
  const [cx, cy] = teamCentroid(team, centroids, owners);
  const cands = Object.keys(owners).filter(id => owners[id] !== team && centroids[id]).map(id => {
    const [x, y] = centroids[id];
    return { id, dist: Math.hypot(x - cx, y - cy), diff: angDiff(Math.atan2(y - cy, x - cx) * 180 / Math.PI, angleDeg) };
  });
  const inCone = cands.filter(c => c.diff <= cone).sort((a, b) => a.dist - b.dist);
  if (inCone.length) return inCone[0].id;
  return cands.sort((a, b) => a.diff - b.diff)[0]?.id;
}

export function champion(owners) {
  const alive = aliveTeams(owners);
  return alive.length === 1 ? alive[0] : null;
}
