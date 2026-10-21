# Neon Merge

An original merge-number puzzle for Versus Gamers. You slide glowing energy cells on a 4×4 grid, fuse equal values and chain combos. There are two modes: Classic and Daily Challenge.

- **Files:** `index.html`, `game.js`, `style.css`, and an optional `assets/bg.webp` background, shown darkened when present. Vanilla JS with no dependencies and no network requests. All URLs are relative, so the folder works from any path or as a zip.
- **Language:** `?lang=fr` or `?lang=en`, otherwise the saved choice, otherwise `navigator.language` (`fr*` gives French). There is an FR/EN toggle in-game. All text lives in `STRINGS` in `game.js`.
- **Controls:** swipe or mouse-drag on the board, arrows or WASD to move, U undo, P or Esc pause, M sound.
- **Rules:** a combo of 2 or more fusions in one move adds 25% of that move's fusion points for each extra pair. You start with 1 undo, which takes back one step. You earn another every 5 fusions, up to 3. Banners mark 512, 1024 and 2048, and reaching 2048 offers "Keep going".
- **Daily Challenge:** the seed is a hash of the America/Toronto date. Spawns come from a seeded mulberry32 PRNG stored in the save, so everyone gets the same start and the same spawn sequence that day.
- **Storage:** everything is under `vg.neon-merge.*`: `save.classic`, `save.daily`, `mode`, `resume`, `best`, `daily-best` and `settings`. Every access is wrapped in try/catch, and the game runs without storage.
- **Code layout:** `game.js` starts with a pure, DOM-free core (`slideLine`, `move`, `applyMove`, `applyUndo`, `spawnTile`, `newGame`…). It is exported via `module.exports` when one is present and exposed as `window.NeonMergeCore` in the browser.
