import { test } from 'node:test';
import assert from 'node:assert/strict';
import { battleOdds, capitalsBattle, pickRebellion, recordBattle, recordTake, recordElimination, landAngles, strengthFromRecord, encodeOwners, decodeOwners, isUpset, spreadOrder, simulateGame, rayTarget, enclosedClaims, boostWinner, fillAll, stateCounts, territories, showBorder, initialOwners, aliveTeams, conquer, claim, resolveBattle, pickTarget, champion, teamCentroid } from '../game.js';
import { TEAMS } from '../teams.js';

const regions = [
  { id: 'A', team: 'bal' }, { id: 'B', team: 'wsh' }, { id: 'C', team: null }, { id: 'D', team: 'bal' },
];
const cents = { A: [0, 0], B: [0, 10], C: [10, 0], D: [2, 0] };

test('32 teams with required fields', () => {
  assert.equal(TEAMS.length, 32);
  for (const t of TEAMS) for (const k of ['abbr','name','color','lat','lon','state','strength']) assert.ok(t[k] !== undefined, `${t.abbr} ${k}`);
});
test('initialOwners maps region ids to teams', () => {
  assert.deepEqual(initialOwners(regions), { A: 'bal', B: 'wsh', C: null, D: 'bal' });
});
test('conquer moves all loser regions and eliminates loser', () => {
  const o = conquer(initialOwners(regions), 'wsh', 'bal');
  assert.deepEqual(o, { A: 'wsh', B: 'wsh', C: null, D: 'wsh' });
  assert.deepEqual(aliveTeams(o), ['wsh']);
});
test('claim of last region eliminates its owner', () => {
  const o = claim(initialOwners(regions), 'bal', 'B');
  assert.deepEqual(aliveTeams(o), ['bal']);
});
test('claim of blank region is not a battle and keeps everyone alive', () => {
  const o = claim(initialOwners(regions), 'wsh', 'C');
  assert.equal(o.C, 'wsh');
  assert.deepEqual(aliveTeams(o).sort(), ['bal', 'wsh']);
});
test('fifty battle splits at 0.5; pick returns null', () => {
  assert.equal(resolveBattle('bal', 'wsh', 'fifty', {}, () => 0.49), 'bal');
  assert.equal(resolveBattle('bal', 'wsh', 'fifty', {}, () => 0.51), 'wsh');
  assert.equal(resolveBattle('bal', 'wsh', 'pick', {}, () => 0.1), null);
});
test('teamCentroid averages owned region centroids', () => {
  assert.deepEqual(teamCentroid('bal', cents, initialOwners(regions)), [1, 0]);
});
test('champion only when one team left', () => {
  assert.equal(champion(initialOwners(regions)), null);
  assert.equal(champion(conquer(initialOwners(regions), 'bal', 'wsh')), 'bal');
});
test('border hides between two regions of the same team, shows otherwise', () => {
  const o = { NV: 'lv', ID: 'lv', UT: null, WY: null, OR: 'sea' };
  assert.equal(showBorder(o, 'NV', 'ID'), false);
  assert.equal(showBorder(o, 'NV', 'OR'), true);
  assert.equal(showBorder(o, 'ID', 'UT'), true);
  assert.equal(showBorder(o, 'UT', 'WY'), true); // two open states keep their line
});
test('territories groups touching land of one team; separate pieces stay separate', () => {
  const o = { NV: 'lv', ID: 'lv', UT: 'lv', FL: 'lv', OR: 'sea', WY: null };
  const adj = [['NV', 'ID'], ['ID', 'UT'], ['NV', 'OR'], ['UT', 'WY']];
  const t = territories(o, adj).map(x => ({ team: x.team, ids: [...x.ids].sort() }));
  assert.deepEqual(t.sort((a, b) => a.ids[0].localeCompare(b.ids[0])), [
    { team: 'lv', ids: ['FL'] },
    { team: 'lv', ids: ['ID', 'NV', 'UT'] },
    { team: 'sea', ids: ['OR'] },
  ]);
});
test('stateCounts counts each state once per team, DC counts as Maryland', () => {
  const stateOf = { 'NY-buf': 'NY', 'NY-nyj': 'NY', 'NY-nyg': 'NY', 'MD-wsh': 'MD', 'MD-bal': 'MD', DC: 'DC', PA: 'PA' };
  assert.deepEqual(stateCounts({ 'NY-buf': 'buf', 'NY-nyj': 'nyj', 'NY-nyg': 'nyg', 'MD-wsh': 'wsh', DC: 'wsh', 'MD-bal': 'bal', PA: null }, stateOf),
    { buf: 1, nyj: 1, nyg: 1, wsh: 1, bal: 1 });
  assert.deepEqual(stateCounts({ 'NY-buf': 'buf', 'NY-nyj': 'buf', 'NY-nyg': 'nyg', 'MD-wsh': 'wsh', DC: 'wsh', 'MD-bal': 'bal', PA: 'buf' }, stateOf).buf, 2);
});
test('pickTarget only hits land neighbors in the arrow direction', () => {
  // Bears in IL; MI is due east across the lake (not a neighbor), IN is east-southeast and touches IL
  const c = { IL: [0, 0], MI: [20, 0], IN: [10, 3], MO: [-5, 10], WI: [0, -10] };
  const o = { IL: 'chi', MI: 'det', IN: 'ind', MO: 'kc', WI: 'gb' };
  const adj = [['IL', 'IN'], ['IL', 'MO'], ['IL', 'WI'], ['WI', 'MI'], ['IN', 'MI']];
  assert.equal(pickTarget('chi', 0, c, o, adj), 'IN');      // east: IN, never MI
  assert.equal(pickTarget('chi', -90, c, o, adj), 'WI');    // north (screen up)
  assert.equal(pickTarget('gb', 45, { ...c }, o, adj), 'MI'); // Packers can reach the Lions
});
test('pickTarget returns null (respin) when the arrow points where there is no neighbor', () => {
  const c = { MIA: [0, 0], TB: [-5, -8] };
  const o = { MIA: 'mia', TB: 'tb' };
  assert.equal(pickTarget('mia', 90, c, o, [['MIA', 'TB']]), null); // south into the ocean
});
test('pickTarget counts neighbors of any region the team owns', () => {
  const c = { A: [0, 0], B: [10, 0], C: [20, 0] };
  const o = { A: 'x', B: 'x', C: null };
  assert.equal(pickTarget('x', 0, c, o, [['A', 'B'], ['B', 'C']]), 'C');
});

// A tiny grid map for the arrow tests. Each character is a 1x1 cell; '.' is water.
function gridMap(rows, legend) {
  return (x, y) => { const r = rows[Math.floor(y)]; const ch = r && r[Math.floor(x)]; return ch && ch !== '.' ? legend[ch] : null; };
}
test('rayTarget hits the first land the arrow line reaches, even if other neighbors are closer in angle', () => {
  // D = Broncos (CO). K = Kansas east, I = Iowa north-east. Arrow points east -> Kansas.
  const map = gridMap(['DDDDIIII', 'DDDDIIII', 'DDDDKKKK', 'DDDDKKKK'], { D: 'CO', K: 'KS', I: 'IA' });
  const o = { CO: 'den', KS: null, IA: null };
  const adj = [['CO', 'KS'], ['CO', 'IA']];
  assert.equal(rayTarget('den', [1.5, 2.5], 0, map, o, adj, { minGap: 2 }), 'KS');
});
test('rayTarget respins (null) when the arrow goes out to open water', () => {
  const map = gridMap(['SS......', 'SS......'], { S: 'CA' });
  assert.equal(rayTarget('sf', [0.5, 0.5], 0, map, { CA: 'sf' }, [], { minGap: 2, maxDist: 20 }), null);
});
test('rayTarget crosses water only to a land neighbor (Packers to Lions yes, Bears to Lions no)', () => {
  const map = gridMap(['WW...MM', 'II...MM'], { W: 'WI', M: 'MI', I: 'IL' });
  const o = { WI: 'gb', MI: 'det', IL: 'chi' };
  const adj = [['WI', 'MI'], ['WI', 'IL']];
  assert.equal(rayTarget('gb', [0.5, 0.5], 0, map, o, adj, { minGap: 2 }), 'MI');
  assert.equal(rayTarget('chi', [0.5, 1.5], 0, map, o, adj, { minGap: 2 }), null);
});
test('rayTarget passes through the team\'s own land', () => {
  const map = gridMap(['AABBC'], { A: 'a', B: 'b', C: 'c' });
  assert.equal(rayTarget('x', [0.5, 0.5], 0, map, { a: 'x', b: 'x', c: null }, [['a', 'b'], ['b', 'c']], { minGap: 2 }), 'c');
});
test('enclosedClaims gives empty pockets to the one team that surrounds them, not pockets touching others', () => {
  const o = { UT: null, NV: null, CA: 'sf', OR: 'sf', ID: 'sf', AZ: 'sf', WY: 'sf', OH: null, KY: 'sf', PA: 'cin' };
  const adj = [['UT', 'NV'], ['NV', 'CA'], ['NV', 'OR'], ['NV', 'ID'], ['NV', 'AZ'], ['UT', 'ID'], ['UT', 'AZ'], ['UT', 'WY'], ['OH', 'KY'], ['OH', 'PA']];
  assert.deepEqual(enclosedClaims(o, adj), { UT: 'sf', NV: 'sf' });
});
test('boostWinner adds a tenth of the loser strength, capped at 10', () => {
  assert.deepEqual(boostWinner({ dal: 5, hou: 6 }, 'dal', 'hou'), { dal: 5.6, hou: 6 });
  assert.deepEqual(boostWinner({ dal: 5, ten: 2 }, 'dal', 'ten'), { dal: 5.2, ten: 2 });
  assert.deepEqual(boostWinner({ kc: 9.7, buf: 9 }, 'kc', 'buf'), { kc: 10, buf: 9 });
});
test('fillAll paints every region for the champion', () => {
  assert.deepEqual(fillAll({ a: 'phi', b: null, c: null }, 'phi'), { a: 'phi', b: 'phi', c: 'phi' });
});

test('simulateGame: winner always ends ahead, points are real football scores, quarters in order', () => {
  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 300; i++) {
    const g = simulateGame('dal', 'hou', rng);
    assert.ok(g.score.dal > g.score.hou, `game ${i}: ${g.score.dal}-${g.score.hou}`);
    let total = { dal: 0, hou: 0 }, lastQ = 1;
    for (const e of g.events) {
      assert.ok([2, 3, 6, 7, 8].includes(e.pts));
      assert.ok(e.q >= lastQ && e.q <= 5); lastQ = e.q;
      total[e.team] += e.pts;
    }
    assert.deepEqual(total, g.score);
  }
});
test('spreadOrder: layers of land outward from the team, nearest first', () => {
  const o = { A: 'x', B: null, C: null, D: null, E: 'x' };
  const adj = [['A', 'B'], ['B', 'C'], ['C', 'D']];
  assert.deepEqual(spreadOrder(o, 'x', adj), [['B'], ['C'], ['D']]);
  // land not connected to the team still gets filled, in a last layer
  assert.deepEqual(spreadOrder({ A: 'x', Z: null }, 'x', []), [['Z']]);
});

test('battleOdds: defender is home and gets +5 points in weighted; 50/50 stays even', () => {
  const s = { bal: 7, wsh: 3 };
  const [pa, pd] = battleOdds('bal', 'wsh', 'weighted', s);
  assert.equal(Math.round(pa * 100), 65); assert.equal(Math.round(pd * 100), 35);
  assert.deepEqual(battleOdds('bal', 'wsh', 'fifty', s), [0.5, 0.5]);
});
test('resolveBattle uses home-field odds (attacker 65%)', () => {
  const s = { bal: 7, wsh: 3 };
  assert.equal(resolveBattle('bal', 'wsh', 'weighted', s, () => 0.64), 'bal');
  assert.equal(resolveBattle('bal', 'wsh', 'weighted', s, () => 0.66), 'wsh');
  assert.equal(resolveBattle('bal', 'wsh', 'fifty', {}, () => 0.49), 'bal');
  assert.equal(resolveBattle('bal', 'wsh', 'pick', {}, () => 0.1), null);
});
test('isUpset: weighted only, winner had under 35% after home field', () => {
  const s = { ten: 2, kc: 8, dal: 5, hou: 6 };
  assert.equal(isUpset('ten', 'ten', 'kc', 'weighted', s), true);    // attacker ten: 20% - 5 = 15%
  assert.equal(isUpset('kc', 'ten', 'kc', 'weighted', s), false);
  assert.equal(isUpset('dal', 'dal', 'hou', 'weighted', s), false);  // 45% - 5 = 40%
  assert.equal(isUpset('ten', 'ten', 'kc', 'fifty', s), false);
});
test('capitalsBattle: attacker win takes only the target, or everything if it was the capital', () => {
  const o = { A1: 'a', A2: 'a', B1: 'b', B2: 'b' };
  const caps = { a: 'A1', b: 'B2' };
  const adj = [['A1', 'A2'], ['A2', 'B1'], ['B1', 'B2']];
  const c = { A1: [0, 0], A2: [1, 0], B1: [2, 0], B2: [3, 0] };
  let r = capitalsBattle(o, 'a', 'b', 'a', 'B1', caps, adj, c);
  assert.deepEqual(r.owners, { A1: 'a', A2: 'a', B1: 'a', B2: 'b' }); assert.equal(r.capitalFell, false);
  r = capitalsBattle({ ...o, B1: 'a' }, 'a', 'b', 'a', 'B2', caps, adj, c);
  assert.equal(r.capitalFell, true); assert.equal(r.owners.B2, 'a');
});
test('capitalsBattle: defender win takes the attacker region it touched; capital there knocks attacker out', () => {
  const o = { A1: 'a', A2: 'a', B1: 'b' };
  const caps = { a: 'A1', b: 'B1' };
  const adj = [['A1', 'A2'], ['A2', 'B1']];
  const c = { A1: [0, 0], A2: [1, 0], B1: [2, 0] };
  let r = capitalsBattle(o, 'b', 'a', 'a', 'B1', caps, adj, c);
  assert.deepEqual(r.owners, { A1: 'a', A2: 'b', B1: 'b' }); assert.equal(r.capitalFell, false);
  r = capitalsBattle({ A1: 'a', B1: 'b' }, 'b', 'a', 'a', 'B1', caps, [['A1', 'B1']], c);
  assert.deepEqual(r.owners, { A1: 'b', B1: 'b' }); assert.equal(r.capitalFell, true);
});
test('pickRebellion: an eliminated team rises up in its home region, only when the dice say so', () => {
  const o = { MO: 'den', CO: 'den', NE: null };
  const caps = { kc: 'MO', den: 'CO' };
  assert.deepEqual(pickRebellion(o, ['kc', 'den'], caps, () => 0.01, 0.08), { team: 'kc', region: 'MO' });
  assert.equal(pickRebellion(o, ['kc', 'den'], caps, () => 0.5, 0.08), null);
  assert.equal(pickRebellion({ MO: 'kc', CO: 'den' }, ['kc', 'den'], caps, () => 0.01, 0.08), null); // nobody eliminated
});
test('record book: biggest upset, longest streak, biggest single conquest, fastest elimination', () => {
  let r = {};
  r = recordBattle(r, { winner: 'ten', loser: 'kc', winnerOdds: 0.15, turn: 3 });
  r = recordBattle(r, { winner: 'ten', loser: 'den', winnerOdds: 0.4, turn: 4 });
  r = recordBattle(r, { winner: 'buf', loser: 'ten', winnerOdds: 0.6, turn: 5 });
  assert.equal(r.upset.team, 'ten'); assert.equal(r.upset.pct, 15);
  assert.deepEqual(r.streak, { team: 'ten', n: 2 });
  assert.equal(r.current.ten, 0); assert.equal(r.current.buf, 1);
  r = recordTake(r, { team: 'buf', from: 'ten', n: 4, turn: 5 });
  r = recordTake(r, { team: 'kc', from: 'den', n: 2, turn: 6 });
  assert.deepEqual(r.bigTake, { team: 'buf', from: 'ten', n: 4, turn: 5 });
  r = recordElimination(r, { team: 'kc', by: 'ten', turn: 3 });
  r = recordElimination(r, { team: 'den', by: 'ten', turn: 4 });
  assert.deepEqual(r.fastestOut, { team: 'kc', by: 'ten', turn: 3 });
});
test('strengthFromRecord: 1 + 9 x win percentage', () => {
  assert.equal(strengthFromRecord(10, 2), 8.5);
  assert.equal(strengthFromRecord(0, 12), 1);
  assert.equal(strengthFromRecord(0, 0), null);
});
test('encode/decode owners round trip', () => {
  const ids = ['A', 'B', 'C'], teams = ['bal', 'wsh'];
  const o = { A: 'wsh', B: null, C: 'bal' };
  const code = encodeOwners(o, ids, teams);
  assert.equal(typeof code, 'string'); assert.equal(code.length, 3);
  assert.deepEqual(decodeOwners(code, ids, teams), o);
});

test('simulateGame: all kinds of scores - low games, shootouts, and some overtime', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const totals = []; let ot = 0, bothOver20 = 0;
  for (let i = 0; i < 400; i++) {
    const g = simulateGame('dal', 'hou', rng);
    totals.push(g.score.dal + g.score.hou);
    if (g.events.some(e => e.q === 5)) ot++;
    if (g.score.dal >= 20 && g.score.hou >= 20) bothOver20++;
  }
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  assert.ok(mean >= 38 && mean <= 55, `mean total ${mean}`);
  assert.ok(Math.max(...totals) >= 65, 'some shootouts');
  assert.ok(Math.min(...totals) <= 20, 'some low-scoring games');
  assert.ok(ot >= 4, `overtime games: ${ot}`);
  assert.ok(bothOver20 >= 60, `games where both teams score 20+: ${bothOver20}`);
});
test('simulateGame: combined score never goes over 100', () => {
  let seed = 11;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 5000; i++) {
    const g = simulateGame('dal', 'hou', rng);
    assert.ok(g.score.dal + g.score.hou <= 100, `game ${i}: ${g.score.dal}-${g.score.hou}`);
    assert.ok(g.score.dal > g.score.hou);
  }
});

test('landAngles: only directions where the arrow reaches land it can take', () => {
  // S = 49ers on the coast, water to the west, Nevada to the east
  const map = gridMap(['.....SSNNN', '.....SSNNN', '.....SSNNN'], { S: 'CA', N: 'NV' });
  const angles = landAngles('sf', [5.5, 1.5], map, { CA: 'sf', NV: null }, [['CA', 'NV']], { step: 15, minGap: 2, maxDist: 20 });
  assert.ok(angles.length > 0);
  assert.ok(angles.every(a => a < 90 || a > 270), `angles: ${angles}`); // all point east-ish, none west into the water
  assert.ok(angles.includes(0));
});
