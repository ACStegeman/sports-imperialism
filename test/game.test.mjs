import { test } from 'node:test';
import assert from 'node:assert/strict';
import { territories, showBorder, initialOwners, aliveTeams, conquer, claim, resolveBattle, pickTarget, champion, teamCentroid } from '../game.js';
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
test('pickTarget picks region in arrow direction, never own', () => {
  const o = initialOwners(regions);
  assert.equal(pickTarget('bal', 0, cents, o), 'C');   // east
  assert.equal(pickTarget('bal', 90, cents, o), 'B');  // down (screen)
});
test('pickTarget falls back to closest angle when nothing in cone', () => {
  const o = initialOwners(regions);
  assert.equal(pickTarget('bal', 180, cents, o) !== undefined, true);
  assert.notEqual(o[pickTarget('bal', 180, cents, o)], 'bal');
});
test('champion only when one team left', () => {
  assert.equal(champion(initialOwners(regions)), null);
  assert.equal(champion(conquer(initialOwners(regions), 'bal', 'wsh')), 'bal');
});
test('pickTarget prefers a nearby region slightly off-angle over a far one dead ahead', () => {
  const c = { home: [0, 0], far: [100, 0], near: [10, 5] };
  const o = { home: 'bal', far: null, near: null };
  assert.equal(pickTarget('bal', 0, c, o), 'near');
});
test('pickTarget ignores regions behind the arrow when something is ahead', () => {
  const c = { home: [0, 0], behind: [-3, 0], ahead: [50, 30] };
  const o = { home: 'bal', behind: null, ahead: null };
  assert.equal(pickTarget('bal', 0, c, o), 'ahead');
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
