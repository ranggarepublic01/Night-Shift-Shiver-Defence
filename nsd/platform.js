// ============================================================================
// Night Defenders: Monster Tower Defense — the platform (Playgama Bridge v2, copied from Shiver Night's working layer)
// and the sound (all made in code). Loaded before view.js.
// ============================================================================
// ---------------------------------------------------------------- the platform: Playgama Bridge v2, with a plain-page fallback
// Order matters (Playgama's required steps): initialize first; read the language once; save through Bridge storage (never
// localStorage when Bridge is there); follow pause and audio events; send game_ready when the first playable frame is up.
const PF = (() => {
  const B = () => window.bridge, KEY = 'nightShiftDefense.v1';
  let ok = false, waiter = null, saveTimer = null, pendingSave = null, readySent = false, wantReady = false, loaded = false;
  const out = { language: 'en', audioOn: true, onPause: null, onAudio: null, log: [] };
  const note = s => { try { out.log.push(s); } catch (e) { } };
  out.boot = () => new Promise(res => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    setTimeout(fin, 3500);   // a platform that never answers must not hold the game
    try {
      if (!B() || typeof B().initialize !== 'function') return fin();
      B().initialize().then(() => {
        ok = true; note('initialize');
        try { out.language = String(B().platform.language || 'en').slice(0, 2).toLowerCase(); } catch (e) { }
        try { out.audioOn = B().platform.isAudioEnabled !== false; } catch (e) { }
        try {
          B().platform.on(B().EVENT_NAME.PAUSE_STATE_CHANGED, p => { if (out.onPause) out.onPause(!!p); });
          B().platform.on(B().EVENT_NAME.AUDIO_STATE_CHANGED, a => { out.audioOn = !!a; if (out.onAudio) out.onAudio(out.audioOn); });
        } catch (e) { }
        try {
          if (B().advertisement && B().advertisement.on) B().advertisement.on(B().EVENT_NAME.INTERSTITIAL_STATE_CHANGED, adState);
        } catch (e) { }
        fin();
        if (wantReady) out.ready();   // initialize finished after the title was already up: report ready now
      }).catch(e => { failed = true; note('initialize failed'); fin(); if (wantReady) out.ready(); });
    } catch (e) { fin(); }
  });
  // game_ready: sent once, as soon as the title is up and the Bridge has started. If the Bridge is slow it is sent
  // the moment it finishes; if initialize failed we still try (Bridge's mock platform takes any call safely).
  out.ready = () => {
    wantReady = true; if (readySent) return;
    const b = B(); if (!b || !b.platform || typeof b.platform.sendMessage !== 'function') return;
    if (!ok && !out.initFailed()) return;   // still starting: sent from the initialize callback above
    readySent = true; note('msg:game_ready'); try { const r = b.platform.sendMessage('game_ready'); if (r && r.catch) r.catch(() => { }); } catch (e) { }
  };
  let failed = false; out.initFailed = () => failed;
  out.hasBridge = () => ok;
  // ---- saves: one JSON string under one versioned key
  const lsGet = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const lsSet = s => { try { localStorage.setItem(KEY, s); } catch (e) { } };
  // Storage that never answers (a platform hiccup) must not hold the title screen. After 3 s the game starts with
  // a fresh save; if the real one turns up later it is used as long as the player hasn't played yet (out.onLate).
  out.load = () => {
    if (!(ok && B().storage)) { loaded = true; return Promise.resolve(lsGet()); }
    return new Promise(res => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; note('storage.get timeout'); res(null); } }, 3000);
      B().storage.get([KEY]).then(a => (a && a[0]) || null).catch(() => null).then(v => {
        loaded = true;
        if (!done) { done = true; clearTimeout(t); res(v); } else if (v && out.onLate) out.onLate(v);
      });
    });
  };
  const flushNow = () => {
    if (pendingSave == null) return; const s = pendingSave; pendingSave = null;
    if (ok && B().storage) { note('storage.set'); B().storage.set([KEY], [s]).catch(() => { }); } else lsSet(s);
  };
  out.saveSoon = s => { pendingSave = s; if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flushNow(); }, 400); };
  out.flush = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } flushNow(); };
  // ---- lifecycle messages
  out.msg = (name, data) => { if (!ok) return; try { note('msg:' + name); B().platform.sendMessage(name, data); } catch (e) { } };
  // ---- interstitials: only between nights. Resolves when the ad is over, or straight away when there is none.
  function adState(state) {
    if (!waiter) return; const w = waiter; note('ad:' + state);
    if (state === 'opened') { w.opened = true; clearTimeout(w.t); w.t = setTimeout(() => w.fin(true), 70000); }
    else if (state === 'loading') { clearTimeout(w.t); w.t = setTimeout(() => w.fin(false), 6000); }
    else if (state === 'closed') w.fin(true); else if (state === 'failed') w.fin(false);
  }
  out.interstitial = placement => new Promise(res => {
    if (!ok) return res(false);
    try {
      const A = B().advertisement; if (!A || !A.isInterstitialSupported) return res(false);
      const w = waiter = { opened: false, t: null, fin: v => { if (waiter === w) waiter = null; clearTimeout(w.t); res(v); } };
      w.t = setTimeout(() => w.fin(false), 2200);   // Bridge held it back (too soon after the last one): carry on
      note('showInterstitial'); A.showInterstitial(placement);
    } catch (e) { res(false); }
  });
  // ---- leaderboards
  out.lbType = () => { try { return ok && B().leaderboards ? String(B().leaderboards.type || 'not_available') : 'not_available'; } catch (e) { return 'not_available'; } };
  out.setScore = (id, score) => { if (!ok || out.lbType() === 'not_available') return Promise.resolve(false); note('setScore:' + id); try { return Promise.resolve(B().leaderboards.setScore(id, score)).then(() => true).catch(() => false); } catch (e) { return Promise.resolve(false); } };
  out.entries = id => { try { return Promise.resolve(B().leaderboards.getEntries(id)).catch(() => null); } catch (e) { return Promise.resolve(null); } };
  out.nativePopup = id => { try { return Promise.resolve(B().leaderboards.showNativePopup(id)).catch(() => null); } catch (e) { return Promise.resolve(null); } };
  return out;
})();
const LB_STARS = 'total_stars', LB_ENDLESS = 'endless_waves';   // create these two boards on Playgama after the upload

// ---------------------------------------------------------------- sound: all made in code (Web Audio). No files, no licences.
const Snd = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master, sfxG, musG, ambG, noiseBuf;
  const st = { sfx: true, music: true, plat: true, paused: false, want: false };
  const S5 = [220, 261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
  const M1 = [5, -1, 4, -1, 3, -1, 4, -1, 5, -1, -1, -1, 2, -1, -1, -1, 4, -1, 3, -1, 2, -1, 3, -1, 4, -1, -1, -1, 1, -1, -1, -1];
  const M2 = [5, -1, 6, -1, 7, -1, 6, -1, 5, -1, 4, -1, 3, -1, -1, -1, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1, -1, -1, -1, -1, -1, -1];
  const MEL = M1.concat(M2), BASS = [110, 110, 87.3, 87.3, 98, 98, 82.4, 110];
  const mus = { mode: null, timer: null, step: 0, next: 0, bpm: 84 };
  const ambi = { on: false, timer: null };
  function ensure() {
    if (ctx || !AC) return ctx;
    try { ctx = new AC(); } catch (e) { ctx = null; return null; }
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxG = ctx.createGain(); sfxG.gain.value = st.sfx ? 1 : 0; sfxG.connect(master);
    musG = ctx.createGain(); musG.gain.value = st.music ? 0.55 : 0; musG.connect(master);
    ambG = ctx.createGain(); ambG.gain.value = 0; ambG.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startWind(); return ctx;
  }
  function apply() {
    if (!ctx) return; const want = st.plat && !st.paused;
    if (want && ctx.state === 'suspended') ctx.resume().catch(() => { }); else if (!want && ctx.state === 'running') ctx.suspend().catch(() => { });
  }
  const live = () => !!ctx && ctx.state === 'running';
  function tone(f, t, dur, o) {
    o = o || {}; const os = ctx.createOscillator(), g = ctx.createGain(); os.type = o.type || 'sine';
    os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const v = o.vol == null ? 0.16 : o.vol, a = o.att || 0.008;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = os; if (o.lp) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = o.lp; os.connect(bq); last = bq; }
    last.connect(g); g.connect(o.bus || sfxG); os.start(t); os.stop(t + dur + 0.05);
  }
  function noise(t, dur, o) {
    o = o || {}; const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(); s.buffer = noiseBuf; s.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur); f.Q.value = o.q || 1;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.12, t + (o.att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(o.bus || sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function meow(t, vol, pitch) {   // a cat, from a sawtooth through a formant filter
    const os = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = pitch || 1; os.type = 'sawtooth';
    os.frequency.setValueAtTime(420 * p, t); os.frequency.linearRampToValueAtTime(820 * p, t + 0.16); os.frequency.linearRampToValueAtTime(360 * p, t + 0.55);
    f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1700, t + 0.2); f.frequency.linearRampToValueAtTime(700, t + 0.55); f.Q.value = 3.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.22, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    os.connect(f); f.connect(g); g.connect(sfxG); os.start(t); os.stop(t + 0.65);
  }
  const arp = (t, notes, gap, o) => notes.forEach((n, i) => tone(n, t + i * gap, o && o.dur || 0.16, Object.assign({ type: 'triangle', vol: 0.13 }, o)));
  // the night shift's sounds. Tower shots are soft and short: there are a lot of them.
  const LIB = {
    tap: t => tone(760, t, 0.05, { type: 'triangle', vol: 0.09 }),
    pick: t => { tone(520, t, 0.06, { vol: 0.12 }); tone(780, t + 0.05, 0.08, { vol: 0.1 }); },
    nope: t => tone(210, t, 0.18, { to: 130, type: 'square', vol: 0.08, lp: 900 }),
    build: t => { noise(t, 0.12, { type: 'lowpass', f: 900, to: 300, vol: 0.12 }); arp(t + 0.05, [523, 784], 0.07, { vol: 0.11 }); },
    upgrade: t => arp(t, [659, 880, 1175, 1568], 0.07, { vol: 0.12 }),
    sell: t => { tone(1320, t, 0.05, { type: 'square', vol: 0.05 }); tone(1760, t + 0.055, 0.12, { type: 'square', vol: 0.05 }); },
    bone: t => { tone(900, t, 0.05, { to: 600, type: 'triangle', vol: 0.05 }); noise(t, 0.04, { f: 2500, q: 2, vol: 0.03 }); },
    bats: t => { for (let i = 0; i < 3; i++) noise(t + i * 0.04, 0.03, { f: 1800 + i * 300, q: 3, vol: 0.035 }); },
    breath: t => noise(t, 0.45, { type: 'bandpass', f: 1400, to: 500, q: 0.6, vol: 0.05, att: 0.08 }),
    zap: t => { tone(1200, t, 0.12, { to: 300, type: 'sawtooth', vol: 0.04, lp: 3000 }); noise(t, 0.1, { type: 'highpass', f: 4000, vol: 0.04 }); },
    lob: t => tone(300, t, 0.18, { to: 520, type: 'triangle', vol: 0.06 }),
    burst: t => { noise(t, 0.22, { type: 'lowpass', f: 900, to: 200, vol: 0.12 }); tone(140, t, 0.2, { to: 60, vol: 0.12 }); },
    shoo: t => { tone(1500 + Math.random() * 600, t, 0.07, { vol: 0.045 }); tone(2100 + Math.random() * 600, t + 0.05, 0.08, { vol: 0.035 }); },
    candleOut: t => { noise(t, 0.22, { type: 'highpass', f: 3200, to: 800, vol: 0.09 }); tone(200, t, 0.3, { to: 70, vol: 0.09 }); },
    wave: t => { tone(392, t, 0.25, { type: 'triangle', vol: 0.1 }); tone(523, t + 0.18, 0.4, { type: 'triangle', vol: 0.1 }); },
    rooster: t => { tone(700, t, 0.12, { to: 1100, type: 'sawtooth', vol: 0.04, lp: 2200 }); tone(1100, t + 0.13, 0.35, { to: 800, type: 'sawtooth', vol: 0.04, lp: 2200 }); },
    ring: t => { for (let i = 0; i < 6; i++) tone(i % 2 ? 660 : 880, t + i * 0.055, 0.05, { type: 'square', vol: 0.035, lp: 2500 }); },
    sun: t => { tone(180, t, 1.2, { to: 120, type: 'sawtooth', vol: 0.06, lp: 600, att: 0.2 }); tone(240, t + 0.3, 1.0, { to: 160, type: 'sine', vol: 0.06, att: 0.2 }); },
    early: t => arp(t, [784, 988, 1175], 0.06, { vol: 0.1 }),
    star: t => arp(t, [880, 1108, 1320], 0.07, { type: 'sine', vol: 0.13 }),
    win: t => { arp(t, [523, 659, 784, 1047], 0.1, { vol: 0.14 }); arp(t + 0.5, [784, 1047, 1319], 0.1, { type: 'sine', vol: 0.1, dur: 0.4 }); },
    fail: t => { for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 1100, t + i * 0.12, 0.06, { to: 3000, vol: 0.05 }); arp(t + 0.3, [523, 659, 784], 0.16, { type: 'sine', vol: 0.09, dur: 0.6 }); },
    owl: t => { tone(420, t, 0.28, { vol: 0.05, lp: 700 }); tone(360, t + 0.36, 0.5, { vol: 0.05, lp: 700 }); },
  };
  const lastAt = {};   // the same sound at most every 60 ms, so a big fight doesn't turn into noise
  function play(name) { try { if (!live() || !st.sfx) return; const f = LIB[name], n = ctx.currentTime; if (!f || n - (lastAt[name] || -1) < 0.06) return; lastAt[name] = n; f(n + 0.005); } catch (e) { } }
  // ---- ambience: night wind, a far owl now and then. Fades in with the night and out at dawn.
  function startWind() {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.9;
    lfo.frequency.value = 0.11; lg.gain.value = 0.35; g.gain.value = 0.5; lfo.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(ambG); s.start(); lfo.start();
  }
  function ambient(on) {
    if (!ensure()) return; ambi.on = on; const t = ctx.currentTime;
    ambG.gain.cancelScheduledValues(t); ambG.gain.setValueAtTime(ambG.gain.value, t); ambG.gain.linearRampToValueAtTime(on && st.sfx ? 0.05 : 0, t + (on ? 2.5 : 1.5));
    clearTimeout(ambi.timer); if (on) { const loop = () => { if (!ambi.on) return; if (live()) play('owl'); ambi.timer = setTimeout(loop, 14000 + Math.random() * 14000); }; ambi.timer = setTimeout(loop, 9000); }
  }
  // ---- music: a small spooky-cute loop (A minor pentatonic), plucks and a soft bass. Quiet on purpose.
  function musStep() {
    const i = mus.step % 64, bar = Math.floor(i / 8) % 8, inBar = i % 8, t = mus.next, dur = 60 / mus.bpm / 2;
    const n = MEL[i];
    if (n >= 0) tone(S5[n] * (mus.mode === 'endless' && i % 16 >= 8 ? 2 : 1), t, dur * 1.9, { type: 'triangle', vol: mus.mode === 'title' ? 0.11 : 0.085, lp: 2200, bus: musG });
    if (inBar === 0 || inBar === 4) tone(BASS[bar], t, dur * 3, { type: 'sine', vol: 0.15, bus: musG });
    if (mus.mode !== 'title' && inBar % 2 === 1) noise(t, 0.03, { type: 'highpass', f: 6000, vol: 0.02, bus: musG });
    if (mus.mode === 'endless' && inBar % 2 === 0) tone(S5[(i * 3) % 8] * 2, t, dur * 0.8, { type: 'square', vol: 0.02, lp: 1800, bus: musG });
    mus.step++; mus.next += dur;
  }
  function sched() { if (!live()) return; if (mus.next < ctx.currentTime - 0.4) mus.next = ctx.currentTime + 0.05; while (mus.next < ctx.currentTime + 0.18) musStep(); }
  function music(mode, bpm) {
    mus.bpm = bpm || (mode === 'title' ? 80 : mode === 'endless' ? 104 : 94);
    if (mode === mus.mode) return; mus.mode = mode; clearInterval(mus.timer); mus.timer = null;
    if (!mode || !ensure()) return; mus.step = 0; mus.next = ctx.currentTime + 0.1; mus.timer = setInterval(sched, 40);
  }
  return {
    unlock() { if (ensure()) apply(); },
    play, ambient, music, tempo(b) { mus.bpm = b; },
    set(o) { Object.assign(st, o); if (ctx) { sfxG.gain.value = st.sfx ? 1 : 0; musG.gain.value = st.music ? 0.55 : 0; if (!st.sfx) ambG.gain.value = 0; else if (ambi.on) ambG.gain.value = 0.05; } apply(); },
    get st() { return st; }, apply,
  };
})();

