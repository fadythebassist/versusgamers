# Rift Runner

An original neon arcade runner for Versus Gamers. Pilot a craft down an energy rift, dodge walls, sliding barriers, pulsing mines and lasers, collect shards, and level your pilot from 1 to 30 to unlock upgrades and craft cosmetics in the Hangar.

## Running it
Open `index.html` from any web server, or straight from disk. It's self-contained: vanilla JS and Canvas 2D, no frameworks, no CDN, no fonts, no audio or image files. Every URL is relative, so you can zip the folder and host it anywhere.

- `?lang=fr` or `?lang=en` forces the language. Without it, the game uses the language saved from the in-game FR/EN toggle, then `navigator.language` (fr* gives French), then English.
- Optional backdrop: if you put an `assets/bg.webp` next to `index.html`, the game uses it as a dark, slow parallax background. Without it, the game draws its own.
- `?test=1` exposes `window.RiftRunnerTest`, a hook for automated tests (god mode and autopilot). Leave it out in production.

## Controls
- Keyboard: ← → or A / D to steer, Space or Shift to Dash, P or Esc to pause, M for sound.
- Mouse: move to steer, click to Dash.
- Touch: drag anywhere to steer (relative drag). Tap the Dash button, or tap with a second finger, to Dash.

The game pauses itself when the tab is hidden or the iframe loses focus.

## Files
| File | Role |
| --- | --- |
| `index.html`, `style.css` | Screens (title, hangar, results, pause) and HUD |
| `game.js` | Boot, fixed-timestep loop, input, UI, saving |
| `js/physics.js` | Pure collision tests, tuning curves, seeded RNG |
| `js/progression.js` | Pure XP, levels, upgrades, cosmetics, save (de)serialisation |
| `js/world.js` | Run simulation: pooled entities, fair spawner, lasers |
| `js/render.js` | Procedural drawing: perspective rift, hazards, craft, particles |
| `js/audio.js` | Web Audio sound effects and a toggleable synth music loop |
| `js/strings.js` | Every UI string, in English and in Quebec French (vous) |

## Saving
Progress lives in `localStorage` under keys that start with `vg.rift-runner.`: `xp`, `level`, `shards`, `upgrades`, `cosmetics`, `best`, `runs`, and `settings` (sound, music, language). Every read and write is wrapped in `try`/`catch`, so the game still plays when storage is blocked. In that case progress only lasts for the session, and the title screen says so.
