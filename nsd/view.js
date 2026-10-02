// ============================================================================
// Night Shift: Shiver Defense — drawing and input. Reads sim.state, drains sim
// events, calls sim.build / upgrade / sell / startWave. Nothing here changes a rule.
// ============================================================================
(() => {
'use strict';
const TAU = Math.PI * 2;
const $ = id => document.getElementById(id);
const stage = $('stage'), fx = $('fx');
const QS = new URLSearchParams(location.search);
const D = DefenseSim, TW = D.TOWERS, EN = D.ENEMIES;
const newSeed = () => (Date.now() % 100000) + 1;
let game = { map: D.MAPS[QS.get('map')] ? QS.get('map') : 'garden', endless: QS.get('endless') === '1' };
let sim = D.create({ seed: +(QS.get('seed') || 0) || newSeed(), map: game.map, endless: game.endless });
let S = sim.state;

// ---------------------------------------------------------------- renderer (Shiver Night's look)
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
const NIGHT_BG = new THREE.Color('#1a1430'), DAWN_BG = new THREE.Color('#5a3a5a');
scene.background = NIGHT_BG.clone();
scene.fog = new THREE.Fog('#1a1430', 30, 60);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);

const mats = {};
function M(c, o) { const k = c + JSON.stringify(o || {}); if (!mats[k]) mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.85, metalness: 0 }, o || {})); return mats[k]; }
function mesh(geo, mat, x, y, z, parent) { const m = new THREE.Mesh(geo, typeof mat === 'string' ? M(mat) : mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; (parent || scene).add(m); return m; }
const texCache = {};
function glowTex(inner) {
  if (texCache[inner]) return texCache[inner];
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, inner); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); return (texCache[inner] = new THREE.CanvasTexture(c));
}
function glow(color, size, parent, x, y, z, op) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op == null ? 0.8 : op }));
  s.scale.setScalar(size); s.position.set(x || 0, y || 0, z || 0); (parent || scene).add(s); return s;
}

// lights
const hemi = new THREE.HemisphereLight('#a39ce0', '#2f3a3a', 0.85); scene.add(hemi);
const moonL = new THREE.DirectionalLight('#b8c4f5', 0.7); moonL.position.set(-8, 16, 9); moonL.castShadow = true;
moonL.shadow.mapSize.set(2048, 2048); Object.assign(moonL.shadow.camera, { left: -19, right: 19, top: 12, bottom: -12, far: 60 }); scene.add(moonL);
const dawnL = new THREE.PointLight('#ffb070', 0, 30, 1.6); dawnL.position.set(15, 4, -1.6); scene.add(dawnL);

// ---------------------------------------------------------------- the map: rebuilt whenever another map is chosen
// Everything below is built into `world`, which is thrown away and rebuilt for the next map.
let MAP, PATH, GATE, WIN, clinic, curtains, candles, airLine, stones, mapId = null;
const world = new THREE.Group(); scene.add(world);
let seedG = 7; const rg = () => { seedG = (seedG * 16807) % 2147483647; return seedG / 2147483647; };
// colours and props per map
const THEME = {
  garden: { ground: '#24302c', patches: ['#283830', '#202a28'], tufts: ['#3d5a44', '#4a6a4a'], path: '#6b5644', edge: '#4a3c34', step: '#8a7866', call: [0.8, 3.4] },
  patch:  { ground: '#29281c', patches: ['#33301f', '#24221a'], tufts: ['#4a5a2a', '#5a6a32'], path: '#7a6248', edge: '#4a3c2c', step: '#9a8466', call: [1.4, 2.4] },
  roof:   { ground: '#3a3352', patches: [], tufts: null, path: '#7a5a3a', edge: '#4a3424', step: null, planks: '#8a6a44', call: [0.8, 3.4] },   // call: where the Start wave button sits, from the gate
};
function free(x, z, r) { return PATH.dist(x, z) > r + 0.9 && MAP.slots.every(s => Math.hypot(s[0] - x, s[1] - z) > r + 1); }
function pumpkin(x, z, s, lit) { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  for (let i = 0; i < 7; i++) { const a = i * TAU / 7; mesh(new THREE.SphereGeometry(0.3, 7, 5), '#e8752a', Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22, g).scale.set(0.7, 1, 0.7); }
  mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.2, 5), '#5a6b2a', 0, 0.62, 0, g);
  if (lit) { for (const s2 of [-1, 1]) mesh(new THREE.ConeGeometry(0.07, 0.1, 3), M('#ffd166', { emissive: '#ffb03a', emissiveIntensity: 1 }), s2 * 0.12, 0.38, 0.4, g).rotation.x = Math.PI / 2; glow('rgba(255,170,60,.7)', 1.4, g, 0, 0.35, 0.3, 0.5); }
  return g; }
function grave(x, z, r) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; scene.add(g);
  mesh(new THREE.BoxGeometry(0.7, 0.85, 0.18), '#6a6484', 0, 0.42, 0, g); mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 10, 1, false, 0, Math.PI), '#6a6484', 0, 0.85, 0, g).rotation.set(Math.PI / 2, 0, Math.PI / 2);
  mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), '#4a4464', 0, 0.62, 0.1, g); return g; }
function tree(x, z, s) { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 6), '#3a2d2a', 0, 0.9, 0, g);
  for (const [a, h] of [[0.6, 1.3], [-0.7, 1.6], [2.2, 1.1]]) { const b = mesh(new THREE.CylinderGeometry(0.04, 0.08, 0.9, 4), '#3a2d2a', Math.cos(a) * 0.3, h, Math.sin(a) * 0.3); g.add(b); b.rotation.z = Math.cos(a) * 0.9; b.rotation.x = Math.sin(a) * 0.9; }
  return g; }
function lantern(x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 5), '#2a2140', 0, 0.8, 0, g); mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), M('#ffd166', { emissive: '#ffb03a', emissiveIntensity: 1 }), 0, 1.75, 0, g);
  glow('rgba(255,190,90,.8)', 1.8, g, 0, 1.75, 0, 0.6); }
// the Pumpkin Patch: a scarecrow in a nightcap, hay bales, curly vines
function scarecrow(x, z, r) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = r; scene.add(g);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.2, 5), '#5a4030', 0, 1.1, 0, g);
  const arms = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), '#5a4030', 0, 1.6, 0, g); arms.rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.6, 0.7, 0.3), '#6a4a7a', 0, 1.45, 0, g);
  mesh(new THREE.SphereGeometry(0.26, 8, 6), '#d8b46a', 0, 2.1, 0, g);
  const cap = mesh(new THREE.ConeGeometry(0.24, 0.6, 7), '#3f6aa0', 0.08, 2.45, 0, g); cap.rotation.z = -0.5;
  mesh(new THREE.SphereGeometry(0.07, 5, 4), '#f3ecdf', 0.32, 2.6, 0, g);
  for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.1, 0.3, 4), '#d8b46a', s * 0.85, 1.5, 0, g).rotation.z = s * Math.PI / 2; }
function hay(x, z, r) { const m = mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), '#c9a24a', x, 0.28, z); m.rotation.y = r; for (const s of [-0.25, 0.25]) { const b = mesh(new THREE.BoxGeometry(0.05, 0.57, 0.72), '#8a6a2a', s, 0, 0); m.add(b); } }
function vine(x, z, r) { const g = new THREE.Group(); g.position.set(x, 0.06, z); g.rotation.y = r; scene.add(g);
  for (let i = 0; i < 5; i++) { const t = mesh(new THREE.TorusGeometry(0.22, 0.03, 3, 8, Math.PI), '#4a6a2a', i * 0.38, 0, 0, g); t.rotation.x = -Math.PI / 2; t.rotation.z = i % 2 ? Math.PI : 0; t.castShadow = false; }
  mesh(new THREE.SphereGeometry(0.12, 5, 4), '#5a7a32', 0.6, 0.06, 0.2, g).scale.set(1.4, 0.4, 1); }
// the Rooftop: chimneys, an aerial, a weathervane, a skylight
function chimney(x, z, h) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  mesh(new THREE.BoxGeometry(0.9, h, 0.9), '#7a4a4a', 0, h / 2, 0, g); mesh(new THREE.BoxGeometry(1.1, 0.18, 1.1), '#5a3a3a', 0, h, 0, g);
  for (const s of [-0.2, 0.2]) mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.4, 7), '#9a6a5a', s, h + 0.28, 0, g);
  for (let i = 0; i < 3; i++) glow('rgba(200,190,230,.35)', 0.9 + i * 0.4, g, 0.1 * i, h + 0.8 + i * 0.6, -0.1 * i, 0.3 - i * 0.07); }
function aerial(x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 5), '#8a84a4', 0, 1.3, 0, g);
  for (let i = 0; i < 4; i++) { const b = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2 - i * 0.2, 4), '#8a84a4', 0, 1.8 + i * 0.22, 0, g); b.rotation.x = Math.PI / 2; } }
function vane(x, z) { const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.8, 5), '#2a2140', 0, 0.9, 0, g);
  const bird = new THREE.Group(); bird.position.y = 1.9; g.add(bird); bird.rotation.y = 0.7;
  mesh(new THREE.ConeGeometry(0.16, 0.6, 4), '#c98a4a', 0, 0, 0, bird).rotation.z = Math.PI / 2; mesh(new THREE.BoxGeometry(0.05, 0.3, 0.25), '#c98a4a', -0.28, 0.1, 0, bird); }
function skylight(x, z) { mesh(new THREE.BoxGeometry(1.5, 0.3, 1.1), '#2a2140', x, 0.15, z); mesh(new THREE.BoxGeometry(1.3, 0.05, 0.9), M('#ffcf7a', { emissive: '#ff9f3a', emissiveIntensity: 0.5 }), x, 0.31, z); glow('rgba(255,190,110,.6)', 2, scene, x, 0.6, z, 0.3); }

function buildWorld(id) {
  if (mapId === id) return;
  // throw the old map away
  for (const o of [...world.children]) { world.remove(o); o.traverse(q => { if (q.geometry && !q.isSprite) q.geometry.dispose(); }); }
  mapId = id; MAP = D.MAPS[id]; PATH = D.makePath(MAP.path); GATE = MAP.path[0]; WIN = MAP.path[MAP.path.length - 1];
  const TH = THEME[id]; seedG = 7;
  const before = new Set(scene.children);
  const ground = mesh(new THREE.PlaneGeometry(80, 50), M(TH.ground), 0, 0, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  // darker patches, seeded so the map looks the same every time
  if (TH.patches.length) for (let i = 0; i < 26; i++) { const p = mesh(new THREE.CircleGeometry(1 + rg() * 2.2, 9), M(rg() > 0.5 ? TH.patches[0] : TH.patches[1]), -17 + rg() * 32, 0.01, -8 + rg() * 16); p.rotation.x = -Math.PI / 2; p.castShadow = false; }
  if (id === 'patch') for (let z = -7.6; z < 8; z += 1.1) { if (Math.abs(z) < 0.01) continue; const f = mesh(new THREE.BoxGeometry(34, 0.02, 0.32), M('#211f16'), -1.5, 0.012, z); f.castShadow = false; }   // furrows
  if (id === 'roof') {   // roof tiles: rows of slightly lighter slates
    for (let z = -8; z < 8.5; z += 0.7) { const r = mesh(new THREE.BoxGeometry(34, 0.05, 0.08), M('#2c2742'), -1.5, 0.02, z); r.castShadow = false; }
    for (let i = 0; i < 40; i++) { const t = mesh(new THREE.BoxGeometry(0.62, 0.03, 0.6), M(rg() > 0.5 ? '#433b5c' : '#352f4c'), -16 + Math.floor(rg() * 46) * 0.66, 0.02, -8 + Math.floor(rg() * 23) * 0.7 + 0.35); t.castShadow = false; }
  }
  if (TH.tufts) { const tuft = new THREE.ConeGeometry(0.06, 0.32, 3); const spots = [];
    for (let i = 0; i < 220; i++) { const x = -17 + rg() * 31, z = -8.5 + rg() * 17; if (PATH.dist(x, z) < 1.1) continue; if (MAP.slots.some(s => Math.hypot(s[0] - x, s[1] - z) < 0.9)) continue; spots.push([x, z, (rg() - 0.5) * 0.5]); }
    for (const col of TH.tufts) { const im = new THREE.InstancedMesh(tuft, M(col), spots.length); const o = new THREE.Object3D(); let n = 0;
      spots.forEach((s, i) => { if ((i % 2 === 0) !== (col === TH.tufts[0])) return; o.position.set(s[0], 0.15, s[1]); o.rotation.set(0, 0, s[2]); o.updateMatrix(); im.setMatrixAt(n++, o.matrix); });
      im.count = n; scene.add(im); } }
  // the path: packed earth with stepping stones, or on the roof a plank walkway
  const PW = 1.5;
  for (const g of PATH.segs) {
    const mx = (g.x0 + g.x1) / 2, mz = (g.z0 + g.z1) / 2, a = Math.atan2(g.x1 - g.x0, g.z1 - g.z0);
    const seg = mesh(new THREE.BoxGeometry(PW, 0.06, g.len), M(TH.path), mx, 0.03, mz); seg.rotation.y = a; seg.castShadow = false;
    const edge = mesh(new THREE.BoxGeometry(PW + 0.25, 0.04, g.len + 0.25), M(TH.edge), mx, 0.015, mz); edge.rotation.y = a; edge.castShadow = false;
    if (TH.step) for (let s = 0.6; s < g.len; s += 1.1) { const k = s / g.len; const st = mesh(new THREE.CylinderGeometry(0.22 + rg() * 0.12, 0.26, 0.05, 6), M(TH.step), g.x0 + (g.x1 - g.x0) * k + (rg() - 0.5) * 0.7, 0.07, g.z0 + (g.z1 - g.z0) * k + (rg() - 0.5) * 0.7); st.castShadow = false; }
    if (TH.planks) for (let s = 0.25; s < g.len; s += 0.5) { const k = s / g.len; const pl = mesh(new THREE.BoxGeometry(PW - 0.1, 0.03, 0.06), M(TH.edge), g.x0 + (g.x1 - g.x0) * k, 0.07, g.z0 + (g.z1 - g.z0) * k); pl.rotation.y = a; pl.castShadow = false; }
  }
  for (const [x, z] of MAP.path.slice(1, -1)) { const c = mesh(new THREE.CylinderGeometry(PW / 2, PW / 2, 0.06, 12), M(TH.path), x, 0.031, z); c.castShadow = false; const c2 = mesh(new THREE.CylinderGeometry(PW / 2 + 0.125, PW / 2 + 0.125, 0.04, 12), M(TH.edge), x, 0.016, z); c2.castShadow = false; }

  // where the Dawn comes in: the garden gate, or on the roof a hatch with a ladder
  if (id !== 'roof') { const g = new THREE.Group(); g.position.set(GATE[0] + 1.2, 0, GATE[1]); scene.add(g);
    for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(0.45, 2.4, 0.45), '#5a5470', 0, 1.2, s * 1.15, g); mesh(new THREE.SphereGeometry(0.28, 7, 5), '#6a6484', 0, 2.55, s * 1.15, g); }
    const arch = mesh(new THREE.TorusGeometry(1.15, 0.07, 5, 14, Math.PI), '#2a2140', 0, 2.2, 0, g); arch.rotation.y = Math.PI / 2;
    for (let i = -3; i <= 3; i++) { if (Math.abs(i) < 1) continue; mesh(new THREE.BoxGeometry(0.06, 1.4, 0.06), '#2a2140', 0, 0.8, i * 0.32, g); }
    // fence along the back
    for (let x = -16; x < 13; x += 0.9) { if (Math.abs(x - GATE[0]) < 2 && Math.abs(GATE[1] + 8.2) < 3) continue; mesh(new THREE.BoxGeometry(0.12, 0.9 + (Math.round(x * 10) % 3) * 0.08, 0.12), '#3a3150', x, 0.45, -8.2); }
    mesh(new THREE.BoxGeometry(29, 0.08, 0.08), '#3a3150', -1.5, 0.75, -8.2);
  } else { const g = new THREE.Group(); g.position.set(GATE[0] + 0.9, 0, GATE[1]); scene.add(g);
    mesh(new THREE.BoxGeometry(1.6, 0.3, 1.6), '#2a2140', 0, 0.15, 0, g);
    const lid = mesh(new THREE.BoxGeometry(0.1, 1.5, 1.5), '#6a4a3a', -0.8, 0.85, 0, g); lid.rotation.z = 0.25;
    for (const s of [-0.4, 0.4]) mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), '#8a6a44', 0.2, 0.6, s, g);
    for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.06, 0.06, 0.8), '#8a6a44', 0.2, 0.4 + i * 0.4, 0, g);
    glow('rgba(255,200,120,.5)', 2, g, 0, 0.5, 0, 0.35);
    // a low wall along the back edge of the roof
    mesh(new THREE.BoxGeometry(30, 0.5, 0.4), '#4a3d68', -1.5, 0.25, -8.4); mesh(new THREE.BoxGeometry(30, 0.08, 0.6), '#2a2140', -1.5, 0.52, -8.4);
  }

  // the clinic (where the Dawn wants to go): a wall with the window at the end of the path
  clinic = new THREE.Group(); scene.add(clinic); curtains = []; candles = [];
  { const x0 = WIN[0] + 0.35;
    mesh(new THREE.BoxGeometry(5, 5.4, 15), '#4a3d68', x0 + 2.5, 2.7, -0.5, clinic);
    mesh(new THREE.BoxGeometry(5.6, 0.5, 15.6), '#2a2140', x0 + 2.5, 5.6, -0.5, clinic);
    for (let i = 0; i < 6; i++) { const r = mesh(new THREE.ConeGeometry(1.4, 1.6, 4), '#3a2d54', x0 + 2.5, 6.6, -6.5 + i * 2.4, clinic); r.rotation.y = Math.PI / 4; }
    // the window: warm inside, two curtains, candles on the sill
    mesh(new THREE.BoxGeometry(0.1, 2.2, 3.0), M('#ffcf7a', { emissive: '#ff9f3a', emissiveIntensity: 0.55 }), x0 - 0.02, 1.9, WIN[1], clinic);
    mesh(new THREE.BoxGeometry(0.2, 0.18, 3.4), '#2a2140', x0 - 0.08, 3.05, WIN[1], clinic);
    mesh(new THREE.BoxGeometry(0.6, 0.14, 3.4), '#5a4a3a', x0 - 0.25, 0.8, WIN[1], clinic);
    for (const s of [-1, 1]) { const c = mesh(new THREE.BoxGeometry(0.06, 2.1, 1.5), M('#7a2a5a', { roughness: 1 }), x0 - 0.1, 1.95, WIN[1] + s * 0.75, clinic); c.userData.s = s; curtains.push(c); }
    const wl = new THREE.PointLight('#ffb35a', 1.1, 9, 1.8); wl.position.set(x0 - 1.2, 1.8, WIN[1]); clinic.add(wl);
    glow('rgba(255,190,110,.8)', 4.5, clinic, x0 - 0.3, 1.9, WIN[1], 0.4);
    for (let i = 0; i < D.RULES.lives; i++) {
      const row = i % 2, k = Math.floor(i / 2);
      const g = new THREE.Group(); g.position.set(x0 - 0.15 - row * 0.28, 0.87, WIN[1] - 1.45 + k * 0.32); clinic.add(g);
      mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.24, 6), '#f3ecdf', 0, 0.12, 0, g);
      const f = mesh(new THREE.ConeGeometry(0.045, 0.12, 5), new THREE.MeshBasicMaterial({ color: '#ffd166' }), 0, 0.31, 0, g); f.castShadow = false;
      const gl = glow('rgba(255,200,100,.9)', 0.45, g, 0, 0.32, 0, 0.7);
      candles.push({ g, f, gl, out: false });
    }
    // the door, a lamp and a sign
    mesh(new THREE.BoxGeometry(0.12, 2.4, 1.3), '#6a3a3a', x0 - 0.04, 1.2, 3.6, clinic);
    mesh(new THREE.SphereGeometry(0.06, 5, 4), '#ffd166', x0 - 0.12, 1.2, 3.15, clinic);
    mesh(new THREE.BoxGeometry(0.1, 0.8, 2.4), '#2f7a64', x0 - 0.08, 3.7, 3.6, clinic);
    { const c = document.createElement('canvas'); c.width = 256; c.height = 86; const g = c.getContext('2d');
      const paint = () => { g.fillStyle = '#2f7a64'; g.fillRect(0, 0, 256, 86); g.fillStyle = '#f3ecdf'; g.font = '600 34px Fredoka, sans-serif'; g.textAlign = 'center'; g.fillText('NIGHT CLINIC', 128, 56); };
      paint(); const p = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.77), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })); p.position.set(x0 - 0.14, 3.7, 3.6); p.rotation.y = -Math.PI / 2; clinic.add(p);
      setTimeout(() => { paint(); p.material.map.needsUpdate = true; }, 800); }
  }

  // decorations, kept away from the path and the stones
  if (id === 'garden') {
    for (const [x, z, s] of [[-13, 1.5, 1.2], [-4.4, -5.6, 1], [7.7, 6.6, 1.3], [12.2, 4.6, 0.9], [-1.5, 6.8, 0.8], [2.2, -6.8, 1.1], [-13.6, -7.1, 0.9], [12.3, -6.5, 1]]) if (free(x, z, 0.4)) pumpkin(x, z, s);
    for (const [x, z, r] of [[-8.6, 6.8, 0.2], [-7.3, 7.1, -0.3], [-13.2, 6.2, 0.1], [7.6, -6.3, 0.3], [-4.6, -7.0, -0.2], [1.9, 2.9, 0.4]]) if (free(x, z, 0.4)) grave(x, z, r);
    for (const [x, z, s] of [[-15.5, 4.5, 1.4], [-3.5, -7.6, 1.2], [8.5, -7.3, 1.3], [0.4, 7.5, 1.1], [-15.6, -7.3, 1.2]]) tree(x, z, s);
    for (const [x, z] of [[-6.6, -4.2], [3.5, 5.1], [11.3, 3.2], [-0.6, -3.3]]) if (free(x, z, 0.2)) lantern(x, z);
  } else if (id === 'patch') {
    // pumpkins everywhere, a few of them carved and lit
    for (let i = 0; i < 90; i++) { const x = -16 + rg() * 28, z = -7.8 + rg() * 15.6, s = 0.55 + rg() * 0.6; if (free(x, z, 0.35 * s)) pumpkin(x, z, s, rg() < 0.12); }
    for (let i = 0; i < 26; i++) { const x = -16 + rg() * 28, z = -7.8 + rg() * 15.6; if (free(x, z, 0.5)) vine(x, z, rg() * TAU); }
    for (const [x, z, r] of [[-13, 6.4, 0.3], [0.4, -7.4, -0.2]]) if (free(x, z, 0.6)) scarecrow(x, z, r);
    for (const [x, z, r] of [[-14.6, -7.2, 0.2], [11.6, -6.6, -0.3], [11.4, 6.4, 0.5], [-0.2, 7.4, 0.1]]) if (free(x, z, 0.6)) hay(x, z, r);
    for (const [x, z, s] of [[-15.8, 4.5, 1.3], [12.3, -7.5, 1.1]]) tree(x, z, s);
    for (const [x, z] of [[-13, -2.8], [8.3, 1.6], [-7.4, 5.9], [8.5, -2.8]]) if (free(x, z, 0.2)) lantern(x, z);
  } else if (id === 'roof') {
    for (const [x, z, h] of [[-13.6, -6.6, 1.6], [2.2, -7.2, 2], [-1.4, 7.2, 1.4], [12, 4.6, 1.8], [-15.6, 6.4, 1.5]]) if (free(x, z, 0.6)) chimney(x, z, h);
    for (const [x, z] of [[9.2, 6.4]]) if (free(x, z, 0.3)) aerial(x, z);
    for (const [x, z] of [[-8, 6.6]]) if (free(x, z, 0.3)) vane(x, z);
    for (const [x, z] of [[-13.4, -2.7], [3.5, 7.4]]) if (free(x, z, 0.8)) skylight(x, z);
    for (const [x, z] of [[-8.1, -6.6], [-1.2, 0.2], [9.1, 2.6]]) if (free(x, z, 0.2)) lantern(x, z);
  }

  // the Paper Pigeons' straight line: dotted, only while one is coming or flying
  airLine = new THREE.Group(); scene.add(airLine); airLine.visible = false;
  { const A = MAP.path[0], B = MAP.path[MAP.path.length - 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]); const dm = new THREE.MeshBasicMaterial({ color: '#c8c0ff', transparent: true, opacity: 0.45, depthWrite: false });
    for (let s = 1.5; s < L - 0.5; s += 0.9) { const k = s / L; const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), dm); d.rotation.x = -Math.PI / 2; d.position.set(A[0] + (B[0] - A[0]) * k, 0.3, A[1] + (B[1] - A[1]) * k); airLine.add(d); } }

  // build stones
  stones = MAP.slots.map(([x, z], i) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    const base = mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.22, 10), '#6a6484', 0, 0.11, 0, g);
    const rim = mesh(new THREE.TorusGeometry(0.85, 0.08, 4, 20), '#8a84a4', 0, 0.23, 0, g); rim.rotation.x = Math.PI / 2;
    const plus = glow('rgba(159,231,208,.9)', 1.1, g, 0, 0.35, 0, 0.35);
    return { g, base, rim, plus, i, tower: null };
  });
  // everything just added to the scene belongs to this map
  for (const o of [...scene.children]) if (!before.has(o)) world.add(o);
  if (window.__game) window.__game.stones = stones;
}
// a rising sun behind the gate, very far away: it brightens as the night goes on
const horizon = glow('rgba(255,150,90,.8)', 14, scene, -22, 1, -14, 0.0);
const RIM = ['#8a84a4', '#c98a4a', '#cfd6e6', '#ffd166'];
buildWorld(game.endless ? D.ENDLESS.map : game.map);

// range ring (shown while choosing or looking at a tower)
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: '#9fe7d0', transparent: true, opacity: 0.8, depthWrite: false }));
rangeRing.rotation.x = -Math.PI / 2; rangeRing.visible = false; scene.add(rangeRing);
const rangeFill = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: '#9fe7d0', transparent: true, opacity: 0.1, depthWrite: false }));
rangeFill.rotation.x = -Math.PI / 2; rangeFill.visible = false; scene.add(rangeFill);
function showRange(x, z, r) { for (const m of [rangeRing, rangeFill]) { m.visible = true; m.position.set(x, 0.26, z); m.scale.setScalar(r); } }
function hideRange() { rangeRing.visible = rangeFill.visible = false; }

// ---------------------------------------------------------------- tower models (the Shiver Night cast)
const TOWER_ICON = { rattle: '💀', wisp: '👻', frank: '⚡', gourdon: '🎃', vesper: '🦇' };
const BUILD = {
  rattle(P) {
    const b = P.g, bone = '#efe6cf';
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 5), bone, 0, 1.35, 0, b);
    for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(0.33 - i * 0.05, 0.045, 4, 10, Math.PI * 1.4), bone, 0, 1.6 - i * 0.2, 0.02, b); r.rotation.x = Math.PI / 2; r.rotation.z = -Math.PI * 0.2 + Math.PI / 2; }
    mesh(new THREE.BoxGeometry(0.62, 0.16, 0.3), bone, 0, 0.82, 0, b);
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), bone, s * 0.2, 0.42, 0, b); mesh(new THREE.BoxGeometry(0.16, 0.08, 0.3), bone, s * 0.2, 0.05, 0.06, b); }
    const head = new THREE.Group(); head.position.y = 2.15; b.add(head);
    mesh(new THREE.SphereGeometry(0.33, 9, 7), bone, 0, 0, 0, head).scale.set(1, 1.05, 1.05);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.09, 6, 5), '#2a2140', s * 0.13, 0.02, 0.28, head);
    const jaw = mesh(new THREE.BoxGeometry(0.34, 0.1, 0.26), bone, 0, -0.3, 0.07, head);
    const la = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), bone, -0.42, 1.35, 0.1, b); la.rotation.z = 0.25;
    const arm = new THREE.Group(); arm.position.set(0.42, 1.75, 0.1); b.add(arm);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), bone, 0, -0.45, 0, arm); mesh(new THREE.SphereGeometry(0.09, 5, 4), bone, 0, -0.93, 0, arm);
    // level 2: a red bandana and a pouch of spare bones. Level 3: a golden crown, a royal cape, glowing eyes.
    { const g2 = lvG(P, 2, head); const band = mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.14, 12, 1, true), M('#d6403a', { side: THREE.DoubleSide }), 0, 0.14, 0, g2); band.rotation.x = -0.15;
      const knot = mesh(new THREE.ConeGeometry(0.1, 0.3, 4), '#d6403a', 0, 0.12, -0.38, g2); knot.rotation.x = -2.2;
      const g2b = lvG(P, 2, b); mesh(new THREE.BoxGeometry(0.26, 0.24, 0.16), '#7a5a3a', -0.33, 0.95, 0.12, g2b); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), '#efe6cf', -0.3, 1.12, 0.12, g2b).rotation.z = 0.5;
      const g3 = lvG(P, 3, head); const gold = M('#ffd166', { emissive: '#c08a1a', emissiveIntensity: 0.5, metalness: 0.3, roughness: 0.5 });
      mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.14, 10), gold, 0, 0.36, 0, g3);
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; mesh(new THREE.ConeGeometry(0.06, 0.16, 4), gold, Math.cos(a) * 0.23, 0.5, Math.sin(a) * 0.23, g3); }
      mesh(new THREE.SphereGeometry(0.05, 5, 4), M('#ff5a8a', { emissive: '#ff2a6a', emissiveIntensity: 0.8 }), 0, 0.37, 0.26, g3);
      for (const s of [-1, 1]) glow('rgba(120,255,220,.95)', 0.32, g3, s * 0.13, 0.02, 0.33, 0.9);
      const g3b = lvG(P, 3, b); const cape = mesh(new THREE.ConeGeometry(0.62, 1.5, 8, 1, true, Math.PI * 0.6, Math.PI * 0.8), M('#7a2a8a', { side: THREE.DoubleSide }), 0, 1.25, -0.02, g3b); cape.rotation.y = Math.PI;
      mesh(new THREE.TorusGeometry(0.32, 0.06, 4, 12), '#f3ecdf', 0, 1.92, 0, g3b).rotation.x = Math.PI / 2; }
    P.tick = (t, a) => { head.rotation.y = Math.sin(t * 0.7) * 0.2; jaw.position.y = -0.3 - Math.max(0, Math.sin(t * 5)) * 0.04 - a * 0.06;
      arm.rotation.x = -a * 2.6; arm.rotation.z = -0.2; };
  },
  wisp(P) {
    const pts = []; [[0, 2.35], [0.28, 2.3], [0.5, 2.12], [0.62, 1.8], [0.64, 1.3], [0.7, 0.8], [0.8, 0.5], [0.001, 0.5]].forEach(p => pts.push(new THREE.Vector2(p[0], p[1])));
    const geo = new THREE.LatheGeometry(pts, 14); const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < 0.55 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.5) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); pos.setY(i, y + Math.sin(a * 6) * 0.1); } }
    geo.computeVertexNormals();
    const body = new THREE.Group(); P.g.add(body);
    const skin = new THREE.MeshStandardMaterial({ color: '#eef4ff', emissive: '#9fb4e8', emissiveIntensity: 0.35, flatShading: true, transparent: true, opacity: 0.92, roughness: 0.6 });
    mesh(geo, skin, 0, 0, 0, body);
    for (const s of [-1, 1]) { mesh(new THREE.SphereGeometry(0.1, 6, 5), '#231a33', s * 0.2, 1.95, 0.52, body).scale.set(1, 1.5, 0.6); mesh(new THREE.SphereGeometry(0.16, 6, 5), skin, s * 0.68, 1.25, 0.1, body); }
    const mouth = mesh(new THREE.SphereGeometry(0.07, 6, 5), '#231a33', 0, 1.68, 0.58, body);
    glow('rgba(190,210,255,.8)', 3, body, 0, 1.5, 0, 0.3);
    // level 2: a knitted winter hat with a pompom. Level 3: an ice crown and snowflakes circling round.
    { const g2 = lvG(P, 2, body, true); mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, TAU, 0, Math.PI / 2), '#3a8ad8', 0, 2.12, 0, g2).scale.set(1, 0.9, 1);
      mesh(new THREE.TorusGeometry(0.42, 0.08, 5, 14), '#f3ecdf', 0, 2.12, 0, g2).rotation.x = Math.PI / 2; mesh(new THREE.SphereGeometry(0.13, 6, 5), '#f3ecdf', 0, 2.55, 0, g2);
      const g3 = lvG(P, 3, body); const ice = M('#bfefff', { emissive: '#6ac8ff', emissiveIntensity: 0.8, transparent: true, opacity: 0.9 });
      for (let i = 0; i < 7; i++) { const a = i * TAU / 7; const c = mesh(new THREE.ConeGeometry(0.07, 0.42 + (i % 2) * 0.18, 4), ice, Math.cos(a) * 0.3, 2.42, Math.sin(a) * 0.3, g3); c.rotation.z = -Math.cos(a) * 0.25; c.rotation.x = Math.sin(a) * 0.25; }
      const orb = new THREE.Group(); orb.position.y = 1.4; g3.add(orb); P.orb = orb;
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4; const f = new THREE.Group(); f.position.set(Math.cos(a) * 1.0, Math.sin(i * 2) * 0.2, Math.sin(a) * 1.0); orb.add(f);
        for (let k = 0; k < 3; k++) { const r = mesh(new THREE.BoxGeometry(0.28, 0.04, 0.04), ice, 0, 0, 0, f); r.rotation.z = k * Math.PI / 3; } glow('rgba(170,230,255,.9)', 0.5, f, 0, 0, 0, 0.7); }
      P.extra = t => { orb.rotation.y = t * 1.2; }; }
    P.tick = (t, a) => { body.position.y = 0.3 + Math.sin(t * 1.6) * 0.12; body.rotation.z = Math.sin(t * 1.1) * 0.05;
      const k = 1 + a * 0.15; body.scale.set(k, 1 + a * 0.08, k); mouth.scale.set(1 + a * 1.2, 1 + a * 1.6, 0.5); };
  },
  frank(P) {
    const g = P.g;
    mesh(new THREE.CylinderGeometry(0.42, 0.66, 1.75, 9), '#ece8f4', 0, 0.88, 0, g);
    mesh(new THREE.BoxGeometry(0.24, 0.24, 0.04), '#b98adf', 0.2, 1.05, 0.53, g);
    mesh(new THREE.BoxGeometry(0.2, 0.18, 0.04), '#ffd166', -0.24, 0.62, 0.6, g);
    mesh(new THREE.BoxGeometry(0.13, 0.42, 0.05), '#7a3a5a', 0, 1.5, 0.43, g);
    const head = new THREE.Group(); head.position.set(0, 2.08, 0); g.add(head);
    mesh(new THREE.SphereGeometry(0.37, 12, 10), '#f1d4bb', 0, 0, 0, head);
    for (const x of [-0.13, 0.13]) { mesh(new THREE.SphereGeometry(0.05, 8, 6), '#231a33', x, 0.03, 0.33, head); const lid = mesh(new THREE.BoxGeometry(0.13, 0.04, 0.05), '#e3bea2', x, 0.075, 0.34, head); lid.rotation.z = x > 0 ? -0.18 : 0.18; }
    mesh(new THREE.SphereGeometry(0.06, 8, 6), '#e9c1a4', 0, -0.03, 0.37, head);
    mesh(new THREE.BoxGeometry(0.14, 0.025, 0.03), '#6a3a3a', 0, -0.16, 0.33, head);
    const hair = M('#eef0f8');
    for (const [x, y, z, rz, rx] of [[0, 0.36, -0.05, 0, -0.2], [-0.24, 0.28, -0.05, 0.9, 0], [0.24, 0.28, -0.05, -0.9, 0], [-0.33, 0.08, -0.08, 1.5, 0], [0.33, 0.08, -0.08, -1.5, 0], [-0.14, 0.33, -0.2, 0.5, -0.6], [0.14, 0.33, -0.2, -0.5, -0.6], [0, 0.2, -0.33, 0, -1.3]]) { const c = mesh(new THREE.ConeGeometry(0.11, 0.34, 6), hair, x, y, z, head); c.rotation.set(rx, 0, rz); }
    mesh(new THREE.CylinderGeometry(0.375, 0.375, 0.06, 14, 1, true), '#3a2d54', 0, 0.19, 0, head);
    for (const x of [-0.12, 0.12]) { const r = mesh(new THREE.TorusGeometry(0.085, 0.028, 6, 12), '#d8a24a', x, 0.24, 0.3, head); r.rotation.x = -0.5; }
    const glove = M('#ffd166'), arms = [];
    for (const s of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(s * 0.5, 1.55, 0.05); g.add(arm); arms.push(arm);
      mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.72, 7), '#ece8f4', 0, -0.34, 0, arm); mesh(new THREE.SphereGeometry(0.13, 8, 6), glove, 0, -0.74, 0, arm); }
    // the zapper: a little brass coil with a glowing tip
    const tipMat = new THREE.MeshStandardMaterial({ color: '#9fe7d0', emissive: '#9fe7d0', emissiveIntensity: 0.3, flatShading: true });
    const coil = new THREE.Group(); coil.position.set(0, -0.86, 0.1); arms[1].add(coil);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 6), '#d8a24a', 0, 0, 0, coil); mesh(new THREE.SphereGeometry(0.11, 8, 6), tipMat, 0, -0.22, 0, coil);
    P.tip = coil;
    // level 2: a brass Tesla coil backpack. Level 3: twin coils crackling, goggles down and glowing.
    { const g2 = lvG(P, 2, g); const brass = M('#d8a24a', { metalness: 0.4, roughness: 0.5 });
      mesh(new THREE.BoxGeometry(0.56, 0.7, 0.3), '#5a4a6a', 0, 1.35, -0.55, g2);
      mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6), brass, 0, 1.95, -0.58, g2);
      for (let i = 0; i < 4; i++) mesh(new THREE.TorusGeometry(0.13, 0.03, 4, 10), brass, 0, 1.75 + i * 0.14, -0.58, g2).rotation.x = Math.PI / 2;
      const ball = mesh(new THREE.SphereGeometry(0.13, 8, 6), M('#9fe7d0', { emissive: '#4ae0c0', emissiveIntensity: 1 }), 0, 2.38, -0.58, g2); glow('rgba(150,255,230,.9)', 0.8, g2, 0, 2.38, -0.58, 0.6);
      const g3 = lvG(P, 3, g);
      for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.6, 6), brass, s * 0.36, 2.0, -0.5, g3); for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.11, 0.03, 4, 10), brass, s * 0.36, 1.85 + i * 0.14, -0.5, g3).rotation.x = Math.PI / 2;
        mesh(new THREE.SphereGeometry(0.11, 8, 6), M('#cffcff', { emissive: '#7af0ff', emissiveIntensity: 1.2 }), s * 0.36, 2.36, -0.5, g3); }
      const arcG = new THREE.BufferGeometry(); arcG.setAttribute('position', new THREE.Float32BufferAttribute(new Array(30).fill(0), 3));
      const arc = new THREE.Line(arcG, new THREE.LineBasicMaterial({ color: '#cffcff' })); g3.add(arc);
      const g3h = lvG(P, 3, head); for (const x of [-0.12, 0.12]) { mesh(new THREE.CircleGeometry(0.08, 10), M('#9fe7d0', { emissive: '#4ae0c0', emissiveIntensity: 1.4 }), x, 0.04, 0.36, g3h); }
      P.extra = t => { const p = arcG.attributes.position; for (let i = 0; i < 10; i++) { const k = i / 9; p.setXYZ(i, -0.36 + k * 0.72, 2.36 + Math.sin(k * Math.PI) * 0.18 + (i % 9 ? (Math.random() - 0.5) * 0.12 : 0), -0.5); } p.needsUpdate = true; arc.visible = Math.sin(t * 13) > -0.3; }; }
    P.tick = (t, a) => { head.rotation.z = Math.sin(t * 0.6) * 0.05; arms[1].rotation.x = -0.4 - a * 1.6; arms[0].rotation.x = -a * 0.8; arms[0].rotation.z = -a * 0.4;
      tipMat.emissiveIntensity = 0.3 + a * 2 + Math.max(0, Math.sin(t * 9)) * 0.2; };
  },
  gourdon(P) {
    const b = P.g;
    mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.1, 8), '#4f6b3a', 0, 1.25, 0, b);
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 6), '#5b4631', s * 0.22, 0.38, 0, b); mesh(new THREE.BoxGeometry(0.24, 0.14, 0.38), '#3b2a1d', s * 0.22, 0.07, 0.08, b); }
    const scarf = new THREE.Group(); scarf.position.y = 1.85; b.add(scarf);
    for (let i = 0; i < 6; i++) { const r = mesh(new THREE.TorusGeometry(0.4, 0.09, 5, 10, TAU / 6), i % 2 ? '#f3ecdf' : '#c0392b', 0, 0, 0, scarf); r.rotation.x = Math.PI / 2; r.rotation.z = i * TAU / 6; }
    const head = new THREE.Group(); head.position.y = 2.45; b.add(head);
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; mesh(new THREE.SphereGeometry(0.34, 8, 6), '#ee7d24', Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3, head).scale.set(0.75, 1, 0.75); }
    mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.3, 5), '#5a6b2a', 0, 0.45, 0, head).rotation.z = 0.3;
    const face = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb03a', emissiveIntensity: 1.2, flatShading: true });
    const tri = new THREE.Shape(); tri.moveTo(-0.1, -0.07); tri.lineTo(0.1, -0.07); tri.lineTo(0, 0.09); tri.lineTo(-0.1, -0.07);
    for (const s of [-1, 1]) mesh(new THREE.ShapeGeometry(tri), face, s * 0.17, 0.08, 0.58, head);
    const mouth = new THREE.Shape(); mouth.moveTo(-0.22, 0); mouth.quadraticCurveTo(0, -0.18, 0.22, 0); mouth.quadraticCurveTo(0, -0.08, -0.22, 0);
    mesh(new THREE.ShapeGeometry(mouth), face, 0, -0.14, 0.59, head);
    glow('rgba(255,170,60,.9)', 2.2, head, 0, 0, 0.3, 0.45);
    // the pumpkin he's about to lob, held over his head
    const ammo = new THREE.Group(); b.add(ammo); ammo.position.set(0, 3.2, 0);
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; mesh(new THREE.SphereGeometry(0.16, 6, 5), '#ff9a3a', Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, ammo).scale.set(0.7, 1, 0.7); }
    // level 2: a straw farmer's hat and a little pumpkin pile at his feet. Level 3: a carved lantern crown and fireflies.
    { const g2 = lvG(P, 2, head, true); mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.05, 14), '#d8b45a', 0, 0.42, 0, g2); mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 12), '#d8b45a', 0, 0.58, 0, g2);
      mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.08, 12), '#c0392b', 0, 0.48, 0, g2);
      const g2b = lvG(P, 2, b); for (const [x, z, s] of [[0.55, 0.35, 0.8], [0.72, 0.05, 0.6], [0.5, 0.0, 0.55]]) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5; mesh(new THREE.SphereGeometry(0.13 * s, 6, 4), '#ee7d24', x + Math.cos(a) * 0.09 * s, 0.12 * s, z + Math.sin(a) * 0.09 * s, g2b).scale.set(0.7, 1, 0.7); } }
      const g3 = lvG(P, 3, head); const lit = M('#ffd166', { emissive: '#ffa020', emissiveIntensity: 1.4 });
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6; mesh(new THREE.ConeGeometry(0.09, 0.32, 4), '#ee7d24', Math.cos(a) * 0.28, 0.5, Math.sin(a) * 0.28, g3); mesh(new THREE.SphereGeometry(0.05, 5, 4), lit, Math.cos(a) * 0.28, 0.7, Math.sin(a) * 0.28, g3); }
      glow('rgba(255,180,60,.9)', 1.6, g3, 0, 0.6, 0, 0.5);
      const flies = new THREE.Group(); flies.position.y = 1.6; lvG(P, 3, b).add(flies);
      for (let i = 0; i < 5; i++) glow('rgba(255,240,120,.95)', 0.28, flies, Math.cos(i * 1.3) * 0.9, Math.sin(i * 2.1) * 0.5, Math.sin(i * 1.3) * 0.9, 0.9);
      P.extra = t => { flies.rotation.y = t * 0.7; flies.children.forEach((f, i) => { f.position.y = Math.sin(t * 2 + i) * 0.4; }); }; }
    P.tick = (t, a, cd) => { head.rotation.x = -a * 0.5 + Math.sin(t * 1.3) * 0.03; head.position.y = 2.45 - a * 0.1;
      face.emissiveIntensity = 1.1 + Math.sin(t * 13) * 0.1 + Math.sin(t * 7.3) * 0.1; ammo.visible = a < 0.1; };
  },
  vesper(P) {
    const b = P.g;
    mesh(new THREE.ConeGeometry(0.85, 2.1, 8, 1, true), M('#3a1f3f', { side: THREE.DoubleSide }), 0, 1.05, -0.05, b);
    mesh(new THREE.ConeGeometry(0.78, 2.0, 8, 1, true), M('#a0263d', { side: THREE.DoubleSide }), 0, 1.02, -0.02, b).scale.set(0.97, 1, 0.9);
    mesh(new THREE.CylinderGeometry(0.34, 0.46, 1.2, 7), '#2a2140', 0, 1.35, 0.05, b);
    mesh(new THREE.BoxGeometry(0.2, 0.5, 0.05), '#f3ecdf', 0, 1.7, 0.36, b);
    const head = new THREE.Group(); head.position.y = 2.35; b.add(head);
    mesh(new THREE.SphereGeometry(0.4, 9, 7), M('#e4e1f2', { emissive: '#5a5470', emissiveIntensity: 0.35 }), 0, 0, 0, head).scale.set(0.95, 1.12, 0.95);
    mesh(new THREE.SphereGeometry(0.42, 9, 5, 0, TAU, 0, Math.PI / 2.1), '#231a33', 0, 0.06, -0.02, head).scale.set(1, 1.05, 1.02);
    mesh(new THREE.ConeGeometry(0.12, 0.26, 4), '#231a33', 0, 0.3, 0.33, head).rotation.x = Math.PI;
    for (const s of [-1, 1]) { mesh(new THREE.SphereGeometry(0.05, 5, 4), '#2a2140', s * 0.14, 0.08, 0.36, head); mesh(new THREE.CircleGeometry(0.09, 10), M('#e8a0b8'), s * 0.2, -0.08, 0.37, head).rotation.y = s * 0.45; }
    mesh(new THREE.ConeGeometry(0.03, 0.09, 3), '#fffaf0', 0.07, -0.25, 0.33, head).rotation.x = Math.PI;
    const cols = [];
    for (const s of [-1, 1]) { const col = mesh(new THREE.BoxGeometry(0.45, 0.7, 0.04), '#a0263d', s * 0.35, 2.3, -0.2, b); col.rotation.z = -s * 0.35; col.rotation.y = s * 0.4; cols.push(col); }
    const arm = new THREE.Group(); arm.position.set(0.45, 1.85, 0.1); b.add(arm);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 5), '#2a2140', 0, -0.3, 0, arm);
    // level 2: a tall top hat. Level 3: a gold medallion and a flock of bats circling him.
    { const g2 = lvG(P, 2, head); mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 12), '#1a1430', 0, 0.42, 0, g2); mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.55, 12), '#1a1430', 0, 0.7, 0, g2);
      mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.08, 12), '#a0263d', 0, 0.5, 0, g2);
      const g3 = lvG(P, 3, b); const gold = M('#ffd166', { emissive: '#c08a1a', emissiveIntensity: 0.6, metalness: 0.3 });
      mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 10), gold, 0, 1.78, 0.4, g3).rotation.x = Math.PI / 2; mesh(new THREE.SphereGeometry(0.05, 5, 4), M('#ff3a5a', { emissive: '#ff1a3a', emissiveIntensity: 0.8 }), 0, 1.78, 0.44, g3);
      const flock = new THREE.Group(); flock.position.y = 2.6; g3.add(flock);
      const wings = [];
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5; const bt = new THREE.Group(); bt.position.set(Math.cos(a) * 1.0, Math.sin(i) * 0.2, Math.sin(a) * 1.0); bt.rotation.y = -a; flock.add(bt);
        mesh(new THREE.SphereGeometry(0.08, 5, 4), '#231a33', 0, 0, 0, bt); for (const k of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(0.04, 0.02, 0.22), '#3a2d54', 0, 0, k * 0.12, bt); wings.push(w); } }
      P.extra = t => { flock.rotation.y = t * 1.5; wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 22 + i) * 0.8; }); }; }
    P.tick = (t, a) => { head.rotation.z = Math.sin(t * 0.8) * 0.06; arm.rotation.x = -0.2 - a * 2.2; arm.rotation.z = 0.15 + a * 0.6;
      cols.forEach((c, i) => { c.rotation.z = (i ? -1 : 1) * (0.35 + a * 0.4); }); };
  },
};
// level accessories: groups shown from a given level up
function lvG(P, n, parent, only) { const g = new THREE.Group(); parent.add(g); (P.lv = P.lv || []).push({ n, g, only }); g.visible = false; return g; }
function makeTower(slot, type) {
  const st = stones[slot]; if (st.tower) scene.remove(st.tower.root);
  const root = new THREE.Group(); root.position.set(st.g.position.x, 0.22, st.g.position.z); scene.add(root);
  const g = new THREE.Group(); root.add(g);
  const P = { root, g, type, a: 0, aim: 0, aimNow: 0 };
  BUILD[type](P);
  st.tower = P; st.plus.visible = false; setLevel(slot, 1);
  P.pop = 0.001; return P;
}
function setLevel(slot, lvl) {
  const st = stones[slot]; st.rim.material = M(RIM[lvl]);
  if (st.tower) { st.tower.lvl = lvl; for (const L of st.tower.lv || []) L.g.visible = L.only ? lvl === L.n : lvl >= L.n; st.tower.base = [0, 0.74, 0.82, 0.9][lvl];
    if (st.tower.pips) st.tower.root.remove(st.tower.pips);
    const pips = new THREE.Group(); st.tower.root.add(pips); st.tower.pips = pips;
    for (let i = 0; i < lvl; i++) { const s = glow('rgba(255,209,102,.95)', 0.38, pips, (i - (lvl - 1) / 2) * 0.32, 0.12, 0.98, 0.95); s.material.depthTest = false; } }
}
function removeTower(slot) { const st = stones[slot]; if (st.tower) { sparkle(st.g.position.x, 1, st.g.position.z, 'rgba(255,209,102,.9)', 14); scene.remove(st.tower.root); } st.tower = null; st.plus.visible = true; st.rim.material = M(RIM[0]); }

// ---------------------------------------------------------------- the Dawn's helpers
const ENEMY_ICON = { sunbeam: '🌤️', rooster: '🐓', clock: '⏰', jogger: '🏃', bird: '🐦', pigeon: '🕊️', sun: '🌞' };
const ENEMY_TIP = {
  sunbeam: 'A little light sprite humming a morning song.',
  rooster: 'Fast! Sprints in bursts. Crows all the time.',
  clock: 'Tough. Rings louder and runs faster the more you hit it.',
  jogger: 'Fast and fit. Waves at your monsters.',
  bird: 'Flies! Pumpkins can’t reach it. Vesper’s bats and Wisp’s breath work best.',
  pigeon: 'Flies straight over the garden to the window with the morning paper! Put Vesper where it crosses.',
  sun: 'The Sun itself, in sunglasses. If it reaches the window, the night is over!',
};
const ENEMY_GAG = { sunbeam: ['♪ la la la ♪', '♪ good morning ♪', 'hmm-hmm ♪'], rooster: ['cock-a-doodle!', 'BAWK!', 'doo!'], clock: ['RIIING!', 'tick tock', 'BRRRING!'], jogger: ['*waves*', 'morning!', 'lovely day!'], bird: ['tweet!', 'cheep cheep', 'worm?'], pigeon: ['extra! extra!', 'coo! paper!', 'special delivery!'], sun: ['yaaawn', 'rise and shine', 'five more minutes'] };
const MAKE = {
  sunbeam(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    mesh(new THREE.SphereGeometry(0.34, 10, 8), M('#ffe066', { emissive: '#ffb02a', emissiveIntensity: 0.9 }), 0, 0, 0, b);
    const rays = new THREE.Group(); b.add(rays); V.rays = rays;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; const c = mesh(new THREE.ConeGeometry(0.08, 0.28, 4), M('#ffd166', { emissive: '#ffb02a', emissiveIntensity: 0.8 }), Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0, rays); c.rotation.z = a - Math.PI / 2; }
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.05, 5, 4), '#5a3a1a', s * 0.12, 0.06, 0.3, b);
    const sm = mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 8, Math.PI), '#5a3a1a', 0, -0.06, 0.31, b); sm.rotation.z = Math.PI;
    glow('rgba(255,220,120,.9)', 1.6, b, 0, 0, 0, 0.5);
    V.y = 0.75; V.tick = (t, dt) => { b.position.y = Math.sin(t * 3 + V.ph) * 0.12; rays.rotation.z += dt * 1.5; };
  },
  rooster(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    mesh(new THREE.SphereGeometry(0.34, 9, 7), '#f6f0e4', 0, 0.62, 0, b).scale.set(0.9, 0.9, 1.15);
    for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(0.08, 0.5, 4), ['#2a6a4a', '#1a3a5a', '#7a2a2a'][i], (i - 1) * 0.1, 0.9, -0.36, b); c.rotation.x = -0.7; }
    const head = new THREE.Group(); head.position.set(0, 1.02, 0.26); b.add(head); V.head = head;
    mesh(new THREE.SphereGeometry(0.17, 8, 6), '#f6f0e4', 0, 0, 0, head);
    for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(0.06, 5, 4), '#e23a3a', 0, 0.17 + (i === 1 ? 0.04 : 0), -0.06 + i * 0.07, head);
    mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#ffb03a', 0, -0.02, 0.2, head).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.04, 5, 4), '#e23a3a', 0, -0.1, 0.12, head);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 4, 4), '#231a33', s * 0.09, 0.04, 0.13, head);
    const legs = [];
    for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(s * 0.12, 0.38, 0); b.add(l); legs.push(l); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.38, 4), '#ffb03a', 0, -0.19, 0, l); mesh(new THREE.BoxGeometry(0.12, 0.03, 0.14), '#ffb03a', 0, -0.37, 0.04, l); }
    V.y = 0; V.tick = (t, dt, sp) => { const f = 6 + sp * 5; legs[0].rotation.x = Math.sin(t * f) * 0.7; legs[1].rotation.x = -Math.sin(t * f) * 0.7; b.rotation.x = sp > 2 ? 0.35 : 0.05; head.rotation.x = Math.sin(t * f * 0.5) * 0.15; };
  },
  clock(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    const face = new THREE.Group(); face.position.y = 0.95; b.add(face); V.face = face;
    const cyl = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), '#d6403a', 0, 0, 0, face); cyl.rotation.x = Math.PI / 2;
    mesh(new THREE.CircleGeometry(0.42, 14), M('#fff6e4'), 0, 0, 0.16, face);
    const h1 = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), '#231a33', 0, 0.1, 0.17, face); h1.geometry.translate(0, 0.05, 0); h1.position.y = 0;
    const h2 = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.02), '#231a33', 0, 0, 0.18, face); h2.geometry.translate(0, 0.08, 0);
    for (const s of [-1, 1]) { const bell = mesh(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, Math.PI / 2), '#ffd166', s * 0.3, 0.48, 0, face); bell.rotation.z = -s * 0.5; }
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), '#8a84a4', 0, 0.62, 0, face).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 4), '#231a33', s * 0.25, 0.3, 0, b).rotation.z = s * 0.3; mesh(new THREE.SphereGeometry(0.08, 5, 4), '#231a33', s * 0.33, 0.06, 0.04, b); }
    V.y = 0; V.tick = (t, dt, sp, k) => { h1.rotation.z = -t * 2; h2.rotation.z = -t * 0.3; const shake = 0.03 + (1 - k) * 0.14; face.rotation.z = Math.sin(t * (20 + (1 - k) * 30)) * shake; face.position.y = 0.95 + Math.abs(Math.sin(t * 6)) * 0.08; };
  },
  jogger(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    mesh(new THREE.BoxGeometry(0.46, 0.6, 0.3), '#2fb0a0', 0, 1.0, 0, b);
    mesh(new THREE.BoxGeometry(0.47, 0.06, 0.31), '#f3ecdf', 0, 1.12, 0, b);
    const head = new THREE.Group(); head.position.y = 1.52; b.add(head);
    mesh(new THREE.SphereGeometry(0.22, 9, 7), '#d9a27a', 0, 0, 0, head);
    mesh(new THREE.SphereGeometry(0.23, 9, 5, 0, TAU, 0, Math.PI / 2.4), '#4a2a1a', 0, 0.04, -0.02, head);
    const band = mesh(new THREE.TorusGeometry(0.22, 0.04, 4, 12), '#e23a5a', 0, 0.08, 0, head); band.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.03, 4, 4), '#231a33', s * 0.08, 0.02, 0.2, head);
    mesh(new THREE.TorusGeometry(0.06, 0.015, 3, 6, Math.PI), '#6a2a2a', 0, -0.07, 0.2, head).rotation.z = Math.PI;
    const legs = [], arms = [];
    for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(s * 0.12, 0.7, 0); b.add(l); legs.push(l); mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 5), '#1a2a5a', 0, -0.31, 0, l); mesh(new THREE.BoxGeometry(0.13, 0.08, 0.24), '#f3ecdf', 0, -0.64, 0.05, l);
      const a = new THREE.Group(); a.position.set(s * 0.3, 1.25, 0); b.add(a); arms.push(a); mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 5), '#d9a27a', 0, -0.25, 0, a); }
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 6), M('#3aa0ff', { emissive: '#1a50a0', emissiveIntensity: 0.4 }), 0, -0.55, 0, arms[0]);
    V.wave = 0;
    V.y = 0; V.tick = (t, dt) => { const f = 11; legs[0].rotation.x = Math.sin(t * f) * 0.8; legs[1].rotation.x = -Math.sin(t * f) * 0.8; arms[0].rotation.x = -Math.sin(t * f) * 0.7;
      V.wave = Math.max(0, V.wave - dt); arms[1].rotation.x = V.wave > 0 ? 0 : Math.sin(t * f) * 0.7; arms[1].rotation.z = V.wave > 0 ? 2.6 + Math.sin(t * 14) * 0.3 : 0; b.position.y = Math.abs(Math.sin(t * f)) * 0.06; };
  },
  bird(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    mesh(new THREE.SphereGeometry(0.26, 8, 6), '#4aa0e8', 0, 0, 0, b).scale.set(0.9, 0.85, 1.15);
    mesh(new THREE.SphereGeometry(0.16, 6, 5), '#ffe3c6', 0, -0.06, 0.12, b);
    mesh(new THREE.ConeGeometry(0.05, 0.14, 4), '#ffb03a', 0, 0.06, 0.32, b).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.035, 4, 4), '#231a33', s * 0.1, 0.1, 0.24, b);
    const wings = [];
    for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.2, 0.05, 0); b.add(w); wings.push(w); const m = mesh(new THREE.BoxGeometry(0.42, 0.04, 0.24), '#2a70c0', s * 0.21, 0, 0, w); }
    mesh(new THREE.ConeGeometry(0.1, 0.25, 4), '#2a70c0', 0, 0.02, -0.3, b).rotation.x = -Math.PI / 2;
    V.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })); V.shadow.rotation.x = -Math.PI / 2; scene.add(V.shadow);
    V.y = 2.3; V.tick = (t) => { const f = Math.sin(t * 16 + V.ph) * 0.8; wings[0].rotation.z = f; wings[1].rotation.z = -f; b.position.y = Math.sin(t * 2 + V.ph) * 0.15; };
  },
  pigeon(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    mesh(new THREE.SphereGeometry(0.32, 8, 6), '#9a9ab4', 0, 0, 0, b).scale.set(0.9, 0.85, 1.2);
    mesh(new THREE.SphereGeometry(0.2, 6, 5), M('#7a6ab4', { emissive: '#3a8a6a', emissiveIntensity: 0.3 }), 0, 0.12, 0.22, b);
    const head = new THREE.Group(); head.position.set(0, 0.24, 0.36); b.add(head);
    mesh(new THREE.SphereGeometry(0.15, 7, 5), '#8a8aa4', 0, 0, 0, head);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.035, 4, 4), '#ff8a3a', s * 0.09, 0.04, 0.1, head);
    mesh(new THREE.ConeGeometry(0.04, 0.12, 4), '#5a4a4a', 0, -0.02, 0.18, head).rotation.x = Math.PI / 2;
    // a postman's cap and the rolled morning paper
    mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.08, 8), '#2a4a8a', 0, 0.14, 0, head); mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), '#1a2a5a', 0, 0.11, 0.1, head);
    const paper = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), '#f3ecdf', 0, -0.1, 0.22, head); paper.rotation.z = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.062, 0.012, 3, 8), '#d6403a', 0, -0.1, 0.22, head).rotation.y = Math.PI / 2;
    const wings = [];
    for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.24, 0.05, 0); b.add(w); wings.push(w); mesh(new THREE.BoxGeometry(0.55, 0.04, 0.3), '#7a7a94', s * 0.27, 0, 0, w); }
    mesh(new THREE.BoxGeometry(0.26, 0.04, 0.3), '#6a6a84', 0, 0, -0.42, b);
    V.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.35, 10), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })); V.shadow.rotation.x = -Math.PI / 2; scene.add(V.shadow);
    V.y = 2.9; V.tick = (t) => { const f = Math.sin(t * 10 + V.ph) * 0.7; wings[0].rotation.z = f; wings[1].rotation.z = -f; b.position.y = Math.sin(t * 1.5 + V.ph) * 0.15; };
  },
  sun(V) {
    const b = new THREE.Group(); V.g.add(b); V.body = b;
    const core = M('#ffd040', { emissive: '#ff9a20', emissiveIntensity: 0.9 });
    mesh(new THREE.SphereGeometry(1.0, 14, 10), core, 0, 0, 0, b);
    const rays = new THREE.Group(); b.add(rays); V.rays = rays;
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; const c = mesh(new THREE.ConeGeometry(0.2, 0.65, 5), M('#ffb030', { emissive: '#ff8a10', emissiveIntensity: 0.8 }), Math.cos(a) * 1.3, Math.sin(a) * 1.3, 0, rays); c.rotation.z = a - Math.PI / 2; }
    // sunglasses
    for (const s of [-1, 1]) { mesh(new THREE.BoxGeometry(0.44, 0.28, 0.08), M('#1a1430', { roughness: 0.3, metalness: 0.4 }), s * 0.3, 0.2, 0.95, b); }
    mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), '#1a1430', 0, 0.26, 0.98, b);
    const mouth = mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 10, Math.PI), '#7a3a10', 0, -0.32, 0.92, b); mouth.rotation.z = Math.PI; V.mouth = mouth;
    for (const s of [-1, 1]) { const c = mesh(new THREE.CircleGeometry(0.14, 10), M('#ff7a5a'), s * 0.55, -0.15, 0.86, b); c.rotation.y = s * 0.5; }
    // a sleepy nightcap that blows off as it wakes up
    const cap = new THREE.Group(); cap.position.set(0.1, 0.9, 0); b.add(cap); V.cap = cap;
    mesh(new THREE.ConeGeometry(0.6, 1.2, 8), '#5a4aa0', 0, 0.45, 0, cap).rotation.z = -0.5;
    mesh(new THREE.SphereGeometry(0.16, 6, 5), '#f3ecdf', 0.55, 0.85, 0, cap);
    mesh(new THREE.TorusGeometry(0.58, 0.1, 5, 12), '#f3ecdf', 0, -0.05, 0, cap).rotation.x = Math.PI / 2;
    V.halo = glow('rgba(255,200,90,.9)', 5, b, 0, 0, 0, 0.6);
    V.y = 1.6; V.tick = (t, dt, sp, k, prog) => { rays.rotation.z += dt * (0.3 + prog * 1.5); rays.scale.setScalar(0.7 + prog * 0.6); b.position.y = Math.sin(t * 1.2) * 0.1; V.halo.material.opacity = 0.4 + prog * 0.5; cap.visible = prog < 0.45; cap.rotation.z = Math.sin(t * 0.8) * 0.1; };
  },
};
const views = new Map();
const blobGeo = new THREE.CircleGeometry(0.4, 12), blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false });
function hpBar(V) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.13), new THREE.MeshBasicMaterial({ color: '#1a1430', depthTest: false, transparent: true, opacity: 0.8 }));
  const fgGeo = new THREE.PlaneGeometry(0.94, 0.08); fgGeo.translate(0.47, 0, 0.001);
  const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: '#7fe08a', depthTest: false, transparent: true }));
  fg.position.x = -0.47; g.add(bg, fg); g.renderOrder = 10; bg.renderOrder = 10; fg.renderOrder = 11; g.visible = false;
  V.root.add(g); V.bar = g; V.fg = fg;
}
function makeEnemy(e) {
  const root = new THREE.Group(); scene.add(root);
  const g = new THREE.Group(); root.add(g);
  const V = { id: e.id, kind: e.type, root, g, ph: Math.random() * 6, fade: 0, gagT: 2 + Math.random() * 6 };
  MAKE[e.type](V); g.position.y = V.y;
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; });
  if (!V.shadow) { V.blob = new THREE.Mesh(blobGeo, blobMat); V.blob.rotation.x = -Math.PI / 2; V.blob.position.y = 0.06; V.blob.scale.setScalar(e.boss ? 3 : 1); root.add(V.blob); }
  if (e.boss) root.scale.setScalar(1);
  hpBar(V); V.bar.position.y = V.y + (e.boss ? 2.1 : e.type === 'jogger' ? 1.95 : e.type === 'bird' || e.type === 'pigeon' ? 0.6 : e.type === 'clock' ? 1.75 : e.type === 'rooster' ? 1.4 : 0.75); if (e.boss) V.bar.scale.set(2.4, 1.5, 1);
  V.frost = glow('rgba(160,220,255,.9)', e.boss ? 3.6 : 1.4, root, 0, V.y + 0.4, 0, 0.0);
  root.position.set(e.x, 0, e.z);
  views.set(e.id, V); return V;
}
function dropEnemy(id, how) {
  const V = views.get(id); if (!V) return; views.delete(id);
  if (V.shadow) scene.remove(V.shadow);
  if (how === 'shoo') { const p = V.root.position; sparkle(p.x, V.y + 0.4, p.z, V.kind === 'sun' ? 'rgba(255,200,90,.95)' : 'rgba(255,240,170,.95)', V.kind === 'sun' ? 60 : 16); scene.remove(V.root); return; }
  leaving.push({ V, t: 0 });   // walks into the window and fades
}
const leaving = [];

// ---------------------------------------------------------------- shots and effects
const shotViews = new Map();
const boneGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 5), boneEnd = new THREE.SphereGeometry(0.08, 5, 4);
function makeShotView(s) {
  const g = new THREE.Group(); scene.add(g);
  if (s.kind === 'bone') { mesh(boneGeo, '#efe6cf', 0, 0, 0, g).rotation.z = Math.PI / 2; for (const x of [-0.22, 0.22]) mesh(boneEnd, '#efe6cf', x, 0, 0, g); }
  else if (s.kind === 'bat') { mesh(new THREE.SphereGeometry(0.1, 5, 4), '#231a33', 0, 0, 0, g); g.userData.w = [-1, 1].map(k => { const w = mesh(new THREE.BoxGeometry(0.28, 0.02, 0.14), '#3a2d54', k * 0.16, 0, 0, g); return w; }); glow('rgba(255,120,160,.7)', 0.6, g, 0, 0, 0, 0.5); }
  else if (s.kind === 'pumpkin') { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; mesh(new THREE.SphereGeometry(0.17, 6, 5), '#ff9a3a', Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1, g).scale.set(0.7, 1, 0.7); } glow('rgba(255,170,60,.8)', 0.9, g, 0, 0, 0, 0.5); }
  g.traverse(o => { o.castShadow = false; }); shotViews.set(s.id, g); return g;
}
const sparkles = [], rings = [], zaps = [], seedsL = [];
function sparkle(x, y, z, color, n) { for (let i = 0; i < (n || 14); i++) { const s = glow(color, 0.5, scene, x, y, z, 0.9); sparkles.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, (Math.random() - 0.5) * 3), life: 0.7 + Math.random() * 0.4, t: 0 }); } }
const seedGeo = new THREE.SphereGeometry(0.06, 4, 3), seedMat = M('#ffe3a6');
function seeds(x, z, r) { for (let i = 0; i < 14; i++) { const m = mesh(seedGeo, seedMat, x, 0.3, z); m.scale.set(1, 0.5, 1.6); const a = Math.random() * TAU, v = r * (1.5 + Math.random() * 1.8); seedsL.push({ m, v: new THREE.Vector3(Math.cos(a) * v, 2 + Math.random() * 2, Math.sin(a) * v), t: 0 }); }
  const fl = glow('rgba(255,160,60,.9)', r * 2.6, scene, x, 0.4, z, 0.7); rings.push({ m: fl, t: 0, life: 0.3, flash: true }); }
function breath(i, r) {
  const st = stones[i]; const m = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 40), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(st.g.position.x, 0.4, st.g.position.z); scene.add(m); rings.push({ m, t: 0, life: 0.55, r });
}
function zap(i, pts) {
  const st = stones[i]; const T = st.tower; const from = new THREE.Vector3(); if (T && T.tip) T.tip.getWorldPosition(from); else from.set(st.g.position.x, 2, st.g.position.z);
  const P = [from]; for (const [x, z, f] of pts) P.push(new THREE.Vector3(x, f ? 2.4 : 0.8, z));
  const verts = [];
  for (let k = 0; k < P.length - 1; k++) { const a = P[k], b = P[k + 1]; const n = 6; let prev = a.clone(); for (let j = 1; j <= n; j++) { const q = a.clone().lerp(b, j / n); if (j < n) q.add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35)); verts.push(prev.x, prev.y, prev.z, q.x, q.y, q.z); prev = q; } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#cffcff', transparent: true })); scene.add(line);
  const gl = P.slice(1).map(p => glow('rgba(160,255,240,.9)', 1.1, scene, p.x, p.y, p.z, 0.8));
  zaps.push({ line, gl, t: 0 });
}

// ---------------------------------------------------------------- camera fit (landscape)
let W = 1, H = 1;
const HUDPAD = 0.08;
function fitCamera() {
  const asp = W / H; camera.aspect = asp;
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = new THREE.Vector3(0, 0.76, 0.65).normalize();
  const dW = 15.6 / (half * asp), dH = 8.6 / half;
  const d = Math.max(dW, dH);
  const tgt = new THREE.Vector3(-0.8, 0, 0.2);
  camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateProjectionMatrix();
}
function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H, false); fitCamera(); }
addEventListener('resize', resize); resize();
const tmpV = new THREE.Vector3();
function toScreen(x, y, z) { tmpV.set(x, y, z).project(camera); return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * H }; }

// ---------------------------------------------------------------- DOM bits
const ui = { candy: $('candy'), lives: $('lives'), wave: $('wave'), livesPill: $('livesPill'), call: $('call'), callText: $('callText'), callWho: $('callWho'), callArc: $('callArc'), ring: $('ring'), info: $('info'), speed: $('speed') };
function pop(text, x, y, z, cls) { const p = toScreen(x, y, z); const el = document.createElement('div'); el.className = 'pop' + (cls ? ' ' + cls : ''); el.textContent = text; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; fx.appendChild(el); setTimeout(() => el.remove(), 1700); }
let toastTimer = 0;
function toast(t, s, dur) { $('toastT').textContent = t; $('toastS').textContent = s || ''; $('toast').classList.add('on'); toastTimer = dur || 2.6; }
let lastHud = '';
const callScreen = () => { const o = THEME[mapId].call; return toScreen(GATE[0] + o[0], 0, GATE[1] + o[1]); };
function updateHud() {
  const k = S.candy + '|' + S.lives + '|' + S.wave;
  if (k !== lastHud) { lastHud = k; ui.candy.textContent = S.candy; ui.lives.textContent = S.lives; ui.wave.textContent = S.endless ? 'Wave ' + Math.max(1, S.wave) : Math.min(S.wave, S.waves) + '/' + S.waves; refreshRing(); }
  // the call button sits by the garden gate
  const can = sim.canCallEarly() && !over;
  ui.call.hidden = !can || !started;
  if (can) {
    const p = callScreen(); ui.call.style.left = Math.max(56, p.x) + 'px'; ui.call.style.top = Math.max(120, p.y) + 'px';
    const next = sim.waveDef(S.wave);
    const kinds = [...new Set(next.map(g => g[0]))];
    ui.callWho.textContent = kinds.map(k => ENEMY_ICON[k]).join('');
    if (S.phase === 'ready') { ui.callText.textContent = 'Start wave 1'; ui.callArc.style.strokeDashoffset = 0; }
    else { const b = sim.earlyBonus(); ui.callText.innerHTML = 'Wave ' + (S.wave + 1) + ' <em>+' + b + '🍬</em>'; ui.callArc.style.strokeDashoffset = 232.5 * (1 - S.next / D.RULES.nextWait); }
  }
}

// ---------------------------------------------------------------- what each monster does (short, for the build ring)
const TOWER_TEXT = {
  rattle:  { line: 'Throws bones fast at one Dawn helper. Cheap and steady.', chips: [['🎯', 'One target'], ['⚡', 'Fast'], ['🐦', 'Weak vs flyers', 'meh']] },
  wisp:    { line: 'Blows a cold breath that slows everyone near him. Tiny damage.', chips: [['❄️', 'Slows all nearby'], ['📏', 'Short reach'], ['🐦', 'Hits flyers']] },
  frank:   { line: 'An electric zap that jumps between up to 3 helpers in a row.', chips: [['⛓️', 'Chains to 3'], ['💥', 'Strong'], ['🐦', 'Half vs flyers', 'meh']] },
  gourdon: { line: 'Lobs a pumpkin that bursts on a whole group. Slow to reload.', chips: [['💥', 'Splash'], ['🐢', 'Slow'], ['🚫', 'Can’t hit flyers', 'no']] },
  vesper:  { line: 'Sends bats with a very long reach. The best answer to birds.', chips: [['📏', 'Long reach'], ['🐦', 'Triple vs flyers', 'yes'], ['👣', 'Weak on ground', 'meh']] },
};
const UP_TEXT = {
  rattle: ['harder bones, quicker throws', 'heavy bones, fastest throws'],
  wisp: ['colder breath, slows more', 'icy breath, slows the most'],
  frank: ['bigger zaps, longer reach', 'huge zaps, longest reach'],
  gourdon: ['bigger pumpkins, wider burst', 'giant pumpkins, widest burst'],
  vesper: ['more bites, longer reach', 'a whole flock, longest reach'],
};
function infoCard(type, lvl) {
  const T = TOWER_TEXT[type];
  return '<div class="nm">' + TOWER_ICON[type] + ' <b>' + TW[type].name + '</b>' + (lvl > 1 ? ' <span class="lv">level ' + lvl + '</span>' : '') + '</div>'
    + '<div class="ln">' + T.line + '</div><div class="chips">' + T.chips.map(c => '<span class="' + (c[2] || '') + '">' + c[0] + ' ' + c[1] + '</span>').join('') + '</div>';
}

// ---------------------------------------------------------------- build ring: tap a stone
let selSlot = null, selType = null;
function closeRing() { selSlot = null; selType = null; ui.ring.innerHTML = ''; ui.info.hidden = true; hideRange(); for (const st of stones) st.base.material = M('#6a6484'); }
function ringPos() { const st = stones[selSlot]; const p = toScreen(st.g.position.x, 0.6, st.g.position.z); const R = ringR();
  // keep the whole ring on screen: shift its centre in from the edges
  p.x = Math.min(W - R - 36, Math.max(R + 36, p.x)); p.y = Math.min(H - R - 62, Math.max(R + 58, p.y)); return p; }
function ringR() { return Math.max(80, Math.min(100, H * 0.22)); }
function openRing(slot) {
  closeRing(); selSlot = slot; stones[slot].base.material = M('#8a84b4'); toastTimer = Math.min(toastTimer, 0.01);
  refreshRing();
}
function refreshRing() {
  if (selSlot == null) return;
  const T = S.towers[selSlot]; const c = ringPos(); ui.ring.style.left = c.x + 'px'; ui.ring.style.top = c.y + 'px';
  ui.ring.innerHTML = '';
  const R = ringR();
  const opt = (icon, cost, dx, dy, cls, on) => { const b = document.createElement('button'); b.className = 'opt ' + (cls || ''); b.innerHTML = icon + (cost != null ? '<span class="c">' + cost + '</span>' : ''); b.style.left = dx + 'px'; b.style.top = dy + 'px'; b.addEventListener('pointerdown', ev => { ev.stopPropagation(); on(); }); ui.ring.appendChild(b); return b; };
  const sx = stones[selSlot].g.position.x, sz = stones[selSlot].g.position.z;
  if (!T) {
    // only the towers unlocked on this map; the others stay hidden until their map
    const list = D.TOWER_ORDER.filter(t => sim.allowed(t));
    list.forEach((type, i) => {
      const a = -Math.PI / 2 + i * TAU / list.length; const dx = Math.cos(a) * R, dy = Math.sin(a) * R;
      const cost = TW[type].cost[0];
      opt(TOWER_ICON[type], cost, dx, dy, (S.candy < cost ? 'poor' : '') + (selType === type ? ' sel' : ''), () => {
        if (selType === type) { if (sim.build(selSlot, type)) { closeRing(); } else { Snd.play('nope'); toast('Not enough candy', 'Shoo more Dawn helpers to earn candy.', 1.6); } return; }
        selType = type; Snd.play('pick'); showRange(sx, sz, TW[type].range[0]); refreshRing();
      });
    });
    ui.info.hidden = false;
    ui.info.innerHTML = selType == null ? 'Pick a monster for this stone. Tap one to see what it does.'
      : infoCard(selType, 1) + '<div class="hint">Tap ' + TOWER_ICON[selType] + ' again to place it for ' + TW[selType].cost[0] + '🍬</div>';
  } else {
    const D2 = TW[T.type], uc = sim.upgradeCost(selSlot), sv = sim.sellValue(selSlot);
    showRange(sx, sz, D2.range[T.level - 1]);
    const up = opt('⬆️', uc != null ? uc : 'max', 0, -R, uc == null ? 'max' : S.candy < uc ? 'poor' : '', () => {
      if (uc == null) return; if (!sim.upgrade(selSlot)) { Snd.play('nope'); toast('Not enough candy', '', 1.4); }
    });
    up.addEventListener('pointerenter', () => { if (uc != null) showRange(sx, sz, D2.range[T.level]); });
    up.addEventListener('pointerleave', () => showRange(sx, sz, D2.range[T.level - 1]));
    opt('💰', '+' + sv, 0, R * 0.95, '', () => { sim.sell(selSlot); closeRing(); });
    ui.info.hidden = false;
    ui.info.innerHTML = infoCard(T.type, T.level) + '<div class="hint">' + (uc != null ? '⬆️ Level ' + (T.level + 1) + ' for ' + uc + '🍬: ' + UP_TEXT[T.type][T.level - 1] : 'Fully upgraded') + ' · 💰 sell for ' + sv + '🍬</div>';
  }
}

// ---------------------------------------------------------------- taps
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function slotAt(cx, cy) {
  // stones are picked in screen space so a tall tower in front never hides the one behind it
  let best = null, bd = 1e9;
  for (const st of stones) { const p = toScreen(st.g.position.x, 0.4, st.g.position.z); const d = Math.hypot(p.x - cx, p.y - cy); const lim = Math.max(30, H * 0.075); if (d < lim && d < bd) { bd = d; best = st.i; } }
  if (best != null) return best;
  // or on the tower's body
  for (const st of stones) if (st.tower) { const p = toScreen(st.g.position.x, 1.4, st.g.position.z); if (Math.hypot(p.x - cx, p.y - cy) < H * 0.07) return st.i; }
  return null;
}
renderer.domElement.addEventListener('pointerdown', ev => {
  if (!started || over) return;
  const s = slotAt(ev.clientX, ev.clientY);
  if (s == null || s === selSlot) { closeRing(); return; }
  Snd.play('tap'); openRing(s);
});
ui.call.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (sim.canCallEarly()) { const b = sim.earlyBonus(); sim.startWave(); if (b > 0) { Snd.play('early'); const p = callScreen(); const el = document.createElement('div'); el.className = 'pop'; el.textContent = '+' + b + ' 🍬 early!'; el.style.left = Math.max(48, p.x) + 'px'; el.style.top = Math.max(110, p.y) - 50 + 'px'; fx.appendChild(el); setTimeout(() => el.remove(), 1200); } } });
let speed = 1;
ui.speed.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; ui.speed.textContent = speed + '×'; ui.speed.classList.toggle('on', speed === 2); });
// three reasons to stand still: the tab is hidden, the platform asked (an ad, a tab switch), or the player paused
let userPaused = false, tabHidden = false, platPaused = false, adBusy = false;
let sndPaused = null;
function recomputePaused() { const p = tabHidden || platPaused || adBusy || userPaused; if (p !== sndPaused) { sndPaused = p; Snd.set({ paused: p }); } }
const lvlInfo = () => ({ world: game.endless ? 'endless' : 'maps', level: game.endless ? 'endless' : game.map });
function openPause() { if (!started || over || userPaused) return; userPaused = true; $('pauseCard').hidden = false; closeRing(); PF.msg('level_paused', lvlInfo()); }
function closePause() { userPaused = false; $('pauseCard').hidden = true; PF.msg('level_resumed', lvlInfo()); }
$('pauseBtn').addEventListener('click', openPause);
$('resumeBtn').addEventListener('click', closePause);
$('restartBtn').addEventListener('click', () => { $('pauseCard').hidden = true; userPaused = false; PF.msg('level_failed', lvlInfo()); restart(); });
document.addEventListener('visibilitychange', () => { tabHidden = document.hidden; if (tabHidden) { PF.flush(); openPause(); } recomputePaused(); });
window.addEventListener('pagehide', () => PF.flush());
document.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'p') { if (!$('pauseCard').hidden) closePause(); else openPause(); } });
// sound: one switch for effects and music, kept in the save
function syncSound() { const on = save.sound !== false; for (const id of ['soundBtn', 'titleSound']) { $(id).textContent = on ? '🔊' : '🔇'; $(id).classList.toggle('on', !on); } Snd.set({ sfx: on, music: on }); }
for (const id of ['soundBtn', 'titleSound']) $(id).addEventListener('click', () => { save.sound = save.sound === false; persist(); syncSound(); if (save.sound) Snd.play('tap'); });

// ---------------------------------------------------------------- events from the sim
const seen = new Set();
function handle(e) {
  switch (e.type) {
    case 'spawn': { const en = S.enemies.find(q => q.id === e.id); if (en) makeEnemy(en);
      if (e.kind === 'rooster' || e.kind === 'clock') { if (Math.random() < 0.25) Snd.play(e.kind === 'rooster' ? 'rooster' : 'ring'); }
      if (!seen.has(e.kind)) { seen.add(e.kind); toast(ENEMY_ICON[e.kind] + ' ' + EN[e.kind].name, ENEMY_TIP[e.kind], e.kind === 'sun' ? 4 : 3.2); } break; }
    case 'shoo': { Snd.play(e.kind === 'sun' ? 'win' : 'shoo'); const V = views.get(e.id); if (V) pop('+' + e.candy + '🍬', V.root.position.x, V.y + 1, V.root.position.z); dropEnemy(e.id, 'shoo'); break; }
    case 'leak': {
      dropEnemy(e.id, 'leak'); Snd.play('candleOut');
      for (let k = 0, n = 0; k < candles.length && n < e.lives; k++) if (!candles[k].out) { candles[k].out = true; n++; sparkle(clinic.position.x + candles[k].g.position.x, 1.2, candles[k].g.position.z, 'rgba(200,200,220,.5)', 4); }
      ui.livesPill.classList.remove('hurt'); void ui.livesPill.offsetWidth; ui.livesPill.classList.add('hurt');
      pop('−' + e.lives + ' 🕯️', WIN[0] - 0.6, 2.6, WIN[1], 'bad'); break; }
    case 'wave': { closeRingIfStale(); const boss = e.boss; Snd.play(boss ? 'sun' : 'wave'); Snd.tempo(boss ? 118 : game.endless ? 104 : 94); toast(boss ? (S.endless ? 'Wave ' + e.wave + ': the Sun!' : 'Final wave!') : 'Wave ' + e.wave, boss ? 'Here comes the Sun…' : '', 1.6); break; }
    case 'throw': case 'bats': case 'lob': case 'breath': case 'zap': { const T = stones[e.tower].tower; if (T) T.a = 1; Snd.play(e.type === 'throw' ? 'bone' : e.type);
      if (e.type === 'breath') breath(e.tower, e.r); if (e.type === 'zap') zap(e.tower, e.pts); break; }
    case 'burst': seeds(e.x, e.z, e.r); Snd.play('burst'); break;
    case 'hit': sparkle(e.x, 1, e.z, e.kind === 'bat' ? 'rgba(255,140,180,.8)' : 'rgba(255,250,230,.8)', 4); break;
    case 'build': { Snd.play('build'); makeTower(e.slot, e.kind); sparkle(stones[e.slot].g.position.x, 0.8, stones[e.slot].g.position.z, 'rgba(159,231,208,.9)', 14); break; }
    case 'upgrade': { Snd.play('upgrade'); setLevel(e.slot, e.level); const st = stones[e.slot]; if (st.tower) st.tower.pop = 0.6; sparkle(st.g.position.x, 1.4, st.g.position.z, 'rgba(255,209,102,.95)', 18); break; }
    case 'sell': Snd.play('sell'); removeTower(e.slot); pop('+' + e.candy + '🍬', stones[e.slot].g.position.x, 1.5, stones[e.slot].g.position.z); break;
    case 'won': setTimeout(() => endCard(true, e.stars), 1400); over = true; closeRing(); Snd.play('win'); levelOver(true); break;
    case 'lost': setTimeout(() => endCard(false, 0), 1000); over = true; closeRing(); Snd.play('fail'); levelOver(false); break;
    case 'cleared': if (S.endless && e.wave > (save.endless || 0) && save.endless > 0 && !S.newBest) { S.newBest = true; toast('New best!', 'Past wave ' + save.endless + '. Keep going!', 2); } break;
  }
}
function closeRingIfStale() { if (selSlot != null) refreshRing(); }

// ---------------------------------------------------------------- per-frame view update
const camQ = new THREE.Quaternion();
let gagCool = 0;
function updateEnemies(dt, t) {
  camera.getWorldQuaternion(camQ);
  for (const e of S.enemies) {
    const V = views.get(e.id); if (!V) continue;
    V.root.position.x += (e.x - V.root.position.x) * Math.min(1, dt * 18); V.root.position.z += (e.z - V.root.position.z) * Math.min(1, dt * 18);
    if (e.dx != null) { const a = Math.atan2(e.dx, e.dz); let d = a - V.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); V.g.rotation.y += d * Math.min(1, dt * 8); }
    const k = e.hp / e.max, prog = e.prog || 0;
    const sp = EN[e.type].burst ? (((S.t + e.phase * 3) % (EN[e.type].burst[1] + EN[e.type].burst[3])) < EN[e.type].burst[1] ? 1 : 3) : 1;
    V.tick(t, dt, sp, k, prog);
    V.bar.visible = k < 0.999; V.bar.quaternion.copy(camQ); V.fg.scale.x = Math.max(0.001, k); V.fg.material.color.set(k > 0.5 ? '#7fe08a' : k > 0.25 ? '#ffd166' : '#ff7a5a');
    V.frost.material.opacity = e.slowT > 0 ? 0.55 : Math.max(0, V.frost.material.opacity - dt * 2);
    if (V.shadow) V.shadow.position.set(V.root.position.x, 0.05, V.root.position.z);
    // little gags, one at a time
    V.gagT -= dt;
    if (V.gagT <= 0 && gagCool <= 0) { V.gagT = 5 + Math.random() * 7; gagCool = 1.4; const L = ENEMY_GAG[e.type]; pop(L[Math.floor(Math.random() * L.length)], V.root.position.x, V.y + (e.boss ? 2.6 : 1.4), V.root.position.z, 'gag'); if (e.type === 'jogger') V.wave = 1.2; }
  }
  gagCool -= dt;
  if (views.size > S.enemies.length) { const ids = new Set(S.enemies.map(e => e.id)); for (const id of [...views.keys()]) if (!ids.has(id)) dropEnemy(id, 'shoo'); }
  for (let i = leaving.length - 1; i >= 0; i--) { const L = leaving[i]; L.t += dt; L.V.root.position.x += dt * 1.5; const s = Math.max(0.01, 1 - L.t * 2); L.V.root.scale.setScalar(s); if (L.t > 0.5) { scene.remove(L.V.root); leaving.splice(i, 1); } }
}
function updateShots(dt, t) {
  const live = new Set();
  for (const s of S.shots) {
    live.add(s.id); const g = shotViews.get(s.id) || makeShotView(s);
    if (s.kind === 'pumpkin') { const k = Math.min(1, s.t / s.dur); g.position.set(s.x0 + (s.tx - s.x0) * k, 3.4 * (1 - k) + 0.3 + Math.sin(k * Math.PI) * 3, s.z0 + (s.tz - s.z0) * k); g.rotation.x += dt * 6; }
    else if (s.kind === 'bone') { g.position.set(s.x, 1.5 + Math.sin(Math.min(1, s.t * 3) * Math.PI) * 0.6, s.z); g.rotation.y += dt * 18; g.rotation.x += dt * 7; }
    else { const e = S.enemies.find(q => q.id === s.target); g.position.set(s.x, 1.6 + (e && e.fly ? 0.8 : 0) + Math.sin(t * 10 + s.id) * 0.15, s.z); if (e) g.rotation.y = Math.atan2(e.x - s.x, e.z - s.z); const f = Math.sin(t * 30 + s.id) * 0.9; g.userData.w[0].rotation.z = f; g.userData.w[1].rotation.z = -f; }
  }
  for (const [id, g] of shotViews) if (!live.has(id)) { scene.remove(g); shotViews.delete(id); }
}
function updateTowers(dt, t) {
  for (let i = 0; i < stones.length; i++) {
    const P = stones[i].tower; if (!P) continue;
    const T = S.towers[i];
    P.a = Math.max(0, P.a - dt * 3.2);
    if (T) { let d = T.aim - P.g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); P.g.rotation.y += d * Math.min(1, dt * 7); }
    P.pop = Math.max(0, P.pop - dt * 2);
    const s = P.base * (1 + Math.sin(P.pop * 8) * P.pop * 0.25); P.g.scale.setScalar(Math.max(0.01, P.pop > 0.5 ? P.base * (1 - (P.pop - 0.5) * 2) + 0.01 : s));
    P.tick(t, P.a, T ? T.cd : 0); if (P.extra && P.lvl >= 3) P.extra(t, P.a);
  }
  for (const st of stones) if (st.plus.visible) st.plus.material.opacity = 0.25 + Math.sin(t * 2 + st.i) * 0.1;
}
function updateFx(dt) {
  for (let i = sparkles.length - 1; i >= 0; i--) { const p = sparkles[i]; p.t += dt; p.v.y -= 4 * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = 0.9 * (1 - p.t / p.life); if (p.t > p.life) { scene.remove(p.s); sparkles.splice(i, 1); } }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const k = r.t / r.life;
    if (r.flash) r.m.material.opacity = 0.7 * (1 - k); else { r.m.scale.setScalar(0.3 + k * r.r); r.m.material.opacity = 0.55 * (1 - k); }
    if (k >= 1) { scene.remove(r.m); rings.splice(i, 1); } }
  for (let i = zaps.length - 1; i >= 0; i--) { const z = zaps[i]; z.t += dt; const o = Math.max(0, 1 - z.t / 0.22); z.line.material.opacity = o; z.gl.forEach(g => g.material.opacity = o * 0.8); if (z.t > 0.22) { scene.remove(z.line); z.gl.forEach(g => scene.remove(g)); zaps.splice(i, 1); } }
  for (let i = seedsL.length - 1; i >= 0; i--) { const s = seedsL[i]; s.t += dt; s.v.y -= 12 * dt; s.m.position.addScaledVector(s.v, dt); if (s.m.position.y < 0.05) { s.m.position.y = 0.05; s.v.set(0, 0, 0); } if (s.t > 1.1) { scene.remove(s.m); seedsL.splice(i, 1); } }
}
function updateWorld(dt, t) {
  // candles: flicker; blown-out ones smoke a moment
  for (const c of candles) { if (c.out) { c.f.visible = false; c.gl.material.opacity = Math.max(0, c.gl.material.opacity - dt); } else { c.f.visible = true; c.f.scale.y = 1 + Math.sin(t * 9 + c.g.position.z * 7) * 0.15; c.gl.material.opacity = 0.6 + Math.sin(t * 7 + c.g.position.z * 5) * 0.12; } }
  // the curtains open a little for every candle out
  const open = 1 - S.lives / D.RULES.lives;
  for (const c of curtains) { const w = Math.max(0.25, 1 - open * 0.75); c.scale.z += (w - c.scale.z) * Math.min(1, dt * 3); c.position.z = WIN[1] + c.userData.s * (1.5 - 0.75 * c.scale.z); }
  // dawn creeps in: the sky warms with the waves, and a lot when the Sun is out
  const sun = S.enemies.find(e => e.boss);
  const dawn = Math.min(1, (S.endless ? ((S.wave - 1) % D.ENDLESS.bossEvery) / D.ENDLESS.bossEvery : S.wave / S.waves) * 0.45 + (sun ? 0.3 + 0.4 * sun.s / PATH.L : 0) + (S.phase === 'won' ? -0.4 : 0));
  scene.background.copy(NIGHT_BG).lerp(DAWN_BG, Math.max(0, dawn)); scene.fog.color.copy(scene.background);
  horizon.material.opacity = Math.max(0, dawn) * 0.8; horizon.scale.setScalar(10 + dawn * 10);
  hemi.intensity = 0.85 + dawn * 0.25;
  airLine.visible = S.enemies.some(e => e.straight) || ((S.next > 0 || S.phase === 'ready') && (sim.waveDef(S.wave) || []).some(g => g[0] === 'pigeon'));
  dawnL.intensity = sun ? 1.2 : 0; if (sun) { const V = views.get(sun.id); if (V) dawnL.position.set(V.root.position.x, 3.5, V.root.position.z); }
}

// ---------------------------------------------------------------- saves (this device for now; Playgama cloud saves come in step 3)
// ---- through Bridge storage on Playgama (cloud save), device storage on a plain page. One JSON under one key.
let save = { v: 1, stars: {}, endless: 0, sound: true, plays: 0, lb: { stars: 0, endless: 0 }, lbDirty: {} };
function mergeSave(o) { if (!o || o.v !== 1) return; save.stars = Object.assign({}, o.stars); save.endless = +o.endless || 0; save.sound = o.sound !== false; save.plays = +o.plays || 0; save.lb = Object.assign({ stars: 0, endless: 0 }, o.lb); save.lbDirty = Object.assign({}, o.lbDirty); }
function persist() { PF.saveSoon(JSON.stringify(save)); }
// a map opens when the one before it is won (any stars); Endless opens with the Garden Path won
function unlocked(id) { const i = D.MAP_ORDER.indexOf(id); return i <= 0 || (save.stars[D.MAP_ORDER[i - 1]] || 0) > 0; }
const endlessOpen = () => (save.stars[D.ENDLESS.map] || 0) > 0;
const totalStars = () => D.MAP_ORDER.reduce((a, id) => a + (save.stars[id] || 0), 0);
// the monster each map adds, for the map card and the intro
const NEW_TOWER = {}; for (const [t, name] of Object.entries(D.UNLOCK)) for (const id of D.MAP_ORDER) if (D.MAPS[id].name === name) NEW_TOWER[id] = t;
const MAP_ICON = { garden: '🌿', patch: '🎃', roof: '🏠' };

// ---------------------------------------------------------------- start, end, restart
let started = false, over = false;
function clearViews() {
  for (const [, V] of views) { scene.remove(V.root); if (V.shadow) scene.remove(V.shadow); } views.clear();
  for (const L of leaving) scene.remove(L.V.root); leaving.length = 0;
  for (const [, g] of shotViews) scene.remove(g); shotViews.clear();
  for (let i = 0; i < stones.length; i++) if (stones[i].tower) { scene.remove(stones[i].tower.root); stones[i].tower = null; stones[i].plus.visible = true; stones[i].rim.material = M(RIM[0]); }
  for (const c of candles) { c.out = false; }
}
function hideCards() { for (const id of ['titleCard', 'lbCard', 'mapCard', 'pauseCard', 'endCard']) $(id).hidden = true; }
function play(id, endless) {
  clearViews(); closeRing(); hideCards();
  game = { map: endless ? D.ENDLESS.map : id, endless: !!endless };
  buildWorld(game.map);
  sim = D.create({ seed: newSeed(), map: game.map, endless: game.endless }); S = sim.state; window.__game.sim = sim;
  over = false; started = true; userPaused = false; lastHud = '';
  save.plays++; persist(); PF.msg('level_started', lvlInfo());
  Snd.music(game.endless ? 'endless' : 'night'); Snd.ambient(true);
  const nt = NEW_TOWER[game.map];
  if (game.endless) toast('♾️ Endless', 'All five monsters are on shift. How many waves can you hold?' + (save.endless ? ' Best: ' + save.endless + '.' : ''), 4);
  else if (nt) toast(MAP_ICON[game.map] + ' ' + D.MAPS[game.map].name, TOWER_ICON[nt] + ' ' + TW[nt].name + ' joins the night shift! ' + TOWER_TEXT[nt].line, 4.5);
  else toast('Tap a stone', 'Place a monster beside the path, then start the wave.', 3.5);
}
function restart() { play(game.map, game.endless); }
function levelOver(won) {
  PF.msg(won || game.endless ? 'level_completed' : 'level_failed', lvlInfo());
  Snd.ambient(false); setTimeout(() => { if (over) Snd.music('title'); }, 2500);
}
// interstitials only between levels: when the player leaves the end card
function betweenLevels(go) {
  if (adBusy) return; adBusy = true; recomputePaused();
  PF.interstitial('level_completed').then(() => { adBusy = false; recomputePaused(); go(); });
}
// two leaderboards: total stars over the three maps, and the best Endless wave. A score that couldn't be sent is sent again at the next start.
function submitScore(board) {
  const score = board === 'endless' ? save.endless : totalStars(), id = board === 'endless' ? LB_ENDLESS : LB_STARS;
  if (score <= (save.lb[board] || 0) && !save.lbDirty[board]) return;
  save.lbDirty[board] = 1; persist();
  PF.setScore(id, score).then(ok => { if (ok) { save.lb[board] = Math.max(save.lb[board] || 0, score); delete save.lbDirty[board]; persist(); } });
}
function resendScores() { if (save.lbDirty.stars) submitScore('stars'); if (save.lbDirty.endless) submitScore('endless'); }
let lbTab = 'stars', lbFrom = 'titleCard';
function openLb(tab, from) {
  if (from) lbFrom = from; lbTab = tab || lbTab; for (const id of ['titleCard', 'mapCard']) $(id).hidden = true; $('lbCard').hidden = false;
  $('lbT1').classList.toggle('on', lbTab === 'stars'); $('lbT2').classList.toggle('on', lbTab === 'endless');
  const mine = lbTab === 'stars' ? totalStars() : save.endless, list = $('lbList'), note = $('lbNote'); list.innerHTML = '';
  const type = PF.lbType(), id = lbTab === 'stars' ? LB_STARS : LB_ENDLESS, unit = lbTab === 'stars' ? ' ⭐' : ' waves';
  const yours = lbTab === 'stars' ? 'Your stars: ' + mine + ' of 9.' : 'Your best: ' + mine + ' waves in Endless.';
  if (type === 'in_game') {
    note.textContent = 'Loading… ' + yours;
    PF.entries(id).then(rows => {
      if ((lbTab === 'stars' ? LB_STARS : LB_ENDLESS) !== id) return;
      note.textContent = yours;
      if (!rows || !rows.length) { note.textContent = 'Nobody on this board yet. ' + yours; return; }
      rows.slice(0, 10).forEach(r => { const li = document.createElement('li'); li.innerHTML = '<b></b><span></span><span></span>'; li.children[0].textContent = '#' + (r.rank || ''); li.children[1].textContent = r.name || 'A monster'; li.children[2].textContent = (r.score || 0) + unit; list.append(li); });
    });
  } else if (type === 'native_popup') { note.textContent = yours; PF.nativePopup(id); }
  else note.textContent = yours + (type === 'native' ? ' The platform shows the board.' : ' The shared board appears when the game runs on Playgama.');
}
$('lbT1').addEventListener('click', () => openLb('stars'));
$('lbT2').addEventListener('click', () => openLb('endless'));
$('lbBack').addEventListener('click', () => { $('lbCard').hidden = true; if (lbFrom === 'mapCard') showMaps(); else $('titleCard').hidden = false; });
$('titleLb').addEventListener('click', () => openLb(null, 'titleCard'));
$('mapLb').addEventListener('click', () => openLb(null, 'mapCard'));
function showMaps() {
  hideCards(); closeRing(); started = false;
  const el = $('maps'); el.innerHTML = '';
  const tile = (cls, html, on) => { const b = document.createElement('button'); b.className = 'tile ' + cls; b.innerHTML = html; if (on) b.addEventListener('click', on); else b.disabled = true; el.appendChild(b); };
  const starsHtml = n => '<div class="st">' + [1, 2, 3].map(i => '<i class="' + (i <= n ? 'on' : '') + '">⭐</i>').join('') + '</div>';
  D.MAP_ORDER.forEach((id, i) => {
    const open = unlocked(id), st = save.stars[id] || 0, nt = NEW_TOWER[id];
    const sub = !open ? '🔒 Win the ' + D.MAPS[D.MAP_ORDER[i - 1]].name : nt ? 'New: <b>' + TOWER_ICON[nt] + ' ' + TW[nt].name + '</b>' : D.MAPS[id].towers.map(t => TOWER_ICON[t]).join(' ');
    tile((open ? '' : 'locked') + (open && !st ? ' fresh' : ''), '<div class="ic">' + MAP_ICON[id] + '</div><div class="nm">' + D.MAPS[id].name + '</div>' + starsHtml(st) + '<div class="sub">' + sub + '</div>', open ? () => play(id, false) : null);
  });
  const eo = endlessOpen();
  tile('endless' + (eo ? '' : ' locked'), '<div class="ic">♾️</div><div class="nm">Endless</div><div class="sub">' + (eo ? (save.endless ? 'Best: wave <b>' + save.endless + '</b>' : 'Waves forever, all 5 monsters') : '🔒 Win the ' + D.MAPS[D.ENDLESS.map].name) + '</div>', eo ? () => play(null, true) : null);
  $('starTotal').textContent = totalStars();
  $('mapCard').hidden = false;
}
function endCard(won, stars) {
  const nb = $('nextBtn'), nw = $('endNew'); nb.hidden = true; nw.hidden = true;
  if (S.endless) {
    const n = S.cleared, best = save.endless || 0, isBest = n > best;
    if (isBest) { save.endless = n; persist(); submitScore('endless'); }
    $('endT').textContent = 'Good morning…';
    $('endStars').innerHTML = '';
    $('endS').textContent = 'You held the night for ' + n + ' wave' + (n === 1 ? '' : 's') + '. Shooed: ' + S.stats.shooed + '.';
    nw.hidden = !n && !best; nw.textContent = isBest ? (best ? '🏆 New best! (was ' + best + ')' : '🏆 Your first Endless score!') : 'Best: ' + best + ' waves.';
    $('againBtn').textContent = 'Try again'; $('againBtn').className = 'big';
  } else {
    const id = game.map, wasOpen = D.MAP_ORDER.map(unlocked), hadEndless = endlessOpen();
    if (won && stars > (save.stars[id] || 0)) { save.stars[id] = stars; persist(); submitScore('stars'); }
    if (won) setTimeout(() => Snd.play('star'), 400);
    $('endT').textContent = won ? 'Night saved!' : 'Good morning…';
    $('endStars').innerHTML = [1, 2, 3].map(i => '<i class="' + (i <= stars ? 'on' : '') + '">⭐</i>').join('');
    $('endS').textContent = won ? (stars === 3 ? 'Not one candle out. The clinic sleeps in.' : S.lives + ' candles still burning. One more hour of night!') + ' Shooed: ' + S.stats.shooed + '.'
      : 'The curtains are open and the whole clinic woke up. Reached wave ' + S.wave + ' of ' + S.waves + '.';
    const next = D.MAP_ORDER[D.MAP_ORDER.indexOf(id) + 1];
    const news = [];
    if (next && unlocked(next) && !wasOpen[D.MAP_ORDER.indexOf(next)]) { const nt = NEW_TOWER[next]; news.push('🔓 ' + D.MAPS[next].name + ' is open' + (nt ? ': ' + TOWER_ICON[nt] + ' ' + TW[nt].name + ' is waiting there!' : '!')); }
    if (endlessOpen() && !hadEndless) news.push('♾️ Endless is open too.');
    if (news.length) { nw.hidden = false; nw.innerHTML = news.join('<br>'); }
    if (won && next && unlocked(next)) { nb.hidden = false; nb.textContent = 'Next: ' + D.MAPS[next].name; nb.onclick = () => betweenLevels(() => play(next, false)); }
    $('againBtn').textContent = won ? 'Play again' : 'Try again';
    $('againBtn').className = 'big' + (nb.hidden ? '' : ' alt');
  }
  $('endCard').hidden = false; toastTimer = 0.01;
}
$('againBtn').addEventListener('click', () => betweenLevels(restart));
$('endMapsBtn').addEventListener('click', () => betweenLevels(showMaps));
$('pauseMapsBtn').addEventListener('click', () => { userPaused = false; PF.msg('level_failed', lvlInfo()); Snd.ambient(false); Snd.music('title'); showMaps(); });
// title: the first Play of a new player goes straight into the Garden Path; after that, to the maps
$('titlePlay').addEventListener('click', () => { Snd.play('pick'); if (!save.plays && !totalStars()) play('garden', false); else showMaps(); });
// the first touch anywhere is what browsers need before sound may play
const unlockAudio = () => { Snd.unlock(); if (!started) Snd.music('title'); };
window.addEventListener('pointerdown', unlockAudio, { capture: true }); window.addEventListener('keydown', unlockAudio, { capture: true });
async function boot() {
  await PF.boot();
  PF.onPause = p => { platPaused = p; if (p) PF.flush(); recomputePaused(); };
  PF.onAudio = a => Snd.set({ plat: a });
  Snd.set({ plat: PF.audioOn });
  if (!QS.get('fresh')) { const raw = await PF.load(); if (raw) { try { mergeSave(JSON.parse(raw)); } catch (e) { } } }
  PF.onLate = raw => { if (save.plays) return; try { mergeSave(JSON.parse(raw)); } catch (e) { return; } syncSound(); if (!$('mapCard').hidden) showMaps(); };
  syncSound();
  requestAnimationFrame(() => requestAnimationFrame(() => { PF.ready(); resendScores(); window.__nsdReady = true; }));
}
boot();

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, clock = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const paused = userPaused || tabHidden || platPaused || adBusy || !started;
  recomputePaused();
  document.body.classList.toggle('menu', !started);
  if (!paused) {
    clock += dt;
    if (S.phase === 'running') { acc += dt * speed; let n = 0; while (acc >= D.DT && n < 12) { sim.step(D.DT); acc -= D.DT; n++; } }
    for (const e of sim.drain()) handle(e);
    updateEnemies(dt * (S.phase === 'running' ? speed : 1), clock);
    updateShots(dt, clock);
    updateTowers(dt * speed, clock);
    updateFx(dt * speed);
  }
  updateWorld(dt, clock);
  updateHud();
  if (selSlot != null) { const c = ringPos(); ui.ring.style.left = c.x + 'px'; ui.ring.style.top = c.y + 'px'; const right = c.x < W / 2; ui.info.classList.toggle('side', true); ui.info.classList.toggle('r', right); ui.info.classList.toggle('l', !right); }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('on'); }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// for automated tests only
window.__game = { sim, D, toScreen, stones, get S() { return S; }, get save() { return save; }, play, showMaps, start() { play(game.map, game.endless); }, setSpeed(s) { speed = s; }, zoom(z) { camera.zoom = z; camera.updateProjectionMatrix(); } };
})();
