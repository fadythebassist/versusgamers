/* Rift Runner - pure progression math: XP, levels, upgrades, cosmetics, save (de)serialisation.
   No DOM, no storage access. Browser: RR.Progression. Node: module.exports. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.RR = root.RR || {}; root.RR.Progression = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_LEVEL = 30;
  var KEY_PREFIX = 'vg.rift-runner.';

  // XP needed to go from `level` to `level + 1` (rounded to tens). Level 30 is the cap.
  function xpToNext(level) {
    if (level >= MAX_LEVEL) return 0;
    if (level < 1) level = 1;
    return Math.round((80 + 30 * level + 4 * level * level) / 10) * 10;
  }

  // Total XP needed to reach `level` from zero.
  function xpForLevel(level) {
    var total = 0;
    for (var l = 1; l < level && l < MAX_LEVEL; l++) total += xpToNext(l);
    return total;
  }

  function levelInfo(totalXp) {
    totalXp = Math.max(0, Math.floor(totalXp || 0));
    var level = 1, rest = totalXp;
    while (level < MAX_LEVEL && rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
    var need = xpToNext(level);
    return { level: level, into: level >= MAX_LEVEL ? 0 : rest, need: need, frac: level >= MAX_LEVEL ? 1 : rest / need };
  }

  // XP for a run: distance and shards both matter.
  function xpForRun(distance, shardsCollected) {
    distance = Math.max(0, Math.floor(distance || 0));
    shardsCollected = Math.max(0, Math.floor(shardsCollected || 0));
    return Math.floor(distance / 8) + shardsCollected * 3;
  }

  // ---- Upgrades ----
  // unlock: pilot level needed; costs[r] = shards to buy rank r+1.
  var UPGRADES = [
    { id: 'dash',        unlock: 1,  costs: [40, 90, 170, 290, 450] },
    { id: 'magnet',      unlock: 3,  costs: [60, 130, 230, 380, 580] },
    { id: 'shield',      unlock: 5,  costs: [70, 150, 260, 420, 640] },
    { id: 'shardValue',  unlock: 8,  costs: [90, 190, 330, 520, 780] },
    { id: 'startShield', unlock: 12, costs: [160, 380, 700] },
    { id: 'slowmo',      unlock: 16, costs: [110, 240, 420, 680] }
  ];
  var UPG_BY_ID = {};
  for (var ui = 0; ui < UPGRADES.length; ui++) UPG_BY_ID[UPGRADES[ui].id] = UPGRADES[ui];

  function maxRank(id) { var u = UPG_BY_ID[id]; return u ? u.costs.length : 0; }
  function upgradeCost(id, rank) {           // cost to go from `rank` to `rank + 1`; -1 when maxed/unknown
    var u = UPG_BY_ID[id];
    if (!u || rank < 0 || rank >= u.costs.length) return -1;
    return u.costs[rank];
  }

  // Gameplay effects of the current ranks (all pure lookups).
  function effects(upg) {
    upg = upg || {};
    var r = function (id) { return Math.max(0, Math.min(maxRank(id), upg[id] | 0)); };
    return {
      dashCooldown: round2(3.2 - 0.3 * r('dash')),       // seconds
      magnetRadius: round2(0.34 + 0.07 * r('magnet')),   // world units
      magnetTime: 7 + 1.5 * r('magnet'),                 // seconds
      shieldTime: 9 + 3 * r('shield'),                   // seconds
      shardMult: round2(1 + 0.2 * r('shardValue')),
      startShieldTime: 10 * r('startShield'),            // 0 = no starting shield
      slowmoTime: 4 + r('slowmo')                        // seconds
    };
  }
  function round2(v) { return Math.round(v * 100) / 100; }

  function shardsEarned(collected, shardValueRank) {
    collected = Math.max(0, Math.floor(collected || 0));
    return Math.floor(collected * (1 + 0.2 * Math.max(0, shardValueRank | 0)) + 1e-9);
  }

  // ---- Cosmetics ----
  var COLORS = [
    { id: 'cyan', unlock: 1, hex: '#22E4FF' },
    { id: 'magenta', unlock: 4, hex: '#FF2E88' },
    { id: 'solar', unlock: 7, hex: '#FFB13B' },
    { id: 'viper', unlock: 11, hex: '#7DFF6A' },
    { id: 'violet', unlock: 15, hex: '#A98BFF' },
    { id: 'ice', unlock: 19, hex: '#E8F6FF' },
    { id: 'ember', unlock: 23, hex: '#FF6A3D' },
    { id: 'prism', unlock: 28, hex: '#FFFFFF' }
  ];
  var TRAILS = [
    { id: 'ion', unlock: 1 },
    { id: 'ribbon', unlock: 6 },
    { id: 'sparks', unlock: 10 },
    { id: 'pulse', unlock: 14 },
    { id: 'comet', unlock: 21 },
    { id: 'aurora', unlock: 26 }
  ];

  function levelReward(level) { return level <= 1 ? 0 : 15 * level; }   // bonus shards on reaching a level

  // What a given level unlocks (used for the "Level up!" panel).
  function unlocksAt(level) {
    var out = [], i;
    for (i = 0; i < UPGRADES.length; i++) if (UPGRADES[i].unlock === level) out.push({ type: 'upgrade', id: UPGRADES[i].id });
    for (i = 0; i < COLORS.length; i++) if (COLORS[i].unlock === level) out.push({ type: 'color', id: COLORS[i].id });
    for (i = 0; i < TRAILS.length; i++) if (TRAILS[i].unlock === level) out.push({ type: 'trail', id: TRAILS[i].id });
    return out;
  }

  // ---- Save model ----
  function defaultSave() {
    var upg = {};
    for (var i = 0; i < UPGRADES.length; i++) upg[UPGRADES[i].id] = 0;
    return { xp: 0, shards: 0, upg: upg, colors: ['cyan'], trails: ['ion'], color: 'cyan', trail: 'ion', best: 0, runs: 0 };
  }

  function cloneSave(s) {
    return { xp: s.xp, shards: s.shards, upg: Object.assign({}, s.upg), colors: s.colors.slice(), trails: s.trails.slice(),
      color: s.color, trail: s.trail, best: s.best, runs: s.runs };
  }

  function num(v, d) { v = Number(v); return isFinite(v) && v >= 0 ? Math.floor(v) : d; }

  // Accepts anything (corrupt storage, old versions) and returns a valid save.
  function sanitize(raw) {
    var s = defaultSave();
    if (!raw || typeof raw !== 'object') return s;
    s.xp = Math.min(num(raw.xp, 0), 1e9);
    s.shards = Math.min(num(raw.shards, 0), 1e9);
    s.best = Math.min(num(raw.best, 0), 1e7);
    s.runs = num(raw.runs, 0);
    var lvl = levelInfo(s.xp).level, i;
    if (raw.upg && typeof raw.upg === 'object') {
      for (i = 0; i < UPGRADES.length; i++) {
        var id = UPGRADES[i].id;
        s.upg[id] = Math.min(num(raw.upg[id], 0), maxRank(id));
      }
    }
    // Cosmetics: anything earned by level is always owned; keep only known ids.
    var known = function (list, id) { for (var k = 0; k < list.length; k++) if (list[k].id === id) return true; return false; };
    var colors = [], trails = [];
    for (i = 0; i < COLORS.length; i++) {
      if (COLORS[i].unlock <= lvl || (Array.isArray(raw.colors) && raw.colors.indexOf(COLORS[i].id) >= 0)) colors.push(COLORS[i].id);
    }
    for (i = 0; i < TRAILS.length; i++) {
      if (TRAILS[i].unlock <= lvl || (Array.isArray(raw.trails) && raw.trails.indexOf(TRAILS[i].id) >= 0)) trails.push(TRAILS[i].id);
    }
    s.colors = colors; s.trails = trails;
    s.color = (typeof raw.color === 'string' && known(COLORS, raw.color) && colors.indexOf(raw.color) >= 0) ? raw.color : 'cyan';
    s.trail = (typeof raw.trail === 'string' && known(TRAILS, raw.trail) && trails.indexOf(raw.trail) >= 0) ? raw.trail : 'ion';
    return s;
  }

  // Apply a finished run. Returns { save, report } without mutating the input.
  function applyRun(save, run) {
    var s = cloneSave(sanitize(save));
    var distance = Math.max(0, Math.floor(run.distance || 0));
    var collected = Math.max(0, Math.floor(run.shards || 0));
    var before = levelInfo(s.xp);
    var xp = xpForRun(distance, collected);
    var earned = shardsEarned(collected, s.upg.shardValue);
    s.xp += xp;
    var after = levelInfo(s.xp);
    var unlocks = [], bonus = 0;
    for (var l = before.level + 1; l <= after.level; l++) {
      bonus += levelReward(l);
      var u = unlocksAt(l);
      for (var i = 0; i < u.length; i++) {
        unlocks.push(u[i]);
        if (u[i].type === 'color' && s.colors.indexOf(u[i].id) < 0) s.colors.push(u[i].id);
        if (u[i].type === 'trail' && s.trails.indexOf(u[i].id) < 0) s.trails.push(u[i].id);
      }
    }
    s.shards += earned + bonus;
    var newBest = distance > s.best;
    var prevBest = s.best;
    if (newBest) s.best = distance;
    s.runs += 1;
    return {
      save: s,
      report: {
        distance: distance, collected: collected, shardsEarned: earned, bonusShards: bonus, xpGained: xp,
        before: before, after: after, levelsGained: after.level - before.level, unlocks: unlocks,
        newBest: newBest && distance > 0, prevBest: prevBest, best: s.best
      }
    };
  }

  function canBuy(save, id) {
    var u = UPG_BY_ID[id];
    if (!u) return { ok: false, reason: 'unknown' };
    var rank = save.upg[id] | 0;
    if (rank >= u.costs.length) return { ok: false, reason: 'max' };
    if (levelInfo(save.xp).level < u.unlock) return { ok: false, reason: 'locked' };
    var cost = u.costs[rank];
    if (save.shards < cost) return { ok: false, reason: 'shards', cost: cost };
    return { ok: true, cost: cost };
  }

  function buyUpgrade(save, id) {
    var c = canBuy(save, id);
    if (!c.ok) return { ok: false, reason: c.reason, save: save };
    var s = cloneSave(save);
    s.shards -= c.cost;
    s.upg[id] = (s.upg[id] | 0) + 1;
    return { ok: true, save: s, cost: c.cost };
  }

  function selectCosmetic(save, type, id) {
    var s = cloneSave(save);
    if (type === 'color' && s.colors.indexOf(id) >= 0) s.color = id;
    else if (type === 'trail' && s.trails.indexOf(id) >= 0) s.trail = id;
    else return { ok: false, save: save };
    return { ok: true, save: s };
  }

  // Storage layout: one key per concern, all prefixed `vg.rift-runner.`.
  function serialize(save) {
    var out = {};
    out[KEY_PREFIX + 'xp'] = String(save.xp);
    out[KEY_PREFIX + 'level'] = String(levelInfo(save.xp).level);
    out[KEY_PREFIX + 'shards'] = String(save.shards);
    out[KEY_PREFIX + 'upgrades'] = JSON.stringify(save.upg);
    out[KEY_PREFIX + 'cosmetics'] = JSON.stringify({ colors: save.colors, trails: save.trails, color: save.color, trail: save.trail });
    out[KEY_PREFIX + 'best'] = String(save.best);
    out[KEY_PREFIX + 'runs'] = String(save.runs);
    return out;
  }

  function parseJSON(str) { try { return str ? JSON.parse(str) : null; } catch (e) { return null; } }

  // `get(key)` returns a string or null.
  function deserialize(get) {
    var cos = parseJSON(get(KEY_PREFIX + 'cosmetics')) || {};
    return sanitize({
      xp: get(KEY_PREFIX + 'xp'), shards: get(KEY_PREFIX + 'shards'), best: get(KEY_PREFIX + 'best'),
      runs: get(KEY_PREFIX + 'runs'), upg: parseJSON(get(KEY_PREFIX + 'upgrades')),
      colors: cos.colors, trails: cos.trails, color: cos.color, trail: cos.trail
    });
  }

  return {
    MAX_LEVEL: MAX_LEVEL, KEY_PREFIX: KEY_PREFIX, UPGRADES: UPGRADES, COLORS: COLORS, TRAILS: TRAILS,
    xpToNext: xpToNext, xpForLevel: xpForLevel, levelInfo: levelInfo, xpForRun: xpForRun,
    maxRank: maxRank, upgradeCost: upgradeCost, effects: effects, shardsEarned: shardsEarned,
    levelReward: levelReward, unlocksAt: unlocksAt, defaultSave: defaultSave, sanitize: sanitize,
    applyRun: applyRun, canBuy: canBuy, buyUpgrade: buyUpgrade, selectCosmetic: selectCosmetic,
    serialize: serialize, deserialize: deserialize
  };
});
