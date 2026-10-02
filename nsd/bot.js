// Balance bots for Night Defenders: Monster Tower Defense. node bot.js [garden|patch|roof|endless] [runs]
const S = require('./sim.js');
const arg = process.argv[2] || 'garden', N = +(process.argv[3] || 40);
const endless = arg === 'endless';
// TWEAK='frank.air=0.35;frank.jumpR=2' tries a stat change without editing sim.js
for (const t of (process.env.TWEAK || '').split(';').filter(Boolean)) { const [k, v] = t.split('='), [a, b] = k.split('.'); S.TOWERS[a][b] = JSON.parse(v); console.log('tweak', a, b, v); }
const mapId = endless ? S.ENDLESS.map : arg;
const map = S.MAPS[mapId], path = S.makePath(map.path);
const air = S.makePath([map.path[0], map.path[map.path.length - 1]]);
const TOWERS = endless ? S.TOWER_ORDER : map.towers;

// slot checks: never on the path, and how much path each slot sees for each range
console.log(endless ? 'ENDLESS on ' + map.name : map.name, ' path length', path.L.toFixed(1), ' towers', TOWERS.join(','));
const cover = map.slots.map(([x, z], i) => {
  const d = path.dist(x, z);
  const c = (P, r) => { let n = 0; for (let s = 0; s < P.L; s += 0.25) { const p = P.at(s); if (Math.hypot(p.x - x, p.z - z) <= r) n += 0.25; } return n; };
  const memo = {}; return { i, d, c: r => memo[r] != null ? memo[r] : (memo[r] = c(path, r)), a: r => c(air, r) };
});
for (const s of cover) if (s.d < 1.3) console.log('SLOT TOO CLOSE', s.i, s.d.toFixed(2));
for (const [i, [x, z]] of map.slots.entries()) if (Math.abs(z) > 7.2 || x < -15.5 || x > 12.6) console.log('SLOT NEAR EDGE', i, x, z);
console.log('slot dist/cover@3.4/air@5:', cover.map(s => s.i + ':' + s.d.toFixed(1) + '/' + s.c(3.4).toFixed(0) + '/' + s.a(5).toFixed(0)).join(' '));
for (let a = 0; a < map.slots.length; a++) for (let b = a + 1; b < map.slots.length; b++) { const d = Math.hypot(map.slots[a][0] - map.slots[b][0], map.slots[a][1] - map.slots[b][1]); if (d < 2.2) console.log('slots close', a, b, d.toFixed(2)); }

function bestSlots(sim, type) {
  const r = S.TOWERS[type].range[0];
  return cover.filter(s => !sim.state.towers[s.i]).sort((a, b) => b.c(r) - a.c(r)).map(s => s.i);
}

function run(policy, seed, opts = {}) {
  const sim = S.create({ seed, map: mapId, endless });
  const st = sim.state; let tick = 0, sunFrac = null;
  sim.startWave();
  while (st.phase === 'running' && st.t < (endless ? 7200 : 1200)) {
    if (tick++ % 15 === 0) policy(sim);
    if (opts.early && sim.canCallEarly() && st.phase === 'running' && st.next > 0 && st.next < S.RULES.nextWait - opts.early) sim.startWave();
    const sun = st.enemies.find(e => e.boss); if (sun) sunFrac = sun.hp / sun.max;
    sim.step(); for (const e of sim.drain()) if (e.type === 'leak' && opts.tally) { const k = 'w' + String(e.wave || st.wave).padStart(2, '0') + ' ' + e.kind; opts.tally[k] = (opts.tally[k] || 0) + e.lives; }
  }
  return { phase: st.phase, lives: st.lives, wave: st.wave, cleared: st.cleared, stars: sim.stars(), t: st.t, by: st.stats.byTower, bonus: st.stats.bonus, sun: sunFrac };
}

const mono = type => sim => {
  const st = sim.state;
  for (let i = 0; i < st.towers.length; i++) if (st.towers[i] && sim.upgradeCost(i) != null && st.candy >= sim.upgradeCost(i) && st.towers.filter(Boolean).length >= 4) { sim.upgrade(i); return; }
  const s = bestSlots(sim, type)[0]; if (s != null) sim.build(s, type);
};

// sensible mixed plans per map ('U' = cheapest upgrade)
const PLANS = {
  garden: ['rattle', 'rattle', 'wisp', 'vesper', 'U', 'rattle', 'vesper', 'U', 'U', 'rattle', 'wisp', 'U', 'U', 'vesper', 'U', 'U', 'U', 'rattle', 'U', 'U', 'U', 'U', 'U', 'U', 'U'],
  patch: ['rattle', 'gourdon', 'wisp', 'U', 'vesper', 'gourdon', 'U', 'rattle', 'U', 'U', 'gourdon', 'vesper', 'U', 'U', 'wisp', 'U', 'U', 'rattle', 'U', 'U', 'U', 'U', 'U', 'U', 'U'],
  roof: ['rattle', 'vesper', 'frank', 'U', 'vesper', 'wisp', 'U', 'frank', 'U', 'U', 'vesper', 'U', 'U', 'gourdon', 'U', 'frank', 'U', 'U', 'U', 'U', 'U', 'U', 'U'],
  endless: ['rattle', 'gourdon', 'vesper', 'wisp', 'U', 'frank', 'vesper', 'U', 'U', 'gourdon', 'frank', 'U', 'U', 'vesper', 'U', 'U', 'U', 'frank', 'U', 'U', 'U', 'U', 'U', 'U', 'U'],
};
// the plan of the map before (no new monster), to see how much the new one helps
const OLD = { patch: PLANS.garden, roof: PLANS.patch };
const FILL = { garden: 'rattle', patch: 'gourdon', roof: 'frank', endless: 'frank' };
const planned = (plan, rand, fill) => {
  let k = 0;
  return sim => {
    const st = sim.state; if (k >= plan.length) {
      for (let i = 0; i < st.towers.length; i++) if (st.towers[i] && sim.upgradeCost(i) != null && st.candy >= sim.upgradeCost(i)) { sim.upgrade(i); return; }
      const free = bestSlots(sim, fill); if (free.length) sim.build(free[0], fill); return;
    }
    const a = plan[k];
    if (a === 'U') {
      let best = null; for (let i = 0; i < st.towers.length; i++) { const c = sim.upgradeCost(i); if (c != null && (best == null || c < sim.upgradeCost(best))) best = i; }
      if (best == null) { k++; return; }
      if (st.candy >= sim.upgradeCost(best)) { sim.upgrade(best); k++; }
    } else {
      const slots = bestSlots(sim, a); if (!slots.length) { k++; return; }
      const s = rand ? slots[Math.floor(rand() * Math.min(3, slots.length))] : slots[0];
      if (sim.build(s, a)) k++;
    }
  };
};
function rnd(seed) { let a = seed; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; }
const careless = seed => { const r = rnd(seed); return sim => { const st = sim.state; if (r() < 0.5) return;
  const free = st.towers.map((t, i) => t ? -1 : i).filter(i => i >= 0);
  if (free.length && r() < 0.6) { sim.build(free[Math.floor(r() * free.length)], TOWERS[Math.floor(r() * TOWERS.length)]); return; }
  const own = st.towers.map((t, i) => t ? i : -1).filter(i => i >= 0); if (own.length) sim.upgrade(own[Math.floor(r() * own.length)]); }; };

function summary(label, results) {
  const won = results.filter(r => r.phase === 'won');
  const st = [0, 0, 0, 0]; results.forEach(r => st[r.stars]++);
  const avgT = results.reduce((a, r) => a + r.t, 0) / results.length;
  const waves = results.map(r => r.wave);
  if (endless) { const c = results.map(r => r.cleared).sort((a, b) => a - b);
    console.log(label.padEnd(22), 'waves cleared min/median/max', c[0] + '/' + c[c.length >> 1] + '/' + c[c.length - 1], ' time', (avgT / 60).toFixed(1) + 'min'); return; }
  console.log(label.padEnd(22), 'win', String(won.length).padStart(3) + '/' + results.length, ' stars 0/1/2/3:', st.join('/'), ' lives avg', (results.reduce((a, r) => a + r.lives, 0) / results.length).toFixed(1), ' time', (avgT / 60).toFixed(1) + 'min', ' lost at wave', Math.min(...waves) + '-' + Math.max(...waves), ' sun left', (results.filter(r => r.sun != null).reduce((a, r) => a + r.sun, 0) / Math.max(1, results.filter(r => r.sun != null).length)).toFixed(2));
}
if (process.env.LEAKS) {   // LEAKS=1 node bot.js patch: which wave and enemy blow out candles under the mixed plan
  const tally = {}, res = Array.from({ length: 20 }, (_, i) => run(planned(PLANS[arg], null, FILL[arg]), i + 1, { tally }));
  console.log(Object.keys(tally).sort().map(k => k + ': ' + tally[k]).join('\n')); console.log('won', res.filter(r => r.phase === 'won').length + '/20'); process.exit(0);
}
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const PLAN = PLANS[arg];
summary('idle', many(5, i => run(() => {}, i + 1)));
for (const t of TOWERS) summary('only ' + t, many(N, i => run(mono(t), i + 1)));
summary('mixed plan', many(N, i => run(planned(PLAN, null, FILL[arg]), i + 1)));
summary('mixed, random slots', many(N, i => run(planned(PLAN, rnd(i + 7), FILL[arg]), i + 1)));
summary('mixed, calls early', many(N, i => run(planned(PLAN, null, FILL[arg]), i + 1, { early: 4 })));
if (OLD[arg]) summary('old towers only', many(N, i => run(planned(OLD[arg], null, 'rattle'), i + 1)));
summary('careless', many(N, i => run(careless(i + 3), i + 1)));
const r = run(planned(PLAN, null, FILL[arg]), 1); console.log('damage share (mixed):', Object.entries(r.by).map(([k, v]) => k + ' ' + Math.round(v)).join(', '));
