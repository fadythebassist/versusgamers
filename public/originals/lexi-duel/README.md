# Lexi Duel

A bilingual (French/English) five-letter word-guessing game, made as a Versus Gamers original (versusgamers.com).

- **Daily / Quotidien**: one word per day per language, the same for everyone. The word changes at midnight America/Toronto time and is picked deterministically from the date and a fixed seed. The game tracks a daily streak.
- **Endless / Infini**: a new random word after each round. A solve scores 350 points on the first try, down to 100 on the sixth. A miss ends the run. The game tracks your best score and current streak.
- Tile states are shown by colour *and* shape: a solid cyan square means right spot, a magenta ring means wrong spot, a dim flat slate tile means not in the word.

## Run it

It's plain HTML/CSS/JS with no build step and no dependencies. The word lists are loaded with `fetch()`, so serve the folder over HTTP rather than opening `index.html` from disk:

```sh
python3 -m http.server 8000      # from this folder (or any parent)
# then open http://localhost:8000/index.html  (add ?lang=fr or ?lang=en)
```

All URLs are relative, so the folder works from any path and can be zipped as-is for other portals.

**Language:** taken from `?lang=fr|en`, then the player's last choice, then `navigator.language` (fr* gives French), then English.

**Keys:** letters, Enter, Backspace. Esc pauses. P and M (pause, mute) work whenever letters aren't being typed into the board: on the title screen, while paused, and after a round ends. During a round every letter key types a letter.

**Storage:** everything is saved in `localStorage` under keys starting with `vg.lexi-duel.`: settings, stats and streaks per mode and language, the daily board and the endless run. If storage is blocked, the game still plays; progress just isn't kept.

**Optional background:** drop an image at `assets/bg.webp` and it's shown darkened behind the board. Without it, the game uses a CSS background. The 404 check for the missing file is the only extra request the game makes.

## Word lists

| File | What | Source |
|---|---|---|
| `words/en-answers.txt` | 432 everyday English answers | written for this game |
| `words/fr-answers.txt` | 421 everyday French answers, stored with accents for display | written for this game |
| `words/en-valid.txt` | 12,653 accepted English guesses | `an-array-of-english-words` 2.0.0 (MIT), from the Letterpress list (CC0) |
| `words/fr-valid.txt` | 5,891 accepted French guesses, without accents | `an-array-of-french-words` 2.0.0 (MIT), from the Letterpress list (CC0) |

French guesses are typed and matched without accents (É = E, Ç = C). Words with œ/æ, or that don't normalize to exactly five A–Z letters, are excluded. Every answer is checked against its language's valid list. Changing an answer list changes the daily order, so edit it only between seasons. Full license texts are in [LICENSES.md](LICENSES.md).
