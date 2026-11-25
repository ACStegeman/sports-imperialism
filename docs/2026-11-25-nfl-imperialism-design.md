# NFL Imperialism Map — Design (approved 2026-11-25)

## Intent
A personal "NFL imperialism" game: a US map with state lines where every NFL team starts on its real home territory, then teams conquer each other via wheel spins and battles until one owns everything.

## Starting map
- Each state with one team: whole state in team color.
- Split states (split by real city location — Voronoi of team cities clipped to the state border):
  - NY: Bills (west), Jets, Giants (both placed in NY, thirds)
  - CA: 49ers (north), Rams (middle), Chargers (south)
  - OH: Browns (north), Bengals (south)
  - FL: Jaguars, Buccaneers, Dolphins
  - PA: Steelers (west), Eagles (east)
  - TX: Cowboys (north), Texans (south)
  - MD: Ravens, Commanders
- States with no team start blank (gray).
- **Every region a team owns shows that team's logo at its center** (user requirement). Logos from ESPN public CDN.

## Turn flow
1. Spin wheel → picks a team still alive.
2. Spin arrow from that team's territory → only land that shares a land border with the team's territory can be hit (closest to the arrow direction, within 45°). Pointing at water or no neighbor → respin. (Packers↔Lions share the Upper Peninsula border; Bears↔Lions do not.)
3. Blank target → team takes it, no battle. Owned target → battle.
4. Battle modes (switchable): Pick winner (buttons), 50/50, Weighted (strength 1–10 per team, editable, odds = a/(a+b)).
5. Winner takes all of loser's territory; loser leaves the wheel. Last team standing → champion screen.

## Other
- Manual mode: pick team from dropdown, click any region to assign it.
- Game state saved in localStorage; Reset restores start.
- Single self-contained HTML page (SVG map from us-atlas TopoJSON + d3), published as a private Artifact.

## Approaches considered
- Single web page with real map geometry (chosen): accurate borders, runs anywhere, shareable.
- Hand-drawn/straight-line splits: simpler, but doesn't follow real geography.
- Spreadsheet/static image: can't animate wheel or handle clicks.

## Calls I made (user can change)
Arrow targeting rule, winner-takes-all + elimination, starting strength values, ESPN logos, localStorage save.
