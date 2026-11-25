# NFL Imperialism Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single web page where NFL teams start on their real territory on a US map and conquer each other via wheel + arrow spins and battles.

**Architecture:** Static page. `teams.js` holds data, `game.js` holds pure game logic (testable in Node), `map.js` builds region geometry (states + Voronoi splits) and renders SVG, `index.html` wires UI. Map data (us-atlas states TopoJSON) is vendored locally so the page has no runtime fetch except logos.

**Tech Stack:** Plain JS (ES modules), d3 v7 + topojson-client (vendored), Node's built-in test runner for logic tests.

**Spec:** `docs/2026-11-25-nfl-imperialism-design.md`

## Global Constraints
- Split states: NY (Bills, Jets, Giants), CA (49ers, Rams, Chargers), OH (Browns, Bengals), FL (Jaguars, Buccaneers, Dolphins), PA (Steelers, Eagles), TX (Cowboys, Texans), MD (Ravens, Commanders). Jets/Giants are both placed inside NY.
- Teamless states start blank (gray, owner `null`).
- Every region shows its owner's logo at its center.
- Battle modes: `pick`, `fifty`, `weighted` (strength 1–10, P(a wins) = a/(a+b)).
- Winner takes all loser territory; loser removed from wheel; one team left → champion screen.
- State persisted in `localStorage` key `nflImperialism.v1`; Reset restores initial.
- Logos: `https://a.espncdn.com/i/teamlogos/nfl/500/{abbr}.png`.

## Review Focus
- Arrow pointing where no un-owned region exists in that direction (e.g. team on coast pointing at ocean) → re-aim to nearest un-owned region by angle; never a dead spin.
- Team owning a blank region next to a blank region → taking blank land must not trigger a battle.
- Reload mid-game → same map, wheel excludes eliminated teams.
- Manual click assigning the last region of a team to someone else → that team is eliminated.
- Tiny regions (DC-area MD split, NJ-less NY thirds) → logo still placed inside region, scaled down.

---

### Task 1: Team data + game logic

**Files:**
- Create: `nfl-imperialism/teams.js`, `nfl-imperialism/game.js`
- Test: `nfl-imperialism/test/game.test.mjs`

**Interfaces:**
- Produces: `TEAMS: Array<{abbr, name, color, color2, lat, lon, state, strength}>` (32 teams; `state` = USPS code; lat/lon = city, Jets/Giants placed in NY at ~40.9N/-73.9 and ~41.3N/-74.2 so they split downstate NY).
- Produces in `game.js`:
  - `initialState(regions: Array<{id, team:abbr|null}>) -> {owners: {[regionId]: abbr|null}, alive: abbr[], strengths: {[abbr]: number}, mode: 'pick'|'fifty'|'weighted'}`
  - `pickTarget(teamAbbr, angleDeg, regionCentroids: {[id]:[x,y]}, owners) -> regionId` — target = un-owned-by-team region whose bearing from team's territory centroid is within ±25° of angle, nearest first; if none, smallest angular difference overall.
  - `resolveBattle(a, b, mode, strengths, rng=Math.random) -> abbr|null` (`null` for `pick`).
  - `conquer(state, winner, loser) -> state` (all loser regions → winner, loser removed from alive).
  - `claim(state, team, regionId) -> state` (blank or manual; eliminates a team left with zero regions).
  - `champion(state) -> abbr|null`.

- [ ] **Step 1: Write failing tests** — `conquer` moves all regions and removes loser; `claim` on last region eliminates owner; `resolveBattle('weighted')` with strengths 7/3 and rng=()=>0.69 returns a, rng=()=>0.71 returns b; `pickTarget` never returns a region the team owns; `champion` returns the sole alive team.
- [ ] **Step 2:** `node --test nfl-imperialism/test` → FAIL.
- [ ] **Step 3:** Implement `teams.js` and `game.js`.
- [ ] **Step 4:** `node --test nfl-imperialism/test` → PASS.

### Task 2: Map regions + render

**Files:**
- Create: `nfl-imperialism/map.js`, `nfl-imperialism/vendor/` (d3, topojson-client, states-10m.json)

**Interfaces:**
- Consumes: `TEAMS`.
- Produces: `buildRegions(topo, projection) -> Array<{id, team, state, path:string, centroid:[x,y], area}>` — single-team state → one region `id=state`; split state → Voronoi of its teams' projected cities clipped to the state polygon (clip via d3-polygon / SVG clipPath), `id=state-abbr`.
- Produces: `renderMap(svg, regions, owners, TEAMS, onClick)` — fills by owner color, draws state borders, places `<image>` logo at region centroid (size ∝ sqrt(area), clamped 14–48px).

- [ ] **Step 1:** Download vendor files; render map in browser preview; confirm 50 states + 7 split states show 17 split regions and every team appears once.
- [ ] **Step 2:** Verify logos sit inside their regions (visual check on NY, MD, CA).

### Task 3: UI — wheel, arrow, battle, manual, persist

**Files:**
- Create: `nfl-imperialism/index.html`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1:** Wheel (canvas/SVG of alive teams, eased spin), arrow spin over chosen team's centroid, battle dialog with mode switch (pick buttons / animated flip), strength editor, manual-assign dropdown, Reset, champion overlay, localStorage save/load.
- [ ] **Step 2:** Browser test: full turn in each mode, blank land claim, reload persistence, Reset, manual elimination.

### Task 4: Publish
- [ ] Inline vendor + JS into one HTML file; publish as private Artifact; open link.
