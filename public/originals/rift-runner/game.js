/* Rift Runner - boot, game loop, input, screens, HUD and persistence. */
(function () {
  'use strict';
  var RR = window.RR, Ph = RR.Physics, Prog = RR.Progression, I18n = RR.I18n, Sound = RR.Audio, World = RR.World, Render = RR.Render;
  var t = I18n.t, fmt = I18n.fmt, fmtDec = I18n.fmtDec;
  var PREFIX = Prog.KEY_PREFIX, K = World.K, EV = World.EV;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- storage (every access guarded) ----------
  var store = null, storageOk = false;
  try {
    store = window.localStorage;
    store.setItem(PREFIX + 'probe', '1'); store.removeItem(PREFIX + 'probe');
    storageOk = true;
  } catch (e) { store = null; storageOk = false; }
  function sget(key) { if (!store) return null; try { return store.getItem(key); } catch (e) { return null; } }
  function sset(key, val) { if (!store) return false; try { store.setItem(key, val); return true; } catch (e) { return false; } }

  var settings = { sound: true, music: true, lang: null };
  try {
    var rawSet = JSON.parse(sget(PREFIX + 'settings') || 'null');
    if (rawSet && typeof rawSet === 'object') {
      if (typeof rawSet.sound === 'boolean') settings.sound = rawSet.sound;
      if (typeof rawSet.music === 'boolean') settings.music = rawSet.music;
      if (rawSet.lang === 'fr' || rawSet.lang === 'en') settings.lang = rawSet.lang;
    }
  } catch (e) { /* defaults */ }
  function saveSettings() { sset(PREFIX + 'settings', JSON.stringify(settings)); }

  var save = Prog.deserialize(sget);
  function persist() { var m = Prog.serialize(save); for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) sset(k, m[k]); }

  var langInfo = I18n.detectLang(window.location.search, navigator.language || '', settings.lang);
  I18n.setLang(langInfo.lang);

  var testMode = /[?&]test=1\b/.test(window.location.search);
  var reducedMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var coarseMQ = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;

  // ---------- elements ----------
  var app = $('app'), canvas = $('view'), hud = $('hud');
  var scr = { title: $('scrTitle'), hangar: $('scrHangar'), results: $('scrResults'), pause: $('scrPause') };
  var el = {
    dist: $('hudDist'), shards: $('hudShards'), speed: $('hudSpeed'), dash: $('btnDash'), toast: $('toast'),
    chipShield: $('chipShield'), chipMagnet: $('chipMagnet'), chipSlow: $('chipSlow')
  };
  var chipBars = {
    shield: el.chipShield.querySelector('.chip-bar i'), magnet: el.chipMagnet.querySelector('.chip-bar i'), slow: el.chipSlow.querySelector('.chip-bar i')
  };

  // ---------- world + renderer ----------
  var W = World.create();
  Render.init(canvas);
  applyCosmetics();
  Render.setReduced(reducedMQ && reducedMQ.matches);
  if (reducedMQ && reducedMQ.addEventListener) reducedMQ.addEventListener('change', function () { Render.setReduced(reducedMQ.matches); });

  var mode = 'title';           // title | hangar | playing | dying | results | paused
  var dprCap = 2, needsDraw = true;

  function colorHex(id) { for (var i = 0; i < Prog.COLORS.length; i++) if (Prog.COLORS[i].id === id) return Prog.COLORS[i].hex; return '#22E4FF'; }
  function applyCosmetics() { Render.setCraft(colorHex(save.color), save.trail); }

  // ---------- language ----------
  function applyStrings() {
    document.documentElement.lang = I18n.getLang() === 'fr' ? 'fr-CA' : 'en-CA';
    document.title = t('docTitle');
    var nodes = document.querySelectorAll('[data-i18n]'), i;
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    nodes = document.querySelectorAll('[data-i18n-aria]');
    for (i = 0; i < nodes.length; i++) { var s = t(nodes[i].getAttribute('data-i18n-aria')); nodes[i].setAttribute('aria-label', s); nodes[i].setAttribute('title', s); }
    var lb = $('btnLang');
    lb.setAttribute('lang', I18n.getLang() === 'fr' ? 'en' : 'fr');
    lb.setAttribute('aria-label', t('langToggleAria'));
    updateAudioButtons();
    renderTitle();
    if (mode === 'hangar') renderHangar();
    if (lastReport && mode === 'results') fillResults(lastReport, false);
  }

  // ---------- screens ----------
  function show(name) {
    for (var k in scr) if (Object.prototype.hasOwnProperty.call(scr, k)) scr[k].hidden = (k !== name);
  }
  function focusEl(node) { if (node) { try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); } } }
  function blurActive() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }

  function goTitle() {
    mode = 'title';
    World.reset(W, null, true);
    hud.hidden = true; show('title'); renderTitle();
    if (!(coarseMQ && coarseMQ.matches)) focusEl($('btnPlay'));
  }

  function renderTitle() {
    var li = Prog.levelInfo(save.xp);
    $('titleLvlBadge').textContent = li.level;
    $('titleLvl').textContent = t('pilotLevel', { n: li.level });
    $('titleBar').style.width = (li.frac * 100).toFixed(1) + '%';
    $('titleXp').textContent = li.level >= Prog.MAX_LEVEL ? t('maxLevel') : t('xpOf', { a: fmt(li.into), b: fmt(li.need) });
    $('titleBest').textContent = save.best > 0 ? t('bestDist', { d: t('metres', { n: fmt(save.best) }) }) : '';
    $('titleShards').textContent = fmt(save.shards);
    $('storageNote').hidden = storageOk;
  }

  // ---------- audio buttons ----------
  function updateAudioButtons() {
    var nodes = document.querySelectorAll('.js-sound'), i;
    for (i = 0; i < nodes.length; i++) { nodes[i].classList.toggle('is-off', !settings.sound); nodes[i].setAttribute('aria-pressed', settings.sound ? 'true' : 'false'); }
    nodes = document.querySelectorAll('.js-music');
    for (i = 0; i < nodes.length; i++) { nodes[i].classList.toggle('is-off', !settings.music); nodes[i].setAttribute('aria-pressed', settings.music ? 'true' : 'false'); }
    $('btnPauseSound').textContent = t('soundState', { s: settings.sound ? t('on') : t('off') });
    $('btnPauseMusic').textContent = t('musicState', { s: settings.music ? t('on') : t('off') });
  }
  function toggleSound() {
    settings.sound = !settings.sound; Sound.setSound(settings.sound); saveSettings(); updateAudioButtons();
    if (mode === 'playing') toast(settings.sound ? t('soundOn') : t('soundOff'), '');
    if (settings.sound) Sound.play('click');
  }
  function toggleMusic() { settings.music = !settings.music; Sound.setMusic(settings.music); saveSettings(); updateAudioButtons(); Sound.play('click'); }
  Sound.setSound(settings.sound); Sound.setMusic(settings.music); Sound.setMusicPlaying(true);

  // ---------- run lifecycle ----------
  var lastMilestone = 0, deathShown = false, lastReport = null, resultsReadyAt = 0;
  var keys = { left: false, right: false };

  function startRun() {
    Sound.unlock();
    W.best = save.best;
    World.reset(W, Prog.effects(save.upg), false);
    applyCosmetics();
    keys.left = keys.right = false; steerId = -1;
    mode = 'playing'; deathShown = false; lastMilestone = 0;
    show(null); hud.hidden = false; blurActive();
    hudCache.dist = -1; hudCache.shards = -1; hudCache.p = -1; hudCache.speed = -1;
    el.toast.classList.remove('show');
    Sound.setMuffle(0);
    Sound.play('start');
    acc = 0;
  }

  function finishRun(showScreen) {
    var res = Prog.applyRun(save, { distance: World.distance(W), shards: W.shards });
    save = res.save; persist();
    lastReport = res.report;
    if (!showScreen) return res.report;
    mode = 'results';
    hud.hidden = true; show('results');
    fillResults(res.report, true);
    resultsReadyAt = performance.now() + 650;
    setTimeout(function () { if (mode === 'results') focusEl($('btnAgain')); }, 680);
    return res.report;
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused'; needsDraw = true;
    show('pause'); Sound.setMuffle(0.85);
    focusEl($('btnResume'));
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'playing'; show(null); blurActive();
    keys.left = keys.right = false; W.input.axis = 0;
    Sound.setMuffle(W.slowT > 0 ? 0.45 : 0);
    acc = 0; last = 0;
  }
  function quitToMenu() {
    if (mode === 'paused' && W.alive && W.z > 1) finishRun(false);   // bank what was earned
    Sound.setMuffle(0);
    goTitle();
  }

  // ---------- results ----------
  function fillResults(r, animate) {
    $('resDist').textContent = fmt(r.distance);
    var best = $('resBest');
    if (r.newBest) { best.textContent = t('newBest'); best.classList.add('is-new'); }
    else { best.textContent = t('bestWas', { d: t('metres', { n: fmt(r.best) }) }); best.classList.remove('is-new'); }
    $('resShards').textContent = fmt(r.shardsEarned);
    var bonusVal = r.shardsEarned - r.collected;
    $('resShardBonus').textContent = bonusVal > 0 ? t('shardBonus', { n: fmt(bonusVal) }) : '';
    $('resXp').textContent = '+' + fmt(r.xpGained);
    var after = r.after, bar = $('resBar');
    var setLevel = function (info) {
      $('resLvlBadge').textContent = info.level;
      $('resLvl').textContent = t('pilotLevel', { n: info.level });
      $('resXpText').textContent = info.level >= Prog.MAX_LEVEL ? t('maxLevel') : t('xpOf', { a: fmt(info.into), b: fmt(info.need) });
    };
    var lu = $('levelUp');
    if (r.levelsGained > 0) {
      lu.hidden = false;
      $('levelUpSub').textContent = t('levelReached', { n: after.level });
      var list = $('levelUpList');
      list.textContent = '';
      for (var i = 0; i < r.unlocks.length; i++) {
        var u = r.unlocks[i], li = document.createElement('li');
        if (u.type === 'upgrade') li.textContent = t('unlockUpgrade', { name: t('up_' + u.id) });
        else if (u.type === 'color') li.textContent = t('unlockColor', { name: t('c_' + u.id) });
        else li.textContent = t('unlockTrail', { name: t('t_' + u.id) });
        list.appendChild(li);
      }
      if (r.bonusShards > 0) { var lb = document.createElement('li'); lb.textContent = t('bonusShards', { n: fmt(r.bonusShards) }); list.appendChild(lb); }
    } else lu.hidden = true;

    if (!animate || (reducedMQ && reducedMQ.matches)) { setLevel(after); bar.style.width = (after.frac * 100).toFixed(1) + '%'; return; }
    setLevel(r.before);
    bar.style.transition = 'none'; bar.style.width = (r.before.frac * 100).toFixed(1) + '%';
    void bar.offsetWidth;
    bar.style.transition = '';
    setTimeout(function () {
      if (r.levelsGained > 0) {
        bar.style.width = '100%';
        setTimeout(function () {
          setLevel(after); Sound.play('levelUp');
          bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = '';
          bar.style.width = (after.frac * 100).toFixed(1) + '%';
        }, 380);
      } else bar.style.width = (after.frac * 100).toFixed(1) + '%';
    }, 250);
  }

  // ---------- hangar ----------
  var UPG_ICONS = {
    dash: '<path d="M3 12h9M5 8h6M5 16h6M13 6l7 6-7 6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M4 7h4M16 7h4" stroke="currentColor" stroke-width="2"/>',
    shield: '<path d="M12 3l7 3-1 8-6 7-6-7-1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    shardValue: '<path d="M12 3l6 9-6 9-6-9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 8v8M8.5 12h7" stroke="currentColor" stroke-width="2"/>',
    startShield: '<path d="M12 3l7 3-1 8-6 7-6-7-1-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M10 9l4 3-4 3z" fill="currentColor"/>',
    slowmo: '<path d="M6 4h12L6 20h12z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
  };
  var hangarTab = 'upg', hangarMsgTimer = 0;

  function effText(id, eff) {
    if (id === 'dash') return t('up_dash_e', { v: fmtDec(eff.dashCooldown) });
    if (id === 'magnet') return t('up_magnet_e', { v: fmtDec(eff.magnetTime), r: Math.round(eff.magnetRadius * 2.5 / 2 * 100) });
    if (id === 'shield') return t('up_shield_e', { v: fmtDec(eff.shieldTime) });
    if (id === 'shardValue') return t('up_shardValue_e', { v: fmtDec(eff.shardMult) });
    if (id === 'startShield') return eff.startShieldTime > 0 ? t('up_startShield_e', { v: eff.startShieldTime }) : t('up_startShield_none');
    return t('up_slowmo_e', { v: fmtDec(eff.slowmoTime) });
  }

  function hangarMsg(text) {
    var m = $('hangarMsg'); m.textContent = text;
    clearTimeout(hangarMsgTimer);
    hangarMsgTimer = setTimeout(function () { m.textContent = ''; }, 2200);
  }

  function openHangar() {
    if (mode !== 'title' && mode !== 'results') return;
    if (mode === 'results') World.reset(W, null, true);
    mode = 'hangar'; hud.hidden = true; show('hangar');
    renderHangar();
    focusEl($('btnHangarBack'));
  }

  function renderHangar(focusId) {
    var li = Prog.levelInfo(save.xp);
    $('hangarShards').textContent = fmt(save.shards);
    $('hangarLvl').textContent = li.level;
    $('tabUpg').setAttribute('aria-selected', hangarTab === 'upg' ? 'true' : 'false');
    $('tabCraft').setAttribute('aria-selected', hangarTab === 'craft' ? 'true' : 'false');
    $('panelUpg').hidden = hangarTab !== 'upg';
    $('panelCraft').hidden = hangarTab !== 'craft';

    var list = $('panelUpg'); list.textContent = '';
    for (var i = 0; i < Prog.UPGRADES.length; i++) {
      var u = Prog.UPGRADES[i], rank = save.upg[u.id] | 0, max = u.costs.length, locked = li.level < u.unlock;
      var card = document.createElement('div');
      card.className = 'upg' + (locked ? ' locked' : '');
      var effNow = Prog.effects(save.upg), nextUpg = Object.assign({}, save.upg); nextUpg[u.id] = Math.min(max, rank + 1);
      var effNext = Prog.effects(nextUpg);
      var pips = '';
      for (var p = 0; p < max; p++) pips += '<i class="' + (p < rank ? 'on' : '') + '"></i>';
      var effHtml = '<b>' + esc(effText(u.id, effNow)) + '</b>' + (rank < max ? ' → ' + esc(effText(u.id, effNext)) : '');
      card.innerHTML =
        '<div class="upg-icon"><svg viewBox="0 0 24 24" aria-hidden="true">' + UPG_ICONS[u.id] + '</svg></div>' +
        '<div><h3>' + esc(t('up_' + u.id)) + '</h3><p>' + esc(t('up_' + u.id + '_d')) + '</p></div>' +
        '<div class="upg-meta"><span class="pips" role="img" aria-label="' + esc(t('rank', { a: rank, b: max })) + '">' + pips + '</span><span class="upg-eff">' + effHtml + '</span></div>';
      if (locked) {
        var lk = document.createElement('div'); lk.className = 'upg-lock'; lk.textContent = t('lockedAt', { n: u.unlock });
        card.appendChild(lk);
      } else {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn'; b.setAttribute('data-upg', u.id);
        if (rank >= max) { b.disabled = true; b.textContent = t('maxed'); }
        else {
          var cost = u.costs[rank], afford = save.shards >= cost;
          if (!afford) { b.classList.add('cant'); b.setAttribute('aria-disabled', 'true'); }
          else b.classList.add('btn-primary');
          b.innerHTML = esc(t('buy')) + ' · <span class="shard-ico" aria-hidden="true"></span>' + esc(fmt(cost));
          b.setAttribute('aria-label', t('buy') + ' ' + t('up_' + u.id) + ', ' + fmt(cost) + ' ' + t('shards'));
        }
        card.appendChild(b);
      }
      list.appendChild(card);
    }

    var cl = $('colorList'); cl.textContent = '';
    for (var c = 0; c < Prog.COLORS.length; c++) cl.appendChild(swatch('color', Prog.COLORS[c], li.level));
    var tl = $('trailList'); tl.textContent = '';
    for (var tr = 0; tr < Prog.TRAILS.length; tr++) tl.appendChild(swatch('trail', Prog.TRAILS[tr], li.level));
    if (focusId) focusEl(document.querySelector('[data-upg="' + focusId + '"]') || document.querySelector('[data-cos="' + focusId + '"]'));
  }

  var TRAIL_CSS = {
    ion: 'linear-gradient(90deg, transparent 0 40%, currentColor 40% 46%, transparent 46% 54%, currentColor 54% 60%, transparent 60%)',
    ribbon: 'linear-gradient(90deg, transparent 0 38%, currentColor 38% 62%, transparent 62%)',
    sparks: 'radial-gradient(circle at 30% 30%, currentColor 0 2px, transparent 3px), radial-gradient(circle at 70% 55%, currentColor 0 2px, transparent 3px), radial-gradient(circle at 45% 80%, currentColor 0 2px, transparent 3px)',
    pulse: 'radial-gradient(circle, transparent 0 30%, currentColor 31% 38%, transparent 39% 56%, currentColor 57% 63%, transparent 64%)',
    comet: 'radial-gradient(ellipse at 50% 20%, currentColor 0 22%, transparent 70%)',
    aurora: 'linear-gradient(90deg, transparent 0 30%, #22E4FF 30% 43%, #A98BFF 43% 57%, #FF2E88 57% 70%, transparent 70%)'
  };

  function swatch(type, item, level) {
    var owned = type === 'color' ? save.colors.indexOf(item.id) >= 0 : save.trails.indexOf(item.id) >= 0;
    var sel = type === 'color' ? save.color === item.id : save.trail === item.id;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch' + (sel ? ' sel' : '') + (owned ? '' : ' locked');
    b.setAttribute('data-cos', type + ':' + item.id);
    b.setAttribute('aria-pressed', sel ? 'true' : 'false');
    var name = t((type === 'color' ? 'c_' : 't_') + item.id);
    var colorHexV = type === 'color' ? item.hex : colorHex(save.color);
    var vis = document.createElement('span');
    if (type === 'color') {
      vis.className = 'dot';
      if (item.id === 'prism') vis.style.background = 'conic-gradient(#22E4FF, #A98BFF, #FF2E88, #FFB13B, #7DFF6A, #22E4FF)';
    } else {
      vis.className = 'tr'; vis.style.backgroundImage = TRAIL_CSS[item.id] || TRAIL_CSS.ion;
    }
    b.style.color = owned ? (colorHexV === '#FFFFFF' ? '#E8F6FF' : colorHexV) : '';
    var label = document.createElement('span'); label.textContent = name; label.style.color = 'var(--text)';
    var small = document.createElement('small');
    small.textContent = !owned ? t('lockedAt', { n: item.unlock }) : (sel ? t('equipped') : t('equip'));
    b.appendChild(vis); b.appendChild(label); b.appendChild(small);
    b.setAttribute('aria-label', name + ', ' + small.textContent);
    if (!owned) b.setAttribute('aria-disabled', 'true');
    return b;
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : '&quot;'; }); }

  $('panelUpg').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-upg]') : null;
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-upg');
    var res = Prog.buyUpgrade(save, id);
    if (res.ok) {
      save = res.save; persist(); Sound.play('buy');
      hangarMsg(t('bought', { name: t('up_' + id) }));
      renderHangar(id);
    } else if (res.reason === 'shards') { Sound.play('deny'); hangarMsg(t('notEnough')); }
  });
  $('panelCraft').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-cos]') : null;
    if (!b) return;
    var parts = b.getAttribute('data-cos').split(':');
    var res = Prog.selectCosmetic(save, parts[0], parts[1]);
    if (res.ok) { save = res.save; persist(); applyCosmetics(); Sound.play('click'); renderHangar(b.getAttribute('data-cos')); }
    else Sound.play('deny');
  });
  $('tabUpg').addEventListener('click', function () { hangarTab = 'upg'; renderHangar(); Sound.play('click'); });
  $('tabCraft').addEventListener('click', function () { hangarTab = 'craft'; renderHangar(); Sound.play('click'); });
  $('btnHangarBack').addEventListener('click', function () { Sound.play('click'); goTitle(); });
  $('btnHangarPlay').addEventListener('click', startRun);

  // ---------- buttons ----------
  $('btnPlay').addEventListener('click', startRun);
  $('btnHangar').addEventListener('click', function () { Sound.unlock(); Sound.play('click'); openHangar(); });
  $('btnLang').addEventListener('click', function () {
    var next = I18n.getLang() === 'fr' ? 'en' : 'fr';
    I18n.setLang(next); settings.lang = next; saveSettings(); applyStrings(); Sound.play('click');
  });
  var soundBtns = document.querySelectorAll('.js-sound');
  for (var sb = 0; sb < soundBtns.length; sb++) soundBtns[sb].addEventListener('click', function () { Sound.unlock(); toggleSound(); if (mode === 'playing') blurActive(); });
  $('btnMusic').addEventListener('click', function () { Sound.unlock(); toggleMusic(); });
  $('btnPauseSound').addEventListener('click', toggleSound);
  $('btnPauseMusic').addEventListener('click', toggleMusic);
  $('btnPause').addEventListener('click', function () { pause(); });
  $('btnResume').addEventListener('click', resume);
  $('btnQuit').addEventListener('click', quitToMenu);
  function resultsGuard(fn) { return function () { if (performance.now() < resultsReadyAt) return; fn(); }; }
  $('btnAgain').addEventListener('click', resultsGuard(startRun));
  $('btnResHangar').addEventListener('click', resultsGuard(function () { Sound.play('click'); openHangar(); }));
  $('btnResMenu').addEventListener('click', resultsGuard(function () { Sound.play('click'); goTitle(); }));

  // Dash button: react on press, not release.
  el.dash.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); requestDash(); });
  el.dash.addEventListener('click', function (e) { if (e.detail === 0) requestDash(); });
  function requestDash() { if (mode === 'playing') { W.input.dash = true; blurActive(); } }

  // ---------- keyboard ----------
  window.addEventListener('keydown', function (e) {
    Sound.unlock();
    var code = e.code || e.key;
    if (code === 'KeyM') { toggleSound(); return; }
    if (mode === 'playing') {
      if (code === 'ArrowLeft' || code === 'KeyA') { keys.left = true; W.input.pointer = false; e.preventDefault(); }
      else if (code === 'ArrowRight' || code === 'KeyD') { keys.right = true; W.input.pointer = false; e.preventDefault(); }
      else if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight' || code === 'ArrowUp' || code === 'KeyW') { if (!e.repeat) W.input.dash = true; e.preventDefault(); }
      else if (code === 'KeyP' || code === 'Escape') { pause(); e.preventDefault(); }
      return;
    }
    if (mode === 'dying') { if (code === 'Space' || code.indexOf('Arrow') === 0) e.preventDefault(); return; }
    if (mode === 'paused') { if (code === 'KeyP' || code === 'Escape') { resume(); e.preventDefault(); } return; }
    if (mode === 'hangar' && code === 'Escape') { goTitle(); return; }
    if (mode === 'title' && (code === 'Enter' || code === 'Space') && (document.activeElement === document.body || !document.activeElement)) { e.preventDefault(); startRun(); }
  });
  window.addEventListener('keyup', function (e) {
    var code = e.code || e.key;
    if (code === 'ArrowLeft' || code === 'KeyA') keys.left = false;
    else if (code === 'ArrowRight' || code === 'KeyD') keys.right = false;
  });

  // ---------- pointer: mouse = absolute steer + click dash; touch = relative drag + 2nd finger dash ----------
  var steerId = -1, steerStartX = 0, steerStartTarget = 0, lastMouseX = -1;
  function touchSens() { var m = Render.metrics(); return 1.8 / (Math.min(m.w, 640) * 0.55); }
  function mouseTarget(clientX) {
    var m = Render.metrics(), r = canvas.getBoundingClientRect();
    return Ph.clamp((clientX - r.left - m.cx) / (0.55 * m.P), -Ph.CRAFT_XMAX, Ph.CRAFT_XMAX);
  }
  app.addEventListener('pointerdown', function (e) {
    Sound.unlock();
    if (mode !== 'playing') return;
    if (e.target.closest && e.target.closest('button')) return;
    if (e.pointerType === 'mouse') {
      if (e.button === 0) W.input.dash = true;
      return;
    }
    e.preventDefault();
    if (steerId === -1) {
      steerId = e.pointerId; steerStartX = e.clientX;
      steerStartTarget = W.input.pointer ? W.input.targetX : W.x;
      W.input.pointer = true; W.input.targetX = steerStartTarget;
    } else if (e.pointerId !== steerId) {
      W.input.dash = true;
    }
  }, { passive: false });
  app.addEventListener('pointermove', function (e) {
    if (mode !== 'playing') return;
    if (e.pointerType === 'mouse') {
      if (lastMouseX >= 0 && Math.abs(e.clientX - lastMouseX) > 2) { W.input.pointer = true; W.input.targetX = mouseTarget(e.clientX); }
      lastMouseX = e.clientX;
      return;
    }
    if (e.pointerId !== steerId) return;
    var s = touchSens(), target = steerStartTarget + (e.clientX - steerStartX) * s;
    // re-anchor at the edges so reversing direction responds at once
    if (target > Ph.CRAFT_XMAX) { target = Ph.CRAFT_XMAX; steerStartTarget = target; steerStartX = e.clientX; }
    else if (target < -Ph.CRAFT_XMAX) { target = -Ph.CRAFT_XMAX; steerStartTarget = target; steerStartX = e.clientX; }
    W.input.targetX = target;
  });
  function endPointer(e) { if (e.pointerId === steerId) steerId = -1; }
  app.addEventListener('pointerup', endPointer);
  app.addEventListener('pointercancel', endPointer);
  app.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // Never let the page scroll or zoom; only menu panels marked .scroll may scroll.
  document.addEventListener('touchmove', function (e) {
    if (mode !== 'playing' && mode !== 'dying' && e.target.closest && e.target.closest('.scroll, .screen-title')) return;
    e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('dblclick', function (e) { e.preventDefault(); });
  document.addEventListener('wheel', function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  // ---------- auto-pause ----------
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pause(); Sound.suspend(true); }
    else { Sound.suspend(false); needsDraw = true; }
  });
  window.addEventListener('blur', function () { pause(); });
  window.addEventListener('pagehide', function () { pause(); });

  // ---------- resize ----------
  function resize() {
    var r = app.getBoundingClientRect();
    var ratio = Math.min(window.devicePixelRatio || 1, dprCap);
    Render.resize(Math.round(r.width), Math.round(r.height), ratio);
    needsDraw = true;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  resize();

  // ---------- HUD + toasts ----------
  var hudCache = { dist: -1, shards: -1, p: -1, speed: -1, sh: -1, mg: -1, sl: -1 }, hudT = 0, toastTimer = 0;
  function toast(text, cls) {
    el.toast.textContent = text;
    el.toast.className = 'toast show' + (cls ? ' ' + cls : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, 1200);
  }
  function chip(node, bar, key, T, max) {
    var on = T > 0;
    if (node.hidden === on) node.hidden = !on;
    if (on) { var f = Math.round(Ph.clamp(T / max, 0, 1) * 50) / 50; if (hudCache[key] !== f) { hudCache[key] = f; bar.style.transform = 'scaleX(' + f + ')'; } }
  }
  function updateHud(dt) {
    var d = World.distance(W);
    hudT += dt;
    if (d !== hudCache.dist && hudT > 0.06) { hudCache.dist = d; el.dist.textContent = fmt(d); hudT = 0; }
    if (W.shards !== hudCache.shards) { hudCache.shards = W.shards; el.shards.textContent = fmt(W.shards); }
    var kmh = Math.round(W.speed * 3.6 / 5) * 5;
    if (kmh !== hudCache.speed) { hudCache.speed = kmh; el.speed.textContent = t('kmh', { n: fmt(kmh) }); }
    var cd = W.eff.dashCooldown, p = Math.round((1 - Ph.clamp(W.dashCd / cd, 0, 1)) * 60) / 60;
    if (p !== hudCache.p) { hudCache.p = p; el.dash.style.setProperty('--p', p); el.dash.classList.toggle('ready', p >= 1); }
    chip(el.chipShield, chipBars.shield, 'sh', W.shieldT, W.shieldMax);
    chip(el.chipMagnet, chipBars.magnet, 'mg', W.magnetT, W.eff.magnetTime);
    chip(el.chipSlow, chipBars.slow, 'sl', W.slowT, W.eff.slowmoTime);
    if (d >= lastMilestone + 1000) { lastMilestone = Math.floor(d / 1000) * 1000; toast(t('metres', { n: fmt(lastMilestone) }), ''); }
  }

  function drainEvents() {
    for (var i = 0; i < W.evN; i++) {
      var type = W.evType[i], a = W.evX[i], b = W.evZ[i];
      if (mode !== 'playing' && mode !== 'dying') continue;
      Render.fx(type, W, a, b);
      if (type === EV.SHARD) Sound.play('shard');
      else if (type === EV.POWER) {
        if (a === K.SHIELD) toast(t('shieldUp'), '');
        else if (a === K.MAGNET) toast(t('magnetUp'), 'mag');
        else { toast(t('slowUp'), 'warm'); Sound.setMuffle(0.45); Sound.play('slow'); }
        Sound.play('power');
      } else if (type === EV.SHIELD_BREAK) { Sound.play('shieldBreak'); toast(t('shieldBroke'), 'mag'); }
      else if (type === EV.CRASH) { Sound.play('crash'); mode = 'dying'; Sound.setMuffle(0.5); }
      else if (type === EV.DASH) Sound.play('dash');
      else if (type === EV.LASER_WARN) Sound.play('laserWarn');
      else if (type === EV.LASER_FIRE) Sound.play('laserFire');
      else if (type === EV.BEST) { toast(t('passedBest'), 'warm'); Sound.play('power'); }
      else if (type === EV.SLOW_END) Sound.setMuffle(0);
    }
    W.evN = 0;
  }

  // ---------- main loop: fixed 120 Hz simulation, render every frame ----------
  var STEP = 1 / 120, acc = 0, last = 0, slowFrames = 0, perfT = 0;
  function frame(now) {
    window.requestAnimationFrame(frame);
    var dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.1) dt = 0.1; else if (dt < 0) dt = 0;
    if (mode === 'paused') {
      if (needsDraw) { Render.draw(W, 0, true); needsDraw = false; }
      return;
    }
    W.input.axis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    acc += dt;
    var n = 0;
    while (acc >= STEP && n < 12) { World.update(W, STEP); acc -= STEP; n++; }
    if (n >= 12) acc = 0;
    drainEvents();
    if (mode === 'dying' && W.deathT > 1.15 && !deathShown) { deathShown = true; finishRun(true); }
    Render.draw(W, dt, W.alive);
    if (mode === 'playing' || mode === 'dying') updateHud(dt);
    // adaptive resolution: if frames stay slow during play, render fewer pixels
    if (mode === 'playing' && dt > 0) {
      perfT += dt; if (dt > 1 / 45) slowFrames++;
      if (perfT > 3) {
        if (slowFrames > 60 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); resize(); }
        perfT = 0; slowFrames = 0;
      }
    }
  }

  // ---------- boot ----------
  applyStrings();
  goTitle();
  window.requestAnimationFrame(frame);

  if (testMode) {
    window.RiftRunnerTest = {
      mode: function () { return mode; },
      world: W,
      save: function () { return save; },
      god: function (v) { W.god = !!v; },
      auto: function (v) { W.auto = !!v; },
      storageOk: storageOk,
      dprCap: function () { return dprCap; }
    };
  }
})();
