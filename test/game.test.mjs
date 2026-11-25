import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateCounts, territories, showBorder, initialOwners, aliveTeams, conquer, claim, resolveBattle, pickTarget, champion, teamCentroid } from '../game.js';
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
test('weighted battle uses a/(a+b)', () => {
  const s = { bal: 7, wsh: 3 };
  assert.equal(resolveBattle('bal', 'wsh', 'weighted', s, () => 0.69), 'bal');
  assert.equal(resolveBattle('bal', 'wsh', 'weighted', s, () => 0.71), 'wsh');
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
