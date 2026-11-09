// ===================== 合成音效与背景音乐（WebAudio，无外部资源）=====================
'use strict';

const SFX = {
  ctx: null, master: null, sfxBus: null, musicBus: null, reverb: null,
  muted: false, brown: null, white: null, lastBoom: 0,
  musicOn: false, musicTimer: null, nextBeat: 0, nextChord: 0, nextNote: 0, chordIdx: 0,
  drone: null, tense: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = c.createGain(); this.master.gain.value = 0.8;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
      // 末端限幅器：防止多层叠加后削波失真（削波会产生“破”的声音）
      const limiter = c.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.15;
      const outGain = c.createGain(); outGain.gain.value = 0.9;
      this.master.connect(comp); comp.connect(limiter); limiter.connect(outGain); outGain.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.22; this.musicBus.connect(this.master);
      // 混响：程序生成的“暗”衰减脉冲（平滑过的噪声，避免金属感），前面再加低通
      this.reverbConv = c.createConvolver();
      const len = c.sampleRate * 4.5, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          lp += ((Math.random() * 2 - 1) - lp) * 0.08; // 一阶低通，去掉高频
          d[i] = lp * 3 * Math.pow(1 - i / len, 2.2);
        }
      }
      this.reverbConv.buffer = ir;
      this.reverb = c.createBiquadFilter(); this.reverb.type = 'lowpass'; this.reverb.frequency.value = 700;
      this.reverb.connect(this.reverbConv);
      const rvGain = c.createGain(); rvGain.gain.value = 0.7;
      this.reverbConv.connect(rvGain); rvGain.connect(this.master);
      // 爆炸专用总线：柔和饱和（增加厚度）→ 低通（去掉刺耳高频）
      this.boomBus = c.createGain(); this.boomBus.gain.value = 0.45;
      const makeup = c.createGain(); makeup.gain.value = 1.1;
      const sat = c.createWaveShaper();
      const curve = new Float32Array(2048);
      for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); }
      sat.curve = curve; sat.oversample = '4x';
      const boomLp = c.createBiquadFilter(); boomLp.type = 'lowpass'; boomLp.frequency.value = 2200; boomLp.Q.value = 0.5;
      this.boomBus.connect(sat); sat.connect(boomLp); boomLp.connect(makeup); makeup.connect(this.sfxBus);
      // 噪声
      const n = c.sampleRate * 6;
      this.brown = c.createBuffer(1, n, c.sampleRate);
      this.white = c.createBuffer(1, n, c.sampleRate);
      const b = this.brown.getChannelData(0), w = this.white.getChannelData(0);
      let last = 0;
      for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; w[i] = r; last = (last + 0.02 * r) / 1.02; b[i] = last * 3.5; }
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },

  // ---- 基础构件 ----
  _env(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  _noise(buf, t, dur, type, f0, f1, peak, attack = 0.01, dest = this.sfxBus, send = 0.3, pan = 0) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = type === 'lowpass' ? 0.6 : 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); this._env(g, t, peak, attack, dur);
    src.connect(f); f.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); }
    else g.connect(dest);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.reverb); }
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.1);
  },
  _tone(type, t, f0, f1, dur, peak, attack = 0.005, dest = this.sfxBus, send = 0) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = c.createGain(); this._env(g, t, peak, attack, dur);
    o.connect(g); g.connect(dest);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.reverb); }
    o.start(t); o.stop(t + dur + 0.05);
  },

  // ---- 爆炸：爆裂声 + 冲击重击 + 低频主体 + 次声 + 长尾隆隆声 + 混响 ----
  boom(scale, near = true) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    if (now - this.lastBoom < 0.06) return;
    this.lastBoom = now;
    const s = clamp(scale, 0.5, 4.5);
    const v = (near ? 1 : 0.4) * Math.min(1.2, 0.45 + s * 0.22);
    const t = now + (s > 4 ? 0.9 : 0) + (near ? 0 : 0.25); // 沙皇级：先寂静；远处：声音晚到
    const lp = near ? 1 : 0.4;                            // 远处的爆炸更闷
    const B = this.boomBus;
    // 1. 起爆：低通的宽频冲击（像空气被猛地推开，而不是金属撞击）
    this._noise(this.white, t, 0.35, 'lowpass', 2600 * lp, 300, v * 0.55, 0.004, B, 0.5, -0.3);
    this._noise(this.white, t + 0.012, 0.35, 'lowpass', 2400 * lp, 280, v * 0.55, 0.004, B, 0.5, 0.3);
    // 2. 胸口的重击：纯正弦，低频、衰减慢
    this._tone('sine', t, 120, 32, 0.9 + s * 0.15, v * 1.3, 0.004, B);
    this._tone('sine', t + 0.01, 62, 26, 1.6 + s * 0.3, v * 1.0, 0.01, B);
    // 3. 主体轰鸣：两层左右分开的棕噪声 + 一层更密的低通白噪声
    const body = 2.2 + s * 1.4;
    this._noise(this.brown, t, body, 'lowpass', 900 * lp, 55, v * 1.4, 0.015, B, 0.6, -0.45);
    this._noise(this.brown, t + 0.02, body, 'lowpass', 850 * lp, 50, v * 1.4, 0.015, B, 0.6, 0.45);
    this._noise(this.white, t, body * 0.7, 'lowpass', 600 * lp, 70, v * 0.45, 0.02, B, 0.5);
    // 中低频“咆哮”层：让笔记本小喇叭也能感到厚度（200~500Hz，不含刺耳高频）
    this._noise(this.brown, t + 0.01, body * 0.8, 'bandpass', 380 * lp, 160, v * 1.1, 0.02, B, 0.5, -0.2);
    this._noise(this.brown, t + 0.03, body * 0.8, 'bandpass', 300 * lp, 130, v * 1.1, 0.02, B, 0.5, 0.2);
    // 4. 次声：长而深，能“压”住整个画面
    this._tone('sine', t + 0.04, 48, 18, 3 + s * 1.4, v * 1.1, 0.08, B);
    // 5. 隆隆长尾：缓慢起伏的低频，像大地在回响
    const tail = 4.5 + s * 2.2;
    this._noise(this.brown, t + 0.35, tail, 'lowpass', 260, 40, v * 0.9, 0.7, B, 0.7, -0.35);
    this._noise(this.brown, t + 0.5, tail, 'lowpass', 240, 38, v * 0.9, 0.8, B, 0.7, 0.35);
    if (s >= 2.5) { // 大当量：第二波冲击 + 低沉的崩塌碎石声
      this._tone('sine', t + 0.4, 85, 24, 1.8, v * 0.9, 0.02, B);
      this._noise(this.brown, t + 0.42, 1.8, 'lowpass', 700, 60, v * 0.8, 0.03, B, 0.5);
      for (let i = 0; i < 5; i++) this._noise(this.brown, t + 0.8 + Math.random() * 2, 0.5, 'bandpass', 320, 140, v * 0.25, 0.02, B, 0.5, Math.random() * 1.2 - 0.6);
    }
  },
  // 常规导弹：短促、扎实的爆炸，不带长尾
  blast(near) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.lastBlast || 0) < 0.05) return;
    this.lastBlast = now;
    const v = near ? 0.55 : 0.18, B = this.boomBus, t = now + (near ? 0 : 0.15);
    const pan = Math.random() * 0.8 - 0.4;
    this._noise(this.white, t, 0.25, 'lowpass', near ? 2800 : 1200, 300, v * 0.5, 0.003, B, 0.35, pan);
    this._tone('sine', t, 130, 45, 0.45, v * 1.1, 0.003, B);
    this._noise(this.brown, t, 1.1, 'lowpass', near ? 900 : 400, 70, v * 1.0, 0.01, B, 0.4, pan);
    this._noise(this.brown, t + 0.01, 0.8, 'bandpass', 320, 150, v * 0.7, 0.01, B, 0.3, -pan);
  },
  launch() { if (this.ctx) this._noise(this.white, this.ctx.currentTime, 1.4, 'bandpass', 300, 2200, 0.1, 0.05, this.sfxBus, 0.3); },
  intercept() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(this.white, t, 0.3, 'highpass', 3000, 900, 0.18, 0.002);
    for (let i = 0; i < 6; i++) this._noise(this.white, t + 0.2 + Math.random() * 0.8, 0.06, 'bandpass', 3500, 2500, 0.06, 0.002);
  },
  click() { if (this.ctx) this._tone('sine', this.ctx.currentTime, 880, 860, 0.08, 0.05); },
  // 来袭提示：短促的双音，每一波只响一次
  alert() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      this._tone('square', t + i * 0.22, 988, 980, 0.16, 0.05);
      this._tone('square', t + i * 0.22 + 0.1, 740, 735, 0.12, 0.04);
    }
  },
  siren() {}, // 兼容旧调用
  ciws(hit) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this._noise(this.white, t + i * 0.04, 0.03, 'bandpass', 2400, 1800, 0.04, 0.001);
    if (hit) this._noise(this.white, t + 0.12, 0.12, 'lowpass', 1600, 400, 0.08, 0.002);
  },
  // 午夜倒计时：清脆的钟表滴答
  tick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone('square', t, 1760, 1700, 0.05, 0.05);
    this._tone('sine', t, 440, 430, 0.25, 0.08, 0.002, this.sfxBus, 0.4);
  },
  // 午夜钟声：三声低沉的钟
  bell() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 1.1;
      for (const [f, a] of [[98, 0.32], [196, 0.16], [293.7, 0.08], [466, 0.05]]) this._tone('sine', t0, f, f * 0.995, 3.2, a, 0.004, this.sfxBus, 0.7);
    }
    // 音乐转入午夜：低音下沉半音，更压抑
    if (this.drone) this.drone.oscs.forEach((o, i) => o.frequency.setTargetAtTime([51.9, 52.3, 77.8][i], t, 2));
  },
  // 东风落地前：越来越尖的呼啸
  riser() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(this.white, t, 1.4, 'bandpass', 400, 5000, 0.22, 0.9, this.sfxBus, 0.5);
    this._tone('sawtooth', t, 120, 900, 1.3, 0.05, 1.0, this.sfxBus, 0.4);
  },
  // 国家大招：上行的三音
  ult() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this._tone('triangle', t + i * 0.07, f, f, 0.5, 0.07, 0.005, this.sfxBus, 0.5));
    this._noise(this.white, t, 0.6, 'highpass', 2000, 6000, 0.06, 0.05);
  },

  // ---- 背景音乐：低沉的末日氛围 + 末日时钟滴答 + 来袭时心跳 ----
  music(on) {
    if (!this.ctx) return;
    if (on && !this.musicOn) {
      this.musicOn = true;
      const c = this.ctx, t = c.currentTime;
      const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(1, t + 4);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260; f.Q.value = 4;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
      const lg = c.createGain(); lg.gain.value = 120;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      const oscs = [55, 55.4, 82.4].map((fr) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
        const g = c.createGain(); g.gain.value = 0.18; o.connect(g); g.connect(f); o.start(); return o;
      });
      f.connect(out); out.connect(this.musicBus);
      this.drone = { out, f, lfo, oscs };
      this.nextBeat = this.nextChord = this.nextNote = t + 0.5;
      this.musicTimer = setInterval(() => this._schedule(), 200);
    } else if (!on && this.musicOn) {
      this.musicOn = false;
      clearInterval(this.musicTimer);
      const t = this.ctx.currentTime, d = this.drone;
      d.out.gain.cancelScheduledValues(t); d.out.gain.setValueAtTime(d.out.gain.value, t);
      d.out.gain.exponentialRampToValueAtTime(0.0001, t + 2);
      setTimeout(() => { d.oscs.forEach((o) => o.stop()); d.lfo.stop(); }, 2200);
    }
  },
  tension(on) {
    if (this.tense === on || !this.drone) return;
    this.tense = on;
    const t = this.ctx.currentTime;
    this.drone.f.frequency.cancelScheduledValues(t);
    this.drone.f.frequency.setTargetAtTime(on ? 520 : 260, t, 0.8);
  },
  _schedule() {
    const c = this.ctx, ahead = c.currentTime + 0.6;
    const late = typeof G !== 'undefined' && G && G.midnight;
    const CHORDS = [[110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8], [82.4, 103.8, 123.5]]; // Am F G E
    const PENTA = [220, 261.6, 293.7, 329.6, 392, 440];
    // 和弦铺底
    while (this.nextChord < ahead) {
      const ch = CHORDS[this.chordIdx++ % CHORDS.length];
      for (const fr of ch) this._tone('triangle', this.nextChord, fr, fr, 8.5, 0.05, 2.5, this.musicBus, 0.6);
      this.nextChord += 8;
    }
    // 末日时钟滴答 / 心跳
    const beat = late ? 0.5 : this.tense ? 0.75 : 1.0;
    while (this.nextBeat < ahead) {
      const t = this.nextBeat;
      this._noise(this.white, t, 0.03, 'highpass', 6000, 5000, 0.05, 0.001, this.musicBus, 0);
      if (this.tense || late) {
        this._tone('sine', t, 70, 40, 0.18, 0.5, 0.003, this.musicBus);
        this._tone('sine', t + 0.2, 65, 38, 0.16, 0.35, 0.003, this.musicBus);
      }
      this.nextBeat += beat;
    }
    // 稀疏的旋律
    while (this.nextNote < ahead) {
      const fr = PENTA[Math.floor(Math.random() * PENTA.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      this._tone('sine', this.nextNote, fr, fr, 2.2, 0.06, 0.02, this.musicBus, 0.8);
      this.nextNote += 2 + Math.random() * 3.5;
    }
  },
};
