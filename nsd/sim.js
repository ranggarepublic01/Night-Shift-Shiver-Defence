// ============================================================================
// Night Shift: Shiver Defense — simulation. No DOM, no three.js, no Math.random:
// a seeded level that a bot can play hundreds of times in a second. The drawing
// reads sim.state and drains sim.events; it never changes the rules.
// ============================================================================
(function (root) {
'use strict';

// ---- the Garden Path: the garden gate (left) to the clinic window (right). World units, x right, z towards the camera.
const MAPS = {
  garden: {
    name: 'Garden Path',
    path: [[-15, -4.2], [-8.5, -4.2], [-8.5, 3.2], [-2.5, 3.2], [-2.5, -3.2], [3.5, -3.2], [3.5, 3.2], [9, 3.2], [9, -1.6], [13.6, -1.6]],
    slots: [
      [-11, -2.5], [-11, -6], [-7, -2], [-10, 3], [-5.5, 1.5], [-6.5, 5], [-3.5, 5], [-1, 1],
      [0.5, -1.5], [1, -5], [5, -1], [6, 1.5], [6, 5], [10.5, 0.5], [10.5, -3.5],
    ],
    start: 260,
    towers: ['rattle', 'wisp', 'vesper'],   // towers unlock one per map: Pumpkin Patch adds Gourdon, Rooftop adds Dr. Frankenstein
    waves: null,   // filled below
  },
  // three lanes back and forth through the patch: a stone between two lanes reaches both, so Gourdon's splash shines
  patch: {
    name: 'Pumpkin Patch',
    path: [[-15, -5], [7, -5], [7, -0.6], [-9, -0.6], [-9, 3.8], [9.6, 3.8], [9.6, 0.6], [13.6, 0.6]],
    slots: [
      [-11, -2.8], [-6, -2.8], [-2, -2.8], [2, -2.8], [5.2, -2.8], [-11.6, 1.6], [-5.5, 1.6], [-1.5, 1.6], [2.5, 1.6], [6, 1.6],
      [10, -2.6], [11.8, 2.6], [-3.5, -7], [-4, 5.9], [3.5, 5.9],
    ],
    start: 300, hpStep: 0.18,   // helpers toughen faster here than on the Garden Path (0.09)
    towers: ['rattle', 'wisp', 'gourdon', 'vesper'],
    waves: null,
  },
  // a plank walkway up and down the clinic roof; the birds and the Paper Pigeons cut straight across the middle
  roof: {
    name: 'Rooftop',
    path: [[-15, 3.2], [-10, 3.2], [-10, -4.6], [-3, -4.6], [-3, 4.6], [4, 4.6], [4, -4.6], [9.5, -4.6], [9.5, -0.8], [13.6, -0.8]],
    slots: [
      [-12.5, 0.5], [-12.5, -3], [-8, -1.6], [-5, 1.5], [-6.5, -6.8], [-5, -2], [-1, -2], [2, 2.2], [0.5, 6.6],
      [6.75, -1.5], [6.75, 2.5], [7, -6.8], [11.5, -3], [11.8, 1.6],
    ],
    start: 400,
    towers: ['rattle', 'wisp', 'frank', 'gourdon', 'vesper'],
    waves: null,
  },
};
const MAP_ORDER = ['garden', 'patch', 'roof'];

// ---- towers: the clinic staff and patients. Each has 3 levels (build = level 1, two upgrades). (proposal, tuned by bots)
// air: how much of the damage reaches an Early Bird (flying).
const TOWERS = {
  rattle:  { name: 'Rattle',  role: 'Bouncing bones',      cost: [70, 90, 140],  range: [3.4, 3.7, 4.0], rate: [0.75, 0.62, 0.5], dmg: [9, 15, 24],  air: 0.3, speed: 14 },
  wisp:    { name: 'Wisp',    role: 'Cold breath, slows',  cost: [80, 100, 150], range: [2.7, 3.0, 3.3], rate: [1.5, 1.35, 1.2],  dmg: [2, 4, 7],    air: 1,   slow: [0.35, 0.45, 0.55], slowT: 1.8 },
  frank:   { name: 'Dr. Frankenstein', role: 'Zap jumps to 3', cost: [120, 140, 200], range: [3.0, 3.3, 3.6], rate: [1.5, 1.35, 1.2], dmg: [16, 27, 42], air: 0.5, jumps: 3, jumpR: 1.8, fall: 0.7 },
  gourdon: { name: 'Gourdon', role: 'Pumpkin splash',      cost: [110, 130, 190], range: [3.8, 4.1, 4.4], rate: [2.5, 2.3, 2.1],  dmg: [28, 45, 70], air: 0,   splash: [1.3, 1.45, 1.6], flight: 1.0 },
  vesper:  { name: 'Vesper',  role: 'Bats, anti-air',      cost: [90, 110, 160], range: [4.6, 5.0, 5.4], rate: [1.1, 0.95, 0.8], dmg: [7, 12, 19], air: 3, speed: 9 },
};
const TOWER_ORDER = ['rattle', 'wisp', 'frank', 'gourdon', 'vesper'];
const UNLOCK = { gourdon: 'Pumpkin Patch', frank: 'Rooftop' };   // where each locked tower is first unlocked

// ---- enemies: the Dawn's helpers. hp at wave 1; every wave adds HP_STEP. lives: candles blown out on reaching the window.
const ENEMIES = {
  sunbeam: { name: 'Sunbeam',        hp: 30,   speed: 1.3,  candy: 8,   lives: 1 },
  rooster: { name: 'Rooster',        hp: 24,   speed: 1.9,  candy: 8,   lives: 1, burst: [1.1, 1.4, 3.3, 0.7] },   // slow speed, time, sprint speed, time
  clock:   { name: 'Alarm Clock',    hp: 150,  speed: 0.7,  candy: 20,  lives: 2, rage: 0.7 },   // the more it's hit, the faster it rings and runs
  jogger:  { name: 'Morning Jogger', hp: 75,   speed: 1.8,  candy: 13,   lives: 1 },
  bird:    { name: 'Early Bird',     hp: 38,   speed: 1.55, candy: 10,   lives: 1, fly: true },
  pigeon:  { name: 'Paper Pigeon',   hp: 70,   speed: 0.95, candy: 14,  lives: 2, fly: true, straight: true },   // carries the morning paper straight to the window, over everything
  sun:     { name: 'The Sun',        hp: 2400, speed: 0.32, candy: 200, lives: 20, boss: true, wake: 0.4, slowRes: 0.5 },   // wakes up: faster along the path
};
const HP_STEP = 0.09;

// ---- 12 waves on the Garden Path. Each group: [enemy, count, gap seconds, start delay]. (proposal, tuned by bots)
MAPS.garden.waves = [
  [['sunbeam', 8, 1.5, 0]],
  [['sunbeam', 10, 1.1, 0], ['rooster', 4, 1.6, 7]],
  [['rooster', 10, 0.9, 0], ['sunbeam', 6, 1.2, 5]],
  [['clock', 3, 4, 0], ['sunbeam', 10, 1.0, 2]],
  [['bird', 6, 1.5, 0], ['jogger', 4, 2, 6]],
  [['jogger', 8, 1.4, 0], ['clock', 3, 4, 5]],
  [['bird', 10, 1.0, 0], ['rooster', 10, 0.7, 4]],
  [['clock', 6, 2.6, 0], ['jogger', 6, 1.5, 6], ['sunbeam', 12, 0.6, 2]],
  [['bird', 14, 0.8, 0], ['jogger', 8, 1.4, 4], ['pigeon', 3, 3, 8]],
  [['rooster', 16, 0.5, 0], ['clock', 5, 3, 3], ['bird', 6, 1.0, 12]],
  [['jogger', 12, 0.9, 0], ['clock', 6, 2.2, 4], ['bird', 16, 0.7, 10], ['pigeon', 4, 2.5, 4]],
  [['sun', 1, 1, 6], ['sunbeam', 16, 0.8, 0], ['jogger', 8, 1.4, 10], ['bird', 12, 0.8, 18], ['pigeon', 3, 3, 12]],
];

// ---- 12 waves in the Pumpkin Patch: tight crowds for Gourdon's pumpkins. (proposal, tuned by bots)
MAPS.patch.waves = [
  [['sunbeam', 12, 0.8, 0]],
  [['rooster', 10, 0.7, 0], ['sunbeam', 8, 0.8, 6]],
  [['jogger', 6, 1.0, 0], ['sunbeam', 14, 0.6, 3]],
  [['clock', 4, 2.5, 0], ['rooster', 14, 0.5, 4]],
  [['bird', 8, 1.2, 0], ['jogger', 8, 0.9, 5]],
  [['sunbeam', 24, 0.4, 0], ['clock', 4, 2.5, 8]],
  [['jogger', 14, 0.6, 0], ['bird', 10, 0.9, 6], ['rooster', 12, 0.5, 10]],
  [['clock', 8, 1.8, 0], ['sunbeam', 20, 0.4, 3], ['pigeon', 2, 3, 8]],
  [['rooster', 24, 0.35, 0], ['jogger', 12, 0.7, 6], ['bird', 10, 0.8, 4]],
  [['clock', 10, 1.5, 0], ['jogger', 16, 0.5, 4], ['pigeon', 4, 2.5, 6]],
  [['sunbeam', 30, 0.3, 0], ['bird', 16, 0.6, 5], ['clock', 8, 1.6, 9], ['jogger', 12, 0.6, 12]],
  [['sun', 1, 1, 6], ['rooster', 20, 0.45, 0], ['jogger', 14, 0.7, 10], ['clock', 6, 2, 16], ['bird', 12, 0.7, 20]],
];

// ---- 12 waves on the Rooftop: a sky full of birds. (proposal, tuned by bots)
MAPS.roof.waves = [
  [['sunbeam', 10, 1.0, 0], ['bird', 3, 1.8, 5]],
  [['bird', 8, 1.0, 0], ['rooster', 10, 0.7, 5]],
  [['jogger', 8, 1.1, 0], ['bird', 8, 1.0, 4]],
  [['pigeon', 4, 2.5, 0], ['clock', 3, 3, 2], ['sunbeam', 12, 0.7, 6]],
  [['clock', 6, 2.2, 0], ['bird', 12, 0.8, 4]],
  [['jogger', 12, 0.9, 0], ['pigeon', 4, 2.4, 4]],
  [['bird', 16, 0.8, 0], ['rooster', 16, 0.6, 6], ['clock', 4, 2.5, 3]],
  [['clock', 10, 1.6, 0], ['pigeon', 7, 1.8, 3], ['jogger', 12, 0.9, 8]],
  [['bird', 20, 0.8, 0], ['pigeon', 8, 1.6, 6], ['jogger', 12, 0.8, 2]],
  [['jogger', 18, 0.7, 0], ['clock', 10, 1.5, 4], ['pigeon', 6, 2, 8], ['bird', 12, 0.9, 10]],
  [['pigeon', 12, 1.3, 0], ['bird', 20, 0.8, 4], ['rooster', 20, 0.5, 8], ['clock', 6, 2, 12]],
  [['sun', 1, 1, 6], ['bird', 18, 0.8, 0], ['pigeon', 10, 1.5, 10], ['jogger', 14, 0.8, 14], ['clock', 8, 1.8, 20]],
];

// ---- Endless on the Garden Path: waves forever. The same waves for everyone (seeded by the wave number), so the
// leaderboard is fair. All five monsters may be built. The Sun comes every 10th wave.
const ENDLESS = { map: 'garden', bossEvery: 10, hpGrow: 1.07, after: 12, sunHp: 0.5, sunLives: 10, budget: [12, 3.4] };   // the Sun comes early and often here, so it's lighter and costs half the candles
const ENDLESS_POOL = [['sunbeam', 1, 1, 0.9], ['rooster', 2, 1, 0.6], ['clock', 4, 4.5, 2.4], ['jogger', 5, 2.2, 1.1], ['bird', 5, 1.3, 0.9], ['pigeon', 9, 2.4, 2.4]];   // type, first wave, weight, gap
const endlessCache = [];
function endlessWave(n) {   // n counts from 1
  if (endlessCache[n]) return endlessCache[n];
  const r = rng(n * 7919 + 13);
  const pool = ENDLESS_POOL.filter(p => n >= p[1]);
  const boss = n % ENDLESS.bossEvery === 0;
  const k = Math.min(4, 1 + Math.ceil(n / 6) - (boss ? 1 : 0) + Math.floor(r() * 2));
  let budget = ENDLESS.budget[0] + ENDLESS.budget[1] * n;
  const groups = [];
  if (boss) groups.push(['sun', 1, 1, 6]);
  const tight = Math.max(0.55, 1 - n * 0.01);
  for (let i = 0; i < k; i++) {
    const p = pool[Math.floor(r() * pool.length)];
    const count = Math.max(2, Math.min(30, Math.round(budget / k / p[2])));
    groups.push([p[0], count, +(p[3] * tight).toFixed(2), i === 0 ? 0 : Math.round(2 + i * 3 + r() * 4)]);
  }
  return (endlessCache[n] = groups);
}

const RULES = { lives: 20, nextWait: 18, earlyBonus: 1.5, sellBack: 0.5 };
const DT = 1 / 30;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makePath(pts) {
  const segs = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1]; const len = Math.hypot(x1 - x0, z1 - z0); segs.push({ x0, z0, x1, z1, len, s0: L }); L += len; }
  function at(s) {
    s = Math.max(0, Math.min(L, s));
    let g = segs[segs.length - 1]; for (const q of segs) if (s <= q.s0 + q.len) { g = q; break; }
    const k = (s - g.s0) / g.len; return { x: g.x0 + (g.x1 - g.x0) * k, z: g.z0 + (g.z1 - g.z0) * k, dx: (g.x1 - g.x0) / g.len, dz: (g.z1 - g.z0) / g.len };
  }
  function dist(x, z) { let best = 1e9; for (const q of segs) { const vx = q.x1 - q.x0, vz = q.z1 - q.z0; let k = ((x - q.x0) * vx + (z - q.z0) * vz) / (q.len * q.len); k = Math.max(0, Math.min(1, k)); best = Math.min(best, Math.hypot(x - q.x0 - vx * k, z - q.z0 - vz * k)); } return best; }
  return { L, at, dist, segs };
}

// opts: { seed, map: 'garden' }
function create(opts = {}) {
  const endless = !!opts.endless;
  const map = MAPS[endless ? ENDLESS.map : opts.map || 'garden'];
  const towersAllowed = endless ? TOWER_ORDER : map.towers;
  const waveDef = n => (endless ? endlessWave(n + 1) : map.waves[n]);   // n counts from 0
  const hpMult = w => (map.hp || 1) * (1 + (map.hpStep || HP_STEP) * (w - 1)) * (endless && w > ENDLESS.after ? Math.pow(ENDLESS.hpGrow, w - ENDLESS.after) : 1);
  const path = makePath(map.path);
  const air = makePath([map.path[0], map.path[map.path.length - 1]]);   // the straight line some birds take
  const route = e => (e.straight ? air : path);
  const rand = rng(opts.seed || 1);
  const state = {
    t: 0, candy: map.start, lives: RULES.lives, wave: 0, waves: endless ? Infinity : map.waves.length, endless,
    cleared: 0,              // waves fully dealt with (every helper of the wave shooed or through): the Endless score
    phase: 'ready',          // ready (before wave 1) → running → won / lost
    next: 0,                 // seconds until the next wave starts on its own (0 when not counting)
    spawning: [],            // groups still sending enemies
    enemies: [], towers: map.slots.map(() => null), shots: [],
    stats: { leaked: 0, shooed: 0, earned: 0, spent: 0, bonus: 0, byTower: {} },
  };
  const events = [];
  let nid = 1;
  const emit = e => events.push(e);

  function startWave() {
    if (state.phase === 'won' || state.phase === 'lost' || state.wave >= state.waves) return false;
    if (state.phase === 'running' && state.next <= 0 && state.spawning.length) return false;   // still sending the current wave
    let bonus = 0;
    if (state.phase === 'running' && state.next > 0) { bonus = Math.round(state.next * RULES.earlyBonus); state.candy += bonus; state.stats.bonus += bonus; }
    const w = waveDef(state.wave);
    state.wave++; state.phase = 'running'; state.next = 0;
    for (const [type, count, gap, delay] of w) state.spawning.push({ type, left: count, gap, wait: delay, wave: state.wave });
    emit({ type: 'wave', wave: state.wave, bonus, boss: w.some(g => ENEMIES[g[0]].boss) });
    return true;
  }

  function spawn(type, wave) {
    const E = ENEMIES[type], hp = Math.round(E.hp * hpMult(wave) * (endless && E.boss ? ENDLESS.sunHp : 1));
    const e = { id: nid++, type, wave, hp, max: hp, s: 0, x: 0, z: 0, slow: 0, slowT: 0, phase: rand() * 2, off: (rand() - 0.5) * 0.6, fly: !!E.fly, straight: !!E.straight, boss: !!E.boss, alive: true, lives: endless && E.boss ? ENDLESS.sunLives : E.lives };
    const p = path.at(0); e.x = p.x; e.z = p.z;
    state.enemies.push(e); emit({ type: 'spawn', id: e.id, kind: type });
  }

  function speedOf(e) {
    const E = ENEMIES[e.type]; let v = E.speed;
    if (E.burst) { const cyc = E.burst[1] + E.burst[3]; v = ((state.t + e.phase * 3) % cyc) < E.burst[1] ? E.burst[0] : E.burst[2]; }
    if (E.rage) v *= 1 + E.rage * (1 - e.hp / e.max);
    if (E.wake) v *= 1 + E.wake * 2 * (e.s / path.L);
    if (e.slowT > 0) v *= 1 - e.slow * (E.slowRes || 1);
    return v;
  }

  function hurt(e, amount, tid, kind) {
    if (!e.alive) return;
    const T = state.towers[tid]; const tt = T ? T.type : kind;
    if (e.fly) amount *= TOWERS[tt].air;
    if (amount <= 0) return;
    e.hp -= amount;
    state.stats.byTower[tt] = (state.stats.byTower[tt] || 0) + Math.min(amount, e.hp + amount);
    if (e.hp <= 0) {
      e.alive = false; const c = ENEMIES[e.type].candy; state.candy += c; state.stats.earned += c; state.stats.shooed++;
      emit({ type: 'shoo', id: e.id, kind: e.type, x: e.x, z: e.z, candy: c, by: tt });
    }
  }

  function inRange(T, e, r) { return Math.hypot(e.x - T.x, e.z - T.z) <= r; }
  function target(T, r, groundOnly) {
    let best = null;
    for (const e of state.enemies) if (e.alive && !(groundOnly && e.fly) && inRange(T, e, r) && (!best || (e.prog || 0) > (best.prog || 0))) best = e;
    return best;
  }

  function towerStep(i, dt) {
    const T = state.towers[i]; if (!T) return;
    const D = TOWERS[T.type], L = T.level - 1, r = D.range[L];
    T.cd -= dt; if (T.cd > 0) return;
    if (T.type === 'wisp') {
      const hit = state.enemies.filter(e => e.alive && inRange(T, e, r)); if (!hit.length) return;
      for (const e of hit) { e.slow = Math.max(e.slowT > 0 ? e.slow : 0, D.slow[L]); e.slowT = D.slowT; hurt(e, D.dmg[L], i); }
      T.cd = D.rate[L]; emit({ type: 'breath', tower: i, r }); return;
    }
    const e = target(T, r, T.type === 'gourdon'); if (!e) return;
    T.cd = D.rate[L]; T.aim = Math.atan2(e.x - T.x, e.z - T.z);
    if (T.type === 'frank') {
      const chain = [e]; let cur = e, dmg = D.dmg[L];
      while (chain.length < D.jumps) {
        let nx = null, nd = D.jumpR;
        for (const o of state.enemies) if (o.alive && !chain.includes(o)) { const d = Math.hypot(o.x - cur.x, o.z - cur.z); if (d < nd) { nd = d; nx = o; } }
        if (!nx) break; chain.push(nx); cur = nx;
      }
      emit({ type: 'zap', tower: i, pts: chain.map(c => [c.x, c.z, c.fly ? 1 : 0]) });
      for (const c of chain) { hurt(c, dmg, i); dmg *= D.fall; }
      return;
    }
    if (T.type === 'gourdon') {
      // lob where the target will be when the pumpkin lands
      const ahead = route(e).at(e.s + speedOf(e) * D.flight);
      state.shots.push({ id: nid++, kind: 'pumpkin', tower: i, x0: T.x, z0: T.z, tx: ahead.x, tz: ahead.z, t: 0, dur: D.flight, dmg: D.dmg[L], splash: D.splash[L] });
      emit({ type: 'lob', tower: i }); return;
    }
    // rattle (bone) and vesper (bat): homing
    state.shots.push({ id: nid++, kind: T.type === 'rattle' ? 'bone' : 'bat', tower: i, x: T.x, z: T.z, target: e.id, dmg: D.dmg[L], speed: D.speed, t: 0 });
    emit({ type: T.type === 'rattle' ? 'throw' : 'bats', tower: i });
  }

  function shotStep(dt) {
    for (let k = state.shots.length - 1; k >= 0; k--) {
      const s = state.shots[k]; s.t += dt;
      if (s.kind === 'pumpkin') {
        if (s.t >= s.dur) {
          state.shots.splice(k, 1); emit({ type: 'burst', x: s.tx, z: s.tz, r: s.splash });
          for (const e of state.enemies) if (e.alive && !e.fly && Math.hypot(e.x - s.tx, e.z - s.tz) <= s.splash) hurt(e, s.dmg, s.tower, 'gourdon');
        }
        continue;
      }
      const e = state.enemies.find(q => q.id === s.target);
      if (!e || !e.alive) {   // its target is gone: a bat picks the next one in reach, a bone just drops
        const T = state.towers[s.tower];
        const n = s.kind === 'bat' && T ? target({ x: s.x, z: s.z }, 3) : null;
        if (n && s.t < 3) { s.target = n.id; continue; }
        state.shots.splice(k, 1); emit({ type: 'fizzle', id: s.id, x: s.x, z: s.z }); continue;
      }
      const dx = e.x - s.x, dz = e.z - s.z, d = Math.hypot(dx, dz), step = s.speed * dt;
      if (d <= step + 0.15) { state.shots.splice(k, 1); emit({ type: 'hit', kind: s.kind, id: e.id, x: e.x, z: e.z }); hurt(e, s.dmg, s.tower, s.kind === 'bone' ? 'rattle' : 'vesper'); }
      else { s.x += dx / d * step; s.z += dz / d * step; }
    }
  }

  function step(dt = DT) {
    if (state.phase !== 'running') return;
    state.t += dt;
    // spawning
    for (let g = state.spawning.length - 1; g >= 0; g--) {
      const G = state.spawning[g]; G.wait -= dt;
      while (G.wait <= 0 && G.left > 0) { spawn(G.type, G.wave); G.left--; G.wait += G.gap; }
      if (G.left <= 0) state.spawning.splice(g, 1);
    }
    if (!state.spawning.length && state.next <= 0 && state.wave < state.waves) { state.next = RULES.nextWait; emit({ type: 'nextReady', wave: state.wave + 1 }); }
    if (state.next > 0) { state.next -= dt; if (state.next <= 0) { state.next = 0; startWave(); } }
    // movement
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (e.slowT > 0) e.slowT -= dt;
      e.s += speedOf(e) * dt;
      const R = route(e); const p = R.at(e.s); e.x = p.x - p.dz * e.off; e.z = p.z + p.dx * e.off; e.dx = p.dx; e.dz = p.dz; e.prog = e.s / R.L;
      if (e.s >= R.L) {
        e.alive = false; const lost = e.lives; state.lives = Math.max(0, state.lives - lost); state.stats.leaked += lost;
        emit({ type: 'leak', id: e.id, kind: e.type, lives: lost, wave: e.wave });
      }
    }
    for (let i = 0; i < state.towers.length; i++) towerStep(i, dt);
    shotStep(dt);
    state.enemies = state.enemies.filter(e => e.alive);
    if (state.lives <= 0) { state.phase = 'lost'; emit({ type: 'lost', cleared: state.cleared }); return; }
    while (state.cleared < state.wave && !state.spawning.some(G => G.wave === state.cleared + 1) && !state.enemies.some(e => e.wave === state.cleared + 1)) { state.cleared++; emit({ type: 'cleared', wave: state.cleared }); }
    if (state.wave >= state.waves && !state.spawning.length && !state.enemies.length) {
      state.phase = 'won'; emit({ type: 'won', stars: stars() });
    }
  }

  function stars() { const l = state.lives; return l <= 0 ? 0 : l >= RULES.lives ? 3 : l >= 10 ? 2 : 1; }

  function build(slot, type) {
    if (state.phase === 'won' || state.phase === 'lost') return false;
    if (state.towers[slot] || !TOWERS[type] || !allowed(type)) return false;
    const c = TOWERS[type].cost[0]; if (state.candy < c) return false;
    const [x, z] = map.slots[slot];
    state.candy -= c; state.stats.spent += c;
    state.towers[slot] = { type, level: 1, spent: c, cd: 0.2, x, z, aim: 0 };
    emit({ type: 'build', slot, kind: type }); return true;
  }
  function allowed(type) { return towersAllowed.includes(type); }
  function upgradeCost(slot) { const T = state.towers[slot]; return T && T.level < 3 ? TOWERS[T.type].cost[T.level] : null; }
  function upgrade(slot) {
    const T = state.towers[slot], c = upgradeCost(slot); if (c == null || state.candy < c || state.phase === 'won' || state.phase === 'lost') return false;
    state.candy -= c; state.stats.spent += c; T.spent += c; T.level++;
    emit({ type: 'upgrade', slot, level: T.level }); return true;
  }
  function sellValue(slot) { const T = state.towers[slot]; return T ? Math.floor(T.spent * RULES.sellBack) : 0; }
  function sell(slot) {
    const T = state.towers[slot]; if (!T || state.phase === 'won' || state.phase === 'lost') return false;
    const v = sellValue(slot); state.candy += v; state.towers[slot] = null;
    emit({ type: 'sell', slot, candy: v, kind: T.type }); return true;
  }
  function canCallEarly() { return state.phase === 'ready' || (state.phase === 'running' && state.next > 0); }
  function earlyBonus() { return state.phase === 'running' && state.next > 0 ? Math.round(state.next * RULES.earlyBonus) : 0; }

  return { state, events, path, air, map, endless, waveDef, step, startWave, build, upgrade, upgradeCost, sell, sellValue, canCallEarly, earlyBonus, stars, allowed, drain: () => events.splice(0) };
}

const api = { create, MAPS, MAP_ORDER, ENDLESS, endlessWave, TOWERS, TOWER_ORDER, UNLOCK, ENEMIES, RULES, DT, HP_STEP, makePath };
if (typeof module !== 'undefined') module.exports = api; else root.DefenseSim = api;
})(typeof self !== 'undefined' ? self : this);
