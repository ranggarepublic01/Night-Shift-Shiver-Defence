// Screenshots of the map card, each map with a few monsters, Endless, and the end cards. node test_maps.js
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/out.html?seed=3'); await p.waitForTimeout(1500);
  await p.screenshot({ path: 'm0_maps_new.png' });
  // a save with the garden won: patch and endless open
  await p.evaluate(() => { localStorage.setItem('nsd-save-1', JSON.stringify({ stars: { garden: 2, patch: 3 }, endless: 17 })); });
  await p.reload(); await p.waitForTimeout(1500); await p.screenshot({ path: 'm1_maps_some.png' });
  for (const id of ['patch', 'roof']) {
    await p.evaluate(id => __game.play(id, false), id); await p.waitForTimeout(1200);
    await p.screenshot({ path: 'm2_' + id + '_intro.png' });
    await p.evaluate(() => { const s = __game.sim; s.state.candy = 99999; const T = D => D.TOWER_ORDER.filter(t => s.allowed(t));
      const L = T(__game.D); for (let i = 0; i < s.map.slots.length; i += 2) { s.build(i, L[i % L.length]); for (let k = 0; k < (i % 3); k++) s.upgrade(i); }
      s.state.wave = 7; s.startWave(); for (let i = 0; i < 30 * 14; i++) s.step(); });
    await p.waitForTimeout(2500); await p.screenshot({ path: 'm3_' + id + '_play.png' });
  }
  await p.evaluate(() => __game.play(null, true)); await p.waitForTimeout(1500); await p.screenshot({ path: 'm4_endless.png' });
  await p.evaluate(() => { const s = __game.sim; s.startWave(); for (let i = 0; i < 30 * 30; i++) s.step(); s.state.lives = 1; s.state.enemies.forEach(e => e.s = 1e3); s.step(); });
  await p.waitForTimeout(2500); await p.screenshot({ path: 'm5_endless_end.png' });
  await p.evaluate(() => __game.play('patch', false)); await p.waitForTimeout(800);
  await p.evaluate(() => { const s = __game.sim; s.state.wave = s.state.waves - 1; s.startWave(); s.state.spawning.length = 0; s.state.enemies.length = 0; s.state.lives = 14; s.step(); });
  await p.waitForTimeout(2500); await p.screenshot({ path: 'm6_patch_won.png' });
  console.log(JSON.stringify(errs), JSON.stringify(await p.evaluate(() => __game.save)));
  await b.close();
})();
