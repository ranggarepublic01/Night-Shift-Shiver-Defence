// Store images: covers (with the title) and gameplay screenshots. node store_shots.js → store/*.png
const { chromium } = require('playwright');
const scene = async (p, map, wave, steps) => p.evaluate(([map, wave, steps]) => {
  __game.play(map, false); const s = __game.sim; s.state.candy = 99999;
  const L = __game.D.TOWER_ORDER.filter(t => s.allowed(t));
  for (let i = 0; i < s.map.slots.length; i++) if (i % 4 !== 3) { s.build(i, L[i % L.length]); for (let k = 0; k < i % 3; k++) s.upgrade(i); }
  s.state.wave = wave; s.startWave(); for (let i = 0; i < steps; i++) s.step(); s.state.candy = 640; s.state.lives = 17;
}, [map, wave, steps]);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const shoot = async (w, h, map, wave, steps, file, title, zoom) => {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.goto('file://' + __dirname + '/out.html?seed=5&fresh=1'); await p.waitForFunction(() => window.__nsdReady);
    await scene(p, map, wave, steps); if (zoom) await p.evaluate(z => __game.zoom(z), zoom); await p.waitForTimeout(4000);
    await p.addStyleTag({ content: '#toast{display:none!important}' + (title ? '#hud,#call,#fx,.pop{display:none!important}' : '') });
    if (title) await p.evaluate(() => { const d = document.createElement('div'); d.className = 'ttl'; d.style.cssText = 'position:fixed;left:0;right:0;top:4%;pointer-events:none';
      d.innerHTML = '<h1 class="haunt" style="animation:none;font-size:' + Math.round(Math.min(innerWidth, innerHeight * 1.6) * 0.11) + 'px">Night Defenders<span>Monster Tower Defense</span></h1>'; document.body.appendChild(d); });
    await p.waitForTimeout(800); await p.screenshot({ path: 'store/' + file }); await p.close();
  };
  await shoot(1280, 720, 'garden', 11, 30 * 22, 'cover_1280x720.png', true);
  await shoot(1024, 1024, 'patch', 9, 30 * 20, 'cover_1024x1024.png', true, 1.75);
  await shoot(1280, 720, 'garden', 7, 30 * 14, 'shot1_garden.png', false);
  await shoot(1280, 720, 'patch', 9, 30 * 18, 'shot2_patch.png', false);
  await shoot(1280, 720, 'roof', 8, 30 * 16, 'shot3_roof.png', false);
  await b.close();
})();
