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
2. Spin arrow from the team's logo (middle of its biggest territory). The target is the first land the arrow's line reaches outside the team's own land. Crossing water only reaches land the team already borders by land (Packers→Lions yes, Bears→Lions no). Open water / nothing → automatic respin.
3. Blank target → team takes it, no battle. Owned target → battle.
4. In 50/50 and Weighted, Fight! plays an ~8-second simulated game (scoreboard, clock, field, plays; skippable) whose score matches the already-decided winner. Battle modes (switchable): Pick winner (buttons), 50/50, Weighted (strength 1–10 per team, editable, odds = a/(a+b)).
5. Winner takes all of loser's territory; loser leaves the wheel; winner's strength grows by a tenth of the loser's strength (max 10, one decimal). Claiming empty land gives no strength.
6. Empty pockets bordered by only one team go to that team automatically (pockets touching any other team stay empty).
7. Last team standing → the champion's color spreads over the remaining land one state at a time (nearest first), confetti in team colors, then a banner offers Reset map (no popup).
8. Upset: in Weighted mode, a winner with under 35% odds gets an UPSET! banner over the map, a map shake, and a marked play-by-play line.

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

## Added 2026-11-25 (round 4)
- Home field: the defender is always home; +5 points to the home team in Weighted mode (50/50 stays even). Battle card and game scoreboard show Away @ Home.
- Sound (option, off by default), all made with Web Audio (no files): crowd murmur under every game; kickoff whistle + crowd rise; touchdown = big layered roar with cheering voices + air horn; field goal = smaller cheer + clapping; final = air horn + crowd; upset = huge roar + organ "Charge!" + air horn; rebellion = war drums + roar; champion = Charge! + longest roar + three air horns + clapping.
- Capitals (option): each team's home region has a star. A battle wins only the land fought over (target if the attacker wins; the attacker's touching region if the defender wins). Taking a capital takes everything.
- Rebellions (option): at each Next turn, 8% chance a knocked-out team retakes its home region and rejoins the wheel.
- Replay: every move is saved as a snapshot; a slider and Play button replay the map; Back to game returns.
- Record book: biggest upset, most wins, longest win streak, most states taken in one win (the champion's final map fill doesn't count). Shown in the sidebar and on the champion banner.
- Auto-play (50/50 and Weighted): plays turns by itself at 1x-8x; stops at a champion.
- Real records (option in Team strength): type W-L; strength = 1 + 9 x win %.
- Game sim scoring: each game gets a pace (defensive ~22%, normal ~53%, shootout ~25%); ties after Q4 go to overtime. Average about 52 combined points; combined score never over 100 (a game that would go over is replayed).
- Game screen: TV-style field (yard numbers, hashes, goal posts, end-zone names), drives play by play with a blue line of scrimmage and yellow first-down line, possession marker, win-probability bar, TOUCHDOWN!/IT'S GOOD!/SAFETY! flashes with field goals arcing through the posts, non-scoring drives (punts, interceptions, fumbles, turnovers on downs), winner kneels out the clock, and a quarter-by-quarter box score at the final.
- After two arrow misses in a row, the next spin is aimed only at directions that reach land. The champion screen hides the arrow and aim line.

## Added 2026-11-25 (round 5)
- Map switch (Options): USA or World. Switching starts a new game. World = every country but Antarctica (Natural Earth 1:110m); each team gets a random country with room for its logo; all others start empty.
- World water rule: the arrow crosses oceans to the first land it reaches (islands like the UK, Japan and Australia would otherwise be stuck). Surrounded-land rule ignores pockets that touch the sea.
- Power-ups (option, on by default): one token of each of the 8 power-ups on empty land at the start (both maps), placed next to teams first; claim the land to grab one. Each exists once per game: no respawns, gone once used, and gone if its holder is knocked out. Used automatically. Hail Mary (+20% next battle), Blitz (extra turn now), Bye Week (blocks next attack), Draft Pick (+1.5 strength now), Onside Kick (steal a neighboring region now; never a team's last region or, with capitals, a capital), Challenge Flag (lost battle replayed once), Franchise Tag (knocked out: keep home land once), Home Crowd (+15% next home defense). Power-ups held panel + legend.
- Zoom: + / − / fit buttons, mouse-wheel zoom, drag to pan, pinch on touch (both maps). World map frame is trimmed to the land. When zoomed in, the view slides to the team the wheel picks.
- Layout (broadcast): header with Settings button; Settings panel (map, reset, options, hand land, team strength) opens above the map; full-width map capped to leave room for the control bar; control bar = wheel | turn status + matchup | battle mode, action buttons, auto-play; panels row below (empires, play-by-play, record book, power-ups, replay). Stacks to one column on phones.

## Added 2026-11-25 (round 6): leagues
- League picker in the header: NFL, MLB, NBA, NHL, College Football (Big Ten 18, Big 12 16, ACC 17, SEC 16 = 67 schools; Notre Dame is independent in football). Switching mid-game asks first, then starts a new game. Title reads "<League> Imperialism".
- Maps: NFL and college use the USA map. MLB, NBA and NHL (they have Canadian teams) use a North America map: lower 48 + DC + Canada's 10 provinces (territories left out), from Natural Earth 1:50m admin-1. World map works for every league.
- Crowded states are split by nudged team locations (Voronoi), e.g. CA: A's/Giants/Dodgers/Angels/Padres; TX college: 7 ways. DC goes with the league's Washington/Maryland team.
- Game sims per sport: football (existing), baseball (innings, extra innings, home runs), hockey (periods, OT or shootout), basketball (quarters, ~110 points, OT). Each has its own field/rink/court, scoreboard, flashes and box score.
- Power-up names per league (same 8 effects): NFL Hail Mary/Blitz/Bye Week/Draft Pick/Onside Kick/Challenge Flag/Franchise Tag/Home Crowd; College swaps in Transfer Portal, Booth Review, Redshirt, Student Section; MLB Rally Cap/Doubleheader/Rainout/Deadline Deal/Stolen Base/Manager's Challenge/Extra Innings/Packed Ballpark; NBA Buzzer Beater/Fast Break/Load Management/Lottery Pick/Steal/Coach's Challenge/Final Timeout/Sixth Man; NHL Power Play/Odd-Man Rush/Hot Goalie/Top Prospect/Takeaway/Coach's Challenge/Overtime/Home Ice.
