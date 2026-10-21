/*
 * Lexi Duel, a Versus Gamers original.
 * Vanilla JS, no dependencies, no external requests (only its own word files).
 * The pure game logic at the top is also exported for Node tests.
 */
(function () {
  'use strict';

  /* ================================================================
   * Core logic (pure, testable)
   * ================================================================ */

  var WORD_LEN = 5;
  var MAX_TRIES = 6;
  var DAILY_SEED = 'lexi-duel/versusgamers/2026';
  var TIME_ZONE = 'America/Toronto';
  var DAY_MS = 86400000;
  var STATE_RANK = { absent: 1, present: 2, correct: 3 };

  /** Strip accents and uppercase: "élève" -> "ELEVE", "garçon" -> "GARCON". */
  function normalizeWord(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }

  /** True if the word normalizes to exactly five A-Z letters (rejects œ, æ, hyphens...). */
  function isPlayableWord(s) {
    return /^[A-Z]{5}$/.test(normalizeWord(s));
  }

  /**
   * Standard two-pass scoring. Returns an array of 'correct' | 'present' | 'absent'.
   * Pass 1 marks exact matches and counts the remaining answer letters;
   * pass 2 hands out 'present' only while unmatched copies remain.
   */
  function scoreGuess(guess, answer) {
    var g = normalizeWord(guess), a = normalizeWord(answer);
    var res = [], counts = {}, i;
    for (i = 0; i < a.length; i++) {
      if (g[i] === a[i]) { res[i] = 'correct'; }
      else { res[i] = 'absent'; counts[a[i]] = (counts[a[i]] || 0) + 1; }
    }
    for (i = 0; i < g.length; i++) {
      if (res[i] !== 'correct' && counts[g[i]] > 0) { res[i] = 'present'; counts[g[i]]--; }
    }
    return res;
  }

  /** Best-known state per letter across all scored guesses. */
  function keyStates(guesses, results) {
    var map = {};
    for (var r = 0; r < guesses.length; r++) {
      for (var i = 0; i < guesses[r].length; i++) {
        var ch = guesses[r][i], st = results[r][i];
        if (!map[ch] || STATE_RANK[st] > STATE_RANK[map[ch]]) map[ch] = st;
      }
    }
    return map;
  }

  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var orderCache = {};
  /** A fixed, seeded permutation of 0..n-1 (Fisher-Yates). */
  function seededOrder(n, seedStr) {
    var key = seedStr + '#' + n;
    if (orderCache[key]) return orderCache[key];
    var rnd = mulberry32(hashString(seedStr));
    var idx = [];
    for (var i = 0; i < n; i++) idx.push(i);
    for (var j = n - 1; j > 0; j--) {
      var k = Math.floor(rnd() * (j + 1));
      var tmp = idx[j]; idx[j] = idx[k]; idx[k] = tmp;
    }
    orderCache[key] = idx;
    return idx;
  }

  /** "2026-10-20" -> whole days since 1970-01-01. */
  function dayNumber(dateKey) {
    var p = String(dateKey).split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / DAY_MS);
  }

  /**
   * Daily answer: walk a seeded permutation of the answer list, one step per day,
   * so every word is used once before any repeats. Same list + date + language
   * always gives the same word.
   */
  function pickDaily(answers, dateKey, lang) {
    var n = answers.length;
    if (!n) return null;
    var order = seededOrder(n, DAILY_SEED + '|' + lang);
    var d = dayNumber(dateKey);
    return answers[order[((d % n) + n) % n]];
  }

  var tzFormatter = null;
  function zonedParts(ms) {
    try {
      if (!tzFormatter) {
        tzFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        });
      }
      var out = {};
      tzFormatter.formatToParts(new Date(ms)).forEach(function (p) { out[p.type] = p.value; });
      var h = +out.hour % 24;
      return { key: out.year + '-' + out.month + '-' + out.day, secs: h * 3600 + (+out.minute) * 60 + (+out.second) };
    } catch (e) {
      // No time zone data: approximate Eastern Standard Time (UTC-5).
      var d = new Date(ms - 5 * 3600000);
      return { key: d.toISOString().slice(0, 10), secs: d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds() };
    }
  }

  /** Today's date in Montreal / Toronto time, as YYYY-MM-DD. */
  function dateKeyAt(ms) { return zonedParts(ms).key; }

  /** Milliseconds until the next local midnight in America/Toronto (DST-safe). */
  function msUntilNextDay(ms) {
    var now = zonedParts(ms);
    var target = ms - (ms % 1000) + (86400 - now.secs) * 1000;
    var p = zonedParts(target);
    // Correct for 23- or 25-hour days around DST changes.
    if (p.key === now.key) target += (86400 - p.secs) * 1000;
    else if (p.secs !== 0) target -= p.secs * 1000;
    return Math.max(0, target - ms);
  }

  /** Endless points: 350 for a first-try solve down to 100 on the sixth try. */
  function pointsFor(tries) { return 100 + (MAX_TRIES - tries) * 50; }

  var SHARE_SYMBOLS = { correct: '■', present: '□', absent: '▪' }; // ■ □ ▪

  function shareGrid(results) {
    return results.map(function (row) {
      return row.map(function (s) { return SHARE_SYMBOLS[s]; }).join(' ');
    }).join('\n');
  }

  var Core = {
    WORD_LEN: WORD_LEN, MAX_TRIES: MAX_TRIES, DAILY_SEED: DAILY_SEED,
    normalizeWord: normalizeWord, isPlayableWord: isPlayableWord, scoreGuess: scoreGuess,
    keyStates: keyStates, hashString: hashString, seededOrder: seededOrder, dayNumber: dayNumber,
    pickDaily: pickDaily, dateKeyAt: dateKeyAt, msUntilNextDay: msUntilNextDay,
    pointsFor: pointsFor, shareGrid: shareGrid, SHARE_SYMBOLS: SHARE_SYMBOLS
  };

  if (typeof module === 'object' && module.exports) module.exports = Core;
  if (typeof document === 'undefined') return;

  /* ================================================================
   * Strings (all UI text, both languages; French uses "vous")
   * ================================================================ */

  var STR = {
    en: {
      tagline: 'Find the hidden five-letter word in six tries, in English or French.',
      chooseMode: 'Choose a mode',
      daily: 'Daily',
      endless: 'Endless',
      dailyDesc: 'One word a day, the same for everyone.',
      dailyContinue: 'Continue today’s word.',
      dailyDone: 'Done for today. Next word in {t}.',
      endlessDesc: 'Word after word. Fewer tries, more points.',
      endlessResume: 'Your run is waiting: {n} points so far.',
      yourStreak: 'Your streak: {n}',
      bestScore: 'Best score: {n}',
      howTitle: 'How to play',
      how1: 'Type a five-letter word and press Enter. The tiles then show how close you are.',
      legCorrect: 'Solid cyan: right letter, right spot.',
      legPresent: 'Magenta ring: in the word, wrong spot.',
      legAbsent: 'Dim slate: not in the word.',
      how2: 'French words are typed without accents: É is E, Ç is C.',
      how3: 'A new daily word arrives at midnight, Eastern time. Press Esc to pause.',
      loading: 'Loading words…',
      loadError: 'The word lists couldn’t load. Reload the page to try again.',
      langShort: 'FR',
      langAria: 'Passer en français',
      settings: 'Settings',
      menu: 'Main menu',
      pauseAria: 'Pause',
      soundOn: 'Turn sound on',
      soundOff: 'Mute sound',
      boardAria: 'Game board',
      keyboardAria: 'Keyboard',
      enter: 'Enter',
      backspace: 'Delete letter',
      paused: 'Paused',
      pauseHint: 'Press Esc or P to resume.',
      resume: 'Resume',
      notEnough: 'Not enough letters',
      notInList: 'Not in the word list',
      rowLabel: 'Guess {n}: {w}. {d}',
      stCorrect: 'right spot',
      stPresent: 'wrong spot',
      stAbsent: 'not in word',
      wins: ['Flawless', 'Brilliant', 'Sharp', 'Nicely done', 'Solid', 'Phew, just in time'],
      lost: 'Out of tries',
      theWordWas: 'The word was',
      solvedIn: 'Solved in {n} of 6 tries',
      solvedIn1: 'Solved on the first try',
      triesUsed: 'All 6 tries used',
      played: 'Played',
      winPct: 'Win %',
      streak: 'Streak',
      maxStreak: 'Best streak',
      runScore: 'Run score',
      best: 'Best',
      distribution: 'Guess distribution',
      plusPoints: '+{n} points',
      runOver: 'Run over. Final score: {n} points.',
      newBest: 'New best score!',
      nextIn: 'Next word in',
      newDay: 'A new daily word is ready.',
      copy: 'Copy result',
      copied: 'Result copied',
      copyFail: 'Couldn’t copy. Select the text below instead.',
      nextWord: 'Next word',
      newRun: 'New run',
      playEndless: 'Play Endless',
      playToday: 'Play today’s word',
      close: 'Close',
      showResults: 'Show results',
      points: 'points',
      pts: 'pts',
      sound: 'Sound',
      on: 'On',
      off: 'Off',
      layout: 'Keyboard for French words',
      layoutNote: 'English words always use QWERTY. Most Quebec keyboards are QWERTY too.',
      switchTitle: 'Switch to French?',
      switchBody: 'The words and the interface will change to French. Your English board is saved for later.',
      switchOk: 'Switch to French',
      switchCancel: 'Keep playing',
      shareDaily: 'Daily',
      shareEndless: 'Endless'
    },
    fr: {
      tagline: 'Trouvez le mot mystère de cinq lettres en six essais, en français ou en anglais.',
      chooseMode: 'Choisissez un mode',
      daily: 'Quotidien',
      endless: 'Infini',
      dailyDesc: 'Un mot par jour, le même pour tout le monde.',
      dailyContinue: 'Poursuivez le mot du jour.',
      dailyDone: 'Terminé pour aujourd’hui. Nouveau mot dans {t}.',
      endlessDesc: 'Un mot après l’autre. Moins d’essais, plus de points.',
      endlessResume: 'Votre partie vous attend : {n} points jusqu’ici.',
      yourStreak: 'Votre série : {n}',
      bestScore: 'Votre record : {n}',
      howTitle: 'Comment jouer',
      how1: 'Tapez un mot de cinq lettres, puis appuyez sur Entrée. Les tuiles indiquent ensuite si vous brûlez.',
      legCorrect: 'Cyan plein : bonne lettre, bonne place.',
      legPresent: 'Anneau magenta : dans le mot, mal placée.',
      legAbsent: 'Ardoise pâle : absente du mot.',
      how2: 'Tapez les mots sans accents : É s’écrit E, Ç s’écrit C.',
      how3: 'Un nouveau mot du jour arrive à minuit, heure de l’Est. Appuyez sur Échap pour mettre en pause.',
      loading: 'Chargement des mots…',
      loadError: 'Les listes de mots n’ont pas pu être chargées. Rechargez la page pour réessayer.',
      langShort: 'EN',
      langAria: 'Switch to English',
      settings: 'Paramètres',
      menu: 'Menu principal',
      pauseAria: 'Mettre en pause',
      soundOn: 'Activer le son',
      soundOff: 'Couper le son',
      boardAria: 'Grille de jeu',
      keyboardAria: 'Clavier',
      enter: 'Entrée',
      backspace: 'Effacer une lettre',
      paused: 'En pause',
      pauseHint: 'Appuyez sur Échap ou P pour reprendre.',
      resume: 'Reprendre',
      notEnough: 'Il manque des lettres',
      notInList: 'Mot inconnu',
      rowLabel: 'Essai {n} : {w}. {d}',
      stCorrect: 'bonne place',
      stPresent: 'mal placée',
      stAbsent: 'absente',
      wins: ['Du premier coup!', 'Brillant', 'Bien vu', 'Bien joué', 'Solide', 'Ouf, de justesse'],
      lost: 'Plus d’essais',
      theWordWas: 'Le mot était',
      solvedIn: 'Trouvé en {n} essais sur 6',
      solvedIn1: 'Trouvé du premier coup',
      triesUsed: 'Les 6 essais sont épuisés',
      played: 'Parties',
      winPct: '% victoires',
      streak: 'Série',
      maxStreak: 'Meilleure série',
      runScore: 'Pointage',
      best: 'Record',
      distribution: 'Répartition des essais',
      plusPoints: '+{n} points',
      runOver: 'Partie terminée. Pointage final : {n} points.',
      newBest: 'Nouveau record!',
      nextIn: 'Nouveau mot dans',
      newDay: 'Un nouveau mot du jour est prêt.',
      copy: 'Copier le résultat',
      copied: 'Résultat copié',
      copyFail: 'La copie a échoué. Sélectionnez plutôt le texte ci-dessous.',
      nextWord: 'Mot suivant',
      newRun: 'Nouvelle partie',
      playEndless: 'Jouer en mode Infini',
      playToday: 'Jouer le mot du jour',
      close: 'Fermer',
      showResults: 'Voir les résultats',
      points: 'points',
      pts: 'pts',
      sound: 'Son',
      on: 'Activé',
      off: 'Désactivé',
      layout: 'Clavier pour les mots en français',
      layoutNote: 'Les mots anglais utilisent toujours QWERTY. La plupart des claviers québécois sont aussi en QWERTY.',
      switchTitle: 'Passer à l’anglais?',
      switchBody: 'Les mots et l’interface passeront à l’anglais. Votre grille en français est sauvegardée.',
      switchOk: 'Passer à l’anglais',
      switchCancel: 'Continuer la partie',
      shareDaily: 'Quotidien',
      shareEndless: 'Infini'
    }
  };

  var LAYOUTS = {
    qwerty: ['QWERTYUIOP', 'ASDFGHJKL', '>ZXCVBNM<'],
    azerty: ['AZERTYUIOP', 'QSDFGHJKLM', '>WXCVBN<']
  };

  /* ================================================================
   * Storage (every access guarded; in-memory fallback when blocked)
   * ================================================================ */

  var PREFIX = 'vg.lexi-duel.';
  var memStore = {};
  var store = {
    get: function (key, fallback) {
      var raw = null;
      try { raw = window.localStorage.getItem(PREFIX + key); } catch (e) { raw = null; }
      if (raw == null && Object.prototype.hasOwnProperty.call(memStore, key)) raw = memStore[key];
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set: function (key, value) {
      var raw;
      try { raw = JSON.stringify(value); } catch (e) { return; }
      memStore[key] = raw;
      try { window.localStorage.setItem(PREFIX + key, raw); } catch (e) { /* blocked or full */ }
    }
  };

  /* ================================================================
   * State
   * ================================================================ */

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var reduceMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(reduceMotionMQ && reduceMotionMQ.matches); }

  var savedSettings = store.get('settings', {}) || {};
  var state = {
    lang: 'en',
    layoutFr: savedSettings.layoutFr === 'azerty' ? 'azerty' : 'qwerty',
    muted: !!savedSettings.muted,
    screen: 'title',
    mode: 'daily',
    words: {},
    loading: {},
    round: null,
    run: null,
    revealing: false,
    paused: false,
    modal: null,
    today: dateKeyAt(Date.now()),
    lastFocus: null
  };

  function detectLang() {
    var param = null;
    try { param = new URLSearchParams(window.location.search).get('lang'); } catch (e) { param = null; }
    if (param === 'fr' || param === 'en') return param;
    if (savedSettings.lang === 'fr' || savedSettings.lang === 'en') return savedSettings.lang;
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return /^fr/i.test(nav) ? 'fr' : 'en';
  }

  function saveSettings() {
    store.set('settings', { lang: state.lang, layoutFr: state.layoutFr, muted: state.muted });
  }

  function t(key, vars) {
    var s = STR[state.lang][key];
    if (s == null) s = STR.en[key];
    if (vars && typeof s === 'string') {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    }
    return s;
  }

  /* ================================================================
   * Sound (Web Audio, generated; starts only after a user gesture)
   * ================================================================ */

  var Sound = (function () {
    var ctx = null, master = null;
    function ensure() {
      if (ctx) { if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {}); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; }
    }
    function tone(freq, dur, o) {
      o = o || {};
      if (!ctx || state.muted) return;
      try {
        var t0 = ctx.currentTime + (o.delay || 0);
        var osc = ctx.createOscillator(), g = ctx.createGain();
        osc.type = o.type || 'sine';
        osc.frequency.setValueAtTime(freq, t0);
        if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(o.vol || 0.4, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g); g.connect(master);
        osc.start(t0); osc.stop(t0 + dur + 0.03);
      } catch (e) { /* ignore */ }
    }
    return {
      ensure: ensure,
      key: function () { tone(540, 0.05, { type: 'triangle', vol: 0.22 }); },
      del: function () { tone(320, 0.07, { type: 'triangle', vol: 0.18, slide: 220 }); },
      ui: function () { tone(720, 0.05, { type: 'sine', vol: 0.18 }); },
      reveal: function (s) {
        if (s === 'correct') tone(880, 0.12, { type: 'triangle', vol: 0.3 });
        else if (s === 'present') tone(622, 0.12, { type: 'triangle', vol: 0.26 });
        else tone(196, 0.1, { type: 'sine', vol: 0.22 });
      },
      invalid: function () {
        tone(150, 0.08, { type: 'square', vol: 0.09 });
        tone(128, 0.12, { type: 'square', vol: 0.09, delay: 0.1 });
      },
      win: function () {
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.24, { type: 'triangle', vol: 0.32, delay: i * 0.09 }); });
      },
      lose: function () {
        [392, 329.63, 261.63].forEach(function (f, i) { tone(f, 0.32, { type: 'sine', vol: 0.28, delay: i * 0.17 }); });
      }
    };
  })();

  function firstGesture() {
    Sound.ensure();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, firstGesture, { capture: true, passive: true });
  });

  function toggleSound() {
    state.muted = !state.muted;
    saveSettings();
    if (!state.muted) { Sound.ensure(); Sound.ui(); }
    paintSoundButtons();
    if (state.modal && state.modal.kind === 'settings') renderSettings();
  }

  function paintSoundButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sound-btn]'), function (b) {
      b.classList.toggle('is-muted', state.muted);
      b.setAttribute('aria-label', state.muted ? t('soundOn') : t('soundOff'));
      b.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    });
  }

  /* ================================================================
   * Word lists
   * ================================================================ */

  function fetchText(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.text();
    });
  }

  function loadWords(lang) {
    if (state.words[lang]) return Promise.resolve(state.words[lang]);
    if (state.loading[lang]) return state.loading[lang];
    var p = Promise.all([fetchText('words/' + lang + '-valid.txt'), fetchText('words/' + lang + '-answers.txt')])
      .then(function (txt) {
        var valid = new Set();
        txt[0].split(/\r?\n/).forEach(function (w) { w = normalizeWord(w.trim()); if (/^[A-Z]{5}$/.test(w)) valid.add(w); });
        var answers = [], display = {}, seen = {};
        txt[1].split(/\r?\n/).forEach(function (raw) {
          raw = raw.trim();
          if (!raw || raw.charAt(0) === '#') return;
          var n = normalizeWord(raw);
          if (!/^[A-Z]{5}$/.test(n) || seen[n] || !valid.has(n)) return;
          seen[n] = true;
          answers.push(n);
          display[n] = raw.toLocaleUpperCase(lang === 'fr' ? 'fr-CA' : 'en-CA');
        });
        var data = { valid: valid, answers: answers, display: display };
        state.words[lang] = data;
        return data;
      });
    state.loading[lang] = p;
    p.catch(function () { delete state.loading[lang]; });
    return p;
  }

  /* ================================================================
   * DOM helpers
   * ================================================================ */

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'text') n.textContent = v;
        else if (k === 'class') n.className = v;
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function fmtHMS(ms) {
    var s = Math.ceil(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(h) + ':' + p(m) + ':' + p(sec);
  }

  function announce(msg) {
    var live = $('sr-live');
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 30);
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var tEl = $('toast');
    tEl.textContent = msg;
    tEl.classList.add('show');
    announce(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { tEl.classList.remove('show'); }, ms || 1600);
  }

  /* ================================================================
   * i18n painting
   * ================================================================ */

  function applyI18n() {
    document.documentElement.lang = state.lang === 'fr' ? 'fr-CA' : 'en-CA';
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria]'), function (n) {
      n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria')));
    });
    paintSoundButtons();
    paintTitle();
    if (state.screen === 'game') { buildKeyboard(); paintKeyboard(); paintStatus(); paintRoundBar(); }
  }

  /* ================================================================
   * Stats
   * ================================================================ */

  function blankStats() {
    return { played: 0, wins: 0, cur: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], lastDay: null, lastWinDay: null, best: 0 };
  }

  function getStats(mode, lang) {
    var s = store.get('stats.' + mode + '.' + lang, null);
    var b = blankStats();
    if (!s || typeof s !== 'object') return b;
    Object.keys(b).forEach(function (k) { if (s[k] == null) s[k] = b[k]; });
    if (!Array.isArray(s.dist) || s.dist.length !== 6) s.dist = b.dist;
    return s;
  }

  function setStats(mode, lang, s) { store.set('stats.' + mode + '.' + lang, s); }

  /** The daily streak still counts if the last win was today or yesterday. */
  function liveDailyStreak(s) {
    if (!s.lastWinDay) return 0;
    var gap = dayNumber(state.today) - dayNumber(s.lastWinDay);
    return gap <= 1 ? s.cur : 0;
  }

  /* ================================================================
   * Title screen
   * ================================================================ */

  function savedDaily(lang) {
    var d = store.get('daily.' + lang, null);
    return d && d.day === state.today ? d : null;
  }

  function savedRun(lang) {
    var r = store.get('endless.' + lang, null);
    return r && typeof r === 'object' && typeof r.answer === 'string' ? r : null;
  }

  function paintTitle() {
    var words = state.words[state.lang];
    var dailyDesc = $('daily-desc'), dailyStat = $('daily-stat');
    var endDesc = $('endless-desc'), endStat = $('endless-stat');
    var ds = getStats('daily', state.lang), es = getStats('endless', state.lang);
    var d = savedDaily(state.lang);
    dailyDesc.textContent = '';
    if (d && d.done) {
      var parts = t('dailyDone', { t: '\u0000' }).split('\u0000');
      dailyDesc.appendChild(document.createTextNode(parts[0]));
      dailyDesc.appendChild(el('span', { class: 'countdown', 'data-countdown': '' , text: fmtHMS(msUntilNextDay(Date.now())) }));
      dailyDesc.appendChild(document.createTextNode(parts[1] || ''));
    } else if (d && d.guesses && d.guesses.length) {
      dailyDesc.textContent = t('dailyContinue');
    } else {
      dailyDesc.textContent = t('dailyDesc');
    }
    dailyStat.textContent = t('yourStreak', { n: liveDailyStreak(ds) });
    var run = savedRun(state.lang);
    endDesc.textContent = run && !run.over && run.score > 0 ? t('endlessResume', { n: run.score }) : t('endlessDesc');
    endStat.textContent = t('bestScore', { n: es.best || 0 });

    var ready = !!words;
    $('btn-daily').disabled = !ready;
    $('btn-endless').disabled = !ready;
    var msg = $('load-msg');
    if (state.loadError) { msg.textContent = t('loadError'); msg.classList.add('is-error'); }
    else if (!ready) { msg.textContent = t('loading'); msg.classList.remove('is-error'); }
    else { msg.textContent = ''; msg.classList.remove('is-error'); }
  }

  function showScreen(name) {
    state.screen = name;
    $('screen-title').hidden = name !== 'title';
    $('screen-game').hidden = name !== 'game';
    app.setAttribute('data-screen', name);
    if (name === 'title') { setPaused(false); paintTitle(); }
    fit();
  }

  /* ================================================================
   * Rounds
   * ================================================================ */

  function newRound(answer, extra) {
    var r = { answer: answer, guesses: [], results: [], current: '', done: false, won: false, counted: false };
    if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
    return r;
  }

  function restoreGuesses(r, data) {
    var words = state.words[state.lang];
    (data.guesses || []).slice(0, MAX_TRIES).forEach(function (g) {
      g = normalizeWord(g);
      if (!/^[A-Z]{5}$/.test(g) || !words.valid.has(g)) return;
      r.guesses.push(g);
      r.results.push(scoreGuess(g, r.answer));
    });
    var last = r.guesses[r.guesses.length - 1];
    r.won = last === r.answer;
    r.done = r.won || r.guesses.length >= MAX_TRIES;
    r.counted = !!data.counted && r.done;
  }

  function setupDaily() {
    var words = state.words[state.lang];
    state.today = dateKeyAt(Date.now());
    var answer = pickDaily(words.answers, state.today, state.lang);
    var r = newRound(answer, { day: state.today });
    var saved = store.get('daily.' + state.lang, null);
    if (saved && saved.day === state.today && saved.answer === answer) restoreGuesses(r, saved);
    state.round = r;
    state.run = null;
    if (r.done && !r.counted) finishStats(r);
    saveRound();
  }

  function pickEndlessAnswer(recent) {
    var words = state.words[state.lang];
    var pool = words.answers.filter(function (w) { return recent.indexOf(w) === -1; });
    if (!pool.length) pool = words.answers;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function setupEndless(fresh) {
    var words = state.words[state.lang];
    var saved = fresh ? null : savedRun(state.lang);
    var run = { score: 0, streak: 0, recent: [], over: false };
    var r = null;
    if (saved && words.valid.has(normalizeWord(saved.answer)) && words.answers.indexOf(normalizeWord(saved.answer)) !== -1) {
      run.score = +saved.score || 0;
      run.streak = +saved.streak || 0;
      run.recent = Array.isArray(saved.recent) ? saved.recent.slice(-120) : [];
      run.over = !!saved.over;
      run.lastPoints = +saved.lastPoints || 0;
      r = newRound(normalizeWord(saved.answer));
      restoreGuesses(r, saved);
      if (r.done && !r.counted) { state.run = run; state.round = r; finishStats(r); }
    }
    if (!r || (run.over && fresh)) {
      r = newRound(pickEndlessAnswer(run.recent));
    }
    state.run = run;
    state.round = r;
    saveRound();
  }

  function nextEndless() {
    var run = state.run;
    if (!run || run.over) { run = { score: 0, streak: 0, recent: run ? run.recent : [], over: false }; }
    run.lastPoints = 0;
    state.run = run;
    state.round = newRound(pickEndlessAnswer(run.recent));
    saveRound();
    renderGame();
  }

  function saveRound() {
    var r = state.round;
    if (!r) return;
    if (state.mode === 'daily') {
      store.set('daily.' + state.lang, { day: r.day, answer: r.answer, guesses: r.guesses, counted: r.counted, done: r.done, won: r.won });
    } else {
      var run = state.run;
      store.set('endless.' + state.lang, {
        answer: r.answer, guesses: r.guesses, counted: r.counted, done: r.done, won: r.won,
        score: run.score, streak: run.streak, recent: run.recent, over: run.over, lastPoints: run.lastPoints || 0
      });
    }
  }

  function finishStats(r) {
    var tries = r.guesses.length;
    if (state.mode === 'daily') {
      var s = getStats('daily', state.lang);
      if (s.lastDay !== r.day) {
        s.played++;
        if (r.won) {
          s.wins++;
          s.dist[tries - 1]++;
          var consecutive = s.lastWinDay && dayNumber(r.day) - dayNumber(s.lastWinDay) === 1;
          s.cur = consecutive ? s.cur + 1 : 1;
          s.max = Math.max(s.max, s.cur);
          s.lastWinDay = r.day;
        } else {
          s.cur = 0;
        }
        s.lastDay = r.day;
        setStats('daily', state.lang, s);
      }
    } else {
      var e = getStats('endless', state.lang), run = state.run;
      e.played++;
      run.newBest = false;
      if (r.won) {
        e.wins++;
        e.dist[tries - 1]++;
        run.lastPoints = pointsFor(tries);
        run.score += run.lastPoints;
        run.streak++;
        e.cur = run.streak;
        e.max = Math.max(e.max, run.streak);
      } else {
        run.lastPoints = 0;
        run.over = true;
        run.streak = 0;
        e.cur = 0;
      }
      if (run.score > (e.best || 0)) { e.best = run.score; run.newBest = true; }
      run.recent.push(r.answer);
      if (run.recent.length > 120) run.recent = run.recent.slice(-120);
      setStats('endless', state.lang, e);
    }
    r.counted = true;
  }

  /* ================================================================
   * Game rendering
   * ================================================================ */

  var tileEls = [];   // [row][col]
  var rowEls = [];

  function buildBoard() {
    var board = $('board');
    board.textContent = '';
    tileEls = []; rowEls = [];
    for (var r = 0; r < MAX_TRIES; r++) {
      var row = el('div', { class: 'row', role: 'group' });
      var tiles = [];
      for (var c = 0; c < WORD_LEN; c++) {
        var tile = el('div', { class: 'tile', 'data-state': 'empty', 'aria-hidden': 'true' });
        row.appendChild(tile);
        tiles.push(tile);
      }
      board.appendChild(row);
      rowEls.push(row);
      tileEls.push(tiles);
    }
  }

  function setTile(tile, letter, st) {
    tile.textContent = letter || '';
    tile.setAttribute('data-state', st);
  }

  function rowLabel(i) {
    var r = state.round, g = r.guesses[i];
    var names = { correct: t('stCorrect'), present: t('stPresent'), absent: t('stAbsent') };
    var desc = r.results[i].map(function (s, k) { return g[k] + ' ' + names[s]; }).join(', ');
    return t('rowLabel', { n: i + 1, w: g, d: desc });
  }

  function paintBoard() {
    var r = state.round;
    for (var i = 0; i < MAX_TRIES; i++) {
      var g = r.guesses[i];
      for (var c = 0; c < WORD_LEN; c++) {
        if (g) setTile(tileEls[i][c], g[c], r.results[i][c]);
        else if (i === r.guesses.length && !r.done) setTile(tileEls[i][c], r.current[c] || '', r.current[c] ? 'tbd' : 'empty');
        else setTile(tileEls[i][c], '', 'empty');
      }
      if (g) rowEls[i].setAttribute('aria-label', rowLabel(i));
      else rowEls[i].removeAttribute('aria-label');
      rowEls[i].classList.toggle('is-active', i === r.guesses.length && !r.done);
    }
  }

  function activeLayout() {
    return state.lang === 'fr' && state.layoutFr === 'azerty' ? LAYOUTS.azerty : LAYOUTS.qwerty;
  }

  var backspaceSVG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5l5 5M17 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function buildKeyboard() {
    var kb = $('keyboard');
    kb.textContent = '';
    activeLayout().forEach(function (rowStr) {
      var row = el('div', { class: 'kb-row' });
      var units = 0;
      rowStr.split('').forEach(function (ch) { units += (ch === '>' || ch === '<') ? 1.5 : 1; });
      var pad = (10 - units) / 2;
      function spacer() { var sp = el('span', { class: 'kb-pad', 'aria-hidden': 'true' }); sp.style.flexGrow = String(pad); return sp; }
      if (pad > 0) row.appendChild(spacer());
      rowStr.split('').forEach(function (ch) {
        var b;
        if (ch === '>') {
          b = el('button', { type: 'button', class: 'key key-wide key-enter', 'data-key': 'Enter', tabindex: '-1', text: t('enter') });
        } else if (ch === '<') {
          b = el('button', { type: 'button', class: 'key key-wide key-back', 'data-key': 'Backspace', tabindex: '-1', 'aria-label': t('backspace') });
          b.innerHTML = backspaceSVG;
        } else {
          b = el('button', { type: 'button', class: 'key', 'data-key': ch, 'data-state': 'unused', tabindex: '-1', text: ch });
        }
        row.appendChild(b);
      });
      if (pad > 0) row.appendChild(spacer());
      kb.appendChild(row);
    });
  }

  function paintKeyboard() {
    var r = state.round;
    if (!r) return;
    var map = keyStates(r.guesses, r.results);
    Array.prototype.forEach.call($('keyboard').querySelectorAll('.key[data-state]'), function (k) {
      k.setAttribute('data-state', map[k.getAttribute('data-key')] || 'unused');
    });
  }

  function paintStatus() {
    $('status-mode').textContent = state.mode === 'daily' ? t('daily') : t('endless');
    var sub = $('status-sub');
    sub.textContent = '';
    if (state.mode === 'daily') {
      sub.appendChild(el('span', { text: t('streak') + ' ' + liveDailyStreak(getStats('daily', state.lang)) }));
    } else if (state.run) {
      sub.appendChild(el('span', { text: state.run.score + ' ' + t('pts') }));
      sub.appendChild(el('span', { text: t('streak') + ' ' + state.run.streak }));
    }
  }

  function paintRoundBar() {
    var r = state.round, bar = $('round-bar');
    var show = !!(r && r.done && !state.revealing);
    if (bar.hidden === show) { bar.hidden = !show; fit(); }
    var next = $('round-next');
    if (state.mode === 'endless') next.textContent = state.run && state.run.over ? t('newRun') : t('nextWord');
    else next.textContent = dateKeyAt(Date.now()) !== (r && r.day) ? t('playToday') : t('playEndless');
  }

  function renderGame() {
    if (!tileEls.length) buildBoard();
    buildKeyboard();
    paintBoard();
    paintKeyboard();
    paintStatus();
    paintRoundBar();
    fit();
  }

  /* ================================================================
   * Input and turns
   * ================================================================ */

  function roundActive() {
    var r = state.round;
    return !!(state.screen === 'game' && r && !r.done && !state.paused && !state.modal);
  }

  function animate(node, frames, opts) {
    if (reducedMotion() || !node.animate) return null;
    try { return node.animate(frames, opts); } catch (e) { return null; }
  }

  function addLetter(ch) {
    if (!roundActive() || state.revealing) return;
    var r = state.round;
    if (r.current.length >= WORD_LEN) return;
    r.current += ch;
    var tile = tileEls[r.guesses.length][r.current.length - 1];
    setTile(tile, ch, 'tbd');
    animate(tile, [{ transform: 'scale(1)' }, { transform: 'scale(1.09)' }, { transform: 'scale(1)' }], { duration: 110, easing: 'ease-out' });
    Sound.key();
  }

  function removeLetter() {
    if (!roundActive() || state.revealing) return;
    var r = state.round;
    if (!r.current.length) return;
    setTile(tileEls[r.guesses.length][r.current.length - 1], '', 'empty');
    r.current = r.current.slice(0, -1);
    Sound.del();
  }

  function rejectRow(msg) {
    var row = rowEls[state.round.guesses.length];
    toast(msg, 1400);
    Sound.invalid();
    if (reducedMotion()) {
      row.classList.add('is-invalid');
      setTimeout(function () { row.classList.remove('is-invalid'); }, 700);
    } else {
      animate(row, [
        { transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }
      ], { duration: 380, easing: 'ease-in-out' });
    }
  }

  function submit() {
    if (!roundActive() || state.revealing) return;
    var r = state.round, words = state.words[state.lang];
    if (r.current.length < WORD_LEN) { rejectRow(t('notEnough')); return; }
    if (!words.valid.has(r.current)) { rejectRow(t('notInList')); return; }
    var guess = r.current, result = scoreGuess(guess, r.answer), rowIndex = r.guesses.length;
    r.guesses.push(guess);
    r.results.push(result);
    r.current = '';
    r.won = guess === r.answer;
    r.done = r.won || r.guesses.length >= MAX_TRIES;
    if (r.done) finishStats(r);
    saveRound();
    state.revealing = true;
    rowEls[rowIndex].classList.remove('is-active');
    revealRow(rowIndex, guess, result).then(function () {
      state.revealing = false;
      rowEls[rowIndex].setAttribute('aria-label', rowLabel(rowIndex));
      announce(rowLabel(rowIndex));
      paintKeyboard();
      paintStatus();
      if (r.done) endRound(rowIndex);
      else paintBoard();
    });
  }

  function revealRow(rowIndex, guess, result) {
    var tiles = tileEls[rowIndex];
    return new Promise(function (resolve) {
      if (reducedMotion()) {
        tiles.forEach(function (tile, i) { setTile(tile, guess[i], result[i]); });
        Sound.reveal(result.indexOf('correct') >= 0 ? 'correct' : result.indexOf('present') >= 0 ? 'present' : 'absent');
        setTimeout(resolve, 120);
        return;
      }
      tiles.forEach(function (tile, i) {
        setTimeout(function () {
          tile.classList.add('is-flipping');
          setTimeout(function () { setTile(tile, guess[i], result[i]); Sound.reveal(result[i]); }, 170);
          setTimeout(function () {
            tile.classList.remove('is-flipping');
            if (i === tiles.length - 1) resolve();
          }, 360);
        }, i * 230);
      });
    });
  }

  function endRound(rowIndex) {
    var r = state.round;
    paintBoard();
    var delay = 500;
    if (r.won) {
      Sound.win();
      toast(t('wins')[r.guesses.length - 1], 1500);
      if (!reducedMotion()) {
        tileEls[rowIndex].forEach(function (tile, i) {
          animate(tile, [
            { transform: 'translateY(0)' }, { transform: 'translateY(-14px)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }
          ], { duration: 420, delay: i * 80, easing: 'ease-out' });
        });
        delay = 1100;
      }
    } else {
      Sound.lose();
      toast(state.words[state.lang].display[r.answer] || r.answer, 2200);
      delay = 1300;
    }
    paintRoundBar();
    paintStatus();
    setTimeout(function () {
      if (state.round === r && state.screen === 'game' && !state.modal) openResults();
    }, delay);
  }

  /* ================================================================
   * Modal sheets (results, settings, confirm)
   * ================================================================ */

  function openModal(kind, build, onClose) {
    var modal = $('modal'), sheet = $('sheet');
    if (!state.modal) state.lastFocus = document.activeElement;
    state.modal = { kind: kind, onClose: onClose };
    sheet.textContent = '';
    sheet.className = 'sheet sheet-' + kind;
    build(sheet);
    modal.hidden = false;
    var first = sheet.querySelector('[data-autofocus]') || sheet.querySelector('button');
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
  }

  function closeModal(result) {
    if (!state.modal) return;
    var m = state.modal;
    state.modal = null;
    $('modal').hidden = true;
    $('sheet').textContent = '';
    var lf = state.lastFocus;
    state.lastFocus = null;
    if (lf && lf.focus && document.body.contains(lf) && lf.offsetParent !== null && !lf.classList.contains('key')) {
      try { lf.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (m.onClose) m.onClose(result);
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      openModal('confirm', function (sheet) {
        sheet.appendChild(el('h2', { id: 'sheet-h', text: opts.title }));
        sheet.appendChild(el('p', { class: 'sheet-body', text: opts.body }));
        var row = el('div', { class: 'sheet-actions' });
        var cancel = el('button', { type: 'button', class: 'btn btn-ghost', 'data-autofocus': '', text: opts.cancel });
        var ok = el('button', { type: 'button', class: 'btn btn-primary', text: opts.ok });
        cancel.addEventListener('click', function () { closeModal(false); });
        ok.addEventListener('click', function () { closeModal(true); });
        row.appendChild(cancel); row.appendChild(ok);
        sheet.appendChild(row);
      }, function (res) { resolve(!!res); });
    });
  }

  function statCell(value, label) {
    return el('div', { class: 'stat' }, [el('span', { class: 'stat-v', text: String(value) }), el('span', { class: 'stat-l', text: label })]);
  }

  function buildShareText() {
    var r = state.round, lang = state.lang.toUpperCase();
    var tries = r.won ? r.guesses.length : 'X';
    var head = state.mode === 'daily'
      ? t('shareDaily') + ' ' + lang + ' ' + r.day + ' · ' + tries + '/6'
      : t('shareEndless') + ' ' + lang + ' · ' + tries + '/6 · ' + state.run.score + ' ' + t('points');
    return head + '\n\n' + shareGrid(r.results) + '\n\nLexi Duel · versusgamers.com';
  }

  function legacyCopy(text) {
    try {
      var ta = el('textarea', { readonly: '', 'aria-hidden': 'true' });
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(legacyCopy(text));
  }

  function openResults() {
    var r = state.round;
    if (!r || !r.done) return;
    var words = state.words[state.lang];
    var display = words.display[r.answer] || r.answer;
    var mode = state.mode;
    var s = getStats(mode, state.lang);
    openModal('results', function (sheet) {
      var headline = r.won ? t('wins')[r.guesses.length - 1] : t('lost');
      sheet.appendChild(el('h2', { id: 'sheet-h', class: 'res-head', text: headline }));

      var ans = el('div', { class: 'res-answer' }, [
        el('span', { class: 'res-answer-l', text: t('theWordWas') }),
        el('span', { class: 'res-word' + (r.won ? '' : ' is-lost'), lang: state.lang === 'fr' ? 'fr-CA' : 'en-CA', text: display })
      ]);
      sheet.appendChild(ans);

      var triesTxt = r.won ? (r.guesses.length === 1 ? t('solvedIn1') : t('solvedIn', { n: r.guesses.length })) : t('triesUsed');
      var line = el('p', { class: 'res-tries' }, [triesTxt]);
      if (mode === 'endless' && r.won && state.run.lastPoints) line.appendChild(el('span', { class: 'res-points', text: t('plusPoints', { n: state.run.lastPoints }) }));
      sheet.appendChild(line);
      if (mode === 'endless' && state.run.over) sheet.appendChild(el('p', { class: 'res-note', text: t('runOver', { n: state.run.score }) }));
      if (mode === 'endless' && state.run.newBest && state.run.score > 0) sheet.appendChild(el('p', { class: 'res-note res-best', text: t('newBest') }));

      var grid = el('div', { class: 'stats' });
      var pct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
      grid.appendChild(statCell(s.played, t('played')));
      grid.appendChild(statCell(pct, t('winPct')));
      if (mode === 'daily') {
        grid.appendChild(statCell(liveDailyStreak(s), t('streak')));
        grid.appendChild(statCell(s.max, t('maxStreak')));
      } else {
        grid.appendChild(statCell(state.run.score, t('runScore')));
        grid.appendChild(statCell(s.best || 0, t('best')));
      }
      sheet.appendChild(grid);

      sheet.appendChild(el('h3', { class: 'dist-h', text: t('distribution') }));
      var dist = el('ol', { class: 'dist' });
      var maxD = Math.max.apply(null, s.dist.concat([1]));
      s.dist.forEach(function (count, i) {
        var mine = r.won && r.guesses.length === i + 1;
        var bar = el('span', { class: 'dist-bar' + (mine ? ' is-mine' : ''), text: String(count) });
        bar.style.width = Math.max(9, Math.round((count / maxD) * 100)) + '%';
        dist.appendChild(el('li', { class: 'dist-row' }, [el('span', { class: 'dist-n', text: String(i + 1) }), el('span', { class: 'dist-track' }, [bar])]));
      });
      sheet.appendChild(dist);

      if (mode === 'daily') {
        var cd = el('p', { class: 'res-next' });
        if (dateKeyAt(Date.now()) !== r.day) cd.appendChild(document.createTextNode(t('newDay')));
        else {
          cd.appendChild(el('span', { text: t('nextIn') }));
          cd.appendChild(el('span', { class: 'countdown', 'data-countdown': '', text: fmtHMS(msUntilNextDay(Date.now())) }));
        }
        sheet.appendChild(cd);
      }

      var shareText = buildShareText();
      var fallback = el('textarea', { class: 'share-fallback', readonly: '', rows: '9', hidden: true });
      fallback.value = shareText;
      var copyMsg = el('p', { class: 'copy-msg', role: 'status' });

      var actions = el('div', { class: 'sheet-actions' });
      var copyBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: t('copy') });
      copyBtn.addEventListener('click', function () {
        copyText(shareText).then(function (ok) {
          if (ok) { copyMsg.textContent = t('copied'); fallback.hidden = true; Sound.ui(); }
          else { copyMsg.textContent = t('copyFail'); fallback.hidden = false; fallback.focus(); fallback.select(); }
        });
      });
      var nextBtn = el('button', { type: 'button', class: 'btn btn-primary', 'data-autofocus': '' });
      nextBtn.textContent = $('round-next').textContent;
      nextBtn.addEventListener('click', function () { closeModal(); doNext(); });
      var closeBtn = el('button', { type: 'button', class: 'btn btn-quiet', text: t('close') });
      closeBtn.addEventListener('click', function () { closeModal(); });
      actions.appendChild(copyBtn); actions.appendChild(nextBtn);
      sheet.appendChild(actions);
      sheet.appendChild(copyMsg);
      sheet.appendChild(fallback);
      sheet.appendChild(el('div', { class: 'sheet-foot' }, [closeBtn]));
    });
  }

  function renderSettings() {
    var sheet = $('sheet');
    sheet.textContent = '';
    sheet.appendChild(el('h2', { id: 'sheet-h', text: t('settings') }));

    var soundRow = el('div', { class: 'set-row' });
    soundRow.appendChild(el('span', { class: 'set-l', id: 'set-sound-l', text: t('sound') }));
    var soundBtn = el('button', { type: 'button', class: 'seg-btn is-on' + (state.muted ? ' is-off' : ''), 'aria-pressed': state.muted ? 'false' : 'true', 'aria-labelledby': 'set-sound-l set-sound-v' });
    soundBtn.appendChild(el('span', { id: 'set-sound-v', text: state.muted ? t('off') : t('on') }));
    soundBtn.addEventListener('click', function () { toggleSound(); });
    soundRow.appendChild(soundBtn);
    sheet.appendChild(soundRow);

    var layRow = el('div', { class: 'set-row set-col' });
    layRow.appendChild(el('span', { class: 'set-l', id: 'set-lay-l', text: t('layout') }));
    var seg = el('div', { class: 'seg', role: 'group', 'aria-labelledby': 'set-lay-l' });
    ['qwerty', 'azerty'].forEach(function (lay) {
      var b = el('button', { type: 'button', class: 'seg-opt' + (state.layoutFr === lay ? ' is-selected' : ''), 'aria-pressed': state.layoutFr === lay ? 'true' : 'false', text: lay.toUpperCase() });
      b.addEventListener('click', function () {
        state.layoutFr = lay;
        saveSettings();
        if (state.screen === 'game') { buildKeyboard(); paintKeyboard(); }
        renderSettings();
        var again = $('sheet').querySelectorAll('.seg-opt')[lay === 'qwerty' ? 0 : 1];
        if (again) again.focus();
      });
      seg.appendChild(b);
    });
    layRow.appendChild(seg);
    layRow.appendChild(el('p', { class: 'set-note', text: t('layoutNote') }));
    sheet.appendChild(layRow);

    var close = el('button', { type: 'button', class: 'btn btn-primary', 'data-autofocus': '', text: t('close') });
    close.addEventListener('click', function () { closeModal(); });
    sheet.appendChild(el('div', { class: 'sheet-actions' }, [close]));
  }

  function openSettings() {
    openModal('settings', function () { renderSettings(); });
  }

  /* ================================================================
   * Pause
   * ================================================================ */

  function setPaused(on) {
    if (on && state.screen !== 'game') return;
    state.paused = !!on;
    $('screen-game').classList.toggle('is-paused', state.paused);
    $('pause').hidden = !state.paused;
    if (state.paused) {
      var b = $('pause').querySelector('button');
      if (b) { try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }
    } else if (document.activeElement && $('pause').contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  function togglePause() { setPaused(!state.paused); }

  /* ================================================================
   * Language
   * ================================================================ */

  function updateUrlLang() {
    try {
      var u = new URL(window.location.href);
      if (u.searchParams.get('lang') !== state.lang) {
        u.searchParams.set('lang', state.lang);
        window.history.replaceState(null, '', u.toString());
      }
    } catch (e) { /* ignore */ }
  }

  function setLang(lang) {
    state.lang = lang;
    saveSettings();
    updateUrlLang();
    applyI18n();
    return loadWords(lang).then(function () {
      state.loadError = false;
      if (state.screen === 'game') startMode(state.mode);
      else paintTitle();
      preloadOther();
    }, function () {
      state.loadError = true;
      if (state.screen === 'game') showScreen('title');
      paintTitle();
    });
  }

  function requestLangSwitch() {
    var target = state.lang === 'fr' ? 'en' : 'fr';
    var r = state.round;
    var midRound = state.screen === 'game' && r && !r.done && (r.guesses.length > 0 || r.current.length > 0);
    if (!midRound) { setLang(target); return; }
    var wasPaused = state.paused;
    confirmDialog({ title: t('switchTitle'), body: t('switchBody'), ok: t('switchOk'), cancel: t('switchCancel') }).then(function (ok) {
      if (ok) { setPaused(false); setLang(target); }
      else if (!wasPaused) setPaused(false);
    });
  }

  function preloadOther() {
    var other = state.lang === 'fr' ? 'en' : 'fr';
    setTimeout(function () { loadWords(other).catch(function () {}); }, 600);
  }

  /* ================================================================
   * Modes and navigation
   * ================================================================ */

  function startMode(mode) {
    state.mode = mode;
    setPaused(false);
    return loadWords(state.lang).then(function () {
      if (mode === 'daily') setupDaily(); else setupEndless(false);
      showScreen('game');
      renderGame();
    });
  }

  function doNext() {
    if (state.mode === 'endless') { nextEndless(); return; }
    var r = state.round;
    if (r && dateKeyAt(Date.now()) !== r.day) { startMode('daily'); return; }
    startMode('endless');
  }

  /* ================================================================
   * Events
   * ================================================================ */

  function handleAction(action) {
    switch (action) {
      case 'daily': Sound.ui(); startMode('daily'); break;
      case 'endless': Sound.ui(); startMode('endless'); break;
      case 'menu': Sound.ui(); showScreen('title'); break;
      case 'pause': togglePause(); break;
      case 'resume': setPaused(false); break;
      case 'sound': toggleSound(); break;
      case 'lang': requestLangSwitch(); break;
      case 'settings': openSettings(); break;
      case 'results': openResults(); break;
      case 'next': doNext(); break;
    }
  }

  app.addEventListener('click', function (e) {
    var key = e.target.closest ? e.target.closest('.key') : null;
    if (key && $('keyboard').contains(key)) {
      var k = key.getAttribute('data-key');
      if (k === 'Enter') submit();
      else if (k === 'Backspace') removeLetter();
      else addLetter(k);
      return;
    }
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (btn && !btn.disabled) {
      handleAction(btn.getAttribute('data-action'));
      // Mouse/touch clicks shouldn't leave focus on header buttons, or Enter would re-trigger them.
      if (e.detail > 0 && !$('modal').contains(btn) && !$('pause').contains(btn) && btn.blur) btn.blur();
    }
  });

  // Keep the virtual keyboard from stealing focus.
  $('keyboard').addEventListener('mousedown', function (e) { e.preventDefault(); });
  // No long-press menus / double-tap zoom on keys.
  $('keyboard').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  $('keyboard').addEventListener('dblclick', function (e) { e.preventDefault(); });

  $('modal').addEventListener('click', function (e) {
    if (e.target === $('modal') && state.modal && state.modal.kind !== 'confirm') closeModal();
  });

  function trapFocus(e, container) {
    var f = Array.prototype.filter.call(container.querySelectorAll('button, textarea, [tabindex]:not([tabindex="-1"])'), function (n) {
      return !n.disabled && !n.hidden && n.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!container.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  function isLetterKey(e, ch) { return e.key === ch || e.key === ch.toUpperCase(); }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var key = e.key;
    var inField = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');

    if (state.modal) {
      if (key === 'Escape') { e.preventDefault(); closeModal(false); }
      else if (key === 'Tab') trapFocus(e, $('sheet'));
      else if (!inField && isLetterKey(e, 'm')) toggleSound();
      return;
    }
    if (state.screen !== 'game') {
      if (isLetterKey(e, 'm')) toggleSound();
      return;
    }
    if (key === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (state.paused) {
      if (key === 'Tab') trapFocus(e, $('pause'));
      else if (isLetterKey(e, 'p')) { e.preventDefault(); setPaused(false); }
      else if (isLetterKey(e, 'm')) toggleSound();
      return;
    }
    // Round over: P and M act as shortcuts. During a round, every letter types.
    if (!roundActive()) {
      if (isLetterKey(e, 'p')) { e.preventDefault(); setPaused(true); }
      else if (isLetterKey(e, 'm')) toggleSound();
      return;
    }
    if (state.revealing) { if (key.length === 1 || key === 'Enter' || key === 'Backspace') e.preventDefault(); return; }
    if (key === 'Enter') {
      var a = document.activeElement;
      if (a && a !== document.body && a.tagName === 'BUTTON' && !a.classList.contains('key')) return; // let the focused button act
      e.preventDefault(); submit(); return;
    }
    if (key === 'Backspace' || key === 'Delete') { e.preventDefault(); removeLetter(); return; }
    if (key.length === 1) {
      var n = normalizeWord(key);
      if (/^[A-Z]$/.test(n)) { e.preventDefault(); addLetter(n); }
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && roundActive()) setPaused(true);
  });

  if (reduceMotionMQ && reduceMotionMQ.addEventListener) {
    reduceMotionMQ.addEventListener('change', function () { app.classList.toggle('reduce-motion', reducedMotion()); });
  }

  /* ================================================================
   * Countdown / day rollover
   * ================================================================ */

  function tick() {
    var now = Date.now();
    var left = fmtHMS(msUntilNextDay(now));
    Array.prototype.forEach.call(document.querySelectorAll('[data-countdown]'), function (n) { n.textContent = left; });
    var key = dateKeyAt(now);
    if (key !== state.today) {
      state.today = key;
      if (state.screen === 'title') paintTitle();
      else if (state.mode === 'daily') {
        paintStatus();
        paintRoundBar();
        if (state.round && state.round.done) toast(t('newDay'), 2500);
      }
    }
  }

  /* ================================================================
   * Layout fitting (iframe-friendly: 320px to 1920px, any orientation)
   * ================================================================ */

  var fitQueued = false;
  function fit() {
    var W = app.clientWidth, H = app.clientHeight;
    if (!W || !H) return;
    var game = $('screen-game');
    var side = W / H > 1.45 && H < 600 && W >= 560;
    game.classList.toggle('layout-side', side);
    var keyH = side ? Math.max(44, Math.min(56, Math.floor((H - 96) / 4.6))) : Math.max(44, Math.min(64, Math.round(H * 0.064)));
    app.style.setProperty('--key-h', keyH + 'px');
    if (game.hidden) return;
    var wrap = $('board-wrap');
    var bw = wrap.clientWidth - 16, bh = wrap.clientHeight;
    var gap = Math.min(H, W) < 480 ? 5 : H > 900 ? 9 : 7;
    var tile = Math.floor(Math.min((bw - 4 * gap) / 5, (bh - 5 * gap) / 6));
    var cap = Math.max(72, Math.min(100, Math.round(H * 0.088)));
    tile = Math.max(24, Math.min(cap, tile));
    app.style.setProperty('--tile', tile + 'px');
    app.style.setProperty('--gap', gap + 'px');
  }

  function queueFit() {
    if (fitQueued) return;
    fitQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { fitQueued = false; fit(); });
  }

  window.addEventListener('resize', queueFit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 150); });
  if (window.ResizeObserver) { try { new ResizeObserver(queueFit).observe(app); } catch (e) { /* ignore */ } }

  /* ================================================================
   * Optional background image (assets/bg.webp)
   * ================================================================ */

  function tryBackground() {
    var img = new Image();
    var url;
    try { url = new URL('assets/bg.webp', document.baseURI).href; } catch (e) { url = 'assets/bg.webp'; }
    img.onload = function () {
      var bg = $('bg');
      bg.style.backgroundImage = 'url("' + url + '")';
      app.classList.add('has-bg-image');
    };
    img.onerror = function () { /* keep the CSS background */ };
    img.decoding = 'async';
    img.src = url;
  }

  /* ================================================================
   * Boot
   * ================================================================ */

  function boot() {
    state.lang = detectLang();
    app.classList.toggle('reduce-motion', reducedMotion());
    if (!reducedMotion()) app.classList.add('intro');
    applyI18n();
    showScreen('title');
    tryBackground();
    loadWords(state.lang).then(function () {
      state.loadError = false;
      paintTitle();
      preloadOther();
    }, function () {
      state.loadError = true;
      paintTitle();
    });
    setInterval(tick, 1000);
    setTimeout(function () { app.classList.remove('intro'); }, 2400);
  }

  boot();
})();
