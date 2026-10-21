/* Rift Runner - procedural sound effects and a small synth music loop (Web Audio, no files).
   The AudioContext is only created after the first user gesture. */
(function (root) {
  'use strict';
  var ctx = null, master = null, sfxBus = null, musicBus = null, filter = null, noiseBuf = null;
  var soundOn = true, musicOn = true, musicPlaying = false, suspendedByGame = false;
  var nextNote = 0, step = 0, schedTimer = 0;
  var BPM = 118, STEP = 60 / BPM / 4; // 16th notes

  // A minor-ish progression: Am - F - C - G (bass roots, MIDI numbers)
  var ROOTS = [45, 41, 48, 43];
  var ARP = [0, 7, 12, 15, 12, 7, 3, 7];

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended' && !suspendedByGame) ctx.resume(); return; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }
    master = ctx.createGain(); master.gain.value = soundOn ? 0.8 : 0;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 18000; filter.Q.value = 0.7;
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9;
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0;
    var comp = ctx.createDynamicsCompressor();
    sfxBus.connect(filter); musicBus.connect(filter); filter.connect(comp); comp.connect(master); master.connect(ctx.destination);
    // One shared second of white noise for hats, whooshes and crashes.
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (musicPlaying) startScheduler();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function tone(type, f0, f1, dur, vol, when, bus) {
    if (!ctx || !soundOn) return;
    var t = (when || ctx.currentTime);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, fType, f0, f1, when, bus) {
    if (!ctx || !soundOn) return;
    var t = (when || ctx.currentTime);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf;
    var bf = ctx.createBiquadFilter(); bf.type = fType || 'bandpass'; bf.Q.value = 1.2;
    bf.frequency.setValueAtTime(f0, t);
    if (f1) bf.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bf); bf.connect(g); g.connect(bus || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  var combo = 0, lastShardT = 0;
  var SFX = {
    shard: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      combo = (t - lastShardT < 0.6) ? Math.min(combo + 1, 10) : 0; lastShardT = t;
      var f = mtof(84 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][combo]);
      tone('triangle', f, f * 1.01, 0.12, 0.16); tone('sine', f * 2, f * 2, 0.06, 0.05);
    },
    dash: function () { noise(0.32, 0.35, 'bandpass', 600, 4200); tone('sawtooth', 160, 520, 0.22, 0.07); },
    power: function () { var t = now(); tone('square', 523, 523, 0.08, 0.06, t); tone('square', 784, 784, 0.08, 0.06, t + 0.07); tone('triangle', 1047, 1568, 0.25, 0.1, t + 0.14); },
    shieldBreak: function () { noise(0.45, 0.4, 'highpass', 2500, 900); tone('sawtooth', 700, 120, 0.35, 0.1); },
    crash: function () { noise(0.9, 0.6, 'lowpass', 2200, 120); tone('sine', 120, 38, 0.7, 0.45); tone('sawtooth', 300, 60, 0.5, 0.08); },
    laserWarn: function () { var t = now(); tone('square', 1320, 1320, 0.05, 0.04, t); tone('square', 1320, 1320, 0.05, 0.04, t + 0.12); },
    laserFire: function () { tone('sawtooth', 90, 70, 0.55, 0.12); noise(0.5, 0.18, 'bandpass', 3000, 1500); },
    click: function () { tone('triangle', 880, 990, 0.05, 0.06); },
    buy: function () { var t = now(); tone('triangle', 660, 660, 0.07, 0.1, t); tone('triangle', 990, 990, 0.12, 0.1, t + 0.06); },
    deny: function () { tone('square', 220, 180, 0.14, 0.06); },
    levelUp: function () { var t = now(), n = [0, 4, 7, 12, 16]; for (var i = 0; i < n.length; i++) tone('triangle', mtof(72 + n[i]), mtof(72 + n[i]), 0.22, 0.12, t + i * 0.08); },
    slow: function () { tone('sine', 600, 180, 0.6, 0.12); },
    start: function () { var t = now(); tone('sawtooth', 110, 440, 0.5, 0.06, t); noise(0.5, 0.15, 'bandpass', 300, 3000, t); }
  };

  function play(name) { if (ctx && soundOn && SFX[name]) { try { SFX[name](); } catch (e) { /* ignore */ } } }

  // ---- Music: 16-step lookahead scheduler ----
  function scheduleStep(s, t) {
    var bar = (s >> 4) % 4, i = s & 15, root0 = ROOTS[bar];
    var mb = musicBus;
    // kick on beats, hat on offbeats
    if (i % 4 === 0) tone('sine', 140, 45, 0.18, 0.5, t, mb);
    if (i % 4 === 2) noise(0.04, 0.12, 'highpass', 7000, 0, t, mb);
    if (i === 4 || i === 12) noise(0.12, 0.16, 'bandpass', 1800, 900, t, mb);
    // bass on 8ths
    if (i % 2 === 0) tone('sawtooth', mtof(root0 - 12 + (i % 8 === 6 ? 12 : 0)), 0, STEP * 1.6, 0.11, t, mb);
    // arpeggio
    var n = root0 + 12 + ARP[i % 8];
    tone('triangle', mtof(n), 0, STEP * 0.9, 0.05, t, mb);
  }

  function scheduler() {
    if (!ctx || !musicPlaying) return;
    while (nextNote < ctx.currentTime + 0.25) {
      if (musicOn && soundOn) scheduleStep(step, nextNote);
      nextNote += STEP; step++;
    }
  }

  function startScheduler() {
    if (!ctx) return;
    nextNote = Math.max(nextNote, ctx.currentTime + 0.05);
    if (!schedTimer) schedTimer = setInterval(scheduler, 60);
  }

  function setMusicPlaying(on) {
    musicPlaying = !!on;
    if (musicPlaying) startScheduler();
    else if (schedTimer) { clearInterval(schedTimer); schedTimer = 0; }
  }

  function setSound(on) {
    soundOn = !!on;
    if (master && ctx) master.gain.setTargetAtTime(soundOn ? 0.8 : 0, ctx.currentTime, 0.02);
  }
  function setMusic(on) {
    musicOn = !!on;
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(musicOn ? 0.32 : 0, ctx.currentTime, 0.05);
  }
  // Slow-mo / pause muffles everything through the shared lowpass.
  function setMuffle(amount) {
    if (!filter || !ctx) return;
    filter.frequency.setTargetAtTime(18000 - 16500 * amount, ctx.currentTime, 0.08);
  }
  function suspend(yes) {
    suspendedByGame = !!yes;
    if (!ctx) return;
    try { if (yes) ctx.suspend(); else ctx.resume(); } catch (e) { /* ignore */ }
  }

  root.RR = root.RR || {};
  root.RR.Audio = { unlock: unlock, play: play, setSound: setSound, setMusic: setMusic, setMusicPlaying: setMusicPlaying,
    setMuffle: setMuffle, suspend: suspend, isReady: function () { return !!ctx; } };
})(typeof self !== 'undefined' ? self : this);
