/* Rift Runner - run simulation: entity pools, spawner, steering, collisions. No DOM, no drawing.
   All objects are allocated once in create(); update() does not allocate. */
(function (root) {
  'use strict';
  var Ph = root.RR.Physics;
  var clamp = Ph.clamp, lerp = Ph.lerp, approach = Ph.approach;

  var K = { WALL: 1, BAR: 2, MINE: 3, SHARD: 4, SHIELD: 5, MAGNET: 6, SLOW: 7 };
  var EV = { SHARD: 1, POWER: 2, SHIELD_BREAK: 3, CRASH: 4, DASH: 5, LASER_WARN: 6, LASER_FIRE: 7, PHASE: 8, BEST: 9, SLOW_END: 10 };
  var MAX_ENT = 240, MAX_EV = 64, MAX_LASER = 3;
  var AHEAD = 165;          // metres ahead that rows are spawned
  var R = Ph.CRAFT_R;

  function Ent() {
    this.active = false; this.kind = 0; this.x = 0; this.z = 0; this.w = 0; this.h = 0; this.depth = 0;
    this.segs = new Float32Array(6); this.nseg = 0; this.amp = 0; this.omega = 0; this.phase = 0; this.off = 0;
    this.r = 0; this.baseR = 0; this.hit = false; this.safeX = 0; this.mirror = false; this.seed = 0; this.taken = false;
  }
  function Laser() { this.active = false; this.x = 0; this.hw = 0; this.state = 0; this.t = 0; this.tele = 1; this.fire = 0.6; this.done = false; this.beeped = false; }

  function create() {
    var W = {
      ents: [], order: new Int16Array(MAX_ENT), nOrder: 0, lasers: [],
      evType: new Int8Array(MAX_EV), evX: new Float32Array(MAX_EV), evZ: new Float32Array(MAX_EV), evN: 0,
      scratch: new Float32Array(96),
      input: { axis: 0, pointer: false, targetX: 0, dash: false },
      eff: null, rand: Math.random
    };
    for (var i = 0; i < MAX_ENT; i++) W.ents.push(new Ent());
    for (var j = 0; j < MAX_LASER; j++) W.lasers.push(new Laser());
    reset(W, null, true);
    return W;
  }

  function reset(W, eff, demo) {
    W.demo = !!demo;
    W.eff = eff || W.eff || { dashCooldown: 3.2, magnetRadius: 0.34, magnetTime: 7, shieldTime: 9, shardMult: 1, startShieldTime: 0, slowmoTime: 4 };
    W.rand = Ph.rng((Math.random() * 4294967296) >>> 0);
    W.z = 0; W.x = 0; W.vx = 0; W.speed = Ph.speedAt(0); W.time = 0; W.realTime = 0;
    W.dashT = 0; W.dashCd = 0; W.invulnT = 0; W.shieldT = W.demo ? 0 : W.eff.startShieldTime; W.magnetT = 0; W.slowT = 0; W.timeScale = 1;
    W.shieldMax = W.shieldT > 0 ? W.shieldT : W.eff.shieldTime;
    W.shards = 0; W.alive = true; W.dying = false; W.deathT = 0; W.best = W.best || 0; W.passedBest = false;
    W.nextRowZ = 70; W.lastSafeX = 0; W.lastPattern = 0; W.repeat = 0; W.afterBar = false; W.rows = 0;
    W.nextPowerZ = 260 + W.rand() * 120; W.nextLaserT = 0; W.laserMinZ = 1700;
    W.god = W.god || false; W.auto = W.auto || false; W.demoTarget = 0; W.demoT = 0;
    W.input.axis = 0; W.input.dash = false; W.input.pointer = false; W.input.targetX = 0;
    for (var i = 0; i < W.ents.length; i++) W.ents[i].active = false;
    for (var j = 0; j < W.lasers.length; j++) W.lasers[j].active = false;
    W.nOrder = 0; W.evN = 0;
    if (!W.demo) {
      // A short guiding line of shards before the first hazard.
      for (var s = 0; s < 6; s++) addShard(W, Math.sin(s * 0.6) * 0.25, 28 + s * 5);
    }
  }

  function emit(W, type, x, z) {
    if (W.evN >= MAX_EV) return;
    W.evType[W.evN] = type; W.evX[W.evN] = x; W.evZ[W.evN] = z; W.evN++;
  }

  function alloc(W, kind, z) {
    for (var i = 0; i < MAX_ENT; i++) {
      var e = W.ents[i];
      if (!e.active) {
        e.active = true; e.kind = kind; e.z = z; e.x = 0; e.w = 0; e.h = 0; e.depth = 0; e.nseg = 0; e.amp = 0; e.omega = 0;
        e.phase = 0; e.off = 0; e.r = 0; e.baseR = 0; e.hit = false; e.safeX = 0; e.mirror = false; e.taken = false;
        e.seed = W.rand() * 6.283;
        // keep `order` sorted by z (insert from the back: new entities are usually furthest)
        var n = W.nOrder, k = n - 1;
        while (k >= 0 && W.ents[W.order[k]].z > z) { W.order[k + 1] = W.order[k]; k--; }
        W.order[k + 1] = i; W.nOrder = n + 1;
        return e;
      }
    }
    return null;
  }

  function addShard(W, x, z) { var e = alloc(W, K.SHARD, z); if (e) { e.x = x; e.r = 0.085; } return e; }

  // ---- Pattern selection ----
  var P_WALL = 1, P_WALL2 = 2, P_MINES = 3, P_BAR = 4, P_BAR2 = 5, P_BREATH = 6;
  var weights = new Float32Array(7);
  function choosePattern(W, d) {
    weights[P_WALL] = d < 2200 ? 5 : 3.5;
    weights[P_WALL2] = d > 2200 ? 2.2 : 0;
    weights[P_MINES] = d > 350 ? 3 : 0;
    weights[P_BAR] = d > 800 ? 2.6 : 0;
    weights[P_BAR2] = d > 3000 ? 1.8 : 0;
    weights[P_BREATH] = d < 1500 ? 1.1 : 0.5;
    if (W.repeat >= 2) weights[W.lastPattern] = 0;
    if (W.afterBar) { weights[P_BAR] = 0; weights[P_BAR2] = 0; }
    var total = 0, i;
    for (i = 1; i < 7; i++) total += weights[i];
    var r = W.rand() * total;
    for (i = 1; i < 7; i++) { r -= weights[i]; if (r <= 0) return i; }
    return P_WALL;
  }

  function shardPath(W, x0, x1, zStart, zEnd, n) {
    for (var i = 0; i < n; i++) {
      var f = n > 1 ? i / (n - 1) : 1;
      var s = f * f * (3 - 2 * f);
      addShard(W, lerp(x0, x1, s), lerp(zStart, zEnd, f));
    }
  }

  function spawnRow(W) {
    var d = W.nextRowZ, rnd = W.rand;
    var diff = Ph.difficulty(d), sp = Ph.speedAt(d);
    var interval = Ph.rowInterval(d);
    var spacing = sp * interval;
    var reach = W.afterBar ? 1.8 : 2.0 * interval * 0.78;   // lateral distance a player can comfortably cover
    var prevSafe = W.lastSafeX;
    var pat = choosePattern(W, d);
    if (pat === W.lastPattern) W.repeat++; else { W.repeat = 1; W.lastPattern = pat; }
    var safe = prevSafe, e, extra = 1;
    var lo, hi;

    if (pat === P_WALL || pat === P_WALL2) {
      e = alloc(W, K.WALL, d);
      if (!e) { W.nextRowZ += spacing; return; }
      e.h = 0.3; e.depth = 1.4;
      var w = Ph.gapWidth(d) * (0.92 + rnd() * 0.18);
      if (pat === P_WALL2) w *= 0.9;
      lo = Math.max(-0.86 + w / 2, prevSafe - reach); hi = Math.min(0.86 - w / 2, prevSafe + reach);
      if (lo > hi) { lo = hi = clamp(prevSafe, -0.86 + w / 2, 0.86 - w / 2); }
      var c1 = lerp(lo, hi, rnd());
      var c2 = 0, w2 = 0;
      if (pat === P_WALL2) {
        // second gap on the other side of the first, never overlapping it
        w2 = w;
        var a0 = c1 > 0 ? -0.86 + w2 / 2 : c1 + w + 0.3;
        var a1 = c1 > 0 ? c1 - w - 0.3 : 0.86 - w2 / 2;
        if (a1 >= a0) c2 = lerp(a0, a1, rnd()); else w2 = 0;   // corridor too tight: single gap
      }
      e.nseg = Ph.gapSegments(c1, w, c2, w2, e.segs);
      e.safeX = c1; e.w = w; safe = c1;
      shardPath(W, prevSafe, c1, d - spacing * 0.5, d + 0.7, 5);
    } else if (pat === P_MINES) {
      var n = 2 + Math.floor(diff * 3 + rnd() * 1.6);
      lo = Math.max(-0.8, prevSafe - reach); hi = Math.min(0.8, prevSafe + reach);
      safe = lerp(lo, hi, rnd());
      var len = 3 + n * 2.4, placed = 0;
      for (var m = 0; m < n * 3 && placed < n; m++) {
        var mx = -0.9 + rnd() * 1.8;
        if (Math.abs(mx - safe) < 0.36) continue;
        e = alloc(W, K.MINE, d + rnd() * len);
        if (!e) break;
        e.x = mx; e.baseR = 0.07 + diff * 0.015; e.r = e.baseR; e.safeX = safe; placed++;
      }
      shardPath(W, prevSafe, safe, d - spacing * 0.45, d + len, 6);
      extra = 1 + len / spacing * 0.6;
    } else if (pat === P_BAR || pat === P_BAR2) {
      e = alloc(W, K.BAR, d);
      if (!e) { W.nextRowZ += spacing; return; }
      e.h = 0.22; e.depth = 1.1; e.phase = rnd() * 6.283;
      if (pat === P_BAR) {
        e.w = 0.56 + 0.24 * diff; e.amp = 1 - e.w / 2 - 0.03; e.omega = 1.3 + 0.9 * diff + rnd() * 0.3;
        e.nseg = 1; e.segs[0] = -e.w / 2; e.segs[1] = e.w / 2;
      } else {
        e.w = 0.44; e.amp = 0.3; e.omega = 1.5 + 0.7 * diff; e.mirror = true; e.nseg = 2;
        e.segs[0] = -0.5 - e.w / 2; e.segs[1] = -0.5 + e.w / 2; e.segs[2] = 0.5 - e.w / 2; e.segs[3] = 0.5 + e.w / 2;
      }
      e.safeX = prevSafe;
      extra = 1.35;
    } else {
      // breather: a sweeping arc of shards
      lo = Math.max(-0.75, prevSafe - reach); hi = Math.min(0.75, prevSafe + reach);
      safe = lerp(lo, hi, rnd());
      shardPath(W, prevSafe, safe, d - spacing * 0.6, d + 2, 8);
      extra = 0.8;
    }

    W.afterBar = (pat === P_BAR || pat === P_BAR2);
    W.lastSafeX = safe;
    W.rows++;

    // Power-ups sit on the safe line just before the row.
    if (d >= W.nextPowerZ && !W.afterBar) {
      var pr = rnd(), kind = pr < 0.4 ? K.SHIELD : (pr < 0.75 ? K.MAGNET : K.SLOW);
      var p = alloc(W, kind, d - Math.min(9, spacing * 0.3));
      if (p) { p.x = lerp(prevSafe, safe, 0.7); p.r = 0.12; }
      W.nextPowerZ = d + sp * (12 + rnd() * 7);
    }
    W.nextRowZ += spacing * extra;
  }

  // ---- Lasers ----
  function laserConflicts(W, lx, hw, other, windowT) {
    var buf = W.scratch, sp = W.speed, i, j, k;
    for (i = 0; i < W.nOrder; i++) {
      var e = W.ents[W.order[i]];
      if (e.kind > K.MINE) continue;
      var arrive = (e.z - W.z) / sp;
      if (arrive < -0.1 || arrive > windowT) continue;
      if (e.kind === K.BAR) return true;
      // gather every hazard near this one in z, plus the beam(s)
      var n = 0;
      for (j = 0; j < W.nOrder && n < 44; j++) {
        var f = W.ents[W.order[j]];
        if (f.kind > K.MINE || f.kind === K.BAR) continue;
        if (Math.abs(f.z - e.z) > 3.2) continue;
        if (f.kind === K.WALL) { for (k = 0; k < f.nseg; k++) { buf[n * 2] = f.segs[k * 2]; buf[n * 2 + 1] = f.segs[k * 2 + 1]; n++; } }
        else { var mr = f.baseR * 1.3; buf[n * 2] = f.x - mr; buf[n * 2 + 1] = f.x + mr; n++; }
      }
      buf[n * 2] = lx - hw; buf[n * 2 + 1] = lx + hw; n++;
      if (other) { buf[n * 2] = other.x - other.hw; buf[n * 2 + 1] = other.x + other.hw; n++; }
      if (Ph.maxFreeWidth(buf, n) < 2 * R + 0.12) return true;
    }
    return false;
  }

  function startLaser(W, other) {
    var L = null, i;
    for (i = 0; i < W.lasers.length; i++) if (!W.lasers[i].active) { L = W.lasers[i]; break; }
    if (!L) return null;
    var diff = Ph.difficulty(W.z);
    var tele = lerp(1.3, 0.85, diff), fire = 0.62, hw = 0.13 + 0.04 * diff;
    for (var tries = 0; tries < 7; tries++) {
      var lx = (tries === 0 && !other && W.rand() < 0.6) ? W.x : -0.82 + W.rand() * 1.64;
      lx = clamp(lx, -0.85, 0.85);
      if (other && Math.abs(lx - other.x) < 0.65) continue;
      if (!laserConflicts(W, lx, hw, other, tele + fire + 0.3)) {
        L.active = true; L.x = lx; L.hw = hw; L.state = 0; L.t = 0; L.tele = tele; L.fire = fire; L.done = false; L.beeped = false;
        emit(W, EV.LASER_WARN, lx, 0);
        return L;
      }
    }
    return null;
  }

  function hit(W, e) {
    if (W.god) { if (e) e.hit = true; return; }
    if (W.invulnT > 0) {
      if (e && !e.hit) { e.hit = true; if (W.dashT > 0) emit(W, EV.PHASE, W.x, W.z); }
      return;
    }
    if (W.shieldT > 0) {
      W.shieldT = 0; W.invulnT = 1.0; if (e) e.hit = true;
      emit(W, EV.SHIELD_BREAK, W.x, W.z);
      return;
    }
    W.alive = false; W.dying = true; W.deathT = 0;
    emit(W, EV.CRASH, W.x, W.z);
  }

  function collect(W, e) {
    e.taken = true; e.active = false;
    if (e.kind === K.SHARD) { W.shards++; emit(W, EV.SHARD, e.x, e.z); return; }
    if (e.kind === K.SHIELD) { W.shieldT = W.eff.shieldTime; W.shieldMax = W.eff.shieldTime; }
    else if (e.kind === K.MAGNET) W.magnetT = W.eff.magnetTime;
    else if (e.kind === K.SLOW) W.slowT = W.eff.slowmoTime;
    emit(W, EV.POWER, e.kind, e.z);
  }

  // Next hazard's safe line (for the demo/attract craft and the test autopilot).
  function nextSafeX(W) {
    for (var i = 0; i < W.nOrder; i++) {
      var e = W.ents[W.order[i]];
      if (e.kind <= K.MINE && e.z + e.depth > W.z - 0.5 && !e.hit) {
        if (e.kind === K.BAR) {
          // aim for the side the bar will not be on when it arrives
          var tArr = W.time + (e.z - W.z) / W.speed;
          var off = e.amp * Math.sin(e.omega * tArr + e.phase);
          if (e.mirror) return Math.abs(off) > 0.15 ? 0 : 0.8;
          return off > 0 ? -0.75 : 0.75;
        }
        return e.safeX;
      }
    }
    return W.lastSafeX;
  }

  function update(W, dt) {
    W.realTime += dt;
    var inp = W.input;
    if (W.dying) {
      W.deathT += dt;
      W.speed = approach(W.speed, 0, 2.5, dt);
      W.z += W.speed * dt * 0.4;
      W.time += dt;
      inp.dash = false;
      return;
    }
    if (!W.alive) return;

    // timers run in real time so power-ups last their stated seconds
    var wasSlow = W.slowT > 0;
    W.dashCd -= dt; W.dashT -= dt; W.invulnT -= dt; W.shieldT -= dt; W.magnetT -= dt; W.slowT -= dt;
    if (wasSlow && W.slowT <= 0) emit(W, EV.SLOW_END, 0, 0);
    W.timeScale = approach(W.timeScale, W.slowT > 0 ? 0.5 : 1, 6, dt);
    var wdt = dt * W.timeScale;

    if (inp.dash) {
      inp.dash = false;
      if (W.dashCd <= 0 && !W.demo) {
        W.dashT = 0.42; W.dashCd = W.eff.dashCooldown; if (W.invulnT < 0.48) W.invulnT = 0.48;
        emit(W, EV.DASH, W.x, W.z);
      }
    }

    // ---- steering ----
    var diff = Ph.difficulty(W.z);
    var maxV = 2.35 * (1 + 0.25 * diff);
    var target, desired;
    if (W.demo || W.auto) {
      target = nextSafeX(W);
      desired = clamp((target - W.x) * 9, -maxV, maxV);
      W.vx = approach(W.vx, desired, W.demo ? 6 : 14, dt);
    } else if (inp.pointer) {
      desired = clamp((inp.targetX - W.x) * 16, -maxV * 1.35, maxV * 1.35);
      W.vx = approach(W.vx, desired, 22, dt);
    } else {
      W.vx = approach(W.vx, inp.axis * maxV, 11, dt);
    }
    W.x += W.vx * dt;
    if (W.x > Ph.CRAFT_XMAX) { W.x = Ph.CRAFT_XMAX; if (W.vx > 0) W.vx = 0; }
    if (W.x < -Ph.CRAFT_XMAX) { W.x = -Ph.CRAFT_XMAX; if (W.vx < 0) W.vx = 0; }

    // ---- forward motion ----
    var targetSpeed = (W.demo ? 30 : Ph.speedAt(W.z)) * (W.dashT > 0 ? 1.6 : 1);
    W.speed = approach(W.speed, targetSpeed, W.dashT > 0 ? 10 : 4, dt);
    var zA = W.z;
    W.z += W.speed * wdt;
    var zB = W.z;
    W.time += wdt;
    if (!W.demo && !W.passedBest && W.best > 200 && W.z > W.best) { W.passedBest = true; emit(W, EV.BEST, W.x, W.z); }

    // ---- spawning ----
    var guard = 0;
    while (W.nextRowZ < W.z + AHEAD && guard++ < 6) spawnRow(W);
    if (!W.demo && W.z > W.laserMinZ) {
      if (W.nextLaserT === 0) W.nextLaserT = W.time + 2;
      if (W.time >= W.nextLaserT) {
        var L1 = startLaser(W, null);
        if (L1) {
          if (diff > 0.6 && W.rand() < 0.35) startLaser(W, L1);
          W.nextLaserT = W.time + lerp(11, 6, diff) + W.rand() * 3;
        } else W.nextLaserT = W.time + 0.8;
      }
    }

    // ---- lasers ----
    for (var li = 0; li < W.lasers.length; li++) {
      var L = W.lasers[li];
      if (!L.active) continue;
      L.t += wdt;
      if (L.state === 0) {
        if (!L.beeped && L.t > L.tele * 0.5) { L.beeped = true; emit(W, EV.LASER_WARN, L.x, 1); }
        if (L.t >= L.tele) { L.state = 1; L.t = 0; emit(W, EV.LASER_FIRE, L.x, 0); }
      } else {
        if (!L.done && Ph.laserHits(W.x, R, L.x, L.hw)) { L.done = true; hit(W, null); if (!W.alive) return; }
        if (L.t >= L.fire) L.active = false;
      }
    }

    // ---- entities ----
    var magnet = W.magnetT > 0, mReach = W.eff.magnetRadius * 2.5;
    var write = 0;
    for (var oi = 0; oi < W.nOrder; oi++) {
      var idx = W.order[oi], e = W.ents[idx];
      if (!e.active) continue;
      if (e.z + e.depth < W.z - 6) { e.active = false; continue; }
      var k = e.kind;
      if (k === K.WALL) {
        if (!e.hit && !W.demo && Ph.segmentsHit(W.x, R, zA, zB, 0, e.segs, e.nseg, e.z, e.z + e.depth) >= 0) hit(W, e);
      } else if (k === K.BAR) {
        e.off = e.amp * Math.sin(e.omega * W.time + e.phase);
        if (!e.hit && !W.demo) {
          var hitBar = Ph.sweptCircleBox(W.x, R, zA, zB, e.segs[0] + e.off, e.segs[1] + e.off, e.z, e.z + e.depth);
          if (!hitBar && e.mirror) hitBar = Ph.sweptCircleBox(W.x, R, zA, zB, e.segs[2] - e.off, e.segs[3] - e.off, e.z, e.z + e.depth);
          if (hitBar) hit(W, e);
        }
      } else if (k === K.MINE) {
        e.r = e.baseR * (1 + 0.28 * Math.sin(W.time * 4.2 + e.seed));
        if (!e.hit && !W.demo && Ph.sweptCircleCircle(W.x, R, zA, zB, e.x, e.z, e.r)) hit(W, e);
      } else {
        if (magnet && k === K.SHARD && e.z - W.z < 14 && e.z > W.z - 1 && Math.abs(e.x - W.x) < mReach) {
          e.x = approach(e.x, W.x, 9, dt);
          e.z = approach(e.z, W.z, 5, dt);
        }
        if (!W.demo && Ph.sweptCircleCircle(W.x, R, zA, zB, e.x, e.z, e.r)) collect(W, e);
      }
      if (!W.alive) { /* keep compacting so order stays valid */ }
      if (e.active) W.order[write++] = idx;
    }
    W.nOrder = write;
    // magnet pulls can reorder shards slightly: one insertion-sort pass keeps draw order right
    if (magnet) {
      for (var a = 1; a < W.nOrder; a++) {
        var v = W.order[a], vz = W.ents[v].z, b = a - 1;
        while (b >= 0 && W.ents[W.order[b]].z > vz) { W.order[b + 1] = W.order[b]; b--; }
        W.order[b + 1] = v;
      }
    }
  }

  function distance(W) { return Math.floor(W.z); }

  root.RR.World = { K: K, EV: EV, create: create, reset: reset, update: update, distance: distance, nextSafeX: nextSafeX };
})(typeof self !== 'undefined' ? self : this);
