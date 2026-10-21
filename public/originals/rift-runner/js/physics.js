/* Rift Runner - pure collision tests and tuning curves (no DOM).
   Browser: RR.Physics. Node: module.exports. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) { module.exports = mod; }
  else { root.RR = root.RR || {}; root.RR.Physics = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // World units: the rift is 2 units wide (x from -1 to 1); z is distance in metres.
  var CORRIDOR = 1;
  var CRAFT_R = 0.062;     // craft hit radius (the drawn craft is a little wider: forgiving)
  var CRAFT_XMAX = 0.9;    // how far the craft can slide from the centre line

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // Frame-rate independent exponential approach.
  function approach(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }

  // ---- Tuning curves (all depend on distance travelled, in metres) ----
  function speedAt(d) { d = d > 0 ? d : 0; return 27 + 39 * (1 - Math.exp(-d / 4000)); }
  function difficulty(d) { return clamp(d / 6500, 0, 1); }
  function rowInterval(d) { return lerp(1.35, 0.8, difficulty(d)); }   // seconds between hazard rows
  function gapWidth(d) { return lerp(0.74, 0.42, difficulty(d)); }     // wall gap width, world units

  // ---- Collision tests ----
  // Craft = circle of radius r at lateral position cx, sweeping along z from zA to zB during one step.
  // Box = [x0,x1] x [z0,z1]. Exact closest-point test for an axis-aligned sweep, so fast steps never tunnel.
  function sweptCircleBox(cx, r, zA, zB, x0, x1, z0, z1) {
    if (zB < zA) { var tz = zA; zA = zB; zB = tz; }
    var dx = cx < x0 ? x0 - cx : (cx > x1 ? cx - x1 : 0);
    var dz = zB < z0 ? z0 - zB : (zA > z1 ? zA - z1 : 0);
    return dx * dx + dz * dz < r * r;
  }

  // Sweeping craft circle vs a static circle (mine or pickup) at (ox, oz) with radius or.
  function sweptCircleCircle(cx, r, zA, zB, ox, oz, or) {
    if (zB < zA) { var tz = zA; zA = zB; zB = tz; }
    var dx = cx - ox;
    var dz = oz < zA ? zA - oz : (oz > zB ? oz - zB : 0);
    var rr = r + or;
    return dx * dx + dz * dz < rr * rr;
  }

  // Solid segments stored as pairs [x0,x1,...] in local space, shifted by offsetX. Returns hit index or -1.
  function segmentsHit(cx, r, zA, zB, offsetX, segs, nseg, z0, z1) {
    for (var i = 0; i < nseg; i++) {
      if (sweptCircleBox(cx, r, zA, zB, segs[i * 2] + offsetX, segs[i * 2 + 1] + offsetX, z0, z1)) return i;
    }
    return -1;
  }

  // A firing laser is a beam along z centred on lx with half width hw.
  function laserHits(cx, r, lx, hw) { return Math.abs(cx - lx) < r + hw; }

  // Build the solid parts of a wall spanning [-1,1] with one or two gaps (w2 = 0 means one gap).
  // Writes pairs into `out` (length >= 6) and returns the number of segments. Allocation free.
  function gapSegments(c1, w1, c2, w2, out) {
    var L = CORRIDOR, n = 0, cursor = -L;
    var a0 = c1 - w1 / 2, a1 = c1 + w1 / 2, b0 = 0, b1 = 0, two = w2 > 0;
    if (two) {
      b0 = c2 - w2 / 2; b1 = c2 + w2 / 2;
      if (b0 < a0) { var t0 = a0, t1 = a1; a0 = b0; a1 = b1; b0 = t0; b1 = t1; }
    }
    if (a0 > cursor + 1e-6) { out[n++] = cursor; out[n++] = Math.min(a0, L); }
    cursor = Math.max(cursor, a1);
    if (two) {
      if (b0 > cursor + 1e-6) { out[n++] = cursor; out[n++] = Math.min(b0, L); }
      cursor = Math.max(cursor, b1);
    }
    if (L > cursor + 1e-6) { out[n++] = cursor; out[n++] = L; }
    return n / 2;
  }

  // Widest free interval inside [-1,1] given solid segments (used by fairness tests).
  function widestGap(segs, nseg, offsetX) {
    offsetX = offsetX || 0;
    var best = 0, cursor = -CORRIDOR;
    for (var i = 0; i < nseg; i++) {
      var s0 = clamp(segs[i * 2] + offsetX, -CORRIDOR, CORRIDOR);
      var s1 = clamp(segs[i * 2 + 1] + offsetX, -CORRIDOR, CORRIDOR);
      if (s0 - cursor > best) best = s0 - cursor;
      if (s1 > cursor) cursor = s1;
    }
    if (CORRIDOR - cursor > best) best = CORRIDOR - cursor;
    return best;
  }

  // Unsorted solid intervals [a0,a1,b0,b1,...] in `buf` (n intervals): sorts them in place and
  // returns the widest free width left inside the corridor. Used to keep laser + hazard combos fair.
  function maxFreeWidth(buf, n) {
    for (var i = 1; i < n; i++) {
      var a = buf[i * 2], b = buf[i * 2 + 1], j = i - 1;
      while (j >= 0 && buf[j * 2] > a) { buf[(j + 1) * 2] = buf[j * 2]; buf[(j + 1) * 2 + 1] = buf[j * 2 + 1]; j--; }
      buf[(j + 1) * 2] = a; buf[(j + 1) * 2 + 1] = b;
    }
    return widestGap(buf, n, 0);
  }

  // Widest free stretch inside [a,b] given intervals already sorted by start (see maxFreeWidth).
  function freeWithin(buf, n, a, b) {
    var best = 0, cursor = a;
    for (var i = 0; i < n; i++) {
      var s0 = buf[i * 2], s1 = buf[i * 2 + 1];
      if (s1 <= a || s0 >= b) continue;
      if (s0 - cursor > best) best = s0 - cursor;
      if (s1 > cursor) cursor = s1;
    }
    if (b - cursor > best) best = b - cursor;
    return best > 0 ? best : 0;
  }

  // Small, fast seeded PRNG (mulberry32). Created once per run.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    CORRIDOR: CORRIDOR, CRAFT_R: CRAFT_R, CRAFT_XMAX: CRAFT_XMAX,
    clamp: clamp, lerp: lerp, approach: approach,
    speedAt: speedAt, difficulty: difficulty, rowInterval: rowInterval, gapWidth: gapWidth,
    sweptCircleBox: sweptCircleBox, sweptCircleCircle: sweptCircleCircle, segmentsHit: segmentsHit,
    laserHits: laserHits, gapSegments: gapSegments, widestGap: widestGap, maxFreeWidth: maxFreeWidth, freeWithin: freeWithin, rng: rng
  };
});
