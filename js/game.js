/* ============================================================
   game.js — states, camera, transitions, rendering, HUD, shop.
   ============================================================ */
'use strict';

const G = {
  state: 'load', t: 0, dt: 0,
  room: null, roomId: null,
  player: null,
  enemies: [], coins: [], projectiles: [], particles: [], texts: [], items: [],
  cam: { x: 0, y: 0, ax: 0, ay: 0 },
  shakeAmt: 0, flashAmt: 0, hitStopT: 0,
  stats: { coins: 0, kills: 0, time: 0, deaths: 0 },
  clickAttack: false,
  bossFight: false, boss: null,
  roomFlags: {},
  flags: {},
  bannerTxt: '', bannerT: 0,
  trans: null, swallowed: null, escaped: null, acid: null, acidBurnT: 0,
  relicShow: null,
  shopOpen: false, shopSel: -1,
  level: 0, unlocked: 1, cleared: [false, false, false], levelState: {},
  mapSel: -1, mapT: 0, levelClearT: 0,
  combo: 0, comboT: 0, comboBest: 0,
  waves: [],
  codes: { found: {}, used: {}, tickets: 0, admin: false },
  codesOpen: false, codeBuf: '', codeMsg: '', codeMsgT: 0, codeMsgOk: false,
  codeKeyHit: null, codeKeyFlash: 0, codeKeyOver: null,
  mobile: false, settingsOpen: false, padOn: {},
  tutorialDone: false, mapMode: 'realm',
  tut: { move: 0, fight: 0, swim: 0, dash: 0, pierce: 0, climb: 0, parry: 0 },
  aimX: VW * 0.62, aimY: VH * 0.40, aimDrag: null, aimGrabT: 0,

  chapter: 0, mapScroll: 0, mapScrollT: 0, unlockAnim: null,
  deathT: 0, victoryT: 0,
  lockedMsgT: 0,
  audioHint: true,

  /* which of the three save files is in play, and what the player chose in settings */
  slot: 0, fileSel: -1, eraseArm: -1,
  opts: { mobile: null, music: 0.7, sfx: 0.8, padAlpha: 0.5, keys: null },
  setTab: 0, setSel: -1, setDrag: null, setStep: -1, bindWait: null
};

/* ============================================================
   OPTIONS — volumes, touch opacity and keybinds, kept on the machine
   ============================================================ */
const OPT_KEY = 'emberwood.opts.v1';
const SLOT_KEY = 'emberwood.slot.v1';
const SAVE_KEY = 'emberwood.save.v1.';
const SLOTS = 3;

function applyOptions() {
  Snd.setMusicVolume(G.opts.music);
  Snd.setSfxVolume(G.opts.sfx);
  for (const a of ACTIONS) KEYS[a.key] = (G.opts.keys && G.opts.keys[a.key]) || DEFAULT_KEYS[a.key];
  if (typeof G.opts.mobile === 'boolean') G.mobile = G.opts.mobile;
  Screen.wantFull = G.mobile;
  if (Screen.resize) Screen.resize();
}
function loadOptions() {
  const o = Store.read(OPT_KEY, null);
  if (o) {
    if (typeof o.mobile === 'boolean') G.opts.mobile = o.mobile;
    if (typeof o.music === 'number') G.opts.music = clamp(o.music, 0, 1);
    if (typeof o.sfx === 'number') G.opts.sfx = clamp(o.sfx, 0, 1);
    if (typeof o.padAlpha === 'number') G.opts.padAlpha = clamp(o.padAlpha, 0.12, 1);
    if (o.keys) G.opts.keys = o.keys;
  }
  applyOptions();
}
function saveOptions() {
  const keys = {};
  for (const a of ACTIONS) keys[a.key] = KEYS[a.key];
  G.opts.keys = keys;
  G.opts.mobile = G.mobile;
  Store.write(OPT_KEY, G.opts);
}

/* ============================================================
   SAVE FILES — three of them, each with its own progress
   ============================================================ */
/* the coin flags are Sets, which JSON cannot carry, so they travel as lists */
function packFlags(rf) {
  const out = {};
  for (const id in rf) out[id] = { coins: Array.from((rf[id] && rf[id].coins) || []) };
  return out;
}
function unpackFlags(o) {
  const out = {};
  for (const id in (o || {})) out[id] = { coins: new Set((o[id] && o[id].coins) || []) };
  return out;
}
function packSave() {
  const p = G.player;
  const ls = {};
  for (const k in G.levelState) {
    const st = G.levelState[k];
    ls[k] = { roomId: st.roomId, x: st.x, y: st.y, hp: st.hp,
              roomFlags: packFlags(st.roomFlags), flags: st.flags };
  }
  return {
    v: 1, used: true,
    tutorialDone: G.tutorialDone,
    unlocked: G.unlocked, cleared: G.cleared.slice(), level: G.level,
    levelState: ls, roomFlags: packFlags(G.roomFlags), flags: G.flags,
    coins: p ? p.coins : 0, up: p ? Object.assign({}, p.up) : {},
    maxHp: p ? p.maxHp : 6, hp: p ? p.hp : 6, hasKey: p ? p.hasKey : false,
    codes: { found: G.codes.found, used: G.codes.used, tickets: G.codes.tickets,
             admin: G.codes.admin },
    tut: G.tut, stats: G.stats
  };
}
function readSlot(i) { return Store.read(SAVE_KEY + i, null); }
function writeSlot(i, data) { Store.write(SAVE_KEY + i, data); }
G.saveGame = function () {
  if (G.state === 'load' || G.state === 'title' || G.state === 'files') return;
  if (!G.player) return;
  saveLevelState();
  writeSlot(G.slot, packSave());
  Store.write(SLOT_KEY, G.slot);
};
function applySave(d) {
  const p = G.player;
  G.tutorialDone = !!d.tutorialDone;
  G.unlocked = Math.max(1, d.unlocked || 1);
  G.cleared = (d.cleared || []).slice();
  G.level = d.level || 0;
  G.flags = d.flags || {};
  G.roomFlags = unpackFlags(d.roomFlags);
  G.levelState = {};
  for (const k in (d.levelState || {})) {
    const st = d.levelState[k];
    G.levelState[k] = { roomId: st.roomId, x: st.x, y: st.y, hp: st.hp,
                        roomFlags: unpackFlags(st.roomFlags), flags: st.flags || {} };
  }
  p.coins = d.coins || 0;
  p.up = Object.assign({ sword: 0, speed: 0, dash: 0, magnet: 0, armour: 0, special: 0, wings: 0, mantle: 0, emberheart: 0, heart: 0 }, d.up || {});
  p.maxHp = d.maxHp || 6;
  p.hp = clamp(d.hp || p.maxHp, 1, p.maxHp);
  p.hasKey = !!d.hasKey;
  G.codes.found = d.codes && d.codes.found || {};
  G.codes.used = d.codes && d.codes.used || {};
  G.codes.tickets = (d.codes && d.codes.tickets) || 0;
  G.codes.admin = !!(d.codes && d.codes.admin);
  G.tut = Object.assign({ move: 0, fight: 0, swim: 0, dash: 0, pierce: 0, climb: 0, parry: 0 }, d.tut || {});
  G.stats = Object.assign({ coins: 0, kills: 0, time: 0, deaths: 0 }, d.stats || {});
  if (G.codes.admin) { try { Art.buildGold(); } catch (e) { /* art may not be up yet */ } }
}
/* What a file is worth, counted over the whole game: every realm of all
   three chapters, the two papers hidden in each of them, and every upgrade
   level at its full nine-realm cap, relics included. */
function slotTally(d) {
  const realms = World.LEVELS.length;              /* 3 chapters x 3 realms */
  const papers = World.CODES.length;               /* 2 in every realm */
  let cap = 0, have = 0;
  for (const it of SHOP_ITEMS) {
    if (it.key === 'tonic') continue;              /* a drink, not progress */
    const m = shopFullMax(it);
    cap += m;
    have += Math.min(m, (d && d.up && d.up[it.key]) || 0);
  }
  return {
    realms: (d && d.cleared || []).filter(Boolean).length, realmsMax: realms,
    papers: Math.min(papers, Object.keys(d && d.codes && d.codes.found || {}).length), papersMax: papers,
    upgrades: have, upgradesMax: cap
  };
}
/* 100% is every realm cleared, every paper found and every upgrade maxed */
function slotPercent(d) {
  if (!d) return 0;
  const t = slotTally(d);
  const f = (t.realms / t.realmsMax + t.papers / t.papersMax + t.upgrades / t.upgradesMax) / 3;
  return Math.round(clamp(f, 0, 1) * 100);
}

/* ---------- effects ---------- */
G.shake = function (a) { G.shakeAmt = Math.min(12, G.shakeAmt + a); };
G.flash = function (a) { G.flashAmt = Math.max(G.flashAmt, a); };
G.hitStop = function (t) { G.hitStopT = Math.max(G.hitStopT, t); };
G.banner = function (txt, dur) { G.bannerTxt = txt; G.bannerT = dur || 2.0; };
G.foundCode = function (code, si) {
  G.codes.found[code] = true;
  G.saveGame();
  Snd.keyGet(); G.flash(0.3);
  G.banner('CODE FOUND - ' + code, 3.2);
  G.texts.push(new FloatText(G.player.cx, G.player.y - 6, code, '#ffeec0'));
  for (let i = 0; i < 24; i++) G.particles.push(new Particle({
    x: G.player.cx, y: G.player.cy, vx: rr(-2.6, 2.6), vy: rr(-2.6, 1), life: rr(0.4, 0.9),
    col: '#ffeec0', col2: '#b8862f', size: rr(1, 2.6), grav: 0.05, drag: 0.93
  }));
  void si;
};
G.goldAdmin = function () {
  const p = G.player;
  G.codes.admin = true;
  /* open every realm first: the shop's caps and the relics both key off this,
     so maxing after it gives the full nine-realm stock */
  G.unlocked = World.LEVELS.length;
  for (const it of SHOP_ITEMS) {
    if (it.key === 'tonic') continue;
    p.up[it.key] = shopMax(it);
  }
  p.up.heart = shopMax(SHOP_ITEMS[0]);
  p.maxHp = 6 + p.up.heart * 2;
  p.hp = p.maxHp;
  G.codes.tickets += 99;
  try { Art.buildGold(); } catch (err) { console.error('gold avatar', err); }
  Snd.unlock(); G.flash(1.0); G.shake(8);
  for (let i = 0; i < 160; i++) G.particles.push(new Particle({
    x: p.cx, y: p.cy, vx: rr(-6, 6), vy: rr(-6, 4), life: rr(0.6, 1.6),
    col: rpick(['#ffeec0', '#f0c93a', '#ffffff']), col2: '#b8862f', size: rr(1, 3.4), grav: 0.04, drag: 0.94
  }));
};
G.redeem = function (raw) {
  const name = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!name) return;
  if (name === 'ADMIN') {
    G.goldAdmin();
    G.codeMsg = 'ADMIN - ALL YOURS'; G.codeMsgOk = true; G.codeMsgT = 4;
    return;
  }
  const c = World.codeByName(name);
  if (!c) { Snd.uiBad(); G.codeMsg = 'NO SUCH CODE'; G.codeMsgOk = false; G.codeMsgT = 2.6; return; }
  if (G.codes.used[c.code]) { Snd.uiBad(); G.codeMsg = 'ALREADY REDEEMED'; G.codeMsgOk = false; G.codeMsgT = 2.6; return; }
  /* knowing a code is not enough: you must be carrying its paper */
  if (!G.codes.found[c.code]) {
    Snd.uiBad(); G.codeMsg = 'YOU HAVE NO SUCH PAPER'; G.codeMsgOk = false; G.codeMsgT = 3; return;
  }
  G.codes.used[c.code] = true;
  if (c.kind === 'coins') {
    G.player.coins += c.amount;
    G.codeMsg = '+' + c.amount + ' COINS'; G.codeMsgOk = true; G.codeMsgT = 3;
  } else {
    G.codes.tickets += c.amount;
    G.codeMsg = '+' + c.amount + ' FREE UPGRADE' + (c.amount > 1 ? 'S' : '');
    G.codeMsgOk = true; G.codeMsgT = 3;
  }
  Snd.buy(); G.flash(0.25);
  G.saveGame();
};
G.addCombo = function () {
  G.combo++; G.comboT = 2.6;
  if (G.combo > G.comboBest) G.comboBest = G.combo;
  if (G.combo === 5 || G.combo === 10 || G.combo === 20 || G.combo === 35) Snd.comboUp();
};
G.breakCombo = function () { G.combo = 0; G.comboT = 0; };
/* every four links adds half again to what things drop, up to triple */
const TUT_STEPS = [
  { key: 'fight', label: 'STRIKE A FOE' },
  { key: 'swim', label: 'SWIM THE POOL' },
  { key: 'dash', label: 'DASH A GAP' },
  { key: 'pierce', label: 'DIVE FROM HIGH UP' },
  { key: 'climb', label: 'CLIMB THE LADDER' },
  { key: 'parry', label: 'TURN THE IDOLS FIRE' }
];
G.tutMark = function (key) {
  if (G.roomId !== 'tutorial' || !G.tut) return;
  if (G.tut[key]) return;
  G.tut[key] = 1;
  const st = TUT_STEPS.filter(s => s.key === key)[0];
  if (st) {
    Snd.comboUp(); G.flash(0.18);
    G.banner(st.label + '  -  DONE', 2.0);
    for (let i = 0; i < 20; i++) G.particles.push(new Particle({
      x: G.player.cx, y: G.player.cy, vx: rr(-2.4, 2.4), vy: rr(-2.6, 0.4), life: rr(0.3, 0.8),
      col: '#9be89a', col2: '#2f6f37', size: rr(1, 2.4), grav: 0.06
    }));
  }
};
G.tutLeft = function () { return TUT_STEPS.filter(s => !G.tut[s.key]); };
G.bossFightOn = function () { return !!(G.boss && G.boss.awake && !G.boss.dead); };
G.coinBonus = function () {
  const lv = World.LEVELS[G.level];
  return (lv && lv.coinBonus) || 0;
};
G.comboMult = function () { return 1 + Math.min(2, Math.floor(G.combo / 4) * 0.5); };
G.coinScale = function () {
  const lv = World.LEVELS[G.level];
  return (lv && lv.coinScale) || 1;
};
G.purse = function () { return G.codes.admin ? INF : String(G.player.coins); };
G.spawnCoin = function (x, y, vx, vy, still, si) {
  const c = new Coin(x, y, vx, vy, still);
  if (si !== undefined) c.si = si;
  G.coins.push(c);
};

/* ============================================================
   rooms
   ============================================================ */
function resolveSpawn(room, exit) {
  if (exit && exit.spawnAt) return exit.spawnAt;
  if (exit && exit.useSaved && room.saved && room.saved[exit.useSaved]) return room.saved[exit.useSaved];
  if (exit && exit.edge === 'right') {
    const x = 5 * TILE;
    return { x: x, y: room.groundBelow(x, 2 * TILE) };
  }
  if (exit && exit.edge === 'left') {
    const x = (room.w - 6) * TILE;
    return { x: x, y: room.groundBelow(x, 2 * TILE) };
  }
  return room.start;
}

G.enterRoom = function (id, spawn) {
  const room = World.rooms[id];
  G.room = room; G.roomId = id;
  G.enemies.length = 0; G.coins.length = 0; G.projectiles.length = 0; G.waves.length = 0;
  G.particles.length = 0; G.texts.length = 0; G.items.length = 0;
  G.boss = null; G.bossFight = false;
  if (!G.roomFlags[id]) G.roomFlags[id] = { coins: new Set() };
  const flags = G.roomFlags[id];

  /* some realms breed hardier creatures; bosses set their own health */
  const lv = World.LEVELS[room.level];
  const hpScale = (lv && lv.enemyHp) || 1;
  const tough = (e) => {
    if (hpScale !== 1) { e.hp = Math.round(e.hp * hpScale); e.maxHp = e.hp; }
    G.enemies.push(e);
    return e;
  };

  /* guardians are far hardier than they were; the last one hardest of all.
     A realm may set its own bossHp, and Emberwood does: it is the first fight
     anyone has, usually with no whetstone bought yet. */
  const lastLevel = World.LEVELS.length - 1;
  const roomLv = World.LEVELS[room.level];
  const bossScale = (roomLv && roomLv.bossHp !== undefined)
    ? roomLv.bossHp
    : ((room.level === lastLevel) ? 10 : 3);
  const hardenBoss = (b) => {
    b.hp = Math.round(b.hp * bossScale);
    b.maxHp = b.hp;
    return b;
  };

  room.spawns.forEach((sp, i) => {
    switch (sp.type) {
      case 'snake': tough(new Snake(sp.x, sp.y, !!sp.top)); break;
      case 'bear': tough(new Bear(sp.x, sp.y)); break;
      case 'bat': tough(new Bat(sp.x, sp.y, !!sp.top)); break;
      case 'spider': tough(new Spider(sp.x, sp.y)); break;
      case 'wisp': tough(new Wisp(sp.x, sp.y)); break;
      case 'bird': tough(new Bird(sp.x, sp.y)); break;
      case 'jelly': tough(new Jelly(sp.x, sp.y)); break;
      case 'crab': tough(new Crab(sp.x, sp.y)); break;
      case 'angler': tough(new Angler(sp.x, sp.y)); break;
      case 'emberling': tough(new Emberling(sp.x, sp.y)); break;
      case 'golem': tough(new Golem(sp.x, sp.y)); break;
      case 'cinderwing': tough(new Cinderwing(sp.x, sp.y)); break;
      case 'idol': G.enemies.push(new Idol(sp.x, sp.y)); break;
      case 'guardian': { const gd = hardenBoss(new Guardian(sp.x, sp.y, sp.key)); G.enemies.push(gd); G.boss = gd; break; }
      case 'sporeling': tough(new Sporeling(sp.x, sp.y)); break;
      case 'zeus': { const z = hardenBoss(new Zeus(sp.x, sp.y)); G.enemies.push(z); G.boss = z; break; }
      case 'mother': { const m = hardenBoss(new MotherSpore(sp.x, sp.y)); G.enemies.push(m); G.boss = m; break; }
      case 'dragon': { const d = hardenBoss(new Dragon(sp.x, sp.y)); G.enemies.push(d); G.boss = d; break; }
      case 'coin': if (!flags.coins.has(i)) G.spawnCoin(sp.x, sp.y, 0, 0, true, i); break;
      case 'key': if (!G.flags.keyTaken) G.items.push(new KeyItem(sp.x, sp.y)); break;
      case 'paper': if (!G.codes.found[sp.code] && !G.codes.used[sp.code])
        G.items.push(new CodePaper(sp.x, sp.y, sp.code, i)); break;
    }
  });

  const s = spawn || room.start;
  G.player.place(s.x, room.mode === 'top' ? s.y + G.player.h / 2 : s.y);
  G.player.dashT = 0; G.player.atkT = 0;
  G.exitLock = true; G.nearExit = null;
  G.acid = room.acid ? { y: room.acid.y } : null;
  G.acidBurnT = 0;
  G.aimX = clamp(VW / 2 + 60, 20, VW - 20); G.aimY = VH * 0.42; G.aimDrag = null;
  snapCamera();
  Snd.play(room.music);
  Snd.ambienceLevel(room.ambient, 1.4);
  G.banner(room.name, 2.4);
  G.checkRelics();
  G.saveGame();                 /* every new area is a point worth keeping */
};

/* ============================================================
   SWALLOWED — the Leviathan takes you down, and you climb out
   ============================================================ */
G.swallowInto = function (boss) {
  if (G.trans || G.swallowed) return;
  saveLevelState();
  G.swallowed = {
    roomId: G.roomId, level: G.level,
    bossHp: boss ? boss.hp : null,
    x: G.player.cx, y: G.player.y + G.player.h
  };
  G.banner('SWALLOWED WHOLE', 2.6);
  G.trans = { t: 0, phase: 'out', dur: 0.5, id: 'gullet', exit: null, swallow: true };
};
/* cut your way out at the top, and the fight picks up where it left off */
G.escapeGullet = function () {
  const sw = G.swallowed;
  if (!sw) { G.leaveLevel(); return; }
  G.swallowed = null;
  G.acid = null;
  G.escaped = sw;
  G.banner('BACK INTO THE FIGHT', 2.4);
  G.trans = { t: 0, phase: 'out', dur: 0.5, id: sw.roomId, exit: { spawnAt: { x: sw.x, y: sw.y } }, escaped: true };
};

/* ---------- transitions: a pixel flush between areas ---------- */
G.goRoom = function (id, exit) {
  if (G.trans) return;
  Snd.door();
  G.trans = { t: 0, phase: 'out', dur: 0.42, id: id, exit: exit };
};
function updateTransition(dt) {
  const tr = G.trans;
  if (!tr) return;
  tr.t += dt;
  if (tr.phase === 'out' && tr.t >= tr.dur) {
    if (tr.toMap) { openMap(false); G.trans = null; return; }
    const room = World.rooms[tr.id];
    G.enterRoom(tr.id, resolveSpawn(room, tr.exit));
    if (tr.escaped && G.escaped) {
      /* the guardian picks up where it left off, wounds and all */
      const sw = G.escaped; G.escaped = null;
      if (G.boss && sw.bossHp !== null) {
        G.boss.hp = Math.max(1, Math.min(G.boss.maxHp, sw.bossHp));
        G.boss.awake = true; G.boss.state = 'rest'; G.boss.stateT = 1.2;
      }
    }
    if (!tr.swallow) saveLevelState();
    G.flash(0.35);
    tr.phase = 'in'; tr.t = 0;
  } else if (tr.phase === 'in' && tr.t >= tr.dur) {
    G.trans = null;
  }
}
const DISSOLVE = (function () {
  const bw = Math.ceil(VW / 8), bh = Math.ceil(VH / 8);
  const a = new Float32Array(bw * bh);
  const r = new RNG(4242);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    /* a diagonal sweep with noise so the flush reads as a wipe, not static */
    a[y * bw + x] = clamp((x / bw) * 0.55 + (y / bh) * 0.2 + r.r(0, 0.42), 0, 1);
  }
  return { w: bw, h: bh, a: a };
})();
function drawTransition(c2) {
  const tr = G.trans;
  if (!tr) return;
  let p = clamp(tr.t / tr.dur, 0, 1);
  if (tr.phase === 'in') p = 1 - p;
  c2.fillStyle = '#08060e';
  for (let y = 0; y < DISSOLVE.h; y++) for (let x = 0; x < DISSOLVE.w; x++) {
    if (DISSOLVE.a[y * DISSOLVE.w + x] < p) c2.fillRect(x * 8, y * 8, 8, 8);
  }
  if (p > 0.75) {
    c2.save(); c2.globalAlpha = (p - 0.75) * 4; c2.fillStyle = '#08060e';
    c2.fillRect(0, 0, VW, VH); c2.restore();
  }
}

/* ============================================================
   camera — metroidvania: dead zone, look-ahead, clamped to room
   ============================================================ */
function camTarget() {
  const p = G.player, room = G.room;
  let tx = p.cx + p.face * 26 - VW / 2;
  let ty;
  if (room.mode === 'top') {
    ty = p.cy - VH / 2;
    tx = p.cx - VW / 2;
  } else {
    if (p.grounded) G.cam.ay = p.y + p.h;
    else G.cam.ay = lerp(G.cam.ay, p.y + p.h, 0.06);
    ty = G.cam.ay - VH * 0.62;
    if (p.cy - G.cam.y < 46) ty = p.cy - 46;
    if (p.cy - G.cam.y > VH - 54) ty = p.cy - (VH - 54);
  }
  const maxX = Math.max(0, room.pxW() - VW), maxY = Math.max(0, room.pxH() - VH);
  return { x: clamp(tx, 0, maxX), y: clamp(ty, 0, maxY) };
}
function snapCamera() { G.cam.ay = G.player.y + G.player.h; const t = camTarget(); G.cam.x = t.x; G.cam.y = t.y; }
function updateCamera(dt) {
  const t = camTarget();
  const k = 1 - Math.pow(0.0012, dt);
  G.cam.x = lerp(G.cam.x, t.x, k);
  G.cam.y = lerp(G.cam.y, t.y, Math.min(1, k * 1.15));
  if (Math.abs(G.cam.x - t.x) < 0.3) G.cam.x = t.x;
  if (Math.abs(G.cam.y - t.y) < 0.3) G.cam.y = t.y;
}

/* ============================================================
   main loop
   ============================================================ */
let loadSteps = null, loadIdx = 0, loadT = 0;

function boot() {
  addEventListener('error', e => { if (!crashInfo) console.error('[emberwood] error', e.error || e.message); });
  /* a sensible starting guess; the settings panel overrides it */
  G.mobile = ('ontouchstart' in window) ||
             (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  initDisplay();
  loadOptions();
  loadSteps = Art.steps();
  G.state = 'load';
  document.getElementById('boot').classList.add('hide');
  requestAnimationFrame(frame);
  /* audio needs a gesture in most browsers */
  const kick = () => {
    Snd.init(); Snd.resume();
    if (Snd.ready && G.audioHint) {
      G.audioHint = false;
      Snd.startAmbience();
      if (G.state === 'title') { Snd.play('title'); Snd.ambienceLevel(0.5, 2); }
      else if (G.room) { Snd.play(G.room.music); Snd.ambienceLevel(G.room.ambient, 2); }
    }
  };
  addEventListener('mousedown', kick);
  addEventListener('keydown', kick);
}

let lastT = 0;
function frame(now) {
  const raw = (now - lastT) / 1000;
  lastT = now;
  let dt = clamp(isFinite(raw) ? raw : 0.016, 0, 0.05);
  G.dt = dt;
  G.t += dt;

  /* One bad frame must never kill the loop: catch it, show it, keep going. */
  try {
    updatePad();
    if (G.state === 'load') updateLoad(dt);
    else if (G.state === 'title') updateTitle(dt);
    else if (G.state === 'files') updateFiles(dt);
    else if (G.state === 'map') updateMap(dt);
    else updatePlay(dt);
    render();
  } catch (err) {
    reportCrash(err);
  }
  Input.endFrame();
  G.clickAttack = false;
  requestAnimationFrame(frame);
}

let crashInfo = null, crashCount = 0;
function reportCrash(err) {
  crashCount++;
  if (!crashInfo) {
    crashInfo = { msg: String(err && err.message || err), stack: String(err && err.stack || '') };
    console.error('[emberwood] frame error', err);
  }
  try { drawCrash(); } catch (e) { /* nothing more we can do */ }
}
function drawCrash() {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = 'rgba(10,4,10,0.92)';
  ctx.fillRect(0, 0, VW, VH);
  drawText(ctx, 'FRAME ERROR', 6, 6, '#ff6a5a', 2, 'left');
  drawText(ctx, 'X ' + crashCount, VW - 6, 8, '#8a94a6', 1, 'right');
  const wrap = (s, n) => { const o = []; for (let i = 0; i < s.length; i += n) o.push(s.slice(i, i + n)); return o; };
  let y = 26;
  for (const line of wrap(crashInfo.msg, 60).slice(0, 3)) { drawText(ctx, line, 6, y, '#ffd04a', 1, 'left'); y += 9; }
  y += 4;
  for (const raw of crashInfo.stack.split('\n').slice(0, 8)) {
    const s = raw.trim().replace(/^at /, '').replace(/file:\/\/.*\/js\//, '');
    for (const line of wrap(s, 62).slice(0, 1)) { drawText(ctx, line, 6, y, '#9aa8c4', 1, 'left'); y += 9; }
  }
  drawText(ctx, 'RELOAD THE PAGE AFTER THE FIX', 6, VH - 12, '#6d7994', 1, 'left');
  ctx.restore();
}

function updateLoad(dt) {
  loadT += dt;
  if (loadIdx < loadSteps.length) {
    loadSteps[loadIdx].fn();
    loadIdx++;
  } else if (!G.worldBuilt) {
    World.build();
    G.worldBuilt = true;
    G.player = new Player();
    initTitle();
  } else if (loadT > 0.4) {
    G.state = 'title';
  }
}

/* ============================================================
   PLAY
   ============================================================ */
function startGame(slot) {
  G.slot = clamp(slot | 0, 0, SLOTS - 1);
  Store.write(SLOT_KEY, G.slot);
  G.player = new Player();
  G.stats = { coins: 0, kills: 0, time: 0, deaths: 0 };
  G.roomFlags = {}; G.flags = {}; G.levelState = {};
  G.unlocked = 1; G.cleared = []; G.level = 0;
  G.trans = null;
  G.tutorialDone = false;
  G.codes = { found: {}, used: {}, tickets: 0, admin: false };
  G.tut = { move: 0, fight: 0, swim: 0, dash: 0, pierce: 0, climb: 0, parry: 0 };
  G.relicSeen = {}; G.relicShow = null; G.swallowed = null; G.acid = null;
  const d = readSlot(G.slot);
  if (d && d.used) applySave(d);
  G.mapMode = G.tutorialDone ? 'realm' : 'tutorial';
  openMap(true);
}
G.startTutorial = function () {
  G.level = 0;
  G.roomFlags = {}; G.flags = {};
  G.player.hp = G.player.maxHp;
  G.player.dead = false;
  G.state = 'play';
  G.trans = null;
  G.enterRoom('tutorial', null);
  G.flash(0.9);
};
G.finishTutorial = function () {
  G.tutorialDone = true;
  G.mapMode = 'realm';
  G.saveGame();
  Snd.unlock(); G.flash(1.0);
  G.banner('THE REALM AWAITS', 3);
  G.trans = { t: 0, phase: 'out', dur: 0.42, toMap: true };
};
function openMap(fresh) {
  G.state = 'map'; G.mapT = 0; G.mapSel = -1;
  G.shopOpen = false;
  G.particles.length = 0;
  if (G.mapMode === 'tutorial') { G.chapter = 0; G.mapScroll = 0; }
  else gotoChapter(fresh ? 0 : World.chapterOf(G.level), true);
  if (G.pendingUnlock !== undefined && G.pendingUnlock !== null) {
    G.unlockAnim = { t: 0, chapter: G.pendingUnlock, moved: false, burst: false };
    gotoChapter(World.chapterOf(G.level), true);
    G.pendingUnlock = null;
  }
  Snd.play('title'); Snd.musicLevel(0.34, 0.8); Snd.ambienceLevel(0.25, 1.2);
  if (fresh) G.flash(1.0); else G.flash(0.5);
}
/* remember where you stood, what you had taken, and how hurt you were */
function saveLevelState() {
  if (!G.room || !G.player || G.player.dead) return;
  if (G.roomId === 'tutorial') return;      /* the tutorial is never resumed */
  if (G.roomId === 'gullet') return;        /* nor the inside of a Leviathan */
  G.levelState[G.level] = {
    roomId: G.roomId,
    x: G.player.cx, y: G.player.y + G.player.h,
    hp: G.player.hp,
    roomFlags: G.roomFlags, flags: G.flags
  };
}
/* watch for a relic coming within reach, and announce it once */
G.checkRelics = function () {
  if (!G.player) return;
  G.relicSeen = G.relicSeen || {};
  for (const it of SHOP_ITEMS) {
    if (!it.relic || !shopVisible(it)) continue;
    if (G.relicSeen[it.key]) continue;
    G.relicSeen[it.key] = true;
    if (G.player.up[it.key]) continue;      /* already owned, nothing to show */
    G.showRelic(it);
    return;                                  /* one at a time */
  }
};
G.startLevel = function (i) {
  const lv = World.LEVELS[i];
  if (!lv || i >= G.unlocked) { Snd.uiBad(); return; }
  G.level = i;
  G.player.dead = false;
  G.state = 'play';
  G.trans = null;
  const st = G.levelState[i];
  if (st && World.rooms[st.roomId]) {
    /* pick the realm up where you left it */
    G.roomFlags = st.roomFlags; G.flags = st.flags;
    G.player.hp = Math.max(2, st.hp);
    G.enterRoom(st.roomId, { x: st.x, y: st.y });
    G.banner('RESUMING - ' + World.rooms[st.roomId].name, 2.4);
  } else {
    G.roomFlags = {}; G.flags = {};
    G.player.hp = G.player.maxHp;
    G.enterRoom(lv.start, null);
  }
  G.flash(0.9);
};
G.leaveLevel = function () {
  if (G.trans) return;
  saveLevelState();
  G.saveGame();
  Snd.door();
  G.trans = { t: 0, phase: 'out', dur: 0.42, toMap: true };
};

/* the doorway on screen, so it can be clicked or tapped */
function doorScreenRect(ex) {
  if (!ex || !ex.door) return null;
  return { x: ex.door.x - 22 - G.cam.x, y: ex.door.y - 46 - G.cam.y, w: 44, h: 50 };
}
function exitPromptText(locked) {
  if (locked) return 'SEALED';
  return G.mobile ? 'TAP TO ENTER' : 'CLICK TO ENTER';
}
/* the prompt over a doorway is a button in its own right. A maze arch and
   the cavern mouths carry no door sprite, so the words are all there is. */
/* the corner icons the doorway button must not cover */
function hudBlockers() {
  const out = [{ x: 4, y: 4, w: 22, h: 22 }];                 /* the shop sign */
  if (G.roomId === 'tutorial') out.push(SKIP_RECT);
  else {
    out.push({ x: 4, y: 30, w: 22, h: 22 });                  /* the codes panel */
    out.push({ x: VW - 26, y: 4, w: 22, h: 22 });             /* the chart */
  }
  return out;
}
function exitPromptRect(ex, locked) {
  if (!ex) return null;
  const w = textWidth(exitPromptText(locked)) + 8;
  const px = ex.x + ex.w / 2 - G.cam.x, py = ex.y - 12 - G.cam.y;
  /* a doorway in a far corner would push the button off the screen, and the
     camera has already stopped following. Hold it inside the view. On a phone
     it also stays above the touch pad, so the two never fight for a finger. */
  const maxY = G.mobile ? 96 : VH - 26;
  const r = { x: Math.round(clamp(px - w / 2, 2, VW - w - 2)),
              y: Math.round(clamp(py - 3, 2, maxY)),
              w: Math.round(w), h: 13 };
  /* the maze arch sits in the top right corner, right under the chart icon.
     Drop the button clear of anything it would cover. */
  for (let guard = 0; guard < 4; guard++) {
    let moved = false;
    for (const ic of hudBlockers()) {
      if (rectsOverlap(r, ic)) { r.y = ic.y + ic.h + 2; moved = true; }
    }
    if (!moved) break;
  }
  r.y = Math.round(clamp(r.y, 2, VH - 24));
  return r;
}
/* a click, or any finger that lands here and not on a touch button */
function tapInWorld(r) {
  if (!r) return false;
  for (const t of Input.taps) {
    if (t.x < r.x || t.x > r.x + r.w || t.y < r.y || t.y > r.y + r.h) continue;
    if (G.mobile && overAnyPad(t.x, t.y)) continue;
    return true;
  }
  return false;
}
function overNearExit() {
  if (!G.nearExit || G.nearExitLocked) return false;
  return Input.over(exitPromptRect(G.nearExit, false)) ||
         (!!doorScreenRect(G.nearExit) && Input.over(doorScreenRect(G.nearExit)));
}
/* the way out of the tutorial for anyone who does not want it */
const SKIP_RECT = { x: VW - 58, y: 4, w: 54, h: 15 };

function updatePlay(dt) {
  updateTransition(dt);
  if (G.settingsOpen) { updateSettings(); return; }
  G.stats.time += dt;
  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  G.bannerT = Math.max(0, G.bannerT - dt);
  G.lockedMsgT = Math.max(0, G.lockedMsgT - dt);
  updateRelicShow(dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 26);

  /* a tap on the doorway button belongs to the doorway, never to an icon
     underneath it */
  const exitBtn = (G.nearExit && !G.nearExitLocked && !G.trans)
    ? exitPromptRect(G.nearExit, false) : null;
  const tapOnExitBtn = !!exitBtn && Input.tap(exitBtn);

  /* the shop opens from the icon in the corner, or with ESC */
  const iconR = { x: 4, y: 4, w: 22, h: 22 };
  const overIcon = Input.mx >= iconR.x && Input.mx <= iconR.x + iconR.w &&
                   Input.my >= iconR.y && Input.my <= iconR.y + iconR.h;
  G.overShopIcon = overIcon;
  const codeR = { x: 4, y: 30, w: 22, h: 22 };
  const overCode = Input.mx >= codeR.x && Input.mx <= codeR.x + codeR.w &&
                   Input.my >= codeR.y && Input.my <= codeR.y + codeR.h;
  G.overCodeIcon = overCode && !G.shopOpen && !G.codesOpen && G.roomId !== 'tutorial';
  /* the skip, top right, while the tutorial is running */
  G.overSkip = false;
  if (G.roomId === 'tutorial' && G.state === 'play' && !G.shopOpen && !G.trans) {
    G.overSkip = Input.over(SKIP_RECT);
    if (Input.tap(SKIP_RECT)) { Snd.ui(); G.banner('TUTORIAL SKIPPED', 2.2); G.finishTutorial(); return; }
  }
  if (G.roomId !== 'tutorial' && G.state === 'play' && !G.shopOpen && !G.codesOpen && ((Input.tap(codeR) && !tapOnExitBtn) || Input.actHit('codes'))) {
    G.codesOpen = true; G.codeBuf = ''; G.codeMsgT = 0; Snd.ui(); Snd.musicLevel(0.16, 0.3);
    return;
  }
  if (G.codesOpen) { updateCodes(dt); return; }
  const mapR = { x: VW - 26, y: 4, w: 22, h: 22 };
  const overMap = Input.mx >= mapR.x && Input.mx <= mapR.x + mapR.w &&
                  Input.my >= mapR.y && Input.my <= mapR.y + mapR.h;
  G.overMapIcon = overMap && !G.shopOpen && G.roomId !== 'tutorial';
  if (G.state === 'play' && G.roomId !== 'tutorial' && !G.shopOpen && !G.trans && ((Input.tap(mapR) && !tapOnExitBtn) || Input.actHit('map'))) {
    G.leaveLevel(); return;
  }
  if (G.state === 'play' && !G.shopOpen && (Input.actHit('shop') || Input.hit('Escape') || (Input.tap(iconR) && !tapOnExitBtn))) {
    G.shopOpen = true; G.shopSel = -1; Snd.ui();
    Snd.musicLevel(0.16, 0.3);
    return;
  }
  if (G.shopOpen) { updateShop(dt); return; }

  if (G.state === 'victory') { updateVictory(dt); return; }
  if (G.state === 'dead') {
    G.deathT += dt;
    for (const p of G.particles) p.update(dt);
    G.particles = G.particles.filter(p => !p.dead);
    if (G.deathT > 1.6 && (Input.hit('Space') || Input.hit('Enter') || Input.mhit)) respawn();
    return;
  }

  if (Input.mhit && !overIcon && !overMap && !overCode && !overNearExit() && !G.overSkip && !G.mobile) G.clickAttack = true;
  if (Input.actHit('mute')) { const m = Snd.toggleMute(); G.banner(m ? 'SOUND OFF' : 'SOUND ON', 1.2); }

  /* hit stop gives every sword blow some weight */
  if (G.hitStopT > 0) { G.hitStopT -= dt; dt = Math.min(dt, 0.0005); }

  const p = G.player;
  p.update(dt);
  if (p.dead && G.state === 'play') { G.breakCombo(); G.state = 'dead'; G.deathT = 0; G.stats.deaths++; Snd.musicLevel(0.08, 1.2); }

  for (const e of G.enemies) if (!e.dead) { e.update(dt); e.applyKnock(dt); }
  const before = G.enemies.length;
  G.enemies = G.enemies.filter(e => !e.dead);
  G.stats.kills += before - G.enemies.length;

  for (const c of G.coins) c.update(dt);
  for (const c of G.coins) if (c.dead && c.si !== undefined) G.roomFlags[G.roomId].coins.add(c.si);
  G.coins = G.coins.filter(c => !c.dead);

  for (const it of G.items) it.update(dt);
  G.items = G.items.filter(i => !i.dead);
  if (!G.items.length && G.roomId === 'maze' && p.hasKey) G.flags.keyTaken = true;

  for (const pr of G.projectiles) pr.update(dt);
  G.projectiles = G.projectiles.filter(x => !x.dead);
  for (const wv of G.waves) wv.update(dt);
  G.waves = G.waves.filter(x => !x.dead);

  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);

  for (const tx of G.texts) tx.update(dt);
  G.texts = G.texts.filter(x => !x.dead);

  /* the odd glint lifting off open water */
  if (G.room.surface && Math.random() < dt * 5) {
    const room = G.room;
    const tx = Math.floor((G.cam.x + rr(0, VW)) / TILE);
    if (tx > 0 && tx < room.w) {
      const ty = room.surface[tx];
      if (ty !== undefined && room.wet(tx, ty)) G.particles.push(new Particle({
        x: tx * TILE + rr(0, 15), y: ty * TILE - 1, vx: rr(-0.3, 0.3), vy: rr(-0.9, -0.3),
        life: rr(0.3, 0.8), col: '#ffffff', col2: '#cfeaff', size: 1, grav: 0.06
      }));
    }
  }

  /* ambient life */
  if (G.room.bg === 'forest' && Math.random() < dt * 0.42) Snd.bird();
  if (G.room.bg !== 'forest' && Math.random() < dt * 0.5) Snd.drip();
  if (G.room.bg === 'forest' && Math.random() < dt * 9) {
    G.particles.push(new Particle({
      x: G.cam.x + rr(-20, VW + 20), y: G.cam.y - 10, vx: rr(-0.5, 0.2), vy: rr(0.25, 0.7),
      life: rr(4, 8), col: rpick(['#7ec44f', '#4f9a3f', '#d0e08a']), size: rr(1, 2), grav: 0, type: 'leaf'
    }));
  }

  updateAcid(dt);
  checkExits();
  if (!G.trans) updateCamera(dt);
}

/* the acid in the gullet, climbing while you climb */
function updateAcid(dt) {
  const room = G.room;
  if (!room || !room.acid) { G.acid = null; return; }
  if (!G.acid) G.acid = { y: room.acid.y };
  G.acid.y -= room.acid.rate * dt;
  const p = G.player;
  if (!p.dead && p.y + p.h > G.acid.y) {
    /* standing in it burns fast */
    p.invuln = 0;
    if (!G.acidBurnT || G.acidBurnT <= 0) {
      G.acidBurnT = 0.42;
      p.hurt(2, p.cx, G.acid.y + 40);
      G.flash(0.2);
    }
  }
  G.acidBurnT = Math.max(0, (G.acidBurnT || 0) - dt);
  /* bubbles off the surface */
  if (Math.random() < dt * 26) G.particles.push(new Particle({
    x: G.cam.x + rr(0, VW), y: G.acid.y + rr(-2, 6), vx: rr(-0.3, 0.3), vy: rr(-1.4, -0.4),
    life: rr(0.4, 1), col: '#9be89a', col2: '#3f7a3a', size: rr(1, 2.6), grav: -0.01
  }));
}
function drawAcid(camX, camY) {
  if (!G.acid || !G.room.acid) return;
  const y = Math.round(G.acid.y - camY);
  if (y > VH + 8) return;
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#2f6f37';
  ctx.fillRect(0, Math.max(0, y), VW, VH - Math.max(0, y));
  ctx.globalAlpha = 1;
  for (let x = 0; x < VW; x++) {
    const h = Math.sin(x * 0.13 + G.t * 3.4) * 2 + Math.sin(x * 0.05 - G.t * 2.1) * 1.6;
    const top = y - Math.round(h);
    ctx.fillStyle = '#9be89a'; ctx.fillRect(x, top, 1, 1);
    ctx.fillStyle = '#6fc46a'; ctx.fillRect(x, top + 1, 1, 2);
  }
  ctx.restore();
  void camX;
}

/* click the door or its prompt with the cursor, tap either with a finger,
   or press the key */
function enterPressed(ex) {
  return tapInWorld(exitPromptRect(ex, false)) || tapInWorld(doorScreenRect(ex)) ||
         Input.actHit('interact');
}
function checkExits() {
  if (G.trans) return;
  const p = G.player, pb = { x: p.x, y: p.y, w: p.w, h: p.h };
  if (G.exitLock) {
    /* you arrive standing inside a doorway; wait until you step clear of them all */
    let inside = false;
    for (const ex of G.room.exits) if (rectsOverlap(pb, ex)) { inside = true; break; }
    if (inside) return;
    G.exitLock = false;
  }
  G.nearExit = null;
  for (const ex of G.room.exits) {
    if (!rectsOverlap(pb, ex)) continue;
    if (ex.needKey && !p.hasKey) {
      if (G.lockedMsgT <= 0) { G.banner('SEALED - FIND THE KEY', 2.2); G.lockedMsgT = 2.4; Snd.uiBad(); }
      G.nearExit = ex; G.nearExitLocked = true;
      continue;
    }
    if (ex.to === 'gulletOut') {
      G.nearExit = ex; G.nearExitLocked = false;
      if (!enterPressed(ex)) continue;
      G.escapeGullet();
      return;
    }
    if (ex.to === 'tutorialDone') {
      const left = G.tutLeft();
      G.nearExit = ex; G.nearExitLocked = left.length > 0;
      if (left.length) {
        if (G.lockedMsgT <= 0) { G.banner('STILL TO LEARN - ' + left[0].label, 2.2); G.lockedMsgT = 2.4; Snd.uiBad(); }
        continue;
      }
      if (!enterPressed(ex)) continue;
      G.finishTutorial();
      return;
    }
    /* a doorway is entered on purpose; only the screen edges pull you through */
    if (ex.kind) {
      G.nearExit = ex; G.nearExitLocked = false;
      if (!enterPressed(ex)) continue;
    }
    G.goRoom(ex.to, ex);
    return;
  }
}

function respawn() {
  const p = G.player;
  if (G.roomId === 'gullet' && G.swallowed) {
    /* the belly does not keep you: you wash back into the fight */
    const sw = G.swallowed; G.swallowed = null; G.acid = null;
    const lost = Math.floor(p.coins * 0.2);
    p.coins = Math.max(0, p.coins - lost);
    p.dead = false; p.hp = p.maxHp; p.invuln = 1.6;
    G.state = 'play';
    Snd.musicLevel(0.34, 0.6);
    G.enterRoom(sw.roomId, { spawnAt: { x: sw.x, y: sw.y } });
    G.flash(0.6);
    if (lost > 0) G.texts.push(new FloatText(p.cx, p.cy - 20, '-' + lost + ' COINS', '#ff9a8a'));
    return;
  }
  const lost = Math.floor(p.coins * 0.2);
  p.coins = Math.max(0, p.coins - lost);
  p.dead = false; p.hp = p.maxHp; p.invuln = 1.4;
  G.state = 'play';
  Snd.musicLevel(0.34, 0.6);
  G.enterRoom(G.roomId, null);
  G.flash(0.6);
  if (lost > 0) G.texts.push(new FloatText(p.cx, p.cy - 20, '-' + lost + ' COINS', '#ff9a8a'));
}

G.onBossDead = function () {
  G.state = 'victory'; G.victoryT = 0;
  G.cleared[G.level] = true;
  delete G.levelState[G.level];      /* a cleared realm begins again from the start */
  const next = G.level + 1;
  G.newlyUnlocked = (next < World.LEVELS.length && G.unlocked <= next);
  if (G.newlyUnlocked) {
    G.unlocked = next + 1;
    /* opening the first realm of a chapter is worth a fanfare */
    if (World.chapterOf(next) !== World.chapterOf(G.level)) G.pendingUnlock = World.chapterOf(next);
  }
  Snd.play('victory'); Snd.musicLevel(0.4, 1.5);
  G.banner(['THE DRAGON FALLS', 'THE STORM IS BROKEN', 'THE SPORE IS SILENCED'][G.level] || 'THE GUARDIAN FALLS', 3);
  writeSlot(G.slot, packSave());
};
function updateVictory(dt) {
  G.victoryT += dt;
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  for (const c of G.coins) c.update(dt);
  G.coins = G.coins.filter(c => !c.dead);
  G.player.update(dt);
  updateCamera(dt);
  if (Math.random() < dt * 3.5) {
    const fx = G.cam.x + rr(30, VW - 30), fy = G.cam.y + rr(20, VH * 0.6);
    Snd.coin();
    const col = rpick(['#ffd06a', '#ff8b7a', '#8ad0ff', '#c0f08a', '#e8a0ff']);
    for (let i = 0; i < 26; i++) G.particles.push(new Particle({
      x: fx, y: fy, vx: rr(-3, 3), vy: rr(-3, 3), life: rr(0.6, 1.3),
      col: col, col2: '#ffffff', size: rr(1, 2.5), grav: 0.06, drag: 0.94
    }));
  }
  if (G.victoryT > 2 && (Input.hit('Enter') || Input.hit('Space') || Input.mhit)) openMap(false);
}

/* ============================================================
   THE REALM MAP
   ============================================================ */
function mapNodeRect(i) {
  const n = World.LEVELS[i].node;
  const ch = World.chapterOf(i);
  const x = n.x + ch * VW - G.mapScroll;
  return { x: x - 30, y: n.y - 30, w: 60, h: 60, cx: x, cy: n.y };
}
function chapterUnlocked(ch) { return World.CHAPTERS[ch].levels[0] < G.unlocked; }
function gotoChapter(ch, snap) {
  G.chapter = clamp(ch, 0, World.CHAPTERS.length - 1);
  if (snap) G.mapScroll = G.chapter * VW;
}
function tutorialNodeRect() {
  const n = World.TUTORIAL.node;
  return { x: n.x - 30, y: n.y - 30, w: 60, h: 60, cx: n.x, cy: n.y };
}
function updateTutorialMap(dt) {
  G.mapT += dt;
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  G.bannerT = Math.max(0, G.bannerT - dt);
  const backR = mapBackRect(), gearR = mapGearRect();
  G.overMapBack = Input.over(backR);
  G.overMapGear = Input.over(gearR);
  if (G.settingsOpen) { updateSettings(); return; }
  if (Input.tap(gearR)) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }
  if (Input.tap(backR) || Input.hit('Escape')) { Snd.ui(); openFiles(); return; }
  const r = tutorialNodeRect();
  G.mapSel = Math.hypot(Input.mx - r.cx, Input.my - r.cy) < 28 ? 0 : -1;
  if (Input.mhit && G.mapSel === 0) { Snd.buy(); G.startTutorial(); return; }
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  if (Math.random() < dt * 6) G.particles.push(new Particle({
    x: rr(0, VW), y: VH + 4, vx: rr(-0.2, 0.2), vy: rr(-0.5, -0.15),
    life: rr(3, 6), col: rpick(['#ebdcb6', '#d8c49a', '#fff4d6']), size: 1, grav: 0, type: 'leaf'
  }));
}
function drawTutorialMap() {
  ctx.drawImage(Art.map.bg, 0, 0);
  for (const pa of G.particles) pa.draw(ctx);
  const r = tutorialNodeRect();
  const bob = Math.sin(G.mapT * 1.6) * 1.6;
  if (G.mapSel === 0) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16 + Math.sin(G.mapT * 5) * 0.06;
    ctx.fillStyle = '#ffd04a';
    ctx.beginPath(); ctx.arc(r.cx, r.cy + bob, 32, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.drawImage(Art.map.tutorial, Math.round(r.x), Math.round(r.y + bob));
  const w = textWidth(World.TUTORIAL.name) + 10;
  ctx.fillStyle = 'rgba(58,44,28,0.86)';
  ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 11);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 1);
  drawText(ctx, World.TUTORIAL.name, r.cx, r.y + 53 + bob, '#ffeec0', 1, 'center');

  ctx.fillStyle = 'rgba(58,44,28,0.9)';
  ctx.fillRect(50, 4, VW - 100, 24);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(50, 4, VW - 100, 1); ctx.fillRect(50, 27, VW - 100, 1);
  drawText(ctx, 'BEFORE YOU SET OUT', VW / 2, 5, '#ffeec0', 2, 'center', '#2a1a10');
  drawText(ctx, World.TUTORIAL.sub, VW / 2, 20, '#d8c49a', 1, 'center');

  ctx.fillStyle = 'rgba(58,44,28,0.82)';
  ctx.fillRect(0, VH - 14, VW, 14);
  drawText(ctx, G.mapSel === 0 ? 'CLICK TO STEP INTO THE TUTORIAL'
                               : 'THE REALMS OPEN ONCE YOU COMPLETE THE TUTORIAL',
           mapFootX(), VH - 11, '#ebdcb6', 1, 'center');
  drawMapCorners();
  if (G.bannerT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.bannerT * 2);
    drawText(ctx, G.bannerTxt, VW / 2, VH - 32, '#c9403a', 1, 'center', '#ebdcb6');
    ctx.restore();
  }
  if (G.settingsOpen) drawSettings();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}
/* BACK sits top left, clear of the chapter banner. The bottom left corner
   already carries the codes icon and the purse. */
function mapBackRect() { return { x: 5, y: 6, w: 42, h: 14 }; }
function mapGearRect() { return { x: VW - 30, y: VH - 26, w: 24, h: 22 }; }
/* the footer line shares its strip with the cog, so it stops short of it */
function mapFootX() { return (mapGearRect().x - 4) / 2; }
/* the same pair of corner buttons on both maps */
function drawMapCorners() {
  const b = mapBackRect();
  ctx.fillStyle = G.overMapBack ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.fillStyle = G.overMapBack ? '#ffd04a' : '#b8862f';
  ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
  drawText(ctx, 'BACK', b.x + b.w / 2, b.y + 4, '#ffeec0', 1, 'center');
  const g = mapGearRect();
  ctx.save();
  ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
  ctx.rotate(G.mapT * (G.overMapGear ? 1.1 : 0.25));
  ctx.drawImage(Art.ui.gear, -11, -11);
  ctx.restore();
  if (G.overMapGear) drawText(ctx, 'SETTINGS', g.x + g.w / 2, g.y - 9, '#ffeec0', 1, 'center', '#2a1a10');
}
function updateMap(dt) {
  if (G.mapMode === 'tutorial') { updateTutorialMap(dt); return; }
  G.mapT += dt;
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  G.bannerT = Math.max(0, G.bannerT - dt);

  /* the chapter-unlock flourish drives the map until it finishes */
  if (G.unlockAnim) {
    const u = G.unlockAnim;
    u.t += dt;
    if (u.t > 0.5 && !u.moved) { u.moved = true; gotoChapter(u.chapter, false); }
    if (u.t > 1.1 && !u.burst) {
      u.burst = true;
      Snd.unlock(); G.flash(0.5);
      const r = mapNodeRect(World.CHAPTERS[u.chapter].levels[0]);
      for (let k = 0; k < 90; k++) {
        const a = rr(0, TAU), sp = rr(0.6, 4.2);
        G.particles.push(new Particle({
          x: r.cx, y: r.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rr(0.5, 1.4),
          col: rpick(['#ffeec0', '#ffd04a', '#ffffff']), col2: '#b8862f',
          size: rr(1, 3), grav: 0.02, drag: 0.93
        }));
      }
      for (let k = 0; k < 10; k++) G.particles.push(new Particle({
        x: r.cx + rr(-8, 8), y: r.cy + rr(-9, 9), vx: rr(-2.4, 2.4), vy: rr(-3, -0.4),
        life: rr(0.6, 1.2), col: '#8a94a6', col2: '#3a4150', size: rr(2, 3.4), grav: 0.24
      }));
    }
    if (u.t > 3.2) G.unlockAnim = null;
  }

  /* scroll between chapters: wheel, arrows, or the side arrows */
  if (!G.unlockAnim) {
    if (Input.wheel > 6) gotoChapter(G.chapter + 1);
    else if (Input.wheel < -6) gotoChapter(G.chapter - 1);
    if (Input.hit('ArrowRight') || Input.hit('KeyD')) gotoChapter(G.chapter + 1);
    if (Input.hit('ArrowLeft') || Input.hit('KeyA')) gotoChapter(G.chapter - 1);
  }
  const target = G.chapter * VW;
  G.mapScroll = lerp(G.mapScroll, target, 1 - Math.pow(0.0009, dt));
  if (Math.abs(G.mapScroll - target) < 0.4) G.mapScroll = target;

  G.mapSel = -1;
  if (!G.unlockAnim) for (let i = 0; i < World.LEVELS.length; i++) {
    const r = mapNodeRect(i);
    if (Math.hypot(Input.mx - r.cx, Input.my - r.cy) < 28) G.mapSel = i;
  }
  /* the paging arrows — kept to the middle band so the corner buttons stay free */
  G.overArrow = 0;
  const inBand = Input.my > 36 && Input.my < VH - 52;
  if (inBand && Input.mx < 26 && G.chapter > 0) G.overArrow = -1;
  else if (inBand && Input.mx > VW - 26 && G.chapter < World.CHAPTERS.length - 1) G.overArrow = 1;

  const backR = mapBackRect(), gearR = mapGearRect();
  G.overMapBack = Input.over(backR);
  G.overMapGear = Input.over(gearR);
  if (G.settingsOpen) { updateSettings(); return; }
  if (Input.tap(gearR)) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }
  if (Input.tap(backR) || Input.hit('Escape')) { G.saveGame(); Snd.ui(); openFiles(); return; }

  if (Input.mhit && G.overArrow && !G.unlockAnim) { gotoChapter(G.chapter + G.overArrow); Snd.ui(); }
  else if (Input.mhit && G.mapSel >= 0) {
    if (G.mapSel < G.unlocked) { Snd.buy(); G.startLevel(G.mapSel); }
    else { Snd.uiBad(); G.banner('CLEAR THE REALM BEFORE IT', 1.8); }
  }
  const cbtn = { x: 6, y: VH - 46, w: 22, h: 22 };
  G.overCodeIcon = Input.over(cbtn);
  if (G.codesOpen) { updateCodes(dt); return; }
  if (Input.tap(cbtn) || Input.actHit('codes')) {
    G.codesOpen = true; G.codeBuf = ''; G.codeMsgT = 0; Snd.ui(); return;
  }
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  if (Math.random() < dt * 6) G.particles.push(new Particle({
    x: rr(0, VW), y: VH + 4, vx: rr(-0.2, 0.2), vy: rr(-0.5, -0.15),
    life: rr(3, 6), col: rpick(['#ebdcb6', '#d8c49a', '#fff4d6']), size: 1, grav: 0, type: 'leaf'
  }));
}
function drawMap() {
  if (G.mapMode === 'tutorial') { drawTutorialMap(); return; }
  ctx.drawImage(Art.map.bg, 0, 0);

  /* the route, drawn per chapter page */
  for (let ch = 0; ch < World.CHAPTERS.length; ch++) {
    const lv = World.CHAPTERS[ch].levels;
    for (let k = 0; k + 1 < lv.length; k++) {
      const a = mapNodeRect(lv[k]), b = mapNodeRect(lv[k + 1]);
      if (Math.max(a.cx, b.cx) < -60 || Math.min(a.cx, b.cx) > VW + 60) continue;
      const steps = Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy) / 5);
      for (let s = 2; s < steps - 5; s++) {
        const t = s / steps;
        const x = lerp(a.cx, b.cx, t), y = lerp(a.cy, b.cy, t) - Math.sin(t * Math.PI) * 16;
        if ((s & 1) === 0) {
          ctx.fillStyle = lv[k + 1] < G.unlocked ? '#4a3826' : 'rgba(168,146,112,0.6)';
          ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
        }
      }
    }
  }
  for (const pa of G.particles) pa.draw(ctx);

  for (let i = 0; i < World.LEVELS.length; i++) {
    const lv = World.LEVELS[i], r = mapNodeRect(i);
    if (r.cx < -60 || r.cx > VW + 60) continue;
    const locked = i >= G.unlocked;
    const hot = G.mapSel === i;
    const bob = Math.sin(G.mapT * 1.6 + i * 1.3) * 1.6;
    const u = G.unlockAnim;
    const bursting = u && u.burst && World.chapterOf(i) === u.chapter && World.CHAPTERS[u.chapter].levels[0] === i;
    ctx.save();
    if (locked && !bursting) ctx.globalAlpha = 0.45;
    if (bursting) {
      const k = clamp((u.t - 1.1) / 0.5, 0, 1);
      const s = 1 + (1 - k) * 0.5;
      ctx.translate(Math.round(r.cx), Math.round(r.cy + bob));
      ctx.scale(s, s);
      ctx.drawImage(Art.map.node[i], -32, -30);
    } else {
      ctx.drawImage(Art.map.node[i], Math.round(r.x), Math.round(r.y + bob));
    }
    ctx.restore();
    if (locked && !bursting) ctx.drawImage(Art.map.lock, Math.round(r.cx - 8), Math.round(r.cy - 9 + bob));
    else if (G.cleared[i]) {
      ctx.save(); ctx.globalAlpha = 0.9;
      drawText(ctx, 'CLEAR', r.cx, r.y + 62 + bob, '#4f7f4a', 1, 'center', '#ebdcb6');
      ctx.restore();
    }
    if (hot) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16 + Math.sin(G.mapT * 5) * 0.06;
      ctx.fillStyle = locked ? '#8a94a6' : '#ffd04a';
      ctx.beginPath(); ctx.arc(r.cx, r.cy + bob, 30, 0, TAU); ctx.fill();
      ctx.restore();
    }
    const w = textWidth(lv.name) + 10;
    ctx.fillStyle = 'rgba(58,44,28,0.86)';
    ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 11);
    ctx.fillStyle = '#b8862f';
    ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 1);
    drawText(ctx, lv.name, r.cx, r.y + 53 + bob, locked ? '#a89270' : '#ffeec0', 1, 'center');
  }

  /* chapter ribbon */
  const cur = World.CHAPTERS[G.chapter];
  ctx.fillStyle = 'rgba(58,44,28,0.9)';
  ctx.fillRect(50, 4, VW - 100, 24);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(50, 4, VW - 100, 1); ctx.fillRect(50, 27, VW - 100, 1);
  drawText(ctx, cur.name, VW / 2, 7, '#ffeec0', 2, 'center', '#2a1a10');
  drawText(ctx, chapterUnlocked(G.chapter) ? cur.sub : 'SEALED', VW / 2, 19,
           chapterUnlocked(G.chapter) ? '#d8c49a' : '#a89270', 1, 'center');
  /* page dots */
  for (let c = 0; c < World.CHAPTERS.length; c++) {
    ctx.fillStyle = c === G.chapter ? '#ffeec0' : (chapterUnlocked(c) ? '#b8862f' : '#7a6448');
    ctx.fillRect(Math.round(VW / 2 - World.CHAPTERS.length * 4 + c * 8), 31, 5, 3);
  }
  /* paging arrows */
  for (const dir of [-1, 1]) {
    const can = dir < 0 ? G.chapter > 0 : G.chapter < World.CHAPTERS.length - 1;
    if (!can) continue;
    const ax = dir < 0 ? 12 : VW - 12;
    const pulse = G.overArrow === dir ? 2 : 0;
    ctx.save();
    ctx.globalAlpha = G.overArrow === dir ? 1 : 0.7;
    ctx.fillStyle = 'rgba(58,44,28,0.8)';
    ctx.fillRect(ax - 8, VH / 2 - 14, 16, 28);
    ctx.fillStyle = '#ffeec0';
    /* k = 0 is the tip, and it lies on the side the arrow sends you */
    for (let k = 0; k < 7; k++)
      ctx.fillRect(Math.round(ax + dir * (3 - k) + dir * pulse), Math.round(VH / 2 - k), 1, k * 2 + 1);
    ctx.restore();
  }

  const foot = G.mapSel >= 0
    ? (G.mapSel < G.unlocked ? World.LEVELS[G.mapSel].sub + '   -   CLICK TO ENTER'
                             : 'SEALED   -   CLEAR THE REALM BEFORE IT')
    : 'SCROLL OR ARROWS TO PAGE   -   BACK FOR FILES';
  ctx.fillStyle = 'rgba(58,44,28,0.82)';
  ctx.fillRect(0, VH - 14, VW, 14);
  drawText(ctx, foot, mapFootX(), VH - 11, '#ebdcb6', 1, 'center');
  {
    const chov = G.overCodeIcon;
    if (chov) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#9be89a'; ctx.beginPath(); ctx.arc(17, VH - 35, 16, 0, TAU); ctx.fill(); ctx.restore();
    }
    blit(ctx, Art.ui.codes, 17, VH - 35, 11, 11);
    const unspent = Object.keys(G.codes.found).filter(c => !G.codes.used[c]).length + G.codes.tickets;
    if (unspent > 0) { ctx.fillStyle = '#6fc46a'; ctx.fillRect(24, VH - 44, 6, 6);
                       drawText(ctx, String(Math.min(9, unspent)), 26, VH - 43, '#12200e', 1, 'left'); }
    if (chov) drawText(ctx, 'CODES', 17, VH - 21, '#9be89a', 1, 'center', '#3a2c1c');
  }
  if (G.player) {
    ctx.drawImage(Art.item.coin[Math.floor(G.mapT / 0.09) % 8], 6, VH - 28);
    drawText(ctx, G.purse(), 20, VH - 26, '#5a4326', 1, 'left', '#ebdcb6');
  }

  /* the unlock flourish, over everything */
  if (G.unlockAnim) {
    const u = G.unlockAnim;
    if (u.t > 1.15) {
      const k = clamp((u.t - 1.15) / 1.6, 0, 1);
      const a = k < 0.75 ? 1 : 1 - (k - 0.75) * 4;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      const yy = 74 - (1 - Math.min(1, (u.t - 1.15) * 3)) * 14;
      const label = World.CHAPTERS[u.chapter].name + ' UNLOCKED';
      const w = textWidth(label) * 2 + 20;
      ctx.fillStyle = 'rgba(26,16,10,0.88)';
      ctx.fillRect(Math.round(VW / 2 - w / 2), Math.round(yy - 6), Math.round(w), 22);
      ctx.fillStyle = '#ffd04a';
      ctx.fillRect(Math.round(VW / 2 - w / 2), Math.round(yy - 6), Math.round(w), 1);
      ctx.fillRect(Math.round(VW / 2 - w / 2), Math.round(yy + 15), Math.round(w), 1);
      drawText(ctx, label, VW / 2, yy, '#ffeec0', 2, 'center', '#4a2c10');
      drawText(ctx, World.CHAPTERS[u.chapter].sub, VW / 2, yy + 24, '#d8c49a', 1, 'center', '#2a1a10');
      ctx.restore();
    }
  } else if (G.bannerT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.bannerT * 2);
    drawText(ctx, G.bannerTxt, VW / 2, VH - 32, '#c9403a', 1, 'center', '#ebdcb6');
    ctx.restore();
  }
  drawMapCorners();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
  if (G.codesOpen) drawCodes();
  if (G.settingsOpen) drawSettings();
}

/* ============================================================
   RENDERING
   ============================================================ */
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const _skyCache = {};
function makeSky(key, stops) {
  if (_skyCache[key]) return _skyCache[key];
  const p = new Pix(VW, VH);
  for (let y = 0; y < VH; y++) {
    const t = y / (VH - 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const a = C(stops[i][1]), b = C(stops[i + 1][1]);
    const span = stops[i + 1][0] - stops[i][0] || 1;
    const f = clamp((t - stops[i][0]) / span, 0, 1);
    for (let x = 0; x < VW; x++) {
      const th = (BAYER[y & 3][x & 3] + 0.5) / 16;
      p.set(x, y, f > th ? b : a);
    }
  }
  _skyCache[key] = p.canvas();
  return _skyCache[key];
}
function tileX(c2, img, x, y, w) {
  /* repeat a wide backdrop layer horizontally across the view */
  let sx = x % img.width;
  if (sx > 0) sx -= img.width;
  for (let px = sx; px < w; px += img.width) c2.drawImage(img, Math.round(px), Math.round(y));
}

function drawBackground(camX, camY) {
  const room = G.room;
  if (room.bg === 'forest') {
    ctx.drawImage(makeSky('day', [[0, '#6fb6e8'], [0.42, '#9fd4ee'], [0.72, '#cfe9e2'], [1, '#e8e0bf']]), 0, 0);
    /* sun */
    const sunX = 300 - camX * 0.02, sunY = 34 + Math.sin(G.t * 0.2) * 2 - camY * 0.02;
    ctx.save(); ctx.globalAlpha = 0.9;
    ctx.drawImage(Art.bg.sun, Math.round(sunX - Art.bg.sun.width / 2), Math.round(sunY - Art.bg.sun.height / 2));
    ctx.restore();
    /* clouds */
    for (let i = 0; i < 6; i++) {
      const c = Art.bg.clouds[i % 3];
      const sp = 2 + (i % 3) * 1.6;
      const x = ((G.t * sp + i * 137) % (VW + 160)) - 80 - camX * 0.035;
      const y = 14 + (i % 4) * 15 - camY * 0.03;
      ctx.save(); ctx.globalAlpha = 0.55 + (i % 3) * 0.12;
      ctx.drawImage(c, Math.round(x), Math.round(y));
      ctx.restore();
    }
    tileX(ctx, Art.bg.mtnFar, -camX * 0.06, VH - 150 - camY * 0.05, VW);
    tileX(ctx, Art.bg.mtnNear, -camX * 0.10, VH - 132 - camY * 0.07, VW);
    tileX(ctx, Art.bg.hillFar, -camX * 0.16, VH - 116 - camY * 0.09, VW);
    tileX(ctx, Art.bg.treeFar, -camX * 0.24, VH - 108 - camY * 0.12, VW);
    tileX(ctx, Art.bg.hillMid, -camX * 0.32, VH - 96 - camY * 0.16, VW);
    tileX(ctx, Art.bg.treeMid, -camX * 0.44, VH - 92 - camY * 0.22, VW);
    tileX(ctx, Art.bg.hillNear, -camX * 0.56, VH - 74 - camY * 0.3, VW);
    /* haze between the layers */
    ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#cfe4ea';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  } else if (room.bg === 'cloud') {
    ctx.drawImage(makeSky('aether', [[0, '#2f6fc0'], [0.3, '#6fb6e8'], [0.62, '#b8dcf2'], [1, '#f2f6ff']]), 0, 0);
    const sunX = 320 - camX * 0.02, sunY = 30 - camY * 0.02;
    ctx.save(); ctx.globalAlpha = 0.95;
    ctx.drawImage(Art.bg.sun, Math.round(sunX - Art.bg.sun.width / 2), Math.round(sunY - Art.bg.sun.height / 2));
    ctx.restore();
    for (let i = 0; i < 8; i++) {
      const c = Art.prop.puff[i % 3];
      const sp = 2 + (i % 3) * 2.2;
      const x = ((G.t * sp + i * 149) % (VW + 180)) - 90 - camX * (0.05 + (i % 3) * 0.03);
      const y = 12 + (i % 5) * 22 - camY * 0.05;
      ctx.save(); ctx.globalAlpha = 0.4 + (i % 3) * 0.16;
      ctx.drawImage(c, Math.round(x), Math.round(y));
      ctx.restore();
    }
    /* a lower cloud sea */
    ctx.save(); ctx.globalAlpha = 0.55;
    for (let i = 0; i < 10; i++) {
      const c = Art.prop.puff[(i + 1) % 3];
      ctx.drawImage(c, Math.round(((i * 61 - camX * 0.22) % (VW + 130)) - 65), Math.round(VH - 48 - camY * 0.12));
    }
    ctx.restore();
  } else if (room.bg === 'mush') {
    ctx.drawImage(makeSky('spore', [[0, '#150e22'], [0.45, '#241733'], [1, '#3b2a4d']]), 0, 0);
    /* drifting spore motes */
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const sx = (i * 97 + Math.sin(G.t * 0.3 + i) * 30 - camX * 0.25) % (VW + 40) - 20;
      const sy = (i * 53 + G.t * (6 + (i % 4) * 4)) % (VH + 40) - 20 - camY * 0.2;
      ctx.globalAlpha = 0.18 + (i % 3) * 0.1;
      ctx.fillStyle = (i % 4 === 0) ? '#6fd0ff' : '#9be89a';
      ctx.fillRect(Math.round(sx), Math.round(((sy % (VH + 40)) + VH + 40) % (VH + 40) - 20), 1, 1);
    }
    ctx.restore();
    /* silhouetted fungus behind everything */
    ctx.save(); ctx.globalAlpha = 0.5;
    for (let i = 0; i < 12; i++) {
      const s = Art.prop.shroom[i % Art.prop.shroom.length];
      const x = (i * 96 - camX * 0.3) % (VW + 220) - 110;
      ctx.drawImage(s.c, Math.round(x), Math.round(VH - 34 - s.h * 0.7 - camY * 0.16), Math.round(s.w * 0.7), Math.round(s.h * 0.7));
    }
    ctx.restore();
  } else if (room.bg === 'deep') {
    ctx.drawImage(makeSky('deep', [[0, '#0d2a44'], [0.4, '#12405f'], [1, '#0a1a2c']]), 0, 0);
    ctx.save();
    for (let i = 0; i < 30; i++) {
      const bx = (i * 79 - camX * 0.2) % (VW + 40) - 20;
      const by = ((i * 61 - G.t * (8 + (i % 4) * 6)) % (VH + 40) + VH + 40) % (VH + 40) - 20 - camY * 0.15;
      ctx.globalAlpha = 0.14 + (i % 3) * 0.08;
      ctx.fillStyle = '#a8cbd6';
      ctx.fillRect(Math.round(bx), Math.round(by), 1, 2);
    }
    ctx.restore();
    /* shafts of light from far above */
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.05 + Math.sin(G.t * 0.4 + i) * 0.015;
      ctx.fillStyle = '#cfeaff';
      const x = ((i * 137 - camX * 0.1) % (VW + 120)) - 60;
      for (let k = 0; k < 12; k++) ctx.fillRect(Math.round(x + k * 1.2), k * 18, 18 - k, 18);
    }
    ctx.restore();
  } else if (room.bg === 'ash') {
    ctx.drawImage(makeSky('ash', [[0, '#1a0c12'], [0.4, '#3a1410'], [0.75, '#6a2410'], [1, '#a03a12']]), 0, 0);
    /* a distant ridge line of volcanoes */
    ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = '#241018';
    for (let x = 0; x < VW; x++) {
      const h = 40 + Math.sin((x + camX * 0.06) * 0.017) * 16 + Math.sin((x + camX * 0.06) * 0.05) * 7;
      ctx.fillRect(x, VH - h - camY * 0.05, 1, h + camY * 0.05);
    }
    ctx.restore();
    /* embers rising */
    ctx.save();
    for (let i = 0; i < 40; i++) {
      const ex = (i * 71 + Math.sin(G.t * 0.5 + i) * 20 - camX * 0.25) % (VW + 40) - 20;
      const ey = ((i * 47 - G.t * (14 + (i % 5) * 8)) % (VH + 40) + VH + 40) % (VH + 40) - 20 - camY * 0.2;
      ctx.globalAlpha = 0.25 + (i % 3) * 0.15;
      ctx.fillStyle = (i % 3 === 0) ? '#ffd06a' : '#ff7a2a';
      ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    }
    ctx.restore();
  } else if (room.bg === 'lair') {
    ctx.drawImage(makeSky('lair', [[0, '#1a0d14'], [0.5, '#2a1018'], [1, '#4a1a16']]), 0, 0);
    drawCaveWall(camX, camY, 0.42);
    ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#ff5a2a';
    ctx.fillRect(0, VH * 0.55, VW, VH * 0.45); ctx.restore();
  } else {
    ctx.drawImage(makeSky('cave', [[0, '#0c0a15'], [0.55, '#151223'], [1, '#1d1830']]), 0, 0);
    drawCaveWall(camX, camY, room.mode === 'top' ? 0.0 : 0.45);
  }
}
function drawCaveWall(camX, camY, par) {
  const t = Art.tile.caveBg;
  const ox = -(camX * par) % 16, oy = -(camY * par) % 16;
  for (let y = -16; y < VH + 16; y += 16) for (let x = -16; x < VW + 16; x += 16) {
    const tx = Math.floor((x - ox) / 16), ty = Math.floor((y - oy) / 16);
    ctx.drawImage(t[((tx * 7 + ty * 13) & 3)], Math.round(x + ox), Math.round(y + oy));
  }
}

function drawTiles(camX, camY) {
  const room = G.room;
  const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(room.w - 1, Math.floor((camX + VW) / TILE));
  const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(room.h - 1, Math.floor((camY + VH) / TILE));
  const wf = Math.floor(G.t / 0.15) % 4;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = room.grid[ty * room.w + tx];
    if (!t) continue;
    const v = (tx * 7 + ty * 13) & 3;
    let img = null;
    switch (t) {
      case T_GRASS: img = Art.tile.grass[v]; break;
      case T_DIRT: img = Art.tile.dirt[v]; break;
      case T_ROCK: img = Art.tile.rock[v]; break;
      case T_ROCKTOP: img = Art.tile.rockTop[v]; break;
      case T_WOOD: img = Art.tile.wood[v & 1]; break;
      case T_WATER: img = Art.tile.water[wf]; break;
      case T_WATERD: img = Art.tile.waterDeep[wf]; break;
      case T_PATH: img = Art.tile.path[v]; break;
      case T_BOUNCE: img = Art.tile.bounce[v]; break;
      case T_CLOUD: img = Art.tile.cloud[v]; break;
      case T_MARBLE: img = Art.tile.marble[v]; break;
      case T_CLOUDP: img = Art.tile.cloudLedge[v]; break;
      case T_MYC: img = Art.tile.myc[v]; break;
      case T_LADDER: {
        const sd = room.ladderSide(tx, ty);
        img = sd > 0 ? Art.tile.ladder.r : (sd < 0 ? Art.tile.ladder.l : Art.tile.ladder.c);
        break;
      }
      case T_DEEPSTONE: img = Art.tile.deepStone[v]; break;
      case T_DEEPTOP: img = Art.tile.deepTop[v]; break;
      case T_SAND: img = Art.tile.sand[v]; break;
      case T_ASH: img = Art.tile.ash[v]; break;
      case T_ASHTOP: img = Art.tile.ashTop[v]; break;
      case T_OBSID: img = Art.tile.obsid[v]; break;
      case T_CAVEBG: img = Art.tile.caveBg[v]; break;
    }
    if (!img) continue;
    if (t === T_WATER && !room.wet(tx, ty - 1) && !room.solid(tx, ty - 1)) {
      /* open water: draw the tile, then a crest that travels across the whole pool */
      ctx.drawImage(img, tx * TILE, ty * TILE);
      const wt = G.t;
      for (let i = 0; i < TILE; i++) {
        const wx = tx * TILE + i;
        const h = Math.sin(wx * 0.16 - wt * 2.6) * 1.5
                + Math.sin(wx * 0.061 + wt * 1.4) * 1.1
                + Math.sin(wx * 0.33 - wt * 3.7) * 0.5;
        const top = ty * TILE - Math.round(Math.max(0, h));
        ctx.fillStyle = '#cfeaff';
        ctx.fillRect(wx, top, 1, 1);
        if (h > 1.4) { ctx.fillStyle = '#ffffff'; ctx.fillRect(wx, top, 1, 1); }
        ctx.fillStyle = '#5fa3dc';
        ctx.fillRect(wx, top + 1, 1, 1);
        if (h < -0.8) { ctx.fillStyle = '#2f6fb0'; ctx.fillRect(wx, ty * TILE + 1, 1, 1); }
      }
      continue;
    }
    if (t === T_BOUNCE) {
      const sq = Math.sin(G.t * 2.2 + tx * 0.5) * 0.8;
      ctx.drawImage(img, tx * TILE, Math.round(ty * TILE + sq));
    } else ctx.drawImage(img, tx * TILE, ty * TILE);
  }
}

function drawVine(c2, x, y, len, phase, sway) {
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const dx = Math.sin(phase + t * 2.4) * sway * t * 1.6;
    c2.fillStyle = (i % 6 === 0) ? '#2a5626' : '#367030';
    c2.fillRect(Math.round(x + dx), Math.round(y + i), 1, 1);
    if (i % 5 === 2) {
      c2.fillStyle = '#4f9a3f';
      const s = (i % 10 === 2) ? 1 : -2;
      c2.fillRect(Math.round(x + dx + s), Math.round(y + i), 2, 1);
      c2.fillStyle = '#7ec44f';
      c2.fillRect(Math.round(x + dx + s), Math.round(y + i), 1, 1);
    }
  }
  c2.fillStyle = '#7ec44f';
  const dxE = Math.sin(phase + 2.4) * sway * 1.6;
  c2.fillRect(Math.round(x + dxE), Math.round(y + len), 1, 2);
}
function drawTorch(c2, x, y, seedT) {
  blit(c2, Art.prop.torch.c, x, y, Art.prop.torch.ax, Art.prop.torch.ay);
  const f = G.t * 9 + seedT;
  c2.save();
  c2.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    const r = (5 - i) * (0.85 + Math.sin(f + i) * 0.2);
    const fy = y - 12 - i * 2.6 + Math.sin(f * 1.3 + i) * 0.9;
    const fx = x + Math.sin(f * 0.9 + i * 1.7) * (1.2 + i * 0.5);
    c2.fillStyle = ['#fff0b0', '#ffc44d', '#ff8a2a', '#d8431a'][i];
    c2.globalAlpha = 0.9 - t * 0.3;
    c2.beginPath(); c2.arc(Math.round(fx), Math.round(fy), Math.max(1, r), 0, TAU); c2.fill();
  }
  c2.globalAlpha = 0.18;
  c2.fillStyle = '#ff9a3c';
  c2.beginPath(); c2.arc(Math.round(x), Math.round(y - 14), 26 + Math.sin(f) * 2, 0, TAU); c2.fill();
  c2.restore();
  if (Math.random() < 0.14) G.particles.push(new Particle({
    x: x + rr(-2, 2), y: y - 14, vx: rr(-0.3, 0.3), vy: rr(-1.2, -0.4), life: rr(0.4, 0.9),
    col: '#ffb638', col2: '#8a2a10', size: rr(1, 2), grav: -0.02, type: 'fire'
  }));
}
function drawDecor(layer, camX, camY) {
  const room = G.room;
  const wind = G.t * 1.15;
  for (const d of room.decor) {
    if (d.layer !== layer) continue;
    if (d.x < camX - 130 || d.x > camX + VW + 130) continue;
    if (d.y < camY - 160 || d.y > camY + VH + 160) continue;
    switch (d.kind) {
      case 'tree': {
        const t = Art.prop.trees[d.idx];
        blitSway(ctx, t.c, d.x, d.y, d.sway, wind * 0.6 + d.phase, t.ax, t.ay, 10, 1, d.alpha);
        break;
      }
      case 'bush': { const s = Art.prop.bush[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind + d.phase, s.ax, s.ay, 5); break; }
      case 'tuft': { const s = Art.prop.tuft[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.3 + d.phase, s.ax, s.ay, 5); break; }
      case 'flower': { const s = Art.prop.flower[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.2 + d.phase, s.ax, s.ay, 6); break; }
      case 'reed': { const s = Art.prop.reed[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.5 + d.phase, s.ax, s.ay, 7); break; }
      case 'mushroom': { const s = Art.prop.mushroom[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'rock': { const s = Art.prop.rock[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'stal': { const s = Art.prop.stal[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'crystal': {
        const s = Art.prop.crystal[d.idx];
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.16 + Math.sin(G.t * 1.6 + d.x) * 0.06;
        ctx.fillStyle = ['#59c9e8', '#a86fe0', '#5ce09a'][d.idx];
        ctx.beginPath(); ctx.arc(Math.round(d.x), Math.round(d.y - 10), 20, 0, TAU); ctx.fill();
        ctx.restore();
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        break;
      }
      case 'vine': drawVine(ctx, d.x, d.y, d.len, wind * 0.8 + d.phase, d.sway); break;
      case 'arrow': {
        const s = Art.prop.arrow[d.dir];
        const pulse = 0.72 + Math.sin(G.t * 2.4 + d.x * 0.05) * 0.24;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.10 * pulse;
        ctx.fillStyle = '#f0c93a';
        ctx.beginPath(); ctx.arc(Math.round(d.x), Math.round(d.y), 17, 0, TAU); ctx.fill();
        ctx.restore();
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay, false, pulse);
        break;
      }
      case 'sign': {
        const s = Art.prop.sign;
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        const lines = signLines(d);
        let w = 0;
        for (const l of lines) w = Math.max(w, textWidth(l) + 8);
        const h = lines.length * 10 + 2;
        const top = d.y - 34 - h;
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = 'rgba(26,20,14,0.82)';
        ctx.fillRect(Math.round(d.x - w / 2), Math.round(top), Math.round(w), h);
        ctx.fillStyle = '#c68e3f';
        ctx.fillRect(Math.round(d.x - w / 2), Math.round(top), Math.round(w), 1);
        lines.forEach((l, k) => drawText(ctx, l, d.x, top + 3 + k * 10, '#ffeec0', 1, 'center'));
        ctx.restore();
        break;
      }
      case 'support': { const s = Art.prop.support; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'column': { const s = Art.prop.column[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'statue': { const s = Art.prop.statue; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'brazier': {
        const s = Art.prop.brazier;
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        const f = G.t * 8 + d.x * 0.2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          ctx.globalAlpha = 0.8 - i * 0.2;
          ctx.fillStyle = ['#fff0b0', '#ffc44d', '#ff8a2a'][i];
          ctx.beginPath();
          ctx.arc(Math.round(d.x + Math.sin(f + i) * 1.4), Math.round(d.y - 17 - i * 2.4), Math.max(1, 4 - i), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 0.14; ctx.fillStyle = '#ffb04a';
        ctx.beginPath(); ctx.arc(Math.round(d.x), Math.round(d.y - 18), 24, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'puff': {
        const c = Art.prop.puff[d.idx];
        const dx = Math.sin(G.t * 0.12 + d.phase) * d.drift * 4;
        ctx.save(); ctx.globalAlpha = d.layer === 2 ? 0.5 : 0.75;
        ctx.drawImage(c, Math.round(d.x - 32 + dx), Math.round(d.y - 15));
        ctx.restore();
        break;
      }
      case 'coral': { const s = Art.prop.coral[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 0.5 + d.phase, s.ax, s.ay, 6); break; }
      case 'kelp': { const s = Art.prop.kelp[d.idx]; blitSway(ctx, s.c, d.x, d.y, d.sway * 2.4, wind * 0.9 + d.phase, s.ax, s.ay, 8); break; }
      case 'pillar': { const s = Art.prop.pillar[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'shroom': {
        const s = Art.prop.shroom[d.idx];
        blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 0.7 + d.phase, s.ax, s.ay, 8, 1, d.layer === 2 ? 0.92 : 1);
        break;
      }
      case 'rail': { const s = Art.prop.rail; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'cart': { const s = Art.prop.cart; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'ore': { const s = Art.prop.ore[d.idx]; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'lantern': {
        const s = Art.prop.lantern;
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        const f = G.t * 5 + d.x * 0.2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.16 + Math.sin(f) * 0.05;
        ctx.fillStyle = '#ffd06a';
        ctx.beginPath(); ctx.arc(Math.round(d.x), Math.round(d.y + 9), 22 + Math.sin(f) * 2, 0, TAU); ctx.fill();
        ctx.restore();
        break;
      }
      case 'torch': drawTorch(ctx, d.x, d.y, d.x * 0.3); break;
      case 'hoard': {
        ctx.fillStyle = '#f5c53a';
        ctx.beginPath(); ctx.arc(Math.round(d.x), Math.round(d.y), d.r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffeaa0';
        ctx.fillRect(Math.round(d.x - 1), Math.round(d.y - d.r), 1, 1);
        break;
      }
    }
  }
}

/* a sign names the key that is really bound, so rebinding keeps it true */
function signText(d) {
  const raw = (G.mobile ? d.mob : d.pc) || '';
  return raw.replace(/\{(\w+)\}/g, (m, k) => (KEYS[k] ? keyLabel(KEYS[k]) : m));
}
/* a long sign breaks near its middle, so the board stays narrow enough
   to read without covering the ground it stands on */
function signLines(d) {
  const txt = signText(d);
  if (txt.length <= 18) return [txt];
  const words = txt.split(' ');
  if (words.length < 2) return [txt];
  let best = 1, gap = 1e9;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length, b = words.slice(i).join(' ').length;
    const d2 = Math.abs(a - b) + Math.max(a, b);
    if (d2 < gap) { gap = d2; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}
function drawDoors(camX) {
  for (const ex of G.room.exits) {
    if (!ex.door) continue;
    if (ex.door.x < camX - 80 || ex.door.x > camX + VW + 80) continue;
    const s = (ex.kind === 'cave' || ex.kind === 'mine' || ex.kind === 'mush') ? Art.prop.doorCave : Art.prop.doorMaze;
    blit(ctx, s.c, ex.door.x, ex.door.y, s.ax, s.ay);
    if (ex.needKey && !G.player.hasKey) {
      /* a golden seal across the mouth */
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(G.t * 3) * 0.12;
      ctx.fillStyle = '#f5c53a';
      for (let i = 0; i < 5; i++) ctx.fillRect(ex.door.x - 14, ex.door.y - 38 + i * 8, 28, 3);
      ctx.restore();
      blit(ctx, Art.item.key, ex.door.x, ex.door.y - 20, 8, 5, false, 0.85);
    }
    /* a soft glow to read as a doorway */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.10 + Math.sin(G.t * 1.4) * 0.03;
    ctx.fillStyle = ex.kind === 'cave' ? '#ff8a3c' : (ex.kind === 'mush' ? '#9be89a' : '#9fe8ff');
    ctx.beginPath(); ctx.arc(ex.door.x, ex.door.y - 20, 26, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function drawSlash(c2, p) {
  if (p.atkT <= 0) return;
  const k = clamp((p.atkT - 0.05) / 0.20, 0, 1);
  if (k <= 0 || k >= 1) return;
  const top = G.room.mode === 'top';
  const baseAng = top ? [Math.PI / 2, Math.PI, -Math.PI / 2, 0][p.topDir] : 0;
  const cx = p.cx, cy = top ? p.cy : p.y + 5;
  const R = 19 + p.up.sword * 2;
  c2.save();
  c2.globalAlpha = (1 - k) * 0.95;
  for (let i = 0; i < 12; i++) {
    const a = lerp(-1.9, 0.8, k) - i * 0.075;
    const r = R - i * 0.5;
    let ax = Math.cos(a) * r, ay = Math.sin(a) * r;
    if (top) {
      const ca = Math.cos(baseAng), sa = Math.sin(baseAng);
      const rx = ax * ca - ay * sa, ry = ax * sa + ay * ca;
      ax = rx; ay = ry;
    } else ax *= p.face;
    c2.fillStyle = i < 3 ? '#ffffff' : (i < 7 ? '#dcefff' : '#9dc4f0');
    c2.fillRect(Math.round(cx + ax), Math.round(cy + ay), 2, 2);
  }
  c2.restore();
}

/* ---------- lighting ---------- */
let lightCv = null, lightCtx = null;
const LW = VW >> 1, LH = VH >> 1;
function drawLighting(camX, camY) {
  const dark = G.room.dark;
  if (!dark) return;
  if (!lightCv) { lightCv = mkc(LW, LH); lightCtx = lightCv.getContext('2d'); }
  const lc = lightCtx;
  lc.globalCompositeOperation = 'source-over';
  lc.clearRect(0, 0, LW, LH);
  lc.fillStyle = 'rgba(6,4,14,' + dark + ')';
  lc.fillRect(0, 0, LW, LH);
  lc.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, r, str) => {
    const x = (wx - camX) / 2, y = (wy - camY) / 2, rr2 = r / 2;
    /* one stray coordinate must never take the whole frame down */
    if (!isFinite(x) || !isFinite(y) || !isFinite(rr2) || rr2 <= 0) return;
    if (x < -rr2 || x > LW + rr2 || y < -rr2 || y > LH + rr2) return;
    const g2 = lc.createRadialGradient(x, y, 0, x, y, rr2);
    g2.addColorStop(0, 'rgba(0,0,0,' + str + ')');
    g2.addColorStop(0.55, 'rgba(0,0,0,' + str * 0.6 + ')');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g2;
    lc.beginPath(); lc.arc(x, y, rr2, 0, TAU); lc.fill();
  };
  const p = G.player;
  hole(p.cx, p.cy, 150 + Math.sin(G.t * 2) * 6, 1);
  for (const d of G.room.decor) {
    if (d.kind === 'torch') hole(d.x, d.y - 12, 108 + Math.sin(G.t * 7 + d.x) * 8, 1);
    else if (d.kind === 'lantern') hole(d.x, d.y + 9, 116 + Math.sin(G.t * 5 + d.x) * 6, 1);
    else if (d.kind === 'brazier') hole(d.x, d.y - 16, 96 + Math.sin(G.t * 6 + d.x) * 6, 1);
    else if (d.kind === 'crystal') hole(d.x, d.y - 8, 62, 0.75);
    else if (d.kind === 'arrow') hole(d.x, d.y, 52, 0.8);
    else if (d.kind === 'ore') hole(d.x, d.y - 6, 40, 0.5);
  }
  for (const pr of G.projectiles) hole(pr.x, pr.y, 80, 0.9);
  if (G.boss && G.boss.state === 'breathe') hole(G.boss.x + G.boss.face * 70, G.boss.y - 40, 220, 1);
  lc.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightCv, 0, 0, VW, VH);
}

function drawWorld() {
  const sk = G.shakeAmt;
  const sx = sk > 0.2 ? rr(-sk, sk) : 0, sy = sk > 0.2 ? rr(-sk, sk) : 0;
  const camX = Math.round(G.cam.x + sx), camY = Math.round(G.cam.y + sy);
  drawBackground(camX, camY);
  ctx.save();
  ctx.translate(-camX, -camY);
  drawDecor(0, camX, camY);
  drawTiles(camX, camY);
  drawDoors(camX);
  drawDecor(1, camX, camY);
  for (const c of G.coins) c.draw(ctx);
  for (const it of G.items) it.draw(ctx);
  for (const e of G.enemies) e.draw(ctx);
  G.player.draw(ctx);
  drawSlash(ctx, G.player);
  for (const pr of G.projectiles) pr.draw(ctx);
  for (const wv of G.waves) wv.draw(ctx);
  for (const pa of G.particles) pa.draw(ctx);
  for (const tx of G.texts) tx.draw(ctx);
  drawDecor(2, camX, camY);
  ctx.restore();
  drawAcid(camX, camY);
  drawLighting(camX, camY);
  drawHUD();
  drawTransition(ctx);
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
  if (G.state === 'dead') drawDeath();
  if (G.state === 'victory') drawVictoryOverlay();
  drawAimCross();
  drawPad();
  if (G.shopOpen) drawShop();
  if (G.codesOpen) drawCodes();
  drawRelicShow();
  if (G.settingsOpen) drawSettings();
  drawCursor();
}

/* ============================================================
   HUD
   ============================================================ */
function panel(c2, x, y, w, h) {
  c2.fillStyle = '#1a1626'; c2.fillRect(x, y, w, h);
  c2.fillStyle = '#241f36'; c2.fillRect(x + 2, y + 2, w - 4, h - 4);
  c2.fillStyle = '#3a3350'; c2.fillRect(x + 2, y + 2, w - 4, 1);
  c2.fillStyle = '#12101c';
  c2.fillRect(x, y, w, 1); c2.fillRect(x, y + h - 1, w, 1);
  c2.fillRect(x, y, 1, h); c2.fillRect(x + w - 1, y, 1, h);
  /* corner studs */
  c2.fillStyle = '#c68e3f';
  c2.fillRect(x + 3, y + 3, 2, 2); c2.fillRect(x + w - 5, y + 3, 2, 2);
  c2.fillRect(x + 3, y + h - 5, 2, 2); c2.fillRect(x + w - 5, y + h - 5, 2, 2);
}
function drawHUD() {
  const p = G.player;
  /* shop sign, top left */
  const hov = G.overShopIcon && !G.shopOpen;
  const bob = Math.sin(G.t * 2) * 0.8 + (hov ? -1.5 : 0);
  if (hov) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffd66a'; ctx.beginPath(); ctx.arc(15, 15, 16, 0, TAU); ctx.fill(); ctx.restore();
  }
  blit(ctx, Art.ui.shop, 15, 15 + bob, 11, 11);
  if (hov) drawText(ctx, 'SHOP', 15, 29, '#ffe98a', 1, 'center', '#000000');

  /* codes, under the shop sign */
  const chov = G.overCodeIcon;
  const cbob = Math.sin(G.t * 2 + 2) * 0.8 + (chov ? -1.5 : 0);
  if (chov) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#9be89a'; ctx.beginPath(); ctx.arc(15, 41, 16, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (G.roomId !== 'tutorial') blit(ctx, Art.ui.codes, 15, 41 + cbob, 11, 11);
  if (chov) drawText(ctx, 'CODES', 15, 55, '#9be89a', 1, 'center', '#000000');
  const unspent = Object.keys(G.codes.found).filter(c => !G.codes.used[c]).length + G.codes.tickets;
  if (unspent > 0 && !chov && G.roomId !== 'tutorial') {
    ctx.fillStyle = '#6fc46a';
    ctx.fillRect(22, 32 + cbob, 6, 6);
    drawText(ctx, String(Math.min(9, unspent)), 24, 33 + cbob, '#12200e', 1, 'left');
  }

  /* the chart, top right: your way back to the map */
  const mhov = G.overMapIcon;
  const mbob = Math.sin(G.t * 2 + 1) * 0.8 + (mhov ? -1.5 : 0);
  if (mhov) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffd66a'; ctx.beginPath(); ctx.arc(VW - 15, 15, 16, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (G.roomId !== 'tutorial') blit(ctx, Art.ui.map, VW - 15, 15 + mbob, 11, 11);
  if (mhov) drawText(ctx, 'MAP', VW - 15, 29, '#ffe98a', 1, 'center', '#000000');

  /* hearts */
  const hearts = Math.ceil(p.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const v = p.hp - i * 2;
    const img = v >= 2 ? Art.item.heart.full : (v === 1 ? Art.item.heart.half : Art.item.heart.empty);
    ctx.drawImage(img, 32 + i * 12, 5);
  }
  /* coins */
  ctx.drawImage(Art.item.coin[Math.floor(G.t / 0.09) % 8], 32, 17);
  drawText(ctx, G.purse(), 46, 19, G.codes.admin ? '#ffeec0' : '#ffe98a', G.codes.admin ? 2 : 1, 'left', '#000000');
  /* dash meter */
  const dw = 42, dx = 32, dy = 29;
  ctx.fillStyle = '#12101c'; ctx.fillRect(dx - 1, dy - 1, dw + 2, 5);
  ctx.fillStyle = '#2b2740'; ctx.fillRect(dx, dy, dw, 3);
  const f = p.dashCd > 0 ? 1 - p.dashCd / p.dashCdMax : 1;
  ctx.fillStyle = f >= 1 ? (Math.floor(G.t * 6) % 2 ? '#ffe98a' : '#ffd04a') : '#5f7fb0';
  ctx.fillRect(dx, dy, Math.round(dw * f), 3);
  drawText(ctx, 'DASH', dx + dw + 4, dy - 2, f >= 1 ? '#ffe98a' : '#6d7994', 1, 'left', '#000000');

  /* everything below the dash bar stacks in order, never overlapping */
  let stack = dy + 9;
  if (G.bossFightOn()) {
    /* the pierce is rationed while a guardian is up */
    const pf = p.pierceCd > 0 ? 1 - p.pierceCd / 1.0 : 1;
    ctx.fillStyle = '#12101c'; ctx.fillRect(dx - 1, stack - 1, dw + 2, 5);
    ctx.fillStyle = '#2b2740'; ctx.fillRect(dx, stack, dw, 3);
    ctx.fillStyle = pf >= 1 ? '#9be89a' : '#8a5f9a';
    ctx.fillRect(dx, stack, Math.round(dw * pf), 3);
    drawText(ctx, 'PRC', dx + dw + 4, stack - 2, pf >= 1 ? '#9be89a' : '#6d7994', 1, 'left', '#000000');
    stack += 9;
  }
  if (p.hasKey) {
    ctx.drawImage(Art.item.key, dx, stack);
    drawText(ctx, 'KEY', dx + 18, stack + 1, '#ffe98a', 1, 'left', '#000000');
    stack += 13;
  }
  if (G.combo >= 2) {
    const m = G.comboMult();
    const col = m >= 3 ? '#ff8b4a' : (m >= 2 ? '#ffd04a' : '#c9d4e8');
    const pop = Math.min(1, G.comboT / 2.6);
    drawText(ctx, G.combo + ' HIT', dx, stack, col, 1, 'left', '#000000');
    if (m > 1) drawText(ctx, 'X' + m.toFixed(1).replace('.0', '') + ' COINS', dx + 34, stack, col, 1, 'left', '#000000');
    ctx.fillStyle = '#12101c'; ctx.fillRect(dx - 1, stack + 8, dw + 2, 3);
    ctx.fillStyle = col; ctx.fillRect(dx, stack + 9, Math.round(dw * pop), 1);
  }

  /* dash aim line */
  if (p.dashCd <= 0 && !p.dead && G.state === 'play' && !G.shopOpen && !G.mobile) {
    const px = p.cx - G.cam.x, py = p.cy - 2 - G.cam.y;
    const dxm = Input.mx - px, dym = Input.my - py;
    const l = Math.hypot(dxm, dym);
    if (l > 14) {
      ctx.save(); ctx.globalAlpha = 0.30; ctx.fillStyle = '#ffe98a';
      for (let d = 14; d < Math.min(l - 6, 60); d += 5)
        ctx.fillRect(Math.round(px + dxm / l * d), Math.round(py + dym / l * d), 1, 1);
      ctx.restore();
    }
  }

  /* boss health */
  if (G.boss && G.boss.awake && !G.boss.dead) {
    const bw = 190, bx = (VW - bw) / 2, by = 14;
    const bn = G.boss.title || ['THE EMBER WYRM', 'ZEUS, LORD OF THE STORM', 'THE MOTHER SPORE'][G.level] || 'GUARDIAN';
    drawText(ctx, bn, VW / 2, by - 9, '#ffb0a0', 1, 'center', '#000000');
    ctx.fillStyle = '#12101c'; ctx.fillRect(bx - 2, by - 2, bw + 4, 9);
    ctx.fillStyle = '#3a1c22'; ctx.fillRect(bx, by, bw, 5);
    const hf = clamp(G.boss.hp / G.boss.maxHp, 0, 1);
    ctx.fillStyle = hf > 0.5 ? '#d94f3a' : (hf > 0.22 ? '#e08a2a' : '#ffd04a');
    ctx.fillRect(bx, by, Math.round(bw * hf), 5);
    ctx.fillStyle = '#ff9a8a'; ctx.fillRect(bx, by, Math.round(bw * hf), 1);
  }

  /* area banner */
  if (G.bannerT > 0) {
    const a = Math.min(1, G.bannerT * 1.6, (2.4 - G.bannerT) * 3 + 0.2);
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    const y = G.boss && G.boss.awake ? 42 : 30;
    const w = textWidth(G.bannerTxt) * 2 + 16;
    ctx.fillStyle = 'rgba(10,8,18,0.72)';
    ctx.fillRect(Math.round(VW / 2 - w / 2), y - 4, Math.round(w), 16);
    ctx.fillStyle = '#c68e3f';
    ctx.fillRect(Math.round(VW / 2 - w / 2), y - 4, Math.round(w), 1);
    ctx.fillRect(Math.round(VW / 2 - w / 2), y + 11, Math.round(w), 1);
    drawText(ctx, G.bannerTxt, VW / 2, y, '#f2e2b8', 2, 'center', '#241a10');
    ctx.restore();
  }
  if (G.nearExit && !G.trans) {
    const ex = G.nearExit, locked = G.nearExitLocked;
    const txt = exitPromptText(locked);
    const r = exitPromptRect(ex, locked);
    const hot = !locked && Input.over(r);
    ctx.save();
    ctx.globalAlpha = 0.85 + Math.sin(G.t * 4) * 0.15;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.92)' : 'rgba(10,8,18,0.78)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = locked ? '#c9403a' : (hot ? '#ffd04a' : '#c68e3f');
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    drawText(ctx, txt, r.x + r.w / 2, r.y + 3, locked ? '#ff9a8a' : '#f2e2b8', 1, 'center');
    ctx.restore();
    if (!locked && ex.label) {
      /* the label follows the button, and is held on screen the same way */
      const lw = textWidth(ex.label);
      const lx = clamp(r.x + r.w / 2, lw / 2 + 3, VW - lw / 2 - 3);
      drawText(ctx, ex.label, lx, r.y + 14, '#9aa8c4', 1, 'center', '#000000');
    }
  }
  /* the way out of the tutorial, top right */
  if (G.roomId === 'tutorial' && G.state === 'play') {
    const r = SKIP_RECT, hot = G.overSkip;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.95)' : 'rgba(10,8,18,0.72)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hot ? '#ffd04a' : '#c68e3f';
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    drawText(ctx, 'SKIP', r.x + r.w / 2, r.y + 4, hot ? '#ffeec0' : '#d8c49a', 1, 'center');
  }
  /* the training checklist */
  if (G.roomId === 'tutorial') {
    const bx = VW - 128, by = 34;
    ctx.fillStyle = 'rgba(10,8,18,0.62)';
    ctx.fillRect(bx - 4, by - 5, 126, TUT_STEPS.length * 10 + 14);
    ctx.fillStyle = '#c68e3f';
    ctx.fillRect(bx - 4, by - 5, 126, 1);
    drawText(ctx, 'LEARN THESE', bx, by - 2, '#f2e2b8', 1, 'left');
    TUT_STEPS.forEach((s, i) => {
      const done = !!G.tut[s.key];
      const y = by + 9 + i * 10;
      ctx.fillStyle = '#12101c'; ctx.fillRect(bx, y, 7, 7);
      if (done) { ctx.fillStyle = '#6fc46a'; ctx.fillRect(bx + 2, y + 2, 3, 3); }
      drawText(ctx, s.label, bx + 11, y + 1, done ? '#6fc46a' : '#a9b3c9', 1, 'left');
    });
  }
  if (G.audioHint) drawText(ctx, 'CLICK FOR SOUND', VW - 4, VH - 10, '#5b6480', 1, 'right');
}
function drawCursor() {
  if (G.mobile) return;                 /* a finger needs no crosshair */
  const x = Math.round(Input.mx), y = Math.round(Input.my);
  const ready = G.player && G.player.dashCd <= 0 && G.state === 'play';
  ctx.fillStyle = '#08060e';
  ctx.fillRect(x - 5, y - 1, 4, 3); ctx.fillRect(x + 2, y - 1, 4, 3);
  ctx.fillRect(x - 1, y - 5, 3, 4); ctx.fillRect(x - 1, y + 2, 3, 4);
  ctx.fillStyle = ready ? '#ffe98a' : '#9aa8c4';
  ctx.fillRect(x - 5, y, 4, 1); ctx.fillRect(x + 2, y, 4, 1);
  ctx.fillRect(x, y - 5, 1, 4); ctx.fillRect(x, y + 2, 1, 4);
  if (ready) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1); }
}

/* ============================================================
   TOUCH CONTROLS — laid over the game, faint until pressed
   ============================================================ */
/* the four arrows sit on one round pad, so a thumb between two of them
   presses both and the hero moves on the diagonal */
const PAD_HUB = { x: 50, y: 168, r: 48, dead: 7 };
const PAD = [
  { act: 'left',   x: 18,  y: 168, w: 30, h: 30, icon: 'left',  dir: 'left' },
  { act: 'right',  x: 82,  y: 168, w: 30, h: 30, icon: 'right', dir: 'right' },
  { act: 'up',     x: 50,  y: 136, w: 30, h: 30, icon: 'up',    dir: 'up' },
  { act: 'down',   x: 50,  y: 200, w: 30, h: 30, icon: 'down',  dir: 'down' },
  { act: 'attack', x: 340, y: 186, w: 38, h: 38, label: 'CUT' },
  { act: 'dash',   x: 300, y: 172, w: 30, h: 30, label: 'DSH' },
  { act: 'pierce', x: 330, y: 142, w: 28, h: 28, label: 'PRC' },
  { act: 'swim',   x: 372, y: 146, w: 24, h: 24, art: 'swimBtn' }
];
function padVisible(b) { void b; return true; }
function padRect(b) { return { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h }; }
function padActive() {
  return G.mobile && G.state === 'play' && !G.shopOpen && !G.codesOpen && !G.settingsOpen && !G.trans;
}
/* one finger on the round pad gives one or two directions, by its angle */
function hubDirs(t, out) {
  const dx = t.x - PAD_HUB.x, dy = t.y - PAD_HUB.y;
  const d = Math.hypot(dx, dy);
  if (d > PAD_HUB.r || d < PAD_HUB.dead) return;
  /* eight sectors: the four straight ones and the four corners */
  const oct = Math.round(Math.atan2(dy, dx) / (TAU / 8));
  const names = [['right'], ['right', 'down'], ['down'], ['left', 'down'],
                 ['left'], ['left', 'up'], ['up'], ['right', 'up']];
  for (const n of names[((oct % 8) + 8) % 8]) out[n] = true;
}
/* read the fingers before the game does, and push them in as action state */
function updatePad() {
  const now = Object.create(null);
  if (padActive()) {
    const pts = Input.touches.length ? Input.touches
              : (Input.mdown ? [{ x: Input.mx, y: Input.my }] : []);
    for (const t of pts) {
      hubDirs(t, now);
      /* the plates themselves still answer, with a generous margin,
         so several buttons can be held at once */
      for (const b of PAD) {
        if (!padVisible(b)) continue;
        const r = padRect(b);
        if (t.x >= r.x - 4 && t.x <= r.x + r.w + 4 && t.y >= r.y - 4 && t.y <= r.y + r.h + 4) now[b.act] = true;
      }
    }
  }
  const hit = Object.create(null);
  for (const b of PAD) {
    const was = !!G.padOn[b.act], is = !!now[b.act];
    if (is && !was) hit[b.act] = true;
  }
  Input.padHeld = now;
  Input.padHitAct = hit;
  G.padOn = now;
  updateAimDrag();
}
/* the mobile reticle: a handle you drag to aim the dash */
const AIM_GRAB = 26;
function overAnyPad(x, y) {
  if (Math.hypot(x - PAD_HUB.x, y - PAD_HUB.y) <= PAD_HUB.r) return true;
  for (const b of PAD) {
    if (!padVisible(b)) continue;
    const r = padRect(b);
    if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4) return true;
  }
  return false;
}
function updateAimDrag() {
  if (!padActive()) { G.aimDrag = null; return; }
  const pts = Input.touches.length
    ? Input.touches
    : (Input.mdown ? [{ id: 'mouse', x: Input.mx, y: Input.my }] : []);
  /* keep following the finger that already has hold of it */
  if (G.aimDrag !== null) {
    for (const t of pts) {
      if (t.id === G.aimDrag) {
        G.aimX = clamp(t.x, 2, VW - 3);
        G.aimY = clamp(t.y, 2, VH - 3);
        G.aimGrabT = 1;
        return;
      }
    }
    G.aimDrag = null;
  }
  G.aimGrabT = Math.max(0, G.aimGrabT - 0.06);
  /* otherwise, a finger landing near it picks it up */
  for (const t of pts) {
    if (overAnyPad(t.x, t.y)) continue;
    if (Math.hypot(t.x - G.aimX, t.y - G.aimY) > AIM_GRAB) continue;
    G.aimDrag = t.id === undefined ? 'mouse' : t.id;
    G.aimX = clamp(t.x, 2, VW - 3);
    G.aimY = clamp(t.y, 2, VH - 3);
    G.aimGrabT = 1;
    return;
  }
}
function drawAimCross() {
  if (!padActive()) return;
  const x = Math.round(G.aimX), y = Math.round(G.aimY);
  const held = G.aimDrag !== null;
  const p = G.player;
  const ready = p && p.dashCd <= 0;
  /* the line the dash would take */
  const px = p.cx - G.cam.x, py = p.cy - 2 - G.cam.y;
  const dx = x - px, dy = y - py, l = Math.hypot(dx, dy);
  if (l > 16) {
    ctx.save();
    ctx.globalAlpha = ready ? 0.34 : 0.16;
    ctx.fillStyle = ready ? '#ffe98a' : '#9aa8c4';
    for (let d = 14; d < l - 10; d += 5) ctx.fillRect(Math.round(px + dx / l * d), Math.round(py + dy / l * d), 1, 1);
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = held ? 1 : (0.55 + G.aimGrabT * 0.3);
  /* a soft grab pad, so it reads as something you can take hold of */
  ctx.fillStyle = held ? 'rgba(255,233,138,0.20)' : 'rgba(12,10,22,0.22)';
  ctx.fillRect(x - 10, y - 8, 20, 16);
  ctx.fillRect(x - 8, y - 10, 16, 20);
  const col = ready ? '#ffe98a' : '#9aa8c4';
  ctx.fillStyle = '#08060e';
  ctx.fillRect(x - 9, y - 1, 6, 3); ctx.fillRect(x + 4, y - 1, 6, 3);
  ctx.fillRect(x - 1, y - 9, 3, 6); ctx.fillRect(x - 1, y + 4, 3, 6);
  ctx.fillStyle = col;
  ctx.fillRect(x - 9, y, 6, 1); ctx.fillRect(x + 4, y, 6, 1);
  ctx.fillRect(x, y - 9, 1, 6); ctx.fillRect(x, y + 4, 1, 6);
  /* ring */
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU + (held ? G.t * 2 : 0);
    ctx.fillRect(Math.round(x + Math.cos(a) * 6), Math.round(y + Math.sin(a) * 6), 1, 1);
  }
  if (ready) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1); }
  ctx.restore();
}

function padPlate(x, y, w, h, on, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha * (on ? 1 : 0.55);
  ctx.fillStyle = on ? 'rgba(255,233,138,0.55)' : 'rgba(12,10,22,0.42)';
  ctx.fillRect(Math.round(x + 2), Math.round(y), Math.round(w - 4), Math.round(h));
  ctx.fillRect(Math.round(x), Math.round(y + 2), Math.round(w), Math.round(h - 4));
  ctx.fillStyle = on ? 'rgba(255,255,255,0.9)' : 'rgba(201,212,232,0.55)';
  ctx.fillRect(Math.round(x + 2), Math.round(y), Math.round(w - 4), 1);
  ctx.fillRect(Math.round(x + 2), Math.round(y + h - 1), Math.round(w - 4), 1);
  ctx.fillRect(Math.round(x), Math.round(y + 2), 1, Math.round(h - 4));
  ctx.fillRect(Math.round(x + w - 1), Math.round(y + 2), 1, Math.round(h - 4));
  ctx.restore();
}
function drawPad() {
  if (!padActive()) return;
  const base = clamp(G.opts.padAlpha, 0.12, 1);
  /* the ring the four arrows share, so the diagonals read as reachable */
  ctx.save();
  ctx.globalAlpha = base * 0.35;
  ctx.fillStyle = 'rgba(12,10,22,0.5)';
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * TAU;
    ctx.fillRect(Math.round(PAD_HUB.x + Math.cos(a) * PAD_HUB.r), Math.round(PAD_HUB.y + Math.sin(a) * PAD_HUB.r), 2, 2);
  }
  ctx.restore();
  for (const b of PAD) {
    if (!padVisible(b)) continue;
    const r = padRect(b), on = !!G.padOn[b.act];
    const alpha = on ? Math.min(1, base + 0.45) : base;
    padPlate(r.x, r.y, r.w, r.h, on, alpha);
    ctx.save();
    ctx.globalAlpha = on ? Math.min(1, base + 0.45) : Math.max(0.15, base * 1.2);
    if (b.icon) {
      /* a chunky arrow: the point sits at the far end, in the way it means */
      const cx = b.x, cy = b.y, s = 7;
      const dx = b.icon === 'left' ? -1 : (b.icon === 'right' ? 1 : 0);
      const dy = b.icon === 'up' ? -1 : (b.icon === 'down' ? 1 : 0);
      ctx.fillStyle = on ? '#ffffff' : '#e6edf6';
      for (let k = 0; k < s; k++) {
        const w = s - k;      /* the bars narrow to a point, and the point leads */
        if (dx) ctx.fillRect(Math.round(cx + dx * (k - s / 2)), Math.round(cy - w / 2), 1, Math.max(1, Math.round(w)));
        else ctx.fillRect(Math.round(cx - w / 2), Math.round(cy + dy * (k - s / 2)), Math.max(1, Math.round(w)), 1);
      }
    } else if (b.act === 'attack') {
      ctx.drawImage(Art.item.sword, Math.round(b.x - 8), Math.round(b.y - 8));
    } else if (b.art) {
      const im = Art.ui[b.art];
      ctx.drawImage(im, Math.round(b.x - im.width / 2), Math.round(b.y - im.height / 2));
    } else {
      drawText(ctx, b.label, b.x, b.y - 3, on ? '#ffffff' : '#e6edf6', 1, 'center');
    }
    ctx.restore();
  }
}

/* aiming: the cursor on a desktop, the pad direction on a phone */
G.aim = function (px, py) {
  const p = G.player;
  /* the cursor on a desktop, the draggable reticle on a phone */
  const sx = G.mobile ? G.aimX : Input.mx;
  const sy = G.mobile ? G.aimY : Input.my;
  const dx = G.cam.x + sx - px, dy = G.cam.y + sy - py;
  const l = Math.hypot(dx, dy);
  if (l < 6) return { x: p.face, y: 0 };
  return { x: dx / l, y: dy / l };
};

/* ============================================================
   SETTINGS — how you play, how loud it is, and which keys do what
   ============================================================ */
const SET_BOX = { x: 26, y: 12, w: 332, h: 192 };
const SET_TABS = ['PLAY', 'KEYS'];
const SLIDER_STEPS = 22;      /* notches the drag blips through */
const SLIDERS = [
  { key: 'music', name: 'MUSIC', min: 0, max: 1, hint: 'THE TRACKS' },
  { key: 'sfx', name: 'SOUND', min: 0, max: 1, hint: 'BLOWS, COINS AND THE WIND' },
  { key: 'padAlpha', name: 'BUTTONS', min: 0.12, max: 1, hint: 'HOW BRIGHT THE TOUCH BUTTONS SIT' }
];
function setTabRect(i) { return { x: SET_BOX.x + 10 + i * 76, y: SET_BOX.y + 20, w: 72, h: 14 }; }
function setCloseRect() { return { x: SET_BOX.x + SET_BOX.w - 18, y: SET_BOX.y + 5, w: 13, h: 13 }; }
function setBackRect() { return { x: SET_BOX.x + 10, y: SET_BOX.y + SET_BOX.h - 20, w: 60, h: 15 }; }
function setResetRect() { return { x: SET_BOX.x + SET_BOX.w - 88, y: SET_BOX.y + SET_BOX.h - 20, w: 78, h: 15 }; }
function setModeRect(i) { return { x: SET_BOX.x + 14 + i * 156, y: SET_BOX.y + 50, w: 148, h: 26 }; }
function setSliderRect(i) { return { x: SET_BOX.x + 108, y: SET_BOX.y + 96 + i * 24, w: 174, h: 9 }; }
/* fifteen controls in two columns, eight then seven */
function keyRowRect(i) {
  const col = i < 8 ? 0 : 1, row = i < 8 ? i : i - 8;
  return { x: SET_BOX.x + 10 + col * 158, y: SET_BOX.y + 50 + row * 15, w: 152, h: 14 };
}
function closeSettings() {
  G.settingsOpen = false; G.setDrag = null; G.bindWait = null;
  saveOptions(); Snd.ui();
}
/* the player is choosing a new key for one control */
function updateBindWait() {
  if (Input.hit('Escape')) { G.bindWait = null; Snd.uiBad(); return; }
  const code = Input.lastCode;
  if (!code) return;
  const act = G.bindWait;
  const old = KEYS[act];
  /* a key already in use swaps places rather than leaving a control dead */
  for (const a of ACTIONS) if (a.key !== act && KEYS[a.key] === code) KEYS[a.key] = old;
  KEYS[act] = code;
  G.bindWait = null;
  saveOptions();
  Snd.buy();
}
function updateSettings() {
  if (G.bindWait) { updateBindWait(); return; }
  if (Input.hit('Escape')) { closeSettings(); return; }

  /* sliders answer to a held finger or a held button, so they can be dragged */
  if (G.setDrag !== null && G.setDrag !== undefined) {
    const sl = SLIDERS[G.setDrag], r = setSliderRect(G.setDrag);
    const t = clamp((Input.mx - r.x) / r.w, 0, 1);
    if (!Input.mdown) {
      Snd.sliderSet(t, sl.key);
      G.setDrag = null; G.setStep = -1; saveOptions();
    } else {
      G.opts[sl.key] = sl.min + t * (sl.max - sl.min);
      applyOptions();
      /* one blip per notch, so the drag ratchets instead of chattering */
      const step = Math.round(t * SLIDER_STEPS);
      if (step !== G.setStep) { G.setStep = step; Snd.sliderTick(t, sl.key); }
      return;
    }
  }

  G.setSel = -1;
  const close = setCloseRect(), back = setBackRect();
  G.setOverClose = Input.over(close);
  G.setOverBack = Input.over(back);

  if (Input.tap(close) || Input.tap(back)) { closeSettings(); return; }
  for (let i = 0; i < SET_TABS.length; i++) {
    if (Input.tap(setTabRect(i))) { G.setTab = i; Snd.ui(); return; }
  }

  if (G.setTab === 0) {
    for (let i = 0; i < 2; i++) if (Input.over(setModeRect(i))) G.setSel = i;
    for (let i = 0; i < SLIDERS.length; i++) {
      const r = setSliderRect(i);
      const grab = { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 };
      if (Input.tap(grab)) {
        G.setDrag = i;
        const sl = SLIDERS[i];
        const t = clamp((Input.mx - r.x) / r.w, 0, 1);
        G.opts[sl.key] = sl.min + t * (sl.max - sl.min);
        applyOptions();
        G.setStep = Math.round(t * SLIDER_STEPS);
        Snd.sliderTick(t, sl.key);
        return;
      }
    }
    if (Input.tap(setModeRect(0))) { G.mobile = false; Screen.wantFull = false; exitFullscreen(); applyOptions(); saveOptions(); Snd.ui(); return; }
    if (Input.tap(setModeRect(1))) { G.mobile = true; Screen.wantFull = true; applyOptions(); saveOptions(); Snd.ui(); return; }
  } else {
    for (let i = 0; i < ACTIONS.length; i++) {
      const r = keyRowRect(i);
      if (Input.over(r)) G.setSel = i;
      if (Input.tap(r)) { G.bindWait = ACTIONS[i].key; Snd.ui(); return; }
    }
    const rr2 = setResetRect();
    G.setOverReset = Input.over(rr2);
    if (Input.tap(rr2)) {
      for (const a of ACTIONS) KEYS[a.key] = DEFAULT_KEYS[a.key];
      saveOptions(); Snd.buy();
      return;
    }
  }
}
function uiButton(r, label, hot, tone) {
  ctx.fillStyle = hot ? (tone || '#3c5a40') : '#211c32';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = hot ? '#8fd08a' : '#3a3350';
  ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  drawText(ctx, label, r.x + r.w / 2, r.y + (r.h - 7) / 2, hot ? '#ffeec0' : '#c9d4e8', 1, 'center');
}
function drawSlider(i) {
  const sl = SLIDERS[i], r = setSliderRect(i);
  const v = clamp(G.opts[sl.key], sl.min, sl.max);
  const t = (v - sl.min) / (sl.max - sl.min);
  drawText(ctx, sl.name, SET_BOX.x + 16, r.y + 1, '#c9d4e8', 1, 'left');
  ctx.fillStyle = '#12101c'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  ctx.fillStyle = '#2b2740'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = G.setDrag === i ? '#ffe98a' : '#6fc46a';
  ctx.fillRect(r.x, r.y, Math.round(r.w * t), r.h);
  /* the handle */
  const hx = Math.round(r.x + r.w * t);
  ctx.fillStyle = '#12101c'; ctx.fillRect(hx - 3, r.y - 3, 6, r.h + 6);
  ctx.fillStyle = G.setDrag === i ? '#ffffff' : '#f2e2b8'; ctx.fillRect(hx - 2, r.y - 2, 4, r.h + 4);
  drawText(ctx, Math.round(t * 100) + '%', r.x + r.w + 8, r.y + 1, '#a9b3c9', 1, 'left');
}
function drawSettings() {
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.80)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, SET_BOX.x, SET_BOX.y, SET_BOX.w, SET_BOX.h);
  drawText(ctx, 'SETTINGS', SET_BOX.x + 10, SET_BOX.y + 8, '#f2e2b8', 1, 'left', '#000000');
  const cr = setCloseRect();
  ctx.fillStyle = G.setOverClose ? '#c9403a' : '#3a3350';
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  drawText(ctx, 'X', cr.x + 4, cr.y + 3, '#f2e2b8', 1, 'left');

  for (let i = 0; i < SET_TABS.length; i++) {
    const r = setTabRect(i), on = G.setTab === i;
    ctx.fillStyle = on ? '#3a3350' : '#1d1930';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#c68e3f' : '#2b2740';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, SET_TABS[i], r.x + r.w / 2, r.y + 4, on ? '#ffeec0' : '#7f8aa3', 1, 'center');
  }

  if (G.setTab === 0) {
    drawText(ctx, 'HOW ARE YOU PLAYING', SET_BOX.x + SET_BOX.w / 2, SET_BOX.y + 40, '#a9b3c9', 1, 'center');
    const opts = [
      { name: 'PC', sub: 'KEYBOARD AND MOUSE', on: !G.mobile },
      { name: 'MOBILE', sub: 'ON-SCREEN BUTTONS', on: G.mobile }
    ];
    opts.forEach((o, i) => {
      const r = setModeRect(i), hot = G.setSel === i;
      ctx.fillStyle = o.on ? '#2f4a34' : (hot ? '#332c4c' : '#211c32');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (o.on || hot) {
        ctx.fillStyle = o.on ? '#6fc46a' : '#c68e3f';
        ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
        ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      }
      ctx.fillStyle = '#12101c'; ctx.fillRect(r.x + 6, r.y + 8, 9, 9);
      if (o.on) { ctx.fillStyle = '#6fc46a'; ctx.fillRect(r.x + 8, r.y + 10, 5, 5); }
      drawText(ctx, o.name, r.x + 22, r.y + 5, o.on ? '#ffeec0' : '#c9d4e8', 1, 'left');
      drawText(ctx, o.sub, r.x + 22, r.y + 15, '#7f8aa3', 1, 'left');
    });
    for (let i = 0; i < SLIDERS.length; i++) drawSlider(i);
    drawText(ctx, G.mobile ? 'BUTTON BRIGHTNESS APPLIES TO THE TOUCH PAD'
                           : 'BUTTON BRIGHTNESS APPLIES IN MOBILE MODE',
             SET_BOX.x + SET_BOX.w / 2, SET_BOX.y + SET_BOX.h - 34, '#6d7994', 1, 'center');
  } else {
    drawText(ctx, 'CLICK A ROW, THEN PRESS THE KEY YOU WANT', SET_BOX.x + SET_BOX.w / 2,
             SET_BOX.y + 40, '#a9b3c9', 1, 'center');
    ACTIONS.forEach((a, i) => {
      const r = keyRowRect(i), hot = G.setSel === i, waiting = G.bindWait === a.key;
      ctx.fillStyle = waiting ? '#4a3a20' : (hot ? '#332c4c' : '#1d1930');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (waiting || hot) {
        ctx.fillStyle = waiting ? '#ffd04a' : '#c68e3f';
        ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      }
      drawText(ctx, a.name, r.x + 4, r.y + 4, waiting ? '#ffeec0' : '#c9d4e8', 1, 'left');
      drawText(ctx, waiting ? 'PRESS...' : keyLabel(KEYS[a.key]), r.x + r.w - 4, r.y + 4,
               waiting ? '#ffd04a' : '#ffe98a', 1, 'right');
    });
    uiButton(setResetRect(), 'DEFAULTS', !!G.setOverReset, '#4a3a20');
  }
  uiButton(setBackRect(), 'BACK', !!G.setOverBack);
  if (G.bindWait) {
    ctx.fillStyle = 'rgba(8,6,16,0.72)'; ctx.fillRect(0, VH / 2 - 16, VW, 32);
    drawText(ctx, 'PRESS A KEY  -  ESC TO KEEP THE OLD ONE', VW / 2, VH / 2 - 3, '#ffd04a', 1, 'center', '#000000');
  }
  ctx.restore();
}

/* ============================================================
   SAVE FILES — pick one of three, each showing how far it has gone
   ============================================================ */
function fileRect(i) { return { x: 16 + i * 118, y: 58, w: 112, h: 104 }; }
function fileEraseRect(i) { const r = fileRect(i); return { x: r.x + r.w - 40, y: r.y + r.h - 15, w: 34, h: 11 }; }
function fileBackRect() { return { x: 10, y: VH - 22, w: 58, h: 15 }; }
function fileGearRect() { return { x: VW - 28, y: 6, w: 22, h: 22 }; }
/* the three files are read once on arrival, not once a frame */
function refreshSlots() {
  G.slotData = [];
  for (let i = 0; i < SLOTS; i++) G.slotData.push(readSlot(i));
}
function slotOf(i) { return (G.slotData && G.slotData[i]) || null; }
function openFiles() {
  G.state = 'files'; G.fileSel = -1; G.eraseArm = -1;
  G.particles.length = 0;
  refreshSlots();
  G.slot = clamp(Store.read(SLOT_KEY, 0) | 0, 0, SLOTS - 1);
  Snd.play('title'); Snd.musicLevel(0.30, 0.8); Snd.ambienceLevel(0.35, 1.2);
}
function updateFiles(dt) {
  G.mapT += dt;
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  if (G.settingsOpen) { updateSettings(); return; }
  const gear = fileGearRect();
  G.overGearFiles = Input.over(gear);
  if (Input.tap(gear)) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }

  G.fileSel = -1;
  for (let i = 0; i < SLOTS; i++) if (Input.over(fileRect(i))) G.fileSel = i;
  const back = fileBackRect();
  G.overFileBack = Input.over(back);
  if (Input.tap(back) || Input.hit('Escape')) {
    G.state = 'title'; initTitle(); Snd.ui(); Snd.play('title'); Snd.ambienceLevel(0.5, 2);
    return;
  }
  for (let i = 0; i < SLOTS; i++) {
    if (Input.tap(fileEraseRect(i))) {
      if (!slotOf(i)) { Snd.uiBad(); return; }
      if (G.eraseArm === i) {
        Store.drop(SAVE_KEY + i); refreshSlots(); G.eraseArm = -1; Snd.uiBad(); G.flash(0.2);
      } else { G.eraseArm = i; Snd.ui(); }
      return;
    }
  }
  for (let i = 0; i < SLOTS; i++) {
    if (Input.tap(fileRect(i))) { Snd.buy(); startGame(i); return; }
  }
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  if (Math.random() < dt * 6) G.particles.push(new Particle({
    x: rr(0, VW), y: VH + 4, vx: rr(-0.2, 0.2), vy: rr(-0.5, -0.15),
    life: rr(3, 6), col: rpick(['#ebdcb6', '#d8c49a', '#fff4d6']), size: 1, grav: 0, type: 'leaf'
  }));
}
function drawFiles() {
  ctx.drawImage(Art.map.bg, 0, 0);
  for (const pa of G.particles) pa.draw(ctx);
  ctx.fillStyle = 'rgba(58,44,28,0.9)';
  ctx.fillRect(50, 4, VW - 100, 24);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(50, 4, VW - 100, 1); ctx.fillRect(50, 27, VW - 100, 1);
  drawText(ctx, 'CHOOSE A FILE', VW / 2, 5, '#ffeec0', 2, 'center', '#2a1a10');
  drawText(ctx, 'THREE SEPARATE JOURNEYS', VW / 2, 20, '#d8c49a', 1, 'center');

  for (let i = 0; i < SLOTS; i++) {
    const r = fileRect(i), d = slotOf(i), hot = G.fileSel === i;
    const pct = slotPercent(d);
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hot ? '#ffd04a' : '#b8862f';
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    drawText(ctx, 'FILE ' + (i + 1), r.x + 6, r.y + 6, '#ffeec0', 1, 'left');
    if (G.slot === i && d) drawText(ctx, 'LAST', r.x + r.w - 6, r.y + 6, '#9be89a', 1, 'right');

    if (!d) {
      drawText(ctx, 'EMPTY', r.x + r.w / 2, r.y + 40, '#8a7a5c', 2, 'center');
      drawText(ctx, hot ? 'CLICK TO BEGIN' : '', r.x + r.w / 2, r.y + 62, '#d8c49a', 1, 'center');
      continue;
    }
    /* the bar of how far this file has gone */
    drawText(ctx, pct + '%', r.x + r.w / 2, r.y + 20, pct >= 100 ? '#ffd04a' : '#ffeec0', 2, 'center');
    const bw = r.w - 16, bx = r.x + 8, by = r.y + 40;
    ctx.fillStyle = '#2a1f12'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = '#4a3826'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = pct >= 100 ? '#ffd04a' : '#6fc46a';
    ctx.fillRect(bx, by, Math.round(bw * pct / 100), 5);

    /* the three things the percentage is made of, each shown against its total */
    const t = slotTally(d);
    const part = (n, m) => (n >= m ? '#9be89a' : '#e0d0aa');
    drawText(ctx, 'REALMS ' + t.realms + '/' + t.realmsMax, r.x + 8, r.y + 52, part(t.realms, t.realmsMax), 1, 'left');
    drawText(ctx, 'PAPERS ' + t.papers + '/' + t.papersMax, r.x + 8, r.y + 62, part(t.papers, t.papersMax), 1, 'left');
    drawText(ctx, 'UPGRADES ' + t.upgrades + '/' + t.upgradesMax, r.x + 8, r.y + 72, part(t.upgrades, t.upgradesMax), 1, 'left');
    drawText(ctx, 'COINS ' + (d.codes && d.codes.admin ? INF : (d.coins || 0)), r.x + 8, r.y + 82, '#e0d0aa', 1, 'left');

    const er = fileEraseRect(i);
    const armed = G.eraseArm === i;
    ctx.fillStyle = armed ? '#c9403a' : 'rgba(30,22,14,0.9)';
    ctx.fillRect(er.x, er.y, er.w, er.h);
    drawText(ctx, armed ? 'SURE?' : 'ERASE', er.x + er.w / 2, er.y + 2, armed ? '#ffeec0' : '#a8967a', 1, 'center');
  }

  const back = fileBackRect();
  ctx.fillStyle = G.overFileBack ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
  ctx.fillRect(back.x, back.y, back.w, back.h);
  ctx.fillStyle = G.overFileBack ? '#ffd04a' : '#b8862f';
  ctx.fillRect(back.x, back.y, back.w, 1); ctx.fillRect(back.x, back.y + back.h - 1, back.w, 1);
  drawText(ctx, 'BACK', back.x + back.w / 2, back.y + 4, '#ffeec0', 1, 'center');

  /* the cog, so keys and volume can be set before you start */
  {
    const hov = G.overGearFiles;
    ctx.save();
    ctx.translate(VW - 17, 17);
    ctx.rotate(G.mapT * (hov ? 1.1 : 0.25));
    ctx.drawImage(Art.ui.gear, -11, -11);
    ctx.restore();
    if (hov) drawText(ctx, 'SETTINGS', VW - 17, 32, '#ffeec0', 1, 'center', '#2a1a10');
  }
  if (G.settingsOpen) drawSettings();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   THE CODES BOX
   ============================================================ */
/* the box grows on a phone, to make room for the keys */
const CODE_BOX_PC = { x: 52, y: 26, w: 280, h: 164 };
const CODE_BOX_MOB = { x: 4, y: 4, w: 376, h: 208 };
function codeBox() { return G.mobile ? CODE_BOX_MOB : CODE_BOX_PC; }
function codeCloseRect() { const B = codeBox(); return { x: B.x + B.w - 18, y: B.y + 5, w: 13, h: 13 }; }

/* ---- the keyboard built into the game, for a phone with no keys ---- */
const CODE_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
const CODE_KEY_W = 34, CODE_KEY_H = 26, CODE_KEY_GAP = 2;
/* one row of keys, already laid out and centred */
function codeKeyRow(r) {
  const B = codeBox();
  const keys = CODE_ROWS[r].split('').map(c => ({ ch: c, w: CODE_KEY_W }));
  if (r === CODE_ROWS.length - 1) {
    keys.push({ ch: 'DEL', w: 46, wide: true });
    keys.push({ ch: 'ENTER', w: 58, wide: true });
  }
  let total = (keys.length - 1) * CODE_KEY_GAP;
  for (const k of keys) total += k.w;
  let x = B.x + (B.w - total) / 2;
  const y = B.y + B.h - 116 + r * (CODE_KEY_H + CODE_KEY_GAP);
  for (const k of keys) { k.x = x; k.y = y; k.h = CODE_KEY_H; x += k.w + CODE_KEY_GAP; }
  return keys;
}
function codeKeys() {
  const out = [];
  for (let r = 0; r < CODE_ROWS.length; r++) for (const k of codeKeyRow(r)) out.push(k);
  return out;
}
/* the papers you carry, listed down the box on a desktop and as chips on a phone */
function codePaperMax() { return G.mobile ? 8 : 6; }
function codePaperRect(i) {
  const B = codeBox();
  if (G.mobile) {
    const col = i % 4, row = (i / 4) | 0;
    return { x: B.x + 14 + col * 90, y: B.y + 58 + row * 14, w: 86, h: 12 };
  }
  return { x: B.x + 10, y: B.y + 72 + i * 11, w: 142, h: 10 };
}
function closeCodes() {
  G.codesOpen = false; G.codeKeyHit = null;
  Snd.ui(); Snd.musicLevel(0.34, 0.5);
}
/* a key the player just pressed, typed or tapped */
function codeType(ch) {
  if (ch === 'ENTER') { G.redeem(G.codeBuf); G.codeBuf = ''; return; }
  if (ch === 'DEL') { G.codeBuf = G.codeBuf.slice(0, -1); Snd.ui(); return; }
  if (G.codeBuf.length < 18) { G.codeBuf += ch; Snd.ui(); }
  else Snd.uiBad();
}
function updateCodes(dt) {
  const B = codeBox();
  G.codeMsgT = Math.max(0, G.codeMsgT - dt);
  G.codeKeyFlash = Math.max(0, (G.codeKeyFlash || 0) - dt);
  if (G.codeKeyFlash <= 0) G.codeKeyHit = null;
  if (Input.hit('Escape')) { closeCodes(); return; }
  if (Input.hit('Backspace')) G.codeBuf = G.codeBuf.slice(0, -1);
  if (Input.hit('Enter')) { G.redeem(G.codeBuf); G.codeBuf = ''; }
  for (const ch of Input.typed) {
    if (/[A-Za-z0-9]/.test(ch) && G.codeBuf.length < 18) G.codeBuf += ch.toUpperCase();
  }
  G.codeOverClose = Input.over(codeCloseRect());

  /* the built-in keyboard */
  G.codeKeyOver = null;
  if (G.mobile) {
    for (const k of codeKeys()) {
      const r = { x: k.x, y: k.y, w: k.w, h: k.h };
      if (Input.over(r)) G.codeKeyOver = k.ch;
      if (Input.tap(r)) {
        G.codeKeyHit = k.ch; G.codeKeyFlash = 0.12;
        codeType(k.ch);
        return;
      }
    }
  }

  /* tapping a paper you carry fills the box */
  const found = Object.keys(G.codes.found).filter(c => !G.codes.used[c]);
  G.codeHover = -1;
  found.slice(0, codePaperMax()).forEach((c, i) => {
    if (Input.over(codePaperRect(i))) G.codeHover = i;
  });
  if (Input.tap(codeCloseRect())) { closeCodes(); return; }
  if (G.codeHover >= 0 && Input.mhit) { G.codeBuf = found[G.codeHover]; Snd.ui(); }
  void B;
}
function drawCodeKeyboard() {
  const keys = codeKeys();
  for (const k of keys) {
    const hit = G.codeKeyHit === k.ch;
    const isEnter = k.ch === 'ENTER', isDel = k.ch === 'DEL';
    ctx.fillStyle = hit ? '#6fc46a' : (isEnter ? '#2f4a34' : (isDel ? '#3a2c34' : '#2b2740'));
    ctx.fillRect(k.x, k.y, k.w, k.h);
    ctx.fillStyle = hit ? '#ffffff' : (isEnter ? '#6fc46a' : '#4a4468');
    ctx.fillRect(k.x, k.y, k.w, 1);
    ctx.fillRect(k.x, k.y + k.h - 1, k.w, 1);
    ctx.fillRect(k.x, k.y, 1, k.h);
    ctx.fillRect(k.x + k.w - 1, k.y, 1, k.h);
    const col = hit ? '#12200e' : (isEnter ? '#ffeec0' : '#e6edf6');
    const sc = k.wide ? 1 : 2;
    drawText(ctx, k.ch, k.x + k.w / 2, k.y + (k.h - GH * sc) / 2, col, sc, 'center');
  }
}
function drawCodes() {
  const B = codeBox();
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.74)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'CODES', B.x + 10, B.y + 9, '#f2e2b8', 1, 'left', '#000000');
  drawText(ctx, 'TICKETS ' + G.codes.tickets, B.x + B.w - 24, B.y + 9, '#6fc46a', 1, 'right');
  const cr = codeCloseRect();
  ctx.fillStyle = G.codeOverClose ? '#c9403a' : '#3a3350';
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  drawText(ctx, 'X', cr.x + 4, cr.y + 3, '#f2e2b8', 1, 'left');

  /* the entry line */
  const fx = B.x + 10, fy = B.y + 26;
  ctx.fillStyle = '#12101c'; ctx.fillRect(fx - 2, fy - 3, B.w - 16, 18);
  ctx.fillStyle = '#3a3350'; ctx.fillRect(fx - 2, fy - 3, B.w - 16, 1);
  const shown = G.codeBuf || '';
  drawText(ctx, shown, fx + 2, fy + 2, '#ffe98a', 2, 'left');
  if (Math.floor(G.t * 2.4) % 2 === 0) {
    ctx.fillStyle = '#6fc46a';
    ctx.fillRect(fx + 2 + textWidth(shown) * 2 + 2, fy + 1, 2, 12);
  }
  drawText(ctx, G.mobile ? 'TAP THE KEYS, THEN ENTER' : 'TYPE A CODE, THEN ENTER',
           fx, fy + 20, '#6d7994', 1, 'left');

  /* codes you have found but not spent */
  const found = Object.keys(G.codes.found).filter(c => !G.codes.used[c]);
  if (!G.mobile) drawText(ctx, 'PAPERS IN YOUR POCKET', fx, B.y + 60, '#a9b3c9', 1, 'left');
  if (!found.length) {
    drawText(ctx, 'NO PAPERS YET - SEARCH THE REALMS',
             G.mobile ? B.x + B.w / 2 : fx + 10, B.y + (G.mobile ? 62 : 74),
             '#5b6480', 1, G.mobile ? 'center' : 'left');
  }
  found.slice(0, codePaperMax()).forEach((c, i) => {
    const r = codePaperRect(i);
    if (G.codeHover === i) { ctx.fillStyle = '#332c4c'; ctx.fillRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); }
    if (G.mobile) {
      ctx.fillStyle = G.codeHover === i ? '#3a3350' : '#211c32';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawText(ctx, c, r.x + r.w / 2, r.y + 3, '#ffeec0', 1, 'center');
    } else {
      ctx.drawImage(Art.item.paper, r.x + 1, r.y - 1, 8, 9);
      drawText(ctx, c, r.x + 13, r.y + 2, '#ffeec0', 1, 'left');
    }
  });
  const usedN = Object.keys(G.codes.used).length;
  drawText(ctx, 'REDEEMED ' + usedN + '/' + World.CODES.length,
           B.x + B.w - 12, B.y + (G.mobile ? 44 : 60), '#5b6480', 1, 'right');

  if (G.mobile) drawCodeKeyboard();

  if (G.codeMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.codeMsgT * 2);
    const my = G.mobile ? B.y + 44 : B.y + B.h - 30;
    ctx.fillStyle = 'rgba(8,6,16,0.85)';
    ctx.fillRect(B.x + 4, my - 2, B.w - 8, 16);
    drawText(ctx, G.codeMsg, B.x + B.w / 2, my,
             G.codeMsgOk ? '#6fc46a' : '#c9403a', 2, 'center', '#000000');
    ctx.restore();
  }
  if (!G.mobile) {
    drawText(ctx, 'A CODE ONLY WORKS WITH ITS PAPER IN HAND   -   ESC TO CLOSE',
             B.x + B.w / 2, B.y + B.h - 14, '#a9b3c9', 1, 'center');
  }
  ctx.restore();
}

/* ============================================================
   A RELIC COMES INTO REACH — it rises in the middle of the screen,
   named and glowing, then draws away into the shop sign.
   ============================================================ */
G.showRelic = function (it) {
  G.relicShow = { key: it.key, name: it.name, desc: it.desc, t: 0, dur: 3.4, icon: it.icon };
  Snd.unlock(); G.flash(0.5); G.shake(4);
};
function updateRelicShow(dt) {
  const r = G.relicShow;
  if (!r) return;
  r.t += dt;
  if (r.t < r.dur * 0.66 && Math.random() < dt * 30) G.particles.push(new Particle({
    x: VW / 2 + rr(-30, 30), y: VH / 2 + rr(-22, 22), vx: rr(-0.6, 0.6), vy: rr(-1.4, -0.2),
    life: rr(0.4, 1), col: rpick(['#ffeec0', '#ffd04a', '#ffffff']), col2: '#b8862f',
    size: rr(1, 2.6), grav: -0.01, drag: 0.96
  }));
  if (r.t >= r.dur) G.relicShow = null;
}
function drawRelicShow() {
  const r = G.relicShow;
  if (!r) return;
  const k = r.t / r.dur;
  /* rise, hold, then draw away to the shop sign in the corner */
  const rise = clamp(r.t / 0.5, 0, 1);
  const leave = clamp((r.t - r.dur * 0.72) / (r.dur * 0.28), 0, 1);
  const cx = lerp(VW / 2, 15, leave * leave);
  const cy = lerp(VH / 2 - 6 - (1 - rise) * 14, 15, leave * leave);
  const sc = lerp(1 + (1 - rise) * 0.6, 0.35, leave);
  const a = Math.min(rise, 1 - leave);
  ctx.save();
  ctx.globalAlpha = a * 0.72;
  ctx.fillStyle = 'rgba(8,6,16,0.75)';
  ctx.fillRect(0, 0, VW, VH);
  /* the glow behind it */
  ctx.globalAlpha = a * (0.32 + Math.sin(r.t * 5) * 0.1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffd04a';
  ctx.beginPath(); ctx.arc(cx, cy, 34 * sc + Math.sin(r.t * 3) * 3, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  /* rays */
  ctx.globalAlpha = a * 0.5;
  for (let i = 0; i < 12; i++) {
    const ang = i / 12 * TAU + r.t * 0.6;
    const r0 = 20 * sc, r1 = (34 + Math.sin(r.t * 6 + i) * 8) * sc;
    ctx.fillStyle = '#ffeec0';
    for (let d = r0; d < r1; d += 3)
      ctx.fillRect(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), 1, 1);
  }
  /* the relic itself */
  ctx.globalAlpha = a;
  const img = r.icon();
  if (img) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(sc * 2, sc * 2);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
  if (leave < 0.4) {
    ctx.globalAlpha = a;
    drawText(ctx, r.name, VW / 2, cy + 34 * sc, '#ffeec0', 2, 'center', '#2a1a10');
    drawText(ctx, r.desc, VW / 2, cy + 34 * sc + 18, '#d8c49a', 1, 'center', '#2a1a10');
    drawText(ctx, 'NOW IN THE SHOP', VW / 2, cy + 34 * sc + 30, '#9be89a', 1, 'center', '#2a1a10');
  }
  ctx.restore();
}

/* ============================================================
   SHOP
   ============================================================ */
const SHOP_ITEMS = [
  { key: 'heart', name: 'HEART VESSEL', desc: 'ONE MORE HEART ON YOUR LIFE BAR', base: 20, mul: 1.52, max: 3, icon: () => Art.item.heart.full },
  { key: 'sword', name: 'WHETSTONE', desc: 'THE BLADE BITES DEEPER AND REACHES FURTHER', base: 17, mul: 1.48, max: 4, icon: () => Art.item.sword },
  { key: 'speed', name: 'SWIFT BOOTS', desc: 'RUN FASTER THROUGH WOOD AND MAZE', base: 22, mul: 1.48, max: 3, icon: () => Art.item.boot },
  { key: 'dash', name: 'WINDSTEP CHARM', desc: 'THE DASH RETURNS TO YOU SOONER', base: 26, mul: 1.5, max: 3, icon: () => Art.item.ring },
  { key: 'magnet', name: 'LODESTONE', desc: 'COINS COME FROM FURTHER OFF, STRAIGHT THROUGH ROCK', base: 15, mul: 1.5, max: 3, icon: () => Art.item.magnet },
  { key: 'armour', name: 'WARD CHARM', desc: 'A CHANCE TO SHRUG OFF ANY BLOW', base: 28, mul: 1.5, max: 3, icon: () => Art.item.ward },
  /* eight steps of a quarter each: 1.25x at the first, 3x at the last.
     20 coins for the first step, 150 for the last. */
  { key: 'special', name: 'DUELLISTS SIGIL', desc: 'THE FLIP, THE ROLL CUT AND THE DIVE ALL BITE HARDER',
    base: 20, mul: 1.3335, max: 8, fixed: true, icon: () => Art.item.sigil },
  { key: 'wings', name: 'STORMFEATHER WINGS', desc: 'A SECOND JUMP IN MID AIR', base: 850, mul: 1, max: 1, relic: true, unlockAt: 1, icon: () => Art.item.wings },
  { key: 'mantle', name: 'RIPTIDE MANTLE', desc: 'YOUR DASH CUTS CLEAN THROUGH ANYTHING IT TOUCHES', base: 3600, mul: 1, max: 1, relic: true, unlockAt: 3, icon: () => Art.item.mantle },
  { key: 'emberheart', name: 'THE EMBERHEART', desc: 'EVERY SWORD SWING LOOSES A BURNING WAVE', base: 9000, mul: 1, max: 1, relic: true, unlockAt: 6, icon: () => Art.item.emberheart },
  { key: 'tonic', name: 'FOREST TONIC', desc: 'DRINK NOW AND REFILL EVERY HEART', base: 8, mul: 1.0, max: 99, icon: () => Art.item.potion }
];
function shopLevel(it) { const p = G.player; return it.key === 'tonic' ? 0 : (p.up[it.key] || 0); }
/* every realm you open lets the pedlar carry a deeper stock, except for the
   rows whose steps are fixed: the tonic, the relics and the sigil */
function shopStepped(it) { return it.key !== 'tonic' && !it.relic && !it.fixed; }
function shopMax(it) { return shopStepped(it) ? it.max + (G.unlocked - 1) * 2 : it.max; }
/* the same ceiling, with every realm open — what a finished file holds */
function shopFullMax(it) { return shopStepped(it) ? it.max + (World.LEVELS.length - 1) * 2 : it.max; }
/* relics only appear once you have reached the realm that forges them */
function shopVisible(it) { return it.unlockAt === undefined || G.unlocked > it.unlockAt; }
function shopRows() { return SHOP_ITEMS.filter(shopVisible); }
function shopPrice(it) { return Math.round(it.base * Math.pow(it.mul, shopLevel(it))); }
const SHOP_BOX = { x: 34, y: 6, w: 316, h: 206 };
function shopRowRect(i) { return { x: SHOP_BOX.x + 8, y: SHOP_BOX.y + 26 + i * 15, w: SHOP_BOX.w - 16, h: 14 }; }
function shopGearRect() { return { x: SHOP_BOX.x + SHOP_BOX.w - 36, y: SHOP_BOX.y + 5, w: 13, h: 13 }; }
function updateShop(dt) {
  void dt;
  if (G.settingsOpen) { updateSettings(); return; }
  if (Input.hit('Escape') || Input.actHit('shop')) {
    G.shopOpen = false; Snd.ui(); Snd.musicLevel(0.34, 0.5); return;
  }
  const gr = shopGearRect();
  G.shopOverGear = Input.over(gr);
  if (Input.tap(gr)) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }
  const rows = shopRows();
  G.shopSel = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = shopRowRect(i);
    if (Input.mx >= r.x && Input.mx <= r.x + r.w && Input.my >= r.y && Input.my <= r.y + r.h) G.shopSel = i;
  }
  const closeR = { x: SHOP_BOX.x + SHOP_BOX.w - 18, y: SHOP_BOX.y + 5, w: 13, h: 13 };
  const overClose = Input.mx >= closeR.x && Input.mx <= closeR.x + closeR.w &&
                    Input.my >= closeR.y && Input.my <= closeR.y + closeR.h;
  G.shopOverClose = overClose;
  if (!Input.mhit) return;
  if (overClose) { G.shopOpen = false; Snd.ui(); Snd.musicLevel(0.34, 0.5); return; }
  if (G.shopSel < 0) return;
  const it = shopRows()[G.shopSel], p = G.player;
  const lvl = shopLevel(it), cost = shopPrice(it);
  if (lvl >= shopMax(it)) { Snd.uiBad(); return; }
  if (it.key === 'tonic' && p.hp >= p.maxHp) { Snd.uiBad(); return; }
  /* a free-upgrade ticket covers anything but a relic */
  const useTicket = !it.relic && it.key !== 'tonic' && G.codes.tickets > 0 && !G.codes.admin;
  if (!useTicket && !G.codes.admin && p.coins < cost) { Snd.uiBad(); G.shopWarn = 0.6; return; }
  if (useTicket) { G.codes.tickets--; G.banner('TICKET SPENT', 1.4); }
  else if (!G.codes.admin) p.coins -= cost;
  Snd.buy();
  if (it.key === 'heart') { p.up.heart = (p.up.heart || 0) + 1; p.maxHp += 2; p.hp = p.maxHp; }
  else if (it.key === 'tonic') p.heal(p.maxHp);
  else p.up[it.key] = (p.up[it.key] || 0) + 1;
  G.saveGame();
}
function drawShop() {
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.72)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, SHOP_BOX.x, SHOP_BOX.y, SHOP_BOX.w, SHOP_BOX.h);
  drawText(ctx, 'THE WANDERING PEDLAR', SHOP_BOX.x + 10, SHOP_BOX.y + 9, '#f2e2b8', 1, 'left', '#000000');
  /* purse */
  ctx.drawImage(Art.item.coin[Math.floor(G.t / 0.09) % 8], SHOP_BOX.x + SHOP_BOX.w - 84, SHOP_BOX.y + 6);
  drawText(ctx, G.purse(), SHOP_BOX.x + SHOP_BOX.w - 70, SHOP_BOX.y + 9, '#ffe98a', 1, 'left', '#000000');
  /* settings, then close */
  const gr = shopGearRect();
  ctx.save();
  ctx.translate(gr.x + gr.w / 2, gr.y + gr.h / 2);
  ctx.rotate(G.t * (G.shopOverGear ? 1.1 : 0.25));
  ctx.scale(0.62, 0.62);
  ctx.drawImage(Art.ui.gear, -11, -11);
  ctx.restore();
  const cr = { x: SHOP_BOX.x + SHOP_BOX.w - 18, y: SHOP_BOX.y + 5, w: 13, h: 13 };
  ctx.fillStyle = G.shopOverClose ? '#c9403a' : '#3a3350';
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  drawText(ctx, 'X', cr.x + 4, cr.y + 3, '#f2e2b8', 1, 'left');

  const rows = shopRows();
  for (let i = 0; i < rows.length; i++) {
    const it = rows[i], r = shopRowRect(i);
    const lvl = shopLevel(it), cost = shopPrice(it);
    const mx = shopMax(it);
    const maxed = lvl >= mx;
    const ticketable = !it.relic && it.key !== 'tonic' && G.codes.tickets > 0 && !G.codes.admin;
    const afford = (G.codes.admin || ticketable || G.player.coins >= cost) && !maxed;
    const sel = G.shopSel === i;
    ctx.fillStyle = sel ? '#332c4c' : '#211c32';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (sel) { ctx.fillStyle = '#c68e3f'; ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1); }
    const ic = it.icon();
    ctx.save();
    if (!afford) ctx.globalAlpha = 0.45;
    ctx.drawImage(ic, r.x + 4, r.y + Math.round((r.h - ic.height) / 2));
    ctx.restore();
    drawText(ctx, it.name, r.x + 24, r.y + 2, maxed ? '#7f8aa3' : (afford ? '#f2e2b8' : '#9a8f8f'), 1, 'left');
    /* level pips */
    if (it.key !== 'tonic') {
      for (let k = 0; k < mx; k++) {
        ctx.fillStyle = k < lvl ? '#6fc46a' : '#3a3350';
        ctx.fillRect(r.x + 24 + k * 3, r.y + 10, 2, 3);
      }
    }
    if (maxed) drawText(ctx, 'MAX', r.x + r.w - 8, r.y + 4, '#6fc46a', 1, 'right');
    else if (ticketable) drawText(ctx, 'FREE', r.x + r.w - 8, r.y + 4, '#6fc46a', 1, 'right');
    else {
      drawText(ctx, String(cost), r.x + r.w - 20, r.y + 4, afford ? '#ffe98a' : '#c9403a', 1, 'right');
      ctx.drawImage(Art.item.coin[0], r.x + r.w - 17, r.y + 2);
    }
    if (it.relic) { ctx.fillStyle = '#c68e3f'; ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + 1, r.y, 1, 1); ctx.fillRect(r.x + 1, r.y + r.h - 1, 1, 1); }
  }
  const d = G.shopSel >= 0 ? rows[G.shopSel].desc
    : (G.codes.tickets > 0 ? G.codes.tickets + ' FREE UPGRADE TICKETS - SPEND ONE ON ANY ROW'
                           : 'CLICK AN ITEM TO BUY IT  -  ESC TO LEAVE');
  drawText(ctx, d, SHOP_BOX.x + SHOP_BOX.w / 2, SHOP_BOX.y + SHOP_BOX.h - 14, '#a9b3c9', 1, 'center', '#000000');
  ctx.restore();
}

/* ============================================================
   death / victory / loading
   ============================================================ */
function drawDeath() {
  ctx.save();
  ctx.globalAlpha = Math.min(0.82, G.deathT * 0.9);
  ctx.fillStyle = '#08060e'; ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
  if (G.deathT > 0.5) {
    ctx.save(); ctx.globalAlpha = Math.min(1, (G.deathT - 0.5) * 2);
    drawText(ctx, 'YOU FELL', VW / 2, VH / 2 - 22, '#e8433f', 3, 'center', '#2a0c10');
    const taker = (World.LEVELS[G.level] && World.LEVELS[G.level].taker) || 'THE WOOD TAKES';
    drawText(ctx, taker + ' A FIFTH OF YOUR COINS', VW / 2, VH / 2 + 6, '#a9b3c9', 1, 'center', '#000000');
    if (G.deathT > 1.6 && Math.floor(G.t * 2) % 2)
      drawText(ctx, 'PRESS SPACE TO RISE', VW / 2, VH / 2 + 22, '#f2e2b8', 1, 'center', '#000000');
    ctx.restore();
  }
}
function drawVictoryOverlay() {
  ctx.save();
  ctx.globalAlpha = Math.min(0.7, G.victoryT * 0.35);
  ctx.fillStyle = '#0d0818'; ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
  if (G.victoryT < 0.6) return;
  const a = Math.min(1, (G.victoryT - 0.6) * 1.2);
  ctx.save(); ctx.globalAlpha = a;
  const bob = Math.sin(G.t * 1.6) * 2;
  drawText(ctx, 'REALM CLEARED', VW / 2, 40 + bob, '#ffd04a', 3, 'center', '#3a1c08');
  drawText(ctx, World.LEVELS[G.level].name + ' IS FREE', VW / 2, 66, '#f2e2b8', 1, 'center', '#000000');
  if (G.newlyUnlocked)
    drawText(ctx, World.LEVELS[G.level + 1].name + ' IS OPEN', VW / 2, 78, '#9be89a', 1, 'center', '#000000');
  else if (G.level + 1 >= World.LEVELS.length)
    drawText(ctx, 'EVERY REALM IS FREE', VW / 2, 78, '#9be89a', 1, 'center', '#000000');
  const mins = Math.floor(G.stats.time / 60), secs = Math.floor(G.stats.time % 60);
  const rows = [
    'COINS GATHERED  ' + G.stats.coins,
    'BEASTS FELLED   ' + G.stats.kills,
    'TIMES FALLEN    ' + G.stats.deaths,
    'TIME            ' + mins + 'M ' + (secs < 10 ? '0' : '') + secs + 'S'
  ];
  panel(ctx, VW / 2 - 88, 90, 176, 62);
  rows.forEach((r, i) => drawText(ctx, r, VW / 2, 98 + i * 12, '#c9d4e8', 1, 'center'));
  if (G.victoryT > 2 && Math.floor(G.t * 2) % 2)
    drawText(ctx, 'PRESS ENTER FOR THE MAP', VW / 2, 164, '#ffe98a', 1, 'center', '#000000');
  ctx.restore();
}
function drawLoad() {
  ctx.fillStyle = '#0a0812'; ctx.fillRect(0, 0, VW, VH);
  const p = loadSteps ? clamp(loadIdx / loadSteps.length, 0, 1) : 0;
  drawText(ctx, 'EMBERWOOD', VW / 2, VH / 2 - 30, '#4a7f3a', 4, 'center', '#12200e');
  const bw = 180, bx = (VW - bw) / 2, by = VH / 2 + 8;
  ctx.fillStyle = '#1a1626'; ctx.fillRect(bx - 2, by - 2, bw + 4, 10);
  ctx.fillStyle = '#241f36'; ctx.fillRect(bx, by, bw, 6);
  ctx.fillStyle = '#4a7f3a'; ctx.fillRect(bx, by, Math.round(bw * p), 6);
  ctx.fillStyle = '#7ec44f'; ctx.fillRect(bx, by, Math.round(bw * p), 1);
  const label = loadSteps && loadIdx < loadSteps.length ? loadSteps[loadIdx].label : 'READY';
  drawText(ctx, 'CARVING ' + label, VW / 2, by + 14, '#5b6480', 1, 'center');
  /* a little spinning coin keeps the screen alive */
  ctx.drawImage(Art.item && Art.item.coin ? Art.item.coin[Math.floor(G.t / 0.08) % 8] : mkc(1, 1),
                Math.round(VW / 2 - 7), Math.round(by - 26));
}

/* ============================================================
   TITLE SCREEN — a living pixel landscape
   ============================================================ */
function titleGroundY(x) {
  return VH - 44 + Math.sin(x * 0.0155) * 9 + Math.sin(x * 0.041 + 1.3) * 4 + Math.sin(x * 0.11) * 1.2;
}
function makeStartButton() {
  const g = new Pix(104, 30);
  g.rect(1, 1, 102, 28, C('#5c3c22'));
  g.rect(3, 3, 98, 24, C('#8a5f36'));
  g.rect(3, 3, 98, 3, C('#a97a48'));
  g.rect(3, 24, 98, 3, C('#4a2f1a'));
  const r = new RNG(77);
  for (let k = 0; k < 46; k++) {
    const x = r.i(4, 96), y = r.i(4, 25), w = r.i(3, 9);
    g.rect(x, y, w, 1, r.bool() ? C('#7a5230') : C('#9c6c41'));
  }
  g.frame(0, 0, 104, 30, C('#c68e3f'));
  g.frame(1, 1, 102, 28, C('#e0b166'));
  for (const [x, y] of [[4, 4], [97, 4], [4, 23], [97, 23]]) g.rect(x, y, 3, 3, C('#e0b166'));
  g.shade({ top: 0.1, bot: 0.14 });
  g.outline(C('#241408'));
  const cv0 = g.canvas();
  const c2 = cv0.getContext('2d');
  drawText(c2, 'START', 52, 10, '#ffeec0', 2, 'center', '#4a2c10');
  return cv0;
}
function initTitle() {
  if (!Art.ui.startBtn) Art.ui.startBtn = makeStartButton();
  const r = new RNG(20250906);
  const T = {
    t: 0, phase: 'idle', animT: 0, spin: 0, spinV: 0, scale: 1,
    baseY: 158, btnY: 158, hover: false,
    birds: [], fgProps: [], midProps: [], groundCv: null
  };
  for (let i = 0; i < 6; i++)
    T.birds.push({ x: r.r(0, VW), y: r.r(24, 74), v: r.r(6, 14), ph: r.r(0, TAU), s: r.bool() ? 1 : 0 });

  /* trees standing on the middle ridge */
  for (let i = 0; i < 9; i++) {
    const x = 14 + i * 44 + r.r(-12, 12);
    T.midProps.push({ kind: 'tree', idx: r.i(0, 5), x: x, y: VH - 74 + Math.sin(x * 0.02) * 5,
                      sway: r.r(1.0, 2.0), ph: r.r(0, TAU), scale: r.r(0.5, 0.72) });
  }
  /* the foreground bank */
  for (let i = 0; i < 7; i++) {
    const x = 24 + i * 58 + r.r(-14, 14);
    T.fgProps.push({ kind: 'tree', idx: 6 + r.i(0, 2), x: x, y: titleGroundY(x) + 3,
                     sway: r.r(2.2, 3.6), ph: r.r(0, TAU), scale: r.r(0.85, 1.15) });
  }
  for (let x = 4; x < VW; x += 5) {
    if (r.bool(0.75)) T.fgProps.push({ kind: 'tuft', idx: r.i(0, 3), x: x + r.r(-2, 2), y: titleGroundY(x) + 2,
                                       sway: r.r(1.0, 2.2), ph: r.r(0, TAU), scale: 1 });
    if (r.bool(0.30)) T.fgProps.push({ kind: 'flower', idx: r.i(0, 4), x: x + r.r(-2, 2), y: titleGroundY(x) + 2,
                                       sway: r.r(0.8, 1.6), ph: r.r(0, TAU), scale: 1 });
    if (r.bool(0.08)) T.fgProps.push({ kind: 'bush', idx: r.i(0, 2), x: x + r.r(-2, 2), y: titleGroundY(x) + 3,
                                       sway: r.r(0.9, 1.8), ph: r.r(0, TAU), scale: 1 });
    if (r.bool(0.05)) T.fgProps.push({ kind: 'mushroom', idx: r.i(0, 2), x: x + r.r(-2, 2), y: titleGroundY(x) + 2, sway: 0, ph: 0, scale: 1 });
    if (r.bool(0.04)) T.fgProps.push({ kind: 'rock', idx: r.i(0, 2), x: x + r.r(-2, 2), y: titleGroundY(x) + 3, sway: 0, ph: 0, scale: 1 });
  }
  T.fgProps.sort((a, b) => a.y - b.y);

  /* bake the near bank so it never shimmers */
  {
    const g = new Pix(VW, 60);
    for (let x = 0; x < VW; x++) {
      const y0 = Math.round(titleGroundY(x)) - (VH - 60);
      for (let y = y0; y < 60; y++) {
        const d = y - y0;
        let c;
        if (d < 1) c = C('#7ec44f');
        else if (d < 4) c = C('#54924a');
        else if (d < 7) c = r.bool(0.25) ? C('#367030') : C('#417a3d');
        else c = r.bool(0.18) ? C('#4a3220') : (r.bool(0.12) ? C('#87613d') : C('#6b4a2f'));
        g.set(x, y, c);
      }
      if (r.bool(0.35)) g.set(x, y0 - 1, C('#7ec44f'));
      if (r.bool(0.10)) { g.set(x, y0 + 9 + r.i(0, 12), C('#4a3220')); }
    }
    for (let k = 0; k < 40; k++) {
      const x = r.i(2, VW - 3), y0 = Math.round(titleGroundY(x)) - (VH - 60);
      g.rect(x, y0 + r.i(8, 24), r.i(2, 4), 1, C('#4a3220'));
    }
    T.groundCv = g.canvas();
  }
  G.title = T;
  G.particles.length = 0;
  if (Snd.ready) { Snd.play('title'); Snd.startAmbience(); Snd.ambienceLevel(0.5, 2); Snd.musicLevel(0.34, 1.2); }
}

function updateTitle(dt) {
  const T = G.title;
  T.t += dt;
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.4);
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 18);

  for (const b of T.birds) {
    b.x += b.v * dt;
    if (b.x > VW + 20) { b.x = -20; b.y = rr(22, 76); b.v = rr(6, 14); }
  }
  if (Math.random() < dt * 0.5) Snd.bird();
  /* drifting pollen */
  if (Math.random() < dt * 14) G.particles.push(new Particle({
    x: rr(-10, VW + 10), y: rr(60, VH), vx: rr(0.05, 0.35), vy: rr(-0.22, -0.04),
    life: rr(3, 7), col: rpick(['#ffeec0', '#d8f0a0', '#fff8d8']), size: rr(1, 2), grav: 0, drag: 1, type: 'leaf'
  }));
  if (Math.random() < dt * 3.2) G.particles.push(new Particle({
    x: rr(-10, VW + 10), y: rr(70, 130), vx: rr(0.2, 0.7), vy: rr(0.1, 0.35),
    life: rr(4, 9), col: rpick(['#7ec44f', '#4f9a3f', '#c9d86a']), size: rr(1, 2), grav: 0, type: 'leaf'
  }));

  /* the cog, top right of the title */
  const gr = { x: VW - 28, y: 6, w: 22, h: 22 };
  T.overGear = Input.mx >= gr.x && Input.mx <= gr.x + gr.w && Input.my >= gr.y && Input.my <= gr.y + gr.h;
  if (G.settingsOpen) { updateSettings(); return; }
  if (T.phase === 'idle' && Input.mhit && T.overGear) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }

  if (T.phase === 'idle') {
    T.btnY = T.baseY + Math.sin(T.t * 1.35) * 5;
    const w = 104, h = 30;
    T.hover = !T.overGear && Math.abs(Input.mx - VW / 2) < w / 2 && Math.abs(Input.my - T.btnY) < h / 2;
    T.scale = lerp(T.scale, T.hover ? 1.06 : 1, 1 - Math.pow(0.001, dt));
    if ((T.hover && Input.mhit) || Input.hit('Enter') || Input.hit('Space')) {
      T.phase = 'spin'; T.animT = 0; T.spinV = 0;
      Snd.init(); Snd.resume(); Snd.charge(); Snd.musicLevel(0.10, 1.5);
    }
  } else if (T.phase === 'spin') {
    T.animT += dt;
    T.spinV += dt * (18 + T.animT * T.animT * 90);
    T.spin += T.spinV * dt;
    T.scale = 1 + T.animT * 0.28 + Math.sin(T.animT * 9) * 0.06;
    T.btnY = T.baseY - T.animT * 10;
    G.shakeAmt = Math.min(9, T.animT * 5);
    for (let i = 0; i < 3; i++) {
      const a = rr(0, TAU), r2 = 34 + T.animT * 12;
      G.particles.push(new Particle({
        x: VW / 2 + Math.cos(a) * r2, y: T.btnY + Math.sin(a) * r2 * 0.6,
        vx: -Math.cos(a) * rr(1, 3), vy: -Math.sin(a) * rr(1, 3),
        life: rr(0.2, 0.5), col: '#ffeec0', col2: '#c68e3f', size: rr(1, 2.5), grav: 0, drag: 0.92
      }));
    }
    if (T.animT > 1.75) {
      T.phase = 'boom'; T.animT = 0;
      Snd.explode(); G.shakeAmt = 12;
      for (let i = 0; i < 190; i++) G.particles.push(new Particle({
        x: VW / 2, y: T.btnY, vx: rr(-9, 9), vy: rr(-8, 8), life: rr(0.4, 1.2),
        col: rpick(['#ffeec0', '#ffd04a', '#c68e3f', '#ffffff']), col2: '#8a5f26',
        size: rr(1, 3.5), grav: 0.08, drag: 0.93
      }));
    }
  } else if (T.phase === 'boom') {
    T.animT += dt;
    G.flashAmt = Math.max(G.flashAmt, 1.5 - T.animT * 2.4);
    if (T.animT > 0.5) { openFiles(); return; }   /* pick a file, then the realm map */
  }

  for (const p of G.particles) p.update(dt);
  G.particles = G.particles.filter(p => !p.dead);
}

/* a line of control hints, kept inside the screen: a long key name drops the
   last part rather than running off both edges */
function fitLine(parts) {
  const out = parts.slice();
  while (out.length > 1 && textWidth(out.join('   ')) > VW - 12) out.pop();
  return out.join('   ');
}
function drawTitle() {
  const T = G.title;
  const sk = G.shakeAmt;
  const shx = sk > 0.2 ? rr(-sk, sk) : 0, shy = sk > 0.2 ? rr(-sk, sk) : 0;
  ctx.save();
  ctx.translate(Math.round(shx), Math.round(shy));

  ctx.drawImage(makeSky('dawn', [[0, '#3f5f9e'], [0.28, '#6f9fd0'], [0.52, '#a9cfe4'],
                                 [0.72, '#e8cfa8'], [1, '#f2ddb0']]), 0, 0);
  /* sun */
  const sx = 268, sy = 52 + Math.sin(T.t * 0.22) * 2;
  ctx.save(); ctx.globalAlpha = 0.95;
  ctx.drawImage(Art.bg.sun, Math.round(sx - Art.bg.sun.width / 2), Math.round(sy - Art.bg.sun.height / 2));
  ctx.restore();
  /* clouds */
  for (let i = 0; i < 7; i++) {
    const c = Art.bg.clouds[i % 3];
    const sp = 1.6 + (i % 3) * 1.3;
    const x = ((T.t * sp + i * 121) % (VW + 170)) - 85;
    const y = 10 + (i % 4) * 16;
    ctx.save(); ctx.globalAlpha = 0.5 + (i % 3) * 0.14;
    ctx.drawImage(c, Math.round(x), Math.round(y));
    ctx.restore();
  }
  /* birds */
  for (const b of T.birds) {
    const f = Math.sin(T.t * 7 + b.ph) * 2;
    ctx.fillStyle = '#3c4a63';
    ctx.fillRect(Math.round(b.x - 3), Math.round(b.y - f), 3, 1);
    ctx.fillRect(Math.round(b.x + 1), Math.round(b.y - f), 3, 1);
    ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
  }
  /* ridges */
  tileX(ctx, Art.bg.mtnFar, -T.t * 0.9, VH - 152, VW);
  tileX(ctx, Art.bg.mtnNear, -T.t * 1.5, VH - 134, VW);
  ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#d8e6ee'; ctx.fillRect(0, 0, VW, VH - 96); ctx.restore();
  tileX(ctx, Art.bg.hillFar, -T.t * 2.2, VH - 120, VW);
  tileX(ctx, Art.bg.treeFar, -T.t * 3.0, VH - 112, VW);
  tileX(ctx, Art.bg.hillMid, -T.t * 4.0, VH - 100, VW);
  /* trees on the middle ridge */
  for (const p of T.midProps) {
    const s = Art.prop.trees[p.idx];
    blitSway(ctx, s.c, p.x, p.y, p.sway, T.t * 0.8 + p.ph, s.ax, s.ay, 8, p.scale);
  }
  tileX(ctx, Art.bg.treeMid, -T.t * 5.2, VH - 96, VW);
  tileX(ctx, Art.bg.hillNear, -T.t * 6.4, VH - 78, VW);
  ctx.save(); ctx.globalAlpha = 0.12; ctx.fillStyle = '#cfe4ea'; ctx.fillRect(0, 0, VW, VH); ctx.restore();

  /* the near bank and everything growing on it */
  ctx.drawImage(T.groundCv, 0, VH - 60);
  for (const p of T.fgProps) {
    let s;
    if (p.kind === 'tree') s = Art.prop.trees[p.idx];
    else if (p.kind === 'tuft') s = Art.prop.tuft[p.idx];
    else if (p.kind === 'flower') s = Art.prop.flower[p.idx];
    else if (p.kind === 'bush') s = Art.prop.bush[p.idx];
    else if (p.kind === 'mushroom') s = Art.prop.mushroom[p.idx];
    else s = Art.prop.rock[p.idx];
    if (p.sway) blitSway(ctx, s.c, p.x, p.y, p.sway, T.t * 1.15 + p.ph, s.ax, s.ay, 6, p.scale);
    else blit(ctx, s.c, p.x, p.y, s.ax * p.scale, s.ay * p.scale);
  }
  for (const pa of G.particles) pa.draw(ctx);

  /* title */
  const bob = Math.sin(T.t * 0.9) * 1.5;
  drawText(ctx, 'EMBERWOOD', VW / 2, 26 + bob, '#2a1a10', 5, 'center');
  drawText(ctx, 'EMBERWOOD', VW / 2 - 1, 24 + bob, '#f0c93a', 5, 'center');
  drawText(ctx, 'EMBERWOOD', VW / 2 - 1, 23 + bob, '#ffeec0', 5, 'center');
  drawText(ctx, 'THREE REALMS, THREE GUARDIANS', VW / 2, 64 + bob, '#f6ecd0', 1, 'center', '#2a1a10');

  /* start button */
  if (T.phase !== 'boom') {
    ctx.save();
    ctx.translate(Math.round(VW / 2), Math.round(T.btnY));
    ctx.rotate(T.spin);
    ctx.scale(T.scale, T.scale);
    if (T.hover && T.phase === 'idle') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffd04a'; ctx.fillRect(-58, -20, 116, 40); ctx.restore();
    }
    ctx.drawImage(Art.ui.startBtn, -52, -15);
    ctx.restore();
    if (T.phase === 'idle') {
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(T.t * 3) * 0.25;
      drawText(ctx, 'CLICK  OR  PRESS  ENTER', VW / 2, T.btnY + 22, '#2a2016', 1, 'center');
      ctx.restore();
    }
  }
  /* controls */
  ctx.save(); ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(10,8,18,0.55)'; ctx.fillRect(0, VH - 22, VW, 22);
  if (G.mobile) {
    drawText(ctx, 'MOBILE - TAP THE BUTTONS ON SCREEN', VW / 2, VH - 19, '#9be89a', 1, 'center');
    drawText(ctx, fitLine(['PAD MOVES AND JUMPS', 'DOWN CROUCHES', 'TAP A DOOR']),
             VW / 2, VH - 9, '#c9d4e8', 1, 'center');
  } else {
    drawText(ctx, fitLine([keyLabel(KEYS.left) + '/' + keyLabel(KEYS.right) + ' MOVE',
                           keyLabel(KEYS.up) + ' JUMP',
                           keyLabel(KEYS.down) + ' CROUCH',
                           keyLabel(KEYS.attack) + ' SWORD']),
             VW / 2, VH - 19, '#c9d4e8', 1, 'center');
    drawText(ctx, fitLine([keyLabel(KEYS.dash) + ' DASH',
                           keyLabel(KEYS.pierce) + ' PIERCE',
                           'CLICK A DOOR',
                           keyLabel(KEYS.shop) + ' SHOP']),
             VW / 2, VH - 9, '#c9d4e8', 1, 'center');
  }
  ctx.restore();
  if (G.audioHint) drawText(ctx, 'CLICK FOR SOUND', VW - 4, 34, '#ffeec0', 1, 'right', '#2a1a10');

  /* settings cog */
  {
    const hov = T.overGear && T.phase === 'idle';
    if (hov) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#c0c8d6'; ctx.beginPath(); ctx.arc(VW - 17, 17, 15, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.save();
    ctx.translate(VW - 17, 17);
    ctx.rotate(T.t * (hov ? 1.1 : 0.25));
    ctx.drawImage(Art.ui.gear, -11, -11);
    ctx.restore();
    if (hov) drawText(ctx, 'SETTINGS', VW - 17, 32, '#ffeec0', 1, 'center', '#2a1a10');
  }

  ctx.restore();
  if (G.settingsOpen) drawSettings();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   render dispatch + boot
   ============================================================ */
function render() {
  ctx.imageSmoothingEnabled = false;
  if (G.state === 'load') { drawLoad(); drawCursor(); return; }
  if (G.state === 'title') { drawTitle(); drawCursor(); return; }
  if (G.state === 'files') { drawFiles(); drawCursor(); return; }
  if (G.state === 'map') { drawMap(); drawCursor(); return; }
  drawWorld();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
