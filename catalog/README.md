# Launch catalog

`launch-lineup.json` is the approved list of embedded games for the Versus Gamers launch: 140 Playgama games across 8 categories.

- Source: Fodz's Playgama Partners catalog export (2,551 games), filtered to remove kids' games, brand knock-offs, casino, horror and crime games, then shortlisted by Playgama's popularity ranking with French-language games ranked higher.
- Approved by Fodz on 2026-10-20. He removed three borderline games (listed in `removedByFodz`) and added three arrow puzzles.
- `Arrow Puzzle` was added by hand and isn't in the export, so its title, description, images and orientation still need filling in from its Playgama page.
- Every game embeds through `https://playgama.com/export/game/<slug>?clid=<clid>`; the CLID is in the file.
- The `description` and `howToPlay` fields are Playgama's own text. Use them as reference only; the site needs original French and English descriptions.
