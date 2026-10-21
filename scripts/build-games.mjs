// Builds src/data/games.json (what the site renders) from:
//   catalog/launch-lineup.json  — the 140 games Fodz approved (Playgama data)
//   catalog/descriptions.json   — original EN/FR summary, description and how-to-play per game
// Run: node scripts/build-games.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const lineup = JSON.parse(readFileSync('catalog/launch-lineup.json', 'utf8'));
const desc = JSON.parse(readFileSync('catalog/descriptions.json', 'utf8'));

// Details filled in by hand for games that aren't in the Playgama export.
const MANUAL = {
  'arrow-puzzle': {
    image: 'https://static.playgama.com/p-img/pg/arrow-puzzle/big-preview/6f9c8fc74f8a4dd39e6700bc24fce9ce?width=448',
    icon: 'https://static.playgama.com/p-img/pg/backfill/game-121000/icon/4f8ebbfc53d93ac32cf60e878aa87d2133fe186f0323c1a042500901f5ba6a4a?width=218',
    genres: ['puzzle', 'logic', 'brain'],
    orientation: 'portrait',
  },
};

const problems = [];
const games = lineup.games.map((g) => {
  const d = desc[g.slug];
  if (!d) problems.push(`missing description: ${g.slug}`);
  const m = MANUAL[g.slug] || {};
  const images = g.images || [];
  return {
    slug: g.slug,
    title: g.title.trim(),
    source: 'playgama',
    sourceId: g.id,
    category: g.category,
    genres: m.genres || g.genres || [],
    rank: g.playgamaRank,
    french: Boolean(g.french),
    orientation: m.orientation || g.orientation || null,
    image: m.image || images[0] || '',
    icon: m.icon || images[1] || images[0] || '',
    en: d?.en ?? { summary: '', description: '', howToPlay: '' },
    fr: d?.fr ?? { summary: '', description: '', howToPlay: '' },
  };
});

for (const g of games) {
  if (!g.image) problems.push(`missing image: ${g.slug}`);
  for (const l of ['en', 'fr']) for (const k of ['summary', 'description', 'howToPlay']) if (!g[l][k]) problems.push(`missing ${l}.${k}: ${g.slug}`);
}
const slugs = new Set();
for (const g of games) { if (slugs.has(g.slug)) problems.push(`duplicate slug: ${g.slug}`); slugs.add(g.slug); }

writeFileSync('src/data/games.json', JSON.stringify({ generatedFrom: 'catalog/launch-lineup.json + catalog/descriptions.json', count: games.length, games }, null, 1) + '\n');
console.log(`games.json: ${games.length} games`);
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
