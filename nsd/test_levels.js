const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/out.html?seed=3'); await p.waitForTimeout(1200);
  await p.evaluate(() => __game.play('garden', false));
  await p.evaluate(() => { const s = __game.sim; s.state.candy = 99999; const T=['rattle','wisp','frank','gourdon','vesper'];
    for (let i = 0; i < 15; i++) { s.build(i, T[i % 5]); const lv = Math.floor(i / 5); for (let k = 0; k < lv; k++) s.upgrade(i); } });
  await p.waitForTimeout(2500); await p.screenshot({ path: 'e1.png' });
  await p.evaluate(() => { const s = __game.sim; s.state.wave = 8; s.startWave(); for (let i = 0; i < 30 * 16; i++) s.step(); });
  await p.waitForTimeout(2000); await p.screenshot({ path: 'e2.png' });
  console.log(JSON.stringify(errs));
  await b.close();
})();
