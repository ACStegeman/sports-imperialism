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
2. Spin arrow from the team's logo (middle of its biggest territory). The target is the first land the arrow's line reaches outside the team's own land. Crossing water only reaches land the team already borders by land (Packers→Lions yes, Bears→Lions no). Open water / nothing → respin.
3. Blank target → team takes it, no battle. Owned target → battle.
4. In 50/50 and Weighted, Fight! plays an ~8-second simulated game (scoreboard, clock, field, plays; skippable) whose score matches the already-decided winner. Battle modes (switchable): Pick winner (buttons), 50/50, Weighted (strength 1–10 per team, editable, odds = a/(a+b)).
5. Winner takes all of loser's territory; loser leaves the wheel; winner's strength grows by a tenth of the loser's strength (max 10, one decimal). Claiming empty land gives no strength.
6. Empty pockets bordered by only one team go to that team automatically (pockets touching any other team stay empty).
7. Last team standing → whole map fills with the champion; a banner offers Reset map (no popup).

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
