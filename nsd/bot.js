// Balance bots for Night Shift: Shiver Defense. node bot.js
const S = require('./sim.js');
const map = S.MAPS.garden, path = S.makePath(map.path);

// slot checks: never on the path, and how much path each slot sees for each range
console.log('path length', path.L.toFixed(1));
const cover = map.slots.map(([x, z], i) => {
  const d = path.dist(x, z);
  const c = r => { let n = 0; for (let s = 0; s < path.L; s += 0.25) { const p = path.at(s); if (Math.hypot(p.x - x, p.z - z) <= r) n += 0.25; } return n; };
  const memo = {}; return { i, d, c: r => memo[r] != null ? memo[r] : (memo[r] = c(r)) };
});
for (const s of cover) if (s.d < 1.3) console.log('SLOT TOO CLOSE', s.i, s.d.toFixed(2));
console.log('slot dist/cover@3.4:', cover.map(s => s.i + ':' + s.d.toFixed(1) + '/' + s.c(3.4).toFixed(0)).join(' '));
for (let a = 0; a < map.slots.length; a++) for (let b = a + 1; b < map.slots.length; b++) { const d = Math.hypot(map.slots[a][0] - map.slots[b][0], map.slots[a][1] - map.slots[b][1]); if (d < 2.2) console.log('slots close', a, b, d.toFixed(2)); }

function bestSlots(sim, type) {
  const r = S.TOWERS[type].range[0];
  return cover.filter(s => !sim.state.towers[s.i]).sort((a, b) => b.c(r) - a.c(r)).map(s => s.i);
}

// plan: a list of wanted towers; the bot builds them in order and upgrades in between
function run(policy, seed, opts = {}) {
  const sim = S.create({ seed });
  const st = sim.state; let tick = 0, sunFrac = null;
  sim.startWave();
  while (st.phase === 'running' && st.t < 1200) {
    if (tick++ % 15 === 0) policy(sim);
    if (opts.early && sim.canCallEarly() && st.phase === 'running' && st.next > 0 && st.next < S.RULES.nextWait - opts.early) sim.startWave();
    const sun = st.enemies.find(e => e.boss); if (sun) sunFrac = sun.hp / sun.max;
    sim.step(); sim.drain();
  }
  return { phase: st.phase, lives: st.lives, wave: st.wave, stars: sim.stars(), t: st.t, by: st.stats.byTower, bonus: st.stats.bonus, sun: sunFrac };
}

const mono = type => sim => {
  const st = sim.state;
  // upgrade the oldest first, else build
  for (let i = 0; i < st.towers.length; i++) if (st.towers[i] && sim.upgradeCost(i) != null && st.candy >= sim.upgradeCost(i) && st.towers.filter(Boolean).length >= 4) { sim.upgrade(i); return; }
  const s = bestSlots(sim, type)[0]; if (s != null) sim.build(s, type);
};

// a sensible mixed plan
const MIX = ['rattle', 'rattle', 'wisp', 'vesper', 'U', 'rattle', 'vesper', 'U', 'U', 'rattle', 'wisp', 'U', 'U', 'vesper', 'U', 'U', 'U', 'rattle', 'U', 'U', 'U', 'U', 'U', 'U', 'U'];
const planned = (plan, rand) => {
  let k = 0;
  return sim => {
    const st = sim.state; if (k >= plan.length) { // keep upgrading
      for (let i = 0; i < st.towers.length; i++) if (st.towers[i] && sim.upgradeCost(i) != null && st.candy >= sim.upgradeCost(i)) { sim.upgrade(i); return; }
      const free = bestSlots(sim, 'rattle'); if (free.length) sim.build(free[0], 'rattle'); return;
    }
    const a = plan[k];
    if (a === 'U') {
      // cheapest upgrade
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
// a careless player: random towers in random slots, random upgrades
const careless = seed => { const r = rnd(seed); return sim => { const st = sim.state; if (r() < 0.5) return;
  const free = st.towers.map((t, i) => t ? -1 : i).filter(i => i >= 0);
  if (free.length && r() < 0.6) { sim.build(free[Math.floor(r() * free.length)], S.MAPS.garden.towers[Math.floor(r() * 3)]); return; }
  const own = st.towers.map((t, i) => t ? i : -1).filter(i => i >= 0); if (own.length) sim.upgrade(own[Math.floor(r() * own.length)]); }; };

function summary(label, results) {
  const won = results.filter(r => r.phase === 'won');
  const st = [0, 0, 0, 0]; results.forEach(r => st[r.stars]++);
  const avgT = results.reduce((a, r) => a + r.t, 0) / results.length;
  const waves = results.map(r => r.wave);
  console.log(label.padEnd(22), 'win', String(won.length).padStart(3) + '/' + results.length, ' stars 0/1/2/3:', st.join('/'), ' lives avg', (results.reduce((a, r) => a + r.lives, 0) / results.length).toFixed(1), ' time', (avgT / 60).toFixed(1) + 'min', ' lost at wave', Math.min(...waves) + '-' + Math.max(...waves), ' sun left', (results.filter(r=>r.sun!=null).reduce((a,r)=>a+r.sun,0)/Math.max(1,results.filter(r=>r.sun!=null).length)).toFixed(2));
}
const N = 40;
summary('idle', Array.from({ length: 5 }, (_, i) => run(() => {}, i + 1)));
for (const t of S.MAPS.garden.towers) summary('only ' + t, Array.from({ length: N }, (_, i) => run(mono(t), i + 1)));
summary('mixed plan', Array.from({ length: N }, (_, i) => run(planned(MIX), i + 1)));
summary('mixed, random slots', Array.from({ length: N }, (_, i) => run(planned(MIX, rnd(i + 7)), i + 1)));
summary('mixed, calls early', Array.from({ length: N }, (_, i) => run(planned(MIX), i + 1, { early: 4 })));
summary('careless', Array.from({ length: N }, (_, i) => run(careless(i + 3), i + 1)));
const r = run(planned(MIX), 1); console.log('damage share (mixed):', Object.entries(r.by).map(([k, v]) => k + ' ' + Math.round(v)).join(', '));
