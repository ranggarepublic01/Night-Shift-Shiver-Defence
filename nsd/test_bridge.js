// Runs the game with the real Playgama Bridge (from npm: npm pack @playgama/bridge) served in place of the CDN URL.
// BRIDGE=path/to/playgama-bridge.js node test_bridge.js
const { chromium } = require('playwright');
const BRIDGE = process.env.BRIDGE;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('https://bridge.playgama.com/**', r => r.fulfill({ path: BRIDGE, contentType: 'application/javascript' }));
  await p.goto('file://' + __dirname + '/out.html?seed=3'); await p.waitForFunction(() => window.__nsdReady, null, { timeout: 15000 });
  await p.click('#titlePlay', { force: true }); await p.waitForTimeout(600);
  await p.evaluate(() => { const s = __game.sim; s.state.candy = 99999; for (let i = 0; i < 15; i++) { s.build(i, ['rattle', 'wisp', 'vesper'][i % 3]); s.upgrade(i); s.upgrade(i); }
    s.startWave(); let k = 0; while (s.state.phase === 'running' && k++ < 30 * 1500) { if (s.canCallEarly() && s.state.next > 0) s.startWave(); s.step(); } });
  await p.waitForTimeout(3000);
  await p.click('#endMapsBtn'); await p.waitForTimeout(3000);
  const out = await p.evaluate(() => ({ log: PF.log, has: PF.hasBridge(), lb: PF.lbType(), save: __game.save, maps: !document.getElementById('mapCard').hidden, phase: __game.S.phase }));
  console.log(JSON.stringify(out), JSON.stringify(errs));
  await b.close();
})();
