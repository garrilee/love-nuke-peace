// ===================== 联机：浏览器直连（PeerJS / WebRTC），房主权威 =====================
// 房主的浏览器运行整个世界的模拟（包括 AI），其他玩家只把操作发给房主；
// 房主每秒约 10 次把局面快照发给大家，特效相关的事件实时转发，客户端在本地播放特效。
'use strict';

const PEER_SRC = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ROOM_PREFIX = 'lnp-room-';
const SNAP_EVERY = 0.1;       // 快照间隔（秒）
const MAX_HUMANS = MAX_NATIONS; // 最多 8 个国家（真人 + AI），国家可以重复选
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const NAME_MAX = 20;
// 自定义国家名：去掉可能破坏页面的字符，最多 20 个字（NAME_MAX）
const cleanName = (s) => String(s || '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const SUB_STATES = ['dock', 'out', 'back'];
const P_KINDS = ['rocket', 'ufo', 'conv', 'drone', 'guard'];

// ---------- 飞弹的紧凑编码 ----------
function encProj(p) {
  const flags = (p.launched ? 1 : 0) | (p.locked ? 2 : 0) | (p.engaged ? 4 : 0) | (p.unstop ? 8 : 0) | (p.mirvLead ? 16 : 0) | (p.fade !== undefined ? 32 : 0);
  return [p.id, P_KINDS.indexOf(p.kind), p.lv, p.att, p.tgt, r1(p.fx), r1(p.fy), p.tile.idx, r1(p.tx), r1(p.ty),
    p.arcH === undefined ? -1 : Math.round(p.arcH * 1000) / 1000, r2(p.delay), r2(p.flight), r2(p.t), flags,
    p.mirvOf === undefined ? -1 : p.mirvOf, p.bx === undefined ? 0 : r1(p.bx), p.by === undefined ? 0 : r1(p.by), r2(p.wob || 0)];
}
function decProj(a, o = {}) {
  Object.assign(o, {
    id: a[0], kind: P_KINDS[a[1]], lv: a[2], att: a[3], tgt: a[4], fx: a[5], fy: a[6], tile: G.world.tiles[a[7]], tx: a[8], ty: a[9],
    delay: a[11], flight: a[12], t: a[13], launched: !!(a[14] & 1), locked: !!(a[14] & 2), engaged: !!(a[14] & 4),
    unstop: !!(a[14] & 8), mirvLead: !!(a[14] & 16), fade: (a[14] & 32) ? 0.3 : undefined, done: false,
  });
  if (a[10] >= 0) o.arcH = a[10]; else delete o.arcH;
  o.bx = a[16]; o.by = a[17]; // 分弹头的分离点 / 升空拦截的上一步位置
  if (a[15] >= 0) o.mirvOf = a[15]; else delete o.mirvOf;
  o.wob = a[18] || 0;
  return o;
}
// 客户端：按 id 找到本地已有的飞弹（保留渲染状态），没有就新建
function projFor(a) {
  let p = G.projectiles.find((x) => x.id === a[0]);
  if (!p) { p = decProj(a); G.projectiles.push(p); }
  return p;
}
const dropProj = (p) => { p.done = true; G.projectiles = G.projectiles.filter((x) => x !== p); };

// ---------- 需要转发给客户端的事件：编码 / 解码 ----------
const NO = (i) => (i >= 0 ? G.nations[i] : null);
const projEv = { enc: encProj, dec: (a) => projFor(a) };
const projGoneEv = { enc: encProj, dec: (a) => { const p = projFor(a); setTimeout(() => dropProj(p), 0); return p; } };
const NET_EVENTS = {
  launch: projEv,
  intercept: projGoneEv,
  netMiss: projEv,
  fizzle: projGoneEv,
  shieldBlock: projGoneEv,
  explode: { enc: (e) => [e.tile.idx, e.lv, e.att.id], dec: ([ti, lv, a]) => ({ tile: G.world.tiles[ti], lv, att: G.nations[a] }) },
  convExplode: { enc: (e) => [e.tile.idx, e.att.id], dec: ([ti, a]) => ({ tile: G.world.tiles[ti], att: G.nations[a] }) },
  droneExplode: { enc: (e) => [e.tile.idx, e.att.id], dec: ([ti, a]) => ({ tile: G.world.tiles[ti], att: G.nations[a] }) },
  dogfight: {
    enc: (e) => [encProj(e.a), encProj(e.b), e.ka ? 1 : 0, e.kb ? 1 : 0],
    dec: ([a, b, ka, kb]) => { const pa = projFor(a), pb = projFor(b); setTimeout(() => { if (ka) dropProj(pb); if (kb) dropProj(pa); }, 0); return { a: pa, b: pb, ka: !!ka, kb: !!kb }; },
  },
  scramble: { enc: encProj, dec: (a) => projFor(a) },
  guardGone: { enc: encProj, dec: (a) => { const p = projFor(a); setTimeout(() => dropProj(p), 0); return p; } },
  ciws: { enc: (e) => [e.n.id, encProj(e.p), e.hit ? 1 : 0], dec: ([i, a, hit]) => { const p = projFor(a); if (hit) setTimeout(() => dropProj(p), 0); return { n: G.nations[i], p, hit: !!hit }; } },
  cityHit: { enc: (e) => [e.city.id, r2(e.loss)], dec: ([ci, loss]) => ({ city: G.world.cities[ci], loss }) },
  facDown: { enc: (f) => f.id, dec: (i) => G.world.facilities[i] },
  ult: { enc: (e) => [e.n.id, e.tgt ? e.tgt.id : -1], dec: ([a, b]) => ({ n: G.nations[a], tgt: NO(b) }) },
  midnight: { enc: () => 0, dec: () => { G.midnight = true; return null; } },
  eliminated: {
    enc: (n) => n.id,
    dec: (i) => {
      const n = G.nations[i];
      n.alive = false; n.diedAt = G.t;
      for (const c of n.cities) { c.pop = 0; c.ruined = true; }
      for (const f of n.facilities) f.alive = false;
      n.subs = []; n.ufoReady = 0;
      return n;
    },
  },
  news: { enc: (t) => t, dec: (t) => t },
  banner: { enc: (t) => t, dec: (t) => t },
  leader: { enc: (e) => [e.n.id, e.text, e.to === undefined ? -1 : e.to], dec: ([a, text, to]) => (to >= 0 ? { n: G.nations[a], text, to } : { n: G.nations[a], text }) },
  intel: { enc: (x) => [x.id, x.intelWhy || ''], dec: ([i, why]) => { const x = G.nations[i]; x.intelWhy = why; return x; } },
  targeted: { enc: (e) => [e.n.id, e.tgt.id, e.why], dec: ([a, b, why]) => ({ n: G.nations[a], tgt: G.nations[b], why }) },
  tech: { enc: (e) => [e.n.id, TECHS.indexOf(e.tech)], dec: ([a, k]) => ({ n: G.nations[a], tech: TECHS[k] }) },
  gameover: { enc: (k) => k, dec: (k) => { G.over = k; return k; } },
};

// 房主：所有 Bus 事件照常在本地触发，同时把需要的事件排进发送队列
const busEmitLocal = Bus.emit.bind(Bus);
Bus.emit = (type, data) => {
  busEmitLocal(type, data);
  if (Net.role === 'host' && Net.started && NET_EVENTS[type]) Net.evQ.push([type, NET_EVENTS[type].enc(data)]);
};

const Net = {
  role: 'solo',           // solo | host | client
  peer: null, conns: new Map(), hostConn: null,
  code: '', myId: 'host', players: [], aiCount: 3, diff: 'normal', speed: 1, started: false,
  evQ: [], snapT: 0, ticker: null, allocHold: 0, lastTick: 0, lastFrameAt: 0,

  loadLib() {
    if (window.Peer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEER_SRC;
      s.onload = resolve;
      s.onerror = () => reject(new Error('联机组件加载失败，请检查网络'));
      document.head.appendChild(s);
    });
  },
  newCode() { let c = ''; for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; },
  errText(e) {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '找不到这个房间，请检查房间码';
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return '连不上联机服务器，请检查网络后重试';
    if (t === 'browser-incompatible') return '这个浏览器不支持联机';
    return (e && e.message) || '联机出错了';
  },

  // ---------- 房主 ----------
  async createRoom(race) {
    await this.loadLib();
    this.leave(true);
    return new Promise((resolve, reject) => {
      const tryOpen = (left) => {
        const code = this.newCode();
        const peer = new Peer(ROOM_PREFIX + code);
        peer.on('open', () => {
          Object.assign(this, { peer, role: 'host', code, myId: 'host', started: false, players: [{ id: 'host', race, host: true, name: cleanName(Lobby.nick()) }] });
          peer.on('connection', (c) => this.onConn(c));
          resolve(code);
        });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && left > 0) { peer.destroy(); tryOpen(left - 1); }
          else if (this.peer !== peer) { peer.destroy(); reject(new Error(this.errText(e))); }
          else if (e.type !== 'peer-unavailable') Lobby.error(this.errText(e));
        });
        // 和信令服务器断开不影响已经建立的连接；尝试重连以便新玩家还能加入
        peer.on('disconnected', () => { if (this.peer === peer && !this.started) try { peer.reconnect(); } catch (_) {} });
      };
      tryOpen(3);
    });
  },
  onConn(conn) {
    conn.on('open', () => {
      if (this.started || this.players.length >= MAX_HUMANS) {
        conn.send({ type: 'reject', reason: this.started ? '这局游戏已经开始了' : `房间已满（最多 ${MAX_HUMANS} 人）` });
        setTimeout(() => conn.close(), 600);
        return;
      }
      this.conns.set(conn.peer, conn);
      this.players.push({ id: conn.peer, race: null });
      SFX.click && SFX.ctx && SFX.click();
      this.broadcastLobby();
    });
    conn.on('data', (m) => this.onHostMsg(conn, m));
    conn.on('close', () => this.onLeave(conn.peer));
    conn.on('error', () => this.onLeave(conn.peer));
  },
  onHostMsg(conn, m) {
    const pl = this.players.find((p) => p.id === conn.peer);
    if (!pl || !m) return;
    if (m.type === 'pick' && !this.started) {
      if (RACES.some((r) => r.id === m.race)) pl.race = m.race; // 可以和别人选同一个国家
      if (m.name !== undefined) pl.name = this.uniqueName(pl, m.name);
      this.broadcastLobby();
    } else if (m.type === 'name' && !this.started) {
      pl.name = this.uniqueName(pl, m.name);
      this.broadcastLobby();
    } else if (m.type === 'cmd' && this.started && G) {
      const n = G.nations.find((x) => x.netId === conn.peer);
      if (n && n.isPlayer) execCmd(n, m.cmd);
    }
  },
  onLeave(id) {
    const had = this.conns.delete(id);
    this.players = this.players.filter((p) => p.id !== id);
    if (this.started && G) { // 掉线：由 AI 接管
      const n = G.nations.find((x) => x.netId === id);
      if (n && n.isPlayer) {
        n.isPlayer = false; n.pers = 'steady'; n.aiNext = 1; n.retaliate = null;
        news(`📴 ${n.race.emoji}${n.name} 的玩家掉线了，由 AI 接管`);
      }
    } else if (had) this.broadcastLobby();
  },
  broadcastLobby() {
    const players = this.players.map((p) => ({ id: p.id, race: p.race, host: !!p.host, name: p.name || '' }));
    for (const c of this.conns.values()) if (c.open) c.send({ type: 'lobby', players, aiCount: this.aiCount, diff: this.diff, speed: this.speed, you: c.peer });
    Lobby.render();
  },
  hostPick(race) {
    this.players[0].race = race;
    this.broadcastLobby();
  },
  // 国家名不能和房间里的其他人重复（同一个浏览器开两个页面时，会读到同一个保存的名字）
  uniqueName(pl, name) {
    name = cleanName(name);
    return name && this.players.some((p) => p !== pl && p.name === name) ? '' : name;
  },
  hostName(name) { this.players[0].name = this.uniqueName(this.players[0], name); this.broadcastLobby(); },
  setOpts(aiCount, diff, speed = this.speed) { this.aiCount = aiCount; this.diff = diff; this.speed = speed; this.broadcastLobby(); },
  canStart() { return this.players.length > 0 && this.players.every((p) => p.race); },
  hostStart(tutorial) {
    const players = this.players.map((p) => ({ race: p.race, id: p.id, name: p.name || '' }));
    const aiCount = clamp(this.aiCount, players.length > 1 ? 0 : 1, MAX_NATIONS - players.length);
    this.started = true;
    this.evQ = []; this.snapT = 0;
    startGame(this.players[0].race, aiCount, this.diff, tutorial, { players, me: 'host' });
    G.speed = this.speed;
    const msg = { type: 'start', seed: G.seed, raceIds: G.raceIds, owners: G.owners, names: G.names, diff: this.diff, speed: this.speed };
    for (const c of this.conns.values()) if (c.open) c.send(msg);
    this.startTicker();
  },
  // 每帧：转发事件；每 0.1 秒发一次快照
  hostTick(real) {
    if (!this.started || !G) return;
    if (this.evQ.length) { this.broadcast({ type: 'ev', list: this.evQ }); this.evQ = []; }
    this.snapT -= real;
    if (this.snapT <= 0) { this.snapT = SNAP_EVERY; this.broadcast({ type: 'snap', s: this.snap() }); }
  },
  broadcast(m) { for (const c of this.conns.values()) if (c.open) { try { c.send(m); } catch (_) {} } },
  // 房主切到后台时浏览器会暂停画面刷新：用 Worker 计时器继续推进世界，别让所有人卡住
  startTicker() {
    if (this.ticker) return;
    try {
      const url = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 50);'], { type: 'text/javascript' }));
      this.ticker = new Worker(url);
      this.lastTick = performance.now();
      this.ticker.onmessage = () => {
        const now = performance.now(), real = Math.min(0.25, (now - this.lastTick) / 1000);
        this.lastTick = now;
        // 画面在正常刷新时由 frame() 推进；刷新停了（切到后台、窗口被遮住）才由这里接手
        if (this.role !== 'host' || !running || !G || now - this.lastFrameAt < 250) return;
        simAdvance(real);
        FX.update(real);
        this.hostTick(real);
      };
    } catch (_) { this.ticker = null; }
  },

  snap() {
    const W = G.world, rad = [];
    for (const t of W.tiles) if (t.rad > 0.01) rad.push(t.idx, r2(t.rad));
    return {
      t: r2(G.t), m: G.midnight ? 1 : 0, sp: G.speed,
      n: G.nations.map((n) => ({
        a: n.alive ? 1 : 0, h: n.isPlayer ? 1 : 0, ti: n.techIdx, tp: r1(n.techPts), b: r1(n.bank), e: r1(n.energy),
        pc: [1, 2, 3, 4, 5].map((k) => n.parcels[k]), cv: n.conv, cc: r1(n.convCd), cb: r1(n.convBuildT || 0), ht: r2(n.heat),
        dr: n.drones, dc: r1(n.droneCd), db: r1(n.droneBuildT), aC: n.autoCiws ? 1 : 0, aS: n.autoScramble ? 1 : 0, da: n.diedAt === undefined ? -1 : r1(n.diedAt),
        sT: r1(n.shieldT), sC: r1(n.shieldCd), nT: r1(n.netT), nC: r1(n.netCd), nq: n.netCharges,
        uC: r1(n.ultCd), oT: r1(n.overtimeT), hT: r1(n.harpoonT), kT: r1(n.hackT),
        iU: r1(n.intelUntil), iW: n.intelWhy || '', an: n.anger.map((v) => Math.round(v)), la: r1(n.lastAttack), lh: r1(n.lastHit),
        ha: Object.fromEntries(Object.entries(n.hostileAt).map(([k, v]) => [k, r1(v)])),
        u: n.ufoReady, ur: n.ufoReturn.length, sb: n.subs.map((s) => [SUB_STATES.indexOf(s.state), s.tile.idx, s.rockets]),
        al: [r2(n.alloc.tech), r2(n.alloc.nuke), r2(n.alloc.def)], st: n.stats, re: n.rocketEra ? 1 : 0, aN: n.autoNet ? 1 : 0, aR: n.autoRebuild ? 1 : 0,
      })),
      c: W.cities.map((c) => [r2(c.pop), c.ruined ? 1 : 0, r1(c.rebuild)]),
      f: W.facilities.map((f) => [f.alive ? 1 : 0, r1(f.rebuild), f.missiles]),
      r: rad,
      p: G.projectiles.filter((p) => !p.done).map(encProj),
    };
  },

  // ---------- 客户端 ----------
  async joinRoom(code, race) {
    code = (code || '').trim().toUpperCase();
    if (code.length < 4) throw new Error('请输入房间码');
    await this.loadLib();
    this.leave(true);
    return new Promise((resolve, reject) => {
      const peer = new Peer();
      let done = false;
      const fail = (msg) => { if (done) return; done = true; try { peer.destroy(); } catch (_) {} reject(new Error(msg)); };
      const timer = setTimeout(() => fail('连接超时：找不到房间，或者网络不支持直连'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
        conn.on('open', () => {
          if (done) return;
          done = true; clearTimeout(timer);
          Object.assign(this, { peer, hostConn: conn, role: 'client', code, started: false, players: [] });
          conn.send({ type: 'pick', race: race || null, name: Lobby.nick() });
          resolve(code);
        });
        conn.on('data', (m) => this.onClientMsg(m));
        conn.on('close', () => this.onHostLost());
        conn.on('error', () => this.onHostLost());
      });
      peer.on('error', (e) => { if (!done) { clearTimeout(timer); fail(this.errText(e)); } else if (this.role === 'client' && e.type !== 'peer-unavailable') Lobby.error(this.errText(e)); });
    });
  },
  send(m) { if (this.hostConn && this.hostConn.open) this.hostConn.send(m); },
  onClientMsg(m) {
    if (!m) return;
    if (m.type === 'lobby') {
      Object.assign(this, { players: m.players, myId: m.you, aiCount: m.aiCount, diff: m.diff, speed: m.speed || 1 });
      Lobby.checkName();
      Lobby.render();
    } else if (m.type === 'reject') {
      this.leave(true); Lobby.error(m.reason); Lobby.render();
    } else if (m.type === 'start') {
      const me = this.players.find((p) => p.id === this.myId);
      if (!me || !me.race) return;
      this.started = true;
      startGame(me.race, 0, m.diff, Lobby.tutorial(), { seed: m.seed, raceIds: m.raceIds, owners: m.owners, names: m.names, me: this.myId });
    } else if (m.type === 'snap') {
      if (G && this.started) this.applySnap(m.s);
    } else if (m.type === 'ev') {
      if (!G || !this.started) return;
      for (const [type, d] of m.list) {
        const codec = NET_EVENTS[type];
        if (codec) busEmitLocal(type, codec.dec(d));
      }
    }
  },
  onHostLost() {
    if (this.role !== 'client') return;
    const inGame = this.started && G && !G.over;
    this.leave(true);
    if (inGame) { G.over = 'disconnected'; UI.showEnd('disconnected'); }
    else { Lobby.error('和房主的连接断开了'); Lobby.render(); }
  },
  // 客户端每帧：本地推进时间和飞弹进度，让画面平滑；下一份快照到达时校正
  clientAdvance(real) {
    if (G.over) return;
    const dt = real * (G.speed || 1); // 和房主同样的游戏速度推进
    G.t += dt;
    for (const p of G.projectiles) p.t += dt;
    G.interp = 0;
  },
  applySnap(s) {
    const W = G.world;
    G.t = s.t; G.midnight = !!s.m; if (s.sp) G.speed = s.sp;
    s.n.forEach((d, i) => {
      const n = G.nations[i];
      Object.assign(n, {
        alive: !!d.a, isPlayer: !!d.h, techIdx: d.ti, techPts: d.tp, bank: d.b, energy: d.e,
        conv: d.cv, convCd: d.cc, convBuildT: d.cb, heat: d.ht, shieldT: d.sT, shieldCd: d.sC, netT: d.nT, netCd: d.nC, netCharges: d.nq,
        ultCd: d.uC, overtimeT: d.oT, harpoonT: d.hT, hackT: d.kT, intelUntil: d.iU, intelWhy: d.iW, anger: d.an,
        lastAttack: d.la, lastHit: d.lh, hostileAt: d.ha || {}, ufoReady: d.u, ufoReturn: new Array(d.ur).fill(0), stats: d.st,
        autoNet: !!d.aN, autoRebuild: !!d.aR, rocketEra: !!d.re,
        drones: d.dr, droneCd: d.dc, droneBuildT: d.db, autoCiws: !!d.aC, autoScramble: !!d.aS, diedAt: d.da >= 0 ? d.da : undefined,
      });
      d.pc.forEach((v, k) => { n.parcels[k + 1] = v; });
      n.subs = d.sb.map(([st, ti, rk]) => ({ state: SUB_STATES[st], tile: W.tiles[ti], rockets: rk, timer: 0 }));
      // 自己刚拖过滑条：短时间内以本地为准，避免滑条来回跳
      if (n !== G.player || performance.now() > this.allocHold) n.alloc = { tech: d.al[0], nuke: d.al[1], def: d.al[2] };
    });
    s.c.forEach(([pop, ruined, rebuild], i) => { const c = W.cities[i]; c.pop = pop; c.ruined = !!ruined; c.rebuild = rebuild; });
    s.f.forEach(([alive, rebuild, missiles], i) => { const f = W.facilities[i]; f.alive = !!alive; f.rebuild = rebuild; f.missiles = missiles; });
    for (const t of W.tiles) t.rad = 0;
    for (let i = 0; i < s.r.length; i += 2) W.tiles[s.r[i]].rad = s.r[i + 1];
    const old = new Map(G.projectiles.map((p) => [p.id, p]));
    G.projectiles = s.p.map((a) => decProj(a, old.get(a[0])));
  },

  leave(silent) {
    try { if (this.peer) this.peer.destroy(); } catch (_) {}
    if (this.ticker) { this.ticker.terminate(); this.ticker = null; }
    Object.assign(this, { role: 'solo', peer: null, hostConn: null, code: '', players: [], started: false, evQ: [] });
    this.conns = new Map();
    if (!silent) Lobby.render();
  },
};

// ===================== 开始界面里的联机大厅 =====================
const Lobby = {
  busy: false,
  init() {
    $('mpCreate').onclick = () => this.create();
    $('mpJoin').onclick = () => this.join();
    $('mpCode').onkeydown = (e) => { if (e.key === 'Enter') this.join(); };
    $('mpName').value = '';
    let nameTimer = 0;
    $('mpName').oninput = () => {
      this.autoName = false; // 玩家自己改过名字，换国家时不再自动替换
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => this.sendName(cleanName($('mpName').value)), 300);
    };
    $('mpLeave').onclick = () => { Net.leave(); this.error(''); history.replaceState(null, '', location.pathname); };
    $('mpCopy').onclick = () => {
      const link = `${location.origin}${location.pathname}?room=${Net.code}`;
      const ok = () => { $('mpCopy').textContent = '已复制 ✔'; setTimeout(() => { $('mpCopy').textContent = '复制邀请链接'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(ok, () => prompt('复制这个链接发给朋友：', link));
      else prompt('复制这个链接发给朋友：', link);
    };
    const opts = () => { if (Net.role === 'host') Net.setOpts(+$('aiCount').value, $('aiDiff').value, +$('mpSpeed').value); };
    for (const id of ['aiCount', 'aiDiff', 'mpSpeed']) $(id).addEventListener('change', opts);
    $('mpSpeed').value = String(Store.get('mpSpeed', 1));
    $('mpSpeed').addEventListener('change', () => Store.set('mpSpeed', +$('mpSpeed').value));
    // 通过邀请链接打开：自动加入房间
    const room = new URLSearchParams(location.search).get('room');
    if (room) { $('mpCode').value = room.toUpperCase(); this.join(); }
    this.render();
  },
  autoName: false,   // 输入框里的名字是自动填的国家默认名
  filledFor: null,   // 已经为哪个国家自动填过名字
  tutorial() { return $('tutorial').checked; },
  sendName(name) {
    if (Net.role === 'host') { Net.hostName(name); this.checkName(); }
    else if (Net.role === 'client') Net.send({ type: 'name', name });
  },
  // 选好（或换了）国家、而名字还空着或是自动填的：填上这个国家的默认名，玩家可以再改
  syncAutoName() {
    const me = Net.players.find((p) => p.id === Net.myId);
    if (!me || !me.race || me.race === this.filledFor) return;
    this.filledFor = me.race;
    const el = $('mpName'), base = RACES.find((r) => r.id === me.race).name;
    if (el.value.trim() && !this.autoName) return;
    // 和别人选了同一个国家：默认名自动加序号（卷王二、卷王三……）
    const rn = DUP_SUFFIX.map((s) => base + s).find((nm) => !Net.players.some((p) => p !== me && p.name === nm)) || base;
    el.value = rn; this.autoName = true; el.placeholder = '给你的国家起个名字';
    if (me.name !== rn) this.sendName(rn);
  },
  resetName() { $('mpName').value = ''; $('mpName').placeholder = '给你的国家起个名字'; this.autoName = false; this.filledFor = null; },
  nick() { return cleanName($('mpName') ? $('mpName').value : ''); },
  // 输入框里的名字被房主拒绝（和别人重名）：清空输入框并提示
  checkName() {
    const me = Net.players.find((p) => p.id === Net.myId), typed = this.nick();
    if (!me || !typed) return;
    if (me.name === typed) { $('mpName').placeholder = '给你的国家起个名字'; return; }
    if (Net.players.some((p) => p !== me && p.name === typed)) {
      $('mpName').value = me.name || ''; this.autoName = false;
      $('mpName').placeholder = `「${typed}」已被占用，换一个吧`;
    }
  },
  error(msg) { $('mpErr').textContent = msg || ''; },
  async create() {
    if (this.busy) return;
    this.busy = true; this.error(''); $('mpCreate').textContent = '创建中…';
    this.resetName();
    try {
      await Net.createRoom(UI.pickedRace);
      Net.aiCount = +$('aiCount').value; Net.diff = $('aiDiff').value; Net.speed = +$('mpSpeed').value;
      history.replaceState(null, '', `?room=${Net.code}`);
    } catch (e) { this.error(e.message); }
    this.busy = false; $('mpCreate').textContent = '🌐 创建房间';
    this.render();
  },
  async join() {
    if (this.busy) return;
    this.busy = true; this.error(''); $('mpJoin').textContent = '连接中…';
    this.resetName();
    try { await Net.joinRoom($('mpCode').value, UI.pickedRace); } catch (e) { this.error(e.message); }
    this.busy = false; $('mpJoin').textContent = '加入';
    this.render();
  },
  // 选国家：联机时交给房主分配（不能和别人重复）
  pick(race) {
    if (Net.role === 'host') Net.hostPick(race);
    else if (Net.role === 'client') Net.send({ type: 'pick', race });
  },
  start() {
    if (Net.role === 'host') { if (Net.canStart()) Net.hostStart(this.tutorial()); }
    else if (Net.role === 'solo' && UI.pickedRace) UI.startSolo();
  },
  render() {
    if (!$('mpBox')) return;
    const inRoom = Net.role !== 'solo';
    $('mpIdle').classList.toggle('hidden', inRoom);
    $('mpRoom').classList.toggle('hidden', !inRoom);
    document.body.classList.toggle('inroom', inRoom);
    const btn = $('startBtn');
    const mine = inRoom ? Net.players.find((p) => p.id === Net.myId) : null;
    // 国家卡片：高亮自己选的；联机时可以和别人选同一个国家
    document.querySelectorAll('.race').forEach((d) => {
      d.classList.remove('taken');
      if (inRoom) d.classList.toggle('sel', !!mine && mine.race === d.dataset.id);
    });
    if (!inRoom) {
      btn.textContent = '按下按钮，开始核平';
      btn.disabled = !UI.pickedRace;
      $('aiCount').disabled = $('aiDiff').disabled = false;
      return;
    }
    $('mpCodeTxt').textContent = Net.code;
    this.syncAutoName();
    $('mpPlayers').innerHTML = Net.players.map((p) => {
      const r = RACES.find((x) => x.id === p.race), nm = cleanName(p.name);
      return `<div class="mp-pl${p.id === Net.myId ? ' me' : ''}" style="--c:${r ? r.color : '#7f93aa'}">
        <span class="emo">${r ? r.emoji : '❔'}</span><b>${nm || (r ? r.name : '还没选国家')}</b>${nm && r ? `<span class="dim small">${r.name}</span>` : ''}
        ${p.host ? '<span class="tag">房主</span>' : ''}${p.id === Net.myId ? '<span class="tag me">你</span>' : ''}</div>`;
    }).join('');
    const humans = Net.players.length;
    const ai = clamp(Net.aiCount, humans > 1 ? 0 : 1, MAX_NATIONS - humans);
    $('aiCount').value = String(Net.aiCount); $('aiDiff').value = Net.diff; $('mpSpeed').value = String(Net.speed);
    $('aiCount').disabled = $('aiDiff').disabled = $('mpSpeed').disabled = Net.role !== 'host';
    if (Net.role === 'host') {
      const ok = Net.canStart();
      btn.disabled = !ok;
      btn.textContent = ok ? `开始联机（${humans} 人 + ${ai} 个 AI）` : '等待所有人选好国家…';
      $('mpHint').textContent = humans < 2 ? '把房间码或邀请链接发给朋友，对方点「加入」即可。' : '所有人选好国家后，由你开始游戏。';
    } else {
      btn.disabled = true;
      btn.textContent = mine && mine.race ? '等待房主开始…' : '先选一个国家';
      $('mpHint').textContent = `已加入房间，AI ${ai} 个 · 难度 ${DIFFS[Net.diff].name} · 速度 ${Net.speed}×`;
    }
  },
};
