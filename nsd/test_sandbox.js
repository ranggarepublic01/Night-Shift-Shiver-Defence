// Startup as Playgama's Sandbox sees it: the unzipped build served over http, the real Bridge (npm pack @playgama/bridge),
// platform forced to playgama_sandbox and playgama. Lists every console error and failed request, with a stack for any
// "PlaygamaBridge" error so an early Bridge call can be traced to our code.
// Serve the unzipped dist/night-defenders.zip on :8765, then: BRIDGE=path/to/playgama-bridge.js node test_sandbox.js
// (Here the platform's own wrap/v1.js can't download, so initialize never resolves; on Playgama it does.)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const pid of ['playgama_sandbox', 'playgama']) {
    const p = await b.newPage({ viewport: { width: 844, height: 390 } });
    const logs = [];
    await p.addInitScript(() => { const ce = console.error.bind(console); console.error = (...a) => { if (String(a[0]).includes('PlaygamaBridge')) ce('STACK ' + new Error().stack.split('\n').slice(2, 8).join(' | ')); ce(...a); }; });
    p.on('console', m => { if (m.type() === 'error') logs.push(m.text().slice(0, 400)); });
    p.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    p.on('requestfailed', r => logs.push('REQFAIL: ' + r.url().slice(0, 120) + ' ' + (r.failure() || {}).errorText));
    await p.route('https://bridge.playgama.com/**', r => r.fulfill({ path: process.env.BRIDGE, contentType: 'application/javascript' }));
    await p.goto('http://localhost:8765/index.html?platform_id=' + pid);
    await p.waitForTimeout(13000);
    console.log('== ' + pid + ' platform log ' + JSON.stringify(await p.evaluate(() => PF.log))); console.log(logs.join('\n'));
    await p.close();
  }
  await b.close();
})();
