/*!
 * Neon Merge — a Versus Gamers original.
 * Vanilla JS, no dependencies, no network requests (except the optional
 * same-folder background image assets/bg.webp).
 *
 * The file has two parts:
 *   1. Core: pure, DOM-free game logic (exported for Node tests).
 *   2. UI:   rendering, input, sound, storage, i18n (browser only).
 */
(function (global) {
  'use strict';

  /* ===================================================================== *
   * 1. CORE — pure functions, no side effects
   * ===================================================================== */
  var Core = (function () {
    var SIZE = 4;
    var UNDO_START = 1;      // undos at the start of a game
    var UNDO_EVERY = 5;      // one undo earned every N merges
    var UNDO_MAX = 3;        // undo bank cap
    var COMBO_RATE = 0.25;   // bonus = 25% of merge points per extra pair
    var FOUR_CHANCE = 0.1;   // spawn a 4 instead of a 2
    var MILESTONE_MIN = 512; // first celebrated tile
    var WIN_TILE = 2048;
    var DIRS = ['left', 'right', 'up', 'down'];

    function emptyGrid() {
      var g = [];
      for (var r = 0; r < SIZE; r++) g.push(new Array(SIZE).fill(0));
      return g;
    }

    function cloneGrid(g) {
      return g.map(function (row) { return row.slice(); });
    }

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    /**
     * Slide one line toward index 0 and merge equal neighbours.
     * Each tile merges at most once per move.
     * Returns { line, dest, merged, gained, merges }:
     *   dest[i]   = index where source tile i ends up (-1 if empty)
     *   merged[j] = true if output cell j is the product of a merge
     */
    function slideLine(line) {
      var n = line.length;
      var out = new Array(n).fill(0);
      var dest = new Array(n).fill(-1);
      var merged = new Array(n).fill(false);
      var last = -1, gained = 0, merges = 0;
      for (var i = 0; i < n; i++) {
        var v = line[i];
        if (!v) continue;
        if (last >= 0 && out[last] === v && !merged[last]) {
          out[last] = v * 2;
          merged[last] = true;
          dest[i] = last;
          gained += v * 2;
          merges++;
        } else {
          last++;
          out[last] = v;
          dest[i] = last;
        }
      }
      return { line: out, dest: dest, merged: merged, gained: gained, merges: merges };
    }

    /** Coordinates of line i, ordered from the side tiles slide toward. */
    function lineCoords(dir, i) {
      var out = [];
      for (var k = 0; k < SIZE; k++) {
        if (dir === 'left') out.push([i, k]);
        else if (dir === 'right') out.push([i, SIZE - 1 - k]);
        else if (dir === 'up') out.push([k, i]);
        else out.push([SIZE - 1 - k, i]);
      }
      return out;
    }

    /**
     * Apply a slide to a whole grid (no spawn).
     * Returns { grid, moved, gained, merges, transitions, mergedCells, mergedValues }.
     */
    function move(grid, dir) {
      if (DIRS.indexOf(dir) < 0) throw new Error('bad direction: ' + dir);
      var g = emptyGrid();
      var moved = false, gained = 0, merges = 0;
      var transitions = [], mergedCells = [], mergedValues = [];
      for (var i = 0; i < SIZE; i++) {
        var coords = lineCoords(dir, i);
        var line = coords.map(function (rc) { return grid[rc[0]][rc[1]]; });
        var res = slideLine(line);
        for (var k = 0; k < SIZE; k++) {
          var rc = coords[k];
          g[rc[0]][rc[1]] = res.line[k];
          if (res.line[k] !== line[k]) moved = true;
          if (res.dest[k] >= 0) {
            transitions.push({ from: coords[k], to: coords[res.dest[k]], value: line[k], merged: res.merged[res.dest[k]] });
          }
          if (res.merged[k]) {
            mergedCells.push({ at: coords[k], value: res.line[k] });
            mergedValues.push(res.line[k]);
          }
        }
        gained += res.gained;
        merges += res.merges;
      }
      return { grid: g, moved: moved, gained: gained, merges: merges, transitions: transitions, mergedCells: mergedCells, mergedValues: mergedValues };
    }

    /* ---- Seeded PRNG (mulberry32), state is a single uint32 ---- */
    function rngNext(state) {
      var t = (state + 0x6D2B79F5) >>> 0;
      var r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return { value: ((r ^ (r >>> 14)) >>> 0) / 4294967296, state: t };
    }

    function hashString(str) {
      var h = 0x811c9dc5;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      return h >>> 0;
    }

    function randomSeed() {
      try {
        var c = (typeof crypto !== 'undefined') ? crypto : null;
        if (c && c.getRandomValues) {
          var a = new Uint32Array(1);
          c.getRandomValues(a);
          return a[0] >>> 0;
        }
      } catch (e) { /* fall through */ }
      return (Math.random() * 4294967296) >>> 0;
    }

    /** Calendar date (YYYY-MM-DD) in America/Toronto for a given instant. */
    function torontoDate(d) {
      d = d || new Date();
      try {
        var parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(d);
        var get = function (type) {
          for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
          return '';
        };
        var s = get('year') + '-' + get('month') + '-' + get('day');
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      } catch (e) { /* no tz support: approximate below */ }
      // Fallback: Eastern Time with a simple DST rule (2nd Sun Mar → 1st Sun Nov).
      var y = d.getUTCFullYear();
      var marSun = 8 + (7 - new Date(Date.UTC(y, 2, 1)).getUTCDay()) % 7;  // 2nd Sunday of March
      var novSun = 1 + (7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7; // 1st Sunday of November
      var dstStart = Date.UTC(y, 2, marSun, 7);  // 2:00 EST = 07:00 UTC
      var dstEnd = Date.UTC(y, 10, novSun, 6);   // 2:00 EDT = 06:00 UTC
      var off = (d.getTime() >= dstStart && d.getTime() < dstEnd) ? 4 : 5;
      return new Date(d.getTime() - off * 3600e3).toISOString().slice(0, 10);
    }

    function dailySeed(dateStr) { return hashString('vg.neon-merge.daily:' + dateStr); }

    /** Spawn a 2 (90%) or 4 (10%) in a random empty cell. Always draws 2 numbers. */
    function spawnTile(grid, rng) {
      var empties = [];
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (!grid[r][c]) empties.push([r, c]);
      if (!empties.length) return { grid: grid, rng: rng >>> 0, cell: null, value: 0 };
      var a = rngNext(rng >>> 0);
      var b = rngNext(a.state);
      var value = a.value < FOUR_CHANCE ? 4 : 2;
      var cell = empties[Math.floor(b.value * empties.length)];
      var g = cloneGrid(grid);
      g[cell[0]][cell[1]] = value;
      return { grid: g, rng: b.state, cell: cell, value: value };
    }

    function maxTile(grid) {
      var m = 0;
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (grid[r][c] > m) m = grid[r][c];
      return m;
    }

    function countTiles(grid) {
      var n = 0;
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (grid[r][c]) n++;
      return n;
    }

    function canMove(grid) {
      for (var r = 0; r < SIZE; r++) {
        for (var c = 0; c < SIZE; c++) {
          var v = grid[r][c];
          if (!v) return true;
          if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
          if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
        }
      }
      return false;
    }

    /** Combo bonus: 2+ merges in one move → +25% of the move's merge points per extra pair. */
    function comboBonus(gained, merges) {
      return merges >= 2 ? Math.round(gained * COMBO_RATE * (merges - 1)) : 0;
    }

    function milestonesUpTo(maxV) {
      var out = [];
      for (var v = MILESTONE_MIN; v <= maxV; v *= 2) out.push(v);
      return out;
    }

    function newGame(mode, seed, date) {
      var grid = emptyGrid();
      var rng = seed >>> 0;
      for (var k = 0; k < 2; k++) {
        var s = spawnTile(grid, rng);
        grid = s.grid; rng = s.rng;
      }
      return {
        v: 1,
        mode: mode === 'daily' ? 'daily' : 'classic',
        date: mode === 'daily' ? (date || null) : null,
        seed: seed >>> 0,
        grid: grid,
        score: 0,
        undos: UNDO_START,
        mergeProgress: 0,
        rng: rng,
        milestones: [],
        keepGoing: false,
        over: false,
        moves: 0,
        merges: 0,
        maxTile: maxTile(grid),
        bestAtStart: 0,
        prev: null
      };
    }

    /**
     * Full game step: slide, score (+combo bonus), spawn, undo refill, milestones.
     * If nothing moves the state is returned untouched (no spawn, rng unchanged).
     */
    function applyMove(state, dir) {
      if (state.over) return { state: state, moved: false };
      var m = move(state.grid, dir);
      if (!m.moved) return { state: state, moved: false, move: m };
      var bonus = comboBonus(m.gained, m.merges);
      var sp = spawnTile(m.grid, state.rng);
      var progress = state.mergeProgress + m.merges;
      var undos = Math.min(UNDO_MAX, state.undos + Math.floor(progress / UNDO_EVERY));
      var earned = undos - state.undos;
      var mt = maxTile(sp.grid);
      var reached = milestonesUpTo(mt).filter(function (v) { return state.milestones.indexOf(v) < 0; });
      var next = Object.assign({}, state, {
        grid: sp.grid,
        score: state.score + m.gained + bonus,
        undos: undos,
        mergeProgress: progress % UNDO_EVERY,
        rng: sp.rng,
        milestones: state.milestones.concat(reached),
        moves: state.moves + 1,
        merges: (state.merges || 0) + m.merges,
        maxTile: mt,
        prev: {
          grid: state.grid, score: state.score, mergeProgress: state.mergeProgress, rng: state.rng,
          milestones: state.milestones, moves: state.moves, merges: state.merges || 0,
          maxTile: state.maxTile, earned: earned
        }
      });
      next.over = !canMove(next.grid);
      return {
        state: next, moved: true, move: m, bonus: bonus,
        spawn: { cell: sp.cell, value: sp.value },
        newMilestones: reached, earned: earned
      };
    }

    /** Undo one step. Costs one undo; an undo earned by the undone move is taken back too. */
    function applyUndo(state) {
      var p = state.prev;
      if (!p || state.undos < 1) return { state: state, undone: false };
      var next = Object.assign({}, state, {
        grid: cloneGrid(p.grid), score: p.score, mergeProgress: p.mergeProgress, rng: p.rng,
        milestones: p.milestones.slice(), moves: p.moves, merges: p.merges, maxTile: p.maxTile,
        undos: Math.max(0, state.undos - 1 - (p.earned || 0)),
        over: false, prev: null
      });
      next.over = !canMove(next.grid);
      return { state: next, undone: true };
    }

    function validGrid(g) {
      if (!Array.isArray(g) || g.length !== SIZE) return false;
      for (var r = 0; r < SIZE; r++) {
        if (!Array.isArray(g[r]) || g[r].length !== SIZE) return false;
        for (var c = 0; c < SIZE; c++) {
          var v = g[r][c];
          if (typeof v !== 'number' || !isFinite(v)) return false;
          if (v !== 0 && (v < 2 || v > 1073741824 || (v & (v - 1)) !== 0)) return false;
        }
      }
      return true;
    }

    /** Sanitize a saved state. Returns null if unusable (or wrong mode / stale daily). */
    function normalizeState(s, opts) {
      opts = opts || {};
      if (!s || typeof s !== 'object' || !validGrid(s.grid)) return null;
      var mode = s.mode === 'daily' ? 'daily' : 'classic';
      if (opts.mode && opts.mode !== mode) return null;
      if (mode === 'daily' && opts.date && s.date !== opts.date) return null;
      if (countTiles(s.grid) === 0) return null;
      var num = function (x, d) { return (typeof x === 'number' && isFinite(x)) ? x : d; };
      var nums = function (a) { return Array.isArray(a) ? a.filter(function (v) { return typeof v === 'number'; }) : []; };
      var out = {
        v: 1, mode: mode,
        date: mode === 'daily' ? String(s.date || '') : null,
        seed: num(s.seed, 0) >>> 0,
        grid: cloneGrid(s.grid),
        score: Math.max(0, Math.floor(num(s.score, 0))),
        undos: clamp(Math.floor(num(s.undos, UNDO_START)), 0, UNDO_MAX),
        mergeProgress: clamp(Math.floor(num(s.mergeProgress, 0)), 0, UNDO_EVERY - 1),
        rng: num(s.rng, 0) >>> 0,
        milestones: nums(s.milestones),
        keepGoing: !!s.keepGoing,
        over: false,
        moves: Math.max(0, Math.floor(num(s.moves, 0))),
        merges: Math.max(0, Math.floor(num(s.merges, 0))),
        maxTile: maxTile(s.grid),
        bestAtStart: Math.max(0, num(s.bestAtStart, 0)),
        prev: null
      };
      out.over = !canMove(out.grid);
      var p = s.prev;
      if (p && typeof p === 'object' && validGrid(p.grid)) {
        out.prev = {
          grid: cloneGrid(p.grid),
          score: Math.max(0, Math.floor(num(p.score, 0))),
          mergeProgress: clamp(Math.floor(num(p.mergeProgress, 0)), 0, UNDO_EVERY - 1),
          rng: num(p.rng, 0) >>> 0,
          milestones: nums(p.milestones),
          moves: Math.max(0, Math.floor(num(p.moves, 0))),
          merges: Math.max(0, Math.floor(num(p.merges, 0))),
          maxTile: maxTile(p.grid),
          earned: clamp(Math.floor(num(p.earned, 0)), 0, UNDO_MAX)
        };
      }
      return out;
    }

    return {
      SIZE: SIZE, UNDO_START: UNDO_START, UNDO_EVERY: UNDO_EVERY, UNDO_MAX: UNDO_MAX,
      COMBO_RATE: COMBO_RATE, WIN_TILE: WIN_TILE, DIRS: DIRS,
      emptyGrid: emptyGrid, cloneGrid: cloneGrid, slideLine: slideLine, move: move,
      rngNext: rngNext, hashString: hashString, randomSeed: randomSeed,
      torontoDate: torontoDate, dailySeed: dailySeed, spawnTile: spawnTile,
      maxTile: maxTile, countTiles: countTiles, canMove: canMove, comboBonus: comboBonus,
      milestonesUpTo: milestonesUpTo, newGame: newGame, applyMove: applyMove,
      applyUndo: applyUndo, validGrid: validGrid, normalizeState: normalizeState
    };
  })();

  if (typeof module === 'object' && module && module.exports) module.exports = Core;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  global.NeonMergeCore = Core;

  /* ===================================================================== *
   * 2. UI
   * ===================================================================== */

  /* ---------------- Storage (every access guarded) ---------------- */
  var PREFIX = 'vg.neon-merge.';
  var store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(PREFIX + key);
        if (raw === null || raw === undefined) return fallback;
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* blocked or full */ }
    }
  };

  /* ---------------- Strings ---------------- */
  var NBSP = ' ';
  var STRINGS = {
    en: {
      tagline: 'Slide · Fuse · Overcharge',
      classic: 'Classic',
      classicDesc: 'Endless run. Beat your best score.',
      daily: 'Daily Challenge',
      dailyDesc: 'Same start and same spawns for everyone. New board at midnight Eastern.',
      howTo: 'How to play',
      how1: '<b>Slide</b> every cell at once: swipe, drag with the mouse, or use the arrow keys / WASD.',
      how2: 'Two equal cells that collide <b>fuse</b> into their sum, once per cell per move. The new value is added to your score.',
      how3: '<b>Combo:</b> fuse 2 or more pairs in one move to fill the meter and earn a bonus of 25% of that move’s fusion points for each extra pair (×2 = +25%, ×3 = +50%, ×4 = +75%…).',
      how4: '<b>Undo</b> takes back your last move (one step). You start with 1 and earn another every 5 fusions, up to 3.',
      how5: 'Hit <b>512</b>, <b>1024</b> and <b>2048</b> to overcharge the core, then keep going. No moves left? Game over.',
      keys: 'Arrows / WASD: move · U: undo · P / Esc: pause · M: sound',
      credit: 'A Versus Gamers original',
      score: 'Score',
      best: 'Best',
      todayBest: 'Today’s best',
      combo: 'Combo',
      undo: 'Undo',
      undoN: 'Undo ({n})',
      undoAria: 'Undo last move. {n} left. {m} more fusions to earn one.',
      newGame: 'New game',
      menu: 'Menu',
      pause: 'Pause',
      sound: 'Sound',
      langSwitch: 'Passer en français',
      board: 'Game board. Use the arrow keys or swipe.',
      modeClassic: 'Classic',
      modeDaily: 'Daily · {date}',
      continueAt: 'Continue · {score}',
      bestAt: 'Best {score}',
      todayBestAt: 'Today’s best: {score}',
      paused: 'Paused',
      pausedHint: 'Your run is saved. Press P or Esc to resume.',
      resume: 'Resume',
      confirmTitle: 'Start a new game?',
      confirmText: 'Your current run will end. Your best score is kept.',
      confirmYes: 'New game',
      confirmNo: 'Keep playing',
      overTitle: 'Out of moves',
      playAgain: 'Play again',
      newBest: 'New best score!',
      winTitle: '2048!',
      winText: 'Fusion core online. Keep going for an even bigger score?',
      keepGoing: 'Keep going',
      m512: 'Heating up',
      m1024: 'Supercharged',
      m2048: 'Fusion core online',
      mHigh: 'Off the charts',
      comboFloat: 'Combo ×{n}',
      aOver: 'Game over. Score {score}.',
      aMilestone: '{v} reached!',
      aUndo: 'Move undone.',
      aNew: 'New game started.',
      aCombo: 'Combo ×{n}, {bonus} bonus points.'
    },
    fr: {
      tagline: 'Glissez · Fusionnez · Surchargez',
      classic: 'Classique',
      classicDesc: 'Partie sans fin. Battez votre meilleur score.',
      daily: 'Défi du jour',
      dailyDesc: 'Même départ et mêmes apparitions pour tout le monde. Nouvelle grille à minuit (heure de l’Est).',
      howTo: 'Comment jouer',
      how1: '<b>Glissez</b> toutes les cellules d’un coup' + NBSP + ': balayez du doigt, faites glisser la souris ou utilisez les flèches / WASD.',
      how2: 'Deux cellules identiques qui se rencontrent <b>fusionnent</b> en leur somme, une seule fois par cellule et par coup. La nouvelle valeur s’ajoute à votre score.',
      how3: '<b>Combo' + NBSP + ':</b> fusionnez 2 paires ou plus en un seul coup pour remplir la jauge et obtenir un bonus de 25' + NBSP + '% des points de fusion du coup par paire supplémentaire (×2 = +25' + NBSP + '%, ×3 = +50' + NBSP + '%, ×4 = +75' + NBSP + '%…).',
      how4: '<b>Annuler</b> reprend votre dernier coup (un seul). Vous commencez avec 1 annulation et vous en gagnez une autre toutes les 5 fusions, jusqu’à 3.',
      how5: 'Atteignez <b>512</b>, <b>1024</b> et <b>2048</b> pour surcharger le noyau, puis continuez! Plus aucun coup possible? La partie est terminée.',
      keys: 'Flèches / WASD' + NBSP + ': déplacer · U' + NBSP + ': annuler · P / Échap' + NBSP + ': pause · M' + NBSP + ': son',
      credit: 'Une création originale Versus Gamers',
      score: 'Score',
      best: 'Meilleur score',
      todayBest: 'Meilleur du jour',
      combo: 'Combo',
      undo: 'Annuler',
      undoN: 'Annuler ({n})',
      undoAria: 'Annuler le dernier coup. Il vous en reste {n}. Encore {m} fusions pour en obtenir une autre.',
      newGame: 'Nouvelle partie',
      menu: 'Menu',
      pause: 'Pause',
      sound: 'Son',
      langSwitch: 'Switch to English',
      board: 'Grille de jeu. Utilisez les flèches ou balayez du doigt.',
      modeClassic: 'Classique',
      modeDaily: 'Défi · {date}',
      continueAt: 'Continuer · {score}',
      bestAt: 'Votre meilleur score' + NBSP + ': {score}',
      todayBestAt: 'Votre meilleur du jour' + NBSP + ': {score}',
      paused: 'En pause',
      pausedHint: 'Votre partie est sauvegardée. Appuyez sur P ou Échap pour reprendre.',
      resume: 'Reprendre',
      confirmTitle: 'Commencer une nouvelle partie?',
      confirmText: 'Votre partie en cours prendra fin. Votre meilleur score est conservé.',
      confirmYes: 'Nouvelle partie',
      confirmNo: 'Continuer à jouer',
      overTitle: 'Plus aucun coup possible',
      playAgain: 'Rejouer',
      newBest: 'Nouveau record!',
      winTitle: '2048!',
      winText: 'Noyau de fusion activé. Voulez-vous continuer pour un score encore plus gros?',
      keepGoing: 'Continuer',
      m512: 'Ça chauffe',
      m1024: 'Survolté',
      m2048: 'Noyau de fusion activé',
      mHigh: 'Hors normes',
      comboFloat: 'Combo ×{n}',
      aOver: 'Partie terminée. Score' + NBSP + ': {score}.',
      aMilestone: '{v} atteint!',
      aUndo: 'Coup annulé.',
      aNew: 'Nouvelle partie commencée.',
      aCombo: 'Combo ×{n}, {bonus} points de bonus.'
    }
  };

  /* ---------------- State ---------------- */
  var settings = { muted: false, lang: null };
  var lang = 'en';
  var nf = null;
  var best = { classic: 0 };
  var dailyBest = { date: '', best: 0 };
  var today = Core.torontoDate(new Date());
  var state = null;           // current game state
  var screen = 'title';       // 'title' | 'game'
  var paused = false;
  var confirmOpen = false;
  var boardOverlay = null;    // null | 'end' | 'win'
  var tileEls = null;         // 4x4 element map
  var dying = [];             // merged-away tiles awaiting removal
  var cleanupTimer = 0, endTimer = 0, winTimer = 0, bannerTimer = 0;
  var drag = null;
  var reduceMotion = false;
  var slideMs = 100;

  var $ = function (id) { return document.getElementById(id); };
  var qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var els = {
    title: $('screen-title'),
    gameScreen: $('screen-game'),
    game: document.querySelector('.game'),
    panel: document.querySelector('.panel'),
    boardWrap: $('board-wrap'),
    board: $('board'),
    tiles: $('tiles'),
    score: $('score'),
    best: $('best'),
    bestLabel: $('best-label'),
    scorePop: $('score-pop'),
    combo: $('combo'),
    comboText: $('combo-text'),
    segs: qsa('#combo .seg'),
    undo: $('btn-undo'),
    undoCount: $('undo-count'),
    undoPips: qsa('#undo-pips i'),
    modeTag: $('mode-tag'),
    comboFloat: $('combo-float'),
    banner: $('banner'),
    ovEnd: $('ov-end'),
    ovWin: $('ov-win'),
    ovPause: $('ov-pause'),
    ovConfirm: $('ov-confirm'),
    live: $('live')
  };

  /* ---------------- i18n helpers ---------------- */
  function t(key, vars) {
    var table = STRINGS[lang] || STRINGS.en;
    var s = table[key];
    if (s === undefined) s = STRINGS.en[key];
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; });
    return s;
  }

  function fmt(n) {
    try { return nf ? nf.format(n) : String(n); } catch (e) { return String(n); }
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '';
    var p = dateStr.split('-').map(Number);
    var dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
    try {
      return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-CA' : 'en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(dt);
    } catch (e) { return dateStr; }
  }

  function detectLang() {
    var p = null;
    try { p = new URLSearchParams(window.location.search).get('lang'); } catch (e) { p = null; }
    if (p) {
      p = p.toLowerCase();
      if (p.indexOf('fr') === 0) return 'fr';
      if (p.indexOf('en') === 0) return 'en';
    }
    if (settings.lang === 'fr' || settings.lang === 'en') return settings.lang;
    var nav = '';
    try { nav = (navigator.languages && navigator.languages[0]) || navigator.language || ''; } catch (e) { nav = ''; }
    return /^fr/i.test(nav) ? 'fr' : 'en';
  }

  function applyLang() {
    var root = document.documentElement;
    root.lang = lang === 'fr' ? 'fr-CA' : 'en-CA';
    root.setAttribute('data-lang', lang);
    try { nf = new Intl.NumberFormat(lang === 'fr' ? 'fr-CA' : 'en-CA'); } catch (e) { nf = null; }
    qsa('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    qsa('[data-i18n-html]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    qsa('[data-i18n-label]').forEach(function (el) {
      var s = t(el.getAttribute('data-i18n-label'));
      el.setAttribute('aria-label', s);
      if (el.tagName === 'BUTTON') el.title = s;
    });
    qsa('[data-action="lang"]').forEach(function (b) { b.setAttribute('aria-label', t('langSwitch')); b.title = t('langSwitch'); });
    qsa('[data-action="sound"]').forEach(function (b) { b.setAttribute('aria-label', t('sound')); b.title = t('sound') + ' (M)'; });
    updateTitleMeta();
    if (state) {
      updateHud();
      if (boardOverlay === 'end') fillEnd();
    }
  }

  function toggleLang() {
    lang = lang === 'fr' ? 'en' : 'fr';
    settings.lang = lang;
    store.set('settings', settings);
    try {
      var url = new URL(window.location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.set('lang', lang);
        window.history.replaceState(null, '', url.toString());
      }
    } catch (e) { /* ignore */ }
    applyLang();
  }

  /* ---------------- Sound (Web Audio, generated) ---------------- */
  var Sfx = (function () {
    var ctx = null, out = null;
    var PENTA = [0, 2, 4, 7, 9];

    function unlock() {
      if (ctx) {
        if (ctx.state === 'suspended' && ctx.resume) {
          try { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ }
        }
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        var comp = ctx.createDynamicsCompressor();
        out = ctx.createGain();
        out.gain.value = 0.55;
        out.connect(comp);
        comp.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }

    function live() { return !!ctx && !settings.muted && ctx.state === 'running'; }

    function tone(o) {
      if (!live()) return;
      try {
        var t0 = ctx.currentTime + (o.at || 0) + 0.005;
        var dur = o.dur || 0.15;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(o.f, t0);
        if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t0 + (o.attack || 0.006));
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(out);
        osc.start(t0);
        osc.stop(t0 + dur + 0.03);
      } catch (e) { /* ignore */ }
    }

    // Each power of two climbs one step of a major pentatonic scale from A3.
    function noteFreq(v) {
      var i = Math.max(0, Math.round(Math.log(v) / Math.LN2) - 1);
      var midi = 57 + Math.floor(i / 5) * 12 + PENTA[i % 5];
      return 440 * Math.pow(2, (midi - 69) / 12);
    }

    return {
      unlock: unlock,
      noteFreq: noteFreq,
      move: function () { tone({ f: 200, f2: 120, type: 'sine', dur: 0.06, vol: 0.045 }); },
      merge: function (values) {
        var uniq = values.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }).slice(-3);
        uniq.forEach(function (v, i) {
          var f = noteFreq(v);
          tone({ f: f, type: 'triangle', dur: 0.22, vol: 0.15, at: i * 0.04 });
          tone({ f: f * 2, type: 'sine', dur: 0.14, vol: 0.045, at: i * 0.04 + 0.01 });
        });
      },
      combo: function (n) {
        var steps = [0, 4, 7, 12, 16, 19, 24];
        for (var i = 0; i < Math.min(n, steps.length); i++) {
          tone({ f: 523.25 * Math.pow(2, steps[i] / 12), type: 'sine', dur: 0.12, vol: 0.06, at: 0.09 + i * 0.05 });
        }
      },
      bump: function () { tone({ f: 120, f2: 80, type: 'sine', dur: 0.09, vol: 0.08 }); },
      undo: function () { tone({ f: 700, f2: 300, type: 'triangle', dur: 0.18, vol: 0.08 }); },
      milestone: function (v) {
        var f = noteFreq(v) / 2;
        [1, 1.25, 1.5, 2, 2.5].forEach(function (r, i) { tone({ f: f * r, type: 'triangle', dur: 0.36, vol: 0.1, at: i * 0.07 }); });
      },
      over: function () {
        tone({ f: 392, f2: 98, type: 'triangle', dur: 0.7, vol: 0.11 });
        tone({ f: 196, f2: 65, type: 'sine', dur: 0.8, vol: 0.07, at: 0.05 });
      },
      click: function () { tone({ f: 1250, type: 'sine', dur: 0.035, vol: 0.025 }); },
      start: function () {
        [0, 7, 12].forEach(function (s, i) { tone({ f: 392 * Math.pow(2, s / 12), type: 'triangle', dur: 0.18, vol: 0.07, at: i * 0.06 }); });
      }
    };
  })();

  function applySound() {
    document.documentElement.setAttribute('data-muted', settings.muted ? '1' : '0');
    qsa('[data-action="sound"]').forEach(function (b) { b.setAttribute('aria-pressed', settings.muted ? 'false' : 'true'); });
  }

  function toggleSound() {
    settings.muted = !settings.muted;
    store.set('settings', settings);
    applySound();
    if (!settings.muted) { Sfx.unlock(); Sfx.click(); }
  }

  /* ---------------- Best scores ---------------- */
  function bestFor(s) {
    if (!s) return 0;
    if (s.mode === 'daily') return dailyBest.date === s.date ? dailyBest.best : 0;
    return best.classic;
  }

  function recordBest() {
    if (!state) return;
    if (state.score <= bestFor(state)) return;
    if (state.mode === 'daily') {
      dailyBest = { date: state.date, best: state.score };
      store.set('daily-best', dailyBest);
    } else {
      best.classic = state.score;
      store.set('best', best);
    }
  }

  /* ---------------- Saving ---------------- */
  function saveGame() {
    if (!state) return;
    store.set('save.' + state.mode, state);
    store.set('mode', state.mode);
  }

  function loadSave(mode) {
    return Core.normalizeState(store.get('save.' + mode, null), { mode: mode, date: mode === 'daily' ? today : null });
  }

  /* ---------------- Rendering ---------------- */
  function emptyEls() {
    var g = [];
    for (var r = 0; r < Core.SIZE; r++) g.push(new Array(Core.SIZE).fill(null));
    return g;
  }

  function tileClass(v) {
    var d = String(v).length;
    return 'tile ' + (v <= 2048 ? 't' + v : 'tsuper') + ' d' + Math.min(d, 6);
  }

  function makeTile(v, r, c, extra) {
    var el = document.createElement('div');
    el.className = tileClass(v) + (extra ? ' ' + extra : '');
    el.style.setProperty('--r', r);
    el.style.setProperty('--c', c);
    var inner = document.createElement('div');
    inner.className = 'tile-inner';
    inner.textContent = v;
    el.appendChild(inner);
    els.tiles.appendChild(el);
    return el;
  }

  function flushDying() {
    clearTimeout(cleanupTimer);
    for (var i = 0; i < dying.length; i++) dying[i].remove();
    dying = [];
  }

  function renderAll(extraClass) {
    flushDying();
    els.tiles.textContent = '';
    tileEls = emptyEls();
    for (var r = 0; r < Core.SIZE; r++) {
      for (var c = 0; c < Core.SIZE; c++) {
        var v = state.grid[r][c];
        if (v) tileEls[r][c] = makeTile(v, r, c, extraClass || '');
      }
    }
  }

  function animateMove(res) {
    flushDying();
    var next = emptyEls();
    var ok = true;
    res.move.transitions.forEach(function (tr) {
      var el = tileEls[tr.from[0]][tr.from[1]];
      if (!el) { ok = false; return; }
      el.classList.remove('spawn', 'merged', 'rewind');
      el.style.setProperty('--r', tr.to[0]);
      el.style.setProperty('--c', tr.to[1]);
      if (tr.merged) dying.push(el);
      else next[tr.to[0]][tr.to[1]] = el;
    });
    if (!ok) { renderAll(); return; }
    res.move.mergedCells.forEach(function (mc) {
      next[mc.at[0]][mc.at[1]] = makeTile(mc.value, mc.at[0], mc.at[1], 'merged');
    });
    if (res.spawn && res.spawn.cell) {
      next[res.spawn.cell[0]][res.spawn.cell[1]] = makeTile(res.spawn.value, res.spawn.cell[0], res.spawn.cell[1], 'spawn');
    }
    tileEls = next;
    if (slideMs > 0) cleanupTimer = setTimeout(flushDying, slideMs + 40);
    else flushDying();
  }

  function restartAnim(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // reflow so the animation replays
    el.classList.add(cls);
  }

  function updateHud() {
    if (!state) return;
    els.score.textContent = fmt(state.score);
    els.best.textContent = fmt(bestFor(state));
    els.bestLabel.textContent = state.mode === 'daily' ? t('todayBest') : t('best');
    els.undoCount.textContent = String(state.undos);
    els.undo.disabled = !(state.undos > 0 && state.prev);
    els.undoPips.forEach(function (p, i) { p.classList.toggle('on', i < state.mergeProgress); });
    var aria = t('undoAria', { n: state.undos, m: Core.UNDO_EVERY - state.mergeProgress });
    els.undo.setAttribute('aria-label', aria);
    els.undo.title = aria + ' (U)';
    els.modeTag.textContent = state.mode === 'daily' ? t('modeDaily', { date: fmtDate(state.date) }) : t('modeClassic');
  }

  function setCombo(merges, bonus) {
    els.segs.forEach(function (s, i) { s.classList.toggle('on', i < merges); });
    els.combo.classList.toggle('lit', merges >= 2);
    els.comboText.textContent = merges >= 2 ? '×' + merges + '  +' + fmt(bonus) : (merges === 1 ? '×1' : '');
    if (merges >= 2) {
      restartAnim(els.combo, 'hot');
      restartAnim(els.board, 'flash');
      els.comboFloat.innerHTML = '';
      var a = document.createElement('span'); a.className = 'cf-n'; a.textContent = t('comboFloat', { n: merges });
      var b = document.createElement('span'); b.className = 'cf-b'; b.textContent = '+' + fmt(bonus);
      els.comboFloat.appendChild(a); els.comboFloat.appendChild(b);
      restartAnim(els.comboFloat, 'go');
    }
  }

  function resetCombo() {
    els.segs.forEach(function (s) { s.classList.remove('on'); });
    els.combo.classList.remove('lit', 'hot');
    els.comboText.textContent = '';
    els.comboFloat.classList.remove('go');
  }

  function showBanner(v) {
    clearTimeout(bannerTimer);
    var key = v === 512 ? 'm512' : v === 1024 ? 'm1024' : v === 2048 ? 'm2048' : 'mHigh';
    els.banner.innerHTML = '';
    var a = document.createElement('span'); a.className = 'b-val'; a.textContent = fmt(v);
    var b = document.createElement('span'); b.className = 'b-txt'; b.textContent = t(key);
    els.banner.appendChild(a); els.banner.appendChild(b);
    els.banner.className = 'banner ' + (v <= 2048 ? 'bt' + v : 'btsuper');
    restartAnim(els.banner, 'show');
    bannerTimer = setTimeout(function () { els.banner.classList.remove('show'); }, 2000);
    Sfx.milestone(v);
    announce(t('aMilestone', { v: fmt(v) }));
  }

  function announce(msg) {
    els.live.textContent = '';
    setTimeout(function () { els.live.textContent = msg; }, 30);
  }

  /* ---------------- Overlays ---------------- */
  function hideBoardOverlays() {
    clearTimeout(endTimer); clearTimeout(winTimer);
    els.ovEnd.hidden = true;
    els.ovWin.hidden = true;
    boardOverlay = null;
  }

  function fillEnd() {
    $('end-score').textContent = fmt(state.score);
    $('end-best').textContent = fmt(bestFor(state));
    $('end-best-label').textContent = state.mode === 'daily' ? t('todayBest') : t('best');
    $('end-newbest').hidden = !(state.score > 0 && state.score > (state.bestAtStart || 0));
    var u = $('end-undo');
    var canUndo = state.undos > 0 && !!state.prev;
    u.hidden = !canUndo;
    u.textContent = t('undoN', { n: state.undos });
  }

  function showEnd(withFx) {
    if (screen !== 'game' || !state || !state.over) return;
    boardOverlay = 'end';
    fillEnd();
    els.ovEnd.hidden = false;
    if (withFx) Sfx.over();
    announce(t('aOver', { score: fmt(state.score) }));
    focusSoon($('end-again'));
  }

  function showWin() {
    if (screen !== 'game' || !state) return;
    boardOverlay = 'win';
    els.ovWin.hidden = false;
    Sfx.milestone(2048);
    announce(t('aMilestone', { v: fmt(2048) }));
    focusSoon($('win-keep'));
  }

  function keepGoing() {
    state.keepGoing = true;
    saveGame();
    els.ovWin.hidden = true;
    boardOverlay = null;
    if (state.over) showEnd(true);
    else focusSoon(els.board);
  }

  function syncInert() {
    var blocked = paused || confirmOpen;
    els.game.inert = blocked;
    if (blocked) els.game.setAttribute('aria-hidden', 'true');
    else els.game.removeAttribute('aria-hidden');
  }

  function setPaused(on) {
    if (screen !== 'game') return;
    paused = !!on;
    els.ovPause.hidden = !paused;
    els.gameScreen.classList.toggle('is-paused', paused);
    syncInert();
    if (paused) focusSoon($('pause-resume'));
    else { drag = null; focusSoon(els.board); }
  }

  function openConfirm() {
    confirmOpen = true;
    els.ovConfirm.hidden = false;
    syncInert();
    focusSoon($('confirm-no'));
  }

  function closeConfirm() {
    var was = confirmOpen;
    confirmOpen = false;
    els.ovConfirm.hidden = true;
    syncInert();
    if (was && screen === 'game') focusSoon(boardOverlay === 'win' ? $('win-keep') : els.board);
  }

  function focusSoon(el) {
    setTimeout(function () { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
  }

  /* ---------------- Game flow ---------------- */
  function freshGame(mode) {
    today = Core.torontoDate(new Date());
    var s = mode === 'daily'
      ? Core.newGame('daily', Core.dailySeed(today), today)
      : Core.newGame('classic', Core.randomSeed());
    s.bestAtStart = bestFor(s);
    return s;
  }

  function enterGame(s) {
    state = s;
    if (!state.bestAtStart) state.bestAtStart = bestFor(state);
    recordBest();
    screen = 'game';
    paused = false;
    closeConfirm();
    els.ovPause.hidden = true;
    els.gameScreen.classList.remove('is-paused');
    syncInert();
    els.title.classList.remove('active');
    els.gameScreen.classList.add('active');
    hideBoardOverlays();
    layout();
    renderAll('spawn');
    resetCombo();
    updateHud();
    saveGame();
    store.set('resume', true);
    if (state.over) showEnd(false);
    else if (state.milestones.indexOf(Core.WIN_TILE) >= 0 && !state.keepGoing) showWin();
  }

  function startMode(mode) {
    today = Core.torontoDate(new Date());
    var s = loadSave(mode);
    var fresh = !s;
    enterGame(s || freshGame(mode));
    if (fresh) Sfx.start();
    focusSoon(els.board);
  }

  function goTitle(fromBoot) {
    if (state) saveGame();
    clearTimeout(endTimer); clearTimeout(winTimer);
    paused = false;
    closeConfirm();
    els.ovPause.hidden = true;
    syncInert();
    hideBoardOverlays();
    screen = 'title';
    drag = null;
    store.set('resume', false);
    els.gameScreen.classList.remove('active', 'is-paused');
    els.title.classList.add('active');
    updateTitleMeta();
    if (!fromBoot) focusSoon($(state && state.mode === 'daily' ? 'btn-daily' : 'btn-classic'));
  }

  function newGameNow() {
    closeConfirm();
    hideBoardOverlays();
    state = freshGame(state ? state.mode : 'classic');
    renderAll('spawn');
    resetCombo();
    updateHud();
    saveGame();
    Sfx.start();
    announce(t('aNew'));
    focusSoon(els.board);
  }

  function requestNewGame() {
    if (!state || state.moves === 0 || state.over) { newGameNow(); return; }
    openConfirm();
  }

  function canPlay() {
    return screen === 'game' && !!state && !paused && !confirmOpen && !boardOverlay;
  }

  function doMove(dir) {
    if (!canPlay()) return;
    var res = Core.applyMove(state, dir);
    if (!res.moved) {
      Sfx.bump();
      if (!reduceMotion) {
        els.boardWrap.classList.remove('nudge-left', 'nudge-right', 'nudge-up', 'nudge-down');
        restartAnim(els.boardWrap, 'nudge-' + dir);
      }
      return;
    }
    state = res.state;
    animateMove(res);
    var m = res.move;
    if (m.merges) Sfx.merge(m.mergedValues); else Sfx.move();
    setCombo(m.merges, res.bonus);
    if (m.merges >= 2) { Sfx.combo(m.merges); announce(t('aCombo', { n: m.merges, bonus: fmt(res.bonus) })); }
    var gain = m.gained + res.bonus;
    if (gain > 0) {
      els.scorePop.textContent = '+' + fmt(gain);
      restartAnim(els.scorePop, 'go');
    }
    recordBest();
    updateHud();
    saveGame();

    var delay = slideMs + 260;
    var top = res.newMilestones.length ? res.newMilestones[res.newMilestones.length - 1] : 0;
    var showsWin = false;
    if (top) {
      if (top >= Core.WIN_TILE && res.newMilestones.indexOf(Core.WIN_TILE) >= 0 && !state.keepGoing) {
        showsWin = true;
        boardOverlay = 'pending'; // block input until the overlay shows
        clearTimeout(winTimer);
        winTimer = setTimeout(showWin, delay);
      } else {
        setTimeout(function () { showBanner(top); }, slideMs);
      }
    }
    if (state.over && !showsWin) {
      clearTimeout(endTimer);
      endTimer = setTimeout(function () { showEnd(true); }, delay + 200);
    }
  }

  function doUndo() {
    if (screen !== 'game' || !state || paused || confirmOpen || boardOverlay === 'win') return;
    var r = Core.applyUndo(state);
    if (!r.undone) { Sfx.bump(); return; }
    state = r.state;
    hideBoardOverlays();
    renderAll('rewind');
    resetCombo();
    updateHud();
    saveGame();
    Sfx.undo();
    announce(t('aUndo'));
  }

  /* ---------------- Title screen ---------------- */
  function updateTitleMeta() {
    today = Core.torontoDate(new Date());
    var cs = loadSave('classic');
    var cm = '';
    if (cs && !cs.over && cs.moves > 0) cm = t('continueAt', { score: fmt(cs.score) });
    else if (best.classic > 0) cm = t('bestAt', { score: fmt(best.classic) });
    $('classic-meta').textContent = cm;

    var ds = loadSave('daily');
    var db = dailyBest.date === today ? dailyBest.best : 0;
    var dm = t('todayBestAt', { score: db > 0 ? fmt(db) : '—' });
    if (ds && !ds.over && ds.moves > 0) dm = t('continueAt', { score: fmt(ds.score) }) + '  ·  ' + dm;
    $('daily-meta').textContent = dm;
    $('daily-date').textContent = fmtDate(today);
  }

  /* ---------------- Layout ---------------- */
  var layoutQueued = false;
  function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { layoutQueued = false; layout(); });
  }

  function layout() {
    if (screen !== 'game') return;
    var g = els.game;
    var cs = window.getComputedStyle(g);
    var W = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var H = g.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (W <= 0 || H <= 0) return;
    var gap = parseFloat(cs.columnGap) || parseFloat(cs.rowGap) || 12;
    var portrait = W / H < 1.12;
    els.board.classList.add('resizing');
    g.classList.toggle('portrait', portrait);
    g.classList.toggle('landscape', !portrait);
    var size;
    if (portrait) {
      g.style.setProperty('--bs', Math.floor(Math.min(W, 560)) + 'px');
      size = Math.min(W, H - els.panel.offsetHeight - gap);
      g.style.setProperty('--bs', Math.floor(Math.max(size, 120)) + 'px');
      size = Math.min(W, H - els.panel.offsetHeight - gap);
    } else {
      size = Math.min(H, W - els.panel.offsetWidth - gap);
    }
    size = Math.max(120, Math.floor(size));
    g.style.setProperty('--bs', size + 'px');
    // Re-enable slide transitions on the next frame.
    (window.requestAnimationFrame || setTimeout)(function () { els.board.classList.remove('resizing'); });
  }

  /* ---------------- Input ---------------- */
  var KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down'
  };
  var CODES = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down' };

  function onKey(e) {
    Sfx.unlock();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key || '';
    var lower = k.length === 1 ? k.toLowerCase() : k;
    if (lower === 'm') { e.preventDefault(); toggleSound(); return; }
    if (screen !== 'game') return;
    if (confirmOpen) {
      if (k === 'Escape') { e.preventDefault(); closeConfirm(); }
      return;
    }
    if (lower === 'p' || k === 'Escape') {
      if (boardOverlay && !paused) return;
      e.preventDefault();
      setPaused(!paused);
      return;
    }
    if (paused) {
      if (KEYS[lower] || KEYS[k]) e.preventDefault();
      return;
    }
    var dir = KEYS[k] || KEYS[lower] || CODES[e.code];
    if (dir) {
      e.preventDefault();
      if (!e.repeat) doMove(dir);
      return;
    }
    if (lower === 'u') { e.preventDefault(); doUndo(); }
  }

  function swipeThreshold() {
    var bs = els.board.clientWidth || 300;
    return Math.max(22, Math.min(48, bs * 0.075));
  }

  function onPointerDown(e) {
    if (!canPlay()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('button')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
    try { els.board.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (e.pointerType === 'mouse') e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id || drag.done) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax, ay) < swipeThreshold()) return;
    drag.done = true;
    doMove(ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  function onPointerEnd(e) {
    if (drag && e.pointerId === drag.id) drag = null;
  }

  function bind() {
    // Audio may only start after a user gesture.
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      window.addEventListener(type, function () { Sfx.unlock(); }, { capture: true, passive: true });
    });
    window.addEventListener('keydown', onKey);

    qsa('[data-action="lang"]').forEach(function (b) { b.addEventListener('click', function () { toggleLang(); Sfx.click(); }); });
    qsa('[data-action="sound"]').forEach(function (b) { b.addEventListener('click', toggleSound); });

    $('btn-classic').addEventListener('click', function () { startMode('classic'); });
    $('btn-daily').addEventListener('click', function () { startMode('daily'); });
    $('btn-menu').addEventListener('click', function () { Sfx.click(); goTitle(); });
    $('btn-pause').addEventListener('click', function () { Sfx.click(); setPaused(true); });
    $('pause-resume').addEventListener('click', function () { Sfx.click(); setPaused(false); });
    $('pause-menu').addEventListener('click', function () { Sfx.click(); goTitle(); });
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-new').addEventListener('click', function () { Sfx.click(); if (canPlay() || boardOverlay) requestNewGame(); });
    $('confirm-no').addEventListener('click', function () { Sfx.click(); closeConfirm(); });
    $('confirm-yes').addEventListener('click', newGameNow);
    $('end-again').addEventListener('click', newGameNow);
    $('end-undo').addEventListener('click', doUndo);
    $('end-menu').addEventListener('click', function () { Sfx.click(); goTitle(); });
    $('win-keep').addEventListener('click', function () { Sfx.click(); keepGoing(); });
    $('win-new').addEventListener('click', function () { Sfx.click(); openConfirm(); });

    // Click on the dim backdrop of the confirm dialog cancels it.
    els.ovConfirm.addEventListener('click', function (e) { if (e.target === els.ovConfirm) closeConfirm(); });

    var b = els.board;
    b.addEventListener('pointerdown', onPointerDown);
    b.addEventListener('pointermove', onPointerMove);
    b.addEventListener('pointerup', onPointerEnd);
    b.addEventListener('pointercancel', onPointerEnd);
    b.addEventListener('lostpointercapture', onPointerEnd);
    // Belt and braces for browsers that ignore touch-action: never scroll the page from the board.
    b.addEventListener('touchmove', function (e) { if (screen === 'game' && e.cancelable) e.preventDefault(); }, { passive: false });
    b.addEventListener('dragstart', function (e) { e.preventDefault(); });

    window.addEventListener('resize', queueLayout);
    window.addEventListener('orientationchange', function () { setTimeout(layout, 120); queueLayout(); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', queueLayout);
    if (window.ResizeObserver) {
      try { new ResizeObserver(queueLayout).observe(els.gameScreen); } catch (e) { /* ignore */ }
    }
    window.addEventListener('pagehide', saveGame);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') saveGame();
      else if (screen === 'title') updateTitleMeta();
    });

    try {
      var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      var applyMotion = function () {
        reduceMotion = !!mq.matches;
        slideMs = reduceMotion ? 0 : 100;
        document.documentElement.style.setProperty('--slide', slideMs + 'ms');
      };
      applyMotion();
      if (mq.addEventListener) mq.addEventListener('change', applyMotion);
      else if (mq.addListener) mq.addListener(applyMotion);
    } catch (e) { /* ignore */ }
  }

  /* ---------------- Optional background image ---------------- */
  function probeBackground() {
    var src = 'assets/bg.webp';
    var img = new Image();
    img.onload = function () {
      var layer = document.querySelector('.bg-photo');
      if (layer) layer.style.backgroundImage = 'url("' + src + '")';
      document.body.classList.add('has-photo');
    };
    img.onerror = function () { /* no image: CSS background stays */ };
    img.src = src;
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    var s = store.get('settings', null);
    if (s && typeof s === 'object') {
      settings.muted = !!s.muted;
      settings.lang = (s.lang === 'fr' || s.lang === 'en') ? s.lang : null;
    }
    var b = store.get('best', null);
    if (b && typeof b.classic === 'number' && isFinite(b.classic)) best.classic = Math.max(0, b.classic);
    var db = store.get('daily-best', null);
    if (db && typeof db.date === 'string' && typeof db.best === 'number') dailyBest = { date: db.date, best: Math.max(0, db.best) };

    lang = detectLang();
    bind();
    applyLang();
    applySound();
    probeBackground();

    if (store.get('resume', false)) {
      var mode = store.get('mode', 'classic') === 'daily' ? 'daily' : 'classic';
      var saved = loadSave(mode);
      if (saved) { enterGame(saved); return; }
    }
    goTitle(true);
  }

  boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
