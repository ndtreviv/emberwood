/* ============================================================
   game.js — states, camera, transitions, rendering, HUD, shop.
   ============================================================ */
'use strict';

const G = {
  state: 'load', t: 0, dt: 0,
  room: null, roomId: null,
  player: null,
  enemies: [], coins: [], projectiles: [], particles: [], texts: [], items: [],
  lifts: [], hazards: [],
  cam: { x: 0, y: 0, ax: 0, ay: 0 },
  shakeAmt: 0, flashAmt: 0, hitStopT: 0,
  stats: { coins: 0, kills: 0, time: 0, deaths: 0 },
  clickAttack: false,
  bossFight: false, boss: null,
  roomFlags: {},
  flags: {},
  bannerTxt: '', bannerT: 0,
  trans: null, swallowed: null, escaped: null, acid: null, acidBurnT: 0, throne: null,
  gulletVisits: 0,
  relicShow: null,
  shopOpen: false, shopSel: -1,
  level: 0, unlocked: 1, cleared: [false, false, false], levelState: {},
  mapSel: -1, mapT: 0, levelClearT: 0,
  combo: 0, comboT: 0, comboBest: 0,
  waves: [],
  codes: { found: {}, used: {}, tickets: 0, admin: false },
  codesOpen: false, codeBuf: '', codeMsg: '', codeMsgT: 0, codeMsgOk: false,
  questsOpen: false, questSel: -1, questTab: 0, questMsg: '', questMsgT: 0,
  quests: { claimed: {} },
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
  opts: { mobile: null, music: 0.7, sfx: 0.8, padAlpha: 0.5, shake: 1, keys: null },
  setTab: 0, setSel: -1, setDrag: null, setStep: -1, bindWait: null,
  profSel: -1, profT: 0, profAfter: 'map', profPreview: null
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
    if (typeof o.shake === 'number') G.opts.shake = clamp(o.shake, 0, 1);
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
    xp: G.xp | 0, prestige: G.prestige | 0, rubies: G.rubies | 0,
    arrows: G.arrows | 0, boosts: G.boosts ? G.boosts.slice() : [],
    buffDone: Object.assign({}, G.buffDone || {}), buffTier: G.buffTier | 0,
    account: Object.assign({}, G.account || {}),
    levelState: ls, roomFlags: packFlags(G.roomFlags), flags: G.flags,
    coins: p ? p.coins : 0, up: p ? Object.assign({}, p.up) : {},
    maxHp: p ? p.maxHp : 6, hp: p ? p.hp : 6, hasKey: p ? p.hasKey : false,
    codes: { found: G.codes.found, used: G.codes.used, tickets: G.codes.tickets,
             admin: G.codes.admin },
    profile: Object.assign({}, G.profile),
    unlockedHair: Object.assign({}, G.unlockedHair || {}),
    gulletVisits: G.gulletVisits || 0,
    quests: { claimed: (G.quests && G.quests.claimed) || {},
              daily: (G.quests && G.quests.daily) || null },
    comboBest: G.comboBest || 0,
    buried: G.buried || null,
    vaultKey: G.vaultKey || null,
    archipelago: G.archipelago ? {
      open: G.archipelago.open, type: G.archipelago.type,
      shards: G.archipelago.shards, parts: G.archipelago.parts,
      opened: G.archipelago.opened, cleared: G.archipelago.cleared
    } : null,
    artifacts: { owned: Object.assign({}, (G.artifacts && G.artifacts.owned) || {}),
                 slots: ((G.artifacts && G.artifacts.slots) || [null, null, null]).slice() },
    wardrobe: Object.assign({}, (G.wardrobe && G.wardrobe.owned) || {}),
    tut: G.tut, stats: G.stats
  };
}
function readSlot(i) { return Store.read(SAVE_KEY + i, null); }
function writeSlot(i, data) { Store.write(SAVE_KEY + i, data); }
G.saveGame = function () {
  if (G.state === 'load' || G.state === 'title' || G.state === 'wardrobe' ||
      G.state === 'archipelago' || G.state === 'files') return;
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
  G.xp = Math.max(0, d.xp | 0);
  G.rubies = Math.max(0, d.rubies | 0);
  G.arrows = Math.max(0, d.arrows | 0);
  G.boosts = (d.boosts || []).slice();
  G.prestige = clamp(d.prestige | 0, 0, PRESTIGE_MAX);
  G.buffDone = d.buffDone || {};
  G.buffTier = clamp(d.buffTier | 0, 0, G.prestige);
  G.account = Object.assign(newAccount(), d.account || {});
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
  p.up = Object.assign({ sword: 0, speed: 0, dash: 0, magnet: 0, armour: 0, special: 0, wings: 0, mantle: 0, emberheart: 0, sandstep: 0, heart: 0 }, d.up || {});
  p.maxHp = d.maxHp || 6;
  p.hp = clamp(d.hp || p.maxHp, 1, p.maxHp);
  p.hasKey = !!d.hasKey;
  G.codes.found = d.codes && d.codes.found || {};
  G.codes.used = d.codes && d.codes.used || {};
  G.codes.tickets = (d.codes && d.codes.tickets) || 0;
  G.codes.admin = !!(d.codes && d.codes.admin);
  G.profile = Object.assign({ hair: 0, hairCol: 0, outfit: 0, tee: 0, cape: 'none', suit: 'none' }, d.profile || {});
  G.gulletVisits = d.gulletVisits || 0;
  G.unlockedHair = Object.assign({}, d.unlockedHair || {});
  Art.lockExtraHair();
  for (const k in G.unlockedHair) if (G.unlockedHair[k]) Art.unlockHairColour(k);
  G.quests = { claimed: (d.quests && d.quests.claimed) || {},
               daily: (d.quests && d.quests.daily) || null };
  G.comboBest = d.comboBest || 0;
  {
    const sl = (d.artifacts && d.artifacts.slots) || [];
    G.artifacts = { owned: (d.artifacts && d.artifacts.owned) || {},
                    slots: [sl[0] || null, sl[1] || null, sl[2] || null] };
    /* never wear what is not owned, and never wear one twice */
    const seen = {};
    for (let i = 0; i < ARTIFACT_SLOTS; i++) {
      const k = G.artifacts.slots[i];
      if (!k || !artifactBy(k) || !G.artifacts.owned[k] || seen[k]) G.artifacts.slots[i] = null;
      else seen[k] = 1;
    }
  }
  G.wardrobe = { owned: d.wardrobe || {} };
  G.buried = d.buried || null;
  G.vaultKey = d.vaultKey || null;
  {
    const a = newArchipelago(), sv = d.archipelago;
    if (sv) {
      a.open = !!sv.open;
      for (const t of ISLE_TYPES) {
        a.shards[t.shard] = (sv.shards && sv.shards[t.shard]) | 0;
        a.parts[t.shard] = (sv.parts && sv.parts[t.shard]) | 0;
        a.opened[t.key] = clamp((sv.opened && sv.opened[t.key]) || 1, 1, ISLES_PER_TYPE);
      }
      a.cleared = sv.cleared || {};
    }
    G.archipelago = a;
  }
  G.surfacing = null;
  G.tut = Object.assign({ move: 0, fight: 0, swim: 0, dash: 0, pierce: 0, climb: 0, parry: 0 }, d.tut || {});
  G.stats = Object.assign({ coins: 0, kills: 0, time: 0, deaths: 0 }, d.stats || {});
  try { G.applyArtifacts(); } catch (e) { console.error('artifacts', e); }
  try { applyProfile(); } catch (e) { console.error('profile', e); }
  if (G.codes.admin) { try { Art.buildGold(); } catch (e) { /* art may not be up yet */ } }
}
/* What a file is worth, counted over the whole game: every realm of all
   three chapters, the two papers hidden in each of them, and every upgrade
   level at its full nine-realm cap, relics included. */
function slotTally(d) {
  const realms = World.LEVELS.length;              /* five chapters, three realms each */
  const papers = World.CODES.length;               /* two in every realm */
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
/* how many of the realms a file has taken on a buffed run of one tier */
function slotBuffCount(d, tier) {
  const done = (d && d.buffDone) || {};
  let n = 0;
  for (let i = 0; i < World.LEVELS.length; i++) if (done[tier + ':' + i]) n++;
  return n;
}
/* The first hundred is every realm cleared, every paper found and every
   upgrade maxed.  After that each buffed run of the whole game is worth a
   hundred more: bronze carries a finished file to 200, silver to 300 and
   gold to 400. */
/* a function, not a constant: the count of marks is declared further down */
function filePctMax() { return 100 * (1 + PRESTIGE_MAX); }
function slotPercent(d) {
  if (!d) return 0;
  const t = slotTally(d);
  const f = (t.realms / t.realmsMax + t.papers / t.papersMax + t.upgrades / t.upgradesMax) / 3;
  let pct = Math.round(clamp(f, 0, 1) * 100);
  for (let tier = 1; tier <= PRESTIGE_MAX; tier++)
    pct += Math.round(slotBuffCount(d, tier) / World.LEVELS.length * 100);
  return Math.min(filePctMax(), pct);
}
/* which metal a file has reached: none, then bronze, silver and gold */
function fileTier(pct) {
  if (pct >= 400) return 3;
  if (pct >= 300) return 2;
  if (pct >= 200) return 1;
  return 0;
}
/* what colour a file writes its number and its percentage in */
function fileTierCol(pct) {
  const t = fileTier(pct);
  return t ? PRESTIGE_COL[t] : (pct >= 100 ? '#ffd04a' : '#ffeec0');
}

/* ---------- effects ---------- */
G.shake = function (a) { G.shakeAmt = Math.min(12, G.shakeAmt + a * G.opts.shake); };
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
  p.maxHp = 6 + p.up.heart * 2 + (G.hasArtifact('ankh') ? 2 : 0) + (G.hasArtifact('sunheart') ? 8 : 0);
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
  if (name === 'DYLAN') {
    G.unlockedHair = G.unlockedHair || {};
    if (G.unlockedHair.GINGER) {
      Snd.uiBad(); G.codeMsg = 'ALREADY YOURS'; G.codeMsgOk = false; G.codeMsgT = 2.6; return;
    }
    G.unlockedHair.GINGER = true;
    Art.unlockHairColour('GINGER');
    G.codeMsg = 'GINGER HAIR UNLOCKED'; G.codeMsgOk = true; G.codeMsgT = 4;
    Snd.unlock(); G.flash(0.4);
    G.saveGame();
    return;
  }
  if (name === 'CHEESE') {
    if (G.archipelago && G.archipelago.open) {
      Snd.uiBad(); G.codeMsg = 'ALREADY OPEN'; G.codeMsgOk = false; G.codeMsgT = 2.6; return;
    }
    G.archipelago = G.archipelago || newArchipelago();
    G.archipelago.open = true;
    G.codeMsg = 'THE ARCHIPELAGO OPENS'; G.codeMsgOk = true; G.codeMsgT = 4;
    Snd.unlock(); G.flash(0.6); G.shake(6);
    G.saveGame();
    return;
  }
  /* Three codes that hand over levels outright.  Each one may be used again
     and again, until the hundredth level. */
  if (XP_CODES[name] !== undefined) {
    const was = G.level0();
    if (was >= LEVEL_MAX) {
      Snd.uiBad(); G.codeMsg = 'ALREADY AT LEVEL ' + LEVEL_MAX;
      G.codeMsgOk = false; G.codeMsgT = 2.6; return;
    }
    const want = clamp(was + XP_CODES[name], 1, LEVEL_MAX);
    /* one point over the top at the hundredth, so the prestige button shows */
    G.xp = want >= LEVEL_MAX ? XP_TABLE[LEVEL_MAX - 1] + 1 : XP_TABLE[want - 1];
    G.codeMsg = 'LEVEL ' + was + ' TO ' + want;
    G.codeMsgOk = true; G.codeMsgT = 4;
    Snd.unlock(); G.flash(0.5); G.shake(4);
    if (G.state === 'play' && G.player) for (let i = 0; i < 70; i++) G.particles.push(new Particle({
      x: G.player.cx, y: G.player.cy, vx: rr(-4, 4), vy: rr(-4, 1.5), life: rr(0.5, 1.3),
      col: rankColour(want), col2: '#ffffff', size: rr(1, 3), grav: 0.05, drag: 0.94
    }));
    G.saveGame();
    return;
  }
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
  /* the scarab charm pays a quarter more on every kill */
  return ((lv && lv.coinScale) || 1) * (G.hasArtifact('scarab') ? 1.25 : 1)
         * (G.hasArtifact('coinclasp') ? 1.1 : 1)
         * (G.boostLeft && G.boostLeft('coin') > 0 ? 2 : 1)
         * (G.hasArtifact('pharaohcrook') ? 2 : 1);
};
G.purse = function () { return G.codes.admin ? INF : String(G.player.coins); };
G.spawnCoin = function (x, y, vx, vy, still, si, value) {
  const c = new Coin(x, y, vx, vy, still, value);
  if (si !== undefined) c.si = si;
  G.coins.push(c);
};
/* Pay out a sum. Up to nine it is loose coins; beyond that it comes in
   heaps of five, so the later realms do not bury the room in single coins. */
const COIN_LOOSE_MAX = 9, COIN_PER_HEAP = 5, COIN_MAX_OBJECTS = 22;
G.payOut = function (n, x, y) {
  n = Math.max(1, Math.round(n));
  if (n <= COIN_LOOSE_MAX) {
    for (let i = 0; i < n; i++) G.spawnCoin(x + rr(-4, 4), y, rr(-2.2, 2.2), rr(-3.4, -1.4));
    return;
  }
  /* five to a heap, and more than five where a realm pays so well that
     five would still leave hundreds of things rolling about */
  let per = COIN_PER_HEAP;
  if (n / per > COIN_MAX_OBJECTS) per = Math.ceil(n / COIN_MAX_OBJECTS);
  const heaps = Math.floor(n / per), rest = n - heaps * per;
  for (let i = 0; i < heaps; i++)
    G.spawnCoin(x + rr(-7, 7), y, rr(-2.4, 2.4), rr(-3.6, -1.4), false, undefined, per);
  if (rest > 0)
    G.spawnCoin(x + rr(-5, 5), y, rr(-2.2, 2.2), rr(-3.4, -1.4), false, undefined, rest);
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

/* Chapter two is under the sea, so the hero wears a glass bubble there. */
G.needsBubble = function () {
  if (!G.room || G.state !== 'play') return false;
  if (G.roomId === 'gullet') return true;
  return World.chapterOf(G.level) === 1;
};
/* ============================================================
   FALLING THROUGH THE WORLD.  Quicksand and powdered snow only
   let a ring bearer through.  What is under them is a room of
   its own, and a door at its end puts you back on the surface.
   ============================================================ */
/* The ring, or the Sandstep bought in the waste: either one carries you
   through ground that would otherwise swallow you. */
G.canPhase = function () {
  if (G.hasArtifact && G.hasArtifact('ring')) return true;
  return !!(G.player && G.player.up && G.player.up.sandstep > 0);
};
/* which patch of phase ground a point stands over */
function phasePoolAt(room, px) {
  const pools = room && room.phasePools;
  if (!pools) return null;
  const tx = Math.floor(px / TILE);
  for (const q of pools) if (tx >= q.x - 1 && tx <= q.x + q.w) return q;
  return pools[0];
}
G.dropThroughPhase = function (quick, atX) {
  if (G.trans || G.buried) return;
  const p = G.player;
  const pool = phasePoolAt(G.room, atX === undefined ? p.cx : atX);
  const seed = pool ? pool.seed : 5501;
  /* every patch has a vault of its own, cut from that patch's seed */
  G.vaultKey = G.roomId + ':' + seed;
  World.rooms.vault = World.buildVault(seed, quick ? 'sand' : 'snow',
                                       quick ? 'THE BURIED VAULT' : 'THE HOLLOW UNDER THE DRIFT');
  /* Where the way out puts you back.  It is three tiles over the surface of
     the pool that swallowed you, and over the firm lip beside it, so you
     come down on solid ground rather than straight back into the sand. */
  const lipX = pool ? (pool.x - 1) * TILE + TILE / 2 : p.cx;
  const lipY = (pool ? pool.y : Math.floor((p.y + p.h) / TILE)) * TILE - 3 * TILE;
  G.buried = { roomId: G.roomId, level: G.level, x: lipX, y: lipY, key: G.vaultKey };
  Snd.door(); G.flash(0.4); G.shake(5);
  for (let i = 0; i < 30; i++) G.particles.push(new Particle({
    x: p.cx + rr(-12, 12), y: p.y + p.h, vx: rr(-2, 2), vy: rr(-3, -0.4), life: rr(0.3, 0.8),
    col: quick ? '#cfb87c' : '#ffffff', col2: quick ? '#7d6636' : '#c3cfe2',
    size: rr(1, 2.8), grav: 0.16
  }));
  G.enterRoom('vault', null);
  G.banner(quick ? 'THE SAND GIVES WAY' : 'THE DRIFT GIVES WAY', 2.6);
};
/* The way back up.  The door heaves itself out of the ground, the hero
   steps through it, and the ground takes it back. */
G.leaveSecret = function () {
  if (G.trans) return;
  /* A save loaded inside a buried room remembers no way back.  The door still
     works: it puts you out at the head of the realm you were in. */
  const b = G.buried || { roomId: (World.LEVELS[G.level] || World.LEVELS[0]).start,
                          level: G.level, x: null, y: null };
  G.buried = null;
  Snd.door();
  G.trans = { t: 0, phase: 'out', dur: 0.42, id: b.roomId, surface: b,
              exit: b.x === null ? null : { spawnAt: { x: b.x, y: b.y } } };
};
const SURFACE_DUR = 2.6;
/* The pool at the door of a guardian.  Stand in it and it gives your hearts
   back, a little at a time, and it says so. */
function updateOasis(dt) {
  const o = G.room && G.room.oasis;
  if (!o) return;
  const p = G.player;
  if (p.dead) return;
  const inIt = rectsOverlap({ x: o.x, y: o.y - 6, w: o.w, h: o.h + 6 },
                            { x: p.x, y: p.y, w: p.w, h: p.h });
  if (!inIt) { G.oasisT = 0; return; }
  if (p.burnT > 0) { p.burnT = 0; p.burnAcc = 0; }
  if (p.hp >= p.maxHp) {
    if (!G.oasisFull) { G.oasisFull = true; G.banner('THE OASIS HAS YOU WHOLE', 2); }
    return;
  }
  G.oasisFull = false;
  G.oasisT = (G.oasisT || 0) + dt;
  if (G.oasisT >= 0.3) {
    G.oasisT = 0;
    p.hp = Math.min(p.maxHp, p.hp + 1);
    Snd.drip();
    for (let i = 0; i < 8; i++) G.particles.push(new Particle({
      x: p.cx + rr(-8, 8), y: p.cy + rr(-8, 8), vx: rr(-0.5, 0.5), vy: rr(-1.6, -0.4),
      life: rr(0.4, 0.9), col: '#cfeaff', col2: '#6fc4bc', size: rr(1, 2.2), grav: -0.03
    }));
  }
}
function updateSurfacing(dt) {
  const S = G.surfacing;
  if (!S) return;
  S.t += dt;
  const p = G.player;
  /* held in place while the door comes up and lets you out */
  const hx = S.hx === undefined ? S.x : S.hx, hy = S.hy === undefined ? S.y : S.hy;
  if (S.t < 1.5) { p.vx = 0; p.vy = 0; p.x = hx - p.w / 2; p.y = hy - p.h; }
  if (Math.random() < dt * 40) G.particles.push(new Particle({
    x: S.x + rr(-18, 18), y: S.y - rr(0, 4), vx: rr(-1, 1), vy: rr(-1.6, -0.2),
    life: rr(0.3, 0.8), col: '#e0d3a8', col2: '#a8894f', size: rr(1, 2.4), grav: 0.12
  }));
  if (S.t >= SURFACE_DUR) G.surfacing = null;
}
function drawSurfacing(camX, camY) {
  const S = G.surfacing;
  if (!S) return;
  const x = Math.round(S.x - camX), y = Math.round(S.y - camY);
  /* three beats: the door rises, it stands open, the ground swallows it */
  let up;
  if (S.t < 0.9) up = clamp(S.t / 0.9, 0, 1);
  else if (S.t < 1.7) up = 1;
  else up = clamp(1 - (S.t - 1.7) / 0.9, 0, 1);
  const h = Math.round(46 * up);
  if (h <= 0) return;
  ctx.save();
  /* the sand heaped round its foot */
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath(); ctx.ellipse(x, y, 26, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e0d3a8';
  ctx.beginPath(); ctx.ellipse(x, y - 1, 22, 4, 0, 0, TAU); ctx.fill();
  /* the door itself, clipped to whatever has come up so far */
  ctx.beginPath(); ctx.rect(x - 20, y - h, 40, h); ctx.clip();
  ctx.fillStyle = '#7b6338';
  ctx.fillRect(x - 17, y - 46, 34, 46);
  ctx.fillStyle = '#b09563';
  ctx.fillRect(x - 15, y - 44, 30, 44);
  ctx.fillStyle = '#e0b040';
  ctx.fillRect(x - 17, y - 46, 34, 3);
  ctx.fillRect(x - 17, y - 30, 34, 2);
  /* the dark of the way through */
  const openK = clamp((S.t - 0.9) / 0.4, 0, 1) * clamp((1.9 - S.t) / 0.3, 0, 1);
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(x - 10, y - 36, Math.round(20 * clamp(openK, 0, 1)), 36);
  ctx.fillStyle = '#2f5fb0';
  for (let k = 0; k < 3; k++) ctx.fillRect(x - 13 + k * 9, y - 26, 4, 4);
  ctx.restore();
  /* the hero stepping out, drawn over the door while it stands */
  if (S.t > 0.9 && S.t < 1.7) {
    const k = clamp((S.t - 0.9) / 0.8, 0, 1);
    const px = x - 14 + k * 20;
    const img = Art.hero.walk[Math.floor(S.t / 0.09) % 8];
    blit(ctx, img, px, y, Art.hero.anchor.x, Art.hero.anchor.y, false);
  }
}
G.enterRoom = function (id, spawn) {
  const room = World.rooms[id];
  G.room = room; G.roomId = id;
  G.enemies.length = 0; G.coins.length = 0; G.projectiles.length = 0; G.waves.length = 0;
  G.particles.length = 0; G.texts.length = 0; G.items.length = 0;
  G.lifts.length = 0; G.hazards.length = 0;
  G.boss = null; G.bossFight = false;
  /* a new room puts out any fire you carried out of the last one */
  if (G.player) { G.player.burnT = 0; G.player.burnAcc = 0; G.player.heldBy = null; }
  if (!G.roomFlags[id]) G.roomFlags[id] = { coins: new Set() };
  const flags = G.roomFlags[id];

  /* some realms breed hardier creatures; bosses set their own health */
  const lv = World.LEVELS[room.level];
  /* every creature stands twice what it did, on top of its realm's own scale */
  let hpScale = ((lv && lv.enemyHp) || 1) * 2;
  let dmgScale = (lv && lv.enemyDmg) || 1;
  /* An island is a harder place than any realm, and it gets harder the
     further out along its spoke it lies.  The first island breeds creatures
     that stand three times what a plain one does.  The fiftieth breeds
     creatures that stand twenty four times it and hit four times as hard. */
  if (room.isle) {
    const f = room.isle.index / Math.max(1, ISLES_PER_TYPE - 1);
    hpScale = (3 + f * 21) * (1 + room.isle.level * 0.12);
    dmgScale = 1.5 + f * 2.5;
  } else {
    /* a buffed run breeds harder creatures than the plain one did */
    const bt = clamp(G.buffTier | 0, 0, PRESTIGE_MAX);
    hpScale *= BUFF_HP[bt];
    dmgScale *= BUFF_DMG[bt];
  }
  /* A generator can place a creature where a ledge or a wall was cut in
     afterwards, and it then starts life buried in the rock. Step it clear
     before the room begins: up first, since that is nearly always where
     the open air is, and down only if there is nothing above. */
  const unstick = (e) => {
    if (!room || room.mode === 'top' || !e.w || !e.h) return e;
    const fits = (y) => !room.boxSolid(e.x - e.w / 2, y - e.h, e.w, e.h);
    if (fits(e.y)) return e;
    for (let d = 4; d <= 140; d += 4) {
      if (fits(e.y - d)) { e.y -= d; return e; }
      if (fits(e.y + d)) { e.y += d; return e; }
    }
    /* nowhere clear in that column: try a little to either side */
    for (let dx = 8; dx <= 48; dx += 8) {
      for (const sx of [-dx, dx]) {
        const ox = e.x; e.x += sx;
        for (let d = 0; d <= 96; d += 4) {
          if (fits(e.y - d)) { e.y -= d; return e; }
        }
        e.x = ox;
      }
    }
    return e;
  };
  const tough = (e) => {
    unstick(e);
    if (hpScale !== 1) { e.hp = Math.round(e.hp * hpScale); e.maxHp = e.hp; }
    if (dmgScale !== 1) e.damage = Math.max(1, Math.round((e.damage || 1) * dmgScale));
    G.enemies.push(e);
    return e;
  };

  /* guardians are far hardier than they were; the last one hardest of all.
     A realm may set its own bossHp, and Emberwood does: it is the first fight
     anyone has, usually with no whetstone bought yet. */
  const lastLevel = World.LEVELS.length - 1;
  const roomLv = World.LEVELS[room.level];
  const bossScale = ((roomLv && roomLv.bossHp !== undefined)
    ? roomLv.bossHp
    : ((room.level === lastLevel) ? 10 : 3)) * BUFF_BOSS[clamp(G.buffTier | 0, 0, PRESTIGE_MAX)];
  const hardenBoss = (b) => {
    b.hp = Math.round(b.hp * bossScale);
    b.maxHp = b.hp;
    return b;
  };

  room.spawns.forEach((sp, i) => {
    switch (sp.type) {
      case 'armour': tough(new Armour(sp.x, sp.y)); break;
      case 'lift': G.lifts.push(new Lift(sp)); break;
      case 'spikes': G.hazards.push(new Spikes(sp)); break;
      case 'crusher': G.hazards.push(new Crusher(sp)); break;
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
      case 'wolf': tough(new Wolf(sp.x, sp.y)); break;
      case 'icewisp': tough(new IceWisp(sp.x, sp.y)); break;
      case 'yeti': tough(new Yeti(sp.x, sp.y)); break;
      case 'scarab': tough(new Scarab(sp.x, sp.y)); break;
      case 'vulture': tough(new Vulture(sp.x, sp.y)); break;
      case 'mummy': tough(new Mummy(sp.x, sp.y)); break;
      case 'soldier': tough(new Soldier(sp.x, sp.y)); break;
      case 'idol': G.enemies.push(new Idol(sp.x, sp.y)); break;
      /* the weak spot in the throat: one to a visit, and gone once cut */
      case 'gulletOrb': if (!G.orbCut) G.enemies.push(new GulletOrb(sp.x, sp.y)); break;
      case 'relicChest': if (!G.flags['chest_' + (G.vaultKey || id)]) G.items.push(new RelicChest(sp.x, sp.y, sp.pool)); break;
      case 'guardian': {
        const bt = clamp(G.buffTier | 0, 0, PRESTIGE_MAX);
        const gd = hardenBoss(new Guardian(sp.x, sp.y, sp.key, { dmgMul: BUFF_DMG[bt] }));
        G.enemies.push(gd); G.boss = gd; break;
      }
      case 'isleBoss': {
        /* The further out the island, the harder its keeper: far more
           health, far heavier blows, and past the middle of a spoke it
           stands through five phases rather than three. */
        const tier = sp.tier | 0;
        const f = tier / Math.max(1, ISLES_PER_TYPE - 1);
        const gd = new Guardian(sp.x, sp.y, isleBossKey(sp.kind, tier),
                                { dmgMul: 1.5 + f * 2.5, phases: tier >= 25 ? 5 : 4 });
        /* A keeper's health comes from the tier alone, not from the shape it
           borrows: the shapes carry very different numbers, and the fight
           must take the same long time whichever one turns up.  That is
           about a minute and a half at the first island and nine at the
           fiftieth, for a player who cuts well. */
        gd.hp = Math.round(3600 + tier * 440); gd.maxHp = gd.hp;
        gd.isleTier = tier;
        G.enemies.push(gd); G.boss = gd;
        break;
      }
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
  /* the throne room holds its breath: no music, no wind, and no dragon
     until the armour has had its say */
  /* a wall the sphinx already drew aside stays aside */
  G.gateSlide = null;
  G.riddlePick = 0;
  G.oasisFull = false; G.oasisT = 0;
  if (room.gate && G.flags.riddleDone) {
    const saved = G.room; G.room = room;
    G.openGate(true);
    G.room = saved;
  }
  G.throne = room.dragonDrop ? { t: 0, phase: 'hush', drop: room.dragonDrop } : null;
  G.acid = room.acid ? { y: room.acid.y } : null;
  G.acidBurnT = 0;
  G.aimX = clamp(VW / 2 + 60, 20, VW - 20); G.aimY = VH * 0.42; G.aimDrag = null;
  snapCamera();
  Snd.play(room.music);
  Snd.ambienceLevel(room.ambient, 1.4);
  if (G.throne) { Snd.musicLevel(0, 0.2); Snd.ambienceLevel(0, 0.6); }
  else G.banner(room.name, 2.4);
  G.checkRelics();
  G.saveGame();                 /* every new area is a point worth keeping */
};

/* ============================================================
   SWALLOWED — the Leviathan takes you down, and you climb out
   ============================================================ */
G.swallowInto = function (boss) {
  if (G.trans || G.swallowed) return;
  saveLevelState();
  /* the belly is rebuilt meaner for every time it has had you */
  G.gulletVisits = (G.gulletVisits || 0) + 1;
  try {
    World.rooms.gullet = World.buildGullet(4444 + G.gulletVisits * 91, G.gulletVisits - 1);
    World.rooms.gullet.level = G.level;
  } catch (e) { console.error('gullet', e); }
  G.swallowed = {
    roomId: G.roomId, level: G.level,
    bossHp: boss ? boss.hp : null,
    bossMax: boss ? boss.maxHp : null,
    x: G.player.cx, y: G.player.y + G.player.h
  };
  G.orbCut = false;
  G.banner(G.gulletVisits > 1 ? 'SWALLOWED AGAIN' : 'SWALLOWED WHOLE', 2.6);
  G.trans = { t: 0, phase: 'out', dur: 0.5, id: 'gullet', exit: null, swallow: true };
};
/* Cutting the orb in the throat.  It takes a tenth of everything the thing
   outside has, and the wound is still there when you climb out. */
G.strikeSwallower = function () {
  const sw = G.swallowed;
  G.orbCut = true;
  if (!sw || sw.bossHp === null) {
    G.banner('NOTHING OUT THERE FELT IT', 2.4);
    return;
  }
  const max = sw.bossMax || sw.bossHp;
  const bite = Math.max(1, Math.round(max * 0.1));
  sw.bossHp = Math.max(1, sw.bossHp - bite);
  G.banner('A TENTH OF IT IS GONE', 3);
  G.texts.push(new FloatText(G.player.cx, G.player.cy - 18, '-' + bite, '#ff7ab8'));
  G.saveGame();
};
/* cut your way out at the top, and the fight picks up where it left off */
G.escapeGullet = function () {
  let sw = G.swallowed;
  if (!sw) {
    /* no record of being swallowed, so head for the guardian's own room
       rather than dropping the player out to the chart */
    const lv = World.LEVELS[G.level];
    const back = lv && World.rooms[lv.boss] ? lv.boss : (lv ? lv.start : 'glade');
    sw = { roomId: back, level: G.level, bossHp: null, x: null, y: null };
  }
  G.swallowed = null;
  G.acid = null;
  G.escaped = sw;
  G.banner('BACK INTO THE FIGHT', 2.4);
  const exit = (sw.x === null) ? null : { spawnAt: { x: sw.x, y: sw.y } };
  G.trans = { t: 0, phase: 'out', dur: 0.5, id: sw.roomId, exit: exit, escaped: true };
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
    /* the first time out of the tutorial, the LOOK page is the one you want */
    if (tr.toProfile) { openProfile('map', 1); G.trans = null; return; }
    if (tr.toArchi) { openArchipelago(tr.toArchi); G.trans = null; return; }
    if (tr.isleStart) { const st = tr.isleStart; G.trans = null; G.enterIsle(st.key, st.index, 0); return; }
    if (tr.isleNext) {
      const w = G.isleRun;
      G.trans = null;
      G.enterIsle(w.key, w.index, w.level);
      return;
    }
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
    if (tr.surface) {
      /* coming up out of the ground: hold still while the door lets you out.
         The door rises out of the ground under you, which may be some way
         below your feet, but you are held where you came up. */
      G.level = tr.surface.level;
      const px = G.player.x + G.player.w / 2, py = G.player.y + G.player.h;
      const gy = room ? room.groundBelow(px, py) : py;
      G.surfacing = { t: 0, x: px, y: gy, hx: px, hy: py };
      G.player.vx = 0; G.player.vy = 0;
      G.banner('BACK ON THE SURFACE', 2.4);
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
    else if (G.state === 'wardrobe') updateWardrobe(dt);
    else if (G.state === 'archipelago') updateArchipelago(dt);
    else if (G.state === 'store') updateStore(dt);
    else if (G.state === 'files') updateFiles(dt);
    else if (G.state === 'profile') updateProfile(dt);
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
  G.xp = 0; G.prestige = 0; G.buffDone = {}; G.buffTier = 0;
  G.rubies = 0; G.arrows = 0; G.boosts = [];
  G.account = newAccount();
  G.trans = null;
  G.tutorialDone = false;
  G.codes = { found: {}, used: {}, tickets: 0, admin: false };
  G.tut = { move: 0, fight: 0, swim: 0, dash: 0, pierce: 0, climb: 0, parry: 0 };
  G.relicSeen = {}; G.relicShow = null; G.swallowed = null; G.acid = null;
  G.quests = { claimed: {}, daily: null }; G.comboBest = 0; G.questsOpen = false;
  G.artifacts = { owned: {}, slots: [null, null, null] };
  G.pouchOpen = false; G.wardrobe = { owned: {} };
  G.buried = null; G.surfacing = null; G.vaultKey = null; G.orbCut = false;
  G.archipelago = newArchipelago(); G.isleRun = null;
  G.profile = { hair: 0, hairCol: 0, outfit: 0, tee: 0, cape: 'none', suit: 'none' };
  G.gulletVisits = 0;
  G.unlockedHair = {}; Art.lockExtraHair();
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
  /* first time out of the tutorial, you choose how you look */
  G.trans = { t: 0, phase: 'out', dur: 0.42, toProfile: true };
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
    out.push(pouchRect());                                    /* the pouch */
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
  G.xpGainT = Math.max(0, (G.xpGainT || 0) - dt);
  updateBoosts(dt);
  if (G.xpGainT <= 0) G.xpGain = 0;
  updateRelicShow(dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  G.shakeAmt = Math.max(0, G.shakeAmt - dt * 26);

  /* The codes box covers the play screen, and on a phone its keyboard
     covers all of it.  It takes every tap first, so a key never presses a
     button under it. */
  if (G.codesOpen) {
    G.overShopIcon = false; G.overCodeIcon = false;
    G.overMapIcon = false; G.overPouchIcon = false; G.overSkip = false;
    updateCodes(dt);
    return;
  }

  /* the prestige button, when it is showing, takes its own tap first */
  if (G.canPrestige() && !G.shopOpen && !G.pouchOpen && !G.trans &&
      Input.tap(prestigeBtnRect())) {
    G.doPrestige();
    return;
  }

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
  const mapR = { x: VW - 26, y: 4, w: 22, h: 22 };
  const overMap = Input.mx >= mapR.x && Input.mx <= mapR.x + mapR.w &&
                  Input.my >= mapR.y && Input.my <= mapR.y + mapR.h;
  G.overMapIcon = overMap && !G.shopOpen && G.roomId !== 'tutorial';
  if (G.state === 'play' && G.roomId !== 'tutorial' && !G.shopOpen && !G.trans && ((Input.tap(mapR) && !tapOnExitBtn) || Input.actHit('map'))) {
    G.leaveLevel(); return;
  }
  const pchR = pouchRect();
  G.overPouchIcon = Input.over(pchR) && !G.shopOpen && !G.pouchOpen && G.roomId !== 'tutorial';
  if (G.state === 'play' && G.roomId !== 'tutorial' && !G.shopOpen && !G.pouchOpen && !G.trans &&
      Input.tap(pchR) && !tapOnExitBtn) {
    G.pouchOpen = true; G.pouchSel = -1; G.pouchSlotSel = -1; Snd.ui(); Snd.musicLevel(0.16, 0.3);
    return;
  }
  if (G.pouchOpen) { updatePouch(dt); return; }
  /* the sphinx: stand at it and ask to be asked */
  if (G.room && G.room.riddle && !G.flags.riddleDone && !G.riddleOpen &&
      G.state === 'play' && !G.trans) {
    const rq = G.room.riddle;
    const near = Math.abs(G.player.cx - rq.x) < 42 && Math.abs(G.player.cy - rq.y) < 54;
    G.nearSphinx = near;
    const btn = near ? { x: Math.round(rq.x - 44 - G.cam.x), y: Math.round(rq.y - 74 - G.cam.y),
                         w: 88, h: 14 } : null;
    G.sphinxBtn = btn;
    if (near && (Input.actHit('interact') || (btn && Input.tap(btn)))) {
      G.riddleOpen = true; G.riddleSel = -1; G.riddleMsgT = 0; Snd.ui();
      return;
    }
  } else { G.nearSphinx = false; G.sphinxBtn = null; }
  if (G.riddleOpen) { updateRiddle(dt); return; }
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

  for (const L of G.lifts) L.update(dt);
  const p = G.player;
  p.update(dt);
  for (const hz of G.hazards) hz.update(dt);
  if (p.dead && G.state === 'play') { G.breakCombo(); G.state = 'dead'; G.deathT = 0; G.stats.deaths++; Snd.musicLevel(0.08, 1.2); }

  for (const e of G.enemies) if (!e.dead) { e.update(dt); e.applyKnock(dt); e.updateBurning(dt); }
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

  updateThrone(dt);
  updateAcid(dt);
  updateSurfacing(dt);
  updateGateSlide(dt);
  updateOasis(dt);
  checkExits();
  if (!G.trans) updateCamera(dt);
}

/* The throne room. Silence, then the armour, then the dragon out of the roof. */
function updateThrone(dt) {
  const th = G.throne;
  if (!th) return;
  th.t += dt;
  const p = G.player;
  if (th.phase === 'hush') {
    /* nothing but your own footsteps until you are well into the hall */
    if (th.t > 1.2 && !th.named) { th.named = true; G.banner(G.room.name, 2.6); }
    const roused = G.enemies.some(e => e instanceof Armour && e.awake);
    if (roused || p.cx > G.room.w * TILE * 0.45) {
      th.phase = 'watch'; th.t = 0;
      G.banner('SOMETHING IS AWAKE', 2.2);
    }
    return;
  }
  if (th.phase === 'watch') {
    /* it comes once the armour is down, or once you have stood here long enough */
    const left = G.enemies.filter(e => e instanceof Armour && !e.dead).length;
    if (left === 0 || th.t > 26) {
      th.phase = 'drop'; th.t = 0;
      Snd.dragonRoar(); G.shake(10); G.flash(0.4);
      G.banner('IT COMES FROM ABOVE', 2.6);
    }
    return;
  }
  if (th.phase === 'drop') {
    /* dust and stone shaken loose from the roof, then the dragon itself */
    if (Math.random() < dt * 60) G.particles.push(new Particle({
      x: th.drop.x + rr(-70, 70), y: G.cam.y + 6, vx: rr(-0.4, 0.4), vy: rr(1.4, 3.4),
      life: rr(0.5, 1.2), col: '#8a7d5c', col2: '#4a3220', size: rr(1, 2.6), grav: 0.14
    }));
    if (th.t > 1.5 && !G.boss) {
      const d = new Dragon(th.drop.x, th.drop.y);
      d.y = th.drop.y;
      /* the same hardening the room would have given it on entry */
      const lv = World.LEVELS[G.level];
      const sc = (lv && lv.bossHp !== undefined) ? lv.bossHp
               : ((G.level === World.LEVELS.length - 1) ? 10 : 3);
      d.hp = Math.round(d.hp * sc); d.maxHp = d.hp;
      G.boss = d; G.enemies.push(d);
      if (typeof d.wake === 'function') d.wake();
      Snd.dragonRoar(); G.shake(14); G.flash(0.7);
      for (let i = 0; i < 80; i++) G.particles.push(new Particle({
        x: th.drop.x + rr(-40, 40), y: th.drop.y, vx: rr(-5, 5), vy: rr(-2, 4),
        life: rr(0.4, 1.1), col: '#c9d4e8', col2: '#4a5165', size: rr(1.4, 3.6), grav: 0.18
      }));
      /* and the music finally starts */
      Snd.play('boss'); Snd.musicLevel(0.34, 1.2); Snd.ambienceLevel(0.1, 2);
      th.phase = 'fight';
    }
    return;
  }
}
/* each window keeps to a few colours, so it reads as glass and not confetti */
/* '#rrggbb' at a given alpha, for a gradient stop */
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
const WINDOW_PALETTES = [
  ['#f0c93a', '#e08a2a', '#c9403a', '#7a2430'],
  ['#9fe8ff', '#3f6fd8', '#2f4a9a', '#8f5fc0'],
  ['#c0f08a', '#4f9a3f', '#2f6f37', '#f0c93a'],
  ['#ffd6e4', '#c9403a', '#8f5fc0', '#3f6fd8'],
  ['#fff4d6', '#f0c93a', '#4f9a3f', '#3f6fd8']
];
/* The light the windows throw across the floor. Drawn inside the camera
   translate, so these are world coordinates, not screen ones. */
function drawWindows(camX, camY) {
  const wins = G.room.windows;
  if (!wins) return;
  ctx.save();
  for (const w of wins) {
    const x = Math.round(w.x), y = Math.round(w.y);
    if (w.x < camX - 80 || w.x > camX + VW + 80) continue;
    /* a lancet of leaded glass, ringed about a rose at its heart */
    const pal = WINDOW_PALETTES[w.seed % WINDOW_PALETTES.length];
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(x - w.w / 2 - 3, y - 3, w.w + 6, w.h + 6);
    ctx.fillStyle = '#3a3350';
    ctx.fillRect(x - w.w / 2 - 3, y - 3, w.w + 6, 2);
    const half = w.w / 2;
    const rcx = 0, rcy = w.h * 0.36;
    for (let py = 0; py < w.h; py += 7) {
      for (let px = 0; px < w.w; px += 7) {
        const t = py / w.h, dx = px + 3 - half;
        /* an arch, so the head of the window is stone, not glass */
        if (t < 0.26 && Math.abs(dx) > half * (0.3 + t * 2.7)) continue;
        const d = Math.hypot(dx - rcx, (py + 3 - rcy) * 0.85);
        const ring = Math.floor(d / 9);
        const col = pal[ring % pal.length];
        ctx.fillStyle = col;
        ctx.fillRect(x - half + px, y + py, 6, 6);
        /* the light catching the top of each pane, and the lead below it */
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x - half + px, y + py, 6, 1);
        ctx.fillStyle = 'rgba(20,16,30,0.55)';
        ctx.fillRect(x - half + px, y + py + 6, 7, 1);
        ctx.fillRect(x - half + px + 6, y + py, 1, 7);
      }
    }
    /* the mullion down the middle */
    ctx.fillStyle = '#2a2438';
    ctx.fillRect(x - 1, y + Math.round(w.h * 0.26), 2, Math.round(w.h * 0.74));
    /* --- the light --- */
    const gy = (G.room.surface ? G.room.surface[Math.floor(w.x / TILE)] : 22) * TILE;
    const fall = gy - (y + w.h);
    /* the sun creeps round, so the whole pattern slides along the stone */
    const drift = Math.sin(G.t * 0.055 + w.seed * 0.9) * 13;
    const skew = 0.42;
    const paneCol = (px, py) => {
      const t = py / w.h, dx = px + 3 - half;
      if (t < 0.26 && Math.abs(dx) > half * (0.3 + t * 2.7)) return null;
      const d = Math.hypot(dx - rcx, (py + 3 - rcy) * 0.85);
      return pal[Math.floor(d / 9) % pal.length];
    };
    ctx.globalCompositeOperation = 'lighter';

    /* a bloom behind the glass, so the window itself reads as the source */
    ctx.globalAlpha = 0.10 + Math.sin(G.t * 0.8 + w.seed) * 0.02;
    ctx.fillStyle = pal[0];
    ctx.beginPath();
    ctx.ellipse(x, y + w.h * 0.45, w.w * 0.9, w.h * 0.7, 0, 0, TAU);
    ctx.fill();

    /* one shaft for each column of panes, each carrying that column's colour */
    for (let px = 0; px < w.w; px += 7) {
      let col = null;
      for (let py = w.h - 7; py >= 0 && !col; py -= 7) col = paneCol(px, py);
      if (!col) continue;
      const x0 = x - half + px, x1 = x0 + 6;
      const fx0 = x0 + (x0 - x) * skew + drift, fx1 = x1 + (x1 - x) * skew + drift;
      const g4 = ctx.createLinearGradient(0, y + w.h, 0, gy);
      g4.addColorStop(0, 'rgba(255,255,255,0.16)');
      g4.addColorStop(0.35, hexA(col, 0.13));
      g4.addColorStop(1, hexA(col, 0.03));
      ctx.globalAlpha = 1;
      ctx.fillStyle = g4;
      ctx.beginPath();
      ctx.moveTo(x0, y + w.h); ctx.lineTo(x1, y + w.h);
      ctx.lineTo(fx1, gy); ctx.lineTo(fx0, gy);
      ctx.closePath(); ctx.fill();
    }

    /* the window's own pattern, laid out across the stone */
    for (let py = 0; py < w.h; py += 14) {
      for (let px = 0; px < w.w; px += 14) {
        const col = paneCol(px, py);
        if (!col) continue;
        const x0 = x - half + px;
        const fx = x0 + (x0 - x) * skew + drift;
        /* the pattern is stretched along the floor, the way a low sun casts it */
        const fy = gy - 3 + (py / w.h) * 3;
        const fw = 14 * (1 + skew);
        ctx.globalAlpha = 0.24 + Math.sin(G.t * 0.7 + px * 0.1 + w.seed) * 0.05;
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(fx), Math.round(fy - (w.h - py) * 0.17), Math.ceil(fw), 8);
      }
    }
    /* the bright core of the pool, right under the rose */
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(x - half * 0.5 + drift), Math.round(gy - 4), Math.round(w.w * 0.5), 4);

    /* dust turning over in the beam */
    if (Math.random() < 0.5 && fall > 0) {
      const px = x + rr(-half, half) * (1 + skew) + drift * 0.5;
      G.particles.push(new Particle({
        x: px, y: y + w.h + rr(0, fall), vx: rr(-0.12, 0.12), vy: rr(-0.16, 0.16),
        life: rr(1.6, 3.4), col: rpick([pal[0], '#fff4d6', pal[1]]), size: 1, grav: 0, drag: 1
      }));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/* the acid in the gullet, climbing while you climb */
function updateAcid(dt) {
  const room = G.room;
  if (!room || !room.acid) { G.acid = null; return; }
  if (!G.acid) G.acid = { y: room.acid.y };
  G.acid.y -= (room.acid.rate || 26) * dt;
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
    if (ex.to === '@surface') {
      G.nearExit = ex; G.nearExitLocked = false;
      if (!enterPressed(ex)) continue;
      G.leaveSecret();
      return;
    }
    if (ex.to === '@isleNext') {
      G.nearExit = ex; G.nearExitLocked = false;
      if (!enterPressed(ex)) continue;
      G.isleNext();
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
    p.dead = false; p.hp = p.maxHp; p.invuln = 1.6; p.burnT = 0; p.burnAcc = 0;
    G.state = 'play';
    Snd.musicLevel(0.34, 0.6);
    G.enterRoom(sw.roomId, { spawnAt: { x: sw.x, y: sw.y } });
    G.flash(0.6);
    if (lost > 0) G.texts.push(new FloatText(p.cx, p.cy - 20, '-' + lost + ' COINS', '#ff9a8a'));
    return;
  }
  const lost = Math.floor(p.coins * 0.2);
  p.coins = Math.max(0, p.coins - lost);
  p.dead = false; p.hp = p.maxHp; p.invuln = 1.4; p.burnT = 0; p.burnAcc = 0;
  G.state = 'play';
  Snd.musicLevel(0.34, 0.6);
  /* an island begins again at its first level, not where you fell */
  if (G.isleRun) {
    const w = G.isleRun;
    if (lost > 0) G.texts.push(new FloatText(p.cx, p.cy - 20, '-' + lost + ' COINS', '#ff9a8a'));
    G.enterIsle(w.key, w.index, 0);
    G.flash(0.6);
    return;
  }
  G.enterRoom(G.roomId, null);
  G.flash(0.6);
  if (lost > 0) G.texts.push(new FloatText(p.cx, p.cy - 20, '-' + lost + ' COINS', '#ff9a8a'));
}

G.onBossDead = function () {
  /* a guardian pays far more experience than anything that walks a realm */
  const b = G.boss;
  if (b && G.giveXp) G.giveXp(Math.round((b.maxHp || 100) * 0.75 * G.xpScale()),
                              G.player.cx, G.player.cy);
  /* and it leaves rubies, by how hard it was to bring down */
  if (b && G.giveRubies) G.giveRubies(rubiesFor(b.maxHp || 0), G.player.cx, G.player.cy);
  /* an island keeper is a thing apart: it pays in shards, not in realms */
  if (G.isleRun) { G.onIsleBossDead(); G.state = 'victory'; G.victoryT = 0; return; }
  G.state = 'victory'; G.victoryT = 0;
  /* a buffed run marks its own tier and changes nothing else */
  const bt = clamp(G.buffTier | 0, 0, PRESTIGE_MAX);
  if (bt > 0) {
    G.buffDone = G.buffDone || {};
    G.buffDone[buffKey(bt, G.level)] = true;
    delete G.levelState[G.level];
    G.newlyUnlocked = false;
    Snd.play('victory'); Snd.musicLevel(0.4, 1.5);
    G.banner('THE ' + PRESTIGE_NAME[bt] + ' RUN IS YOURS', 3);
    writeSlot(G.slot, packSave());
    return;
  }
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
  if (G.victoryT > 2 && (Input.hit('Enter') || Input.hit('Space') || Input.mhit)) {
    if (G.isleRun) G.leaveIsle(); else openMap(false);
  }
}

/* ============================================================
   A RUN THROUGH AN ISLAND.  Three levels and then its keeper.
   Each level is cut when you step into it, so an island costs
   nothing until you go there.
   ============================================================ */
G.enterIsle = function (typeKey, index, level) {
  const t = ISLE_TYPES.find(q => q.key === typeKey) || ISLE_TYPES[0];
  G.isleRun = { type: ISLE_TYPES.indexOf(t), key: typeKey, shard: t.shard,
                index: index, level: level | 0 };
  World.rooms.isle = World.buildIsle(typeKey, index, G.isleRun.level);
  World.rooms.isle.name = t.name.replace('THE ', '') + '  ' + (index + 1) +
                          (G.isleRun.level === ISLE_LEVELS - 1 ? '  -  THE KEEPER'
                                                               : '  -  ' + (G.isleRun.level + 1) + ' OF 3');
  G.state = 'play';
  G.trans = null;
  G.player.hp = G.player.maxHp;
  G.player.dead = false;
  G.enterRoom('isle', null);
};
G.isleNext = function () {
  const w = G.isleRun;
  if (!w || G.trans) return;
  if (w.level + 1 >= ISLE_LEVELS) { G.leaveIsle(); return; }
  w.level++;
  Snd.door();
  G.trans = { t: 0, phase: 'out', dur: 0.42, isleNext: true };
};
G.leaveIsle = function () {
  G.isleRun = null;
  G.saveGame();
  openArchipelago('chain');
};
/* the keeper of an island is down: the island is cleared and pays in shards */
G.onIsleBossDead = function () {
  const w = G.isleRun;
  if (!w) return;
  const a = archi();
  const key = w.key + ':' + w.index;
  const first = !a.cleared[key];
  a.cleared[key] = true;
  G.giveShards(ri(3, 5));
  if (first) G.banner('THE ISLAND IS YOURS', 3);
  G.saveGame();
};

/* ============================================================
   THE ARCHIPELAGO.  Five kinds of island, twenty of each, laid
   out as five spokes of a pentagon.  Each island holds three
   levels and a guardian.  You buy your way outward with shards
   of that island's own kind.
   ============================================================ */
const ISLE_TYPES = [
  { key: 'snow',   name: 'THE FROZEN ISLES', shard: 'ice',      shardName: 'ICE',      col: '#8fd0e8', col2: '#3f7f9e' },
  { key: 'fire',   name: 'THE BURNING ISLES', shard: 'ember',   shardName: 'EMBER',    col: '#ff7a2a', col2: '#8a2410' },
  { key: 'desert', name: 'THE SAND ISLES',   shard: 'sand',     shardName: 'SAND',     col: '#e0b040', col2: '#9c7418' },
  { key: 'forest', name: 'THE GREEN ISLES',  shard: 'amethyst', shardName: 'AMETHYST', col: '#a86fe0', col2: '#5d3a86' },
  { key: 'mesa',   name: 'THE MESA ISLES',   shard: 'gold',     shardName: 'GOLD',     col: '#f6d878', col2: '#a4713f' }
];
const SHARD_PARTS = 3;              /* three parts make one shard */
const FORGE_COST = 1000;            /* and the forge takes a thousand coins for it */
/* The first island of a spoke is open.  Every other one asks twice what it
   once did: four shards for the second, rising to forty. */
function isleCost(i) { return i === 0 ? 0 : Math.min(40, (i + 1) * 2); }
function isleTypeAt(k) { return ISLE_TYPES[clamp(k | 0, 0, ISLE_TYPES.length - 1)]; }
function newArchipelago() {
  const a = { open: false, type: 0, page: 0, isle: -1,
              scroll: 0, scrollTo: 0, drag: null,
              shards: {}, parts: {}, opened: {}, cleared: {} };
  for (const t of ISLE_TYPES) { a.shards[t.shard] = 0; a.parts[t.shard] = 0; a.opened[t.key] = 1; }
  return a;
}
function archi() {
  if (!G.archipelago) G.archipelago = newArchipelago();
  return G.archipelago;
}
G.shardsOf = function (shard) { return (archi().shards[shard] | 0); };
G.partsOf = function (shard) { return (archi().parts[shard] | 0); };
/* every creature on an island leaves a part or four of that island's shard */
G.dropShardParts = function (n) {
  const w = G.isleRun;
  if (!w) return;
  const a = archi();
  a.parts[w.shard] = (a.parts[w.shard] | 0) + n;
  G.texts.push(new FloatText(G.player.cx, G.player.cy - 16,
    '+' + n + ' ' + isleTypeAt(w.type).shardName, isleTypeAt(w.type).col));
};
G.giveShards = function (n) {
  const w = G.isleRun;
  if (!w) return;
  const a = archi();
  a.shards[w.shard] = (a.shards[w.shard] | 0) + n;
  G.texts.push(new FloatText(G.player.cx, G.player.cy - 24,
    '+' + n + ' ' + isleTypeAt(w.type).shardName + ' SHARD', isleTypeAt(w.type).col));
};
/* how many whole shards the forge could make from the parts on hand */
function forgeable(shard) {
  const parts = Math.floor(G.partsOf(shard) / SHARD_PARTS);
  const afford = G.codes.admin ? parts : Math.floor(G.player.coins / FORGE_COST);
  return Math.min(parts, afford);
}
G.forgeShard = function (shard, n) {
  const a = archi();
  const can = forgeable(shard);
  n = Math.min(n || 1, can);
  if (n <= 0) return 0;
  a.parts[shard] -= n * SHARD_PARTS;
  a.shards[shard] = (a.shards[shard] | 0) + n;
  if (!G.codes.admin) G.player.coins -= n * FORGE_COST;
  Snd.buy(); G.flash(0.2);
  G.saveGame();
  return n;
};
/* Buying the next island out along a spoke.  Nothing opens unless the
   shards are on hand, and the price comes out of the purse before the
   island is marked open.  It answers true only when it took the payment. */
G.buyIsle = function (t, idx) {
  const a = archi();
  if (idx !== isleOpened(t.key) || idx < 1 || idx >= ISLES_PER_TYPE) return false;
  const cost = isleCost(idx);
  const held = G.shardsOf(t.shard);
  /* The shards are always paid.  No code and no purse opens an island: the
     only way out along a spoke is to earn the shards of that spoke. */
  if (held < cost) return false;
  a.shards[t.shard] = held - cost;
  a.opened[t.key] = idx + 1;
  G.archMsg = 'THE ISLAND OPENS'; G.archMsgT = 2;
  Snd.unlock(); G.flash(0.35);
  G.saveGame();
  return true;
};
function isleOpened(typeKey) { return archi().opened[typeKey] | 0; }
function isleCleared(typeKey, i) { return !!archi().cleared[typeKey + ':' + i]; }

/* ---------- the three screens ---------- */
const ARCH_BACK = { x: 6, y: VH - 22, w: 54, h: 16 };
const ARCH_FORGE = { x: VW - 92, y: VH - 22, w: 86, h: 16 };
/* the five kinds, set out as a pentagon about the middle of the chart */
function archNodeRect(k) {
  const a = -Math.PI / 2 + k / 5 * TAU;
  const cx = VW / 2 + Math.cos(a) * 100, cy = VH / 2 + 6 + Math.sin(a) * 48;
  return { x: cx - 24, y: cy - 24, w: 48, h: 48, cx: cx, cy: cy };
}
/* The fifty islands of a spoke lie in one long row.  You scroll along it:
   with the wheel, with the arrows, or by dragging the row itself. */
const ISLE_PITCH = 66, ISLE_X0 = 34, ISLE_SIZE = 48;
const ISLES_PER_PAGE = 5;             /* how far one arrow press carries you */
function isleStripW() { return ISLE_X0 * 2 + (ISLES_PER_TYPE - 1) * ISLE_PITCH + ISLE_SIZE; }
function maxIsleScroll() { return Math.max(0, isleStripW() - VW); }
function archIsleRect(i) {
  const x = ISLE_X0 + i * ISLE_PITCH - (archi().scroll || 0);
  return { x: x, y: 74, w: ISLE_SIZE, h: ISLE_SIZE, cx: x + 24, cy: 98 };
}
function archPageRect(d) {
  return { x: d < 0 ? 4 : VW - 28, y: 86, w: 24, h: 24 };
}
/* the band the row lives in, where a drag scrolls rather than picks */
const ISLE_BAND = { y0: 52, y1: VH - 28 };
function isleScrollTo(px) { archi().scrollTo = clamp(px, 0, maxIsleScroll()); }
/* put one island in the middle of the view */
function centreIsle(i) {
  isleScrollTo(ISLE_X0 + i * ISLE_PITCH + ISLE_SIZE / 2 - VW / 2);
  archi().scroll = archi().scrollTo;
}
function openArchipelago(view) {
  const a = archi();
  if (a.scroll === undefined) { a.scroll = 0; a.scrollTo = 0; }
  a.drag = null;
  G.archView = view || 'pentagon';
  G.state = 'archipelago';
  G.archT = 0; G.archSel = -1; G.archMsgT = 0;
  G.particles.length = 0;
  if (!G.forgeOpen) G.forgeOpen = false;
  Snd.play('title');
}
function archClose() {
  if (G.archView === 'chain') { G.archView = 'pentagon'; G.archSel = -1; Snd.ui(); return; }
  G.state = 'map'; G.mapT = 0; G.mapSel = -1; G.finalSel = false;
  Snd.ui(); Snd.play(World.rooms[World.LEVELS[G.level].start].music || 'forest');
  openMap(false);
}
function updateArchipelago(dt) {
  const a = archi();
  G.archT += dt;
  G.archMsgT = Math.max(0, G.archMsgT - dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  if (Math.random() < dt * 4) G.particles.push(new Particle({
    x: rr(0, VW), y: VH + 4, vx: rr(-0.2, 0.2), vy: rr(-0.6, -0.2),
    life: rr(3, 6), col: rpick(['#cfeaff', '#8fd0e8', '#ffffff']), size: 1, grav: 0
  }));

  if (G.forgeOpen) { updateForge(dt); return; }
  G.archBackHot = Input.over(ARCH_BACK);
  G.archForgeHot = Input.over(ARCH_FORGE);
  if (Input.tap(ARCH_BACK) || Input.hit('Escape')) { archClose(); return; }
  if (Input.tap(ARCH_FORGE)) { G.forgeOpen = true; G.forgeSel = 0; Snd.ui(); return; }

  if (G.archView === 'pentagon') {
    G.archSel = -1;
    let pick = -1;
    for (let k = 0; k < ISLE_TYPES.length; k++) {
      const r = archNodeRect(k);
      if (Math.hypot(Input.mx - r.cx, Input.my - r.cy) < 26) G.archSel = k;
      if (Input.tap(r)) pick = k;
    }
    if (pick >= 0) {
      a.type = pick; a.page = 0; a.drag = null;
      /* the row opens on the island you have yet to buy */
      centreIsle(clamp(isleOpened(ISLE_TYPES[pick].key), 0, ISLES_PER_TYPE - 1));
      G.archView = 'chain'; G.archSel = -1; Snd.buy();
    }
    return;
  }
  /* the long row of fifty, scrolled through */
  const t = isleTypeAt(a.type);
  const step = ISLE_PITCH * ISLES_PER_PAGE;
  let onArrow = false;
  for (const d of [-1, 1]) if (Input.tap(archPageRect(d))) {
    isleScrollTo((a.scrollTo || 0) + d * step); Snd.ui(); onArrow = true;
  }
  if (Input.hit('ArrowRight')) isleScrollTo((a.scrollTo || 0) + step);
  if (Input.hit('ArrowLeft')) isleScrollTo((a.scrollTo || 0) - step);
  if (Input.wheel) isleScrollTo((a.scrollTo || 0) + Input.wheel * 1.4);

  /* A drag along the row scrolls it.  A press that goes nowhere is a pick,
     and it is read when the finger comes up, not when it lands: that is
     what tells a drag from a tap. */
  let hitIsle = -1;
  const inBand = Input.my > ISLE_BAND.y0 && Input.my < ISLE_BAND.y1;
  if (!a.drag && !onArrow && Input.mhit && inBand) {
    a.drag = { x: Input.mx, y: Input.my, from: a.scroll || 0, moved: 0 };
  }
  if (a.drag) {
    a.drag.moved = Math.max(a.drag.moved, Math.abs(Input.mx - a.drag.x));
    if (Input.mdown) {
      a.scroll = clamp(a.drag.from - (Input.mx - a.drag.x), 0, maxIsleScroll());
      a.scrollTo = a.scroll;
    } else {
      if (a.drag.moved < 5) {
        for (let i = 0; i < ISLES_PER_TYPE; i++) {
          const r = archIsleRect(i);
          if (r.x + r.w < -20 || r.x > VW + 20) continue;
          if (a.drag.x >= r.x && a.drag.x <= r.x + r.w &&
              a.drag.y >= r.y && a.drag.y <= r.y + r.h) { hitIsle = i; break; }
        }
      }
      a.drag = null;
    }
  }
  /* the row eases toward wherever the arrows or the wheel asked for */
  if (!a.drag) {
    if (a.scrollTo === undefined) a.scrollTo = a.scroll || 0;
    a.scroll = lerp(a.scroll || 0, a.scrollTo, 1 - Math.pow(0.0008, dt));
    if (Math.abs(a.scroll - a.scrollTo) < 0.4) a.scroll = a.scrollTo;
  }
  G.archSel = -1;
  for (let i = 0; i < ISLES_PER_TYPE; i++) {
    const r = archIsleRect(i);
    if (r.x + r.w < 0 || r.x > VW) continue;
    if (Input.over(r)) G.archSel = i;
  }
  if (hitIsle >= 0) {
    const idx = hitIsle;
    const open = isleOpened(t.key);
    if (idx < open) {
      Snd.buy();
      G.trans = { t: 0, phase: 'out', dur: 0.42, isleStart: { key: t.key, index: idx } };
      G.state = 'play';
      return;
    }
    if (idx > open) { Snd.uiBad(); G.archMsg = 'TAKE THE ONE BEFORE IT FIRST'; G.archMsgT = 2; return; }
    if (!G.buyIsle(t, idx)) {
      Snd.uiBad();
      G.archMsg = 'IT ASKS ' + isleCost(idx) + ' ' + t.shardName + ' SHARDS';
      G.archMsgT = 2.2;
    }
  }
}
/* ---------- the smithing table ---------- */
const FORGE_BOX = { x: 20, y: 20, w: 344, h: 176 };
function forgeRowRect(i) { return { x: FORGE_BOX.x + 10, y: FORGE_BOX.y + 32 + i * 25, w: FORGE_BOX.w - 20, h: 23 }; }
function updateForge(dt) {
  void dt;
  const closeR = { x: FORGE_BOX.x + FORGE_BOX.w - 24, y: FORGE_BOX.y + 4, w: 20, h: 16 };
  G.forgeClose = Input.over(closeR);
  if (Input.tap(closeR) || Input.hit('Escape')) { G.forgeOpen = false; Snd.ui(); return; }
  G.forgeSel = -1;
  let hitRow = -1;
  for (let i = 0; i < ISLE_TYPES.length; i++) {
    const r = forgeRowRect(i);
    if (Input.over(r)) G.forgeSel = i;
    if (Input.tap(r)) hitRow = i;
  }
  if (hitRow >= 0) {
    const t = ISLE_TYPES[hitRow];
    const made = G.forgeShard(t.shard, 1);
    if (made) { G.archMsg = 'ONE ' + t.shardName + ' SHARD FORGED'; G.archMsgT = 2; }
    else {
      Snd.uiBad();
      G.archMsg = G.partsOf(t.shard) < SHARD_PARTS ? 'NOT ENOUGH PARTS' : 'NOT ENOUGH COINS';
      G.archMsgT = 2;
    }
  }
}
function drawForge() {
  const B = FORGE_BOX;
  ctx.fillStyle = 'rgba(8,6,14,0.76)';
  ctx.fillRect(0, 0, VW, VH);
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'THE SMITHING TABLE', B.x + 12, B.y + 7, '#f2e2b8', 1, 'left', '#000000');
  drawText(ctx, SHARD_PARTS + ' PARTS AND ' + FORGE_COST + ' COINS MAKE ONE SHARD',
           B.x + 12, B.y + 19, '#a9b3c9', 1, 'left');
  const closeR = { x: B.x + B.w - 24, y: B.y + 4, w: 20, h: 16 };
  ctx.fillStyle = G.forgeClose ? '#c9403a' : 'rgba(20,14,10,0.8)';
  ctx.fillRect(closeR.x, closeR.y, closeR.w, closeR.h);
  drawText(ctx, 'X', closeR.x + closeR.w / 2, closeR.y + 4, '#ffeec0', 1, 'center');
  ISLE_TYPES.forEach((t, i) => {
    const r = forgeRowRect(i), hot = G.forgeSel === i;
    const parts = G.partsOf(t.shard), whole = G.shardsOf(t.shard);
    const can = forgeable(t.shard) > 0;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.86)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = can ? t.col : '#5b4a34';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawShard(ctx, r.x + 14, r.y + 11, 7, t, 1);
    drawText(ctx, t.shardName + ' SHARD', r.x + 28, r.y + 3, '#ffeec0', 1, 'left');
    drawText(ctx, 'YOU HOLD ' + whole, r.x + 28, r.y + 13, '#a9b3c9', 1, 'left');
    drawText(ctx, parts + ' PARTS', r.x + r.w - 150, r.y + 8,
             parts >= SHARD_PARTS ? '#9be89a' : '#8a94a6', 1, 'left');
    drawText(ctx, can ? 'CLICK TO FORGE ONE' : (parts < SHARD_PARTS ? 'NEEDS PARTS' : 'NEEDS COINS'),
             r.x + r.w - 6, r.y + 8, can ? '#ffe98a' : '#8a94a6', 1, 'right');
  });
  ctx.drawImage(Art.item.coin[Math.floor(G.archT / 0.09) % 8], B.x + 12, B.y + B.h - 18);
  drawText(ctx, G.purse(), B.x + 26, B.y + B.h - 16, '#ffe98a', 1, 'left', '#000000');
  if (G.archMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.archMsgT * 2);
    drawText(ctx, G.archMsg, B.x + B.w / 2, B.y + B.h - 16, '#ffd04a', 1, 'center', '#2a1a10');
    ctx.restore();
  }
}
/* one shard, drawn as a cut gem of its own colour */
function drawShard(c2, x, y, r, t, alpha) {
  c2.save();
  if (alpha !== undefined) c2.globalAlpha = alpha;
  c2.fillStyle = t.col2;
  c2.beginPath();
  c2.moveTo(x, y - r); c2.lineTo(x + r * 0.72, y - r * 0.2);
  c2.lineTo(x + r * 0.44, y + r * 0.86); c2.lineTo(x - r * 0.44, y + r * 0.86);
  c2.lineTo(x - r * 0.72, y - r * 0.2);
  c2.closePath(); c2.fill();
  c2.fillStyle = t.col;
  c2.beginPath();
  c2.moveTo(x, y - r * 0.72); c2.lineTo(x + r * 0.5, y - r * 0.12);
  c2.lineTo(x + r * 0.3, y + r * 0.6); c2.lineTo(x - r * 0.3, y + r * 0.6);
  c2.lineTo(x - r * 0.5, y - r * 0.12);
  c2.closePath(); c2.fill();
  c2.fillStyle = '#ffffff';
  c2.fillRect(Math.round(x - r * 0.3), Math.round(y - r * 0.4), 2, 2);
  c2.restore();
}
function drawArchipelago() {
  ctx.drawImage(makeSky('archi', [[0, '#0e2340'], [0.4, '#1d4a70'], [0.72, '#2f6fb0'], [1, '#66aade']]), 0, 0);
  /* the sea it all stands in */
  ctx.save();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#cfeaff';
  for (let y = 20; y < VH; y += 7) {
    const w = 40 + Math.sin(y * 0.2 + G.archT * 0.6) * 20;
    for (let x = -20; x < VW + 20; x += 74) ctx.fillRect(Math.round(x + Math.sin((x + y) * 0.05 + G.archT) * 12), y, w, 2);
  }
  ctx.restore();
  for (const pa of G.particles) pa.draw(ctx);
  const a = archi();

  if (G.archView === 'pentagon') {
    drawText(ctx, 'THE ARCHIPELAGO', VW / 2, 6, '#ffeec0', 2, 'center', '#0a1420');
    drawText(ctx, 'FIVE KINDS, FIFTY ISLANDS OF EACH', VW / 2, 22, '#8fd0e8', 1, 'center', '#0a1420');
    /* the chains of the pentagon, drawn between the five */
    for (let k = 0; k < 5; k++) {
      const p1 = archNodeRect(k), p2 = archNodeRect((k + 1) % 5);
      drawChainLine(p1.cx, p1.cy, p2.cx, p2.cy);
    }
    for (let k = 0; k < 5; k++) {
      const t = ISLE_TYPES[k], r = archNodeRect(k), hot = G.archSel === k;
      const bob = Math.sin(G.archT * 1.5 + k) * 1.6;
      if (hot) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + Math.sin(G.archT * 5) * 0.06;
        ctx.fillStyle = t.col;
        ctx.beginPath(); ctx.arc(r.cx, r.cy + bob, 30, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.drawImage(Art.map.isle[k], Math.round(r.cx - 24), Math.round(r.cy - 24 + bob));
      /* the name, and under it how far out you have bought */
      const short = t.name.replace('THE ', '');
      const w = Math.max(textWidth(short) + 8, 34);
      ctx.fillStyle = 'rgba(10,20,32,0.9)';
      ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.cy + 22 + bob), Math.round(w), 20);
      drawText(ctx, short, r.cx, r.cy + 24 + bob, hot ? '#ffeec0' : t.col, 1, 'center');
      drawText(ctx, isleOpened(t.key) + '/' + ISLES_PER_TYPE,
               r.cx, r.cy + 33 + bob, '#a9b3c9', 1, 'center');
    }
  } else {
    const t = isleTypeAt(a.type);
    drawText(ctx, t.name, VW / 2, 8, '#ffeec0', 2, 'center', '#0a1420');
    drawShard(ctx, 14, 30, 7, t, 1);
    drawText(ctx, G.shardsOf(t.shard) + ' SHARDS   ' + G.partsOf(t.shard) + ' PARTS',
             26, 26, t.col, 1, 'left', '#0a1420');
    const open = isleOpened(t.key);
    const scroll = a.scroll || 0;
    const first = clamp(Math.floor((scroll - ISLE_X0) / ISLE_PITCH), 0, ISLES_PER_TYPE - 1);
    const last = clamp(first + Math.ceil(VW / ISLE_PITCH) + 1, 0, ISLES_PER_TYPE - 1);
    drawText(ctx, 'ISLANDS ' + (first + 1) + ' TO ' + (last + 1) + ' OF ' + ISLES_PER_TYPE,
             VW - 8, 26, '#a9b3c9', 1, 'right', '#0a1420');
    for (let idx = first; idx <= last; idx++) {
      const r = archIsleRect(idx), hot = G.archSel === idx;
      const isOpen = idx < open, isNext = idx === open;
      const done = isleCleared(t.key, idx);
      /* the chain that links it to the one before */
      if (idx > 0) drawChainLine(r.x - 20, r.cy, r.x - 2, r.cy);
      ctx.save();
      if (!isOpen && !isNext) ctx.globalAlpha = 0.4;
      ctx.drawImage(Art.map.isle[a.type], Math.round(r.x - 1), Math.round(r.y - 1));
      ctx.restore();
      if (!isOpen) ctx.drawImage(Art.map.lock, Math.round(r.cx - 8), Math.round(r.cy - 9));
      if (done) drawText(ctx, 'CLEAR', r.cx, r.y + 54, '#9be89a', 1, 'center', '#0a1420');
      if (hot) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2; ctx.fillStyle = t.col;
        ctx.beginPath(); ctx.arc(r.cx, r.cy, 26, 0, TAU); ctx.fill(); ctx.restore();
      }
      drawText(ctx, 'ISLAND ' + (idx + 1), r.cx, r.y - 12, isOpen ? '#ffeec0' : '#8a94a6', 1, 'center', '#0a1420');
      if (isNext) {
        const cost = isleCost(idx);
        const can = G.shardsOf(t.shard) >= cost;
        drawShard(ctx, r.cx - 12, r.y + 62, 5, t, 1);
        drawText(ctx, String(cost) + ' TO OPEN', r.cx - 3, r.y + 58,
                 can ? '#9be89a' : '#c9403a', 1, 'left', '#0a1420');
      }
    }
    /* the bar under the row, to say how far along it you are */
    const maxS = maxIsleScroll();
    if (maxS > 0) {
      const bx = 40, bw = VW - 80, by = VH - 30;
      ctx.fillStyle = 'rgba(10,20,32,0.8)'; ctx.fillRect(bx, by, bw, 3);
      const kw = Math.max(18, bw * VW / isleStripW());
      ctx.fillStyle = t.col;
      ctx.fillRect(Math.round(bx + (bw - kw) * (scroll / maxS)), by, Math.round(kw), 3);
    }
    drawText(ctx, 'DRAG OR SCROLL ALONG THE CHAIN', VW / 2, VH - 42, '#5f8faf', 1, 'center', '#0a1420');
    for (const d of [-1, 1]) {
      const r = archPageRect(d);
      const can = d < 0 ? scroll > 0.5 : scroll < maxS - 0.5;
      ctx.fillStyle = can ? 'rgba(20,40,60,0.9)' : 'rgba(14,26,38,0.6)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawText(ctx, d < 0 ? '<' : '>', r.x + r.w / 2, r.y + 8, can ? '#cfeaff' : '#3f5f7a', 1, 'center');
    }
  }

  /* the two buttons at the foot */
  for (const [r, label, hot] of [[ARCH_BACK, 'BACK', G.archBackHot],
                                 [ARCH_FORGE, 'SMITHING TABLE', G.archForgeHot]]) {
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(10,20,32,0.88)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hot ? '#ffd04a' : '#5f9fe0';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, label, r.x + r.w / 2, r.y + 5, '#ffeec0', 1, 'center');
  }
  if (G.archMsgT > 0 && !G.forgeOpen) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.archMsgT * 2);
    drawText(ctx, G.archMsg, VW / 2, VH - 20, '#ffd04a', 1, 'center', '#0a1420');
    ctx.restore();
  }
  if (G.forgeOpen) drawForge();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   THE ITEM SHOP.  Five pages, reached from the chart.  Coins buy
   most of it, rubies buy the boxes, and the shards of the
   Archipelago buy the page that is kept for them.
   ============================================================ */
const STORE_BOX = { x: 6, y: 6, w: 372, h: 204 };
const STORE_TABS = ['ITEMS', 'LIMITED', 'ARTIFACTS', 'CLOTHES', 'SHARDS'];
const STORE_ROWS = 5;
function storeTabRect(i) { return { x: STORE_BOX.x + 8 + i * 72, y: STORE_BOX.y + 20, w: 69, h: 14 }; }
function storeRowRect(i) { return { x: STORE_BOX.x + 8, y: STORE_BOX.y + 42 + i * 26, w: STORE_BOX.w - 16, h: 24 }; }
function storeBuyRect(i) { const r = storeRowRect(i); return { x: r.x + r.w - 62, y: r.y + 4, w: 56, h: 16 }; }
function storePageRect(d) { return { x: d < 0 ? STORE_BOX.x + 8 : STORE_BOX.x + 40, y: STORE_BOX.y + 180, w: 26, h: 16 }; }
function storeBackRect() { return { x: STORE_BOX.x + STORE_BOX.w - 62, y: STORE_BOX.y + 180, w: 54, h: 16 }; }

/* the three boxes, and what each one is likely to hold */
const BOXES = [
  { key: 'box1', name: 'WORN CASKET', rubies: 10,
    odds: { 2: 0.84, 3: 0.15, 4: 0.01, 5: 0 } },
  { key: 'box2', name: 'SEALED CASKET', rubies: 50,
    odds: { 2: 0.55, 3: 0.40, 4: 0.05, 5: 0 } },
  { key: 'box3', name: 'KINGS CASKET', rubies: 100,
    odds: { 2: 0.30, 3: 0.58, 4: 0.10, 5: 0.02 } }
];
/* how long a booster runs, and what it doubles */
const BOOST_SECS = 600;
G.boostLeft = function (kind) {
  const list = G.boosts || [];
  let best = 0;
  for (const b of list) if (b.kind === kind) best = Math.max(best, b.t);
  return best;
};
G.addBoost = function (kind, secs) {
  G.boosts = G.boosts || [];
  const had = G.boosts.find(b => b.kind === kind);
  if (had) had.t += secs; else G.boosts.push({ kind: kind, t: secs });
};
function updateBoosts(dt) {
  if (!G.boosts || !G.boosts.length) return;
  for (const b of G.boosts) b.t -= dt;
  G.boosts = G.boosts.filter(b => b.t > 0);
}

/* ---------- what each page holds ---------- */
function storeItemRows() {
  return [
    { name: 'AN ARROW', desc: 'ONE ARROW FOR THE LONGBOW', coins: 1000, pic: 'arrow1',
      buy: () => { G.arrows = (G.arrows | 0) + 1; } },
    { name: 'TEN ARROWS', desc: 'A SHEAF OF TEN, AT EIGHT HUNDRED EACH', coins: 8000, pic: 'arrow10',
      buy: () => { G.arrows = (G.arrows | 0) + 10; } },
    { name: 'FIFTY ARROWS', desc: 'A QUIVER OF FIFTY, AT SEVEN HUNDRED EACH', coins: 35000, pic: 'arrow50',
      buy: () => { G.arrows = (G.arrows | 0) + 50; } },
    { name: '2X EXPERIENCE', desc: 'TWICE THE EXPERIENCE FOR TEN MINUTES', coins: 5000, pic: 'xpVial',
      buy: () => { G.addBoost('xp', BOOST_SECS); } },
    { name: '2X COINS', desc: 'TWICE THE COINS FOR TEN MINUTES', coins: 5000, pic: 'coinVial',
      buy: () => { G.addBoost('coin', BOOST_SECS); } }
  ];
}
/* the artifacts, dearest first, with the three caskets at the head */
function storeArtifactRows() {
  const rows = BOXES.map((b, i) => ({
    name: b.name, desc: 'ONE ARTIFACT, THE BETTER BOX THE BETTER ODDS',
    rubies: b.rubies, box: b.key, casket: i,
    buy: () => G.openBox(b.key)
  }));
  const order = ARTIFACTS.slice().sort((a, b) => b.rank - a.rank);
  for (const a of order) {
    if (a.rank < 2) continue;
    rows.push({ name: a.name, desc: a.desc, coins: RANK_PRICE[a.rank],
                rank: a.rank, art: a.key,
                owned: () => G.ownsArtifact(a.key),
                buy: () => G.giveArtifact(a.key) });
  }
  return rows;
}
function storeClothRows() {
  return SUIT_KEYS.map(k => {
    const su = SUITS[k];
    return { name: su.name, desc: 'CUT TO THE PATTERN OF ' + su.realm, coins: su.cost,
             suit: k, need: su.need,
             owned: () => !!(G.wardrobe && G.wardrobe.owned[k]),
             buy: () => { G.wardrobe.owned[k] = 1; G.profile.suit = k; applyProfile(); } };
  });
}
/* the page kept for shards: what an islander comes back with */
function storeShardRows() {
  return [
    { name: 'TWENTY ARROWS', desc: 'PAID FOR IN SHARDS OF ANY KIND', shards: 4, pic: 'arrow10',
      buy: () => { G.arrows = (G.arrows | 0) + 20; } },
    { name: 'TEN RUBIES', desc: 'THE ISLANDS TRADE THEM FOR SHARDS', shards: 12, pic: 'ruby',
      buy: () => { G.rubies = (G.rubies | 0) + 10; } },
    { name: '2X EXPERIENCE', desc: 'TWICE THE EXPERIENCE FOR TEN MINUTES', shards: 3, pic: 'xpVial',
      buy: () => { G.addBoost('xp', BOOST_SECS); } },
    { name: 'A WORN CASKET', desc: 'ONE ARTIFACT, PAID FOR IN SHARDS', shards: 20, casket: 0,
      buy: () => G.openBox('box1') },
    { name: 'FIFTY ARROWS', desc: 'PAID FOR IN SHARDS OF ANY KIND', shards: 9, pic: 'arrow50',
      buy: () => { G.arrows = (G.arrows | 0) + 50; } }
  ];
}
/* The limited page turns over with the day.  Three things off the other
   pages, each at a third off, and a clock on how long they stand. */
function storeDayKey() { return Math.floor(Date.now() / 86400000); }
function storeLimitedRows() {
  const rng = new RNG(storeDayKey() * 7919 + 13);
  const pool = storeItemRows().concat(storeArtifactRows().filter(r => r.coins && r.rank && r.rank <= 3));
  const out = [];
  const taken = {};
  for (let k = 0; k < 3 && pool.length; k++) {
    let i = rng.i(0, pool.length - 1), guard = 0;
    while (taken[i] && guard++ < 40) i = rng.i(0, pool.length - 1);
    taken[i] = 1;
    const src = pool[i];
    out.push(Object.assign({}, src, {
      coins: src.coins ? Math.round(src.coins * 0.66 / 100) * 100 : src.coins,
      was: src.coins, limited: true
    }));
  }
  return out;
}
function storeRows() {
  switch (G.storeTab) {
    case 0: return storeItemRows();
    case 1: return storeLimitedRows();
    case 2: return storeArtifactRows();
    case 3: return storeClothRows();
    default: return storeShardRows();
  }
}
/* how many shards of all five kinds you hold together */
G.shardTotal = function () {
  let n = 0;
  for (const t of ISLE_TYPES) n += G.shardsOf(t.shard);
  return n;
};
/* and taking them, the biggest pile first */
G.spendShards = function (n) {
  if (G.shardTotal() < n) return false;
  const a = archi();
  let left = n;
  while (left > 0) {
    let best = null;
    for (const t of ISLE_TYPES) if (!best || (a.shards[t.shard] | 0) > (a.shards[best] | 0)) best = t.shard;
    if (!best || (a.shards[best] | 0) <= 0) return false;
    const take = Math.min(left, a.shards[best] | 0);
    a.shards[best] -= take;
    left -= take;
  }
  return true;
};
/* ---------- a casket ---------- */
G.openBox = function (key) {
  const box = BOXES.find(b => b.key === key);
  if (!box) return false;
  /* the roll: a rank first, then one of that rank you do not already own */
  const r = Math.random();
  let acc = 0, rank = 2;
  for (const k of [5, 4, 3, 2]) {
    acc += box.odds[k] || 0;
    if (r < acc) { rank = k; break; }
  }
  const pick = (want) => {
    const pool = ARTIFACTS.filter(a => a.rank === want && !G.ownsArtifact(a.key));
    return pool.length ? pool[ri(0, pool.length - 1)] : null;
  };
  let got = pick(rank);
  /* nothing of that rank left, so walk down until something is */
  for (let k = rank - 1; !got && k >= 2; k--) got = pick(k);
  for (let k = rank + 1; !got && k <= 5; k++) got = pick(k);
  if (!got) { G.storeMsg = 'YOU HOLD EVERY ARTIFACT ALREADY'; G.storeMsgT = 2.6; Snd.uiBad(); return false; }
  G.giveArtifact(got.key);
  G.storeMsg = got.name + '  -  ' + RANK_NAME[got.rank];
  G.storeMsgT = 4;
  Snd.unlock(); G.flash(0.5);
  return true;
};

/* the picture a shop row shows */
function storeRowPic(row) {
  const shelf = Art.item.shop || {};
  if (row.art) return Art.item.artifact[row.art] || null;
  if (row.suit) return (Art.suitIcon && Art.suitIcon[row.suit]) || null;
  if (row.casket !== undefined) return (shelf.casket && shelf.casket[row.casket]) || null;
  if (row.pic) return shelf[row.pic] || null;
  return shelf.shard || null;
}
function openStore(from) {
  G.state = 'store';
  G.storeFrom = from || 'map';
  if (G.storeTab === undefined) G.storeTab = 0;
  G.storePage = 0; G.storeSel = -1; G.storeMsgT = 0; G.storeT = 0;
  G.particles.length = 0;
  Snd.ui();
}
function storeClose() {
  Snd.ui();
  openMap(false);
}
function storeAfford(row) {
  if (row.owned && row.owned()) return false;
  if (row.need && (G.prestige | 0) < row.need) return false;
  if (row.shards !== undefined) return G.shardTotal() >= row.shards;
  if (row.rubies !== undefined) return (G.rubies | 0) >= row.rubies;
  return G.codes.admin || G.player.coins >= (row.coins || 0);
}
function storeBuy(row) {
  if (row.owned && row.owned()) { G.storeMsg = 'YOU HOLD IT ALREADY'; G.storeMsgT = 2; Snd.uiBad(); return; }
  if (row.need && (G.prestige | 0) < row.need) {
    G.storeMsg = 'PRESTIGE ' + PRESTIGE_MARK[row.need] + ' OPENS IT'; G.storeMsgT = 2.4; Snd.uiBad(); return;
  }
  if (row.shards !== undefined) {
    if (!G.spendShards(row.shards)) { G.storeMsg = 'IT ASKS ' + row.shards + ' SHARDS'; G.storeMsgT = 2.2; Snd.uiBad(); return; }
  } else if (row.rubies !== undefined) {
    if ((G.rubies | 0) < row.rubies) { G.storeMsg = 'IT ASKS ' + row.rubies + ' RUBIES'; G.storeMsgT = 2.2; Snd.uiBad(); return; }
    G.rubies -= row.rubies;
  } else {
    const cost = row.coins || 0;
    if (!G.codes.admin && G.player.coins < cost) { G.storeMsg = 'IT ASKS ' + shortCoin(cost) + ' COINS'; G.storeMsgT = 2.2; Snd.uiBad(); return; }
    if (!G.codes.admin) G.player.coins -= cost;
  }
  const said = G.storeMsgT;
  row.buy();
  if (G.storeMsgT === said) { G.storeMsg = row.name + ' IS YOURS'; G.storeMsgT = 2.4; }
  Snd.buy(); G.flash(0.25);
  G.saveGame();
}
function updateStore(dt) {
  G.storeT += dt;
  G.storeMsgT = Math.max(0, G.storeMsgT - dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  if (G.settingsOpen) { updateSettings(); return; }
  for (let i = 0; i < STORE_TABS.length; i++) if (Input.tap(storeTabRect(i))) {
    G.storeTab = i; G.storePage = 0; Snd.ui();
  }
  const rows = storeRows();
  const pages = Math.max(1, Math.ceil(rows.length / STORE_ROWS));
  G.storePage = clamp(G.storePage, 0, pages - 1);
  for (const d of [-1, 1]) if (Input.tap(storePageRect(d))) {
    G.storePage = clamp(G.storePage + d, 0, pages - 1); Snd.ui();
  }
  if (Input.hit('ArrowRight')) G.storePage = clamp(G.storePage + 1, 0, pages - 1);
  if (Input.hit('ArrowLeft')) G.storePage = clamp(G.storePage - 1, 0, pages - 1);
  if (Input.tap(storeBackRect()) || Input.hit('Escape')) { storeClose(); return; }
  G.storeSel = -1;
  const show = rows.slice(G.storePage * STORE_ROWS, (G.storePage + 1) * STORE_ROWS);
  show.forEach((row, i) => {
    if (Input.over(storeRowRect(i))) G.storeSel = i;
    if (Input.tap(storeRowRect(i)) || Input.tap(storeBuyRect(i))) storeBuy(row);
  });
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
}
function drawStore() {
  ctx.drawImage(Art.map.bg, 0, 0);
  for (const pa of G.particles) pa.draw(ctx);
  const B = STORE_BOX;
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'THE ITEM SHOP', B.x + 10, B.y + 7, '#f2e2b8', 1, 'left', '#000000');
  /* the three purses */
  let px = B.x + B.w - 10;
  px -= drawText(ctx, String(G.shardTotal()), px - textWidth(String(G.shardTotal())), B.y + 7, '#8fd0e8', 1, 'left') + 4;
  drawShard(ctx, px - 4, B.y + 10, 4, ISLE_TYPES[0], 1); px -= 12;
  px -= drawText(ctx, String(G.rubies | 0), px - textWidth(String(G.rubies | 0)), B.y + 7, '#ff5a7a', 1, 'left') + 4;
  ctx.fillStyle = '#ff5a7a';
  ctx.fillRect(px - 7, B.y + 8, 5, 5); px -= 12;
  drawText(ctx, G.codes.admin ? INF : shortCoin(G.player.coins),
           px, B.y + 7, '#ffe98a', 1, 'right');
  /* the five pages */
  STORE_TABS.forEach((name, i) => {
    const r = storeTabRect(i), on = G.storeTab === i, hot = Input.over(r);
    ctx.fillStyle = on ? 'rgba(74,56,34,0.96)' : (hot ? '#332c4c' : 'rgba(24,18,12,0.86)');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#ffd04a' : '#5b4a34';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, name, r.x + r.w / 2, r.y + 4, on ? '#ffeec0' : '#a9b3c9', 1, 'center');
  });
  const rows = storeRows();
  const pages = Math.max(1, Math.ceil(rows.length / STORE_ROWS));
  const show = rows.slice(G.storePage * STORE_ROWS, (G.storePage + 1) * STORE_ROWS);
  show.forEach((row, i) => {
    const r = storeRowRect(i), hot = G.storeSel === i;
    const owned = row.owned && row.owned();
    const can = storeAfford(row);
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.94)' : 'rgba(24,18,12,0.86)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = owned ? '#6fc46a' : (row.rank ? RANK_COL[row.rank] : (can ? '#8a6a3a' : '#5b4a34'));
    ctx.fillRect(r.x, r.y, r.w, 1);
    /* the picture of the thing itself: the artifact's own icon, the suit on
       its hanger, the casket, or whatever the row names */
    const pic = storeRowPic(row);
    if (pic) {
      /* an artifact stands on a plate of its rank, so the tier reads at a glance */
      if (row.rank) {
        ctx.fillStyle = RANK_COL[row.rank];
        ctx.fillRect(r.x + 3, r.y + 3, 18, 18);
        ctx.fillStyle = 'rgba(12,8,20,0.72)';
        ctx.fillRect(r.x + 4, r.y + 4, 16, 16);
      }
      ctx.drawImage(pic, r.x + 4, r.y + 4);
    }
    /* the line is cut to the room before the price, so the two never meet */
    const room = r.w - 90;
    drawText(ctx, fitText(row.name, room), r.x + 24, r.y + 4,
             owned ? '#9be89a' : '#ffeec0', 1, 'left');
    drawText(ctx, fitText(row.rank ? (RANK_NAME[row.rank] + ' - ' + row.desc) : row.desc, room),
             r.x + 24, r.y + 14, '#8a94a6', 1, 'left');
    /* the price, or what stands in its way */
    const br = storeBuyRect(i), bhot = Input.over(br);
    let label, col;
    if (owned) { label = 'OWNED'; col = '#6fc46a'; }
    else if (row.need && (G.prestige | 0) < row.need) { label = 'LOCKED'; col = '#c9403a'; }
    else if (row.shards !== undefined) { label = row.shards + ' SH'; col = can ? '#8fd0e8' : '#c9403a'; }
    else if (row.rubies !== undefined) { label = row.rubies + ' RU'; col = can ? '#ff8b9a' : '#c9403a'; }
    else { label = shortCoin(row.coins || 0); col = can ? '#ffe98a' : '#c9403a'; }
    ctx.fillStyle = owned ? 'rgba(24,40,20,0.9)' : (bhot && can ? 'rgba(74,56,34,0.96)' : 'rgba(14,10,20,0.8)');
    ctx.fillRect(br.x, br.y, br.w, br.h);
    ctx.fillStyle = can && !owned ? '#8a6a3a' : '#3a3350';
    ctx.fillRect(br.x, br.y, br.w, 1);
    drawText(ctx, label, br.x + br.w / 2, br.y + 5, col, 1, 'center');
    /* what it used to cost, on the page that is cut down */
    if (row.limited && row.was) drawText(ctx, shortCoin(row.was), br.x - 4, br.y + 5, '#7a6448', 1, 'right');
  });
  /* the pages, and the way out */
  if (pages > 1) {
    for (const d of [-1, 1]) {
      const r = storePageRect(d), can = d < 0 ? G.storePage > 0 : G.storePage < pages - 1;
      ctx.fillStyle = can ? 'rgba(58,44,28,0.9)' : 'rgba(34,26,18,0.6)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawText(ctx, d < 0 ? '<' : '>', r.x + r.w / 2, r.y + 5, can ? '#ffeec0' : '#5b4a34', 1, 'center');
    }
    drawText(ctx, (G.storePage + 1) + '/' + pages, storePageRect(1).x + 34, B.y + 185, '#a9b3c9', 1, 'left');
  }
  /* how long a booster has left */
  const xpLeft = G.boostLeft('xp'), cLeft = G.boostLeft('coin');
  if (xpLeft > 0 || cLeft > 0) {
    const bits = [];
    if (xpLeft > 0) bits.push('2X XP ' + Math.ceil(xpLeft / 60) + 'M');
    if (cLeft > 0) bits.push('2X COINS ' + Math.ceil(cLeft / 60) + 'M');
    drawText(ctx, bits.join('   '), B.x + B.w / 2, B.y + 185, '#9be89a', 1, 'center');
  }
  const back = storeBackRect(), bh = Input.over(back);
  ctx.fillStyle = bh ? 'rgba(74,56,34,0.96)' : 'rgba(34,26,16,0.9)';
  ctx.fillRect(back.x, back.y, back.w, back.h);
  ctx.fillStyle = bh ? '#ffd04a' : '#b8862f';
  ctx.fillRect(back.x, back.y, back.w, 1);
  drawText(ctx, 'BACK', back.x + back.w / 2, back.y + 5, '#ffeec0', 1, 'center');
  if (G.storeMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.storeMsgT * 2);
    ctx.fillStyle = 'rgba(8,6,16,0.86)';
    ctx.fillRect(B.x + 4, B.y + B.h - 20, B.w - 8, 14);
    drawText(ctx, G.storeMsg, B.x + B.w / 2, B.y + B.h - 17, '#ffd04a', 1, 'center', '#2a1a10');
    ctx.restore();
  }
  if (G.settingsOpen) drawSettings();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   THE WARDROBE.  Clothes cut to the pattern of each realm, sold
   for coins out of whichever file you last played.
   ============================================================ */
const WARD_BOX = { x: 18, y: 12, w: 348, h: 192 };
const WARD_PER_PAGE = 8;
function wardRowRect(i) {
  return { x: WARD_BOX.x + 12 + (i % 2) * 168, y: WARD_BOX.y + 34 + Math.floor(i / 2) * 30,
           w: 160, h: 26 };
}
function wardBackRect() { return { x: WARD_BOX.x + 12, y: WARD_BOX.y + WARD_BOX.h - 22, w: 54, h: 16 }; }
function wardPageRect(d) {
  return { x: WARD_BOX.x + WARD_BOX.w - (d < 0 ? 62 : 32), y: WARD_BOX.y + WARD_BOX.h - 22, w: 26, h: 16 };
}
function openWardrobe(from) {
  G.wardFrom = from || 'title';
  G.wardPage = 0; G.wardSel = -1; G.wardMsgT = 0; G.wardT = 0;
  if (from === 'title') {
    /* the title screen has no file open, so it borrows the last one played */
    const slot = clamp(Store.read(SLOT_KEY, 0) | 0, 0, SLOTS - 1);
    const d = readSlot(slot);
    if (!d || !d.used) { G.wardNoFile = true; }
    else {
      G.wardNoFile = false;
      G.slot = slot;
      if (!G.player) G.player = new Player();
      G.roomFlags = {}; G.flags = {}; G.levelState = {};
      G.codes = { found: {}, used: {}, tickets: 0, admin: false };
      G.quests = { claimed: {}, daily: null };
      G.artifacts = { owned: {}, slots: [null, null, null] };
      G.wardrobe = { owned: {} };
      applySave(d);
    }
  } else G.wardNoFile = false;
  G.state = 'wardrobe';
  G.particles.length = 0;
}
function wardClose() {
  if (G.wardFrom === 'profile') { G.state = 'profile'; Snd.ui(); return; }
  G.state = 'title'; initTitle(); Snd.ui(); Snd.play('title'); Snd.ambienceLevel(0.5, 2);
}
function updateWardrobe(dt) {
  G.wardT += dt;
  G.wardMsgT = Math.max(0, G.wardMsgT - dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  const back = wardBackRect();
  G.wardBackHot = Input.over(back);
  if (Input.tap(back) || Input.hit('Escape')) { wardClose(); return; }
  const pages = Math.ceil(SUIT_KEYS.length / WARD_PER_PAGE);
  for (const d of [-1, 1]) {
    const r = wardPageRect(d);
    if (Input.tap(r)) { G.wardPage = clamp(G.wardPage + d, 0, pages - 1); G.wardSel = -1; Snd.ui(); }
  }
  if (Input.hit('ArrowRight')) G.wardPage = clamp(G.wardPage + 1, 0, pages - 1);
  if (Input.hit('ArrowLeft')) G.wardPage = clamp(G.wardPage - 1, 0, pages - 1);
  if (G.wardNoFile) return;
  const keys = SUIT_KEYS.slice(G.wardPage * WARD_PER_PAGE, (G.wardPage + 1) * WARD_PER_PAGE);
  G.wardSel = -1;
  for (let i = 0; i < keys.length; i++) if (Input.over(wardRowRect(i))) G.wardSel = i;
  let wardTap = -1;
  for (let i = 0; i < keys.length; i++) if (Input.tap(wardRowRect(i))) wardTap = i;
  if (wardTap >= 0) {
    const key = keys[wardTap], suit = SUITS[key];
    /* Three of the suits wait on a prestige.  No purse buys one early. */
    if (!suitUnlocked(key)) {
      G.wardMsg = 'PRESTIGE ' + PRESTIGE_MARK[suit.need] + ' OPENS IT';
      G.wardMsgT = 2.2;
      Snd.uiBad();
    } else if (G.wardrobe.owned[key]) {
      /* owned, so the click wears it, or takes it off again */
      G.profile.suit = (G.profile.suit === key) ? 'none' : key;
      applyProfile();
      G.wardMsg = G.profile.suit === key ? 'YOU PUT IT ON' : 'YOU TAKE IT OFF';
      G.wardMsgT = 1.4;
      Snd.buy(); G.saveGame();
    } else if (G.codes.admin || G.player.coins >= suit.cost) {
      if (!G.codes.admin) G.player.coins -= suit.cost;
      G.wardrobe.owned[key] = 1;
      G.profile.suit = key;
      applyProfile();
      G.wardMsg = suit.name + ' IS YOURS';
      G.wardMsgT = 1.8;
      Snd.buy(); G.flash(0.3); G.saveGame();
      for (let k = 0; k < 26; k++) G.particles.push(new Particle({
        x: rr(WARD_BOX.x, WARD_BOX.x + WARD_BOX.w), y: WARD_BOX.y + WARD_BOX.h,
        vx: rr(-1, 1), vy: rr(-3, -0.6), life: rr(0.4, 1),
        col: '#ffeec0', col2: '#c68e3f', size: rr(1, 2.4), grav: 0.06
      }));
    } else {
      G.wardMsg = 'NOT ENOUGH COINS';
      G.wardMsgT = 1.4;
      Snd.uiBad();
    }
  }
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
}
function drawWardrobe() {
  ctx.drawImage(Art.map.bg, 0, 0);
  for (const pa of G.particles) pa.draw(ctx);
  const B = WARD_BOX;
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'THE WARDROBE', B.x + 12, B.y + 8, '#f2e2b8', 1, 'left', '#000000');
  drawText(ctx, 'CLOTHES CUT TO THE PATTERN OF EACH REALM',
           B.x + B.w - 12, B.y + 8, '#a9b3c9', 1, 'right');
  if (G.wardNoFile) {
    drawText(ctx, 'START A FILE FIRST', B.x + B.w / 2, B.y + 84, '#ffeec0', 2, 'center', '#2a1a10');
    drawText(ctx, 'THE WARDROBE SPENDS THE COINS OF A SAVED GAME',
             B.x + B.w / 2, B.y + 104, '#a9b3c9', 1, 'center');
  } else {
    /* the purse */
    ctx.drawImage(Art.item.coin[Math.floor(G.wardT / 0.09) % 8], B.x + 12, B.y + 18);
    drawText(ctx, G.purse(), B.x + 26, B.y + 20, '#ffe98a', 1, 'left', '#000000');
    drawText(ctx, 'FILE ' + (G.slot + 1), B.x + B.w - 12, B.y + 20, '#a9b3c9', 1, 'right');

    const keys = SUIT_KEYS.slice(G.wardPage * WARD_PER_PAGE, (G.wardPage + 1) * WARD_PER_PAGE);
    keys.forEach((key, i) => {
      const suit = SUITS[key], r = wardRowRect(i);
      const owned = !!G.wardrobe.owned[key];
      const worn = G.profile.suit === key;
      const open = suitUnlocked(key);
      const afford = open && (G.codes.admin || G.player.coins >= suit.cost);
      const hot = G.wardSel === i;
      ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.86)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = worn ? '#6fc46a' : (owned ? '#b8862f' : (afford ? '#8a6a3a' : '#5b4a34'));
      ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
      /* a swatch of the cloth itself */
      ctx.fillStyle = suit.dark; ctx.fillRect(r.x + 4, r.y + 4, 18, 18);
      ctx.fillStyle = suit.base; ctx.fillRect(r.x + 5, r.y + 5, 16, 12);
      ctx.fillStyle = suit.light; ctx.fillRect(r.x + 5, r.y + 5, 16, 4);
      ctx.fillStyle = suit.legs; ctx.fillRect(r.x + 5, r.y + 17, 16, 4);
      ctx.fillStyle = suit.trim; ctx.fillRect(r.x + 5, r.y + 15, 16, 2);
      /* a bought prestige suit catches a light running across it */
      if (suit.shine && open) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const k = ((G.wardT * 0.55 + i * 0.17) % 1) * 20 - 2;
        ctx.globalAlpha = 0.55; ctx.fillStyle = '#ffffff';
        ctx.fillRect(r.x + 5, r.y + 4 + Math.round(k), 16, 2);
        ctx.restore();
      }
      drawText(ctx, suit.name, r.x + 27, r.y + 4,
               open ? (owned ? '#ffeec0' : '#d8c49a') : '#6d7994', 1, 'left');
      drawText(ctx, suit.realm, r.x + 27, r.y + 15, open ? '#8a94a6' : '#6d7994', 1, 'left');
      const tag = !open ? 'LOCKED' : (worn ? 'WORN' : (owned ? 'OWNED' : String(suit.cost)));
      drawText(ctx, tag, r.x + r.w - 6, r.y + 9,
               !open ? '#c9403a'
                     : (worn ? '#9be89a' : (owned ? '#b8862f' : (afford ? '#ffe98a' : '#c9403a'))),
               1, 'right');
    });
    const pages = Math.ceil(SUIT_KEYS.length / WARD_PER_PAGE);
    for (const d of [-1, 1]) {
      const r = wardPageRect(d);
      const can = d < 0 ? G.wardPage > 0 : G.wardPage < pages - 1;
      ctx.fillStyle = can ? 'rgba(58,44,28,0.9)' : 'rgba(34,26,18,0.6)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawText(ctx, d < 0 ? '<' : '>', r.x + r.w / 2, r.y + 5, can ? '#ffeec0' : '#5b4a34', 1, 'center');
    }
    drawText(ctx, (G.wardPage + 1) + '/' + pages, wardPageRect(-1).x - 8, WARD_BOX.y + WARD_BOX.h - 17,
             '#a9b3c9', 1, 'right');
  }
  const back = wardBackRect();
  ctx.fillStyle = G.wardBackHot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.86)';
  ctx.fillRect(back.x, back.y, back.w, back.h);
  ctx.fillStyle = G.wardBackHot ? '#ffd04a' : '#b8862f';
  ctx.fillRect(back.x, back.y, back.w, 1);
  drawText(ctx, 'BACK', back.x + back.w / 2, back.y + 5, '#ffeec0', 1, 'center');
  if (G.wardMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.wardMsgT * 2);
    drawText(ctx, G.wardMsg, B.x + B.w / 2, B.y + B.h - 18, '#ffd04a', 1, 'center', '#2a1a10');
    ctx.restore();
  }
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   THE SPHINX AND ITS QUESTION.  Answer it and the gate opens
   and the ring is yours.  Answer wrong and it costs a heart.
   ============================================================ */
/* Fifty questions, all of them about this wood and these realms.  The sphinx
   takes one at random and holds you to it. */
const RIDDLES = [
  { q: 'WHICH GUARDIAN KEEPS THE FIRST REALM, EMBERWOOD', a: ['THE EMBER WYRM', 'THE KRAKEN MAW', 'THE FORGEFIEND'], right: 0 },
  { q: 'WHAT DOES A SECOND TAP OF THE SWORD THROW', a: ['A FLURRY', 'A GALE', 'A ROLL CUT'], right: 0 },
  { q: 'HOW MANY SLOTS DOES THE POUCH HOLD', a: ['THREE', 'FIVE', 'ONE'], right: 0 },
  { q: 'WHICH RELIC LOOSES A BURNING WAVE ON EVERY SWING', a: ['THE EMBERHEART', 'THE RIPTIDE MANTLE', 'THE STORMFEATHER WINGS'], right: 0 },
  { q: 'WHAT LIVES AT THE BOTTOM OF THE TRENCH', a: ['THE LEVIATHAN', 'THE TIDE WARDEN', 'THE ASHEN TITAN'], right: 0 },
  { q: 'WHAT PUTS OUT A FIRE THAT HAS TAKEN HOLD OF YOU', a: ['WATER', 'A ROLL', 'A PARRY'], right: 0 },
  { q: 'WHICH CHAPTER LIES UNDER THE SEA', a: ['CHAPTER TWO', 'CHAPTER FOUR', 'CHAPTER ONE'], right: 0 },
  { q: 'HOW MANY REALMS DOES A CHAPTER HOLD', a: ['THREE', 'FIVE', 'TWO'], right: 0 },
  { q: 'WHAT DOES THE LODESTONE CHANGE', a: ['THE REACH OF THE MAGNET', 'THE PULL OF THE MAGNET', 'THE PRICE OF COINS'], right: 0 },
  { q: 'WHERE DO YOU WAKE WHEN THE LEVIATHAN SWALLOWS YOU', a: ['THE GULLET', 'THE VAULT', 'THE MAZE'], right: 0 },
  { q: 'HOW MANY PAPERS ARE HIDDEN IN EACH REALM', a: ['TWO', 'FOUR', 'ONE'], right: 0 },
  { q: 'WHAT DOES A BLOW COST YOU WHEN THE PHARAOH THROWS YOU AT A WALL', a: ['FIVE HEARTS', 'TWO HEARTS', 'ONE HEART'], right: 0 },
  { q: 'WHICH CREATURE TURNS A BLOW STRUCK FROM THE FRONT', a: ['A CRAB', 'A JELLY', 'A BAT'], right: 0 },
  { q: 'WHAT COLOUR DOES A STRUCK CREATURE TURN', a: ['WHITE', 'RED', 'GREEN'], right: 0 },
  { q: 'HOW LONG DOES FIRE TAKE HALF A HEART', a: ['A SECOND', 'TEN SECONDS', 'AN INSTANT'], right: 0 },
  { q: 'WHAT DOES THE WHETSTONE SHARPEN', a: ['THE BLADE', 'THE BOOTS', 'THE WARD'], right: 0 },
  { q: 'WHICH WAY DOES THE CAPE STREAM WHEN YOU FALL', a: ['UPWARD', 'BEHIND YOU', 'IT HANGS STILL'], right: 0 },
  { q: 'WHAT HOLDS THE LAST MAP SHUT', a: ['CHAINS', 'A RIDDLE', 'A KEY'], right: 0 },
  { q: 'WHAT DOES A ROLL CUT PAY ON A KILL', a: ['DOUBLE COINS', 'DOUBLE DAMAGE', 'NOTHING EXTRA'], right: 0 },
  { q: 'HOW MANY FILES CAN YOU KEEP AT ONCE', a: ['THREE', 'ONE', 'TEN'], right: 0 },
  { q: 'WHAT WALKS THE CINDER FIELDS AND LEAVES CINDERS', a: ['AN EMBERLING', 'A SPORELING', 'A WISP'], right: 0 },
  { q: 'WHICH REALM HOLDS THE HOLLOW MAZE', a: ['EMBERWOOD', 'SPOREWOOD', 'TIDEWRACK'], right: 0 },
  { q: 'WHAT DOES A DRIFT OF POWDERED SNOW DO TO YOU', a: ['IT SWALLOWS YOU', 'IT SLOWS YOU', 'NOTHING'], right: 0 },
  { q: 'WHAT LETS YOU FALL THROUGH QUICKSAND ALIVE', a: ['THE SANDSTEP', 'THE SALT VIAL', 'THE FEATHER TOKEN'], right: 0 },
  { q: 'WHICH GUARDIAN CALLS DOWN A CROWN OF FIRE', a: ['IFRIT', 'THE SPHINX', 'ZEUS'], right: 0 },
  { q: 'HOW MANY HEARTS DOES A LEVIATHAN TAKE AT A BITE', a: ['THREE', 'ONE', 'SIX'], right: 0 },
  { q: 'WHAT DO YOU SPEND ON CLOTHES IN THE WARDROBE', a: ['COINS', 'TICKETS', 'PAPERS'], right: 0 },
  { q: 'WHAT DOES THE SCARAB CHARM ADD', a: ['A QUARTER MORE COINS', 'A HEART', 'A LONGER DASH'], right: 0 },
  { q: 'WHICH CREATURE HANGS IN THE DARK BEHIND ITS OWN LURE', a: ['AN ANGLER', 'A CRAB', 'A GOLEM'], right: 0 },
  { q: 'WHAT STANDS IN THE FIRST BOSS ROOM BEFORE THE DRAGON', a: ['ARMOUR THAT MOVES', 'A SPHINX', 'A CHEST'], right: 0 },
  { q: 'HOW MANY TILES OF WALL DOES A VAULT SHAFT RUN', a: ['TWENTY', 'TEN', 'FIFTY'], right: 0 },
  { q: 'WHAT DOES A GALE CARRY THE EMBERHEART FIRE TO', a: ['SEVEN AND A HALF TILES', 'FIVE TILES', 'TWENTY TILES'], right: 0 },
  { q: 'WHICH REALM DOES THE FROST WYRM KEEP', a: ['GLACIER HEART', 'FROSTFELL', 'AURORA CROWN'], right: 0 },
  { q: 'WHAT COMES OUT OF THE GROUND WHEN YOU LEAVE A VAULT', a: ['A DOOR', 'A LADDER', 'A LIFT'], right: 0 },
  { q: 'WHAT DOES THE WARD CHARM GIVE YOU', a: ['A CHANCE TO SHRUG OFF A BLOW', 'A SECOND JUMP', 'MORE COINS'], right: 0 },
  { q: 'WHICH CODE UNLOCKS GINGER HAIR', a: ['DYLAN', 'BEAR50', 'ADMIN'], right: 0 },
  { q: 'WHAT KIND OF GROUND GIVES NO GRIP AT ALL', a: ['ICE', 'SNOW', 'SAND'], right: 0 },
  { q: 'HOW MANY BLOWS OF A BASE BLADE DOES A BEAR TAKE', a: ['FIVE', 'ONE', 'TWENTY'], right: 0 },
  { q: 'WHAT DO YOU GET FOR PARRYING A SHOT', a: ['IT FLIES BACK AT TWICE THE DAMAGE', 'A COIN', 'A HEART'], right: 0 },
  { q: 'WHICH CHAPTER IS THE WHITE SILENCE', a: ['CHAPTER FOUR', 'CHAPTER TWO', 'CHAPTER FIVE'], right: 0 },
  { q: 'WHAT DOES THE STONE EYE SHOW YOU', a: ['HIDDEN GROUND', 'THE MAP', 'YOUR COINS'], right: 0 },
  { q: 'WHAT SITS AT THE HEAD OF A VAULT CLIMB', a: ['A CHEST AND A DOOR', 'A GUARDIAN', 'NOTHING'], right: 0 },
  { q: 'WHICH CREATURE CIRCLES THE WASTE AND THEN STOOPS', a: ['A VULTURE', 'A BAT', 'A JELLY'], right: 0 },
  { q: 'WHAT DOES DYING COST YOU', a: ['A FIFTH OF YOUR COINS', 'A HEART', 'A REALM'], right: 0 },
  { q: 'HOW DO YOU KICK OFF A WALL', a: ['HOLD INTO IT AND JUMP', 'DASH AT IT', 'CROUCH'], right: 0 },
  { q: 'WHAT DOES THE COPPER ANKH ADD', a: ['ONE HEART', 'ONE COIN', 'ONE SLOT'], right: 0 },
  { q: 'WHICH GUARDIAN LIFTS YOU AND SQUEEZES', a: ['THE KRAKEN MAW', 'THE DUNE MAW', 'THE RIME COLOSSUS'], right: 0 },
  { q: 'WHAT BUILDS UP WHEN YOU HOLD THE SWORD DOWN', a: ['A GALE', 'A FLURRY', 'A ROLL'], right: 0 },
  { q: 'WHERE DOES A BOOT LEAVE A TRACK BEHIND IT', a: ['IN FRESH SNOW', 'IN SAND', 'IN ASH'], right: 0 },
  { q: 'WHAT AM I, WHO SITS HERE AND WILL NOT MOVE', a: ['THE SPHINX', 'A STATUE', 'A GUARDIAN'], right: 0 }
];
/* the three answers are shuffled per question, so the first is not the one */
function riddleFor(seed) {
  const base = RIDDLES[seed % RIDDLES.length];
  const r = new RNG(seed * 31 + 7);
  const order = [0, 1, 2];
  for (let i = 2; i > 0; i--) { const j = r.i(0, i); const t = order[i]; order[i] = order[j]; order[j] = t; }
  return { q: base.q, a: order.map(i => base.a[i]), right: order.indexOf(base.right) };
}
const RIDDLE_BOX = { x: 34, y: 40, w: 316, h: 132 };
function riddleAnswerRect(i) {
  return { x: RIDDLE_BOX.x + 16, y: RIDDLE_BOX.y + 54 + i * 22, w: RIDDLE_BOX.w - 32, h: 18 };
}
function currentRiddle() {
  const r = G.room && G.room.riddle;
  if (!r) return null;
  /* a fresh question every time you come to it, until you answer one */
  if (!G.riddlePick) G.riddlePick = (r.seed + (Date.now() & 0xffff)) >>> 0;
  return riddleFor(G.riddlePick);
}
/* The wall does not fall.  It slides sideways along its own course, grinding,
   and leaves a doorway standing where it stood. */
const GATE_SLIDE = 2.4;
G.openGate = function (quiet) {
  const room = G.room;
  const gt = room && room.gate;
  if (!gt) return;
  for (let x = gt.x0; x <= gt.x1; x++)
    for (let y = gt.y0; y <= gt.y1; y++) room.set(x, y, T_EMPTY);
  /* the ground the wall stood on comes back, so you can walk through */
  for (let x = gt.x0; x <= gt.x1; x++) room.set(x, gt.y1, T_TOMBTOP);
  if (quiet) return;
  G.gateSlide = { t: 0, x0: gt.x0, x1: gt.x1, y0: gt.y0, y1: gt.y1 };
  Snd.boom(); G.shake(9);
};
function updateGateSlide(dt) {
  const g = G.gateSlide;
  if (!g) return;
  g.t += dt;
  const k = clamp(g.t / GATE_SLIDE, 0, 1);
  if (Math.random() < dt * 60) G.particles.push(new Particle({
    x: (g.x0 + (g.x1 - g.x0 + 1) * (1 + k * 3)) * TILE + rr(-10, 10),
    y: rr(g.y0, g.y1 + 1) * TILE, vx: rr(-1.4, 1.4), vy: rr(-1.6, 0.6),
    life: rr(0.4, 1.1), col: '#e0bd86', col2: '#8a6a3a', size: rr(1, 3), grav: 0.16
  }));
  if (g.t < GATE_SLIDE && Math.floor(g.t * 4) !== Math.floor((g.t - dt) * 4)) G.shake(2.4);
  if (g.t >= GATE_SLIDE + 0.6) G.gateSlide = null;
}
/* the slab on the move, and the arch it leaves behind */
function drawGate(camX, camY) {
  const room = G.room;
  const gt = room && room.gate;
  if (!gt) return;
  const w = (gt.x1 - gt.x0 + 1) * TILE, h = (gt.y1 - gt.y0 + 1) * TILE;
  const gx = gt.x0 * TILE, gy = gt.y0 * TILE;
  if (G.gateSlide) {
    const k = clamp(G.gateSlide.t / GATE_SLIDE, 0, 1);
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, (G.gateSlide.t - GATE_SLIDE) / 0.6);
    ctx.translate(Math.round(ease * w * 3.2), 0);
    for (let ty = gt.y0; ty <= gt.y1; ty++)
      for (let tx = gt.x0; tx <= gt.x1; tx++)
        ctx.drawImage(Art.tile.tomb[(tx * 7 + ty * 13) & 3], tx * TILE, ty * TILE);
    /* the face of it, so the slab reads as one stone */
    ctx.fillStyle = 'rgba(224,176,64,0.5)';
    ctx.fillRect(gx, gy, w, 2);
    ctx.restore();
  }
  /* the arch that stands once the wall has gone */
  if (G.flags.riddleDone) {
    const ax = gt.doorX * TILE + 8, ay = gt.doorY * TILE;
    ctx.save();
    ctx.fillStyle = '#7b6338';
    ctx.fillRect(ax - 22, ay - 46, 6, 46);
    ctx.fillRect(ax + 16, ay - 46, 6, 46);
    ctx.fillRect(ax - 24, ay - 52, 48, 7);
    ctx.fillStyle = '#b09563';
    ctx.fillRect(ax - 21, ay - 45, 4, 45);
    ctx.fillRect(ax + 17, ay - 45, 4, 45);
    ctx.fillRect(ax - 23, ay - 51, 46, 5);
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(ax - 24, ay - 53, 48, 2);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = k % 2 ? '#2f5fb0' : '#e0b040';
      ctx.fillRect(ax - 20 + k * 9, ay - 50, 6, 3);
    }
    ctx.restore();
  }
}
function updateRiddle(dt) {
  G.riddleT = (G.riddleT || 0) + dt;
  const R = currentRiddle();
  if (!R) { G.riddleOpen = false; return; }
  G.riddleMsgT = Math.max(0, (G.riddleMsgT || 0) - dt);
  const closeR = { x: RIDDLE_BOX.x + RIDDLE_BOX.w - 24, y: RIDDLE_BOX.y + 4, w: 20, h: 16 };
  G.riddleClose = Input.over(closeR);
  if (Input.tap(closeR) || Input.hit('Escape')) { G.riddleOpen = false; Snd.ui(); return; }
  G.riddleSel = -1;
  let tapped = -1;
  for (let i = 0; i < R.a.length; i++) {
    const r = riddleAnswerRect(i);
    if (Input.over(r)) G.riddleSel = i;
    if (Input.tap(r)) tapped = i;
  }
  if (G.riddleMsgT > 0) return;
  let pick = tapped;
  if (Input.hit('Digit1')) pick = 0;
  if (Input.hit('Digit2')) pick = 1;
  if (Input.hit('Digit3')) pick = 2;
  if (pick < 0) return;
  if (pick === R.right) {
    G.flags.riddleDone = true;
    G.riddleMsg = 'THE SPHINX STANDS ASIDE';
    G.riddleMsgT = 1.6;
    G.openGate();
    Snd.unlock();
    if (!G.ownsArtifact('ring')) G.giveArtifact('ring');
    else G.payOut(1200, G.player.cx, G.player.cy);
    G.riddleOpen = false;
    G.saveGame();
  } else {
    G.riddleMsg = 'WRONG. THE SPHINX TAKES ITS FEE';
    G.riddleMsgT = 1.6;
    Snd.uiBad();
    const p = G.player;
    p.invuln = 0;
    p.hurt(4, p.cx, p.cy - 20);
    G.shake(7);
  }
}
function drawRiddle() {
  const R = currentRiddle();
  if (!R) return;
  const B = RIDDLE_BOX;
  ctx.fillStyle = 'rgba(8,6,14,0.72)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(38,28,16,0.97)';
  ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.fillStyle = '#e0b040';
  ctx.fillRect(B.x, B.y, B.w, 1); ctx.fillRect(B.x, B.y + B.h - 1, B.w, 1);
  ctx.fillRect(B.x, B.y, 1, B.h); ctx.fillRect(B.x + B.w - 1, B.y, 1, B.h);
  drawText(ctx, 'THE SPHINX ASKS', B.x + 12, B.y + 6, '#ffeec0', 2, 'left', '#2a1a10');
  const closeR = { x: B.x + B.w - 24, y: B.y + 4, w: 20, h: 16 };
  ctx.fillStyle = G.riddleClose ? '#c9403a' : 'rgba(20,14,10,0.8)';
  ctx.fillRect(closeR.x, closeR.y, closeR.w, closeR.h);
  drawText(ctx, 'X', closeR.x + closeR.w / 2, closeR.y + 4, '#ffeec0', 1, 'center');
  drawText(ctx, R.q, B.x + B.w / 2, B.y + 28, '#ebdcb6', 1, 'center');
  R.a.forEach((txt, i) => {
    const r = riddleAnswerRect(i);
    const hot = G.riddleSel === i;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.9)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hot ? '#ffd04a' : '#8a6a3a';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, (i + 1) + '.  ' + txt, r.x + 10, r.y + 5, hot ? '#ffeec0' : '#d8c49a', 1, 'left');
  });
  const foot = G.riddleMsgT > 0 ? G.riddleMsg : 'CLICK AN ANSWER, OR PRESS 1, 2 OR 3';
  ctx.fillStyle = 'rgba(20,14,10,0.9)';
  ctx.fillRect(B.x + 1, B.y + B.h - 15, B.w - 2, 14);
  drawText(ctx, foot, B.x + B.w / 2, B.y + B.h - 11,
           G.riddleMsgT > 0 ? '#ffd04a' : '#a89270', 1, 'center');
}

/* ============================================================
   THE ARTIFACTS POUCH.  Three slots.  Whatever sits in a slot
   works; whatever sits in the pouch does nothing.
   ============================================================ */
const ARTIFACTS = [
  /* the three mythical things, one from each guardian of the waste */
  { key: 'sunheart', rank: 4, name: 'THE SUNHEART', short: 'SUNHEART',
    desc: 'FOUR HEARTS MORE ON YOUR LIFE BAR' },
  { key: 'riddlestone', rank: 4, name: 'THE RIDDLESTONE', short: 'RIDDLESTONE',
    desc: 'EVERY SPECIAL CUT BITES HALF AGAIN AS HARD' },
  { key: 'pharaohcrook', rank: 4, name: "THE PHARAOHS CROOK", short: 'THE CROOK',
    desc: 'EVERY COIN COMES TO YOU DOUBLED' },
  { key: 'ring', rank: 3, name: "THE PHARAOHS RING", short: 'THE RING',
    desc: 'WALK THROUGH QUICKSAND AND POWDERED SNOW' },
  { key: 'ankh', rank: 2, name: 'COPPER ANKH', short: 'ANKH', desc: 'ONE HEART MORE' },
  { key: 'eye', rank: 2, name: 'THE STONE EYE', short: 'STONE EYE',
    desc: 'HIDDEN GROUND GIVES OFF A SHIMMER' },
  { key: 'scarab', rank: 2, name: 'SCARAB CHARM', short: 'SCARAB',
    desc: 'EVERY KILL PAYS A QUARTER MORE' },
  { key: 'frostbead', rank: 2, name: 'FROST BEAD', short: 'FROST BEAD',
    desc: 'FIRE BURNS HALF AS LONG' },
  { key: 'emberchip', rank: 2, name: 'EMBER CHIP', short: 'EMBER CHIP',
    desc: 'THE BLADE BITES ONE POINT DEEPER' },
  { key: 'feather', rank: 2, name: 'FEATHER TOKEN', short: 'FEATHER',
    desc: 'YOU JUMP HIGHER' },
  { key: 'saltvial', rank: 2, name: 'SALT VIAL', short: 'SALT VIAL',
    desc: 'THE DASH RETURNS A THIRD SOONER' },
  /* ---- the bow, and the things the shop keeps beside it ---- */
  { key: 'bow', rank: 5, name: 'THE LONGBOW', short: 'LONGBOW',
    desc: 'HOLD THE SWORD TO DRAW IT AND LOOSE AN ARROW' },
  /* four more of the super rare */
  { key: 'heartstone', rank: 3, name: 'THE HEARTSTONE', short: 'HEARTSTONE',
    desc: 'TWO HEARTS MORE ON YOUR LIFE BAR' },
  { key: 'runeplate', rank: 3, name: 'RUNE PLATE', short: 'RUNE PLATE',
    desc: 'EVERY BLOW AGAINST YOU TAKES ONE POINT LESS' },
  { key: 'scholarseal', rank: 3, name: 'THE SCHOLARS SEAL', short: 'SEAL',
    desc: 'EVERY KILL PAYS HALF AGAIN THE EXPERIENCE' },
  { key: 'deepquiver', rank: 3, name: 'THE DEEP QUIVER', short: 'QUIVER',
    desc: 'AN ARROW IN THREE COSTS YOU NOTHING' },
  /* four more of the rare */
  { key: 'tidecharm', rank: 2, name: 'TIDE CHARM', short: 'TIDE CHARM',
    desc: 'YOU SWIM A THIRD FASTER' },
  { key: 'windvane', rank: 2, name: 'THE WIND VANE', short: 'WIND VANE',
    desc: 'THE GALE REACHES HALF AGAIN AS FAR' },
  { key: 'coinclasp', rank: 2, name: 'COIN CLASP', short: 'COIN CLASP',
    desc: 'EVERY KILL PAYS A TENTH MORE AGAIN' },
  { key: 'flintnock', rank: 2, name: 'FLINT NOCK', short: 'FLINT NOCK',
    desc: 'AN ARROW BITES HALF AGAIN AS DEEP' }
];
const ARTIFACT_SLOTS = 3;
function artifactBy(key) { for (const a of ARTIFACTS) if (a.key === key) return a; return null; }
/* common, rare, super rare, legendary, mythic: stone, cyan, violet, gold, rose */
const RANK_COL = ['#a89270', '#c9a06a', '#7fc4d8', '#b07ae0', '#f0c93a', '#ff5ad0'];
const RANK_NAME = ['', 'COMMON', 'RARE', 'SUPER RARE', 'LEGENDARY', 'MYTHIC'];
/* what the shop asks for one, by its rank */
const RANK_PRICE = [0, 5000, 20000, 50000, 100000, 250000];

/* ============================================================
   MONEY, WRITTEN SHORT.  A shop row has no room for six noughts,
   so a thousand is 1K and a million is 1MIL.
   ============================================================ */
/* as much of a line as will stand in the room given, and no more */
function fitText(str, room) {
  str = String(str);
  if (textWidth(str) <= room) return str;
  while (str.length > 1 && textWidth(str + '.') > room) str = str.slice(0, -1);
  return str + '.';
}
function shortCoin(n) {
  n = Math.round(n || 0);
  if (n >= 1000000) {
    const m = n / 1000000;
    return (m >= 10 || m === Math.floor(m) ? Math.round(m) : Math.round(m * 10) / 10) + 'MIL';
  }
  if (n >= 1000) {
    const k = n / 1000;
    return (k >= 10 || k === Math.floor(k) ? Math.round(k) : Math.round(k * 10) / 10) + 'K';
  }
  return String(n);
}

/* ============================================================
   RUBIES.  A guardian leaves them, and only the boxes take them.
   The harder the guardian, the more it leaves.
   ============================================================ */
G.rubies = 0;
G.giveRubies = function (n, x, y) {
  n = Math.max(0, Math.round(n));
  if (!n) return;
  G.rubies = (G.rubies | 0) + n;
  if (x !== undefined) G.texts.push(new FloatText(x, y - 26, '+' + n + ' RUBIES', '#ff5a7a'));
  G.banner('+' + n + ' RUBIES', 2.6);
};
/* one ruby for every so much a guardian carries, so the deeper it lies the
   more it leaves: the wyrm of the first realm pays five and the pharaoh of
   the last pays a hundred */
function rubiesFor(maxHp) {
  const lo = 48, hi = 20400;                  /* the wyrm, and the pharaoh */
  const f = clamp((Math.max(0, maxHp) - lo) / (hi - lo), 0, 1);
  /* a curve, not a line, so the middle realms are not all worth the same */
  return clamp(Math.round(5 + Math.pow(f, 0.62) * 95), 5, 100);
}

G.hasArtifact = function (key) {
  const a = G.artifacts;
  return !!(a && a.slots && a.slots.indexOf(key) >= 0);
};
G.ownsArtifact = function (key) { return !!(G.artifacts && G.artifacts.owned[key]); };
G.giveArtifact = function (key) {
  const it = artifactBy(key);
  if (!it || !G.artifacts) return false;
  if (G.artifacts.owned[key]) return false;
  G.artifacts.owned[key] = 1;
  /* a free slot takes it at once, so a find is felt straight away */
  const free = G.artifacts.slots.indexOf(null);
  if (free >= 0) G.artifacts.slots[free] = key;
  G.relicShow = { key: key, name: it.name, desc: it.desc, t: 0, dur: 3.4,
                  icon: () => Art.item.artifact[key] };
  Snd.unlock(); G.flash(0.5);
  G.applyArtifacts();
  G.saveGame();
  return true;
};
/* a low ranked artifact the player has not found yet, or nothing */
G.rollArtifact = function (rank) {
  /* a chest never gives up a mythical thing: those are won, not found */
  const pool = ARTIFACTS.filter(a => a.rank <= (rank || 1) && a.rank < 4 && !G.artifacts.owned[a.key]);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)].key;
};
G.applyArtifacts = function () {
  const p = G.player;
  if (!p) return;
  /* the ankh is the only one that changes a stored number */
  const want = 6 + (p.up.heart || 0) * 2 +
               (G.hasArtifact('ankh') ? 2 : 0) + (G.hasArtifact('sunheart') ? 8 : 0) +
               (G.hasArtifact('heartstone') ? 4 : 0);
  if (p.maxHp !== want) {
    const gain = want - p.maxHp;
    p.maxHp = want;
    p.hp = clamp(p.hp + Math.max(0, gain), 1, p.maxHp);
  }
};
function pouchRect() { return { x: VW - 26, y: 30, w: 22, h: 22 }; }
const POUCH_BOX = { x: 32, y: 12, w: 320, h: 192 };
function pouchSlotRect(i) { return { x: POUCH_BOX.x + 32 + i * 86, y: POUCH_BOX.y + 32, w: 70, h: 54 }; }
/* Eight to a page, in two columns of four.  There are twenty artifacts now,
   and all of them at once ran off the foot of the panel. */
const POUCH_PER_PAGE = 8;
function pouchListRect(i) {
  return { x: POUCH_BOX.x + 12 + (i % 2) * 150, y: POUCH_BOX.y + 96 + Math.floor(i / 2) * 19,
           w: 146, h: 17 };
}
/* the two arrows live up in the header, beside the close button, where the
   footer line cannot reach them */
function pouchPageRect(d) {
  return { x: POUCH_BOX.x + POUCH_BOX.w - (d < 0 ? 94 : 68), y: POUCH_BOX.y + 4, w: 24, h: 16 };
}
function ownedArtifacts() { return ARTIFACTS.filter(a => G.artifacts.owned[a.key]); }
function pouchPages() { return Math.max(1, Math.ceil(ownedArtifacts().length / POUCH_PER_PAGE)); }
function updatePouch(dt) {
  G.pouchT = (G.pouchT || 0) + dt;
  const closeR = { x: POUCH_BOX.x + POUCH_BOX.w - 24, y: POUCH_BOX.y + 4, w: 20, h: 16 };
  G.pouchClose = Input.over(closeR);
  if (Input.tap(closeR) || Input.hit('Escape') || Input.actHit('shop')) {
    G.pouchOpen = false; Snd.ui(); Snd.musicLevel(0.34, 0.4); return;
  }
  G.pouchSel = -1; G.pouchSlotSel = -1;
  const pages = pouchPages();
  G.pouchPage = clamp(G.pouchPage | 0, 0, pages - 1);
  for (const d of [-1, 1]) if (Input.tap(pouchPageRect(d))) {
    G.pouchPage = clamp(G.pouchPage + d, 0, pages - 1); Snd.ui();
  }
  if (Input.hit('ArrowRight')) G.pouchPage = clamp(G.pouchPage + 1, 0, pages - 1);
  if (Input.hit('ArrowLeft')) G.pouchPage = clamp(G.pouchPage - 1, 0, pages - 1);
  for (let i = 0; i < ARTIFACT_SLOTS; i++) if (Input.over(pouchSlotRect(i))) G.pouchSlotSel = i;
  const all = ownedArtifacts();
  const own = all.slice(G.pouchPage * POUCH_PER_PAGE, (G.pouchPage + 1) * POUCH_PER_PAGE);
  for (let i = 0; i < own.length; i++) if (Input.over(pouchListRect(i))) G.pouchSel = i;
  let slotTap = -1, listTap = -1;
  for (let i = 0; i < ARTIFACT_SLOTS; i++) if (Input.tap(pouchSlotRect(i))) slotTap = i;
  for (let i = 0; i < own.length; i++) if (Input.tap(pouchListRect(i))) listTap = i;
  if (slotTap >= 0) { G.pouchSlotSel = slotTap; }
  if (listTap >= 0) { G.pouchSel = listTap; }
  if (slotTap >= 0) {
    /* click a slot to empty it */
    if (G.artifacts.slots[G.pouchSlotSel]) {
      G.artifacts.slots[G.pouchSlotSel] = null;
      Snd.ui(); G.applyArtifacts(); G.saveGame();
    }
  } else if (listTap >= 0) {
    const key = own[listTap].key;
    const at = G.artifacts.slots.indexOf(key);
    if (at >= 0) { G.artifacts.slots[at] = null; Snd.ui(); }
    else {
      let free = G.artifacts.slots.indexOf(null);
      if (free < 0) free = ARTIFACT_SLOTS - 1;      /* the last slot gives way */
      G.artifacts.slots[free] = key;
      Snd.buy();
    }
    G.applyArtifacts(); G.saveGame();
  }
}
function drawPouch() {
  const B = POUCH_BOX;
  ctx.fillStyle = 'rgba(8,6,14,0.72)';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(42,30,18,0.97)';
  ctx.fillRect(B.x, B.y, B.w, B.h);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(B.x, B.y, B.w, 1); ctx.fillRect(B.x, B.y + B.h - 1, B.w, 1);
  ctx.fillRect(B.x, B.y, 1, B.h); ctx.fillRect(B.x + B.w - 1, B.y, 1, B.h);
  drawText(ctx, 'THE POUCH', B.x + 12, B.y + 6, '#ffeec0', 2, 'left', '#2a1a10');
  const closeR = { x: B.x + B.w - 24, y: B.y + 4, w: 20, h: 16 };
  ctx.fillStyle = G.pouchClose ? '#c9403a' : 'rgba(20,14,10,0.8)';
  ctx.fillRect(closeR.x, closeR.y, closeR.w, closeR.h);
  drawText(ctx, 'X', closeR.x + closeR.w / 2, closeR.y + 4, '#ffeec0', 1, 'center');
  drawText(ctx, 'THREE SLOTS. WHAT SITS IN A SLOT WORKS.', B.x + 12, B.y + 22, '#a89270', 1, 'left');

  /* the three slots */
  for (let i = 0; i < ARTIFACT_SLOTS; i++) {
    const r = pouchSlotRect(i);
    const key = G.artifacts.slots[i];
    const hot = G.pouchSlotSel === i;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.9)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = key ? RANK_COL[artifactBy(key).rank] : (hot ? '#ffd04a' : '#6d5a38');
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    if (key) {
      const img = Art.item.artifact[key];
      if (img) {
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2 - 4);
        ctx.scale(2, 2);
        ctx.drawImage(img, -8, -8);
        ctx.restore();
      }
      drawText(ctx, artifactBy(key).short, r.x + r.w / 2, r.y + r.h - 10, '#ffeec0', 1, 'center');
    } else {
      drawText(ctx, 'EMPTY', r.x + r.w / 2, r.y + r.h / 2 - 3, '#6d5a38', 1, 'center');
    }
  }

  /* everything found so far, a page at a time */
  const all = ownedArtifacts();
  const pages = pouchPages();
  const page = clamp(G.pouchPage | 0, 0, pages - 1);
  const own = all.slice(page * POUCH_PER_PAGE, (page + 1) * POUCH_PER_PAGE);
  if (!all.length) {
    drawText(ctx, 'YOU CARRY NOTHING YET. LOOK UNDER THE SAND.',
             B.x + B.w / 2, B.y + 110, '#a89270', 1, 'center');
  }
  own.forEach((a, i) => {
    const r = pouchListRect(i);
    const inSlot = G.artifacts.slots.indexOf(a.key) >= 0;
    const hot = G.pouchSel === i;
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.96)' : 'rgba(24,18,12,0.86)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = inSlot ? '#6fc46a' : RANK_COL[a.rank];
    ctx.fillRect(r.x, r.y, r.w, 1);
    if (Art.item.artifact[a.key]) ctx.drawImage(Art.item.artifact[a.key], r.x + 2, r.y + 1);
    /* the rank is written first, and the name takes what room is left, so
       the two never sit on top of one another */
    const tag = inSlot ? 'WORN' : RANK_NAME[a.rank];
    drawText(ctx, tag, r.x + r.w - 5, r.y + 5, inSlot ? '#9be89a' : RANK_COL[a.rank], 1, 'right');
    drawText(ctx, fitText(a.short, r.w - 30 - textWidth(tag)), r.x + 21, r.y + 5,
             inSlot ? '#9be89a' : '#ebdcb6', 1, 'left');
  });
  if (pages > 1) {
    for (const d of [-1, 1]) {
      const r = pouchPageRect(d), can = d < 0 ? page > 0 : page < pages - 1;
      ctx.fillStyle = can ? 'rgba(58,44,28,0.9)' : 'rgba(34,26,18,0.6)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      drawText(ctx, d < 0 ? '<' : '>', r.x + r.w / 2, r.y + 5, can ? '#ffeec0' : '#5b4a34', 1, 'center');
    }
    drawText(ctx, (page + 1) + '/' + pages, pouchPageRect(1).x + 28, B.y + 9, '#a9b3c9', 1, 'left');
  }

  /* the line at the foot says what the thing under the cursor does */
  let foot = 'CLICK A FIND TO WEAR IT. CLICK A SLOT TO TAKE IT OFF.';
  if (G.pouchSel >= 0 && own[G.pouchSel]) foot = own[G.pouchSel].desc;
  else if (G.pouchSlotSel >= 0 && G.artifacts.slots[G.pouchSlotSel])
    foot = artifactBy(G.artifacts.slots[G.pouchSlotSel]).desc;
  ctx.fillStyle = 'rgba(20,14,10,0.9)';
  ctx.fillRect(B.x + 1, B.y + B.h - 15, B.w - 2, 14);
  drawText(ctx, foot, B.x + B.w / 2, B.y + B.h - 11, '#ffeec0', 1, 'center');
}

/* ============================================================
   THE REALM MAP
   ============================================================ */
/* the picture of a realm: plain, or in the metal of the highest run taken */
function nodeArt(i) {
  const t = buffRank(i);
  const set = t > 0 && Art.map.nodeTint && Art.map.nodeTint[t];
  return (set && set[i]) || Art.map.node[i];
}
function mapNodeRect(i) {
  const n = World.LEVELS[i].node;
  const ch = World.chapterOf(i);
  const x = n.x + ch * VW - G.mapScroll;
  return { x: x - 30, y: n.y - 30, w: 60, h: 60, cx: x, cy: n.y };
}
function chapterUnlocked(ch) {
  if (ch >= World.finalPage()) return false;     /* the archipelago stays shut */
  return World.CHAPTERS[ch].levels[0] < G.unlocked;
}
function gotoChapter(ch, snap) {
  G.chapter = clamp(ch, 0, World.mapPages() - 1);
  if (snap) G.mapScroll = G.chapter * VW;
}
/* the single node on the last page */
function finalNodeRect() {
  const n = World.FINAL.node;
  const x = n.x + World.finalPage() * VW - G.mapScroll;
  return { x: x - 30, y: n.y - 30, w: 60, h: 60, cx: x, cy: n.y };
}
/* the chains that hold the last page shut, in page space */
const FINAL_CHAINS = [
  [-8, 34, VW + 8, 96], [-8, 150, VW + 8, 66], [-8, 96, VW + 8, 156], [-8, 186, VW + 8, 120]
];
function drawChainLine(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const a = Math.atan2(dy, dx);
  const n = Math.max(1, Math.round(len / 7));
  ctx.save();
  ctx.translate(Math.round(x0), Math.round(y0));
  ctx.rotate(a);
  for (let i = 0; i <= n; i++) {
    const img = (i & 1) ? Art.map.chain[1] : Art.map.chain[0];
    ctx.drawImage(img, Math.round(i * len / n - img.width / 2), -Math.round(img.height / 2));
  }
  ctx.restore();
}
function drawFinalPage() {
  const ox = World.finalPage() * VW - G.mapScroll;
  if (ox > VW + 40 || ox < -VW - 40) return;
  const r = finalNodeRect();
  const bob = Math.sin(G.mapT * 1.3) * 1.4;
  if (G.finalSel) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.14 + Math.sin(G.mapT * 5) * 0.05;
    ctx.fillStyle = '#8fd0ff';
    ctx.beginPath(); ctx.arc(r.cx, r.cy + bob, 32, 0, TAU); ctx.fill(); ctx.restore();
  }
  /* the chains cross the page.  Two pass behind the realm and two in front,
     so the chains look wrapped around it. */
  const sagOf = c => Math.sin(G.mapT * 0.9 + c[1] * 0.05) * 1.2;
  /* the chains fall away once the word has been said */
  const bound = !(G.archipelago && G.archipelago.open);
  ctx.save();
  ctx.globalAlpha = bound ? 0.96 : 0.16;
  for (let i = 0; i < 2; i++) {
    const c = FINAL_CHAINS[i], sag = sagOf(c);
    drawChainLine(ox + c[0], c[1] + sag, ox + c[2], c[3] + sag);
  }
  ctx.restore();

  ctx.drawImage(Art.map.archipelago, Math.round(r.x), Math.round(r.y + bob));
  const w = textWidth(World.FINAL.name) + 10;
  ctx.fillStyle = 'rgba(58,44,28,0.86)';
  ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 11);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(Math.round(r.cx - w / 2), Math.round(r.y + 50 + bob), Math.round(w), 1);
  drawText(ctx, World.FINAL.name, r.cx, r.y + 53 + bob, '#cfeaff', 1, 'center');

  ctx.save();
  ctx.globalAlpha = bound ? 0.96 : 0.16;
  for (let i = 2; i < FINAL_CHAINS.length; i++) {
    const c = FINAL_CHAINS[i], sag = sagOf(c);
    drawChainLine(ox + c[0], c[1] + sag, ox + c[2], c[3] + sag);
  }
  for (const c of FINAL_CHAINS) {
    ctx.drawImage(Art.map.ring, Math.round(ox + c[0] - 6), Math.round(c[1] - 6));
    ctx.drawImage(Art.map.ring, Math.round(ox + c[2] - 6), Math.round(c[3] - 6));
  }
  ctx.restore();
  if (!(G.archipelago && G.archipelago.open))
    ctx.drawImage(Art.map.lock, Math.round(r.cx - 8), Math.round(r.cy - 9 + bob));
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
/* under the middle realm of whichever chapter is on the page */
function mapLookRect() {
  const n = World.LEVELS[World.CHAPTERS[0].levels[1]].node;
  return { x: n.x - 30, y: n.y + 46, w: 60, h: 14 };
}
function mapGearRect() { return { x: VW - 30, y: VH - 26, w: 24, h: 22 }; }
/* the four ways to walk a realm: plain, then bronze, silver and gold */
function mapBuffRect(t) { return { x: VW - 128 + t * 24, y: 37, w: 22, h: 14 }; }
/* the item shop, directly under the profile button */
function mapStoreRect() {
  const l = mapLookRect();
  return { x: l.x, y: l.y + 17, w: l.w, h: l.h };
}
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
  /* The codes box covers the chart, and on a phone its keyboard covers all
     of it.  It takes every tap first, so a key never starts a realm. */
  if (G.codesOpen) {
    G.mapSel = -1; G.finalSel = false; G.overArrow = 0;
    G.overMapBack = false; G.overMapGear = false;
    G.overCodeIcon = false; G.overQuestIcon = false; G.overLookIcon = false;
    updateCodes(dt);
    return;
  }

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
  G.finalSel = false;
  if (!G.unlockAnim) for (let i = 0; i < World.LEVELS.length; i++) {
    const r = mapNodeRect(i);
    if (Math.hypot(Input.mx - r.cx, Input.my - r.cy) < 28) G.mapSel = i;
  }
  if (!G.unlockAnim) {
    const fr = finalNodeRect();
    if (Math.hypot(Input.mx - fr.cx, Input.my - fr.cy) < 28) { G.finalSel = true; G.mapSel = -1; }
  }
  /* the paging arrows — kept to the middle band so the corner buttons stay free */
  G.overArrow = 0;
  const inBand = Input.my > 36 && Input.my < VH - 52;
  if (inBand && Input.mx < 26 && G.chapter > 0) G.overArrow = -1;
  else if (inBand && Input.mx > VW - 26 && G.chapter < World.mapPages() - 1) G.overArrow = 1;

  const backR = mapBackRect(), gearR = mapGearRect();
  G.overMapBack = Input.over(backR);
  G.overMapGear = Input.over(gearR);
  if (G.settingsOpen) { updateSettings(); return; }
  if (G.questsOpen) { updateQuests(dt); return; }
  if (Input.tap(gearR)) { G.settingsOpen = true; G.setSel = -1; Snd.ui(); return; }
  if (Input.tap(backR) || Input.hit('Escape')) { G.saveGame(); Snd.ui(); openFiles(); return; }

  /* the tier picker, when a prestige has opened one */
  if ((G.prestige | 0) > 0) for (let t = 0; t <= (G.prestige | 0); t++) {
    if (!Input.tap(mapBuffRect(t))) continue;
    G.buffTier = t; Snd.ui();
    G.banner(t ? ('THE ' + PRESTIGE_NAME[t] + ' RUN') : 'THE PLAIN RUN', 1.8);
    G.saveGame();
    return;
  }
  if (Input.mhit && G.overArrow && !G.unlockAnim) { gotoChapter(G.chapter + G.overArrow); Snd.ui(); }
  else if (Input.mhit && G.finalSel) {
    if (G.archipelago && G.archipelago.open) { Snd.buy(); openArchipelago('pentagon'); return; }
    Snd.uiBad(); G.banner('SEALED - A WORD OPENS IT', 2.2);
  }
  else if (Input.mhit && G.mapSel >= 0) {
    const bt = clamp(G.buffTier | 0, 0, PRESTIGE_MAX);
    if (G.mapSel >= G.unlocked) { Snd.uiBad(); G.banner('CLEAR THE REALM BEFORE IT', 1.8); }
    else if (!buffOpen(bt, G.mapSel)) { Snd.uiBad(); G.banner(buffBar(bt, G.mapSel), 2.4); }
    else { Snd.buy(); G.startLevel(G.mapSel); }
  }
  const cbtn = { x: 6, y: VH - 46, w: 22, h: 22 };
  const qbtn = { x: 32, y: VH - 46, w: 22, h: 22 };
  const lbtn = mapLookRect();
  G.overCodeIcon = Input.over(cbtn);
  G.overQuestIcon = Input.over(qbtn);
  G.overLookIcon = Input.over(lbtn);
  if (G.questsOpen) { updateQuests(dt); return; }
  if (G.tutorialDone && Input.tap(lbtn)) { Snd.ui(); openProfile('map'); return; }
  const sbtn = mapStoreRect();
  G.overStoreIcon = G.tutorialDone && Input.over(sbtn);
  if (G.tutorialDone && Input.tap(sbtn)) { openStore('map'); return; }
  if (Input.tap(qbtn)) { G.questsOpen = true; G.questSel = -1; G.questMsgT = 0; Snd.ui(); return; }
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
      ctx.drawImage(nodeArt(i), -32, -30);
    } else {
      ctx.drawImage(nodeArt(i), Math.round(r.x), Math.round(r.y + bob));
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

  drawFinalPage();

  /* chapter ribbon */
  const last = G.chapter >= World.finalPage();
  const cur = last ? World.FINAL : World.CHAPTERS[G.chapter];
  /* The ribbon is tall enough for both lines: the name stands at twice the
     size and the subtitle sits clear underneath it, not across it. */
  ctx.fillStyle = 'rgba(58,44,28,0.9)';
  ctx.fillRect(50, 3, VW - 100, 30);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(50, 3, VW - 100, 1); ctx.fillRect(50, 32, VW - 100, 1);
  drawText(ctx, last ? 'THE LAST MAP' : cur.name, VW / 2, 6, '#ffeec0', 2, 'center', '#2a1a10');
  drawText(ctx, chapterUnlocked(G.chapter) ? cur.sub : (last ? cur.sub : 'SEALED'), VW / 2, 22,
           chapterUnlocked(G.chapter) ? '#d8c49a' : '#a89270', 1, 'center');
  /* page dots */
  const pages = World.mapPages();
  for (let c = 0; c < pages; c++) {
    ctx.fillStyle = c === G.chapter ? '#ffeec0' : (chapterUnlocked(c) ? '#b8862f' : '#7a6448');
    ctx.fillRect(Math.round(VW / 2 - pages * 4 + c * 8), 36, 5, 3);
  }
  /* paging arrows */
  for (const dir of [-1, 1]) {
    const can = dir < 0 ? G.chapter > 0 : G.chapter < World.mapPages() - 1;
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

  const foot = G.finalSel
    ? (G.archipelago && G.archipelago.open ? 'THE ARCHIPELAGO   -   CLICK TO SAIL'
                                           : 'THE ARCHIPELAGO   -   SEALED')
    : (G.mapSel >= 0
      ? (G.mapSel < G.unlocked ? World.LEVELS[G.mapSel].sub + '   -   CLICK TO ENTER'
                               : 'SEALED   -   CLEAR THE REALM BEFORE IT')
      : 'SCROLL OR ARROWS TO PAGE   -   BACK FOR FILES');
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
  /* the quest roll, beside it */
  {
    const qhov = G.overQuestIcon;
    if (qhov) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffd66a'; ctx.beginPath(); ctx.arc(43, VH - 35, 16, 0, TAU); ctx.fill(); ctx.restore();
    }
    blit(ctx, Art.ui.quests, 43, VH - 35, 5, 5);
    const ready = questsReady() + dailyReady();
    if (ready > 0) {
      ctx.fillStyle = '#6fc46a'; ctx.fillRect(48, VH - 44, 6, 6);
      drawText(ctx, String(Math.min(9, ready)), 50, VH - 43, '#12200e', 1, 'left');
    }
    if (qhov) drawText(ctx, 'QUESTS', 43, VH - 21, '#ffe98a', 1, 'center', '#3a2c1c');
  }
  /* the tier picker, once a prestige has opened one */
  if ((G.prestige | 0) > 0) {
    drawText(ctx, 'THE RUN', mapBuffRect(0).x - 6, 41, '#5a4326', 1, 'right', '#ebdcb6');
    for (let t = 0; t <= PRESTIGE_MAX; t++) {
      const r = mapBuffRect(t), open = t <= (G.prestige | 0);
      const on = (G.buffTier | 0) === t, hot = open && Input.over(r);
      ctx.fillStyle = on ? 'rgba(74,56,34,0.96)' : (hot ? 'rgba(58,44,28,0.9)' : 'rgba(34,26,18,0.78)');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = on ? (t ? PRESTIGE_COL[t] : '#ffd04a') : '#8a6a3a';
      ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      drawText(ctx, t ? PRESTIGE_MARK[t] : '-', r.x + r.w / 2, r.y + 4,
               open ? (t ? PRESTIGE_COL[t] : '#ffeec0') : '#8a7a5e', 1, 'center', '#2a1a10');
    }
  }
  /* and the way back to your own look, under the middle realm */
  if (G.tutorialDone) {
    const lr = mapLookRect(), lh = G.overLookIcon;
    ctx.fillStyle = lh ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
    ctx.fillRect(lr.x, lr.y, lr.w, lr.h);
    ctx.fillStyle = lh ? '#ffd04a' : '#b8862f';
    ctx.fillRect(lr.x, lr.y, lr.w, 1); ctx.fillRect(lr.x, lr.y + lr.h - 1, lr.w, 1);
    ctx.fillRect(lr.x, lr.y, 1, lr.h); ctx.fillRect(lr.x + lr.w - 1, lr.y, 1, lr.h);
    drawText(ctx, 'PROFILE', lr.x + lr.w / 2, lr.y + 4, '#ffeec0', 1, 'center');
    const sr = mapStoreRect(), sh = G.overStoreIcon;
    ctx.fillStyle = sh ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
    ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
    ctx.fillStyle = sh ? '#ffd04a' : '#b8862f';
    ctx.fillRect(sr.x, sr.y, sr.w, 1); ctx.fillRect(sr.x, sr.y + sr.h - 1, sr.w, 1);
    ctx.fillRect(sr.x, sr.y, 1, sr.h); ctx.fillRect(sr.x + sr.w - 1, sr.y, 1, sr.h);
    drawText(ctx, 'SHOP', sr.x + sr.w / 2, sr.y + 4, '#ffeec0', 1, 'center');
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
  if (G.questsOpen) drawQuests();
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
    /* shafts of sun coming down between the trunks */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const bx = ((i * 71 + 30 - camX * 0.30) % (VW + 200)) - 100;
      const sway = Math.sin(G.t * 0.22 + i * 1.4) * 5;
      const g5 = ctx.createLinearGradient(0, 20, 0, VH - 20);
      g5.addColorStop(0, 'rgba(255,244,214,0.14)');
      g5.addColorStop(0.7, 'rgba(255,236,192,0.05)');
      g5.addColorStop(1, 'rgba(255,236,192,0)');
      ctx.fillStyle = g5;
      ctx.beginPath();
      ctx.moveTo(bx - 7 + sway, 18);
      ctx.lineTo(bx + 7 + sway, 18);
      ctx.lineTo(bx + 30 - sway, VH);
      ctx.lineTo(bx + 6 - sway, VH);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    /* mist lying in the folds of the hills */
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const my = VH - 96 - i * 13 - camY * (0.18 + i * 0.04);
      const mx = ((G.t * (3 + i) + i * 121 - camX * 0.22) % (VW + 200)) - 100;
      ctx.globalAlpha = 0.10 + i * 0.025;
      ctx.fillStyle = '#e4f0f2';
      for (let k = 0; k < 3; k++) {
        const w2 = 120 + k * 40;
        ctx.beginPath();
        ctx.ellipse(mx + k * 150, my + Math.sin(G.t * 0.3 + k + i) * 2, w2, 5 + i, 0, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    /* birds crossing the far sky */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#3c4f74';
    for (let i = 0; i < 5; i++) {
      const bx = ((G.t * (7 + i * 2) + i * 97) % (VW + 60)) - 30 - camX * 0.02;
      const by = 24 + (i % 3) * 11 + Math.sin(G.t * 0.9 + i) * 2 - camY * 0.02;
      const flap = Math.sin(G.t * 7 + i * 2) > 0 ? 1 : 2;
      ctx.fillRect(Math.round(bx), Math.round(by), 1, 1);
      ctx.fillRect(Math.round(bx - 2), Math.round(by - flap), 2, 1);
      ctx.fillRect(Math.round(bx + 1), Math.round(by - flap), 2, 1);
    }
    ctx.restore();
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
    /* the ruin standing far off in the murk */
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = '#0b2438';
    for (let i = 0; i < 5; i++) {
      const rx = ((i * 121 - camX * 0.07) % (VW + 240)) - 120;
      const rh = 60 + (i % 3) * 26;
      ctx.fillRect(Math.round(rx), VH - rh - camY * 0.05, 16, rh);
      ctx.fillRect(Math.round(rx - 4), VH - rh - 5 - camY * 0.05, 24, 5);
      if (i % 2 === 0) {
        ctx.fillRect(Math.round(rx + 26), VH - rh * 0.6 - camY * 0.05, 12, rh * 0.6);
        ctx.fillRect(Math.round(rx + 22), VH - rh * 0.6 - 4 - camY * 0.05, 20, 4);
      }
    }
    ctx.restore();
    /* shafts of light from far above */
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(G.t * 0.3 + i * 1.7) * 6;
      const x = ((i * 111 - camX * 0.1) % (VW + 140)) - 70;
      const g6 = ctx.createLinearGradient(0, 0, 0, VH);
      g6.addColorStop(0, 'rgba(207,234,255,0.14)');
      g6.addColorStop(0.6, 'rgba(143,208,255,0.05)');
      g6.addColorStop(1, 'rgba(143,208,255,0)');
      ctx.fillStyle = g6;
      ctx.beginPath();
      ctx.moveTo(x - 9 + sway, 0); ctx.lineTo(x + 9 + sway, 0);
      ctx.lineTo(x + 34 - sway, VH); ctx.lineTo(x + 4 - sway, VH);
      ctx.closePath(); ctx.fill();
    }
    /* caustics: the net of light the surface throws on everything below */
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#cfeaff';
    for (let y = 0; y < VH; y += 6) {
      const w2 = 5 + Math.sin(y * 0.14 + G.t * 1.1) * 4;
      for (let x = -20; x < VW + 20; x += 22) {
        const ox = Math.sin((x + y) * 0.05 + G.t * 0.8) * 9 - camX * 0.05;
        ctx.fillRect(Math.round(x + ox), y, Math.max(1, Math.round(w2)), 2);
      }
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
    /* the mountain that is still burning, far off */
    ctx.save();
    const vx = 280 - camX * 0.045, vb = VH - 34 - camY * 0.05;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1b0b10';
    ctx.beginPath();
    ctx.moveTo(vx, vb - 74); ctx.lineTo(vx - 62, vb); ctx.lineTo(vx + 62, vb);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a1608';
    ctx.beginPath();
    ctx.moveTo(vx, vb - 74); ctx.lineTo(vx - 13, vb - 44); ctx.lineTo(vx + 13, vb - 44);
    ctx.closePath(); ctx.fill();
    /* the plume standing over it */
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#3a2028';
    for (let k = 0; k < 7; k++) {
      const py = vb - 80 - k * 12;
      const px = vx + Math.sin(G.t * 0.18 + k * 0.8) * (4 + k * 2.4);
      ctx.beginPath();
      ctx.ellipse(px, py, 12 + k * 5, 7 + k * 2.6, 0, 0, TAU);
      ctx.fill();
    }
    /* the lava running down its side */
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff7a2a';
    for (let k = 0; k < 3; k++) {
      const t2 = (G.t * 0.15 + k * 0.33) % 1;
      const lx = vx + (k - 1) * 9 + Math.sin(t2 * 6 + k) * 4;
      ctx.fillRect(Math.round(lx), Math.round(vb - 70 + t2 * 66), 1, 8);
    }
    ctx.restore();
    /* heat shivering over the ground */
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ff9a4a';
    for (let y = VH - 60; y < VH; y += 4) {
      const ox = Math.sin(y * 0.4 + G.t * 3.2) * 3;
      ctx.fillRect(Math.round(ox), y, VW, 2);
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
  } else if (room.bg === 'snow') {
    ctx.drawImage(makeSky('white', [[0, '#2f4468'], [0.30, '#5f7aa8'], [0.62, '#9fb4d0'], [1, '#dfe8f4']]), 0, 0);
    /* the aurora, standing over the whole sky */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ph = G.t * 0.24 + i * 1.3;
      ctx.globalAlpha = 0.07 + Math.sin(ph) * 0.03;
      ctx.fillStyle = ['#6fd0a0', '#8fd0e8', '#a86fe0', '#6fd0a0', '#cfeaff'][i];
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      for (let x = -20; x <= VW + 20; x += 8)
        ctx.lineTo(x, 24 + i * 9 + Math.sin(x * 0.02 + ph) * 12 + Math.sin(x * 0.007 - ph) * 8);
      for (let x = VW + 20; x >= -20; x -= 8)
        ctx.lineTo(x, 4 + i * 9 + Math.sin(x * 0.02 + ph) * 12);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    /* a cold moon */
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#eef4fb';
    ctx.beginPath(); ctx.arc(300 - camX * 0.02, 36 - camY * 0.02, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c3cfe2';
    ctx.beginPath(); ctx.arc(303 - camX * 0.02, 33 - camY * 0.02, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(297 - camX * 0.02, 40 - camY * 0.02, 2, 0, TAU); ctx.fill();
    ctx.restore();
    /* three ridges of white mountain */
    for (let L = 0; L < 3; L++) {
      const par = 0.06 + L * 0.09, base = VH - 116 + L * 22;
      ctx.fillStyle = ['#6b7c9c', '#8fa0bc', '#c3cfe2'][L];
      ctx.beginPath(); ctx.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 3) {
        const u = (x + camX * par) * (0.012 + L * 0.004);
        ctx.lineTo(x, Math.round(base - Math.sin(u) * (26 - L * 6) - Math.sin(u * 2.7) * (9 - L * 2) - camY * par));
      }
      ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill();
      /* the snow cap catching the light */
      ctx.fillStyle = '#f2f7fd';
      for (let x = 0; x <= VW; x += 3) {
        const u = (x + camX * par) * (0.012 + L * 0.004);
        const y = base - Math.sin(u) * (26 - L * 6) - Math.sin(u * 2.7) * (9 - L * 2) - camY * par;
        if (Math.sin(u) > 0.5) ctx.fillRect(x, Math.round(y), 3, 3);
      }
    }
    /* the snow that is still falling */
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const sx = (i * 83 + Math.sin(G.t * 0.5 + i) * 22 - camX * 0.2) % (VW + 40) - 20;
      const sy = ((i * 41 + G.t * (10 + (i % 5) * 7)) % (VH + 40) + VH + 40) % (VH + 40) - 20 - camY * 0.15;
      ctx.globalAlpha = 0.3 + (i % 3) * 0.2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(sx), Math.round(sy), 1, (i % 4) === 0 ? 2 : 1);
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = '#dfe8f4';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  } else if (room.bg === 'waste') {
    ctx.drawImage(makeSky('waste', [[0, '#3f4a86'], [0.24, '#a8664a'], [0.52, '#e0904a'],
                                    [0.78, '#f0c070'], [1, '#f6dca0']]), 0, 0);
    /* a low sun, huge on the horizon */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sy2 = VH - 86 - camY * 0.02;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffd06a';
    ctx.beginPath(); ctx.arc(120 - camX * 0.02, sy2, 44, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#ffe6a8';
    ctx.beginPath(); ctx.arc(120 - camX * 0.02, sy2, 20, 0, TAU); ctx.fill();
    ctx.restore();
    /* the dunes, rolling away */
    for (let L = 0; L < 3; L++) {
      const par = 0.05 + L * 0.10, base = VH - 96 + L * 26;
      ctx.fillStyle = ['#a4713f', '#c08c4e', '#dcb06a'][L];
      ctx.beginPath(); ctx.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 3) {
        const u = (x + camX * par) * (0.009 + L * 0.004);
        ctx.lineTo(x, Math.round(base - Math.sin(u) * (18 - L * 3) - Math.sin(u * 2.1 + 1) * (8 - L)
                                 - camY * par));
      }
      ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill();
    }
    /* the pyramids on the far skyline */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#8a5f38';
    for (const [px, ph2] of [[250, 46], [292, 30], [214, 26]]) {
      const x = px - camX * 0.045;
      const b = VH - 92 - camY * 0.04;
      ctx.beginPath();
      ctx.moveTo(x, b - ph2); ctx.lineTo(x - ph2 * 0.85, b); ctx.lineTo(x + ph2 * 0.85, b);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#a4713f';
      ctx.beginPath();
      ctx.moveTo(x, b - ph2); ctx.lineTo(x, b); ctx.lineTo(x + ph2 * 0.85, b);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a5f38';
    }
    ctx.restore();
    /* the sand the wind is carrying */
    ctx.save();
    for (let i = 0; i < 46; i++) {
      const sx = ((i * 67 - G.t * (30 + (i % 5) * 16) - camX * 0.3) % (VW + 40) + VW + 40) % (VW + 40) - 20;
      const sy = (i * 53 + Math.sin(G.t * 0.8 + i) * 9) % (VH + 20) - 10 - camY * 0.2;
      ctx.globalAlpha = 0.18 + (i % 3) * 0.1;
      ctx.fillStyle = (i % 4 === 0) ? '#f6dca0' : '#dcb06a';
      ctx.fillRect(Math.round(sx), Math.round(sy), (i % 3) + 1, 1);
    }
    ctx.restore();
    /* the shimmer over hot ground */
    ctx.save();
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#ffe6a8';
    for (let y = VH - 70; y < VH; y += 4)
      ctx.fillRect(Math.round(Math.sin(y * 0.4 + G.t * 2.6) * 3), y, VW, 2);
    ctx.restore();
  } else if (room.bg === 'tomb') {
    ctx.drawImage(makeSky('tomb', [[0, '#150f0a'], [0.5, '#241a10'], [1, '#38281a']]), 0, 0);
    drawCaveWall(camX, camY, 0.42);
    /* painted courses on the far wall */
    ctx.save();
    ctx.globalAlpha = 0.2;
    for (let y = 20; y < VH; y += 34) {
      ctx.fillStyle = '#9c7418';
      ctx.fillRect(0, Math.round(y - camY * 0.4 % 34), VW, 2);
      ctx.fillStyle = '#2f5fb0';
      for (let x = -20; x < VW + 20; x += 18)
        ctx.fillRect(Math.round(x - camX * 0.4 % 18), Math.round(y + 5 - camY * 0.4 % 34), 8, 8);
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
      case T_SNOW: img = Art.tile.snow[v]; break;
      case T_SNOWTOP: img = Art.tile.snowTop[v]; break;
      case T_ICE: img = Art.tile.ice[v]; break;
      case T_SANDTOP: img = Art.tile.sandTop[v]; break;
      case T_TOMB: img = Art.tile.tomb[v]; break;
      case T_TOMBTOP: img = Art.tile.tombTop[v]; break;
      case T_POWDER: img = Art.tile.powder[Math.floor(G.t / 0.22) % 6]; break;
      case T_QUICK: img = Art.tile.quick[Math.floor(G.t / 0.13) % 8]; break;
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
/* One sprite out of a set.  A room may name an index the set does not have:
   an island picks one of three where only two were ever drawn.  A missing
   prop must never take the whole frame down, so the nearest one stands in. */
const NO_PROP = { c: null, ax: 0, ay: 0 };
function propAt(set, idx) {
  if (!set) return NO_PROP;
  if (!Array.isArray(set)) return set || NO_PROP;
  if (!set.length) return NO_PROP;
  return set[clamp(idx | 0, 0, set.length - 1)] || NO_PROP;
}
/* The arc a drawn arrow would take.  It is walked forward with the same
   numbers the arrow itself uses, so the dots are where it will really go,
   and it stops at the first rock in the way. */
function drawBowArc(c2) {
  const p = G.player;
  if (!p || p.dead || !p.bowReady || p.chargeT <= 0.12) return;
  const a = G.aim(p.cx, p.cy - 6);
  const pull = clamp(p.chargeT / CHARGE_FULL, 0.35, 1);
  const sp = ARROW_SPEED * (0.55 + pull * 0.45);
  let x = p.cx + a.x * 8, y = p.cy - 6 + a.y * 8;
  let vx = a.x * sp, vy = a.y * sp - 0.8;
  c2.save();
  for (let i = 0; i < 90; i++) {
    x += vx; y += vy; vy += ARROW_GRAV;
    if (G.room.solidPx(x, y)) break;
    if (i % 3) continue;
    const k = 1 - i / 90;
    c2.globalAlpha = 0.25 + k * 0.55;
    c2.fillStyle = pull >= 0.99 ? '#ffeec0' : '#cfd8e6';
    const r = i < 6 ? 2 : 1;
    c2.fillRect(Math.round(x) - (r > 1 ? 1 : 0), Math.round(y) - (r > 1 ? 1 : 0), r, r);
  }
  c2.restore();
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
        const t = propAt(Art.prop.trees, d.idx);
        blitSway(ctx, t.c, d.x, d.y, d.sway, wind * 0.6 + d.phase, t.ax, t.ay, 10, d.scale || 1, d.alpha);
        break;
      }
      case 'giant': {
        const t = propAt(Art.prop.giant, d.idx);
        blitSway(ctx, t.c, d.x, d.y, d.sway, wind * 0.45 + d.phase, t.ax, t.ay, 18, d.scale || 1, d.alpha);
        break;
      }
      case 'fern': { const s = propAt(Art.prop.fern, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.1 + d.phase, s.ax, s.ay, 6, 1, d.alpha); break; }
      case 'pine': { const s = propAt(Art.prop.pine, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway * 0.6, wind * 0.5 + d.phase, s.ax, s.ay, 10, d.scale || 1, d.alpha); break; }
      case 'cactus': { const s = propAt(Art.prop.cactus, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'palm': { const s = Art.prop.palm[d.idx || 0]; blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 0.5 + d.phase, s.ax, s.ay, 10); break; }
      case 'house': { const s = propAt(Art.prop.house, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'tumbleweed': {
        const s = propAt(Art.prop.tumbleweed, d.idx);
        /* it rolls, and it turns as it rolls */
        const span = 240;
        const roll = ((G.t * (d.drift || 18) + d.phase * 40) % span);
        const tx = d.x - span / 2 + roll;
        const hop = Math.abs(Math.sin(roll * 0.09)) * 5;
        ctx.save();
        ctx.translate(Math.round(tx), Math.round(d.y - 10 - hop));
        ctx.rotate(roll * 0.11);
        ctx.drawImage(s.c, -10, -10);
        ctx.restore();
        break;
      }
      case 'trestle': {
        /* the timber that carries a mesa bridge over its gorge */
        const x0 = Math.round(d.x), y0 = Math.round(d.y), w = d.w, h = d.h;
        ctx.save();
        ctx.fillStyle = '#4a3220';
        for (let bx = x0 + 6; bx < x0 + w - 4; bx += 22) {
          ctx.fillRect(bx, y0, 4, h);
          ctx.fillRect(bx + 14, y0, 4, h);
          /* the cross bracing */
          ctx.save();
          ctx.strokeStyle = '#5c3c22';
          ctx.lineWidth = 2;
          for (let by = y0 + 10; by < y0 + h - 8; by += 22) {
            ctx.beginPath();
            ctx.moveTo(bx + 2, by); ctx.lineTo(bx + 16, by + 20);
            ctx.moveTo(bx + 16, by); ctx.lineTo(bx + 2, by + 20);
            ctx.stroke();
            ctx.fillRect(bx, by + 20, 18, 3);
          }
          ctx.restore();
        }
        /* the handrail along the deck */
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(x0, y0 - 13, w, 3);
        for (let bx = x0; bx < x0 + w; bx += 12) ctx.fillRect(bx, y0 - 13, 3, 13);
        ctx.restore();
        break;
      }
      case 'bone': { const s = propAt(Art.prop.bone, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'sphinx': {
        const s = Art.prop.sphinx;
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        /* the eyes hold a light while the question stands unanswered */
        if (!G.flags.riddleDone) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.5 + Math.sin(G.t * 2.4) * 0.2;
          ctx.fillStyle = '#ffd06a';
          ctx.fillRect(Math.round(d.x + 8), Math.round(d.y - 27), 3, 2);
          ctx.fillRect(Math.round(d.x + 14), Math.round(d.y - 27), 3, 2);
          ctx.restore();
        }
        break;
      }
      case 'nest': {
        const s = propAt(Art.prop.nest, d.idx);
        blit(ctx, s.c, d.x, d.y, s.ax, s.ay);
        if (d.bird) {
          /* the bird sits on the rim and shuffles its wings now and then */
          const f = Art.bird.fly[Math.floor((G.t * 2 + d.phase) % 1 < 0.16
                                            ? (G.t * 14) % Art.bird.fly.length : 0)];
          blit(ctx, f, d.x + 1, d.y - 8, Art.bird.anchor.x, Art.bird.anchor.y, (d.idx & 1) === 1);
        }
        break;
      }
      case 'bush': { const s = propAt(Art.prop.bush, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind + d.phase, s.ax, s.ay, 5); break; }
      case 'tuft': { const s = propAt(Art.prop.tuft, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.3 + d.phase, s.ax, s.ay, 5); break; }
      case 'flower': { const s = propAt(Art.prop.flower, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.2 + d.phase, s.ax, s.ay, 6); break; }
      case 'reed': { const s = propAt(Art.prop.reed, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 1.5 + d.phase, s.ax, s.ay, 7); break; }
      case 'mushroom': { const s = propAt(Art.prop.mushroom, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'rock': { const s = propAt(Art.prop.rock, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'stal': { const s = propAt(Art.prop.stal, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'crystal': {
        const s = propAt(Art.prop.crystal, d.idx);
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
      case 'column': { const s = propAt(Art.prop.column, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
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
        const c = propAt(Art.prop.puff, d.idx);
        const dx = Math.sin(G.t * 0.12 + d.phase) * d.drift * 4;
        ctx.save(); ctx.globalAlpha = d.layer === 2 ? 0.5 : 0.75;
        ctx.drawImage(c, Math.round(d.x - 32 + dx), Math.round(d.y - 15));
        ctx.restore();
        break;
      }
      case 'coral': { const s = propAt(Art.prop.coral, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 0.5 + d.phase, s.ax, s.ay, 6); break; }
      case 'kelp': { const s = propAt(Art.prop.kelp, d.idx); blitSway(ctx, s.c, d.x, d.y, d.sway * 2.4, wind * 0.9 + d.phase, s.ax, s.ay, 8); break; }
      case 'pillar': { const s = propAt(Art.prop.pillar, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'shroom': {
        const s = propAt(Art.prop.shroom, d.idx);
        blitSway(ctx, s.c, d.x, d.y, d.sway, wind * 0.7 + d.phase, s.ax, s.ay, 8, 1, d.layer === 2 ? 0.92 : 1);
        break;
      }
      case 'rail': { const s = Art.prop.rail; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'cart': { const s = Art.prop.cart; blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
      case 'ore': { const s = propAt(Art.prop.ore, d.idx); blit(ctx, s.c, d.x, d.y, s.ax, s.ay); break; }
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
/* One crescent of a sword swing: a bright leading edge, a body that tapers,
   and a soft ghost behind it. */
function slashArc(c2, cx, cy, baseAng, face, from, to, k, R, cols, width) {
  const lead = lerp(from, to, k);
  const span = 1.55;
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    const a = lead - t * span;
    const r = R * (1 - t * 0.22);
    let ax = Math.cos(a) * r, ay = Math.sin(a) * r;
    if (baseAng) {
      const ca = Math.cos(baseAng), sa = Math.sin(baseAng);
      const rx = ax * ca - ay * sa, ry = ax * sa + ay * ca;
      ax = rx; ay = ry;
    } else ax *= face;
    const w = Math.max(1, Math.round(width * (1 - t) * (1 - t * 0.3)));
    c2.globalAlpha = (1 - k) * (1 - t * 0.75) * 0.98;
    c2.fillStyle = t < 0.12 ? cols[0] : (t < 0.4 ? cols[1] : cols[2]);
    c2.fillRect(Math.round(cx + ax - w / 2), Math.round(cy + ay - w / 2), w, w);
  }
  /* the spark that runs ahead of the edge */
  let tx = Math.cos(lead) * (R + 2), ty = Math.sin(lead) * (R + 2);
  if (baseAng) {
    const ca = Math.cos(baseAng), sa = Math.sin(baseAng);
    const rx = tx * ca - ty * sa, ry = tx * sa + ty * ca;
    tx = rx; ty = ry;
  } else tx *= face;
  c2.globalAlpha = (1 - k) * 0.9;
  c2.fillStyle = '#ffffff';
  c2.fillRect(Math.round(cx + tx) - 1, Math.round(cy + ty) - 1, 3, 3);
}
function drawSlash(c2, p) {
  const top = G.room.mode === 'top';
  const baseAng = top ? [Math.PI / 2, Math.PI, -Math.PI / 2, 0][p.topDir] : 0;
  const cx = p.cx, cy = top ? p.cy : p.y + 5;
  const R = 19 + p.up.sword * 2;
  if (p.flurryT > 0) {
    /* two cuts crossing, the second a beat behind the first */
    c2.save();
    const k1 = clamp(p.flurryT / 0.20, 0, 1);
    const k2 = clamp((p.flurryT - 0.09) / 0.20, 0, 1);
    if (k1 < 1) slashArc(c2, cx, cy - 3, baseAng, p.face, -2.1, 0.9, k1, R + 6,
                         ['#ffffff', '#dff0ff', '#8fd0ff'], 4);
    if (k2 > 0 && k2 < 1) slashArc(c2, cx, cy + 4, baseAng, p.face, 1.0, -1.9, k2, R + 4,
                                   ['#ffffff', '#ffeec0', '#c68e3f'], 4);
    c2.restore();
    return;
  }
  if (p.atkT <= 0) return;
  const k = clamp((p.atkT - 0.05) / 0.20, 0, 1);
  if (k <= 0 || k >= 1) return;
  c2.save();
  slashArc(c2, cx, cy, baseAng, p.face, -1.9, 0.8, k, R,
           ['#ffffff', '#dcefff', '#9dc4f0'], 3);
  c2.restore();
}

/* ---------- lighting ---------- */
let lightCv = null, lightCtx = null;
const LW = VW >> 1, LH = VH >> 1;
/* The forest giants throw a deep shade.  A separate layer darkens the ground
   under each crown and lets a few flecks of sun through the leaves. */
let shadeCv = null, shadeCtx = null;
/* The blanket of fresh snow, drawn over the ground it lies on.  Where a boot
   has been the blanket is gone, and the track fills in again behind you. */
function drawSnow(camX, camY) {
  const room = G.room;
  if (!room.snow) return;
  const step = SNOW_STEP;
  const i0 = Math.max(0, Math.floor(camX / step) - 1);
  const i1 = Math.min(room.snow.length - 1, Math.ceil((camX + VW) / step) + 1);
  for (let i = i0; i <= i1; i++) {
    const d = room.snow[i];
    if (d <= 0.15) continue;
    const gy = room.snowGY[i];
    if (gy < 0) continue;
    const h = Math.max(1, Math.round(d));
    const x = i * step;
    ctx.fillStyle = '#e8eef8';
    ctx.fillRect(x, Math.round(gy - h), step, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, Math.round(gy - h), step, 1);
    /* the shadowed lip where a track has been cut */
    const left = i > 0 ? room.snow[i - 1] : d;
    const right = i < room.snow.length - 1 ? room.snow[i + 1] : d;
    if (left < d - 1.2) { ctx.fillStyle = '#aebdd2'; ctx.fillRect(x, Math.round(gy - h), 1, h); }
    if (right < d - 1.2) { ctx.fillStyle = '#aebdd2'; ctx.fillRect(x + step - 1, Math.round(gy - h), 1, h); }
  }
}
function drawCanopyShade(camX, camY) {
  const room = G.room;
  if (!room.canopy) return;
  if (!shadeCv) { shadeCv = mkc(LW, LH); shadeCtx = shadeCv.getContext('2d'); }
  const sc = shadeCtx;
  sc.globalCompositeOperation = 'source-over';
  sc.clearRect(0, 0, LW, LH);
  let any = false;
  for (const d of room.decor) {
    if (d.kind !== 'giant') continue;
    const x = (d.x - camX) / 2, y = (d.y - 34 * (d.scale || 1) - camY) / 2;
    const r = 78 * (d.scale || 1);
    if (x < -r || x > LW + r || y < -r * 2 || y > LH + r * 2) continue;
    any = true;
    const g2 = sc.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, 'rgba(8,20,13,0.66)');
    g2.addColorStop(0.55, 'rgba(8,20,13,0.46)');
    g2.addColorStop(1, 'rgba(8,20,13,0)');
    sc.fillStyle = g2;
    sc.beginPath(); sc.arc(x, y, r, 0, TAU); sc.fill();
  }
  if (!any) return;
  /* sun flecks through the leaves, drifting with the wind */
  sc.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 26; k++) {
    const fx = ((k * 61.7 + Math.sin(G.t * 0.4 + k) * 9 - camX * 0.5) % (LW + 40)) - 20;
    const fy = ((k * 37.3 + Math.cos(G.t * 0.33 + k * 1.7) * 7 - camY * 0.5) % (LH + 40)) - 20;
    const rr2 = 5 + (k % 4);
    const g3 = sc.createRadialGradient(fx, fy, 0, fx, fy, rr2);
    g3.addColorStop(0, 'rgba(0,0,0,0.85)');
    g3.addColorStop(1, 'rgba(0,0,0,0)');
    sc.fillStyle = g3;
    sc.beginPath(); sc.arc(fx, fy, rr2, 0, TAU); sc.fill();
  }
  sc.globalCompositeOperation = 'source-over';
  ctx.drawImage(shadeCv, 0, 0, VW, VH);
}
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
  drawWindows(camX, camY);
  drawSnow(camX, camY);
  drawSurfacing(camX, camY);
  drawGate(camX, camY);
  drawDecor(1, camX, camY);
  for (const L of G.lifts) L.draw(ctx);
  for (const hz of G.hazards) hz.draw(ctx);
  for (const c of G.coins) c.draw(ctx);
  for (const it of G.items) it.draw(ctx);
  for (const e of G.enemies) e.draw(ctx);
  if (!(G.surfacing && G.surfacing.t < 1.7)) {
    G.player.draw(ctx);
    drawSlash(ctx, G.player);
  }
  drawBowArc(ctx);
  for (const pr of G.projectiles) pr.draw(ctx);
  for (const wv of G.waves) wv.draw(ctx);
  for (const pa of G.particles) pa.draw(ctx);
  for (const tx of G.texts) tx.draw(ctx);
  drawDecor(2, camX, camY);
  ctx.restore();
  drawAcid(camX, camY);
  drawCanopyShade(camX, camY);
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
  if (G.pouchOpen) drawPouch();
  if (G.riddleOpen) drawRiddle();
  else if (G.sphinxBtn) {
    const b = G.sphinxBtn;
    ctx.fillStyle = 'rgba(38,28,16,0.92)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#e0b040';
    ctx.fillRect(b.x, b.y, b.w, 1); ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
    drawText(ctx, G.mobile ? 'TAP TO BE ASKED' : 'CLICK TO BE ASKED',
             b.x + b.w / 2, b.y + 4, '#ffeec0', 1, 'center');
  }
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
  /* the pouch, under the chart */
  if (G.roomId !== 'tutorial') {
    const ph = G.overPouchIcon;
    const pb = ph ? Math.sin(G.t * 6) * 1.2 : 0;
    if (ph) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#e0b040';
      ctx.beginPath(); ctx.arc(VW - 15, 41, 15, 0, TAU); ctx.fill(); ctx.restore();
    }
    blit(ctx, Art.ui.pouch, VW - 15, 41 + pb, 11, 11);
    const worn = G.artifacts ? G.artifacts.slots.filter(k => k).length : 0;
    if (worn > 0) {
      ctx.fillStyle = '#e0b040'; ctx.fillRect(VW - 9, 32, 6, 6);
      drawText(ctx, String(worn), VW - 7, 33, '#2a1a0e', 1, 'left');
    }
    if (ph) drawText(ctx, 'POUCH', VW - 15, 55, '#ffe98a', 1, 'center', '#000000');
  }

  /* hearts */
  const hearts = Math.ceil(p.maxHp / 2);
  for (let i = 0; i < hearts; i++) {
    const v = p.hp - i * 2;
    const img = v >= 2 ? Art.item.heart.full : (v === 1 ? Art.item.heart.half : Art.item.heart.empty);
    ctx.drawImage(img, 32 + i * 12, 5);
  }
  /* fire climbs off the hearts while you burn */
  if (p.burnT > 0) {
    const lit = Math.max(1, Math.ceil(p.hp / 2));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < lit; i++) {
      const hx = 32 + i * 12 + 6;
      for (let k = 0; k < 3; k++) {
        const ph = G.t * 9 + i * 1.7 + k * 2.1;
        const rise = (ph % 1);
        const fy = 12 - rise * 11;
        const fx = hx + Math.sin(ph * 2.6) * 3;
        ctx.globalAlpha = (1 - rise) * 0.85;
        ctx.fillStyle = rise < 0.35 ? '#fff0b0' : (rise < 0.7 ? '#ffd06a' : '#ff7a2a');
        const sz = Math.max(1, Math.round(3 - rise * 2));
        ctx.fillRect(Math.round(fx), Math.round(fy), sz, sz);
      }
    }
    ctx.restore();
    /* and a strip that says how long the fire has left */
    const bw = hearts * 12 - 2;
    ctx.fillStyle = '#12101c'; ctx.fillRect(31, 14, bw + 2, 3);
    ctx.fillStyle = '#ff7a2a';
    ctx.fillRect(32, 15, Math.round(bw * clamp(p.burnT / 6, 0, 1)), 1);
  }
  /* coins */
  ctx.drawImage(Art.item.coin[Math.floor(G.t / 0.09) % 8], 32, 17);
  drawText(ctx, G.purse(), 46, 19, G.codes.admin ? '#ffeec0' : '#ffe98a', G.codes.admin ? 2 : 1, 'left', '#000000');
  /* The rank, beside the purse: the mark of a prestige, the level, and a
     thin bar that fills as you fight. */
  {
    const n = G.level0();
    const rx = VW - 96, ry = 6;
    ctx.fillStyle = 'rgba(10,8,18,0.55)'; ctx.fillRect(rx - 4, ry - 3, 46, 15);
    drawRank(ctx, rx, ry, 1, 'left');
    ctx.fillStyle = '#12101c'; ctx.fillRect(rx - 2, ry + 8, 42, 3);
    ctx.fillStyle = rankColour(n);
    ctx.fillRect(rx - 2, ry + 8, Math.round(42 * G.levelFrac()), 3);
    /* what you just took, for a moment after you take it */
    if (G.xpGainT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, G.xpGainT);
      drawText(ctx, '+' + G.xpGain, rx + 44, ry, '#8fd0e8', 1, 'left', '#000000');
      ctx.restore();
    }
  }
  /* the quiver, when you carry a bow, and the boosters while they run */
  if (G.hasArtifact('bow')) {
    const qx = VW - 96, qy = 20;
    ctx.fillStyle = 'rgba(10,8,18,0.55)'; ctx.fillRect(qx - 4, qy - 2, 46, 11);
    ctx.save();
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(qx, qy + 3, 8, 1);
    ctx.fillStyle = '#cfd8e6'; ctx.fillRect(qx + 8, qy + 2, 3, 3);
    ctx.restore();
    drawText(ctx, String(G.arrows | 0), qx + 14, qy, (G.arrows | 0) > 0 ? '#e8dcc0' : '#c9403a', 1, 'left');
  }
  {
    const bits = [];
    if (G.boostLeft('xp') > 0) bits.push('2X XP ' + Math.ceil(G.boostLeft('xp') / 60) + 'M');
    if (G.boostLeft('coin') > 0) bits.push('2X COIN ' + Math.ceil(G.boostLeft('coin') / 60) + 'M');
    if (bits.length) drawText(ctx, bits.join('  '), VW - 30, 34, '#9be89a', 1, 'right', '#000000');
  }
  /* and the button that gives it all back, once the hundredth is passed */
  if (G.canPrestige()) {
    const r = prestigeBtnRect(), hot = Input.over(r);
    const pulse = 0.5 + Math.sin(G.t * 4) * 0.5;
    ctx.fillStyle = hot ? '#6a4a1c' : 'rgba(48,34,14,0.92)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.save(); ctx.globalAlpha = 0.4 + pulse * 0.6;
    ctx.fillStyle = PRESTIGE_COL[Math.min(PRESTIGE_MAX, (G.prestige | 0) + 1)];
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    ctx.restore();
    drawText(ctx, 'PRESTIGE ' + PRESTIGE_MARK[(G.prestige | 0) + 1],
             r.x + r.w / 2, r.y + 5, '#ffeec0', 1, 'center', '#2a1a10');
  }
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
  if (p.chargeT > 0.16) {
    const cf = clamp(p.chargeT / CHARGE_FULL, 0, 1);
    const full = cf >= 1;
    ctx.fillStyle = '#12101c'; ctx.fillRect(dx - 1, stack - 1, dw + 2, 5);
    ctx.fillStyle = '#2b2740'; ctx.fillRect(dx, stack, dw, 3);
    ctx.fillStyle = full ? (Math.floor(G.t * 8) % 2 ? '#ffffff' : '#8fd0ff') : '#5f7fb0';
    ctx.fillRect(dx, stack, Math.round(dw * cf), 3);
    drawText(ctx, full ? 'GALE' : 'CHARGE', dx + dw + 4, stack - 2,
             full ? '#dff0ff' : '#6d7994', 1, 'left', '#000000');
    stack += 9;
  }
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
  return G.mobile && G.state === 'play' && !G.shopOpen && !G.codesOpen && !G.pouchOpen &&
         !G.riddleOpen && !G.settingsOpen && !G.trans;
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
  { key: 'padAlpha', name: 'BUTTONS', min: 0.12, max: 1, hint: 'HOW BRIGHT THE TOUCH BUTTONS SIT' },
  { key: 'shake', name: 'SHAKE', min: 0, max: 1, hint: 'HOW HARD THE VIEW SHAKES - NONE AT ZERO' }
];
function setTabRect(i) { return { x: SET_BOX.x + 10 + i * 76, y: SET_BOX.y + 20, w: 72, h: 14 }; }
function setCloseRect() { return { x: SET_BOX.x + SET_BOX.w - 18, y: SET_BOX.y + 5, w: 13, h: 13 }; }
function setBackRect() { return { x: SET_BOX.x + 10, y: SET_BOX.y + SET_BOX.h - 20, w: 60, h: 15 }; }
function setResetRect() { return { x: SET_BOX.x + SET_BOX.w - 88, y: SET_BOX.y + SET_BOX.h - 20, w: 78, h: 15 }; }
function setModeRect(i) { return { x: SET_BOX.x + 14 + i * 156, y: SET_BOX.y + 50, w: 148, h: 26 }; }
function setSliderRect(i) { return { x: SET_BOX.x + 108, y: SET_BOX.y + 82 + i * 21, w: 174, h: 9 }; }
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
  drawText(ctx, (sl.key === 'shake' && v <= 0.001) ? 'OFF' : (Math.round(t * 100) + '%'),
           r.x + r.w + 8, r.y + 1, (sl.key === 'shake' && v <= 0.001) ? '#c9403a' : '#a9b3c9', 1, 'left');
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
    drawText(ctx, G.opts.shake <= 0.001 ? 'THE VIEW WILL NOT SHAKE AT ALL'
                                       : 'BUTTON BRIGHTNESS APPLIES IN MOBILE MODE',
             SET_BOX.x + SET_BOX.w / 2, SET_BOX.y + SET_BOX.h - 30, '#6d7994', 1, 'center');
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
  /* tall enough for both lines, so the one does not sit across the other */
  ctx.fillStyle = 'rgba(58,44,28,0.9)';
  ctx.fillRect(50, 3, VW - 100, 30);
  ctx.fillStyle = '#b8862f';
  ctx.fillRect(50, 3, VW - 100, 1); ctx.fillRect(50, 32, VW - 100, 1);
  drawText(ctx, 'CHOOSE A FILE', VW / 2, 6, '#ffeec0', 2, 'center', '#2a1a10');
  drawText(ctx, 'THREE SEPARATE JOURNEYS', VW / 2, 22, '#d8c49a', 1, 'center');

  for (let i = 0; i < SLOTS; i++) {
    const r = fileRect(i), d = slotOf(i), hot = G.fileSel === i;
    const pct = slotPercent(d);
    ctx.fillStyle = hot ? 'rgba(74,56,34,0.94)' : 'rgba(48,36,22,0.88)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = hot ? '#ffd04a' : '#b8862f';
    ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    /* the number takes the metal of whatever the file has finished */
    drawText(ctx, 'FILE ' + (i + 1), r.x + 6, r.y + 6,
             d ? fileTierCol(pct) : '#ffeec0', 1, 'left');
    if (G.slot === i && d) drawText(ctx, 'LAST', r.x + r.w - 6, r.y + 6, '#9be89a', 1, 'right');

    if (!d) {
      drawText(ctx, 'EMPTY', r.x + r.w / 2, r.y + 40, '#8a7a5c', 2, 'center');
      drawText(ctx, hot ? 'CLICK TO BEGIN' : '', r.x + r.w / 2, r.y + 62, '#d8c49a', 1, 'center');
      continue;
    }
    /* the bar of how far this file has gone, the whole four hundred of it */
    drawText(ctx, pct + '%', r.x + r.w / 2, r.y + 20, fileTierCol(pct), 2, 'center');
    const bw = r.w - 16, bx = r.x + 8, by = r.y + 40;
    ctx.fillStyle = '#2a1f12'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = '#4a3826'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = pct >= 100 ? fileTierCol(pct) : '#6fc46a';
    const pmax = filePctMax();
    ctx.fillRect(bx, by, Math.round(bw * clamp(pct, 0, pmax) / pmax), 5);
    /* a mark at every hundred, where the next metal begins */
    ctx.fillStyle = '#2a1f12';
    for (let m = 100; m < pmax; m += 100)
      ctx.fillRect(bx + Math.round(bw * m / pmax), by, 1, 5);

    /* the three things the percentage is made of, each shown against its total */
    const t = slotTally(d);
    const part = (n, m) => (n >= m ? '#9be89a' : '#e0d0aa');
    drawText(ctx, 'REALMS ' + t.realms + '/' + t.realmsMax, r.x + 8, r.y + 52, part(t.realms, t.realmsMax), 1, 'left');
    drawText(ctx, 'PAPERS ' + t.papers + '/' + t.papersMax, r.x + 8, r.y + 62, part(t.papers, t.papersMax), 1, 'left');
    drawText(ctx, 'UPGRADES ' + t.upgrades + '/' + t.upgradesMax, r.x + 8, r.y + 72, part(t.upgrades, t.upgradesMax), 1, 'left');
    /* and what the buffed runs have taken, when any of them have begun */
    const runs = [1, 2, 3].map(k => slotBuffCount(d, k));
    if (runs.some(n => n > 0)) {
      /* the three counts on one line, each in the metal of its own run */
      let rx = r.x + 8;
      rx += drawText(ctx, 'RUNS ', rx, r.y + 82, '#e0d0aa', 1, 'left');
      for (let k = 1; k <= PRESTIGE_MAX; k++) {
        const n = runs[k - 1], all = n >= World.LEVELS.length;
        rx += drawText(ctx, String(n), rx, r.y + 82,
                       all ? PRESTIGE_COL[k] : '#8a7a5c', 1, 'left');
        if (k < PRESTIGE_MAX) rx += drawText(ctx, '/', rx, r.y + 82, '#7a6448', 1, 'left');
      }
    } else {
      drawText(ctx, 'COINS ' + (d.codes && d.codes.admin ? INF : (d.coins || 0)), r.x + 8, r.y + 82, '#e0d0aa', 1, 'left');
    }

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
function codeKeyRow(r, box) {
  const B = box || codeBox();
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
function codeKeys(box) {
  const out = [];
  for (let r = 0; r < CODE_ROWS.length; r++) for (const k of codeKeyRow(r, box)) out.push(k);
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
function drawCodeKeyboard(box, hitCh) {
  const keys = codeKeys(box);
  const pressed = hitCh === undefined ? G.codeKeyHit : hitCh;
  for (const k of keys) {
    const hit = pressed === k.ch;
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
   RANK — what fighting earns you, and what it makes of you.
   Every creature you put down pays experience.  Experience buys
   levels, a hundred of them, and each one costs more than the
   one before it.  At the hundredth you may give it all back for
   a prestige, and keep the mark.
   ============================================================ */
const LEVEL_MAX = 100;
const PRESTIGE_MAX = 3;
const XP_BASE = 46, XP_POW = 1.4;
/* what it costs to go from level n to level n + 1 */
function xpStep(n) { return Math.round(XP_BASE * Math.pow(n, XP_POW)); }
/* XP_TABLE[n] is the total experience that makes you level n + 1 */
const XP_TABLE = (function () {
  const t = [0];
  for (let n = 1; n < LEVEL_MAX; n++) t.push(t[n - 1] + xpStep(n));
  return t;
})();
function levelFromXp(xp) {
  let n = 1;
  while (n < LEVEL_MAX && xp >= XP_TABLE[n]) n++;
  return n;
}
G.xp = 0; G.prestige = 0; G.xpGainT = 0; G.xpGain = 0;
G.level0 = function () { return levelFromXp(G.xp | 0); };
/* how far through the present level you are, from 0 to 1 */
G.levelFrac = function () {
  const n = G.level0();
  if (n >= LEVEL_MAX) return 1;
  const a = XP_TABLE[n - 1], b = XP_TABLE[n];
  return clamp(((G.xp | 0) - a) / Math.max(1, b - a), 0, 1);
};
/* at the hundredth level, more experience only waits for the button */
G.canPrestige = function () {
  return G.level0() >= LEVEL_MAX && (G.prestige | 0) < PRESTIGE_MAX &&
         (G.xp | 0) > XP_TABLE[LEVEL_MAX - 1];
};
/* What a creature is worth.  What it takes to put down is the measure, but
   the health is held under a root: a realm pays more because the realm pays
   more, not because its creatures carry ten times the health. */
function xpFor(e) {
  const hp = (e.maxHp || 2), dmg = (e.damage || 1);
  return Math.max(1, Math.round(6 + Math.sqrt(hp) * 3 + dmg * 2));
}
G.giveXp = function (n, x, y) {
  /* the scholar's seal reads half again out of every kill */
  if (G.hasArtifact && G.hasArtifact('scholarseal')) n *= 1.5;
  if (G.boostLeft && G.boostLeft('xp') > 0) n *= 2;
  n = Math.max(0, Math.round(n));
  if (!n) return;
  const was = G.level0();
  G.xp = (G.xp | 0) + n;
  G.xpGain += n; G.xpGainT = 1.6;
  /* A small gain goes to the bar alone: a line of text over every creature
     you put down would bury the screen.  A large one is worth saying. */
  if (x !== undefined && n >= 25)
    G.texts.push(new FloatText(x, y - 10, '+' + n + ' XP', '#8fd0e8'));
  const now = G.level0();
  if (now > was) {
    Snd.unlock(); G.flash(0.3);
    G.banner('LEVEL ' + now, 2.4);
    for (let i = 0; i < 40; i++) G.particles.push(new Particle({
      x: G.player.cx, y: G.player.cy, vx: rr(-3, 3), vy: rr(-3.4, 0.6), life: rr(0.5, 1.2),
      col: rankColour(now), col2: '#ffffff', size: rr(1, 2.8), grav: 0.06, drag: 0.94
    }));
  }
};
/* Giving it all back.  The levels go, the mark stays, and the mark opens
   doors that nothing else opens. */
G.doPrestige = function () {
  if (!G.canPrestige()) return false;
  G.prestige = (G.prestige | 0) + 1;
  /* A prestige gives back everything you were carrying.  The levels go, the
     purse goes, every upgrade goes, the pouch empties and the tickets go.
     What you look like stays: the clothes, the mantle, the hair, and the
     name, picture, border and tint on your profile.  What you have already
     taken stays too, since the buffed runs are walked against that record
     and the file percentage is counted from it. */
  G.xp = 0;
  G.buffTier = 0;
  const p = G.player;
  if (p) {
    p.coins = 0;
    for (const k in p.up) p.up[k] = 0;
    p.maxHp = 6; p.hp = 6;
    p.burnT = 0; p.burnAcc = 0;
  }
  G.artifacts = { owned: {}, slots: [null, null, null] };
  G.codes.tickets = 0;
  G.codes.admin = false;
  G.quests = { claimed: {}, daily: null };
  G.relicSeen = {}; G.relicShow = null;
  /* every realm begins again from its own start */
  G.levelState = {}; G.roomFlags = {}; G.flags = {};
  try { G.applyArtifacts(); } catch (e) { console.error('artifacts', e); }
  Snd.unlock(); G.flash(1); G.shake(9);
  G.banner('PRESTIGE ' + PRESTIGE_MARK[G.prestige], 4);
  for (let i = 0; i < 140; i++) G.particles.push(new Particle({
    x: G.player.cx, y: G.player.cy, vx: rr(-5, 5), vy: rr(-5, 2), life: rr(0.6, 1.6),
    col: rpick([PRESTIGE_COL[G.prestige], '#ffffff']), col2: PRESTIGE_COL[G.prestige],
    size: rr(1, 3.4), grav: 0.04, drag: 0.94
  }));
  try { applyProfile(); } catch (e) { console.error('look', e); }
  G.saveGame();
  return true;
};
/* The colour a level is written in.  It climbs from grey through to gold.
   The band from eighty to eighty nine was not given a colour, so it takes
   steel, which sits between bronze and silver. */
function rankColour(n) {
  if (n >= 100) return '#f0c93a';
  if (n >= 90) return '#cfd8e6';
  if (n >= 80) return '#7fb6d8';
  if (n >= 70) return '#c68e3f';
  if (n >= 60) return '#e8873a';
  if (n >= 30) return '#ffd04a';
  return '#a9b3c9';
}
/* the button that offers a prestige, top middle of the play screen */
function prestigeBtnRect() { return { x: VW / 2 - 42, y: VH - 22, w: 84, h: 14 }; }
/* What a parry sends back.  Everywhere it is worth what the blade is worth.
   In the Sunken Depths it is worth far more: double at the shore, half again
   on top of that in the hall, and triple in the trench.  A guardian that hits
   for six hearts can be answered. */
G.parryMult = function () {
  if (G.isleRun) return 1;
  const lv = clamp(G.level | 0, 0, World.LEVELS.length - 1);
  if (World.chapterOf(lv) !== 1) return 1;
  return [2, 2.5, 3][lv - World.CHAPTERS[1].levels[0]] || 2;
};
/* A further realm pays more experience for the same work, and a buffed run
   pays more again.  An island pays best of all. */
/* Each realm has an experience budget of its own, set so that a clean pass
   through a chapter leaves you where it should: about level fifteen at the
   end of the first, forty at the end of the second, and a hundred at the end
   of the last.  A buffed run pays half again for every step of its tier. */
const REALM_XP = [1.19, 5.78, 6.81, 4.70, 4.33, 4.08, 16.35, 15.93, 10.31,
                  11.01, 10.74, 10.32, 3.55, 4.05, 4.62];
G.xpScale = function () {
  if (G.isleRun) return 60 + G.isleRun.index * 4;
  const lv = clamp(G.level | 0, 0, World.LEVELS.length - 1);
  return REALM_XP[lv] * (1 + (G.buffTier | 0) * 0.5);
};
/* ---------- the face you show ---------- */
/* ten small landscapes, one from each kind of country in the game */
const AVATARS = [
  { key: 'glade', name: 'GLADE' }, { key: 'deep', name: 'DEEP WOOD' },
  { key: 'cloud', name: 'AETHER' }, { key: 'spore', name: 'SPOREWOOD' },
  { key: 'shore', name: 'SHORE' }, { key: 'trench', name: 'TRENCH' },
  { key: 'cinder', name: 'CINDER' }, { key: 'frost', name: 'FROSTFELL' },
  { key: 'dune', name: 'DUNE SEA' }, { key: 'mesa', name: 'MESA' }
];
/* Four darknesses of stone brick, and three more the prestiges open. */
const BORDERS = [
  { name: 'PALE STONE', base: '#8a8274', dark: '#5d5850', light: '#b0a798', need: 0 },
  { name: 'GREY STONE', base: '#6b6760', dark: '#454340', light: '#8f8a80', need: 0 },
  { name: 'DARK STONE', base: '#4a4744', dark: '#2c2b2a', light: '#6a6660', need: 0 },
  { name: 'BLACK STONE', base: '#2e2d2c', dark: '#1a1a19', light: '#484644', need: 0 },
  { name: 'BRONZE', base: '#a66a28', dark: '#5e3a10', light: '#d4a05c', need: 1, shine: true },
  { name: 'SILVER', base: '#cfd8e6', dark: '#8a95a8', light: '#ffffff', need: 2, shine: true },
  { name: 'GOLD', base: '#f0c93a', dark: '#a8862a', light: '#fff4c0', need: 3, shine: true }
];
/* a portrait may be struck in a metal, once a prestige has opened it */
const TINTS = [{ name: 'PLAIN', label: 'NO TINT', need: 0 },
               { name: 'BRONZE', label: 'BRONZE TINT', need: 1 },
               { name: 'SILVER', label: 'SILVER TINT', need: 2 },
               { name: 'GOLD', label: 'GOLDEN TINT', need: 3 }];
function tintOwned(i) { return (TINTS[i] ? TINTS[i].need : 99) <= (G.prestige | 0); }
function newAccount() { return { name: 'WANDERER', avatar: 0, border: 1, tint: 0 }; }
function borderOwned(i) { return (BORDERS[i] ? BORDERS[i].need : 99) <= (G.prestige | 0); }
function accountName() {
  const n = (G.account && G.account.name) || '';
  return n ? n : 'WANDERER';
}
/* ---------- the buffed runs a prestige opens ---------- */
/* A prestige lets you walk every realm you have already cleared a second
   time, harder.  Bronze first, then silver, then gold: the order holds
   however high your prestige stands. */
const BUFF_HP = [1, 3, 6, 10];
const BUFF_DMG = [1, 1.6, 2.2, 3];
/* A guardian already carries many times what a creature does, so a buffed
   run lifts it by less.  Ten times over would make a fight of half an hour. */
const BUFF_BOSS = [1, 2, 3.2, 5];
function buffKey(tier, level) { return tier + ':' + level; }
function buffCleared(tier, level) {
  if (tier <= 0) return !!G.cleared[level];
  return !!(G.buffDone && G.buffDone[buffKey(tier, level)]);
}
/* the highest tier this realm has been taken at */
function buffRank(level) {
  for (let t = PRESTIGE_MAX; t > 0; t--) if (buffCleared(t, level)) return t;
  return 0;
}
/* A buffed realm opens when you have cleared it plain, when your prestige
   reaches its tier, and when the tier under it is already done. */
function buffOpen(tier, level) {
  if (tier <= 0) return true;
  if (tier > (G.prestige | 0)) return false;
  if (!G.cleared[level]) return false;
  return buffCleared(tier - 1, level);
}
/* why a buffed realm will not open, in words */
function buffBar(tier, level) {
  if (tier > (G.prestige | 0)) return 'PRESTIGE ' + PRESTIGE_MARK[tier] + ' OPENS IT';
  if (!G.cleared[level]) return 'CLEAR IT PLAIN FIRST';
  if (!buffCleared(tier - 1, level)) return 'TAKE THE ' + PRESTIGE_NAME[tier - 1] + ' RUN FIRST';
  return '';
}
/* what each of the three level codes hands over */
const XP_CODES = { XP10: 10, XP50: 50, XP100: 100 };
const PRESTIGE_MARK = ['', 'I', 'II', 'III'];
/* bronze reads brown, so it is never taken for the gold beside it */
const PRESTIGE_COL = ['', '#b07536', '#cfd8e6', '#f0c93a'];
const PRESTIGE_NAME = ['', 'BRONZE', 'SILVER', 'GOLD'];
/* the mark and the number, written together, as they go everywhere */
/* The mark of a prestige, on a small plate of its own metal.  The corners
   are cut away by a pixel or two, so it reads as a button rather than as a
   block of colour. */
function prestigeBadgeSize(pr, sc) {
  const h = Math.round(GH * sc + 4 * sc);
  /* the first mark takes a square plate; the wider marks stretch it */
  return { w: Math.max(h, Math.round(textWidth(PRESTIGE_MARK[pr] || 'I') * sc + 6 * sc)), h: h };
}
function drawPrestigeBadge(c2, x, y, pr, sc) {
  const mark = PRESTIGE_MARK[pr];
  if (!mark) return 0;
  const col = C(PRESTIGE_COL[pr]);
  const b = prestigeBadgeSize(pr, sc);
  x = Math.round(x); y = Math.round(y);
  const cut = Math.max(1, Math.round(sc));        /* how deep each corner cuts */
  /* the plate: a block with its four corners taken off */
  c2.fillStyle = css(col);
  c2.fillRect(x + cut, y, b.w - cut * 2, b.h);
  c2.fillRect(x, y + cut, b.w, b.h - cut * 2);
  /* a light along the crown and a shadow along the foot, so it stands up */
  c2.fillStyle = css(sh(col, 0.45));
  c2.fillRect(x + cut, y, b.w - cut * 2, Math.max(1, Math.round(sc)));
  c2.fillStyle = css(sh(col, -0.42));
  c2.fillRect(x + cut, y + b.h - Math.max(1, Math.round(sc)), b.w - cut * 2, Math.max(1, Math.round(sc)));
  /* the numeral, in an ink dark enough for bronze, silver and gold alike */
  drawText(c2, mark, x + b.w / 2, y + Math.round((b.h - GH * sc) / 2), '#2a1c08', sc, 'center');
  return b.w;
}
function drawRank(c2, x, y, scale, align) {
  const n = G.level0(), pr = G.prestige | 0;
  const sc = scale || 1;
  const mark = PRESTIGE_MARK[pr];
  const gap = Math.round(3 * sc);
  const bw = mark ? prestigeBadgeSize(pr, sc).w : 0;
  const w = textWidth(String(n)) * sc + (mark ? bw + gap : 0);
  let cx = align === 'center' ? x - w / 2 : (align === 'right' ? x - w : x);
  if (mark) {
    /* the plate stands a little taller than the number beside it */
    cx += drawPrestigeBadge(c2, cx, y - Math.round(2 * sc), pr, sc) + gap;
  }
  drawText(c2, String(n), cx, y, rankColour(n), sc, 'left', '#1a1206');
  return w;
}

/* ============================================================
   THE PROFILE — the hero's own hair, clothes and mantle. Opened
   once the tutorial is done, and from the chart after that.
   ============================================================ */
G.profile = { hair: 0, hairCol: 0, outfit: 0, tee: 0, cape: 'none', suit: 'none' };
const CAPE_ORDER = ['wood', 'tide', 'ember', 'pBronze', 'pSilver', 'pGold'];
/* A mantle is earned: the first three by finishing a chapter, the last
   three by taking a prestige. */
function capeUnlocked(key) {
  const des = CAPES[key];
  if (des && des.prestige) return (G.prestige | 0) >= des.prestige;
  const ch = CAPE_ORDER.indexOf(key);
  if (ch < 0 || ch >= World.CHAPTERS.length) return true;
  const levels = World.CHAPTERS[ch].levels;
  return levels.every(l => G.cleared[l]);
}
/* a hair colour or a suit may wait on a prestige */
function hairUnlocked(i) {
  const c = HAIR_COLS[i];
  return !c || !c.need || (G.prestige | 0) >= c.need;
}
function suitUnlocked(key) {
  const su = SUITS[key];
  return !su || !su.need || (G.prestige | 0) >= su.need;
}
/* does anything the hero wears carry a shine? */
G.heroShines = function () {
  const p = G.profile;
  const su = SUITS[p.suit], ha = HAIR_COLS[p.hairCol], ca = CAPES[p.cape];
  return !!((su && su.shine) || (ha && ha.shine) || (ca && ca.shine));
};
function applyProfile() {
  const p = G.profile;
  if (p.cape !== 'none' && !capeUnlocked(p.cape)) p.cape = 'none';
  if (!hairUnlocked(p.hairCol)) p.hairCol = 0;
  if (p.suit && p.suit !== 'none' && !suitUnlocked(p.suit)) p.suit = 'none';
  try { Art.rebuildHero(p); } catch (e) { console.error('hero look', e); }
  if (G.codes.admin) { try { Art.buildGold(); } catch (e) { /* rebuilt lazily */ } }
  if (G.player) G.player.cape = null;
}
/* the rows of the editor */
const PROF_ROWS = [
  { key: 'hair', name: 'HAIR', list: () => HAIR_STYLES },
  { key: 'hairCol', name: 'COLOUR', list: () => HAIR_COLS.map(c => c.name) },
  { key: 'outfit', name: 'CLOTHES', list: () => OUTFITS },
  { key: 'tee', name: 'SHIRT', list: () => TEE_COLS.map(c => c.name) }
];
/* The panel holds two pages.  PROFILE carries the face you show: a name, a
   picture, a border round it, and the rank you have fought your way to.
   LOOK carries what the hero wears. */
const PROF_BOX = { x: 16, y: 10, w: 352, h: 196 };
const PROF_TABS = ['PROFILE', 'LOOK'];
function profTabRect(i) { return { x: PROF_BOX.x + 12 + i * 74, y: PROF_BOX.y + 19, w: 70, h: 14 }; }
function profRowRect(i) { return { x: PROF_BOX.x + 12, y: PROF_BOX.y + 40 + i * 20, w: 150, h: 17 }; }
function profArrowRect(i, dir) {
  const r = profRowRect(i);
  return dir < 0 ? { x: r.x + 58, y: r.y, w: 16, h: r.h }
                 : { x: r.x + r.w - 16, y: r.y, w: 16, h: r.h };
}
/* six mantles in two columns, and a seventh tile that takes them all off */
function profCapeRect(i) {
  if (i >= CAPE_ORDER.length) return { x: PROF_BOX.x + 174, y: PROF_BOX.y + 146, w: 166, h: 14 };
  const col = i % 2, row = (i / 2) | 0;
  return { x: PROF_BOX.x + 174 + col * 86, y: PROF_BOX.y + 40 + row * 34, w: 80, h: 31 };
}
function profDoneRect() { return { x: PROF_BOX.x + 262, y: PROF_BOX.y + PROF_BOX.h - 24, w: 78, h: 16 }; }
function profRandomRect() { return { x: PROF_BOX.x + 174, y: PROF_BOX.y + PROF_BOX.h - 24, w: 80, h: 16 }; }
function profPreviewSpot() { return { cx: PROF_BOX.x + 84, base: PROF_BOX.y + 170, scale: 1.4 }; }

/* ---------- the PROFILE page ----------
   Three columns: the picture on the left with its two arrow rows, the four
   tint plates beside it, and the name, the rank and the buttons to the
   right of those. */
const PORTRAIT = 48, FRAME = 8;
function profFaceRect() {
  return { x: PROF_BOX.x + 6, y: PROF_BOX.y + 34,
           w: PORTRAIT + FRAME * 2, h: PORTRAIT + FRAME * 2 };
}
/* The two arrow rows reach a little wider than the picture, so the name of
   the picture and the name of the border both sit clear between them. */
const PIC_ROW_PAD = 6, PIC_ARROW_W = 16;
function profPicArrow(dir) {
  const f = profFaceRect();
  return { x: dir < 0 ? f.x - PIC_ROW_PAD : f.x + f.w + PIC_ROW_PAD - PIC_ARROW_W,
           y: f.y + f.h + 4, w: PIC_ARROW_W, h: 14 };
}
function profEdgeArrow(dir) {
  const f = profFaceRect();
  return { x: dir < 0 ? f.x - PIC_ROW_PAD : f.x + f.w + PIC_ROW_PAD - PIC_ARROW_W,
           y: f.y + f.h + 22, w: PIC_ARROW_W, h: 14 };
}
/* the four tint plates, stacked beside the picture */
function profTintRect(i) {
  return { x: PROF_BOX.x + 82, y: PROF_BOX.y + 40 + i * 19, w: 94, h: 17 };
}
function profNameRect() { return { x: PROF_BOX.x + 182, y: PROF_BOX.y + 40, w: 152, h: 18 }; }
function profWardRect() { return { x: PROF_BOX.x + 182, y: PROF_BOX.y + 118, w: 74, h: 18 }; }
function profPrestigeRect() { return { x: PROF_BOX.x + 260, y: PROF_BOX.y + 118, w: 74, h: 18 }; }
/* a small padlock, for a tint no prestige has opened yet */
function drawSmallLock(c2, x, y, col) {
  c2.fillStyle = col;
  c2.fillRect(x + 2, y, 4, 1);
  c2.fillRect(x + 1, y + 1, 1, 2);
  c2.fillRect(x + 6, y + 1, 1, 2);
  c2.fillRect(x, y + 3, 8, 5);
  c2.fillStyle = '#12101c';
  c2.fillRect(x + 3, y + 5, 2, 2);
}
/* The picture is a round one, so the frame is a ring of brick round it.
   The bricks are laid in courses that run round the ring, and each one is
   cut to the two circles that bound it. */
function portraitCircle(r) {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, inner: PORTRAIT / 2, outer: r.w / 2 };
}
function drawPortraitFrame(c2, r, idx, t) {
  const b = BORDERS[clamp(idx | 0, 0, BORDERS.length - 1)];
  const cc = portraitCircle(r);
  const courses = 2;                        /* two rings of brick */
  const band = (cc.outer - cc.inner) / courses;
  for (let ring = 0; ring < courses; ring++) {
    const r0 = cc.inner + ring * band, r1 = r0 + band;
    /* a longer brick on the outside, so every course reads the same width */
    const n = 12 + ring * 6;
    const off = (ring & 1) ? Math.PI / n : 0;
    for (let k = 0; k < n; k++) {
      const a0 = off + k / n * TAU, a1 = off + (k + 1) / n * TAU;
      /* metal catches a light that runs round it; stone does not */
      let col;
      if (b.shine) {
        const mid = (a0 + a1) / 2;
        const g = (Math.sin(mid * 2 - (t || 0) * 2.2) + 1) / 2;
        col = g > 0.72 ? b.light : (g < 0.30 ? b.dark : b.base);
      } else col = ((ring + k) & 1) ? b.base : b.dark;
      c2.fillStyle = col;
      c2.beginPath();
      c2.arc(cc.cx, cc.cy, r1, a0, a1);
      c2.arc(cc.cx, cc.cy, r0, a1, a0, true);
      c2.closePath();
      c2.fill();
      /* the mortar between one brick and the next */
      c2.strokeStyle = 'rgba(10,8,14,0.45)';
      c2.lineWidth = 1;
      c2.stroke();
    }
  }
  /* a light on the crown of the ring and a shadow under its foot */
  c2.save();
  c2.lineWidth = 1;
  c2.strokeStyle = b.light;
  c2.beginPath(); c2.arc(cc.cx, cc.cy, cc.outer - 0.5, Math.PI, TAU); c2.stroke();
  c2.strokeStyle = b.dark;
  c2.beginPath(); c2.arc(cc.cx, cc.cy, cc.outer - 0.5, 0, Math.PI); c2.stroke();
  c2.restore();
}
/* the picture itself, cut to a circle */
function drawPortrait(c2, r, avatar, tint) {
  const cc = portraitCircle(r);
  const i = clamp(avatar | 0, 0, (Art.portrait || []).length - 1);
  const set = (tint | 0) > 0 && Art.portraitTint && Art.portraitTint[tint | 0];
  const img = (set && set[i]) || (Art.portrait && Art.portrait[i]);
  if (!img) return;
  c2.save();
  c2.beginPath();
  c2.arc(cc.cx, cc.cy, cc.inner, 0, TAU);
  c2.clip();
  c2.drawImage(img, Math.round(cc.cx - PORTRAIT / 2), Math.round(cc.cy - PORTRAIT / 2));
  c2.restore();
}

function openProfile(thenState, tab) {
  G.state = 'profile';
  G.profAfter = thenState || 'map';
  G.profSel = -1; G.profT = 0;
  if (tab !== undefined) G.profTab = tab;
  if (G.profTab === undefined) G.profTab = 0;
  G.nameEdit = false;
  G.profMsgT = 0;
  G.particles.length = 0;
  if (!G.account) G.account = newAccount();
  if (!G.profPreview) G.profPreview = new Player();
  G.profPreview.cape = null;
  applyProfile();
  Snd.play('title'); Snd.musicLevel(0.30, 0.8);
}
/* Typing a name.  The keys of a real keyboard and the keys of the built-in
   one write into the same place. */
const NAME_MAX = 12;
function updateNameEdit() {
  const B = CODE_BOX_MOB;
  G.nameKeyFlash = Math.max(0, (G.nameKeyFlash || 0) - G.dt);
  if (G.nameKeyFlash <= 0) G.nameKeyHit = null;
  const done = { x: B.x + B.w - 74, y: B.y + 26, w: 68, h: 18 };
  const type = ch => {
    if (ch === 'ENTER') { G.nameEdit = false; G.saveGame(); Snd.buy(); return; }
    if (ch === 'DEL') { G.account.name = G.account.name.slice(0, -1); Snd.ui(); return; }
    if (G.account.name.length < NAME_MAX) { G.account.name += ch; Snd.ui(); }
    else Snd.uiBad();
  };
  if (Input.hit('Escape') || Input.hit('Enter') || Input.tap(done)) {
    G.nameEdit = false; G.saveGame(); Snd.buy(); return;
  }
  if (Input.hit('Backspace')) G.account.name = G.account.name.slice(0, -1);
  for (const ch of Input.typed)
    if (/[A-Za-z0-9 ]/.test(ch) && G.account.name.length < NAME_MAX)
      G.account.name += ch.toUpperCase();
  for (const k of codeKeys(B)) {
    if (!Input.tap({ x: k.x, y: k.y, w: k.w, h: k.h })) continue;
    G.nameKeyHit = k.ch; G.nameKeyFlash = 0.12;
    type(k.ch);
    return;
  }
}
function updateProfile(dt) {
  G.profT += dt;
  G.profMsgT = Math.max(0, (G.profMsgT || 0) - dt);
  G.flashAmt = Math.max(0, G.flashAmt - dt * 2.2);
  if (G.settingsOpen) { updateSettings(); return; }
  /* the name keyboard covers the panel, so it takes every tap first */
  if (G.nameEdit) { updateNameEdit(); return; }
  let changed = false;
  const p = G.profile;
  for (let i = 0; i < PROF_TABS.length; i++) if (Input.tap(profTabRect(i))) {
    G.profTab = i; Snd.ui();
  }
  /* the face page may leave for the wardrobe, and then nothing else runs */
  if (G.profTab === 0) { if (updateProfileFace()) return; }
  else {
    for (let i = 0; i < PROF_ROWS.length; i++) {
      const row = PROF_ROWS[i], n = row.list().length;
      for (const dir of [-1, 1]) {
        if (!Input.tap(profArrowRect(i, dir))) continue;
        /* step over anything a prestige has yet to open */
        let v = p[row.key];
        for (let guard = 0; guard < n; guard++) {
          v = ((v + dir) % n + n) % n;
          if (row.key !== 'hairCol' || hairUnlocked(v)) break;
        }
        p[row.key] = v;
        changed = true; Snd.ui();
      }
    }
    CAPE_ORDER.forEach((key, i) => {
      if (!Input.tap(profCapeRect(i))) return;
      if (!capeUnlocked(key)) {
        Snd.uiBad();
        const des = CAPES[key];
        G.profMsg = des.prestige ? ('PRESTIGE ' + PRESTIGE_MARK[des.prestige] + ' OPENS IT')
                                 : ('FINISH ' + des.hint);
        G.profMsgT = 2.2;
        return;
      }
      p.cape = (p.cape === key) ? 'none' : key;
      changed = true; Snd.ui();
    });
    if (Input.tap(profCapeRect(CAPE_ORDER.length))) { p.cape = 'none'; changed = true; Snd.ui(); }
    if (Input.tap(profRandomRect())) {
      p.hair = ri(0, HAIR_STYLES.length - 1);
      do { p.hairCol = ri(0, HAIR_COLS.length - 1); } while (!hairUnlocked(p.hairCol));
      p.outfit = ri(0, OUTFITS.length - 1);
      p.tee = ri(0, TEE_COLS.length - 1);
      changed = true; Snd.buy();
    }
  }
  if (changed) { applyProfile(); G.saveGame(); }
  if (Input.tap(profDoneRect()) || Input.hit('Enter') || Input.hit('Escape')) {
    Snd.buy(); G.flash(0.4);
    if (G.profAfter === 'map') openMap(false);
    else { G.state = G.profAfter; }
    return;
  }
  for (const pa of G.particles) pa.update(dt);
  G.particles = G.particles.filter(x => !x.dead);
  if (Math.random() < dt * 6) G.particles.push(new Particle({
    x: rr(0, VW), y: VH + 4, vx: rr(-0.2, 0.2), vy: rr(-0.5, -0.15),
    life: rr(3, 6), col: rpick(['#ebdcb6', '#d8c49a', '#fff4d6']), size: 1, grav: 0, type: 'leaf'
  }));
}
/* the PROFILE page: the picture, the name and the rank */
function updateProfileFace() {
  const a = G.account;
  let changed = false;
  for (const dir of [-1, 1]) {
    if (Input.tap(profPicArrow(dir))) {
      a.avatar = ((a.avatar + dir) % AVATARS.length + AVATARS.length) % AVATARS.length;
      changed = true; Snd.ui();
    }
    if (Input.tap(profEdgeArrow(dir))) {
      let v = a.border;
      for (let guard = 0; guard < BORDERS.length; guard++) {
        v = ((v + dir) % BORDERS.length + BORDERS.length) % BORDERS.length;
        if (borderOwned(v)) break;
      }
      if (borderOwned(v)) { a.border = v; changed = true; Snd.ui(); }
      else { Snd.uiBad(); G.profMsg = 'A PRESTIGE OPENS IT'; G.profMsgT = 2; }
    }
  }
  /* the four tint plates, each one picked outright */
  for (let i = 0; i < TINTS.length; i++) {
    if (!Input.tap(profTintRect(i))) continue;
    if (!tintOwned(i)) {
      Snd.uiBad();
      G.profMsg = 'PRESTIGE ' + PRESTIGE_MARK[TINTS[i].need] + ' OPENS IT';
      G.profMsgT = 2.2;
      continue;
    }
    a.tint = i; changed = true; Snd.ui();
  }
  if (Input.tap(profNameRect())) {
    G.nameEdit = true; G.nameKeyHit = null; Snd.ui();
  }
  if (Input.tap(profWardRect())) { openWardrobe('profile'); return true; }
  if (Input.tap(profPrestigeRect())) {
    if (G.canPrestige()) G.doPrestige();
    else {
      Snd.uiBad();
      G.profMsg = (G.prestige | 0) >= PRESTIGE_MAX ? 'NOTHING IS LEFT TO GIVE BACK'
                                                   : 'REACH LEVEL 100 FIRST';
      G.profMsgT = 2.2;
    }
  }
  if (changed) G.saveGame();
  return false;
}
function drawNameEdit() {
  const B = CODE_BOX_MOB;
  ctx.fillStyle = 'rgba(8,6,16,0.86)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'YOUR NAME', B.x + 10, B.y + 8, '#f2e2b8', 1, 'left', '#000000');
  const fx = B.x + 10, fy = B.y + 26;
  ctx.fillStyle = '#12101c'; ctx.fillRect(fx - 2, fy - 3, 240, 18);
  ctx.fillStyle = '#3a3350'; ctx.fillRect(fx - 2, fy - 3, 240, 1);
  const shown = G.account.name || '';
  drawText(ctx, shown, fx + 2, fy + 2, rankColour(G.level0()), 2, 'left');
  if (Math.floor(G.t * 2.4) % 2 === 0) {
    ctx.fillStyle = '#6fc46a';
    ctx.fillRect(fx + 2 + textWidth(shown) * 2 + 2, fy + 1, 2, 12);
  }
  const done = { x: B.x + B.w - 74, y: B.y + 26, w: 68, h: 18 };
  const hot = Input.over(done);
  ctx.fillStyle = hot ? '#3c5a40' : '#2f4a34'; ctx.fillRect(done.x, done.y, done.w, done.h);
  ctx.fillStyle = '#6fc46a'; ctx.fillRect(done.x, done.y, done.w, 1);
  drawText(ctx, 'DONE', done.x + done.w / 2, done.y + 6, '#ffeec0', 1, 'center');
  drawText(ctx, 'UP TO ' + NAME_MAX + ' LETTERS', fx, fy + 20, '#6d7994', 1, 'left');
  drawCodeKeyboard(B, G.nameKeyHit);
}
function drawProfileFace() {
  const a = G.account, n = G.level0(), pr = G.prestige | 0;
  const f = profFaceRect();
  /* the picture, and the frame of brick or metal round it */
  drawPortraitFrame(ctx, f, a.border, G.profT);
  drawPortrait(ctx, f, a.avatar, a.tint);
  for (const [rect, label, dir] of [[profPicArrow(-1), '<', -1], [profPicArrow(1), '>', 1],
                                    [profEdgeArrow(-1), '<', -1], [profEdgeArrow(1), '>', 1]]) {
    const hot = Input.over(rect);
    ctx.fillStyle = hot ? '#3c5a40' : '#2b2740';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    drawText(ctx, label, rect.x + rect.w / 2, rect.y + 4, '#ffeec0', 1, 'center');
    void dir;
  }
  drawText(ctx, AVATARS[clamp(a.avatar | 0, 0, AVATARS.length - 1)].name,
           f.x + f.w / 2, profPicArrow(-1).y + 4, '#a9b3c9', 1, 'center');
  drawText(ctx, BORDERS[clamp(a.border | 0, 0, BORDERS.length - 1)].name,
           f.x + f.w / 2, profEdgeArrow(-1).y + 4, '#a9b3c9', 1, 'center');
  /* the four tint plates: the one you wear is lit, the shut ones carry a lock */
  const tn = clamp(a.tint | 0, 0, TINTS.length - 1);
  for (let i = 0; i < TINTS.length; i++) {
    const tr = profTintRect(i), own = tintOwned(i), on = tn === i;
    const hot = own && Input.over(tr);
    ctx.fillStyle = on ? 'rgba(74,56,34,0.96)' : (hot ? '#332c4c' : (own ? '#211c32' : '#1a1626'));
    ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
    ctx.fillStyle = on ? (i ? PRESTIGE_COL[i] : '#ffd04a') : (own ? '#3a3350' : '#2a2438');
    ctx.fillRect(tr.x, tr.y, tr.w, 1); ctx.fillRect(tr.x, tr.y + tr.h - 1, tr.w, 1);
    ctx.fillRect(tr.x, tr.y, 1, tr.h); ctx.fillRect(tr.x + tr.w - 1, tr.y, 1, tr.h);
    /* a scrap of the metal itself, so you can see what it does */
    if (i) {
      const m = METAL[i];
      ctx.fillStyle = m.dark; ctx.fillRect(tr.x + 4, tr.y + 4, 9, 9);
      ctx.fillStyle = own ? m.mid : '#3a3350'; ctx.fillRect(tr.x + 5, tr.y + 5, 7, 7);
      ctx.fillStyle = own ? m.light : '#4a4368'; ctx.fillRect(tr.x + 5, tr.y + 5, 7, 2);
    } else {
      ctx.fillStyle = '#3a3350'; ctx.fillRect(tr.x + 4, tr.y + 4, 9, 9);
      ctx.fillStyle = own ? '#8fa0b8' : '#4a4368'; ctx.fillRect(tr.x + 5, tr.y + 5, 7, 7);
    }
    drawText(ctx, TINTS[i].label, tr.x + 16, tr.y + 5,
             own ? (on ? '#ffeec0' : '#c9d4e8') : '#5b6480', 1, 'left');
    if (!own) drawSmallLock(ctx, tr.x + tr.w - 10, tr.y + 5, '#7f8aa3');
  }

  /* the name */
  const nr = profNameRect(), nameHot = Input.over(nr);
  ctx.fillStyle = nameHot ? '#332c4c' : '#211c32';
  ctx.fillRect(nr.x, nr.y, nr.w, nr.h);
  ctx.fillStyle = nameHot ? '#ffd04a' : '#3a3350';
  ctx.fillRect(nr.x, nr.y, nr.w, 1);
  drawText(ctx, accountName(), nr.x + 5, nr.y + 5, rankColour(n), 2, 'left', '#12101c');
  drawText(ctx, 'CLICK TO CHANGE YOUR NAME', nr.x, nr.y + 21, '#6d7994', 1, 'left');

  /* the rank: the mark of a prestige, then the level, then the bar */
  const ry = PROF_BOX.y + 74;
  drawText(ctx, 'LEVEL', nr.x, ry + 3, '#a9b3c9', 1, 'left');
  drawRank(ctx, nr.x + 34, ry, 2, 'left');
  const bw = nr.w, by = ry + 20;
  ctx.fillStyle = '#12101c'; ctx.fillRect(nr.x, by, bw, 7);
  ctx.fillStyle = rankColour(n);
  ctx.fillRect(nr.x + 1, by + 1, Math.round((bw - 2) * G.levelFrac()), 5);
  ctx.fillStyle = '#3a3350'; ctx.fillRect(nr.x, by, bw, 1);
  const left = n >= LEVEL_MAX ? 0 : XP_TABLE[n] - (G.xp | 0);
  drawText(ctx, n >= LEVEL_MAX ? 'THE HUNDREDTH LEVEL' : (left + ' XP TO LEVEL ' + (n + 1)),
           nr.x + bw, by + 9, '#8a94a6', 1, 'right');

  /* the two buttons */
  const wr = profWardRect(), wh = Input.over(wr);
  ctx.fillStyle = wh ? 'rgba(74,56,34,0.96)' : 'rgba(34,26,16,0.9)';
  ctx.fillRect(wr.x, wr.y, wr.w, wr.h);
  ctx.fillStyle = wh ? '#ffd04a' : '#b8862f';
  ctx.fillRect(wr.x, wr.y, wr.w, 1);
  drawText(ctx, 'WARDROBE', wr.x + wr.w / 2, wr.y + 6, '#ffeec0', 1, 'center');
  const pgr = profPrestigeRect(), ph = Input.over(pgr), can = G.canPrestige();
  ctx.fillStyle = can ? (ph ? '#6a4a1c' : '#4a3414') : 'rgba(24,20,30,0.9)';
  ctx.fillRect(pgr.x, pgr.y, pgr.w, pgr.h);
  ctx.fillStyle = can ? PRESTIGE_COL[Math.min(PRESTIGE_MAX, pr + 1)] : '#3a3350';
  ctx.fillRect(pgr.x, pgr.y, pgr.w, 1);
  drawText(ctx, pr >= PRESTIGE_MAX ? 'PRESTIGE III' : ('PRESTIGE ' + PRESTIGE_MARK[pr + 1]),
           pgr.x + pgr.w / 2, pgr.y + 6, can ? '#ffeec0' : '#6d7994', 1, 'center');
  drawText(ctx, pr >= PRESTIGE_MAX ? 'ALL THREE MARKS ARE YOURS'
                                   : 'YOU KEEP ONLY YOUR LOOK',
           nr.x, pgr.y + 22, '#6d7994', 1, 'left');
  if (G.profMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.profMsgT * 2);
    drawText(ctx, G.profMsg, PROF_BOX.x + PROF_BOX.w / 2, PROF_BOX.y + PROF_BOX.h - 34,
             '#ffd04a', 1, 'center', '#2a1a10');
    ctx.restore();
  }
}
function drawProfile() {
  ctx.drawImage(Art.map.bg, 0, 0);
  for (const pa of G.particles) pa.draw(ctx);
  panel(ctx, PROF_BOX.x, PROF_BOX.y, PROF_BOX.w, PROF_BOX.h);
  /* the corner stays empty: the page says your name and your rank already */
  drawText(ctx, 'YOUR PROFILE', PROF_BOX.x + 12, PROF_BOX.y + 7, '#f2e2b8', 1, 'left', '#000000');
  /* the two tabs */
  PROF_TABS.forEach((name, i) => {
    const r = profTabRect(i), on = G.profTab === i, hot = Input.over(r);
    ctx.fillStyle = on ? 'rgba(74,56,34,0.96)' : (hot ? '#332c4c' : '#211c32');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#ffd04a' : '#3a3350';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, name, r.x + r.w / 2, r.y + 4, on ? '#ffeec0' : '#a9b3c9', 1, 'center');
  });
  const dr = profDoneRect(), dh = Input.over(dr);
  ctx.fillStyle = dh ? 'rgba(74,56,34,0.96)' : 'rgba(34,26,16,0.9)';
  ctx.fillRect(dr.x, dr.y, dr.w, dr.h);
  ctx.fillStyle = dh ? '#ffd04a' : '#b8862f';
  ctx.fillRect(dr.x, dr.y, dr.w, 1);
  drawText(ctx, 'DONE', dr.x + dr.w / 2, dr.y + 5, '#ffeec0', 1, 'center');
  if (G.profTab === 0) {
    drawProfileFace();
    if (G.nameEdit) drawNameEdit();
    if (G.flashAmt > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, VW, VH); ctx.restore();
    }
    return;
  }
  drawProfileLook();
}
function drawProfileLook() {
  const p = G.profile;
  PROF_ROWS.forEach((row, i) => {
    const r = profRowRect(i);
    const list = row.list();
    const dim = row.key === 'tee' && p.outfit !== 1;
    ctx.fillStyle = '#211c32'; ctx.fillRect(r.x, r.y, r.w, r.h);
    drawText(ctx, row.name, r.x + 4, r.y + 5, dim ? '#5b6480' : '#a9b3c9', 1, 'left');
    drawText(ctx, list[p[row.key]], r.x + 76, r.y + 5, dim ? '#5b6480' : '#ffeec0', 1, 'left');
    for (const dir of [-1, 1]) {
      const ar = profArrowRect(i, dir), hot = Input.over(ar);
      ctx.fillStyle = hot ? '#3c5a40' : '#2b2740';
      ctx.fillRect(ar.x, ar.y + 2, ar.w, ar.h - 4);
      drawText(ctx, dir < 0 ? '<' : '>', ar.x + ar.w / 2, ar.y + 5, '#ffeec0', 1, 'center');
    }
    /* a swatch, where the row is about colour, kept clear of the words */
    if (row.key === 'hairCol' || row.key === 'tee') {
      const src = row.key === 'hairCol' ? HAIR_COLS[p.hairCol] : TEE_COLS[p.tee];
      ctx.fillStyle = src.base; ctx.fillRect(r.x + r.w - 33, r.y + 3, 11, 11);
      ctx.fillStyle = src.dark; ctx.fillRect(r.x + r.w - 33, r.y + 11, 11, 3);
      ctx.fillStyle = '#12101c'; ctx.fillRect(r.x + r.w - 33, r.y + 3, 11, 1);
    }
  });

  /* the mantles, and what each is still waiting on */
  drawText(ctx, 'MANTLES', PROF_BOX.x + PROF_BOX.w - 12, PROF_BOX.y + 31, '#a9b3c9', 1, 'right');
  CAPE_ORDER.forEach((key, i) => {
    const r = profCapeRect(i), des = CAPES[key];
    const got = capeUnlocked(key), on = p.cape === key;
    ctx.fillStyle = on ? '#2f4a34' : (got ? '#211c32' : '#1a1626');
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (on || (got && Input.over(r))) {
      ctx.fillStyle = on ? '#6fc46a' : '#c68e3f';
      ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x, r.y, 1, r.h); ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    }
    /* a scrap of the cloth itself, so you can see what it is */
    for (let j = 0; j < 7; j++) for (let k = 0; k < 5; k++) {
      const col = got ? capeCell(key, j, k, 7, 5) : '#3a3350';
      ctx.fillStyle = col;
      ctx.fillRect(r.x + 3 + k * 3, r.y + 3 + j * 2, 3, 2);
    }
    /* metal cloth catches a light running down it */
    if (got && des.shine) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const k = ((G.profT * 0.5 + i * 0.2) % 1) * 16 - 2;
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#ffffff';
      ctx.fillRect(r.x + 3, r.y + 3 + Math.round(k), 15, 2);
      ctx.restore();
    }
    const name = got ? (des.short || des.name) : 'LOCKED';
    drawText(ctx, name, r.x + 21, r.y + 3, got ? '#ffeec0' : '#5b6480', 1, 'left');
    const need = des.prestige ? ('NEEDS ' + PRESTIGE_MARK[des.prestige]) : des.hint;
    drawText(ctx, got ? (on ? 'WORN' : 'WEAR') : need,
             r.x + 21, r.y + 12, got ? (on ? '#6fc46a' : '#a9b3c9') : '#7f8aa3', 1, 'left');
  });
  const nr = profCapeRect(CAPE_ORDER.length);
  const noneHot = Input.over(nr);
  ctx.fillStyle = p.cape === 'none' ? '#2f4a34' : (noneHot ? '#332c4c' : '#211c32');
  ctx.fillRect(nr.x, nr.y, nr.w, nr.h);
  drawText(ctx, 'NO MANTLE', nr.x + 6, nr.y + 4, p.cape === 'none' ? '#6fc46a' : '#c9d4e8', 1, 'left');

  /* the hero themselves, turning slowly on the spot */
  {
    const spot = profPreviewSpot();
    const bx = spot.cx, by = spot.base, sc = spot.scale;
    ctx.fillStyle = 'rgba(10,8,18,0.45)';
    ctx.fillRect(bx - 76, by - 44, 144, 48);
    ctx.fillStyle = '#3a3350';
    ctx.fillRect(bx - 76, by - 44, 144, 1); ctx.fillRect(bx - 76, by + 3, 144, 1);
    /* a stone for them to stand on, so the feet are not left in the air */
    ctx.fillStyle = '#2b2740'; ctx.fillRect(bx - 26, by + 1, 52, 2);
    if (G.profPreview) {
      G.profPreview.x = bx - G.profPreview.w / 2;
      G.profPreview.y = by - G.profPreview.h;
      G.profPreview.face = 1;
      G.profPreview.vx = 1.6;                      /* so the cloth streams */
      G.profPreview.grounded = true;
      G.profPreview.updateCape(G.dt);
      /* the whole figure is blown up about the feet, cloth and all */
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(sc, sc);
      ctx.translate(-bx, -by);
      G.profPreview.drawCape(ctx);
      const img = Art.hero.walk[Math.floor(G.profT / 0.085) % 8];
      blit(ctx, img, bx, by, Art.hero.anchor.x, Art.hero.anchor.y, false, 1, 1, 0);
      ctx.restore();
    }
  }

  const rr2 = profRandomRect();
  uiButton(rr2, 'SURPRISE ME', Input.over(rr2));
  if (G.profMsgT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.profMsgT * 2);
    drawText(ctx, G.profMsg, PROF_BOX.x + 88, PROF_BOX.y + PROF_BOX.h - 20,
             '#ffd04a', 1, 'center', '#2a1a10');
    ctx.restore();
  }
  if (G.settingsOpen) drawSettings();
  if (G.flashAmt > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, G.flashAmt); ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VW, VH); ctx.restore();
  }
}

/* ============================================================
   QUESTS — standing tasks, read from the chart, paid in coins
   and free-upgrade tickets
   ============================================================ */
const QUESTS = [
  { id: 'kill25',  name: 'FIRST BLOOD',    goal: 25,  coins: 150,  stat: 'kills',    unit: 'FELLED' },
  { id: 'kill150', name: 'WOODSMAN',       goal: 150, coins: 700,  stat: 'kills',    unit: 'FELLED' },
  { id: 'kill500', name: 'SLAYER',         goal: 500, tickets: 1,  stat: 'kills',    unit: 'FELLED' },
  { id: 'paper6',  name: 'PAPER TRAIL',    goal: 6,   coins: 500,  stat: 'papers',   unit: 'PAPERS' },
  { id: 'paperAll', name: 'ARCHIVIST',     goal: 18,  tickets: 3,  stat: 'papers',   unit: 'PAPERS' },
  { id: 'realm2',  name: 'TWO REALMS DOWN', goal: 2,  coins: 600,  stat: 'realms',   unit: 'CLEARED' },
  { id: 'realm5',  name: 'HALF THE ROAD',  goal: 5,   tickets: 2,  stat: 'realms',   unit: 'CLEARED' },
  { id: 'realm9',  name: 'THE WHOLE ROAD', goal: 9,   tickets: 5,  stat: 'realms',   unit: 'CLEARED' },
  { id: 'up12',    name: 'WELL ARMED',     goal: 12,  coins: 900,  stat: 'upgrades', unit: 'UPGRADES' },
  { id: 'chain10', name: 'TEN IN A ROW',   goal: 10,  tickets: 1,  stat: 'combo',    unit: 'HIT CHAIN' }
];
/* ---- the day's tasks, five of them, new every morning ---- */
const DAILY_POOL = [
  { id: 'dKill',  name: 'CULL THE WILDS',   stat: 'kills',    goal: 40,   coins: 400,  unit: 'FELLED' },
  { id: 'dCoin',  name: 'FILL THE PURSE',   stat: 'earned',   goal: 1200, coins: 500,  unit: 'COINS' },
  { id: 'dSpec',  name: 'CUT AND TUMBLE',   stat: 'specials', goal: 25,   coins: 450,  unit: 'SPECIALS' },
  { id: 'dPaper', name: 'A SCRAP OF PAPER', stat: 'papers',   goal: 1,    tickets: 1,  unit: 'PAPERS' },
  { id: 'dRealm', name: 'TAKE A REALM',     stat: 'realms',   goal: 1,    tickets: 2,  unit: 'CLEARED' },
  { id: 'dUp',    name: 'VISIT THE PEDLAR', stat: 'bought',   goal: 3,    coins: 350,  unit: 'BOUGHT' }
];
/* the player's own day, not the clock's */
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
/* the same five for everyone on the same day, and different ones tomorrow */
function dailyPick() {
  const key = todayKey();
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rng = new RNG(h >>> 0);
  const pool = DAILY_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = rng.i(0, i); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  return pool.slice(0, 5);
}
function rawStat(stat) {
  switch (stat) {
    case 'kills': return G.stats.kills || 0;
    case 'earned': return G.stats.coins || 0;
    case 'specials': return G.stats.specials || 0;
    case 'papers': return Object.keys(G.codes.found || {}).length;
    case 'realms': return (G.cleared || []).filter(Boolean).length;
    case 'bought': return G.stats.bought || 0;
  }
  return 0;
}
/* roll the day over, taking a reading of every counter to measure against */
function refreshDaily() {
  if (!G.quests.daily) G.quests.daily = { day: '', base: {}, claimed: {} };
  const d = G.quests.daily;
  if (d.day === todayKey()) return;
  d.day = todayKey();
  d.claimed = {};
  d.base = {};
  for (const q of DAILY_POOL) d.base[q.stat] = rawStat(q.stat);
}
function dailyList() { refreshDaily(); return dailyPick(); }
function dailyValue(q) {
  refreshDaily();
  const base = G.quests.daily.base[q.stat] || 0;
  return Math.max(0, rawStat(q.stat) - base);
}
function dailyDone(q) { return dailyValue(q) >= q.goal; }
function dailyClaimed(q) { refreshDaily(); return !!G.quests.daily.claimed[q.id]; }
function dailyReady() {
  let n = 0;
  for (const q of dailyList()) if (dailyDone(q) && !dailyClaimed(q)) n++;
  return n;
}
function claimDaily(q) {
  if (!dailyDone(q) || dailyClaimed(q)) { Snd.uiBad(); return; }
  G.quests.daily.claimed[q.id] = true;
  if (q.tickets) G.codes.tickets += q.tickets;
  else if (G.player) G.player.coins += q.coins;
  Snd.buy(); G.flash(0.3);
  G.questMsg = 'TAKEN - ' + questReward(q); G.questMsgT = 2.6;
  G.saveGame();
}

function questValue(stat) {
  const p = G.player;
  switch (stat) {
    case 'kills': return G.stats.kills || 0;
    case 'papers': return Object.keys(G.codes.found || {}).length;
    case 'realms': return (G.cleared || []).filter(Boolean).length;
    case 'upgrades': {
      let n = 0;
      if (p) for (const it of SHOP_ITEMS) { if (it.key !== 'tonic') n += (p.up[it.key] || 0); }
      return n;
    }
    case 'combo': return G.comboBest || 0;
  }
  return 0;
}
function questDone(q) { return questValue(q.stat) >= q.goal; }
function questClaimed(q) { return !!(G.quests && G.quests.claimed && G.quests.claimed[q.id]); }
/* how many rewards are sitting there waiting to be taken */
function questsReady() {
  let n = 0;
  for (const q of QUESTS) if (questDone(q) && !questClaimed(q)) n++;
  return n;
}
function questReward(q) {
  return q.tickets ? (q.tickets + ' TICKET' + (q.tickets > 1 ? 'S' : '')) : (q.coins + ' COINS');
}
function claimQuest(q) {
  if (!questDone(q) || questClaimed(q)) { Snd.uiBad(); return; }
  G.quests.claimed[q.id] = true;
  if (q.tickets) G.codes.tickets += q.tickets;
  else if (G.player) G.player.coins += q.coins;
  Snd.buy(); G.flash(0.3);
  G.questMsg = 'TAKEN - ' + questReward(q); G.questMsgT = 2.6;
  G.saveGame();
}

const QUEST_BOX_PC = { x: 28, y: 8, w: 328, h: 200 };
const QUEST_BOX_MOB = { x: 4, y: 6, w: 376, h: 204 };
function questBox() { return G.mobile ? QUEST_BOX_MOB : QUEST_BOX_PC; }
function questRowRect(i) {
  const B = questBox();
  return { x: B.x + 8, y: B.y + 40 + i * 15, w: B.w - 16, h: 14 };
}
function questCloseRect() { const B = questBox(); return { x: B.x + B.w - 18, y: B.y + 5, w: 13, h: 13 }; }
const QUEST_TABS = ['STANDING', 'TODAY'];
function questTabRect(i) { const B = questBox(); return { x: B.x + 10 + i * 74, y: B.y + 22, w: 70, h: 13 }; }
function questRows() { return G.questTab ? dailyList() : QUESTS; }
function updateQuests(dt) {
  G.questMsgT = Math.max(0, (G.questMsgT || 0) - dt);
  if (Input.hit('Escape')) { G.questsOpen = false; Snd.ui(); return; }
  const cr = questCloseRect();
  G.questOverClose = Input.over(cr);
  if (Input.tap(cr)) { G.questsOpen = false; Snd.ui(); return; }
  for (let i = 0; i < QUEST_TABS.length; i++) {
    if (Input.tap(questTabRect(i))) { G.questTab = i; G.questSel = -1; Snd.ui(); return; }
  }
  const rows = questRows();
  G.questSel = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = questRowRect(i);
    if (Input.over(r)) G.questSel = i;
    if (Input.tap(r)) {
      if (G.questTab) claimDaily(rows[i]); else claimQuest(rows[i]);
      return;
    }
  }
}
function drawQuests() {
  const B = questBox();
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,16,0.76)'; ctx.fillRect(0, 0, VW, VH);
  panel(ctx, B.x, B.y, B.w, B.h);
  drawText(ctx, 'QUESTS', B.x + 10, B.y + 9, '#f2e2b8', 1, 'left', '#000000');
  const daily = !!G.questTab;
  const ready = daily ? dailyReady() : questsReady();
  drawText(ctx, ready ? ready + ' READY TO TAKE' : 'TICKETS ' + G.codes.tickets,
           B.x + B.w - 24, B.y + 9, ready ? '#6fc46a' : '#a9b3c9', 1, 'right');
  const cr = questCloseRect();
  ctx.fillStyle = G.questOverClose ? '#c9403a' : '#3a3350';
  ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
  drawText(ctx, 'X', cr.x + 4, cr.y + 3, '#f2e2b8', 1, 'left');

  for (let i = 0; i < QUEST_TABS.length; i++) {
    const r = questTabRect(i), on = (G.questTab || 0) === i;
    const n = i ? dailyReady() : questsReady();
    ctx.fillStyle = on ? '#3a3350' : '#1d1930';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = on ? '#c68e3f' : '#2b2740';
    ctx.fillRect(r.x, r.y, r.w, 1);
    drawText(ctx, QUEST_TABS[i], r.x + r.w / 2 - (n ? 5 : 0), r.y + 3,
             on ? '#ffeec0' : '#7f8aa3', 1, 'center');
    if (n) { ctx.fillStyle = '#6fc46a'; ctx.fillRect(r.x + r.w - 13, r.y + 3, 7, 7);
             drawText(ctx, String(Math.min(9, n)), r.x + r.w - 11, r.y + 4, '#12200e', 1, 'left'); }
  }
  if (daily) drawText(ctx, 'NEW TASKS EACH DAY', B.x + B.w / 2 + 40, B.y + 25, '#6d7994', 1, 'center');

  questRows().forEach((q, i) => {
    const r = questRowRect(i);
    const have = daily ? dailyValue(q) : questValue(q.stat);
    const done = have >= q.goal;
    const taken = daily ? dailyClaimed(q) : questClaimed(q);
    const hot = G.questSel === i;
    ctx.fillStyle = taken ? '#1a2418' : (done ? (hot ? '#3c5a40' : '#2f4a34') : (hot ? '#332c4c' : '#211c32'));
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (done && !taken) {
      ctx.fillStyle = '#6fc46a';
      ctx.fillRect(r.x, r.y, r.w, 1); ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
    }
    /* four columns that never meet: name, bar, tally, reward */
    drawText(ctx, q.name, r.x + 5, r.y + 4, taken ? '#5b7a58' : (done ? '#ffeec0' : '#c9d4e8'), 1, 'left');
    const px = r.x + 106, bw = 58;
    ctx.fillStyle = '#12101c'; ctx.fillRect(px - 1, r.y + 4, bw + 2, 7);
    ctx.fillStyle = '#2b2740'; ctx.fillRect(px, r.y + 5, bw, 5);
    ctx.fillStyle = taken ? '#4a6a48' : (done ? '#6fc46a' : '#c68e3f');
    ctx.fillRect(px, r.y + 5, Math.round(bw * clamp(have / q.goal, 0, 1)), 5);
    drawText(ctx, Math.min(have, q.goal) + '/' + q.goal, px + bw + 6, r.y + 4,
             taken ? '#5b7a58' : '#a9b3c9', 1, 'left');
    /* the reward, or the word that it is spent */
    drawText(ctx, taken ? 'TAKEN' : (done ? 'CLAIM' : questReward(q)),
             r.x + r.w - 5, r.y + 4,
             taken ? '#5b7a58' : (done ? '#ffe98a' : (q.tickets ? '#6fc46a' : '#c9d4e8')), 1, 'right');
  });

  let foot;
  const rows = questRows();
  if (G.questMsgT > 0) foot = G.questMsg;
  else if (G.questSel >= 0 && rows[G.questSel]) {
    const q = rows[G.questSel];
    const have = daily ? dailyValue(q) : questValue(q.stat);
    const done = have >= q.goal, taken = daily ? dailyClaimed(q) : questClaimed(q);
    foot = (done && !taken) ? 'CLICK TO TAKE ' + questReward(q)
         : have + ' OF ' + q.goal + ' ' + q.unit + '   -   ' + questReward(q);
  } else foot = ready ? 'GREEN ROWS ARE READY - CLICK ONE'
       : (daily ? 'THESE FIVE CHANGE TOMORROW' : 'COME BACK AS YOU GO');
  drawText(ctx, foot, B.x + B.w / 2, B.y + B.h - 13,
           G.questMsgT > 0 ? '#6fc46a' : '#a9b3c9', 1, 'center');
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
  /* seventeen steps, so a full life bar runs to twenty hearts */
  { key: 'heart', name: 'HEART VESSEL', desc: 'ONE MORE HEART ON YOUR LIFE BAR',
    base: 20, mul: 1.42, max: 17, fixed: true, icon: () => Art.item.heart.full },
  { key: 'sword', name: 'WHETSTONE', desc: 'THE BLADE BITES DEEPER AND REACHES FURTHER', base: 17, mul: 1.48, max: 4, icon: () => Art.item.sword },
  { key: 'speed', name: 'SWIFT BOOTS', desc: 'RUN FASTER THROUGH WOOD AND MAZE', base: 22, mul: 1.48, max: 3, icon: () => Art.item.boot },
  { key: 'dash', name: 'WINDSTEP CHARM', desc: 'THE DASH CARRIES YOU FURTHER', base: 26, mul: 1.5, max: 3, icon: () => Art.item.ring },
  { key: 'magnet', name: 'LODESTONE', desc: 'COINS COME FROM FURTHER OFF, STRAIGHT THROUGH ROCK', base: 15, mul: 1.5, max: 3, icon: () => Art.item.magnet },
  { key: 'armour', name: 'WARD CHARM', desc: 'A CHANCE TO SHRUG OFF ANY BLOW', base: 28, mul: 1.5, max: 3, icon: () => Art.item.ward },
  /* eight steps of a quarter each: 1.25x at the first, 3x at the last.
     20 coins for the first step, 150 for the last. */
  { key: 'special', name: 'DUELLISTS SIGIL', desc: 'THE FLIP, THE ROLL CUT AND THE DIVE ALL BITE HARDER',
    base: 20, mul: 1.3335, max: 8, fixed: true, icon: () => Art.item.sigil },
  { key: 'wings', name: 'STORMFEATHER WINGS', desc: 'A SECOND JUMP IN MID AIR', base: 850, mul: 1, max: 1, relic: true, unlockAt: 1, icon: () => Art.item.wings },
  { key: 'mantle', name: 'RIPTIDE MANTLE', desc: 'YOUR DASH CUTS CLEAN THROUGH ANYTHING IT TOUCHES', base: 3600, mul: 1, max: 1, relic: true, unlockAt: 3, icon: () => Art.item.mantle },
  { key: 'emberheart', name: 'THE EMBERHEART', desc: 'EVERY SWORD SWING LOOSES A BURNING WAVE', base: 9000, mul: 1, max: 1, relic: true, unlockAt: 6, icon: () => Art.item.emberheart },
  { key: 'sandstep', name: 'THE SANDSTEP', desc: 'WALK INTO QUICKSAND AND FALL THROUGH TO THE VAULT BELOW',
    base: 50000, mul: 1, max: 1, relic: true, unlockAt: 12, icon: () => Art.item.sandstep },
  { key: 'tonic', name: 'FOREST TONIC', desc: 'DRINK NOW AND REFILL EVERY HEART', base: 8, mul: 1.0, max: 99, icon: () => Art.item.potion }
];
function shopLevel(it) { const p = G.player; return it.key === 'tonic' ? 0 : (p.up[it.key] || 0); }
/* every realm you open lets the pedlar carry a deeper stock, except for the
   rows whose steps are fixed: the tonic, the relics and the sigil */
/* The pedlar's stock no longer deepens as realms open. Every row has one
   fixed ceiling, and anything past it is found rather than bought. */
function shopStepped(it) { return it.key !== 'tonic' && !it.relic && !it.fixed; }
function shopMax(it) { return shopStepped(it) ? it.max + 4 : it.max; }
function shopFullMax(it) { return shopMax(it); }
/* relics only appear once you have reached the realm that forges them */
function shopVisible(it) { return it.unlockAt === undefined || G.unlocked > it.unlockAt; }
function shopRows() { return SHOP_ITEMS.filter(shopVisible); }
function shopPrice(it) { return Math.round(it.base * Math.pow(it.mul, shopLevel(it))); }
const SHOP_BOX = { x: 34, y: 6, w: 316, h: 206 };
/* twelve rows and a line at the foot, all inside the panel */
function shopRowRect(i) { return { x: SHOP_BOX.x + 8, y: SHOP_BOX.y + 23 + i * 14, w: SHOP_BOX.w - 16, h: 13 }; }
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
  if (it.key !== 'tonic') G.stats.bought = (G.stats.bought || 0) + 1;
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
  ctx.fillStyle = 'rgba(20,14,10,0.92)';
  ctx.fillRect(SHOP_BOX.x + 1, SHOP_BOX.y + SHOP_BOX.h - 14, SHOP_BOX.w - 2, 13);
  drawText(ctx, d, SHOP_BOX.x + SHOP_BOX.w / 2, SHOP_BOX.y + SHOP_BOX.h - 11, '#a9b3c9', 1, 'center', '#000000');
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
  const bt = clamp(G.buffTier | 0, 0, PRESTIGE_MAX);
  drawText(ctx, bt ? (PRESTIGE_NAME[bt] + ' RUN TAKEN') : 'REALM CLEARED', VW / 2, 40 + bob,
           bt ? PRESTIGE_COL[bt] : '#ffd04a', 3, 'center', '#3a1c08');
  drawText(ctx, World.LEVELS[G.level].name + (bt ? ' STOOD AND FELL' : ' IS FREE'),
           VW / 2, 66, '#f2e2b8', 1, 'center', '#000000');
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

/* the way into the wardrobe, in the corner opposite the cog */

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
    /* the wardrobe is reached from the profile now, not from here */
    T.hover = !T.overGear &&
              Math.abs(Input.mx - VW / 2) < w / 2 && Math.abs(Input.my - T.btnY) < h / 2;
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
  drawText(ctx, 'FIVE CHAPTERS, FIFTEEN REALMS', VW / 2, 64 + bob, '#f6ecd0', 1, 'center', '#2a1a10');

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
  else if (G.state === 'title') { drawTitle(); drawCursor(); }
  else if (G.state === 'wardrobe') { drawWardrobe(); drawCursor(); }
  else if (G.state === 'archipelago') { drawArchipelago(); drawCursor(); }
  else if (G.state === 'store') { drawStore(); drawCursor(); }
  else if (G.state === 'files') { drawFiles(); drawCursor(); }
  else if (G.state === 'profile') { drawProfile(); drawCursor(); }
  else if (G.state === 'map') { drawMap(); drawCursor(); }
  else drawWorld();
}

if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
