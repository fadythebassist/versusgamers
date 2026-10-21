import gamesData from '../data/games.json';
import { CATEGORIES, path, t, type Lang, type CategoryKey } from '../i18n/ui';
import { ORIGINALS, type Original } from '../data/originals';
import { embedUrl } from '../config/site';

export interface GameText { summary: string; description: string; howToPlay: string }
export interface Game {
  slug: string;
  title: string;
  source: 'playgama';
  sourceId: string | null;
  category: CategoryKey;
  genres: string[];
  rank: number | null;
  french: boolean;
  orientation: 'landscape' | 'portrait' | 'both' | null;
  image: string;
  icon: string;
  en: GameText;
  fr: GameText;
}

export const GAMES = (gamesData as { games: Game[] }).games;
export const gameBySlug = (slug: string) => GAMES.find((g) => g.slug === slug);
export const gamesIn = (cat: string) => GAMES.filter((g) => g.category === cat).sort(byRank);
export const byRank = (a: Game, b: Game) => (a.rank ?? 1e9) - (b.rank ?? 1e9);
export const popular = (n: number) => [...GAMES].sort(byRank).slice(0, n);
export const embedFor = (g: Game) => embedUrl(g.slug);
export const catName = (lang: Lang, key: string) => CATEGORIES.find((c) => c.key === key)?.name[lang] ?? key;

export function related(g: Game, n = 6) {
  const same = gamesIn(g.category).filter((x) => x.slug !== g.slug);
  // Prefer games sharing genres, then by popularity.
  const score = (x: Game) => x.genres.filter((y) => g.genres.includes(y)).length;
  return same.sort((a, b) => score(b) - score(a) || byRank(a, b)).slice(0, n);
}

/** Compact index used by search, favorites and recently played (client-side). */
export function clientIndex(lang: Lang) {
  const s = t(lang);
  const games = [...GAMES].sort(byRank).map((g) => ({
    id: `g:${g.slug}`,
    title: g.title,
    url: path.game(lang, g.slug),
    img: g.image,
    cat: catName(lang, g.category),
    sum: g[lang].summary,
  }));
  const originals = ORIGINALS.map((o: Original, i) => ({
    id: `o:${o.slug}`,
    title: o.title,
    url: path.original(lang, o.slug),
    img: o.cover,
    cat: `${s.originalBadge} · ${o.text[lang].tag}`,
    sum: o.text[lang].summary,
    glyph: o.glyph,
    bg: `var(--orig${i + 1}-bg)`,
    fg: `var(--orig${i + 1}-fg)`,
  }));
  return [...originals, ...games];
}
