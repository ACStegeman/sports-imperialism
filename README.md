# Sports Imperialism

A map game where NFL, MLB, NBA, NHL or college football teams conquer each other's territory. Spin the wheel to pick an attacker, spin the arrow to pick a direction, and battle. The last team standing rules the map.

**Play:** https://acstegeman.github.io/sports-imperialism/

- Leagues: NFL, MLB, NBA, NHL, and college football (Big Ten, Big 12, ACC, SEC)
- Maps: USA, North America (for leagues with Canadian teams), or the whole world
- Battle modes: pick the winner, 50/50, or weighted by team strength, with a simulated game for each sport
- Options: power-ups, capitals, rebellions, sound, auto-play, replay, and a record book

## How it's built

Plain HTML, CSS and JavaScript with [d3](https://d3js.org) for the map. `teams.js` holds the league data, `game.js` the game rules (tested with `node --test test/game.test.mjs`), and `app.js` the page. `node build.mjs` combines them into `dist/index.html`. Pushing to `main` builds and deploys the site with GitHub Actions.

Map data: [us-atlas](https://github.com/topojson/us-atlas), [world-atlas](https://github.com/topojson/world-atlas) and [Natural Earth](https://www.naturalearthdata.com). Team names and logos belong to their teams and leagues; this is an unofficial fan project.
