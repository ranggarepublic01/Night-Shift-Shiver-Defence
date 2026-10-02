const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + __dirname + '/out.html?seed=3'); await p.waitForTimeout(1200);
  await p.evaluate(() => __game.play('garden', false)); await p.waitForTimeout(400);
  const tap = async i => { const pt = await p.evaluate(i => { const st = __game.stones[i].g.position; return __game.toScreen(st.x, 0.4, st.z); }, i); await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(400); };
  await tap(4); await p.screenshot({ path: 'f0.png' });
  await p.locator('#ring .opt').nth(2).click(); await p.waitForTimeout(400); await p.screenshot({ path: 'f1.png' });
  await p.locator('#ring .opt').nth(2).click(); await p.waitForTimeout(600);
  await tap(4); await p.screenshot({ path: 'f2.png' });
  console.log(JSON.stringify(errs), await p.evaluate(() => [__game.sim.build(6,'gourdon'), __game.sim.build(6,'frank')]));
  await b.close();
})();
