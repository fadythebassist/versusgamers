/* Rift Runner - Canvas 2D renderer: perspective rift, hazards, craft, trails, particles.
   Sprites, gradients and buffers are built at init/resize; draw() does not allocate. */
(function (root) {
  'use strict';
  var Ph = root.RR.Physics, K = root.RR.World.K;
  var TAU = Math.PI * 2;

  var cv, c, w = 1, h = 1, dpr = 1;
  var P = 300, cx = 0, craftY = 0, horizonY = 0, Hc = 1, D = 9, FAR = 185, camX = 0, camZ = 0;
  var skyGrad, floorGrad, outerGrad, laneGrad, gridGrad, vignette, sideGrad;
  var bgImg = null, bgReady = false;
  var t = 0, shake = 0, flash = 0, flashCol = '#FFFFFF', reduced = false;
  var craftHex = '#22E4FF', trailId = 'ion', prismIdx = 0;
  var DASH_PAT = [9, 7], NO_DASH = [];

  // palette shared by particles and glow sprites (index 5 = current craft colour)
  var PAL = ['#22E4FF', '#FF2E88', '#FFB13B', '#FFFFFF', '#FF3B5C', '#22E4FF', '#7DFF6A', '#A98BFF'];
  var GLOW = [];
  var HUES = [], HUE_GLOW = [];
  var C_CYAN = 0, C_MAG = 1, C_AMB = 2, C_WHITE = 3, C_RED = 4, C_CRAFT = 5;

  // ---- particles (screen space, struct of arrays) ----
  var MAXP = 720, pc = 0;
  var px = new Float32Array(MAXP), py = new Float32Array(MAXP), pvx = new Float32Array(MAXP), pvy = new Float32Array(MAXP);
  var pl = new Float32Array(MAXP), pm = new Float32Array(MAXP), ps = new Float32Array(MAXP), pg = new Float32Array(MAXP);
  var pcol = new Uint8Array(MAXP), pshape = new Uint8Array(MAXP);

  // ---- stars ----
  var NS = 170;
  var sCos = new Float32Array(NS), sSin = new Float32Array(NS), sZ = new Float32Array(NS);

  // ---- trail history ----
  var NH = 26, hx = new Float32Array(NH), hHead = 0, emitAcc = 0;

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) { var r = hexToRgb(hex); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }

  function makeGlow(hex) {
    var s = 64, cnv = document.createElement('canvas');
    cnv.width = cnv.height = s;
    var g = cnv.getContext('2d'), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, rgba(hex, 1)); gr.addColorStop(0.18, rgba(hex, 0.6)); gr.addColorStop(0.5, rgba(hex, 0.16)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    return cnv;
  }
  function hslHex(hue) {
    // hsl(h,100%,62%) -> hex, built once at init
    var l = 0.62, s = 1, a = s * Math.min(l, 1 - l);
    var f = function (n) { var k = (n + hue / 30) % 12; var col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(255 * col); };
    var r = f(0), g = f(8), b = f(4);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function init(canvas) {
    cv = canvas;
    c = cv.getContext('2d', { alpha: false });
    for (var i = 0; i < PAL.length; i++) GLOW.push(makeGlow(PAL[i]));
    for (var hI = 0; hI < 24; hI++) { var hx2 = hslHex(hI * 15); HUES.push(hx2); HUE_GLOW.push(makeGlow(hx2)); }
    for (var s = 0; s < NS; s++) resetStar(s, Math.random());
    // optional backdrop: used only if assets/bg.webp exists next to the game
    var img = new Image();
    img.onload = function () { bgImg = img; bgReady = true; };
    img.onerror = function () { bgReady = false; };
    img.src = 'assets/bg.webp';
  }

  function resetStar(i, z) {
    var a = Math.random() * TAU;
    sCos[i] = Math.cos(a); sSin[i] = -Math.abs(Math.sin(a)) * 0.7 - 0.03; sZ[i] = z;
  }

  function setCraft(hex, trail) {
    craftHex = hex; trailId = trail || 'ion';
    PAL[C_CRAFT] = hex; GLOW[C_CRAFT] = makeGlow(hex === '#FFFFFF' ? '#CFE8FF' : hex);
  }
  function setReduced(v) { reduced = !!v; }

  function resize(cssW, cssH, ratio) {
    w = Math.max(1, cssW); h = Math.max(1, cssH); dpr = ratio;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var portrait = h > w * 1.1;
    // a longer lens in portrait keeps distant hazards readable on narrow screens
    D = portrait ? 13 : 9; FAR = portrait ? 205 : 185;
    P = Math.min(w * (portrait ? 0.46 : 0.42), h * 0.6);
    cx = w / 2;
    craftY = h * (portrait ? 0.79 : 0.8);
    horizonY = h * (portrait ? 0.3 : 0.37);
    Hc = craftY + P * 0.07 - horizonY;
    skyGrad = c.createLinearGradient(0, 0, 0, horizonY);
    skyGrad.addColorStop(0, '#03040B'); skyGrad.addColorStop(0.7, '#0A0820'); skyGrad.addColorStop(1, '#1C0B36');
    outerGrad = c.createLinearGradient(0, horizonY, 0, h);
    outerGrad.addColorStop(0, '#120A2C'); outerGrad.addColorStop(0.25, '#07061A'); outerGrad.addColorStop(1, '#030409');
    floorGrad = c.createLinearGradient(0, horizonY, 0, h);
    floorGrad.addColorStop(0, '#1E1040'); floorGrad.addColorStop(0.3, '#0C0B26'); floorGrad.addColorStop(1, '#070A1A');
    laneGrad = c.createLinearGradient(0, horizonY, 0, h);
    laneGrad.addColorStop(0, 'rgba(34,228,255,0)'); laneGrad.addColorStop(0.35, 'rgba(34,228,255,0.18)'); laneGrad.addColorStop(1, 'rgba(34,228,255,0.34)');
    gridGrad = c.createLinearGradient(0, horizonY, 0, h);
    gridGrad.addColorStop(0, 'rgba(169,139,255,0)'); gridGrad.addColorStop(0.25, 'rgba(169,139,255,0.2)'); gridGrad.addColorStop(1, 'rgba(169,139,255,0.42)');
    sideGrad = c.createLinearGradient(0, horizonY, 0, h);
    sideGrad.addColorStop(0, 'rgba(255,46,136,0)'); sideGrad.addColorStop(0.4, 'rgba(255,46,136,0.07)'); sideGrad.addColorStop(1, 'rgba(34,228,255,0.12)');
    var vr = Math.max(w, h) * 0.75;
    vignette = c.createRadialGradient(cx, h * 0.55, vr * 0.35, cx, h * 0.55, vr);
    vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  }

  // projection helpers
  function SX(x, k) { return cx + (x - camX) * P * k; }
  function SY(y, k) { return horizonY + (Hc - y * P) * k; }

  function emit(x, y, vx, vy, life, size, col, shape, drag) {
    var i = pc; pc = (pc + 1) % MAXP;
    px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pm[i] = life; ps[i] = size; pcol[i] = col; pshape[i] = shape; pg[i] = drag || 0;
  }

  function burst(x, y, n, speed, life, size, col, col2) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      emit(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), (i & 1) ? col : col2, 0, 2.5);
    }
  }

  function craftScreenX(W) { return cx + (W.x - camX) * P; }
  function craftSize() { return Math.max(P * 0.08, 14); }

  // Visual reactions to simulation events.
  function fx(type, W, a, b) {
    var EV = root.RR.World.EV;
    var s = craftSize(), x = craftScreenX(W), y = craftY;
    if (type === EV.SHARD) {
      burst(x, y - s * 0.4, 7, 260, 0.35, 3, C_CYAN, C_WHITE);
      emit(x, y - s * 0.4, 0, 0, 0.3, s * 1.2, C_CYAN, 2, 0);
    } else if (type === EV.POWER) {
      var col = a === K.SHIELD ? C_CYAN : (a === K.MAGNET ? C_MAG : C_AMB);
      burst(x, y, 22, 420, 0.6, 4, col, C_WHITE);
      emit(x, y, 0, 0, 0.5, s * 3, col, 2, 0);
      flashCol = PAL[col]; flash = Math.max(flash, 0.18);
    } else if (type === EV.SHIELD_BREAK) {
      burst(x, y, 40, 600, 0.7, 4, C_CYAN, C_WHITE);
      emit(x, y, 0, 0, 0.6, s * 4, C_CYAN, 2, 0);
      flashCol = '#22E4FF'; flash = Math.max(flash, 0.4); shake = Math.max(shake, 9);
    } else if (type === EV.CRASH) {
      burst(x, y, 70, 820, 1.1, 5, C_CRAFT, C_WHITE);
      burst(x, y, 40, 500, 0.9, 4, C_MAG, C_AMB);
      emit(x, y, 0, 0, 0.7, s * 5, C_WHITE, 2, 0);
      emit(x, y, 0, 0, 1.0, s * 8, C_MAG, 2, 0);
      flashCol = '#FFFFFF'; flash = 0.7; shake = 18;
    } else if (type === EV.DASH) {
      emit(x, y, 0, 0, 0.35, s * 2.6, C_WHITE, 2, 0);
      for (var i = 0; i < 14; i++) emit(x + (Math.random() - 0.5) * s * 2, y + s * 0.6, (Math.random() - 0.5) * 60, 600 + Math.random() * 500, 0.3, 2, C_CRAFT, 3, 0);
    } else if (type === EV.PHASE) {
      burst(x, y - s, 26, 520, 0.5, 3, C_MAG, C_WHITE);
    } else if (type === EV.LASER_FIRE) {
      shake = Math.max(shake, 4);
    }
  }

  function updateParticles(dt) {
    for (var i = 0; i < MAXP; i++) {
      if (pl[i] <= 0) continue;
      pl[i] -= dt;
      var d = pg[i];
      if (d > 0) { var f = Math.exp(-d * dt); pvx[i] *= f; pvy[i] *= f; }
      px[i] += pvx[i] * dt; py[i] += pvy[i] * dt;
    }
  }

  function drawParticles() {
    c.globalCompositeOperation = 'lighter';
    for (var i = 0; i < MAXP; i++) {
      var life = pl[i];
      if (life <= 0) continue;
      var f = life / pm[i], col = pcol[i], shp = pshape[i], sz = ps[i];
      var hex = col >= 16 ? HUES[col - 16] : PAL[col];
      if (shp === 0) {
        c.globalAlpha = f; c.fillStyle = hex;
        c.fillRect(px[i] - sz / 2, py[i] - sz / 2, sz, sz);
      } else if (shp === 1) {
        var g = col >= 16 ? HUE_GLOW[col - 16] : GLOW[col], gs = sz * (0.6 + 0.4 * f);
        c.globalAlpha = f * 0.8; c.drawImage(g, px[i] - gs, py[i] - gs, gs * 2, gs * 2);
      } else if (shp === 2) {
        c.globalAlpha = f * 0.9; c.strokeStyle = hex; c.lineWidth = 2 + 3 * f;
        c.beginPath(); c.arc(px[i], py[i], sz * (1.15 - f * 0.85) + 1, 0, TAU); c.stroke();
      } else {
        c.globalAlpha = f; c.strokeStyle = hex; c.lineWidth = sz;
        c.beginPath(); c.moveTo(px[i], py[i]); c.lineTo(px[i] - pvx[i] * 0.03, py[i] - pvy[i] * 0.03); c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function drawBackground(W) {
    if (bgReady) {
      var iw = bgImg.naturalWidth || 1, ih = bgImg.naturalHeight || 1;
      var sc = Math.max(w / iw, h / ih) * 1.12;
      var dw = iw * sc, dh = ih * sc;
      var ox = (w - dw) / 2 - W.x * w * 0.015, oy = (h - dh) / 2 + Math.sin(t * 0.05) * h * 0.012;
      c.drawImage(bgImg, ox, oy, dw, dh);
      c.globalAlpha = 0.72; c.fillStyle = '#04050D'; c.fillRect(0, 0, w, h);
      c.globalAlpha = 0.55; c.fillStyle = skyGrad; c.fillRect(0, 0, w, horizonY);
      c.globalAlpha = 1;
    } else {
      c.fillStyle = skyGrad; c.fillRect(0, 0, w, horizonY + 2);
    }
  }

  function drawStars(W, dt) {
    var spd = W.speed * W.timeScale, dashA = W.dashT > 0 ? 1 : 0;
    var base = Math.min(w, h) * 0.05, len = 0.03 + spd * 0.0016 + dashA * 0.12;
    c.save();
    c.beginPath(); c.rect(-w, -h, w * 3, horizonY + h); c.clip();
    c.globalCompositeOperation = 'lighter';
    for (var pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (var i = 0; i < NS; i++) {
        if (pass === 0) { sZ[i] -= dt * spd * 0.006; if (sZ[i] <= 0.03) resetStar(i, 1); }
        var z = sZ[i];
        if ((z > 0.45) !== (pass === 0)) continue;
        var r0 = base / z, r1 = r0 * (1 + len);
        c.moveTo(cx + sCos[i] * r0, horizonY + sSin[i] * r0);
        c.lineTo(cx + sCos[i] * r1, horizonY + sSin[i] * r1);
      }
      c.globalAlpha = pass === 0 ? 0.35 : 0.85;
      c.strokeStyle = pass === 0 ? '#9FC8FF' : '#E6F7FF';
      c.lineWidth = pass === 0 ? 1 : 1.6;
      c.stroke();
    }
    // rift core glow at the vanishing point
    var pulse = 1 + Math.sin(t * 1.7) * 0.06;
    var gs = Math.max(w, h) * 0.32 * pulse;
    c.globalAlpha = 0.55; c.drawImage(GLOW[C_MAG], cx - gs, horizonY - gs * 0.6, gs * 2, gs * 1.2);
    gs *= 0.45;
    c.globalAlpha = 0.6; c.drawImage(GLOW[C_CYAN], cx - gs, horizonY - gs * 0.5, gs * 2, gs);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.restore();
  }

  function drawFloor(W) {
    var kF = D / FAR, zrN = 1.2, kN = D / zrN;
    var yF = SY(0, kF), yN = SY(0, kN);
    var i, k, y, zr;
    // outer void plane
    c.fillStyle = outerGrad; c.fillRect(-w, horizonY, w * 3, h * 2);
    // sparse outer grid
    c.strokeStyle = gridGrad; c.lineWidth = 1; c.globalAlpha = 0.45;
    c.beginPath();
    var start = Math.ceil((camZ + zrN) / 24) * 24;
    for (var gz = start; gz < camZ + FAR; gz += 24) {
      k = D / (gz - camZ); y = SY(0, k);
      c.moveTo(SX(-9, k), y); c.lineTo(SX(-1.05, k), y);
      c.moveTo(SX(1.05, k), y); c.lineTo(SX(9, k), y);
    }
    for (i = 2; i <= 8; i += 2) {
      c.moveTo(SX(-i, kF), yF); c.lineTo(SX(-i, kN), yN);
      c.moveTo(SX(i, kF), yF); c.lineTo(SX(i, kN), yN);
    }
    c.stroke(); c.globalAlpha = 1;
    // corridor floor
    c.fillStyle = floorGrad;
    c.beginPath();
    c.moveTo(SX(-1, kF), yF); c.lineTo(SX(1, kF), yF); c.lineTo(SX(1, kN), yN); c.lineTo(SX(-1, kN), yN);
    c.closePath(); c.fill();
    // lane lines
    c.strokeStyle = laneGrad; c.lineWidth = 1.2;
    c.beginPath();
    for (i = -3; i <= 3; i += 2) { var lx = i * 0.2; c.moveTo(SX(lx, kF), yF); c.lineTo(SX(lx, kN), yN); }
    c.stroke();
    // cross lines scrolling toward the camera
    c.strokeStyle = gridGrad; c.lineWidth = 1;
    c.beginPath();
    start = Math.ceil((camZ + zrN) / 7) * 7;
    for (var z = start; z < camZ + FAR; z += 7) {
      zr = z - camZ; k = D / zr; y = SY(0, k);
      c.moveTo(SX(-1, k), y); c.lineTo(SX(1, k), y);
    }
    c.stroke();
    // side walls (translucent energy curtains)
    var wh = 0.5;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = sideGrad;
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      c.beginPath();
      c.moveTo(SX(sgn, kF), yF); c.lineTo(SX(sgn, kF), SY(wh, kF)); c.lineTo(SX(sgn, kN), SY(wh, kN)); c.lineTo(SX(sgn, kN), yN);
      c.closePath(); c.fill();
    }
    // pylons
    c.strokeStyle = '#A98BFF'; c.lineWidth = 2; c.globalAlpha = 0.55;
    c.beginPath();
    start = Math.ceil((camZ + 2) / 22) * 22;
    for (var pz = start; pz < camZ + FAR; pz += 22) {
      k = D / (pz - camZ);
      var yb = SY(0, k), yt = SY(wh, k);
      c.moveTo(SX(-1, k), yb); c.lineTo(SX(-1, k), yt);
      c.moveTo(SX(1, k), yb); c.lineTo(SX(1, k), yt);
    }
    c.stroke();
    c.globalAlpha = 0.85;
    for (pz = start; pz < camZ + FAR; pz += 22) {
      k = D / (pz - camZ);
      var gsz = Math.max(3, 0.09 * P * k), ytop = SY(wh, k);
      c.drawImage(GLOW[C_MAG], SX(-1, k) - gsz, ytop - gsz, gsz * 2, gsz * 2);
      c.drawImage(GLOW[C_CYAN], SX(1, k) - gsz, ytop - gsz, gsz * 2, gsz * 2);
    }
    // rails: wide soft pass then a crisp pass
    for (var pass = 0; pass < 2; pass++) {
      c.globalAlpha = pass === 0 ? 0.22 : 0.95;
      c.lineWidth = pass === 0 ? 7 : 2;
      c.strokeStyle = '#22E4FF';
      c.beginPath();
      c.moveTo(SX(-1, kF), yF); c.lineTo(SX(-1, kN), yN);
      c.moveTo(SX(1, kF), yF); c.lineTo(SX(1, kN), yN);
      c.stroke();
      c.strokeStyle = '#FF2E88';
      c.beginPath();
      c.moveTo(SX(-1, kF), SY(wh, kF)); c.lineTo(SX(-1, kN), SY(wh, kN));
      c.moveTo(SX(1, kF), SY(wh, kF)); c.lineTo(SX(1, kN), SY(wh, kN));
      c.stroke();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function drawLasers(W) {
    var kF = D / FAR, kN = D / 1.4, kC = D / D;
    for (var i = 0; i < W.lasers.length; i++) {
      var L = W.lasers[i];
      if (!L.active) continue;
      var x0 = L.x - L.hw, x1 = L.x + L.hw;
      c.globalCompositeOperation = 'lighter';
      if (L.state === 0) {
        var p = L.t / L.tele, blink = Math.sin(L.t * (14 + p * 26)) > 0 ? 1 : 0.45;
        c.globalAlpha = (0.12 + 0.18 * p) * blink;
        c.fillStyle = '#FF3B5C';
        c.beginPath(); c.moveTo(SX(x0, kF), SY(0, kF)); c.lineTo(SX(x1, kF), SY(0, kF)); c.lineTo(SX(x1, kN), SY(0, kN)); c.lineTo(SX(x0, kN), SY(0, kN)); c.closePath(); c.fill();
        c.globalAlpha = (0.5 + 0.5 * p) * blink; c.strokeStyle = '#FF3B5C'; c.lineWidth = 1.5;
        c.setLineDash(DASH_PAT); c.lineDashOffset = -t * 120;
        c.beginPath(); c.moveTo(SX(x0, kF), SY(0, kF)); c.lineTo(SX(x0, kN), SY(0, kN)); c.moveTo(SX(x1, kF), SY(0, kF)); c.lineTo(SX(x1, kN), SY(0, kN)); c.stroke();
        c.setLineDash(NO_DASH);
        // charging emitter in the rift + warning marker near the craft
        var es = (8 + p * 26) * (P / 300);
        c.globalAlpha = 0.9; c.drawImage(GLOW[C_RED], SX(L.x, kF) - es, SY(0.05, kF) - es, es * 2, es * 2);
        c.globalCompositeOperation = 'source-over';
        var mx = SX(L.x, kC), my = SY(0, kC) + 6, ms = Math.max(12, P * 0.06);
        c.globalAlpha = blink;
        c.fillStyle = '#FF3B5C';
        c.beginPath(); c.moveTo(mx, my - ms); c.lineTo(mx + ms * 0.95, my + ms * 0.7); c.lineTo(mx - ms * 0.95, my + ms * 0.7); c.closePath(); c.fill();
        c.fillStyle = '#12020A';
        c.fillRect(mx - ms * 0.09, my - ms * 0.45, ms * 0.18, ms * 0.65);
        c.fillRect(mx - ms * 0.09, my + ms * 0.33, ms * 0.18, ms * 0.18);
      } else {
        var fl = 0.8 + Math.random() * 0.2, fade = 1 - Math.max(0, (L.t - L.fire + 0.15) / 0.15);
        var yb = 0.14;
        c.globalAlpha = 0.22 * fade; c.fillStyle = '#FF3B5C';
        c.beginPath(); c.moveTo(SX(x0 - L.hw, kF), SY(0, kF)); c.lineTo(SX(x1 + L.hw, kF), SY(0, kF)); c.lineTo(SX(x1 + L.hw, kN), SY(0, kN)); c.lineTo(SX(x0 - L.hw, kN), SY(0, kN)); c.closePath(); c.fill();
        c.globalAlpha = 0.75 * fl * fade;
        c.beginPath(); c.moveTo(SX(x0, kF), SY(yb, kF)); c.lineTo(SX(x1, kF), SY(yb, kF)); c.lineTo(SX(x1, kN), SY(yb, kN)); c.lineTo(SX(x0, kN), SY(yb, kN)); c.closePath(); c.fill();
        var xa = L.x - L.hw * 0.3, xb = L.x + L.hw * 0.3;
        c.globalAlpha = 0.95 * fade; c.fillStyle = '#FFE6EC';
        c.beginPath(); c.moveTo(SX(xa, kF), SY(yb, kF)); c.lineTo(SX(xb, kF), SY(yb, kF)); c.lineTo(SX(xb, kN), SY(yb, kN)); c.lineTo(SX(xa, kN), SY(yb, kN)); c.closePath(); c.fill();
        var es2 = 40 * (P / 300) * fl;
        c.drawImage(GLOW[C_RED], SX(L.x, kF) - es2, SY(yb, kF) - es2, es2 * 2, es2 * 2);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
  }

  // An axis-aligned block seen from behind and above.
  function drawBlock(x0, x1, y0, y1, zr, dep, front, top, edge, fog, faded) {
    if (x0 < -1) x0 = -1; if (x1 > 1) x1 = 1;
    if (x1 <= x0) return;
    var k0 = D / zr, k1 = D / (zr + dep);
    var ax0 = SX(x0, k0), ax1 = SX(x1, k0), yb = SY(y0, k0), yt = SY(y1, k0);
    var bx0 = SX(x0, k1), bx1 = SX(x1, k1), yt2 = SY(y1, k1);
    var a = fog * (faded ? 0.3 : 1);
    c.globalAlpha = a;
    c.fillStyle = top;
    c.beginPath(); c.moveTo(ax0, yt); c.lineTo(ax1, yt); c.lineTo(bx1, yt2); c.lineTo(bx0, yt2); c.closePath(); c.fill();
    c.fillStyle = front;
    c.fillRect(ax0, yt, ax1 - ax0, yb - yt);
    var lw = Math.max(1, Math.min(3, 2.2 * k0));
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = edge;
    c.globalAlpha = a * 0.28; c.lineWidth = lw * 3.5;
    c.strokeRect(ax0, yt, ax1 - ax0, yb - yt);
    c.globalAlpha = a; c.lineWidth = lw;
    c.strokeRect(ax0, yt, ax1 - ax0, yb - yt);
    c.beginPath(); c.moveTo(ax0, yt); c.lineTo(bx0, yt2); c.lineTo(bx1, yt2); c.lineTo(ax1, yt);
    c.moveTo(ax0, (yt + yb) * 0.5); c.lineTo(ax1, (yt + yb) * 0.5);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
  }

  function drawEntity(W, e) {
    var zr = e.z - camZ;
    if (zr < 0.6 || zr > FAR + 5) return;
    var fog = Ph.clamp((FAR - zr) / 38, 0, 1);
    if (fog <= 0) return;
    var k = D / zr, kind = e.kind, i;
    if (kind === K.WALL) {
      for (i = 0; i < e.nseg; i++) drawBlock(e.segs[i * 2], e.segs[i * 2 + 1], 0, e.h, zr, e.depth, '#1C0720', '#5A1446', '#FF2E88', fog, e.hit);
    } else if (kind === K.BAR) {
      // track line across the corridor, then the sliding block(s)
      c.globalAlpha = fog * 0.5; c.strokeStyle = '#FFB13B'; c.lineWidth = 1;
      var yy = SY(0, k);
      c.beginPath(); c.moveTo(SX(-1, k), yy); c.lineTo(SX(1, k), yy); c.stroke();
      drawBlock(e.segs[0] + e.off, e.segs[1] + e.off, 0.04, 0.04 + e.h, zr, e.depth, '#221304', '#6A3F0C', '#FFB13B', fog, e.hit);
      if (e.mirror) drawBlock(e.segs[2] - e.off, e.segs[3] - e.off, 0.04, 0.04 + e.h, zr, e.depth, '#221304', '#6A3F0C', '#FFB13B', fog, e.hit);
      // direction chevrons
      var dir = Math.cos(e.omega * W.time + e.phase) > 0 ? 1 : -1;
      var bx = SX(e.off, k), by = SY(0.04 + e.h * 0.5, k), cs = Math.max(3, 0.06 * P * k);
      if (!e.mirror) {
        c.globalAlpha = fog; c.strokeStyle = '#FFF1D6'; c.lineWidth = Math.max(1, cs * 0.3);
        c.beginPath();
        for (i = -1; i <= 1; i += 2) { var ox = bx + i * cs * 1.2; c.moveTo(ox - dir * cs * 0.5, by - cs * 0.6); c.lineTo(ox + dir * cs * 0.5, by); c.lineTo(ox - dir * cs * 0.5, by + cs * 0.6); }
        c.stroke();
      }
    } else if (kind === K.MINE) {
      var my = 0.14 + 0.02 * Math.sin(t * 3 + e.seed);
      var mx = SX(e.x, k), myy = SY(my, k), rr = Math.max(2, e.r * P * k);
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = fog * 0.85;
      var gs = rr * 3.2; c.drawImage(GLOW[C_RED], mx - gs, myy - gs, gs * 2, gs * 2);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = fog * (e.hit ? 0.3 : 1);
      c.fillStyle = '#2A0614';
      c.beginPath(); c.arc(mx, myy, rr, 0, TAU); c.fill();
      c.strokeStyle = '#FF3B5C'; c.lineWidth = Math.max(1, rr * 0.2);
      c.stroke();
      c.beginPath();
      var rot = t * 1.4 + e.seed;
      for (i = 0; i < 8; i++) {
        var an = rot + i * TAU / 8, ca = Math.cos(an), sa = Math.sin(an);
        c.moveTo(mx + ca * rr * 1.05, myy + sa * rr * 1.05); c.lineTo(mx + ca * rr * 1.5, myy + sa * rr * 1.5);
      }
      c.stroke();
      c.fillStyle = '#FFD0DA';
      c.globalAlpha = fog * (0.5 + 0.5 * Math.sin(t * 8.4 + e.seed));
      c.beginPath(); c.arc(mx, myy, rr * 0.32, 0, TAU); c.fill();
    } else if (kind === K.SHARD) {
      var sy = SY(0.11 + 0.025 * Math.sin(t * 4 + e.seed), k), sx = SX(e.x, k), ss = Math.max(2, 0.05 * P * k);
      var spin = Math.abs(Math.cos(t * 4 + e.seed)) * 0.6 + 0.2;
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = fog * 0.8;
      c.drawImage(GLOW[C_CYAN], sx - ss * 2.4, sy - ss * 2.4, ss * 4.8, ss * 4.8);
      c.globalAlpha = fog; c.fillStyle = '#C9F8FF';
      c.beginPath(); c.moveTo(sx, sy - ss); c.lineTo(sx + ss * spin, sy); c.lineTo(sx, sy + ss); c.lineTo(sx - ss * spin, sy); c.closePath(); c.fill();
      c.globalCompositeOperation = 'source-over';
    } else {
      drawPower(e, k, fog);
    }
    c.globalAlpha = 1;
  }

  function hexPath(x, y, r, rot) {
    c.beginPath();
    for (var i = 0; i < 6; i++) { var a = rot + i * TAU / 6; if (i === 0) c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }

  function drawPower(e, k, fog) {
    var col = e.kind === K.SHIELD ? C_CYAN : (e.kind === K.MAGNET ? C_MAG : C_AMB);
    var x = SX(e.x, k), y = SY(0.17 + 0.03 * Math.sin(t * 3 + e.seed), k), r = Math.max(4, 0.1 * P * k);
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = fog * 0.9; c.drawImage(GLOW[col], x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = fog;
    hexPath(x, y, r, t * 0.8);
    c.fillStyle = '#0A0E22'; c.fill();
    c.strokeStyle = PAL[col]; c.lineWidth = Math.max(1.2, r * 0.14); c.stroke();
    drawIcon(e.kind, x, y, r * 0.55, '#FFFFFF', Math.max(1.2, r * 0.13));
  }

  // Small procedural glyphs for power-ups (also reused by the HUD via canvas-free SVG in HTML).
  function drawIcon(kind, x, y, s, col, lw) {
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    if (kind === K.SHIELD) {
      c.moveTo(x, y - s); c.lineTo(x + s * 0.85, y - s * 0.6); c.lineTo(x + s * 0.7, y + s * 0.35); c.lineTo(x, y + s); c.lineTo(x - s * 0.7, y + s * 0.35); c.lineTo(x - s * 0.85, y - s * 0.6); c.closePath();
    } else if (kind === K.MAGNET) {
      c.moveTo(x - s * 0.7, y - s * 0.8); c.lineTo(x - s * 0.7, y + s * 0.05);
      c.arc(x, y + s * 0.05, s * 0.7, Math.PI, 0, true);
      c.lineTo(x + s * 0.7, y - s * 0.8);
    } else {
      c.moveTo(x - s * 0.7, y - s * 0.85); c.lineTo(x + s * 0.7, y - s * 0.85); c.lineTo(x - s * 0.7, y + s * 0.85); c.lineTo(x + s * 0.7, y + s * 0.85); c.closePath();
    }
    c.stroke();
    c.lineCap = 'butt';
  }

  function craftPath(s) {
    c.beginPath();
    c.moveTo(0, -1.5 * s); c.lineTo(0.3 * s, -0.35 * s); c.lineTo(1.25 * s, 0.5 * s); c.lineTo(0.45 * s, 0.38 * s);
    c.lineTo(0.3 * s, 0.62 * s); c.lineTo(-0.3 * s, 0.62 * s); c.lineTo(-0.45 * s, 0.38 * s); c.lineTo(-1.25 * s, 0.5 * s);
    c.lineTo(-0.3 * s, -0.35 * s); c.closePath();
  }

  function craftColorIdx() { return trailId === 'aurora' || craftHex === '#FFFFFF' ? 16 + prismIdx : C_CRAFT; }
  function craftStroke() { return craftHex === '#FFFFFF' ? HUES[prismIdx] : craftHex; }

  function drawTrail(W, dt) {
    var s = craftSize(), x = craftScreenX(W), y = craftY + s * 0.62;
    var col = craftColorIdx(), spd = W.speed * W.timeScale;
    // history for ribbon trails
    hHead = (hHead + NH - 1) % NH; hx[hHead] = x;
    emitAcc += dt;
    if (trailId === 'ribbon' || trailId === 'aurora') {
      var seg = s * 0.5 * (0.6 + spd / 60);
      c.globalCompositeOperation = 'lighter';
      for (var pass = 0; pass < 2; pass++) {
        for (var i = 0; i < NH - 1; i++) {
          var a = hx[(hHead + i) % NH], b = hx[(hHead + i + 1) % NH];
          var f = 1 - i / (NH - 1);
          c.globalAlpha = f * (pass === 0 ? 0.25 : 0.9);
          c.strokeStyle = trailId === 'aurora' ? HUES[(prismIdx + i) % 24] : craftStroke();
          c.lineWidth = (pass === 0 ? s * 0.9 : s * 0.22) * f + 1;
          c.beginPath(); c.moveTo(a, y + i * seg); c.lineTo(b, y + (i + 1) * seg); c.stroke();
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    var rate = 1 / 90;
    while (emitAcc > rate) {
      emitAcc -= rate;
      var vy = 380 + spd * 7;
      if (trailId === 'ion' || trailId === 'ribbon' || trailId === 'aurora') {
        emit(x - s * 0.3 + (Math.random() - 0.5) * 2, y, (Math.random() - 0.5) * 30, vy, 0.22, 2.5, col, 0, 0);
        emit(x + s * 0.3 + (Math.random() - 0.5) * 2, y, (Math.random() - 0.5) * 30, vy, 0.22, 2.5, col, 0, 0);
      } else if (trailId === 'sparks') {
        emit(x + (Math.random() - 0.5) * s * 0.6, y, (Math.random() - 0.5) * 260, vy * (0.4 + Math.random() * 0.6), 0.35, 2.5, Math.random() < 0.5 ? col : C_WHITE, 3, 1.5);
      } else if (trailId === 'pulse') {
        if (Math.random() < 0.1) emit(x, y, 0, vy * 0.6, 0.45, s * 0.9, col, 2, 0);
        emit(x, y, (Math.random() - 0.5) * 20, vy, 0.18, 2, col, 0, 0);
      } else if (trailId === 'comet') {
        emit(x + (Math.random() - 0.5) * s * 0.3, y, (Math.random() - 0.5) * 30, vy * 0.8, 0.4, s * 0.8, col, 1, 0.5);
      }
    }
  }

  function drawCraft(W, st) {
    var s = craftSize(), x = craftScreenX(W), y = craftY + Math.sin(t * 3.1) * s * 0.06;
    var stroke = craftStroke(), gIdx = craftColorIdx();
    var glowImg = gIdx >= 16 ? HUE_GLOW[gIdx - 16] : GLOW[gIdx];
    var dashing = W.dashT > 0;
    var blink = (W.invulnT > 0 && !dashing) ? (Math.sin(t * 40) > 0 ? 1 : 0.35) : 1;
    c.save();
    c.translate(x, y);
    c.rotate(Ph.clamp(-W.vx * 0.13, -0.42, 0.42) * (reduced ? 0.6 : 1));
    // afterimages while dashing
    if (dashing) {
      c.globalCompositeOperation = 'lighter';
      for (var i = 1; i <= 3; i++) {
        c.save(); c.translate(0, s * 0.85 * i);
        c.globalAlpha = 0.35 / i; craftPath(s); c.strokeStyle = stroke; c.lineWidth = 2; c.stroke();
        c.restore();
      }
      c.globalCompositeOperation = 'source-over';
    }
    // engines
    c.globalCompositeOperation = 'lighter';
    var es = s * (dashing ? 1.6 : 1.05) * (0.9 + Math.random() * 0.15);
    c.globalAlpha = blink;
    c.drawImage(glowImg, -s * 0.3 - es, s * 0.66 - es, es * 2, es * 2);
    c.drawImage(glowImg, s * 0.3 - es, s * 0.66 - es, es * 2, es * 2);
    c.globalAlpha = 0.35 * blink;
    c.drawImage(glowImg, -s * 2.2, -s * 2, s * 4.4, s * 4.4);
    c.globalCompositeOperation = 'source-over';
    // hull
    c.globalAlpha = blink;
    craftPath(s);
    c.fillStyle = '#0B1128'; c.fill();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = dashing ? '#FFFFFF' : stroke;
    c.globalAlpha = 0.3 * blink; c.lineWidth = 6; c.stroke();
    c.globalAlpha = blink; c.lineWidth = 2; c.stroke();
    // cockpit + spine
    c.beginPath(); c.moveTo(0, -1.0 * s); c.lineTo(0.17 * s, -0.25 * s); c.lineTo(0, -0.02 * s); c.lineTo(-0.17 * s, -0.25 * s); c.closePath();
    c.fillStyle = stroke; c.globalAlpha = 0.9 * blink; c.fill();
    c.beginPath(); c.moveTo(-0.95 * s, 0.42 * s); c.lineTo(-0.35 * s, 0.05 * s); c.moveTo(0.95 * s, 0.42 * s); c.lineTo(0.35 * s, 0.05 * s);
    c.lineWidth = 1.2; c.globalAlpha = 0.7 * blink; c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.restore();

    // shield bubble and magnet field
    c.globalCompositeOperation = 'lighter';
    if (W.shieldT > 0) {
      var warn = W.shieldT < 2 ? (Math.sin(t * 18) > 0 ? 1 : 0.3) : 1;
      hexPath(x, y, s * 2.0, t * 0.6);
      c.globalAlpha = 0.08 * warn; c.fillStyle = '#22E4FF'; c.fill();
      c.globalAlpha = 0.75 * warn; c.strokeStyle = '#22E4FF'; c.lineWidth = 2; c.stroke();
      hexPath(x, y, s * 2.0, t * 0.6);
      c.globalAlpha = 0.2 * warn; c.lineWidth = 7; c.stroke();
    }
    if (W.magnetT > 0) {
      var mw = W.magnetT < 2 ? (Math.sin(t * 18) > 0 ? 1 : 0.3) : 1;
      c.strokeStyle = '#FF2E88'; c.lineWidth = 2;
      for (var m = 0; m < 2; m++) {
        var rr = s * (2.5 + ((t * 1.6 + m * 0.5) % 1) * 1.4);
        c.globalAlpha = 0.6 * mw * (1 - ((t * 1.6 + m * 0.5) % 1));
        c.beginPath(); c.arc(x, y, rr, -2.6, -0.54); c.stroke();
        c.beginPath(); c.arc(x, y, rr, 0.54, 2.6); c.stroke();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  function step(dt, W) {
    t += dt;
    prismIdx = Math.floor(t * 8) % 24;
    if (shake > 0) shake = Math.max(0, shake - dt * 40);
    if (flash > 0) flash = Math.max(0, flash - dt * 1.8);
    updateParticles(dt);
  }

  function draw(W, dt, showCraft) {
    step(dt, W);
    camX = W.x * 0.45;
    camZ = W.z - D;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    drawBackground(W);
    c.save();
    if (shake > 0 && !reduced) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    var bank = Ph.clamp(-W.vx * 0.03, -0.06, 0.06) * (reduced ? 0.3 : 1);
    c.translate(cx, craftY); c.rotate(bank); c.translate(-cx, -craftY);
    drawStars(W, dt);
    drawFloor(W);
    drawLasers(W);
    for (var i = W.nOrder - 1; i >= 0; i--) drawEntity(W, W.ents[W.order[i]]);
    if (showCraft) drawTrail(W, dt);
    drawParticles();
    if (showCraft) drawCraft(W);
    c.restore();
    // slow-mo tint, flashes, vignette
    var slowA = 1 - W.timeScale;
    if (slowA > 0.01) { c.globalAlpha = slowA * 0.35; c.fillStyle = '#3B1B7A'; c.globalCompositeOperation = 'lighter'; c.fillRect(0, 0, w, h); c.globalCompositeOperation = 'source-over'; }
    if (flash > 0) { c.globalAlpha = reduced ? Math.min(flash, 0.6) * 0.2 : flash * 0.6; c.fillStyle = flashCol; c.fillRect(0, 0, w, h); }
    c.globalAlpha = 1;
    c.fillStyle = vignette; c.fillRect(0, 0, w, h);
  }

  root.RR.Render = { init: init, resize: resize, draw: draw, fx: fx, setCraft: setCraft, setReduced: setReduced,
    hasBackdrop: function () { return bgReady; }, craftScreenX: function (W) { camX = W.x * 0.45; return craftScreenX(W); },
    metrics: function () { return { P: P, cx: cx, craftY: craftY, horizonY: horizonY, w: w, h: h }; } };
})(typeof self !== 'undefined' ? self : this);
