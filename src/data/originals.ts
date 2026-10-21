// Versus Gamers originals. Each game lives in public/originals/<slug>/ as a self-contained HTML5 game.
import type { Lang } from '../i18n/ui';

export interface Original {
  slug: string;
  title: string;
  category: 'word' | 'puzzle' | 'arcade';
  glyph: string; // fallback cover art
  shape: 'glyph' | 'grid' | 'bolt';
  cover?: string; // Higgsfield cover in /images/originals/
  orientation: 'both' | 'landscape' | 'portrait';
  text: Record<Lang, { tag: string; summary: string; description: string; howToPlay: string }>;
}

export const ORIGINALS: Original[] = [
  {
    slug: 'lexi-duel',
    title: 'Lexi Duel',
    category: 'word',
    glyph: 'Aa',
    shape: 'glyph',
    cover: '/images/originals/lexi-duel.webp',
    orientation: 'both',
    text: {
      en: {
        tag: 'Word · FR/EN',
        summary: 'Crack a hidden five-letter word in six tries, in English or French.',
        description: "Lexi Duel is our bilingual word game. Each guess tells you which letters sit in the right spot and which belong elsewhere. Play the daily word, the same for everyone, or chain words in Endless mode for a high score. Switch between English and French whenever you like; each language has its own words and its own streak.",
        howToPlay: 'Type a five-letter word and press Enter, or use the on-screen keyboard. Solid tiles are in the right spot, outlined tiles are in the word but elsewhere, and dim tiles are not in the word.',
      },
      fr: {
        tag: 'Mots · FR/EN',
        summary: 'Trouve un mot caché de cinq lettres en six essais, en français ou en anglais.',
        description: "Lexi Duel est notre jeu de mots bilingue. Chaque essai t'indique les lettres bien placées et celles qui se trouvent ailleurs dans le mot. Joue le mot du jour, le même pour tout le monde, ou enchaîne les mots en mode Infini pour battre ton record. Passe du français à l'anglais quand tu veux : chaque langue a ses propres mots et sa propre série.",
        howToPlay: "Tape un mot de cinq lettres et appuie sur Entrée, ou utilise le clavier à l'écran. Les cases pleines sont bien placées, les cases contour sont dans le mot mais ailleurs, et les cases pâles ne sont pas dans le mot.",
      },
    },
  },
  {
    slug: 'neon-merge',
    title: 'Neon Merge',
    category: 'puzzle',
    glyph: '2048',
    shape: 'grid',
    cover: '/images/originals/neon-merge.webp',
    orientation: 'both',
    text: {
      en: {
        tag: 'Puzzle',
        summary: 'Slide glowing energy cells together and merge them toward 2048 and beyond.',
        description: 'Neon Merge is our take on the number-merging puzzle. Every swipe moves all the cells at once; matching values fuse into one and light up brighter. Chain several merges in one move to fill the combo meter, save an undo for the tight spots, and take on the Daily Challenge, where everyone gets the same starting board.',
        howToPlay: 'Swipe, drag, or use the arrow keys or WASD to slide every cell. Two cells with the same number merge when they touch. The game ends when no move is left.',
      },
      fr: {
        tag: 'Casse-tête',
        summary: "Fais glisser des cellules d'énergie lumineuses et fusionne-les jusqu'à 2048 et plus.",
        description: "Neon Merge est notre version du casse-tête où l'on fusionne des nombres. Chaque glissement déplace toutes les cellules d'un coup; deux valeurs identiques fusionnent et brillent plus fort. Enchaîne plusieurs fusions en un coup pour remplir la jauge de combo, garde une annulation pour les moments serrés et relève le Défi du jour, où tout le monde part de la même grille.",
        howToPlay: "Glisse le doigt, fais glisser avec la souris ou utilise les flèches ou WASD pour déplacer toutes les cellules. Deux cellules au même nombre fusionnent quand elles se touchent. La partie se termine quand aucun coup n'est possible.",
      },
    },
  },
  {
    slug: 'rift-runner',
    title: 'Rift Runner',
    category: 'arcade',
    glyph: '>>',
    shape: 'bolt',
    cover: '/images/originals/rift-runner.webp',
    orientation: 'both',
    text: {
      en: {
        tag: 'Arcade · Level up',
        summary: 'Race through an energy rift, dodge hazards and level up your craft between runs.',
        description: 'Rift Runner is a fast arcade run through a neon corridor that keeps speeding up. Weave past walls, mines and lasers, grab shards and power-ups, and dash through tight spots. Every run earns XP: level up your pilot and spend shards in the Hangar on longer shields, a stronger magnet and new trails.',
        howToPlay: 'Steer with the arrow keys or A and D, or drag on the screen. Dash with Space or a second tap to slip through hazards. One hit without a shield ends the run.',
      },
      fr: {
        tag: 'Arcade · Progression',
        summary: "Fonce dans une faille d'énergie, évite les obstacles et améliore ton vaisseau entre les courses.",
        description: "Rift Runner est une course d'arcade dans un couloir néon qui accélère sans cesse. Faufile-toi entre les murs, les mines et les lasers, ramasse des éclats et des bonus, et utilise ton élan pour passer les endroits serrés. Chaque course rapporte de l'expérience : fais monter ton pilote de niveau et dépense tes éclats au Hangar pour un bouclier plus durable, un aimant plus puissant et de nouvelles traînées.",
        howToPlay: "Dirige avec les flèches ou A et D, ou glisse le doigt sur l'écran. Fais un élan avec la barre d'espace ou un deuxième toucher pour traverser les obstacles. Un impact sans bouclier met fin à la course.",
      },
    },
  },
];

export const originalBySlug = (slug: string) => ORIGINALS.find((o) => o.slug === slug);
