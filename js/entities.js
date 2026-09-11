/* ============================================================
   entities.js — the hero, the beasts, pickups and effects.
   ============================================================ */
'use strict';

/* a solid white copy of a sprite, built once and kept, so a struck creature
   can flash the whole of its silhouette rather than merely brighten */
const _whiteCache = new WeakMap();
function whiteSprite(img) {
  let c = _whiteCache.get(img);
  if (c) return c;
  c = mkc(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, img.width, img.height);
  _whiteCache.set(img, c);
  return c;
}

function blit(c2, img, x, y, ax, ay, flip, alpha, scale, rot) {
  if (!img) return;
  c2.save();
  if (alpha !== undefined && alpha < 1) c2.globalAlpha = Math.max(0, alpha);
  c2.translate(Math.round(x), Math.round(y));
  if (rot) c2.rotate(rot);
  if (scale && scale !== 1) c2.scale(scale, scale);
  if (flip) c2.scale(-1, 1);
  c2.drawImage(img, -Math.round(ax), -Math.round(ay));
  c2.restore();
}

/* ============================================================
   particles and floating text
   ============================================================ */
class Particle {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.life = o.life || 0.5; this.max = this.life;
    this.col = o.col || '#ffffff'; this.col2 = o.col2 || null;
    this.size = o.size || 1; this.grav = o.grav === undefined ? 0.18 : o.grav;
    this.drag = o.drag === undefined ? 1 : o.drag;
    this.type = o.type || 'rect'; this.rot = o.rot || 0; this.spin = o.spin || 0;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.grav * 60 * dt;
    this.vx *= Math.pow(this.drag, dt * 60);
    this.vy *= Math.pow(this.drag, dt * 60);
    this.x += this.vx * 60 * dt; this.y += this.vy * 60 * dt;
    this.rot += this.spin * dt;
    if (this.type === 'leaf') { this.x += Math.sin(this.life * 6) * 0.5; this.vy = Math.min(this.vy, 0.5); }
  }
  draw(c2) {
    const t = this.life / this.max;
    let col = this.col;
    if (this.col2 && t < 0.5) col = this.col2;
    c2.fillStyle = col;
    const s = Math.max(1, Math.round(this.size * (this.type === 'spark' ? 1 : (0.4 + t * 0.6))));
    if (this.type === 'disc' || this.type === 'fire') {
      const r = Math.max(1, this.size * (this.type === 'fire' ? t : (0.4 + t * 0.6)));
      c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), r, 0, TAU); c2.fill();
    } else {
      c2.fillRect(Math.round(this.x - s / 2), Math.round(this.y - s / 2), s, s);
    }
  }
}
class FloatText {
  constructor(x, y, txt, col) { this.x = x; this.y = y; this.txt = txt; this.col = col || '#ffe98a'; this.life = 0.9; this.dead = false; }
  update(dt) { this.life -= dt; this.y -= 22 * dt; if (this.life <= 0) this.dead = true; }
  draw(c2) {
    const a = Math.min(1, this.life * 2.4);
    c2.save(); c2.globalAlpha = a;
    drawText(c2, this.txt, this.x, this.y, this.col, 1, 'center', '#000000');
    c2.restore();
  }
}

/* ============================================================
   PLAYER
   ============================================================ */
const PW = 10, PH = 16;
/* how hard a lodestone draws a coin, whatever level it is */
const COIN_PULL = 4.2;
/* how long before a spinning cut comes round again */
const FLIP_CD = 0.85, ROLLCUT_CD = 0.9;
/* how long the sword must be held before the gale is ready */
const CHARGE_FULL = 0.62;
/* snow is measured every four pixels across a room */
const SNOW_STEP = 4;

class Player {
  constructor() {
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.w = PW; this.h = PH;
    this.face = 1; this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
    this.anim = 'idle'; this.animT = 0; this.frame = 0;
    this.maxHp = 6; this.hp = 6;
    this.coins = 0; this.hasKey = false;
    this.dashCd = 0; this.dashT = 0; this.dashVX = 0; this.dashVY = 0; this.dashWasReady = true;
    this.atkT = 0; this.atkHit = null; this.atkCd = 0;
    this.pierceT = 0; this.pierceHit = null; this.pierceWarnT = 0; this.pierceCd = 0;
    this.swimming = false; this.swimT = 0;
    this.crouching = false; this.rollT = 0; this.rollCd = 0; this.rollDir = 1;
    this.spinT = 0; this.spinKind = null; this.spinDir = 1; this.spinHit = null; this.spinSaid = false;
    this.flipCd = 0; this.rollCutCd = 0; this.chain = 0; this.chainT = 0;
    this.chargeT = 0; this.chargeCd = 0; this.chargeRang = false;
    this.wallDir = 0; this.wallT = 0; this.wallCd = 0;
    this.sinkT = 0; this.sinkSaid = false;
    this.tapT = 0; this.flurryT = 0; this.flurryCd = 0; this.flurryHit = null;
    this.heldBy = null; this.heldT = 0; this.heldDmg = 0; this.heldPaid = 0;
    this.heldMode = 'squeeze'; this.slamDir = 0; this.slamHit = false;
    this.burnT = 0; this.burnAcc = 0;
    this.hurtT = 0;
    this.onLadder = false; this.climbT = 0; this.ladderOffT = 0;
    this.invuln = 0; this.landT = 0;
    this.trail = [];
    this.cape = null;
    this.stepT = 0; this.wasGrounded = false; this.inWater = false;
    this.topDir = 0;
    this.up = { sword: 0, speed: 0, dash: 0, magnet: 0, armour: 0, special: 0, wings: 0, mantle: 0, emberheart: 0, sandstep: 0 };
    this.airJumps = 0;
    this.dead = false; this.deadT = 0;
    this.spawnFlash = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  /* Taken up in a Kraken's arm. You are held, squeezed, then thrown clear. */
  seize(by, dur, dmg, mode) {
    if (this.dead || this.heldBy) return;
    this.heldBy = by; this.heldT = dur; this.heldMax = dur;
    this.heldDmg = dmg; this.heldPaid = 0; this.heldStruggle = 0;
    this.spinT = 0; this.rollT = 0; this.pierceT = 0; this.dashT = 0;
    this.vx = 0; this.vy = 0;
    this.heldMode = mode || 'squeeze';
    this.slamDir = 0; this.slamHit = false;
    G.breakCombo();
    G.texts.push(new FloatText(this.cx, this.y - 8,
      this.heldMode === 'slam' ? 'IN THE HAND' : 'SEIZED', '#c9a8ff'));
  }
  /* Fire sticks.  It costs half a heart a second until it burns out, and
     water puts it out at once. */
  ignite(sec) {
    if (this.dead || this.inWater) return;
    const fresh = this.burnT <= 0;
    this.burnT = Math.max(this.burnT, sec);
    if (fresh) {
      Snd.fire();
      G.texts.push(new FloatText(this.cx, this.y - 8, 'ALIGHT', '#ff9a4a'));
    }
  }
  updateBurn(dt) {
    if (this.burnT <= 0) return;
    if (this.inWater) {
      this.burnT = 0; this.burnAcc = 0;
      for (let i = 0; i < 10; i++) G.particles.push(new Particle({
        x: this.cx + rr(-6, 6), y: this.cy + rr(-8, 8), vx: rr(-1, 1), vy: rr(-1.6, -0.2),
        life: rr(0.2, 0.5), col: '#dfe8f4', col2: '#8fd0ff', size: rr(1, 2.4), grav: -0.02
      }));
      return;
    }
    /* the frost bead makes the fire burn out twice as fast */
    const fast = (G.hasArtifact && G.hasArtifact('frostbead')) ? 2 : 1;
    this.burnT = Math.max(0, this.burnT - dt * fast);
    this.burnAcc += dt;
    /* half a heart a second, and the tuck does not turn it aside */
    while (this.burnAcc >= 1) {
      this.burnAcc -= 1;
      this.hp -= 1;
      Snd.hurt(); G.shake(2);
      if (this.hp <= 0) { this.hp = 0; this.die(); return; }
    }
    if (Math.random() < dt * 34) G.particles.push(new Particle({
      x: this.cx + rr(-5, 5), y: this.y + rr(2, this.h), vx: rr(-0.4, 0.4), vy: rr(-2, -0.6),
      life: rr(0.2, 0.5), col: rpick(['#ffd06a', '#ff7a2a', '#fff0b0']), col2: '#8a2410',
      size: rr(1, 2.4), grav: -0.02, type: 'fire'
    }));
  }
  updateHeld(dt) {
    const by = this.heldBy;
    if (!by || by.dead || by.dying) { this.release(true); return; }
    if (this.heldMode === 'slam') { this.updateSlam(dt, by); return; }
    this.heldT -= dt;
    /* held out in front of the maw, shaken about */
    const dir = by.face || 1;
    const sc = by.scale || 1;
    const tx = by.x + dir * 26 * sc, ty = by.y - 44 * sc;
    this.x = lerp(this.x, tx - this.w / 2, 0.35) + rr(-1.4, 1.4);
    this.y = lerp(this.y, ty - this.h / 2, 0.35) + rr(-1.4, 1.4);
    this.vx = 0; this.vy = 0; this.grounded = false;
    /* mash any way key to shorten the squeeze */
    if (Input.actHit('left') || Input.actHit('right') || Input.actHit('up') ||
        Input.actHit('down') || Input.actHit('attack')) {
      this.heldStruggle += 0.055;
      this.heldT -= 0.055;
      G.particles.push(new Particle({
        x: this.cx + rr(-8, 8), y: this.cy + rr(-8, 8), vx: rr(-2, 2), vy: rr(-2, 2),
        life: rr(0.15, 0.3), col: '#ffeec0', col2: '#c68e3f', size: rr(1, 2), grav: 0
      }));
    }
    /* the damage is paid out across the squeeze, not all at once */
    const want = Math.round(this.heldDmg * clamp(1 - this.heldT / this.heldMax, 0, 1));
    if (want > this.heldPaid) {
      const n = want - this.heldPaid;
      this.heldPaid = want;
      this.hp -= n;
      this.invuln = 0;
      Snd.hurt(); G.shake(4);
      for (let i = 0; i < 10; i++) G.particles.push(new Particle({
        x: this.cx, y: this.cy, vx: rr(-2.6, 2.6), vy: rr(-2.6, 1), life: rr(0.25, 0.5),
        col: '#e8433f', col2: '#7a1e22', size: rr(1, 2.4), grav: 0.2
      }));
      if (this.hp <= 0) { this.hp = 0; this.release(false); this.die(); return; }
    }
    if (this.heldT <= 0) this.release(true);
  }
  /* Ifrit lifts you overhead, then throws you the length of the hall.  The
     wall pays the whole blow at once. */
  updateSlam(dt, by) {
    this.heldT -= dt;
    const room = G.room;
    const lift = this.heldMax * 0.45;
    if (this.heldT > lift) {
      const tx = by.x, ty = by.y - 78 * (by.scale || 1);
      this.x = lerp(this.x, tx - this.w / 2, 0.3) + rr(-1.6, 1.6);
      this.y = lerp(this.y, ty - this.h / 2, 0.3) + rr(-1.6, 1.6);
      this.vx = 0; this.vy = 0; this.grounded = false;
      if (Math.random() < 0.6) G.particles.push(new Particle({
        x: this.cx + rr(-10, 10), y: this.cy + rr(-10, 10), vx: rr(-1.6, 1.6), vy: rr(-2, 0),
        life: rr(0.16, 0.4), col: '#ffd06a', col2: '#8a2410', size: rr(1, 2.4), grav: -0.01, type: 'fire'
      }));
      return;
    }
    if (!this.slamDir) {
      /* thrown at the nearer of the two walls */
      this.slamDir = (this.cx < room.pxW() / 2) ? -1 : 1;
      Snd.slam(); G.shake(8);
    }
    const step = 13 * dt * 60;
    const nx = this.x + this.slamDir * step;
    const wall = room.boxSolid(nx, this.y, this.w, this.h) ||
                 nx < 2 || nx + this.w > room.pxW() - 2;
    if (wall || this.heldT <= 0) {
      if (!this.slamHit) {
        this.slamHit = true;
        this.heldBy = null; this.heldT = 0; this.heldMode = 'squeeze';
        this.invuln = 0;
        this.hurt(this.heldDmg, this.cx - this.slamDir * 20, this.cy);
        this.vx = -this.slamDir * 3.4; this.vy = -3.2; this.hurtT = 0.4;
        this.invuln = Math.max(this.invuln, 1.0);
        Snd.slam(); G.shake(14); G.flash(0.3); G.hitStop(0.1);
        for (let i = 0; i < 34; i++) G.particles.push(new Particle({
          x: this.cx, y: this.cy, vx: -this.slamDir * rr(1, 6) + rr(-2, 2), vy: rr(-5, 2),
          life: rr(0.3, 0.8), col: rpick(['#c9c2b4', '#8a8478', '#ffd06a']), col2: '#3a3630',
          size: rr(1.4, 3.4), grav: 0.24
        }));
      }
      return;
    }
    this.x = nx;
    this.vx = 0; this.vy = 0; this.grounded = false;
    for (let i = 0; i < 2; i++) G.particles.push(new Particle({
      x: this.cx - this.slamDir * rr(2, 12), y: this.cy + rr(-8, 8),
      vx: -this.slamDir * rr(1, 3), vy: rr(-1, 1), life: rr(0.12, 0.3),
      col: '#ffd06a', col2: '#8a2410', size: rr(1, 2.6), grav: 0, type: 'fire'
    }));
  }
  release(thrown) {
    const by = this.heldBy;
    this.heldBy = null; this.heldT = 0;
    if (!thrown || !by) return;
    const dir = -(by.face || 1);
    this.vx = dir * 5.4; this.vy = -4.4;
    this.invuln = Math.max(this.invuln, 1.0);
    this.hurtT = 0.24;
    Snd.hurt(); G.shake(5);
  }
  place(x, y) {
    this.h = PH;
    this.cape = null;
    this.heldBy = null; this.heldT = 0;
    this.crouching = false; this.rollT = 0; this.rollCd = 0; this.hurtT = 0;
    this.spinT = 0; this.spinKind = null; this.spinHit = null;
    this.x = x - this.w / 2; this.y = y - this.h;
    this.vx = this.vy = 0; this.trail.length = 0; this.spawnFlash = 0.4;
  }
  /* the boots help, but they no longer turn the hero into a bolt: the gain
     tails off and stops at half again the base pace */
  get speedMax() {
    const base = (G.room && G.room.mode === 'top' ? 1.55 : 2.15);
    return base * (1 + Math.min(0.25, this.up.speed * 0.025));
  }
  /* a crouch and a roll both shrink the body, so you fit under a low gap */
  get lowH() { return 10; }
  /* shrink from the feet up, so the boots stay planted */
  setHeight(h) {
    if (this.h === h) return;
    this.y += this.h - h;
    this.h = h;
  }
  /* is there room overhead to stand up again */
  canStand() {
    if (this.h >= PH) return true;
    return !G.room.boxSolid(this.x, this.y - (PH - this.h), this.w, PH);
  }
  startRoll(dir) {
    if (this.dead || this.rollT > 0 || this.rollCd > 0) return;
    if (this.dashT > 0 || this.pierceT > 0 || this.onLadder || this.swimming) return;
    if (!this.grounded || G.room.mode !== 'side') return;
    this.rollT = 0.42; this.rollCd = 0.62;
    this.rollDir = dir; this.face = dir;
    this.vx = dir * (3.9 * (1 + this.up.speed * 0.10));
    this.atkT = 0; this.atkHit = null;
    /* the tuck carries you through a blow, but only for the first half */
    this.invuln = Math.max(this.invuln, 0.24);
    Snd.step(1.4);
    for (let i = 0; i < 10; i++) G.particles.push(new Particle({
      x: this.cx - dir * 4 + rr(-3, 3), y: this.y + this.h, vx: -dir * rr(0.6, 2.2), vy: rr(-1.2, -0.1),
      life: rr(0.2, 0.45), col: '#e0d6b6', col2: '#95886a', size: rr(1, 2.2), grav: 0.12
    }));
  }
  /* The windstep charm carries the dash further.  It does not bring the dash
     back any sooner: the wait is the same at every step. */
  get dashCdMax() { return 1.15 * (G.hasArtifact && G.hasArtifact('saltvial') ? 0.67 : 1); }
  get dashSpan() { return Math.min(0.34, 0.16 * (1 + this.up.dash * 0.16)); }
  /* the lodestone reaches further with every step, but never pulls harder:
     the draw itself is the same whatever you have bought */
  get magnetR() { return 62 + this.up.magnet * 24; }
  /* the whetstone bites half as deep as it used to: a step is worth half a
     point, not a whole one */
  get atkDmg() {
    return 2 + Math.floor(this.up.sword * 0.5) +
           (G.hasArtifact && G.hasArtifact('emberchip') ? 1 : 0);
  }
  /* Hold the sword rather than tapping it and the blade gathers the air.
     Let go on a full charge and it goes out as a blade of wind. */
  get charged() { return this.chargeT >= CHARGE_FULL; }
  updateCharge(dt) {
    this.chargeCd = Math.max(0, this.chargeCd - dt);
    /* the gale is thrown in the maze too, where it goes the way you face */
    const may = !this.dead && !this.heldBy &&
                (G.room.mode === 'side' || G.room.mode === 'top') &&
                this.dashT <= 0 && this.pierceT <= 0 && !this.onLadder && !this.swimming;
    if (Input.act('attack') && may && this.chargeCd <= 0) {
      const was = this.charged;
      this.chargeT += dt;
      if (this.charged && !was) {
        this.chargeRang = true;
        Snd.dashReady(); G.flash(0.12);
      }
      if (this.chargeT > 0.16) {
        /* the air drawing in toward the blade */
        const n = this.charged ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const a = rr(0, TAU), r = this.charged ? rr(16, 26) : rr(10, 20);
          G.particles.push(new Particle({
            x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r,
            vx: -Math.cos(a) * rr(1.4, 3.4), vy: -Math.sin(a) * rr(1.4, 3.4),
            life: rr(0.12, 0.26), col: this.charged ? '#ffffff' : '#dff0ff',
            col2: '#8fd0ff', size: rr(1, 2.2), grav: 0, drag: 0.9
          }));
        }
      }
      return;
    }
    if (this.chargeT >= CHARGE_FULL && may) this.releaseCharge();
    this.chargeT = 0; this.chargeRang = false;
  }
  /* which way a gale goes: along the ground from the side, and at whatever
     the blade points to in the maze */
  galeAim() {
    if (G.room.mode !== 'top') return { x: this.face, y: 0 };
    const d = this.topDir;
    return { x: [0, -1, 0, 1][d], y: [1, 0, -1, 0][d] };
  }
  releaseCharge() {
    this.chargeCd = 0.45;
    this.atkT = 0.001; this.atkHit = new Set(); this.atkCd = 0.3;
    const dmg = Math.max(2, Math.round(this.atkDmg * 2));
    const a = this.galeAim();
    G.waves.push(new WindSwipe(this.cx + a.x * 10, this.cy + a.y * 10, a, dmg));
    /* the gale carries the emberheart fire half again as far */
    if (this.up.emberheart > 0) {
      G.waves.push(new Wave(this.cx + a.x * 12, this.cy + a.y * 12, a, this.atkDmg, GALE_RANGE));
      Snd.fire();
    }
    if (this.grounded && G.room.mode === 'side') this.vx += this.face * 1.4;
    Snd.swing(); Snd.spinCut(); G.shake(5); G.hitStop(0.05);
    G.texts.push(new FloatText(this.cx, this.y - 8, 'GALE', '#dff0ff'));
    for (let i = 0; i < 22; i++) {
      const sp = rr(3, 7), off = rr(-0.7, 0.7);
      const c = Math.cos(off), sn = Math.sin(off);
      G.particles.push(new Particle({
        x: this.cx + a.x * 10 + rr(-8, 8) * a.y, y: this.cy + a.y * 10 + rr(-8, 8) * a.x,
        vx: (a.x * c - a.y * sn) * sp, vy: (a.x * sn + a.y * c) * sp,
        life: rr(0.2, 0.5), col: '#ffffff', col2: '#8fd0ff', size: rr(1, 2.6), grav: 0, drag: 0.92
      }));
    }
  }
  /* the sigil sharpens the moves that come out of a dive or a spin:
     the air pierce, the flip cut and the roll cut. A quarter a step. */
  get specialMult() {
    const stone = (G.hasArtifact && G.hasArtifact('riddlestone')) ? 0.5 : 0;
    return 1 + (this.up.special || 0) * 0.25 + stone;
  }
  /* and one special straight into the next builds on it: a flip into a dive,
     or a dive into a flip, up to half again by the third link */
  get chainMult() { return 1 + Math.min(3, this.chain) * 0.25; }
  get specialDmg() { return Math.max(1, Math.round(this.atkDmg * this.specialMult * this.chainMult)); }
  linkChain(name) {
    this.chain = Math.min(3, this.chain + 1);
    this.chainT = 1.25;
    if (this.chain > 1) {
      Snd.comboUp();
      G.texts.push(new FloatText(this.cx, this.y - 12, 'CHAIN X' + this.chain, '#8fd0ff'));
      for (let i = 0; i < 12; i++) G.particles.push(new Particle({
        x: this.cx + rr(-8, 8), y: this.cy + rr(-10, 10), vx: rr(-1.6, 1.6), vy: rr(-2, -0.2),
        life: rr(0.2, 0.5), col: '#8fd0ff', col2: '#3f6fd8', size: rr(1, 2.4), grav: 0.02
      }));
    }
    void name;
  }

  hurt(dmg, fromX, fromY) {
    if (this.invuln > 0 || this.dashT > 0 || this.dead) return false;
    /* a blow with no number behind it once turned the hero's health to NaN,
       and NaN is never at or below zero, so they could not die again */
    if (!isFinite(dmg)) dmg = 1;
    dmg = Math.max(1, dmg - (this.up.armour > 0 && Math.random() < this.up.armour * 0.2 ? 1 : 0));
    this.hp -= dmg;
    G.breakCombo();
    this.invuln = 1.15;
    const dx = this.cx - fromX, dy = this.cy - fromY;
    const l = Math.hypot(dx, dy) || 1;
    if (this.spinT > 0) {
      /* a spinning cut carries straight through: the blow still hurts, but it
         neither shoves you nor takes the move away */
      this.crouching = false;
    } else {
      /* mild knockback: enough to feel the blow, short enough to recover from */
      this.vx = dx / l * 2.8; this.vy = G.room.mode === 'top' ? dy / l * 2.8 : -2.3;
      this.hurtT = 0.17;               /* your own steering is muted this long */
      this.rollT = 0; this.crouching = false;
    }
    G.shake(5); G.hitStop(0.09);
    Snd.hurt();
    for (let i = 0; i < 14; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: rr(-3, 3), vy: rr(-3, 1.5), life: rr(0.3, 0.6),
      col: '#e8433f', col2: '#7a1e22', size: rr(1, 2.5), grav: 0.2
    }));
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    return true;
  }
  die() {
    if (this.dead) return;
    this.dead = true; this.deadT = 0;
    Snd.die(); G.shake(8);
    for (let i = 0; i < 40; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: rr(-4, 4), vy: rr(-5, 1), life: rr(0.5, 1.1),
      col: '#48a24f', col2: '#2e6c38', size: rr(1, 3), grav: 0.22
    }));
  }
  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
    for (let i = 0; i < 12; i++) G.particles.push(new Particle({
      x: this.cx + rr(-6, 6), y: this.cy + rr(-8, 8), vx: rr(-.6, .6), vy: rr(-1.6, -0.4),
      life: rr(0.4, 0.9), col: '#ff8b7a', col2: '#e8433f', size: rr(1, 2), grav: -0.02
    }));
  }

  /* The two spinning cuts. Both carry you along faster than you can run,
     both shrug off the knock of a blow, and both pay double coins.
     In the air with a direction held: a front flip.
     Part way through a roll: a low cut that keeps the roll going. */
  get spinning() { return this.spinT > 0; }
  beginSpin(kind, dir, dur, cd) {
    G.stats.specials = (G.stats.specials || 0) + 1;
    this.spinT = dur; this.spinKind = kind; this.spinDir = dir;
    this.spinHit = new Set(); this.spinSaid = false;
    this.face = dir;
    this.atkT = 0; this.atkHit = null; this.atkCd = cd;
    Snd.swing(); Snd.spinCut(); G.shake(2);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU;
      G.particles.push(new Particle({
        x: this.cx + Math.cos(a) * 10, y: this.cy + Math.sin(a) * 10,
        vx: Math.cos(a) * rr(0.6, 2) + dir * 0.8, vy: Math.sin(a) * rr(0.6, 2),
        life: rr(0.16, 0.36), col: '#dff0ff', col2: '#8fb6e8', size: rr(1, 2.2), grav: 0.02, drag: 0.9
      }));
    }
  }
  startFlip(dir) {
    if (this.dead || this.spinT > 0 || this.atkCd > 0 || this.flipCd > 0) return false;
    if (G.room.mode !== 'side' || this.grounded) return false;
    if (this.dashT > 0 || this.pierceT > 0 || this.onLadder || this.swimming || this.inWater) return false;
    this.linkChain('flip');
    this.beginSpin('flip', dir, 0.42, 0.30);
    this.flipCd = FLIP_CD;
    this.vx = dir * this.speedMax * 1.55;
    this.vy = Math.min(this.vy, -1.9);        /* a little lift into the turn */
    G.waves.push(new AirSlash(this.cx + dir * 14, this.cy, dir, this.specialDmg, 'flip'));
    return true;
  }
  startRollCut() {
    if (this.dead || this.spinT > 0 || this.rollT <= 0 || this.rollCutCd > 0) return false;
    if (G.room.mode !== 'side') return false;
    this.linkChain('rollcut');
    this.beginSpin('rollcut', this.rollDir, 0.34, 0.28);
    this.rollCutCd = ROLLCUT_CD;
    this.rollT = Math.max(this.rollT, 0.34);  /* the roll runs on under the cut */
    this.vx = this.rollDir * this.speedMax * 1.75;
    G.waves.push(new AirSlash(this.cx + this.rollDir * 14, this.cy + 2, this.rollDir, this.specialDmg, 'rollcut'));
    return true;
  }
  /* ============================================================
     PHASE GROUND — quicksand and powdered snow.  It looks like ground
     and it is not.  It swallows anyone who steps on it.  The Pharaoh's
     Ring lets you fall straight through, to whatever lies below.
     ============================================================ */
  updateSink(dt) {
    const room = G.room;
    if (room.mode !== 'side' || this.dead) { this.sinkT = 0; return; }
    const inPhase = room.boxPhase(this.x + 2, this.y + this.h - 6, this.w - 4, 8);
    if (!inPhase) {
      if (this.sinkT > 0) this.sinkT = Math.max(0, this.sinkT - dt * 2.4);
      return;
    }
    const ring = G.canPhase && G.canPhase();
    this.sinkT += dt;
    const quick = room.get(Math.floor(this.cx / TILE),
                           Math.floor((this.y + this.h - 2) / TILE)) === T_QUICK;
    const col = quick ? ['#cfb87c', '#7d6636'] : ['#ffffff', '#c3cfe2'];
    for (let i = 0; i < 2; i++) G.particles.push(new Particle({
      x: this.cx + rr(-7, 7), y: this.y + this.h - rr(0, 5),
      vx: rr(-0.7, 0.7), vy: rr(-1.2, -0.1), life: rr(0.2, 0.5),
      col: col[0], col2: col[1], size: rr(1, 2.4), grav: 0.08
    }));
    if (ring) {
      /* the ring carries you down through it, into whatever is below */
      this.vy = Math.max(this.vy, 3.4);
      this.vx *= 0.7;
      if (this.sinkT > 0.55 && G.dropThroughPhase) { this.sinkT = 0; G.dropThroughPhase(quick, this.cx); }
      return;
    }
    /* without it the ground holds you, and it does not let go */
    this.vy = clamp(this.vy, -0.4, 0.55);
    this.vx *= 0.5;
    this.grounded = false;
    this.rollT = 0; this.spinT = 0;
    if (this.sinkT > 0.4 && !this.sinkSaid) {
      this.sinkSaid = true;
      G.texts.push(new FloatText(this.cx, this.y - 6, quick ? 'SINKING' : 'GIVING WAY', '#ffd06a'));
      Snd.hurt();
    }
    if (this.sinkT >= 2.0) { this.sinkT = 0; this.hp = 0; this.die(); }
  }
  /* Fresh snow gives under a boot.  A track stays where you walked, and the
     drift fills it in again over the next few seconds. */
  updateSnow(dt) {
    const room = G.room;
    if (!room.snow) return;
    const step = SNOW_STEP;
    const n = room.snow.length;
    /* the drift creeps back */
    room.snowFill = (room.snowFill || 0) + dt;
    if (room.snowFill > 0.1) {
      /* a track takes the better part of half a minute to fill in again */
      const back = room.snowFill * 0.16;
      room.snowFill = 0;
      for (let i = 0; i < n; i++)
        if (room.snow[i] < room.snowMax[i]) room.snow[i] = Math.min(room.snowMax[i], room.snow[i] + back);
    }
    if (this.dead) return;
    const i0 = Math.max(0, Math.floor((this.x - 1) / step));
    const i1 = Math.min(n - 1, Math.floor((this.x + this.w + 1) / step));
    const foot = this.y + this.h;
    let pushed = 0;
    for (let i = i0; i <= i1; i++) {
      const gy = room.snowGY[i];
      if (gy < 0) continue;
      if (foot < gy - room.snow[i] - 3 || foot > gy + 6) continue;
      const was = room.snow[i];
      if (was <= 0.2) continue;
      room.snow[i] = 0;
      pushed += was;
    }
    /* What a boot pushes out heaps up just clear of the track, never back
       into it, so a track stays a track. */
    if (pushed > 0) {
      for (const j of [i0 - 1, i0 - 2, i1 + 1, i1 + 2]) {
        if (j < 0 || j >= n || room.snowGY[j] < 0) continue;
        const add = pushed * ((j === i0 - 1 || j === i1 + 1) ? 0.16 : 0.08);
        room.snowMax[j] = Math.min(10, room.snowMax[j] + add);
        room.snow[j] = Math.min(room.snowMax[j], room.snow[j] + add);
      }
    }
    if (pushed > 0.6 && Math.random() < 0.7) {
      const dir = Math.sign(this.vx) || 1;
      for (let k = 0; k < 2; k++) G.particles.push(new Particle({
        x: this.cx + rr(-6, 6), y: this.y + this.h - rr(0, 4),
        vx: dir * rr(0.4, 2.0), vy: rr(-1.8, -0.3), life: rr(0.25, 0.6),
        col: '#ffffff', col2: '#c3cfe2', size: rr(1, 2.4), grav: 0.1
      }));
    }
  }
  /* which side a wall stands on: +1 to the right, -1 to the left, 0 for neither */
  wallAt() {
    const room = G.room;
    if (room.mode !== 'side') return 0;
    const y = this.y + 3, h = this.h - 7;
    if (room.boxSolid(this.x + this.w, y, 2, h)) return 1;
    if (room.boxSolid(this.x - 2, y, 2, h)) return -1;
    return 0;
  }
  /* Two taps of the sword, one straight after the other, throw a flurry:
     a pair of crossing cuts with a longer reach than a plain swing. */
  startFlurry() {
    if (this.dead || this.flurryT > 0 || this.flurryCd > 0) return false;
    if (G.room.mode !== 'side') return false;
    this.flurryT = 0.001; this.flurryHit = new Set();
    this.flurryCd = 0.85;
    this.atkT = 0; this.atkCd = 0.2;
    this.chargeT = 0;
    if (this.grounded) this.vx += this.face * 2.4;
    Snd.swing(); Snd.spinCut(); G.shake(3);
    G.texts.push(new FloatText(this.cx, this.y - 6, 'FLURRY', '#dff0ff'));
    return true;
  }
  flurryBox() {
    if (this.flurryT <= 0) return null;
    const reach = 30 + this.up.sword * 1.4;
    return { x: this.face > 0 ? this.x + 2 : this.x + this.w - 2 - reach,
             y: this.y - 4, w: reach, h: this.h + 8 };
  }
  doFlurryHit() {
    const box = this.flurryBox();
    if (!box) return;
    for (const e of G.enemies) {
      if (e.dead || this.flurryHit.has(e)) continue;
      if (!rectsOverlap(box, e.box())) continue;
      this.flurryHit.add(e);
      e.hurt(Math.max(1, Math.round(this.atkDmg * 0.8)), this.cx, this.cy);
      G.hitStop(0.03); G.tutMark('fight');
    }
    for (const pr of G.projectiles) {
      if (pr.dead || pr.friendly || typeof pr.vx !== 'number') continue;
      if (this.flurryHit.has(pr)) continue;
      if (!rectsOverlap(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      this.flurryHit.add(pr);
      deflectShot(pr, this.atkDmg * 2);
      G.addCombo(); G.tutMark('parry');
      Snd.parry(); G.shake(4);
    }
  }
  spinBox() {
    if (this.spinT <= 0) return null;
    if (this.spinKind === 'flip') {
      /* The blade goes right round, so every side of the body bites. It keeps a
         close reach, and a cap holds that reach at the last whetstone step. */
      const rx = Math.min(24, 15 + this.up.sword * 1.2);
      const ry = Math.min(20, 13 + this.up.sword * 1.0);
      return { x: this.cx - rx, y: this.cy - ry, w: rx * 2, h: ry * 2 };
    }
    /* the roll cut keeps the same close reach, capped in the same way */
    const reach = Math.min(30, 17 + this.up.sword * 1.6);
    return { x: this.spinDir > 0 ? this.x - 2 : this.x + this.w + 2 - reach,
             y: this.y - 3, w: reach, h: this.h + 5 };
  }
  doSpinHit() {
    const box = this.spinBox();
    if (!box) return;
    let struck = false;
    for (const e of G.enemies) {
      if (e.dead || this.spinHit.has(e)) continue;
      if (!rectsOverlap(box, e.box())) continue;
      /* the blade goes round the body, not through the rock beside it */
      if (!this.clearHit(box, e.box())) continue;
      this.spinHit.add(e);
      e.hurt(this.specialDmg, this.cx, this.cy, 2);  /* 2 = double the coin drop */
      struck = true; G.tutMark('fight');
    }
    /* a shot caught on a spinning blade goes back the same way */
    for (const pr of G.projectiles) {
      if (pr.dead || pr.friendly || typeof pr.vx !== 'number') continue;
      if (this.spinHit.has(pr)) continue;
      if (!rectsOverlap(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      if (!this.clearHit(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      this.spinHit.add(pr);
      deflectShot(pr, this.specialDmg * 2);
      G.addCombo(); G.tutMark('parry');
      Snd.parry(); G.shake(4); G.hitStop(0.06);
    }
    if (struck) {
      G.hitStop(0.05);
      if (!this.spinSaid) {
        this.spinSaid = true;
        G.texts.push(new FloatText(this.cx, this.y - 4,
          this.spinKind === 'flip' ? 'FLIP X2' : 'ROLL CUT X2', '#ffe98a'));
      }
    }
  }
  startAttack() {
    if (this.atkT > 0 || this.atkCd > 0 || this.dead) return;
    if (G.room.mode === 'top') {
      /* from above there is no left or right to face, so swing at the cursor */
      const a = G.aim(this.cx, this.cy);
      const dx = a.x, dy = a.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.01) {
        this.topDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : (dy > 0 ? 0 : 2);
        if (Math.abs(dx) > Math.abs(dy)) this.face = dx > 0 ? 1 : -1;
      }
    }
    this.atkT = 0.001; this.atkHit = new Set(); this.atkCd = 0.34;
    Snd.swing();
    if (this.up.emberheart > 0 && G.room.mode === 'side') {
      G.waves.push(new Wave(this.cx + this.face * 12, this.cy, this.face, this.atkDmg));
      Snd.fire();
    }
    if (this.grounded && G.room.mode === 'side') this.vx += this.face * 0.9;
  }
  /* the air pierce: dive blade-first, no cooldown, double coins on the kill */
  startPierce() {
    if (this.dead || this.pierceT > 0 || this.dashT > 0) return;
    if (G.room.mode !== 'side' || this.grounded || this.inWater) return;
    if (this.pierceCd > 0) {
      if (this.pierceWarnT <= 0) {
        this.pierceWarnT = 0.6;
        G.texts.push(new FloatText(this.cx, this.y - 6, 'PIERCE COOLING', '#9aa8c4'));
        Snd.uiBad();
      }
      return;
    }
    /* you need room to build up the dive: two clear tiles under your feet.
       Counted in tiles, not pixels, so where the hero rests inside a tile
       cannot change the answer. */
    const col = Math.floor(this.cx / TILE);
    const feetRow = Math.floor((this.y + this.h - 1) / TILE);
    let clear = 0;
    for (let r = feetRow + 1; r < G.room.h && clear < 2; r++) {
      if (G.room.solid(col, r) || G.room.oneway(col, r)) break;
      clear++;
    }
    if (clear < 2) {
      if (this.pierceWarnT <= 0) {
        this.pierceWarnT = 0.7;
        G.texts.push(new FloatText(this.cx, this.y - 6, 'TOO LOW', '#9aa8c4'));
        Snd.uiBad();
      }
      return;
    }
    this.pierceT = 0.001; this.pierceHit = new Set();
    G.stats.specials = (G.stats.specials || 0) + 1;
    this.linkChain('pierce');
    if (G.bossFightOn()) this.pierceCd = 1.0;     /* rationed against a guardian */
    this.atkT = 0; this.atkHit = null;
    this.vy = 7.4; this.vx *= 0.35;
    Snd.pierce(); G.tutMark('pierce');
    for (let i = 0; i < 10; i++) G.particles.push(new Particle({
      x: this.cx + rr(-4, 4), y: this.y + this.h, vx: rr(-1.2, 1.2), vy: rr(-1.6, -0.2),
      life: rr(0.2, 0.45), col: '#dcefff', col2: '#7fb6e8', size: rr(1, 2), grav: 0.05, drag: 0.9
    }));
  }
  pierceBox() {
    return { x: this.x - 3, y: this.y + this.h - 5, w: this.w + 6, h: 15 };
  }
  doPierceHit() {
    const box = this.pierceBox();
    for (const en of G.enemies) {
      if (en.dead || this.pierceHit.has(en)) continue;
      if (!rectsOverlap(box, en.box())) continue;
      this.pierceHit.add(en);
      en.hurt(this.specialDmg, this.cx, this.cy, 2);  /* 2 = double the coin drop */
      this.endPierce(true);
      return;
    }
  }
  endPierce(hit) {
    if (this.pierceT <= 0) return;
    this.pierceT = 0;
    if (hit) {
      this.vy = -4.7; this.grounded = false;
      this.invuln = Math.max(this.invuln, 0.3);
      Snd.pierceHit(); Snd.spinCut(); G.shake(4.5); G.hitStop(0.08);
      /* the landing throws a sheet of air out along the ground */
      G.waves.push(new AirSlash(this.cx, this.y + this.h - 2, this.face, this.specialDmg, 'pierce'));
      G.texts.push(new FloatText(this.cx, this.y - 4, 'PIERCE X2', '#ffe98a'));
      for (let i = 0; i < 20; i++) G.particles.push(new Particle({
        x: this.cx, y: this.y + this.h, vx: rr(-3.4, 3.4), vy: rr(-2.6, 1.4),
        life: rr(0.25, 0.6), col: '#ffeec0', col2: '#c68e3f', size: rr(1, 2.6), grav: 0.18
      }));
    } else {
      G.shake(2);
      for (let i = 0; i < 8; i++) G.particles.push(new Particle({
        x: this.cx + rr(-5, 5), y: this.y + this.h, vx: rr(-2, 2), vy: rr(-1.4, -0.2),
        life: rr(0.2, 0.45), col: '#e0d6b6', col2: '#8f8464', size: rr(1, 2), grav: 0.14
      }));
    }
  }
  startDash() {
    if (this.dashCd > 0 || this.dashT > 0 || this.dead) return;
    const a = G.aim(this.cx, this.cy - 2);
    const dx = a.x, dy = a.y;
    const sp = 6.4;
    this.dashVX = dx * sp; this.dashVY = dy * sp;
    this.dashT = this.dashSpan; this.dashCd = this.dashCdMax; this.dashWasReady = false;
    this.dashHit = this.up.mantle > 0 ? new Set() : null;
    if (Math.abs(dx) > 0.25) this.face = dx > 0 ? 1 : -1;
    Snd.dash(); G.shake(2.5); G.tutMark('dash');
    for (let i = 0; i < 18; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: -dx * rr(1, 4) + rr(-1, 1), vy: -dy * rr(1, 4) + rr(-1, 1),
      life: rr(0.2, 0.5), col: '#cfe8ff', col2: '#6ea8dd', size: rr(1, 2.5), grav: 0.02, drag: 0.9
    }));
  }

  update(dt) {
    const room = G.room;
    if (this.dead) { this.deadT += dt; return; }
    if (this.heldBy) { this.updateHeld(dt); this.updateAnim(dt); return; }
    this.spawnFlash = Math.max(0, this.spawnFlash - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.updateBurn(dt);
    if (this.dead) return;
    this.landT = Math.max(0, this.landT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.pierceWarnT = Math.max(0, this.pierceWarnT - dt);
    this.pierceCd = Math.max(0, this.pierceCd - dt);
    this.ladderOffT = Math.max(0, this.ladderOffT - dt);
    const cdBefore = this.dashCd;
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (cdBefore > 0 && this.dashCd === 0 && !this.dashWasReady) { this.dashWasReady = true; Snd.dashReady(); }

    this.rollCd = Math.max(0, this.rollCd - dt);
    this.flipCd = Math.max(0, this.flipCd - dt);
    this.updateCharge(dt);
    this.rollCutCd = Math.max(0, this.rollCutCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    /* a chain link lapses if you do not follow it up */
    if (this.chainT > 0) { this.chainT -= dt; if (this.chainT <= 0) this.chain = 0; }

    /* --- input --- every direction is read on its own, so any two of them
       can be held or tapped together */
    const L = Input.act('left'), Rk = Input.act('right');
    const U = Input.act('up'), D = Input.act('down');
    if (Input.actHit('dash')) this.startDash();
    if (Input.actHit('pierce')) this.startPierce();
    this.tapT = Math.max(0, this.tapT - dt);
    this.flurryCd = Math.max(0, this.flurryCd - dt);
    if (Input.actHit('attack') || G.clickAttack) {
      const dir = (Rk ? 1 : 0) - (L ? 1 : 0);
      /* two taps inside a quarter of a second throw a flurry */
      const quick = this.tapT > 0;
      this.tapT = 0.26;
      /* mid roll it becomes a roll cut; in the air with a way held, a flip */
      if (this.spinT > 0) { /* one cut at a time */ }
      else if (this.rollT > 0) this.startRollCut();
      else if (quick && this.flurryT <= 0 && this.startFlurry()) { this.tapT = 0; }
      else if (dir && !this.grounded && room.mode === 'side' && !this.inWater &&
               this.dashT <= 0 && this.pierceT <= 0 && !this.onLadder) this.startFlip(dir);
      else this.startAttack();
    }

    /* --- attack timing --- */
    if (this.flurryT > 0) {
      this.flurryT += dt;
      if (this.flurryT > 0.32) { this.flurryT = 0; this.flurryHit = null; }
      else this.doFlurryHit();
    }
    if (this.atkT > 0) {
      this.atkT += dt;
      if (this.atkT > 0.34) { this.atkT = 0; this.atkHit = null; }
      else this.doSwordHit();
    }

    /* --- dash --- */
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = this.dashVX; this.vy = this.dashVY;
      this.trail.push({ x: this.cx, y: this.y + this.h, f: this.frame, anim: this.anim, face: this.face, life: 0.26 });
      if (this.dashHit) {
        /* the mantle turns the dash into a cut */
        const box = { x: this.x - 4, y: this.y - 3, w: this.w + 8, h: this.h + 6 };
        for (const en of G.enemies) {
          if (en.dead || this.dashHit.has(en)) continue;
          if (!rectsOverlap(box, en.box())) continue;
          this.dashHit.add(en);
          en.hurt(this.atkDmg, this.cx, this.cy);
          G.hitStop(0.04);
        }
      }
      for (let i = 0; i < 2; i++) G.particles.push(new Particle({
        x: this.cx + rr(-4, 4), y: this.cy + rr(-6, 6), vx: rr(-0.4, 0.4), vy: rr(-0.4, 0.4),
        life: rr(0.15, 0.35), col: '#dff0ff', col2: '#7fb6e8', size: rr(1, 2), grav: 0, drag: 0.88
      }));
      if (this.dashT <= 0) { this.vx *= 0.42; this.vy *= 0.3; }
    }

    if (room.mode === 'top') {
      /* seen from above there is no crouch, so the body is always full height */
      this.crouching = false; this.rollT = 0;
      if (this.h !== PH) this.setHeight(PH);
      this.updateTop(dt, L, Rk, U, D);
    } else this.updateSide(dt, L, Rk, U, D);

    this.updateSink(dt);
    this.updateSnow(dt);
    this.updateCape(dt);

    /* trail fade */
    for (const t of this.trail) t.life -= dt;
    this.trail = this.trail.filter(t => t.life > 0);

    this.updateAnim(dt);
  }

  updateSide(dt, L, Rk, U, D) {
    const room = G.room;
    const s = dt * 60;
    this.inWater = room.boxWet(this.x, this.y + this.h * 0.4, this.w, this.h * 0.6);
    this.swimming = this.inWater && Input.act('swim') && this.pierceT <= 0 && this.dashT <= 0;
    if (this.swimming || this.dashT > 0 || this.pierceT > 0) this.rollT = 0;

    /* ladders: walk into one to go up it */
    const lad = this.ladderAt();
    const side = lad ? (lad.side || this.face) : 0;
    const into = lad && ((side > 0 && Rk) || (side < 0 && L));
    const away = lad && ((side > 0 && L) || (side < 0 && Rk));
    if (this.onLadder && (!lad || away || this.dashT > 0 || this.pierceT > 0)) {
      this.onLadder = false;
      if (away) this.ladderOffT = 0.25;
    }
    if (!this.onLadder && lad && into && this.ladderOffT <= 0 &&
        this.dashT <= 0 && this.pierceT <= 0 && !this.swimming) {
      this.onLadder = true; this.vx = 0; this.vy = 0;
      Snd.step(0.8);
    }

    if (this.pierceT > 0) {
      this.pierceT += dt;
      this.vy = 7.4;
      this.vx = approach(this.vx, 0, 0.22 * s);
      this.doPierceHit();
      if (Math.random() < 0.9) G.particles.push(new Particle({
        x: this.cx + rr(-3, 3), y: this.y + this.h + rr(0, 8), vx: rr(-0.3, 0.3), vy: rr(-1.4, -0.4),
        life: rr(0.14, 0.3), col: '#ffffff', col2: '#8fb6e8', size: rr(1, 2), grav: 0, drag: 0.9
      }));
    } else if (this.onLadder) {
      /* hold to the rungs: no gravity, and the same key that got you on carries you up */
      const room2 = G.room;
      const feetRow = Math.floor((this.y + this.h - 1) / TILE);
      const ledgeCol = lad.tx + (side || 1);
      const canStepOff = side !== 0 && room2.solid(ledgeCol, feetRow + 1) &&
                         !room2.solid(ledgeCol, feetRow) && !room2.solid(ledgeCol, feetRow - 1);
      this.x = approach(this.x, lad.tx * TILE + (TILE - this.w) / 2, 1.4 * s);
      this.vx = 0;
      if (into && canStepOff) {
        /* at the top, walking on takes you off onto the ledge — and stays off
           long enough to clear the rungs, or the same key would grab them again */
        this.onLadder = false;
        this.ladderOffT = 0.4;
        this.vx = (side || 1) * 2.0;
        this.vy = 0;
      } else if (into) {
        this.vy = -1.55;
      } else if (D) {
        this.vy = 1.9;
      } else {
        this.vy = 0;
      }
      if (Input.actHit('up')) { this.onLadder = false; this.vy = -5.7; Snd.jump(); }
      this.grounded = false;
      this.dropThrough = false;
      if (Math.abs(this.vy) > 0.2) {
        this.climbT -= dt;
        if (this.climbT <= 0) { this.climbT = 0.26; Snd.step(0.6); G.tutMark('climb'); }
      }
    } else if (this.swimming) {
      /* hold S in water to swim freely, with no gravity pulling you down */
      const dx = (Rk ? 1 : 0) - (L ? 1 : 0);
      const dy = (D ? 1 : 0) - (U ? 1 : 0);
      const spd = 1.45 * (1 + this.up.speed * 0.12);
      if (dx || dy) {
        const l = Math.hypot(dx, dy) || 1;
        this.vx = approach(this.vx, dx / l * spd, 0.20 * s);
        this.vy = approach(this.vy, dy / l * spd, 0.20 * s);
        if (dx) this.face = dx > 0 ? 1 : -1;
        this.swimT -= dt;
        if (this.swimT <= 0) {
          this.swimT = 0.42;
          Snd.stroke();
          for (let i = 0; i < 5; i++) G.particles.push(new Particle({
            x: this.cx - this.face * 5 + rr(-3, 3), y: this.cy + rr(-3, 5),
            vx: -this.face * rr(0.3, 1.4), vy: rr(-0.7, 0.3), life: rr(0.25, 0.55),
            col: '#cfeaff', col2: '#5fa3dc', size: rr(1, 2), grav: 0.02, drag: 0.9
          }));
        }
      } else {
        /* tread water: rise to the surface, hold station there and bob gently */
        this.vx = approach(this.vx, 0, 0.13 * s);
        const col = Math.floor(this.cx / TILE);
        /* anchor the scan at the feet, which stay submerged: measuring from the
           middle lets the target latch onto the row above once the hero rises,
           which then drags them clean out of the stream */
        let r = Math.floor((this.y + this.h - 1) / TILE);
        if (!room.wet(col, r)) { while (r < room.h && !room.wet(col, r)) r++; }
        while (r > 0 && room.wet(col, r - 1)) r--;
        const restY = r * TILE - 3 + Math.sin(G.t * 2.0) * 1.6;   /* head above the water */
        this.vy = approach(this.vy, clamp((restY - this.y) * 0.14, -1.2, 1.2), 0.12 * s);
        if (Math.random() < dt * 5) G.particles.push(new Particle({
          x: this.cx + rr(-6, 6), y: this.cy + rr(-2, 4), vx: rr(-0.3, 0.3), vy: rr(-0.3, 0.1),
          life: rr(0.3, 0.7), col: '#cfeaff', col2: '#5fa3dc', size: 1, grav: 0.01, drag: 0.92
        }));
      }
      this.dropThrough = false;
      G.tutMark('swim');
    } else if (this.dashT <= 0) {
      const dir = (Rk ? 1 : 0) - (L ? 1 : 0);
      const canLow = G.room.mode === 'side' && !this.inWater;

      /* --- the spinning cuts, which drive you along themselves --- */
      if (this.spinT > 0) {
        this.spinT -= dt;
        this.doSpinHit();
        const drive = this.spinKind === 'flip' ? 1.40 : 1.55;
        this.vx = approach(this.vx, this.spinDir * this.speedMax * drive, 0.18 * s);
        this.face = this.spinDir;
        if (Math.random() < 0.7) G.particles.push(new Particle({
          x: this.cx - this.spinDir * 6 + rr(-4, 4), y: this.cy + rr(-7, 7),
          vx: -this.spinDir * rr(0.4, 1.8), vy: rr(-0.7, 0.7), life: rr(0.14, 0.32),
          col: '#dff0ff', col2: '#7fb6e8', size: rr(1, 2), grav: 0, drag: 0.9
        }));
        if (this.spinT <= 0) { this.spinKind = null; this.spinHit = null; }
      }

      /* --- the roll: hold the crouch and press a direction --- */
      if (this.rollT > 0) {
        this.rollT -= dt;
        if (this.spinT <= 0) this.vx = approach(this.vx, this.rollDir * 1.2, 0.09 * s);
        this.face = this.rollDir;
        if (this.grounded && Math.random() < 0.5) G.particles.push(new Particle({
          x: this.cx - this.rollDir * 5, y: this.y + this.h - 1,
          vx: -this.rollDir * rr(0.4, 1.5), vy: rr(-0.9, -0.1), life: rr(0.2, 0.4),
          col: '#dfd6b8', col2: '#95886a', size: rr(1, 2), grav: 0.08
        }));
        if (this.rollT <= 0 && !this.canStand()) this.rollT = 0.05;   /* still under a low roof */
      }

      /* --- the crouch --- */
      const holdLow = D && this.grounded && canLow && this.hurtT <= 0 && this.spinT <= 0;
      if (this.rollT <= 0 && holdLow && dir && this.rollCd <= 0) this.startRoll(dir);
      this.crouching = this.rollT <= 0 && holdLow;

      /* the body is short while rolling or crouching, and only stands back
         up when there is headroom for it */
      const wantH = (this.rollT > 0 || this.crouching) && canLow ? this.lowH : PH;
      if (wantH < this.h) this.setHeight(wantH);
      else if (wantH > this.h && this.canStand()) this.setHeight(PH);

      /* horizontal */
      /* ice gives no grip: you keep what speed you had, and you steer badly */
      const icy = this.grounded &&
        room.slippy(Math.floor(this.cx / TILE), Math.floor((this.y + this.h + 1) / TILE));
      const accel = icy ? 0.09 : (this.grounded ? 0.30 : 0.20);
      const fric = icy ? 0.985 : (this.grounded ? 0.62 : 0.86);
      const steer = (this.rollT > 0 || this.spinT > 0) ? 0 : (this.hurtT > 0 ? 0.35 : 1);
      if (dir && steer > 0 && !this.crouching) {
        this.vx = approach(this.vx, dir * this.speedMax * (this.inWater ? 0.62 : 1), accel * steer * s);
        this.face = dir;
      } else if (this.crouching) {
        /* a crouch holds its ground: you shuffle to a stop */
        if (dir) this.face = dir;
        this.vx = approach(this.vx, 0, 0.34 * s);
      } else if (this.rollT <= 0) {
        this.vx = approach(this.vx, 0, (1 - fric) * 1.6 * s);
      }
      /* --- the wall cling --- */
      this.wallCd = Math.max(0, this.wallCd - dt);
      this.wallDir = this.wallAt();
      const clinging = this.wallDir !== 0 && !this.grounded && !this.inWater &&
                       !this.onLadder && this.dashT <= 0 && this.pierceT <= 0 &&
                       this.rollT <= 0 && this.wallCd <= 0 && this.vy > -1.2 &&
                       dir === this.wallDir;
      this.wallT = clinging ? this.wallT + dt : 0;
      if (clinging) {
        this.face = this.wallDir;
        this.airJumps = 0;                 /* the wall gives the wings back */
        if (Math.random() < 0.5) G.particles.push(new Particle({
          x: this.cx + this.wallDir * (this.w / 2 + 1), y: this.y + rr(4, this.h - 2),
          vx: -this.wallDir * rr(0.2, 0.9), vy: rr(-0.3, 0.9), life: rr(0.2, 0.45),
          col: '#cdc4a8', col2: '#7c7460', size: rr(1, 2), grav: 0.08
        }));
      }

      /* gravity: a cling slows the slide down the rock */
      const g = this.inWater ? 0.13 : ((this.spinT > 0 && this.spinKind === 'flip') ? 0.25 : 0.36);
      this.vy = Math.min(this.vy + g * s, this.inWater ? 1.6 : 7);
      if (clinging) this.vy = Math.min(this.vy, 1.3);

      /* jump */
      this.coyote = this.grounded ? 0.11 : Math.max(0, this.coyote - dt);
      if (Input.actHit('up')) this.jumpBuf = 0.13;
      else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      if (this.grounded) this.airJumps = 0;
      const canDouble = this.up.wings > 0 && this.airJumps < this.up.wings &&
                        !this.grounded && this.coyote <= 0 && !this.inWater;
      /* the kick off the wall: away and up, the diagonal jump of a climber */
      if (this.jumpBuf > 0 && clinging && this.canStand()) {
        const away = -this.wallDir;
        this.vx = away * 4.6;
        this.vy = -6.5;
        this.face = away;
        this.wallCd = 0.20;               /* long enough not to stick straight back */
        this.wallT = 0; this.jumpBuf = 0; this.coyote = 0; this.grounded = false;
        this.rollT = 0; this.crouching = false;
        Snd.jump(); G.shake(2);
        for (let k = 0; k < 14; k++) G.particles.push(new Particle({
          x: this.cx - away * (this.w / 2), y: this.y + rr(4, this.h),
          vx: -away * rr(0.6, 2.6), vy: rr(-1.6, 1.2), life: rr(0.2, 0.5),
          col: '#e0d6b6', col2: '#8f8464', size: rr(1, 2.6), grav: 0.12
        }));
        G.tutMark('climb');
      } else if (this.jumpBuf > 0 && this.canStand() && (this.coyote > 0 || this.inWater || canDouble)) {
        const doubling = canDouble && this.coyote <= 0 && !this.inWater;
        /* jumping while a direction is held throws you along it, not straight up */
        if (dir) {
          this.rollT = 0; this.crouching = false;
          this.face = dir;
          this.vx = dir * Math.max(Math.abs(this.vx), this.speedMax * 0.92);
        }
        if (doubling) {
          this.airJumps++;
          this.vy = -5.8;
          Snd.wings();
          /* a ring of feathers under the boots */
          for (let k = 0; k < 16; k++) {
            const a = k / 16 * TAU;
            G.particles.push(new Particle({
              x: this.cx + Math.cos(a) * 6, y: this.y + this.h - 2 + Math.sin(a) * 3,
              vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 0.8 + 0.4, life: rr(0.25, 0.55),
              col: '#e6edf6', col2: '#9aa8c4', size: rr(1, 2), grav: 0.05, drag: 0.9
            }));
          }
        } else {
          /* the feather token puts more spring in a jump */
          const lift = (G.hasArtifact && G.hasArtifact('feather')) ? -7.2 : -6.3;
          this.vy = this.inWater ? -3.2 : lift;
          Snd.jump();
        }
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        if (!doubling) for (let i = 0; i < 8; i++) G.particles.push(new Particle({
          x: this.cx + rr(-4, 4), y: this.y + this.h, vx: rr(-1.4, 1.4), vy: rr(-0.4, 0.6),
          life: rr(0.2, 0.4), col: '#d8cfae', col2: '#8a7d5c', size: rr(1, 2), grav: 0.1
        }));
      }
      if (!U && this.vy < -1.6) this.vy += 0.30 * s;     /* variable jump height */
      /* drop through one-way platforms — but never mid-roll */
      this.dropThrough = D && this.rollT <= 0;
    }

    /* anything else that takes over the body ends the crouch, and the hero
       stands back up as soon as there is headroom for it */
    if (this.pierceT > 0 || this.onLadder || this.swimming || this.dashT > 0) {
      this.crouching = false; this.rollT = 0;
      this.spinT = 0; this.spinKind = null; this.spinHit = null;
    }
    if (this.rollT <= 0 && !this.crouching && this.h !== PH && this.canStand()) this.setHeight(PH);

    /* --- move and collide --- */
    this.moveX(this.vx * s);
    const wasG = this.grounded;
    this.moveY(this.vy * s);
    if (this.grounded && this.pierceT > 0) this.endPierce(false);
    if (!wasG && this.grounded) {
      if (this.vyPrev > 2.4) { Snd.land(); this.landT = 0.16; G.shake(Math.min(3, this.vyPrev * 0.4)); }
      for (let i = 0; i < (this.vyPrev > 3 ? 10 : 4); i++) G.particles.push(new Particle({
        x: this.cx + rr(-5, 5), y: this.y + this.h, vx: rr(-1.8, 1.8), vy: rr(-1, -0.1),
        life: rr(0.2, 0.45), col: '#e0d6b6', col2: '#9a8e6c', size: rr(1, 2), grav: 0.12
      }));
    }

    this.rideLift();

    /* footsteps and running dust */
    if (this.grounded && Math.abs(this.vx) > 0.5) {
      this.stepT -= dt * Math.abs(this.vx);
      if (this.stepT <= 0) {
        this.stepT = 0.5;
        Snd.step(Math.abs(this.vx) > 1.4 ? 1.2 : 0.8);
        if (Math.abs(this.vx) > 1.3) G.particles.push(new Particle({
          x: this.cx - this.face * 5, y: this.y + this.h - 1, vx: -this.face * rr(0.4, 1.4), vy: rr(-0.8, -0.1),
          life: rr(0.22, 0.45), col: '#dfd6b8', col2: '#95886a', size: rr(1, 2), grav: 0.06
        }));
      }
    }
    /* water splashes */
    if (this.inWater && Math.abs(this.vx) + Math.abs(this.vy) > 1.2 && Math.random() < 0.35) {
      G.particles.push(new Particle({
        x: this.cx + rr(-5, 5), y: this.y + this.h * 0.6, vx: rr(-1.4, 1.4), vy: rr(-2.2, -0.6),
        life: rr(0.25, 0.55), col: '#cfeaff', col2: '#5fa3dc', size: rr(1, 2), grav: 0.24
      }));
      if (Math.random() < 0.05) Snd.splash();
    }
    this.vyPrev = this.vy;
  }

  updateTop(dt, L, Rk, U, D) {
    const s = dt * 60;
    if (this.dashT <= 0) {
      const dx = (Rk ? 1 : 0) - (L ? 1 : 0);
      const dy = (D ? 1 : 0) - (U ? 1 : 0);
      const l = Math.hypot(dx, dy) || 1;
      if (dx || dy) {
        this.vx = approach(this.vx, dx / l * this.speedMax, 0.34 * s);
        this.vy = approach(this.vy, dy / l * this.speedMax, 0.34 * s);
        if (Math.abs(dx) > Math.abs(dy)) { this.topDir = dx > 0 ? 3 : 1; this.face = dx > 0 ? 1 : -1; }
        else this.topDir = dy > 0 ? 0 : 2;
      } else {
        this.vx = approach(this.vx, 0, 0.5 * s);
        this.vy = approach(this.vy, 0, 0.5 * s);
      }
    } else {
      if (Math.abs(this.vx) > Math.abs(this.vy)) this.topDir = this.vx > 0 ? 3 : 1;
      else this.topDir = this.vy > 0 ? 0 : 2;
    }
    this.moveX(this.vx * s);
    this.moveY(this.vy * s);
    this.grounded = true;
    if (Math.abs(this.vx) + Math.abs(this.vy) > 0.5) {
      this.stepT -= dt * (Math.abs(this.vx) + Math.abs(this.vy));
      if (this.stepT <= 0) { this.stepT = 0.6; Snd.step(0.7); }
    }
  }

  /* A lift is a floor that moves. Land on it and it carries you along. */
  rideLift() {
    this.onLift = null;
    if (!G.lifts || !G.lifts.length || this.dead || G.room.mode !== 'side') return;
    if (this.dropThrough || this.onLadder || this.swimming || this.pierceT > 0) return;
    const feet = this.y + this.h;
    for (const L of G.lifts) {
      if (this.x + this.w <= L.x + 1 || this.x >= L.x + L.w - 1) continue;
      if (this.vy < -0.2) continue;                 /* rising: pass under it */
      if (feet < L.y - 3 || feet > L.y + 11) continue;
      this.y = L.y - this.h;
      this.vy = 0; this.grounded = true; this.coyote = 0.11;
      this.onLift = L;
      if (L.dx) this.moveX(L.dx);
      break;
    }
  }
  ladderAt() {
    const room = G.room;
    if (!room || room.mode !== 'side') return null;
    const tx = Math.floor(this.cx / TILE);
    const y0 = Math.floor(this.y / TILE), y1 = Math.floor((this.y + this.h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++)
      if (room.ladder(tx, ty)) return { tx: tx, ty: ty, side: room.ladderSide(tx, ty) };
    /* and the rung under your boots, so you can grab it from the ground */
    const tyb = Math.floor((this.y + this.h) / TILE);
    if (room.ladder(tx, tyb)) return { tx: tx, ty: tyb, side: room.ladderSide(tx, tyb) };
    return null;
  }
  moveX(d) {
    const room = G.room;
    if (d === 0) return;
    const step = Math.sign(d), n = Math.ceil(Math.abs(d));
    let left = Math.abs(d);
    for (let i = 0; i < n; i++) {
      const m = Math.min(1, left); left -= m;
      const nx = this.x + step * m;
      if (room.boxSolid(nx, this.y, this.w, this.h)) {
        /* walk up a ledge of a tile or less rather than stalling against it */
        let stepped = false;
        if (this.grounded && this.vy >= 0 && G.room.mode === 'side') {
          for (let up = 2; up <= TILE + 1; up++) {
            if (!room.boxSolid(nx, this.y - up, this.w, this.h)) { this.y -= up; this.x = nx; stepped = true; break; }
          }
        }
        if (stepped) continue;
        this.vx = 0; if (this.dashT > 0) { this.dashVX = 0; }
        return;
      }
      this.x = nx;
    }
  }
  moveY(d) {
    const room = G.room;
    if (d === 0) return;
    const step = Math.sign(d), n = Math.ceil(Math.abs(d));
    let left = Math.abs(d);
    if (room.mode === 'side') this.grounded = false;
    for (let i = 0; i < n; i++) {
      const m = Math.min(1, left); left -= m;
      const ny = this.y + step * m;
      let blocked = room.boxSolid(this.x, ny, this.w, this.h);
      /* one-way platforms: solid only when falling onto them */
      if (!blocked && step > 0 && !this.dropThrough && room.mode === 'side') {
        const footNow = this.y + this.h, footNext = ny + this.h;
        const tyNext = Math.floor(footNext / TILE);
        if (Math.floor(footNow / TILE) < tyNext || footNow % TILE === 0) {
          const x0 = Math.floor(this.x / TILE), x1 = Math.floor((this.x + this.w - 1) / TILE);
          for (let tx = x0; tx <= x1; tx++) {
            if (room.oneway(tx, tyNext) && footNow <= tyNext * TILE + 1) { blocked = true; break; }
          }
        }
      }
      if (blocked) {
        if (step > 0) {
          /* a spring cap throws you back up instead of stopping you */
          const footRow = Math.floor((ny + this.h) / TILE);
          const x0 = Math.floor(this.x / TILE), x1 = Math.floor((this.x + this.w - 1) / TILE);
          let sprung = false;
          for (let tx = x0; tx <= x1; tx++) if (room.bouncy(tx, footRow)) { sprung = true; break; }
          if (sprung && this.vy > 0.5) {
            this.y = footRow * TILE - this.h;
            this.vy = -9.2; this.grounded = false; this.pierceT = 0;
            Snd.bounce(); G.shake(2.5);
            for (let k = 0; k < 12; k++) G.particles.push(new Particle({
              x: this.cx + rr(-7, 7), y: this.y + this.h, vx: rr(-2.2, 2.2), vy: rr(-2, -0.2),
              life: rr(0.25, 0.6), col: '#f6efdc', col2: '#c9403a', size: rr(1, 2.4), grav: 0.14
            }));
            return;
          }
          this.grounded = true;
          /* rest exactly on the surface: without this the box tolerance lets the
             hero settle a fraction of a pixel inside the floor, which throws off
             any height measured from the feet. */
          if (room.mode === 'side') this.y = Math.floor((ny + this.h) / TILE) * TILE - this.h;
        }
        this.vy = 0; if (this.dashT > 0) this.dashVY = 0;
        return;
      }
      this.y = ny;
    }
    if (room.mode === 'side' && step > 0) {
      /* stay grounded while resting exactly on a surface */
      if (room.boxSolid(this.x, this.y + 1, this.w, this.h)) this.grounded = true;
    }
  }

  /* Where a blade and a body meet, and whether rock stands in the way.
     The test aims at the middle of the overlap, not at the middle of the
     creature: that is the part of it the blade actually touches. */
  clearHit(box, target) {
    const room = G.room;
    if (!room || !room.losBlocked) return true;
    const x0 = Math.max(box.x, target.x), x1 = Math.min(box.x + box.w, target.x + target.w);
    const y0 = Math.max(box.y, target.y), y1 = Math.min(box.y + box.h, target.y + target.h);
    return !room.losBlocked(this.cx, this.cy, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  swordBox() {
    const t = this.atkT;
    if (t <= 0.06 || t > 0.22) return null;
    const reach = 20 + this.up.sword * 3;
    if (G.room.mode === 'top') {
      const d = this.topDir;
      const ox = [0, -1, 0, 1][d], oy = [1, 0, -1, 0][d];
      return { x: this.cx + ox * 12 - 13, y: this.cy + oy * 12 - 13, w: 26, h: 26 };
    }
    return { x: this.face > 0 ? this.x + this.w - 2 : this.x - reach + 2,
             y: this.y - 3, w: reach, h: this.h + 4 };
  }
  doSwordHit() {
    const box = this.swordBox();
    if (!box) return;
    let struck = false;
    /* seen from above, the maze walls are walls: a blade stops at them */
    const walled = G.room.mode === 'top';
    for (const e of G.enemies) {
      if (e.dead || this.atkHit.has(e)) continue;
      if (!rectsOverlap(box, e.box())) continue;
      if (walled && !this.clearHit(box, e.box())) continue;
      this.atkHit.add(e);
      e.hurt(this.atkDmg, this.cx, this.cy);
      struck = true; G.tutMark('fight');
    }
    /* and a shot caught on the blade goes back where it came from */
    for (const pr of G.projectiles) {
      if (pr.dead || pr.friendly || typeof pr.vx !== 'number') continue;
      if (this.atkHit.has(pr)) continue;
      if (!rectsOverlap(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      if (walled && !this.clearHit(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      this.atkHit.add(pr);
      deflectShot(pr, this.atkDmg * 2);
      G.addCombo(); G.tutMark('parry');
      Snd.parry(); G.shake(4.5); G.hitStop(0.08);
      G.texts.push(new FloatText(pr.x, pr.y - 8, 'PARRY', '#bfe8ff'));
    }
    /* one pause per new thing struck, not one per frame the blade is out:
       re-applying it every frame left the whole game crawling after a hit */
    if (struck) G.hitStop(0.06);
  }

  updateAnim(dt) {
    const room = G.room;
    let a, spd = 1;
    if (this.pierceT > 0) a = 'pierce';
    else if (this.flurryT > 0) a = 'flurry';
    else if (this.spinT > 0) a = this.spinKind === 'flip' ? 'flip' : 'rollcut';
    else if (this.rollT > 0) a = 'roll';
    else if (this.atkT > 0) a = (room.mode === 'top') ? 'tatk' : 'atk';
    else if (this.dashT > 0) a = 'dash';
    else if (room.mode === 'top') a = (Math.abs(this.vx) + Math.abs(this.vy) > 0.25) ? 'twalk' : 'tidle';
    else if (this.onLadder) a = 'climb';
    else if (this.swimming) a = (Math.abs(this.vx) + Math.abs(this.vy) > 0.3) ? 'swim' : 'swimIdle';
    else if (this.inWater && !this.grounded) a = 'swimIdle';
    else if (this.wallT > 0) a = 'wall';
    else if (!this.grounded) a = this.vy < -0.4 ? 'jump' : 'fall';
    else if (this.crouching) a = 'crouch';
    else if (this.landT > 0) a = 'land';
    else if (Math.abs(this.vx) > 1.25) { a = 'run'; spd = Math.abs(this.vx) / 2.1; }
    else if (Math.abs(this.vx) > 0.18) { a = 'walk'; spd = Math.abs(this.vx) / 1.1; }
    else a = 'idle';
    if (a !== this.anim) { this.anim = a; this.animT = 0; this.frame = 0; }
    if (a === 'climb' && Math.abs(this.vy) < 0.2) spd = 0;   /* frozen on the rungs */
    this.animT += dt * spd;
    const rate = { idle: 0.14, walk: 0.085, run: 0.062, twalk: 0.085, tidle: 0.42,
                   jump: 1, fall: 1, land: 1, dash: 0.08, atk: 0.056, tatk: 0.066, pierce: 0.07,
                   swim: 0.085, swimIdle: 0.19, climb: 0.12, crouch: 0.20, roll: 0.055,
                   flip: 0.05, rollcut: 0.05, wall: 0.14, flurry: 0.04 }[a] || 0.1;
    this.frame = Math.floor(this.animT / rate);
    const len = { idle: 8, walk: 8, run: 8, twalk: 8, tidle: 2, jump: 1, fall: 1, land: 1, dash: 2, atk: 6, tatk: 5, pierce: 2, swim: 6, swimIdle: 4, climb: 6, crouch: 4, roll: 4, flip: 4, rollcut: 4, wall: 4, flurry: 4 }[a] || 1;
    if (a === 'atk') this.frame = Math.min(5, this.frame);
    else if (a === 'tatk') this.frame = Math.min(4, this.frame);
    else this.frame %= len;
  }

  currentSprite() {
    const H = (G.codes && G.codes.admin && Art.heroGold) ? Art.heroGold : Art.hero;
    const T = (G.codes && G.codes.admin && Art.topGold) ? Art.topGold : Art.top;
    switch (this.anim) {
      case 'idle': return H.idle[this.frame];
      case 'walk': return H.walk[this.frame];
      case 'run': return H.run[this.frame];
      case 'jump': return H.jump[0];
      case 'fall': return H.fall[0];
      case 'land': return H.land[0];
      case 'dash': return H.dash[this.frame % 2];
      case 'pierce': return H.pierce[this.frame % 2];
      case 'climb': return H.climb[this.frame % 6];
      case 'crouch': return (H.crouch || H.idle)[this.frame % 4];
      case 'roll': return (H.roll || H.dash)[this.frame % (H.roll ? 4 : 2)];
      case 'flip': return (H.flip || H.atk)[this.frame % (H.flip ? 4 : 6)];
      case 'rollcut': return (H.rollcut || H.atk)[this.frame % (H.rollcut ? 4 : 6)];
      case 'wall': return (H.wall || H.fall)[this.frame % (H.wall ? 4 : 1)];
      case 'flurry': return (H.flurry || H.atk)[this.frame % (H.flurry ? 4 : 6)];
      case 'swim': return H.swim[this.frame % 6];
      case 'swimIdle': return H.swimIdle[this.frame % 4];
      case 'atk': return H.atk[this.frame];
      case 'tatk': return T.atk[this.topDir][Math.min(4, this.frame)];
      case 'twalk': return T.walk[this.topDir][this.frame];
      case 'tidle': return T.idle[this.topDir][this.frame % 2];
    }
    return H.idle[0];
  }

  draw(c2) {
    if (this.dead) {
      return;    /* the death burst is all particles */
    }
    const top = G.room.mode === 'top';
    const isTopAnim = top && (this.anim === 'twalk' || this.anim === 'tidle' || this.anim === 'tatk');
    const anchor = isTopAnim ? Art.top.anchor : Art.hero.anchor;
    const sx = this.cx;
    const sy = isTopAnim ? this.cy + 1 : this.y + this.h;
    /* dash after-images */
    for (const t of this.trail) {
      const img = this.currentSprite();
      blit(c2, img, t.x, t.y, anchor.x, anchor.y, t.face < 0, t.life * 1.4, 1, 0);
    }
    const flick = this.invuln > 0 && Math.floor(this.invuln * 22) % 2 === 0;
    if (flick) return;
    this.drawCape(c2);                   /* the cloth hangs behind the body */
    const img = this.currentSprite();
    const flip = isTopAnim ? false : this.face < 0;
    /* the roll spins a full turn, so the tucked body reads as tumbling */
    if (this.anim === 'roll' || this.anim === 'flip' || this.anim === 'rollcut') {
      /* pivot on the middle of the body, not on the boots */
      let turn, dir;
      if (this.anim === 'roll') { turn = 1 - clamp(this.rollT / 0.42, 0, 1); dir = this.rollDir; }
      else {
        const dur = this.anim === 'flip' ? 0.42 : 0.34;
        turn = 1 - clamp(this.spinT / dur, 0, 1); dir = this.spinDir;
      }
      blit(c2, img, sx, sy - 5, anchor.x, anchor.y - 5, flip, 1, 1, dir * turn * TAU);
      drawHeroShine(c2, img, sx, sy - 5, anchor.x, anchor.y - 5, flip);
      return;
    }
    blit(c2, img, sx, sy, anchor.x, anchor.y, flip, 1, 1, 0);
    drawHeroShine(c2, img, sx, sy, anchor.x, anchor.y, flip);
    this.drawBubble(c2);
  }
  /* Under the Sunken Depths you breathe out of a glass bubble.  It sits over
     the head, it catches the light, and it lets go of a small bubble now and
     then. */
  drawBubble(c2) {
    if (!G.needsBubble || !G.needsBubble()) return;
    const top = G.room.mode === 'top';
    const hx = this.cx + (top ? 0 : this.face * 1);
    const hy = top ? this.cy : this.y + 7;
    const wob = Math.sin(G.t * 2.4) * 0.5;
    const r = 11 + wob;
    c2.save();
    /* the glass */
    c2.globalAlpha = 0.22;
    c2.fillStyle = '#cfeaff';
    c2.beginPath(); c2.arc(Math.round(hx), Math.round(hy), r, 0, TAU); c2.fill();
    /* the rim */
    c2.globalAlpha = 0.75;
    c2.strokeStyle = '#8fd0ff';
    c2.lineWidth = 1;
    c2.beginPath(); c2.arc(Math.round(hx), Math.round(hy), r, 0, TAU); c2.stroke();
    /* the highlight that says it is glass */
    c2.globalAlpha = 0.9;
    c2.fillStyle = '#f2fbff';
    c2.fillRect(Math.round(hx - r * 0.55), Math.round(hy - r * 0.6), 3, 2);
    c2.fillRect(Math.round(hx - r * 0.62), Math.round(hy - r * 0.36), 2, 3);
    c2.globalAlpha = 0.5;
    c2.fillRect(Math.round(hx + r * 0.35), Math.round(hy + r * 0.35), 2, 2);
    /* the collar the bubble sits in */
    c2.globalAlpha = 0.85;
    c2.fillStyle = '#5d8390';
    c2.fillRect(Math.round(hx - 5), Math.round(hy + r - 3), 10, 2);
    c2.restore();
    if (Math.random() < 0.05) G.particles.push(new Particle({
      x: hx + rr(-4, 4), y: hy - r, vx: rr(-0.2, 0.2), vy: rr(-1, -0.4),
      life: rr(0.6, 1.4), col: '#cfeaff', col2: '#8fd0ff', size: rr(1, 2), grav: -0.01
    }));
  }
}

/* ============================================================
   THE CAPE — a rope of eight links hung from the shoulders. It
   trails behind a run, streams up through a jump or a fall, and
   settles when you stand still.
   ============================================================ */
/* A mantle is a short one: six links of two pixels.  The hero stands sixteen
   pixels tall and the cloth hangs from five below the head, so ten pixels of
   rope brings the hem to the boots and no further. */
const CAPE_N = 6, CAPE_SEG = 2.0;
Player.prototype.capeAnchor = function () {
  const top = G.room && G.room.mode === 'top';
  if (top) {
    /* seen from above, the cloth hangs off the shoulders behind the head */
    const d = this.topDir;
    const bx = [0, 1, 0, -1][d] || 0, by = [-1, 0, 1, 0][d] || 0;
    return { x: this.cx + bx * 3, y: this.cy + by * 3 + 1 };
  }
  return { x: this.cx - this.face * 3, y: this.y + 5 };
};
Player.prototype.updateCape = function (dt) {
  if (LOOK.cape === 'none' || !CAPES[LOOK.cape]) { this.cape = null; return; }
  const a = this.capeAnchor();
  if (!this.cape) {
    this.cape = [];
    for (let i = 0; i < CAPE_N; i++) this.cape.push({ x: a.x, y: a.y + i * CAPE_SEG, px: a.x, py: a.y + i * CAPE_SEG });
  }
  /* the wind the hero makes for themselves */
  const top = G.room && G.room.mode === 'top';
  let back, up;
  if (top) {
    /* from above there is no up or down, only the way you came */
    const sp = Math.hypot(this.vx, this.vy);
    const l = sp || 1;
    const drag = 1.4 + Math.min(7, sp * 2.4);
    const d = this.topDir;
    const bx = [0, 1, 0, -1][d] || 0, by = [-1, 0, 1, 0][d] || 0;
    back = (sp > 0.15 ? -this.vx / l : bx) * drag;
    up = (sp > 0.15 ? -this.vy / l : by) * drag;
  } else {
    const speed = Math.abs(this.vx);
    back = -this.face * (1.2 + Math.min(7, speed * 2.2));
    /* off the ground it streams upward, harder the faster you are moving,
       whether that is up through a jump or down through a fall */
    const air = !this.grounded && !this.onLadder && !this.swimming;
    up = air ? -(5.0 + Math.min(9, Math.abs(this.vy) * 1.2)) : 3.4;
  }
  const wob = Math.sin(G.t * 9) * 0.6;
  const s = Math.min(2, dt * 60);
  for (let i = 0; i < CAPE_N; i++) {
    const pt = this.cape[i];
    if (i === 0) { pt.x = a.x; pt.y = a.y; pt.px = a.x; pt.py = a.y; continue; }
    const t = i / (CAPE_N - 1);
    let vx = (pt.x - pt.px) * 0.74, vy = (pt.y - pt.py) * 0.74;
    pt.px = pt.x; pt.py = pt.y;
    pt.x += vx + (back * (0.35 + t) + wob * t) * 0.34 * s;
    pt.y += vy + (up * (0.35 + t)) * 0.34 * s;
    /* hold each link a fixed distance from the one before it */
    const q = this.cape[i - 1];
    const dx = pt.x - q.x, dy = pt.y - q.y;
    const d = Math.hypot(dx, dy) || 1;
    pt.x = q.x + dx / d * CAPE_SEG;
    pt.y = q.y + dy / d * CAPE_SEG;
  }
};
Player.prototype.drawCape = function (c2) {
  if (!this.cape) return;
  const des = CAPES[LOOK.cape];
  if (!des) return;
  const WIDE = 7;                        /* strips across the cloth */
  const N = CAPE_N - 1;
  /* Work out the two edges of every rung first, then fill the cloth as
     solid quads between them. Drawing loose blocks left gaps, so the
     mantle read as a string of scraps rather than one piece. */
  const rung = [];
  for (let i = 0; i <= N; i++) {
    const a = this.cape[Math.max(0, i - 1)], b = this.cape[Math.min(N, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    const t = i / N;
    const halfW = 2.8 + t * 5.2;         /* it flares toward the hem */
    rung.push({ x: this.cape[i].x, y: this.cape[i].y, nx: -dy / l, ny: dx / l, hw: halfW });
  }
  const at = (r, u) => ({ x: r.x + r.nx * u * r.hw, y: r.y + r.ny * u * r.hw });
  for (let i = 0; i < N; i++) {
    const r0 = rung[i], r1 = rung[i + 1];
    for (let j = 0; j < WIDE; j++) {
      const col = capeCell(LOOK.cape, i, j, N, WIDE);
      if (!col) continue;
      /* a strip runs the full width of its share, so neighbours meet */
      const u0 = (j / WIDE - 0.5) * 2, u1 = ((j + 1) / WIDE - 0.5) * 2;
      const a0 = at(r0, u0), a1 = at(r0, u1), b1 = at(r1, u1), b0 = at(r1, u0);
      c2.fillStyle = col;
      c2.beginPath();
      c2.moveTo(a0.x, a0.y); c2.lineTo(a1.x, a1.y);
      c2.lineTo(b1.x, b1.y); c2.lineTo(b0.x, b0.y);
      c2.closePath(); c2.fill();
    }
  }
  /* a bright hem down both edges and across the bottom */
  c2.fillStyle = des.edge;
  c2.beginPath();
  for (const side of [-1, 1]) {
    let first = true;
    for (let i = 0; i <= N; i++) {
      const q = at(rung[i], side);
      if (first) { c2.moveTo(q.x, q.y); first = false; } else c2.lineTo(q.x, q.y);
    }
    for (let i = N; i >= 0; i--) {
      const q = at(rung[i], side * 0.86);
      c2.lineTo(q.x, q.y);
    }
    c2.closePath();
  }
  c2.fill();
};

/* ============================================================
   ENEMIES
   ============================================================ */
class Enemy {
  constructor(o) {
    Object.assign(this, o);
    this.vx = 0; this.vy = 0; this.face = -1;
    this.dead = false; this.flash = 0; this.animT = 0; this.frame = 0;
    this.state = 'walk'; this.stateT = 0; this.grounded = false;
    this.touchCd = 0;
    this.kbX = 0; this.kbY = 0; this.kbT = 0;
  }
  /* how far a blow shifts this creature. A guardian sets it to zero. */
  get knockScale() { return this.kbScale === undefined ? 1 : this.kbScale; }
  knock(fx, fy, power) {
    const k = this.knockScale;
    if (k <= 0) return;
    let dx = this.cx - fx, dy = this.cy - fy;
    /* a blow with no source, or one landing dead centre, shoves the way
       the creature faces rather than nowhere at all */
    if (!isFinite(dx) || !isFinite(dy) || (dx === 0 && dy === 0)) { dx = -this.face; dy = -0.4; }
    const l = Math.hypot(dx, dy) || 1;
    this.kbX = dx / l * power * k;
    this.kbY = dy / l * power * k * 0.5;
    this.kbT = 0.22;
  }
  /* the shove runs after the creature's own move, so its AI cannot
     simply write over it the way it writes over vx every frame */
  applyKnock(dt) {
    if (this.kbT <= 0 || this.dead) return;
    if (!isFinite(this.kbX) || !isFinite(this.kbY)) { this.kbT = 0; this.kbX = this.kbY = 0; return; }
    this.kbT -= dt;
    const room = G.room, s = dt * 60;
    const nx = this.x + this.kbX * s;
    if (!room.boxSolid(nx - this.w / 2, this.y - this.h, this.w, this.h)) this.x = nx;
    else this.kbX = 0;
    /* only things that leave the ground get pushed vertically */
    if (room.mode === 'top' || !this.grounded) {
      const ny = this.y + this.kbY * s;
      if (!room.boxSolid(this.x - this.w / 2, ny - this.h, this.w, this.h)) this.y = ny;
      else this.kbY = 0;
    }
    const decay = Math.pow(0.02, dt);
    this.kbX *= decay; this.kbY *= decay;
  }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }
  hurt(dmg, fx, fy, coinMult) {
    if (this.dead) return;
    if (coinMult) this.coinMult = coinMult;
    G.addCombo();
    this.hp -= dmg; this.flash = 0.22;
    const dir = Math.sign(this.x - fx) || 1;
    this.vx += dir * 2.6; this.vy -= 1.6 * this.knockScale;
    this.knock(fx, fy, 5.2);
    Snd.hitFlesh(); G.shake(3);
    G.texts.push(new FloatText(this.cx, this.cy - 10, String(dmg), '#ffd6d6'));
    for (let i = 0; i < 12; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: dir * rr(0.4, 3) + rr(-1, 1), vy: rr(-3, 0.6),
      life: rr(0.25, 0.55), col: this.blood || '#c04a3a', col2: '#5a1a16', size: rr(1, 2.4), grav: 0.22
    }));
    if (this.hp <= 0) this.kill();
  }
  kill() {
    if (this.dead) return;
    this.dead = true;
    Snd.enemyDie(); G.shake(4);
    for (let i = 0; i < 24; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: rr(-3.4, 3.4), vy: rr(-4, 0.6), life: rr(0.35, 0.85),
      col: this.blood || '#c04a3a', col2: '#3a1210', size: rr(1, 3), grav: 0.24
    }));
    const n = Math.max(1, Math.round((this.coinDrop || 2) * (this.coinMult || 1) * G.coinScale() * G.comboMult())) + G.coinBonus();
    G.payOut(n, this.cx, this.cy);
    /* and it pays experience as well as coins */
    if (G.giveXp) G.giveXp(xpFor(this) * G.xpScale(), this.cx, this.cy);
    /* on an island every creature leaves a part or four of its own shard */
    if (G.isleRun && G.dropShardParts) G.dropShardParts(ri(1, 4));
  }
  physics(dt) {
    const room = G.room, s = dt * 60;
    if (room.mode === 'top') {
      this.x += this.vx * s; this.y += this.vy * s;
      return;
    }
    /* A creature that swims floats instead of sinking.  It rises until its
       head breaks the surface, and it moves slower in the water. */
    this.inWater = !!this.swims &&
      room.boxWet(this.x - this.w / 2, this.y - this.h * 0.6, this.w, this.h * 0.6);
    if (this.inWater) {
      const headWet = room.wet(Math.floor(this.x / TILE),
                              Math.floor((this.y - this.h + 3) / TILE));
      this.vy = approach(this.vy, headWet ? -1.15 : 0.22, 0.24 * s);
      this.vx *= 0.62;
      this.swimT = (this.swimT || 0) + dt;
      if (Math.random() < 0.16) G.particles.push(new Particle({
        x: this.x + rr(-this.w / 2, this.w / 2), y: this.y - this.h * 0.45,
        vx: rr(-0.5, 0.5), vy: rr(-0.4, -0.05), life: rr(0.2, 0.5),
        col: '#cfeaff', col2: '#5fa3dc', size: rr(1, 2.2), grav: 0
      }));
    } else {
      this.vy = Math.min(this.vy + 0.34 * s, 7);
    }
    /* x */
    let nx = this.x + this.vx * s;
    if (room.boxSolid(nx - this.w / 2, this.y - this.h, this.w, this.h)) { this.vx = 0; this.turn(); }
    else this.x = nx;
    /* y */
    let ny = this.y + this.vy * s;
    this.grounded = false;
    if (room.boxSolid(this.x - this.w / 2, ny - this.h, this.w, this.h)) {
      if (this.vy > 0) { this.grounded = true; this.y = Math.floor((ny - this.h) / TILE + 1) * TILE + this.h - this.h; this.y = Math.floor(ny / TILE) * TILE; }
      this.vy = 0;
    } else this.y = ny;
    if (room.boxSolid(this.x - this.w / 2, this.y + 1 - this.h, this.w, this.h)) this.grounded = true;
  }
  turn() { this.face *= -1; }
  edgeAhead() {
    const room = G.room;
    const px = this.x + this.face * (this.w / 2 + 3);
    if (room.boxSolid(px - 2, this.y - this.h, 4, this.h)) return true;
    /* a swimmer walks straight into the water rather than turning at the bank */
    if (this.swims && room.wet(Math.floor(px / TILE), Math.floor((this.y + 3) / TILE))) return false;
    return !room.solidPx(px, this.y + 3) && !room.oneway(Math.floor(px / TILE), Math.floor((this.y + 3) / TILE));
  }
  /* the foam ring a swimming creature pushes ahead of it */
  drawWake(c2) {
    if (!this.inWater) return;
    const room = G.room;
    let ty = Math.floor((this.y - this.h * 0.6) / TILE);
    while (ty > 0 && room.wet(Math.floor(this.x / TILE), ty - 1)) ty--;
    const surf = ty * TILE;
    c2.save();
    c2.globalAlpha = 0.62;
    c2.fillStyle = '#cfeaff';
    const w = this.w * (0.8 + Math.sin((this.swimT || 0) * 7) * 0.12);
    c2.beginPath();
    c2.ellipse(Math.round(this.x), Math.round(surf), Math.round(w / 2), 2.4, 0, 0, TAU);
    c2.fill();
    c2.restore();
  }
  touchPlayer(dmg) {
    const p = G.player;
    if (p.dead) return;
    if (rectsOverlap(this.box(), { x: p.x, y: p.y, w: p.w, h: p.h }))
      p.hurt(dmg || this.damage || 1, this.cx, this.cy);
  }
  drawFlash(c2, img, x, y, ax, ay, flip, scale) {
    blit(c2, img, x, y, ax, ay, flip, 1, scale);
    if (this.flash > 0) {
      /* a struck creature turns white, then fades back to its own colour */
      c2.save();
      c2.globalAlpha = clamp(this.flash / 0.22, 0, 1);
      blit(c2, whiteSprite(img), x, y, ax, ay, flip, 1, scale);
      c2.restore();
    }
  }
  /* A guardian knits itself back together while it stands. The mending stalls
     for a moment after every blow, so a steady attack still gains on it. */
  bossRegen(dt, perSecond) {
    if (this.dead || this.dying || !this.awake) return;
    this.regenHold = Math.max(0, (this.regenHold || 0) - dt);
    if (this.regenHold > 0 || this.hp >= this.maxHp) return;
    this.regenAcc = (this.regenAcc || 0) + this.maxHp * (perSecond || 0.006) * dt;
    if (this.regenAcc >= 1) {
      const n = Math.floor(this.regenAcc);
      this.regenAcc -= n;
      this.hp = Math.min(this.maxHp, this.hp + n);
      if (Math.random() < 0.5) G.particles.push(new Particle({
        x: this.cx + rr(-16, 16), y: this.cy + rr(-18, 18), vx: rr(-0.3, 0.3), vy: rr(-1, -0.3),
        life: rr(0.3, 0.7), col: '#9be89a', col2: '#2f6f37', size: rr(1, 2.2), grav: -0.02
      }));
    }
  }
}

class Snake extends Enemy {
  constructor(x, y, top) {
    super({ x: x, y: y, w: 20, h: 10, hp: 2, damage: 1, coinDrop: ri(2, 4), blood: '#4e8c3c' });
    this.top = top; this.speed = 0.55; this.face = rpick([-1, 1]);
    this.swims = true;
    this.dir = { x: this.face, y: 0 };
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt; this.frame = Math.floor(this.animT / 0.09) % 8;
    this.stateT -= dt;
    const p = G.player;
    const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);

    if (G.room.mode === 'top') {
      if (this.state === 'walk') {
        if (d < 96 && !p.dead) { this.state = 'chase'; this.stateT = 2.2; }
        const room = G.room;
        const nx = this.x + this.dir.x * this.speed * dt * 60, ny = this.y + this.dir.y * this.speed * dt * 60;
        if (room.boxSolid(nx - this.w / 2, ny - this.h, this.w, this.h)) {
          const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          const o = rpick(opts); this.dir = { x: o[0], y: o[1] };
        } else { this.x = nx; this.y = ny; }
      } else {
        const dx = p.cx - this.cx, dy = p.cy - this.cy, l = Math.hypot(dx, dy) || 1;
        const sp = this.speed * 2.0;
        const nx = this.x + dx / l * sp * dt * 60, ny = this.y + dy / l * sp * dt * 60;
        const room = G.room;
        if (!room.boxSolid(nx - this.w / 2, this.y - this.h, this.w, this.h)) this.x = nx;
        if (!room.boxSolid(this.x - this.w / 2, ny - this.h, this.w, this.h)) this.y = ny;
        if (d > 150 || this.stateT < 0) this.state = 'walk';
      }
      if (this.dir.x) this.face = this.dir.x;
      if (this.state === 'chase') this.face = p.cx > this.cx ? 1 : -1;
      this.touchPlayer();
      return;
    }

    /* side view */
    if (this.state === 'walk') {
      this.vx = this.face * this.speed;
      if (this.grounded && this.edgeAhead()) { this.turn(); this.vx = 0; }
      if (d < 74 && Math.abs(p.cy - this.cy) < 26 && !p.dead) {
        this.state = 'rear'; this.stateT = 0.42; this.vx = 0;
        this.face = p.cx > this.cx ? 1 : -1;
        Snd.snakeHiss();
      }
    } else if (this.state === 'rear') {
      this.vx = 0;
      if (this.stateT <= 0) { this.state = 'lunge'; this.stateT = 0.4; this.vx = this.face * 3.3; this.vy = -1.6; }
    } else if (this.state === 'lunge') {
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 0; }
      this.vx = approach(this.vx, this.face * 0.8, 0.06 * dt * 60);
    }
    this.physics(dt);
    this.touchPlayer();
  }
  draw(c2) {
    const img = Art.snake.move[this.state === 'rear' ? 0 : this.frame];
    const a = Art.snake.anchor;
    const rear = this.state === 'rear' ? -0.35 : 0;
    this.drawWake(c2);
    c2.save();
    if (rear) { c2.translate(Math.round(this.x), Math.round(this.y)); c2.rotate(rear * this.face); c2.translate(-Math.round(this.x), -Math.round(this.y)); }
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
    c2.restore();
  }
}

class Bear extends Enemy {
  constructor(x, y) {
    /* Five points here, doubled to ten as the realm arms it, against a base
       blade of two: five blows to bring one down. */
    super({ x: x, y: y, w: 26, h: 22, hp: 5, damage: 2, coinDrop: ri(6, 10), blood: '#6d4a2e' });
    this.speed = 0.42; this.face = rpick([-1, 1]);
    this.swims = true;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.stateT -= dt;
    const p = G.player;
    const d = Math.abs(p.cx - this.cx);
    const rate = this.state === 'charge' ? 0.055 : 0.11;
    this.animT += dt; this.frame = Math.floor(this.animT / rate) % (this.state === 'charge' ? 6 : 8);

    if (this.state === 'walk') {
      this.vx = this.face * this.speed;
      if (this.grounded && this.edgeAhead()) this.turn();
      if (d < 118 && Math.abs(p.cy - this.cy) < 40 && !p.dead) {
        this.state = 'roar'; this.stateT = 0.75; this.vx = 0;
        this.face = p.cx > this.cx ? 1 : -1;
        Snd.bearRoar(); G.shake(2);
      }
    } else if (this.state === 'roar') {
      this.vx = 0;
      this.frame = Math.floor(this.animT / 0.14) % 2;
      if (this.stateT <= 0) { this.state = 'charge'; this.stateT = 1.8; }
    } else if (this.state === 'charge') {
      this.vx = approach(this.vx, this.face * (this.inWater ? 1.5 : 2.6), 0.14 * dt * 60);
      if (this.grounded && !this.inWater && this.edgeAhead()) { this.turn(); this.state = 'tired'; this.stateT = 0.9; }
      if (this.stateT <= 0) { this.state = 'tired'; this.stateT = 0.9; }
      if (this.grounded && Math.random() < 0.4) G.particles.push(new Particle({
        x: this.cx - this.face * 8, y: this.y, vx: -this.face * rr(0.6, 2), vy: rr(-1.2, -0.2),
        life: rr(0.25, 0.5), col: '#e0d6b6', col2: '#8f8464', size: rr(1, 3), grav: 0.1
      }));
    } else if (this.state === 'tired') {
      this.vx = approach(this.vx, 0, 0.1 * dt * 60);
      if (this.stateT <= 0) this.state = 'walk';
    }
    this.physics(dt);
    this.touchPlayer(this.state === 'charge' ? 2 : 1);
  }
  draw(c2) {
    let img;
    if (this.state === 'roar') img = Art.bear.roar[this.frame % 2];
    else if (this.state === 'charge') img = Art.bear.charge[this.frame % 6];
    else img = Art.bear.walk[this.frame % 8];
    const a = Art.bear.anchor;
    this.drawWake(c2);
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
  }
}

class Bat extends Enemy {
  constructor(x, y, top) {
    super({ x: x, y: y, w: 14, h: 12, hp: 2, damage: 1, coinDrop: ri(1, 3), blood: '#5b4a6e' });
    this.home = { x: x, y: y }; this.t = rr(0, 10); this.top = top;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.animT += dt; this.frame = Math.floor(this.animT / 0.07) % 6;
    const p = G.player;
    const d = Math.hypot(p.cx - this.cx, p.cy - this.cy);
    this.stateT -= dt;
    if (this.state === 'walk' && d < 108 && !p.dead) { this.state = 'dive'; this.stateT = 1.6; }
    if (this.state === 'dive') {
      const dx = p.cx - this.cx, dy = p.cy - this.cy, l = Math.hypot(dx, dy) || 1;
      this.vx = approach(this.vx, dx / l * 1.9, 0.1 * dt * 60);
      this.vy = approach(this.vy, dy / l * 1.9, 0.1 * dt * 60);
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 1.2; }
    } else {
      this.vx = approach(this.vx, Math.cos(this.t * 1.1) * 0.7, 0.06 * dt * 60);
      this.vy = approach(this.vy, Math.sin(this.t * 1.7) * 0.6 + (this.home.y - this.y) * 0.02, 0.06 * dt * 60);
    }
    const room = G.room, s = dt * 60;
    let nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (room.boxSolid(nx - this.w / 2, this.y - this.h, this.w, this.h)) this.vx *= -0.7; else this.x = nx;
    if (room.boxSolid(this.x - this.w / 2, ny - this.h, this.w, this.h)) this.vy *= -0.7; else this.y = ny;
    if (this.vx) this.face = this.vx > 0 ? 1 : -1;
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.bat.anchor;
    this.drawFlash(c2, Art.bat.fly[this.frame], this.x, this.y - this.h / 2, a.x, a.y, this.face < 0);
  }
}

class Spider extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 18, h: 14, hp: 2, damage: 1, coinDrop: ri(3, 5), blood: '#4d4067' });
    this.kbScale = 0;                 /* it hangs on a thread, so it stays put */
    this.anchorY = y;                 /* the ceiling it is hitched to */
    /* if the anchor lands inside rock the spider would hang inert, so drop it
       to the first open row below */
    const col = Math.floor(x / TILE);
    let ar = Math.floor(this.anchorY / TILE);
    while (ar < G.room.h - 1 && G.room.solid(col, ar)) ar++;
    this.anchorY = ar * TILE + 2;
    this.y = this.anchorY;
    this.restLen = rr(10, 34);
    this.state = 'hang'; this.t = rr(0, 6);
    this.face = -1;
  }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt; this.stateT -= dt;
    const rate = this.state === 'drop' ? 0.05 : 0.11;
    this.animT += dt; this.frame = Math.floor(this.animT / rate) % 6;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y;
    const near = Math.abs(dx) < 58 && dy > -20 && dy < 150;

    if (this.state === 'hang') {
      const rest = this.anchorY + this.restLen + Math.sin(this.t * 1.6) * 2.4;
      this.y = approach(this.y, rest, 34 * dt);
      if (near && !p.dead) { this.state = 'drop'; this.stateT = 2.4; Snd.spider(); }
    } else if (this.state === 'drop') {
      /* pay out silk fast, tracking the hero's height */
      const target = Math.min(p.cy - 2, this.anchorY + 190);
      this.y = approach(this.y, target, 190 * dt);
      const nx = approach(this.x, p.cx, 26 * dt);
      if (!G.room.boxSolid(nx - this.w / 2, this.y - this.h / 2, this.w, this.h)) this.x = nx;
      if (this.stateT <= 0 || !near) { this.state = 'climb'; this.stateT = 2.6; }
    } else if (this.state === 'climb') {
      this.y = approach(this.y, this.anchorY + this.restLen, 62 * dt);
      if (Math.abs(this.y - this.anchorY - this.restLen) < 1.5) { this.state = 'hang'; this.stateT = 0; }
      if (near && this.stateT <= 0 && !p.dead) { this.state = 'drop'; this.stateT = 2.4; Snd.spider(); }
    }
    /* never sink into the floor beneath it */
    const gy = G.room.groundBelow(this.x, Math.min(this.y, this.anchorY));
    if (this.y + this.h / 2 > gy) this.y = gy - this.h / 2;
    this.face = dx > 0 ? 1 : -1;
    this.touchPlayer();
  }
  draw(c2) {
    /* the silk thread it hangs from */
    c2.fillStyle = '#cfd6e4';
    const x = Math.round(this.x), top = Math.round(this.anchorY), bot = Math.round(this.y - 4);
    for (let y = top; y < bot; y++) if ((y & 1) === 0 || this.state === 'drop') c2.fillRect(x, y, 1, 1);
    const a = Art.spider.anchor;
    const img = (this.state === 'hang' ? Art.spider.hang : Art.spider.walk)[this.frame % 6];
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
  }
}

class Bird extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 16, h: 12, hp: 2, damage: 1, coinDrop: ri(2, 4), blood: '#41506b' });
    /* never start inside the scenery, or it can never get a stoop away */
    let ty = Math.floor(y / TILE);
    while (ty > 1 && G.room.solid(Math.floor(x / TILE), ty)) ty--;
    this.y = ty * TILE + 8;
    this.home = { x: x, y: this.y }; this.t = rr(0, 8); this.face = -1;
    this.state = 'fly'; this.dir = { x: -1, y: 0 };
  }
  box() { return { x: this.x - 8, y: this.y - 6, w: 16, h: 12 }; }
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt; this.stateT -= dt;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy) || 1;
    const rate = this.state === 'dive' ? 0.06 : 0.08;
    this.animT += dt; this.frame = Math.floor(this.animT / rate) % 6;

    if (this.state === 'fly') {
      this.vx = approach(this.vx, Math.cos(this.t * 0.8) * 0.7 + (this.home.x - this.x) * 0.004, 0.05 * dt * 60);
      this.vy = approach(this.vy, Math.sin(this.t * 1.1) * 0.5 + (this.home.y - this.y) * 0.012, 0.05 * dt * 60);
      if (d < 128 && !p.dead && this.stateT <= 0) { this.state = 'aim'; this.stateT = 0.42; Snd.screech(); }
    } else if (this.state === 'aim') {
      /* hang still and line the beak up, whichever way that points */
      this.vx = approach(this.vx, 0, 0.2 * dt * 60);
      this.vy = approach(this.vy, 0, 0.2 * dt * 60);
      this.dir = { x: dx / d, y: dy / d };
      if (this.stateT <= 0) { this.state = 'dive'; this.stateT = 0.55; }
    } else if (this.state === 'dive') {
      /* the pierce: a straight stoop in any direction, but only a glancing blow */
      this.vx = approach(this.vx, this.dir.x * 4.4, 0.5 * dt * 60);
      this.vy = approach(this.vy, this.dir.y * 4.4, 0.5 * dt * 60);
      if (Math.random() < 0.6) G.particles.push(new Particle({
        x: this.x + rr(-3, 3), y: this.y + rr(-3, 3), vx: rr(-0.3, 0.3), vy: rr(-0.3, 0.3),
        life: rr(0.12, 0.3), col: '#e6edf6', col2: '#6d7f9e', size: 1, grav: 0, drag: 0.9
      }));
      if (this.stateT <= 0) { this.state = 'fly'; this.stateT = 1.4; }
    }
    const room = G.room, s = dt * 60;
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    /* a graze in the first instant should not abort the stoop */
    const committed = this.state === 'dive' && this.stateT < 0.45;
    if (room.boxSolid(nx - 8, this.y - 6, 16, 12)) { this.vx *= -0.5; if (committed) { this.state = 'fly'; this.stateT = 1.2; } }
    else this.x = nx;
    if (room.boxSolid(this.x - 8, ny - 6, 16, 12)) { this.vy *= -0.5; if (committed) { this.state = 'fly'; this.stateT = 1.2; } }
    else this.y = ny;
    if (Math.abs(this.vx) > 0.1) this.face = this.vx > 0 ? 1 : -1;
    this.touchPlayer(this.state === 'dive' ? 1 : 1);
  }
  draw(c2) {
    const a = Art.bird.anchor;
    const img = this.state === 'dive' ? Art.bird.dive[this.frame % 2] : Art.bird.fly[this.frame % 6];
    /* the stoop is aimed, so tilt the sprite along its line of attack */
    const rot = this.state === 'dive' ? Math.atan2(this.dir.y, Math.abs(this.dir.x) < 0.001 ? 0.001 : this.dir.x) : 0;
    const flip = this.face < 0;
    c2.save();
    c2.translate(Math.round(this.x), Math.round(this.y));
    if (rot) c2.rotate(flip ? rot - Math.PI : rot);
    if (flip) c2.scale(-1, 1);
    c2.drawImage(img, -Math.round(a.x), -Math.round(a.y));
    if (this.flash > 0) {
      c2.globalAlpha = clamp(this.flash / 0.22, 0, 1);
      c2.drawImage(whiteSprite(img), -Math.round(a.x), -Math.round(a.y));
    }
    c2.restore();
  }
}

class Wisp extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 14, h: 14, hp: 2, damage: 1, coinDrop: ri(2, 4), blood: '#9fe8ff' });
    this.home = { x: x, y: y }; this.t = rr(0, 8);
  }
  box() { return { x: this.x - 7, y: this.y - 7, w: 14, h: 14 }; }
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.animT += dt; this.frame = Math.floor(this.animT / 0.07) % 6;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy) || 1;
    const chase = d < 130 && !p.dead ? 1 : 0;
    const sp = chase ? 1.15 : 0.5;
    this.vx = approach(this.vx, (chase ? dx / d : Math.cos(this.t * 0.9)) * sp, 0.045 * dt * 60);
    this.vy = approach(this.vy, (chase ? dy / d : Math.sin(this.t * 1.3)) * sp
                       + (chase ? 0 : (this.home.y - this.y) * 0.015), 0.045 * dt * 60);
    const room = G.room, s = dt * 60;
    let nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (room.boxSolid(nx - 7, this.y - 7, 14, 14)) this.vx *= -0.6; else this.x = nx;
    if (room.boxSolid(this.x - 7, ny - 7, 14, 14)) this.vy *= -0.6; else this.y = ny;
    if (Math.random() < 0.25) G.particles.push(new Particle({
      x: this.x + rr(-5, 5), y: this.y + rr(-5, 5), vx: rr(-0.3, 0.3), vy: rr(-0.5, 0.1),
      life: rr(0.15, 0.4), col: '#ffffff', col2: '#3f6fd8', size: rr(1, 2), grav: 0, drag: 0.9
    }));
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.wisp.anchor;
    c2.save();
    c2.globalCompositeOperation = 'lighter';
    c2.globalAlpha = 0.18;
    c2.fillStyle = '#6fb6e8';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), 13, 0, TAU); c2.fill();
    c2.restore();
    this.drawFlash(c2, Art.wisp.fly[this.frame], this.x, this.y, a.x, a.y, false);
  }
}

class Sporeling extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 16, h: 16, hp: 2, damage: 1, coinDrop: ri(2, 4), blood: '#c9403a' });
    this.face = rpick([-1, 1]); this.hopT = rr(0.2, 1.2);
  }
  kill() {
    super.kill();
    for (let i = 0; i < 18; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: rr(-2, 2), vy: rr(-2.4, -0.2), life: rr(0.5, 1.2),
      col: '#f6efdc', col2: '#9be89a', size: rr(1, 2.4), grav: -0.01, drag: 0.94
    }));
    Snd.spore();
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt; this.frame = Math.floor(this.animT / 0.09) % 8;
    const p = G.player;
    const dx = p.cx - this.cx;
    if (Math.abs(dx) < 150 && !p.dead) this.face = dx > 0 ? 1 : -1;
    this.hopT -= dt;
    if (this.grounded && this.hopT <= 0) {
      this.hopT = rr(0.7, 1.3);
      this.vy = -4.2; this.vx = this.face * (Math.abs(dx) < 150 ? 1.5 : 0.8);
      Snd.hopSoft();
    }
    if (this.grounded) this.vx = approach(this.vx, 0, 0.1 * dt * 60);
    if (this.grounded && this.edgeAhead()) this.face *= -1;
    this.physics(dt);
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.sporeling.anchor;
    this.drawFlash(c2, Art.sporeling.hop[this.frame], this.x, this.y, a.x, a.y, this.face < 0);
  }
}

/* a stone idol that spits fire and can only be broken by its own fire returned */
/* A suit of armour standing watch. It sleeps on its plinth until you come
   near, then steps down and comes at you with the blade. */
class Armour extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 20, h: 30, hp: 9, damage: 2, coinDrop: ri(8, 14), blood: '#8a94a6' });
    this.state = 'stand'; this.stateT = 0; this.awake = false; this.face = -1;
    this.swingT = 0; this.hitSet = null;
  }
  wake() {
    if (this.awake) return;
    this.awake = true; this.state = 'rouse'; this.stateT = 0.9;
    Snd.slam(); G.shake(4);
    for (let i = 0; i < 22; i++) G.particles.push(new Particle({
      x: this.cx + rr(-9, 9), y: this.cy + rr(-14, 14), vx: rr(-1.6, 1.6), vy: rr(-2, 0.4),
      life: rr(0.3, 0.8), col: '#c9d4e8', col2: '#4a5165', size: rr(1, 2.6), grav: 0.14
    }));
  }
  hurt(dmg, fx, fy, mult) { this.wake(); super.hurt(dmg, fx, fy, mult); }
  swordBox() {
    if (this.state !== 'swing' || this.swingT < 0.16 || this.swingT > 0.34) return null;
    return { x: this.face > 0 ? this.x + this.w - 4 : this.x - 22, y: this.y + 2, w: 26, h: this.h - 6 };
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt;
    const p = G.player;
    const d = Math.abs(p.cx - this.cx);
    if (!this.awake) {
      this.frame = 0;
      if (d < 96 && Math.abs(p.cy - this.cy) < 70 && !p.dead) this.wake();
      this.physics(dt);
      return;
    }
    this.stateT -= dt;
    if (d > 6) this.face = p.cx > this.cx ? 1 : -1;

    if (this.state === 'rouse') {
      this.vx = 0;
      this.frame = Math.floor(this.animT / 0.12) % 4;
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 1.6; }
    } else if (this.state === 'walk') {
      this.frame = Math.floor(this.animT / 0.13) % 4;
      this.vx = approach(this.vx, this.face * 1.15, 0.08 * dt * 60);
      if (this.grounded && this.edgeAhead()) { this.turn(); this.vx = 0; }
      if (d < 34 || this.stateT <= 0) {
        this.state = 'swing'; this.swingT = 0; this.hitSet = new Set(); this.vx = 0;
        Snd.swing();
      }
    } else if (this.state === 'swing') {
      this.swingT += dt;
      this.frame = Math.min(5, Math.floor(this.swingT / 0.075));
      this.vx = approach(this.vx, 0, 0.2 * dt * 60);
      const box = this.swordBox();
      if (box && !p.dead && !this.hitSet.has('p') &&
          rectsOverlap(box, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        this.hitSet.add('p');
        if (p.hurt(this.damage, this.cx, this.cy)) G.shake(4);
      }
      if (this.swingT > 0.52) { this.state = 'walk'; this.stateT = rr(0.8, 1.5); }
    }
    this.physics(dt);
    this.touchPlayer(1);
  }
  draw(c2) {
    const set = Art.armour;
    const a = set.anchor;
    let img;
    if (!this.awake) img = set.idle[0];
    else if (this.state === 'swing') img = set.attack[this.frame % 6];
    else if (this.state === 'rouse') img = set.idle[this.frame % 4];
    else img = set.walk[this.frame % 4];
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face > 0);
  }
}

class Idol extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 24, h: 26, hp: 3, damage: 2, coinDrop: 6, blood: '#5b5b71' });
    this.kbScale = 0;                 /* carved stone does not move */
    this.face = -1; this.shotT = 1.2;
  }
  box() { return { x: this.x - 12, y: this.y - 26, w: 24, h: 26 }; }
  hurt(dmg, fx, fy, coinMult, fromParry) {
    if (!fromParry) {
      /* the blade rings off the stone */
      this.flash = 0.12;
      Snd.hitHard();
      G.texts.push(new FloatText(this.cx, this.cy - 14, 'STONE', '#c9d4e8'));
      return;
    }
    super.hurt(dmg, fx, fy, coinMult);
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt;
    const p = G.player;
    this.face = p.cx > this.x ? 1 : -1;
    this.shotT -= dt;
    this.frame = Math.floor(this.animT / 0.12) % 6;
    if (this.shotT <= 0 && Math.abs(p.cx - this.x) < 190 && !p.dead) {
      this.shotT = 2.0;
      const dx = p.cx - this.x, dy = (p.cy - 4) - (this.y - 16);
      const l = Math.hypot(dx, dy) || 1;
      G.projectiles.push(new Fireball(this.x + this.face * 12, this.y - 16,
                                      dx / l * 1.7, dy / l * 1.7, 1));
      Snd.fire();
    }
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.idol.anchor;
    this.drawFlash(c2, Art.idol.idle[this.frame % 6], this.x, this.y, a.x, a.y, this.face > 0);
  }
}

/* ---------- projectiles ---------- */
/* Anything thrown at you can be turned round with a well timed swing. */
function projImpact(pr, halfW, halfH) {
  const box = { x: pr.x - halfW, y: pr.y - halfH, w: halfW * 2, h: halfH * 2 };
  if (pr.friendly) {
    for (const en of G.enemies) {
      if (en.dead) continue;
      if (!rectsOverlap(box, en.box())) continue;
      en.hurt(pr.dmg, pr.x, pr.y, undefined, true);
      G.shake(5); G.hitStop(0.06);
      return true;
    }
    return false;
  }
  const p = G.player;
  if (!p.dead && rectsOverlap(box, { x: p.x, y: p.y, w: p.w, h: p.h })) { p.hurt(pr.dmg, pr.x, pr.y); return true; }
  return false;
}
function deflectShot(pr, dmg) {
  /* some realms send a parried shot back harder than the blade struck it */
  dmg = Math.max(1, Math.round(dmg * (G.parryMult ? G.parryMult() : 1)));
  const b = G.boss;
  let dx, dy;
  if (b && !b.dead) { dx = b.x - pr.x; dy = (b.y - 40) - pr.y; }
  else { dx = -(pr.vx || 1); dy = -(pr.vy || 0); }
  const l = Math.hypot(dx, dy) || 1;
  pr.vx = dx / l * 5.4;
  pr.vy = dy / l * 5.4;
  pr.friendly = true;
  pr.dmg = dmg;
  pr.life = Math.max(pr.life || 0, 2.4);
  if (pr.c) pr.c = { col: '#dff0ff', col2: '#3f6fd8', dmg: dmg, grav: 0, snd: pr.c.snd };
  for (let i = 0; i < 18; i++) G.particles.push(new Particle({
    x: pr.x, y: pr.y, vx: rr(-3, 3), vy: rr(-3, 3), life: rr(0.2, 0.5),
    col: '#ffffff', col2: '#8fd0ff', size: rr(1, 2.6), grav: 0.02, drag: 0.9
  }));
}

class Fireball {
  constructor(x, y, vx, vy, dmg) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dmg = dmg || 1;
    this.life = 4; this.dead = false; this.t = 0; this.r = 6;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const s = dt * 60;
    this.x += this.vx * s; this.y += this.vy * s;
    /* a shot sent back flies true; it is your aim carrying it, not its own arc */
    if (!this.friendly) this.vy += 0.055 * s;
    if (Math.random() < 0.85) G.particles.push(new Particle({
      x: this.x + rr(-3, 3), y: this.y + rr(-3, 3), vx: rr(-0.4, 0.4), vy: rr(-0.8, -0.1),
      life: rr(0.2, 0.5), col: '#ffb638', col2: '#a83218', size: rr(1.5, 3.5), grav: -0.02, type: 'fire'
    }));
    if (projImpact(this, 6, 6)) this.explode();
    if (G.room.solidPx(this.x, this.y) || this.life <= 0) this.explode();
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    Snd.fireball(); G.shake(2);
    for (let i = 0; i < 18; i++) G.particles.push(new Particle({
      x: this.x, y: this.y, vx: rr(-2.6, 2.6), vy: rr(-2.6, 1.6), life: rr(0.25, 0.6),
      col: '#ffd06a', col2: '#a83218', size: rr(1.5, 4), grav: 0.08, type: 'fire'
    }));
  }
  draw(c2) {
    const f = Art.item.fireball[Math.floor(this.t / 0.07) % 4];
    if (this.friendly) {
      c2.save();
      c2.globalCompositeOperation = 'lighter';
      blit(c2, f, this.x, this.y, 8, 8, this.vx < 0, 0.9);
      c2.restore();
    }
    blit(c2, f, this.x, this.y, 8, 8, this.vx < 0, this.friendly ? 0.7 : 1);
  }
}

/* ============================================================
   CHAPTER TWO — the Sunken Depths
   ============================================================ */
class Jelly extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 16, h: 14, hp: 3, damage: 1, coinDrop: ri(3, 5), blood: '#8f6fd0' });
    this.home = { x: x, y: y }; this.t = rr(0, 8);
  }
  box() { return { x: this.x - 8, y: this.y - 7, w: 16, h: 20 }; }   /* the stingers count */
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.animT += dt; this.frame = Math.floor(this.animT / 0.14) % 6;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy) || 1;
    /* pulses: a push on the beat, a drift between */
    const pulse = Math.max(0, Math.sin(this.t * 2.4));
    const near = d < 120 && !p.dead;
    this.vx = approach(this.vx, (near ? dx / d : Math.cos(this.t * 0.6)) * pulse * 1.1, 0.05 * dt * 60);
    this.vy = approach(this.vy, (near ? dy / d : 0) * pulse * 1.0 + (this.home.y - this.y) * 0.01 - 0.12, 0.05 * dt * 60);
    const room = G.room, s = dt * 60;
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (room.boxSolid(nx - 8, this.y - 7, 16, 14)) this.vx *= -0.6; else this.x = nx;
    if (room.boxSolid(this.x - 8, ny - 7, 16, 14)) this.vy *= -0.6; else this.y = ny;
    if (Math.random() < 0.12) G.particles.push(new Particle({
      x: this.x + rr(-6, 6), y: this.y + rr(2, 14), vx: rr(-0.2, 0.2), vy: rr(-0.4, 0),
      life: rr(0.3, 0.7), col: '#c9a8ff', col2: '#8f6fd0', size: 1, grav: 0, drag: 0.95
    }));
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.jelly.anchor;
    c2.save(); c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = 0.14;
    c2.fillStyle = '#8f6fd0';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), 14, 0, TAU); c2.fill(); c2.restore();
    this.drawFlash(c2, Art.jelly.swim[this.frame], this.x, this.y, a.x, a.y, false);
  }
}
class Crab extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 24, h: 16, hp: 5, damage: 2, coinDrop: ri(5, 8), blood: '#d9663a' });
    this.face = rpick([-1, 1]); this.speed = 0.6;
  }
  hurt(dmg, fx, fy, mult) {
    /* the shell turns a blow struck from in front */
    const fromFront = Math.sign(fx - this.x) === this.face;
    super.hurt(fromFront && this.state !== 'charge' ? Math.max(1, Math.floor(dmg / 2)) : dmg, fx, fy, mult);
    if (fromFront) Snd.hitHard();
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.stateT -= dt;
    const rate = this.state === 'charge' ? 0.06 : 0.11;
    this.animT += dt; this.frame = Math.floor(this.animT / rate) % (this.state === 'charge' ? 4 : 6);
    const p = G.player;
    const d = Math.abs(p.cx - this.x);
    if (this.state === 'walk') {
      this.vx = this.face * this.speed;
      if (this.grounded && this.edgeAhead()) this.turn();
      if (d < 96 && Math.abs(p.cy - this.cy) < 34 && !p.dead) {
        this.state = 'charge'; this.stateT = 1.5; this.face = p.cx > this.x ? 1 : -1; Snd.click();
      }
    } else if (this.state === 'charge') {
      this.vx = approach(this.vx, this.face * 2.9, 0.16 * dt * 60);
      if (this.grounded && this.edgeAhead()) { this.turn(); this.state = 'walk'; }
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 0.8; }
    }
    this.physics(dt);
    this.touchPlayer(this.state === 'charge' ? 2 : 1);
  }
  draw(c2) {
    const a = Art.crab.anchor;
    const img = this.state === 'charge' ? Art.crab.charge[this.frame % 4] : Art.crab.walk[this.frame % 6];
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
  }
}
class Angler extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 26, h: 18, hp: 4, damage: 2, coinDrop: ri(4, 7), blood: '#2b4a63' });
    this.home = { x: x, y: y }; this.t = rr(0, 8); this.face = -1;
  }
  box() { return { x: this.x - 13, y: this.y - 9, w: 26, h: 18 }; }
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt; this.stateT -= dt;
    this.animT += dt; this.frame = Math.floor(this.animT / 0.1) % 6;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy) || 1;
    if (this.state === 'walk') {
      this.vx = approach(this.vx, Math.cos(this.t * 0.5) * 0.5, 0.04 * dt * 60);
      this.vy = approach(this.vy, Math.sin(this.t * 0.8) * 0.4 + (this.home.y - this.y) * 0.01, 0.04 * dt * 60);
      if (d < 120 && !p.dead && this.stateT <= 0) { this.state = 'lunge'; this.stateT = 0.9; Snd.gulp(); }
    } else {
      this.vx = approach(this.vx, dx / d * 2.6, 0.14 * dt * 60);
      this.vy = approach(this.vy, dy / d * 2.6, 0.14 * dt * 60);
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 1.6; }
    }
    const room = G.room, s = dt * 60;
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (room.boxSolid(nx - 13, this.y - 9, 26, 18)) this.vx *= -0.5; else this.x = nx;
    if (room.boxSolid(this.x - 13, ny - 9, 26, 18)) this.vy *= -0.5; else this.y = ny;
    if (Math.abs(this.vx) > 0.1) this.face = this.vx > 0 ? 1 : -1;
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.angler.anchor;
    c2.save(); c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = 0.2;
    c2.fillStyle = '#a8f0d8';
    c2.beginPath(); c2.arc(Math.round(this.x + this.face * 8), Math.round(this.y - 13), 12, 0, TAU); c2.fill(); c2.restore();
    this.drawFlash(c2, Art.angler.swim[this.frame], this.x, this.y, a.x, a.y, this.face > 0);
  }
}

/* ============================================================
   CHAPTER THREE — the Ashen Reach
   ============================================================ */
class Emberling extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 16, h: 18, hp: 4, damage: 4, coinDrop: ri(6, 9), blood: '#ff7a2a' });
    this.face = rpick([-1, 1]); this.hopT = rr(0.2, 1);
  }
  kill() {
    super.kill();
    for (let i = 0; i < 16; i++) G.particles.push(new Particle({
      x: this.cx, y: this.cy, vx: rr(-2.4, 2.4), vy: rr(-2.6, -0.2), life: rr(0.4, 0.9),
      col: '#ffd06a', col2: '#c0341a', size: rr(1.5, 3.4), grav: -0.02, type: 'fire'
    }));
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt; this.frame = Math.floor(this.animT / 0.09) % 8;
    const p = G.player;
    const dx = p.cx - this.cx;
    if (Math.abs(dx) < 170 && !p.dead) this.face = dx > 0 ? 1 : -1;
    this.hopT -= dt;
    if (this.grounded && this.hopT <= 0) {
      this.hopT = rr(0.55, 1.0);
      this.vy = -4.6; this.vx = this.face * (Math.abs(dx) < 170 ? 1.8 : 0.9);
      Snd.hopSoft();
    }
    if (this.grounded) {
      this.vx = approach(this.vx, 0, 0.1 * dt * 60);
      /* it leaves cinders where it lands */
      if (Math.random() < 0.2) G.particles.push(new Particle({
        x: this.cx + rr(-5, 5), y: this.y - 1, vx: rr(-0.3, 0.3), vy: rr(-0.9, -0.2),
        life: rr(0.3, 0.7), col: '#ff7a2a', col2: '#6a1a08', size: rr(1, 2), grav: -0.02, type: 'fire'
      }));
    }
    if (this.grounded && this.edgeAhead()) this.face *= -1;
    this.physics(dt);
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.emberling.anchor;
    c2.save(); c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = 0.12;
    c2.fillStyle = '#ff7a2a';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y - 10), 14, 0, TAU); c2.fill(); c2.restore();
    this.drawFlash(c2, Art.emberling.hop[this.frame], this.x, this.y, a.x, a.y, this.face < 0);
  }
}
class Golem extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 30, h: 30, hp: 10, damage: 6, coinDrop: ri(12, 18), blood: '#4a3a44' });
    this.face = rpick([-1, 1]); this.speed = 0.34;
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.stateT -= dt;
    this.animT += dt;
    const p = G.player;
    const d = Math.abs(p.cx - this.cx);
    if (this.state === 'walk') {
      this.frame = Math.floor(this.animT / 0.15) % 6;
      this.vx = this.face * this.speed;
      if (this.grounded && this.edgeAhead()) this.turn();
      if (d < 72 && Math.abs(p.cy - this.cy) < 40 && !p.dead) {
        this.state = 'wind'; this.stateT = 0.7; this.vx = 0; this.face = p.cx > this.cx ? 1 : -1;
      }
    } else if (this.state === 'wind') {
      this.frame = Math.floor(this.animT / 0.12) % 4;
      this.vx = 0;
      if (this.stateT <= 0) {
        this.state = 'rest'; this.stateT = 1.1;
        Snd.slam(); G.shake(7);
        /* the shock wave, not the fist, is what catches you */
        const p2 = G.player;
        if (!p2.dead && Math.abs(p2.cx - this.cx) < 62 && Math.abs(p2.cy - this.cy) < 40 && p2.grounded)
          p2.hurt(2, this.cx, this.cy);
        for (let k = 0; k < 22; k++) G.particles.push(new Particle({
          x: this.cx + rr(-30, 30), y: this.y, vx: rr(-3, 3), vy: rr(-3.4, -0.4), life: rr(0.3, 0.7),
          col: '#a89ba0', col2: '#4a3a44', size: rr(1, 3), grav: 0.2
        }));
      }
    } else {
      this.frame = Math.floor(this.animT / 0.2) % 6;
      this.vx = approach(this.vx, 0, 0.1 * dt * 60);
      if (this.stateT <= 0) this.state = 'walk';
    }
    this.physics(dt);
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.golem.anchor;
    const img = this.state === 'wind' ? Art.golem.slam[this.frame % 4] : Art.golem.walk[this.frame % 6];
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
  }
}
class Cinderwing extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 18, h: 14, hp: 4, damage: 5, coinDrop: ri(7, 11), blood: '#ff7a2a' });
    this.home = { x: x, y: y }; this.t = rr(0, 8);
  }
  box() { return { x: this.x - 9, y: this.y - 7, w: 18, h: 14 }; }
  get cy() { return this.y; }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt; this.stateT -= dt;
    this.animT += dt; this.frame = Math.floor(this.animT / 0.07) % 6;
    const p = G.player;
    const dx = p.cx - this.x, dy = p.cy - this.y, d = Math.hypot(dx, dy) || 1;
    if (this.state === 'walk') {
      this.vx = approach(this.vx, Math.cos(this.t * 0.9) * 0.8, 0.05 * dt * 60);
      this.vy = approach(this.vy, Math.sin(this.t * 1.4) * 0.6 + (this.home.y - this.y) * 0.012, 0.05 * dt * 60);
      if (d < 140 && !p.dead && this.stateT <= 0) { this.state = 'dive'; this.stateT = 1.5; Snd.screech(); }
    } else {
      this.vx = approach(this.vx, dx / d * 2.9, 0.12 * dt * 60);
      this.vy = approach(this.vy, dy / d * 2.9, 0.12 * dt * 60);
      if (Math.random() < 0.8) G.particles.push(new Particle({
        x: this.x + rr(-4, 4), y: this.y + rr(-3, 3), vx: rr(-0.3, 0.3), vy: rr(-0.6, 0),
        life: rr(0.25, 0.6), col: this.trailCol || '#ff7a2a', col2: this.trailCol2 || '#6a1a08',
        size: rr(1.4, 2.8), grav: -0.02, type: this.trailType || 'fire'
      }));
      if (this.stateT <= 0) { this.state = 'walk'; this.stateT = 1.3; }
    }
    const room = G.room, s = dt * 60;
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (room.boxSolid(nx - 9, this.y - 7, 18, 14)) this.vx *= -0.6; else this.x = nx;
    if (room.boxSolid(this.x - 9, ny - 7, 18, 14)) this.vy *= -0.6; else this.y = ny;
    if (Math.abs(this.vx) > 0.1) this.face = this.vx > 0 ? 1 : -1;
    this.touchPlayer();
  }
  draw(c2) {
    const a = Art.cinderwing.anchor;
    c2.save(); c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = 0.14;
    c2.fillStyle = '#ff7a2a';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), 15, 0, TAU); c2.fill(); c2.restore();
    this.drawFlash(c2, Art.cinderwing.fly[this.frame], this.x, this.y, a.x, a.y, this.face > 0);
  }
}

/* ---------- lightning ---------- */
function boltPath(x0, y0, x1, y1, seed, jag) {
  const r = new RNG(seed);
  const pts = [[x0, y0]];
  const n = Math.max(4, Math.round(Math.hypot(x1 - x0, y1 - y0) / 9));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const px = lerp(x0, x1, t), py = lerp(y0, y1, t);
    const nx = -(y1 - y0), ny = (x1 - x0);
    const l = Math.hypot(nx, ny) || 1;
    const off = r.r(-jag, jag) * Math.sin(t * Math.PI);
    pts.push([px + nx / l * off, py + ny / l * off]);
  }
  pts.push([x1, y1]);
  return pts;
}
function drawBolt(c2, pts, seed, w, col) {
  c2.save();
  const paint = (col, width) => {
    c2.fillStyle = col;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(lerp(a[0], b[0], s / steps)), y = Math.round(lerp(a[1], b[1], s / steps));
        c2.fillRect(x - (width >> 1), y - (width >> 1), width, width);
      }
    }
  };
  paint(col ? sh(C(col), -0.45) : '#3f6fd8', w + 3);
  paint(col || '#9fe8ff', w + 1);
  paint('#ffffff', w);
  /* forks */
  const r = new RNG(seed + 7);
  for (let k = 0; k < 3; k++) {
    const i = r.i(1, Math.max(1, pts.length - 2));
    const a = pts[i];
    const fx = a[0] + r.r(-16, 16), fy = a[1] + r.r(6, 20);
    const fp = boltPath(a[0], a[1], fx, fy, seed + k * 13, 4);
    c2.fillStyle = col || '#9fe8ff';
    for (const q of fp) c2.fillRect(Math.round(q[0]), Math.round(q[1]), 1, 1);
  }
  c2.restore();
}

class LightningStrike {
  constructor(x, groundY, topY, dmg) {
    this.x = x; this.gy = groundY; this.ty = topY;
    this.dmg = dmg || 1; this.t = 0; this.dead = false;
    this.warn = 0.7; this.live = 0.24; this.seed = ri(1, 9999);
    this.hit = false;
  }
  /* the bolt runs from cloud to ground, so anything that asks a projectile
     where it is gets the middle of that line */
  get y() { return (this.ty + this.gy) / 2; }
  update(dt) {
    this.t += dt;
    if (this.t > this.warn && !this.hit) {
      this.hit = true;
      Snd.thunder(); G.shake(7); G.flash(0.22);
      for (let i = 0; i < 26; i++) G.particles.push(new Particle({
        x: this.x + rr(-8, 8), y: this.gy, vx: rr(-3.4, 3.4), vy: rr(-4, -0.4), life: rr(0.3, 0.7),
        col: '#ffffff', col2: '#3f6fd8', size: rr(1, 2.6), grav: 0.2
      }));
    }
    if (this.t > this.warn && this.t < this.warn + this.live) {
      const p = G.player;
      if (!p.dead && rectsOverlap({ x: this.x - 9, y: this.ty, w: 18, h: this.gy - this.ty + 6 },
                                  { x: p.x, y: p.y, w: p.w, h: p.h })) p.hurt(this.dmg, this.x, p.cy);
    }
    if (this.t > this.warn + this.live) this.dead = true;
  }
  draw(c2) {
    if (this.t < this.warn) {
      /* telegraph: a growing scorch ring on the floor */
      const k = this.t / this.warn;
      c2.save();
      c2.globalAlpha = 0.35 + Math.sin(this.t * 30) * 0.25;
      c2.fillStyle = '#ffe14d';
      const rw = 14 * k;
      for (let i = -rw; i <= rw; i++) c2.fillRect(Math.round(this.x + i), Math.round(this.gy - 1), 1, 2);
      c2.globalAlpha = 0.5;
      for (let i = 0; i < 5; i++) c2.fillRect(Math.round(this.x), Math.round(this.gy - 6 - i * 5), 1, 3);
      c2.restore();
      return;
    }
    const f = (this.t - this.warn) / this.live;
    c2.save();
    c2.globalAlpha = 1 - f * 0.6;
    drawBolt(c2, boltPath(this.x + rr(-3, 3), this.ty, this.x, this.gy, this.seed, 9), this.seed, 2, this.col);
    c2.restore();
  }
}
class Bolt {
  constructor(x, y, vx, vy, dmg) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.dmg = dmg || 1;
    this.life = 3.2; this.dead = false; this.t = 0; this.seed = ri(1, 9999);
    this.trail = [];
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const s = dt * 60;
    this.trail.push([this.x, this.y]);
    if (this.trail.length > 7) this.trail.shift();
    this.x += this.vx * s; this.y += this.vy * s;
    if (Math.random() < 0.6) G.particles.push(new Particle({
      x: this.x + rr(-3, 3), y: this.y + rr(-3, 3), vx: rr(-0.4, 0.4), vy: rr(-0.4, 0.4),
      life: rr(0.12, 0.32), col: '#ffffff', col2: '#3f6fd8', size: rr(1, 2), grav: 0, drag: 0.9
    }));
    if (projImpact(this, 6, 6)) this.burst();
    if (G.room.solidPx(this.x, this.y) || this.life <= 0) this.burst();
  }
  burst() {
    if (this.dead) return;
    this.dead = true;
    Snd.zap(); G.shake(2);
    for (let i = 0; i < 16; i++) G.particles.push(new Particle({
      x: this.x, y: this.y, vx: rr(-3, 3), vy: rr(-3, 3), life: rr(0.2, 0.5),
      col: '#ffffff', col2: '#3f6fd8', size: rr(1, 3), grav: 0.05, drag: 0.9
    }));
  }
  draw(c2) {
    if (this.trail.length > 1) {
      const pts = this.trail.slice();
      drawBolt(c2, pts, this.seed, 1);
    }
    c2.fillStyle = '#ffffff';
    c2.fillRect(Math.round(this.x) - 2, Math.round(this.y) - 2, 4, 4);
    c2.fillStyle = '#9fe8ff';
    c2.fillRect(Math.round(this.x) - 3, Math.round(this.y) - 1, 6, 2);
    c2.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 3, 2, 6);
  }
}

/* ---------- Zeus ---------- */
class Zeus extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 40, h: 70, hp: 62, damage: 2, coinDrop: 0, blood: '#f6f8ff' });
    this.kbScale = 0;                 /* a guardian holds its ground */
    this.maxHp = 62; this.face = -1;
    this.state = 'sleep'; this.stateT = 0; this.phase = 1;
    this.awake = false; this.dying = false; this.deathT = 0;
    this.homeY = y; this.mode = 'idle';
  }
  box() { return { x: this.x - 20, y: this.y - 74, w: 40, h: 70 }; }
  hurt(dmg, fx, fy, mult) {
    if (this.dying) return;
    if (!this.awake) this.wake();
    super.hurt(dmg, fx, fy, mult);
    this.vx = 0; this.vy = 0;
    if (!this.dead) {
      const f = this.hp / this.maxHp;
      if (f < 0.6 && this.phase === 1) { this.phase = 2; this.roar(); }
      else if (f < 0.3 && this.phase === 2) { this.phase = 3; this.roar(); }
    }
  }
  roar() { Snd.thunder(); G.shake(9); G.flash(0.3); this.state = 'cast'; this.mode = 'cast'; this.stateT = 1.1; }
  wake() { if (this.awake) return; this.awake = true; this.roar(); }
  kill() { if (this.dying) return; this.dying = true; this.deathT = 0; Snd.thunder(); G.shake(12); }
  teleport() {
    const room = G.room;
    for (let k = 0; k < 24; k++) G.particles.push(new Particle({
      x: this.x + rr(-18, 18), y: this.y - rr(0, 70), vx: rr(-3, 3), vy: rr(-3, 3), life: rr(0.2, 0.5),
      col: '#ffffff', col2: '#3f6fd8', size: rr(1, 3), grav: 0, drag: 0.9
    }));
    const p = G.player;
    this.x = clamp(p.cx + (Math.random() < 0.5 ? -110 : 110), 110, room.pxW() - 110);
    this.y = this.homeY;
    Snd.zap();
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.bossRegen(dt, 0.005);
    this.animT += dt;
    const p = G.player;
    if (this.dying) {
      this.deathT += dt;
      if (Math.random() < 0.6) G.particles.push(new Particle({
        x: this.x + rr(-24, 24), y: this.y - rr(0, 76), vx: rr(-2, 2), vy: rr(-3, -0.4),
        life: rr(0.4, 1.0), col: '#ffffff', col2: '#3f6fd8', size: rr(2, 4.4), grav: -0.02
      }));
      if (Math.random() < 0.1) { Snd.zap(); G.shake(5); }
      if (this.deathT > 2.8 && !this.dead) {
        this.dead = true;
        Snd.explode(); G.shake(16); G.flash(0.9);
        for (let i = 0; i < 80; i++) G.particles.push(new Particle({
          x: this.x, y: this.y - 40, vx: rr(-7, 7), vy: rr(-7, 3), life: rr(0.6, 1.5),
          col: '#ffffff', col2: '#3f6fd8', size: rr(2, 5), grav: 0.08
        }));
        G.payOut(40, this.x, this.y - 20);
        G.onBossDead();
      }
      return;
    }
    if (!this.awake) {
      this.frame = Math.floor(this.animT / 0.28) % 4;
      if (Math.abs(p.cx - this.x) < 200) this.wake();
      return;
    }
    this.stateT -= dt;
    this.face = p.cx > this.x ? 1 : -1;
    this.y = approach(this.y, this.homeY + Math.sin(this.animT * 1.4) * 3, 40 * dt);
    const sp = this.phase === 3 ? 1.5 : (this.phase === 2 ? 1.22 : 1);

    switch (this.state) {
      case 'cast': {
        this.mode = 'cast';
        this.frame = Math.floor(this.animT / 0.1) % 4;
        this.castT = (this.castT || 0) - dt;
        if (this.castT <= 0) {
          this.castT = 0.42 / sp;
          const n = this.phase >= 3 ? 3 : (this.phase === 2 ? 2 : 1);
          const gy = G.room.groundBelow(p.cx, p.cy) - 1;
          for (let k = 0; k < n; k++) {
            const tx = clamp(p.cx + (k - (n - 1) / 2) * 46 + rr(-8, 8), 40, G.room.pxW() - 40);
            G.projectiles.push(new LightningStrike(tx, G.room.groundBelow(tx, 40) - 1, 8, 1));
          }
          void gy;
          Snd.charge();
        }
        if (this.stateT <= 0) { this.state = 'throw'; this.mode = 'throw'; this.stateT = 1.5; this.shotT = 0; }
        break;
      }
      case 'throw': {
        this.mode = 'throw';
        this.frame = Math.floor(this.animT / 0.1) % 3;
        this.shotT = (this.shotT || 0) - dt;
        if (this.shotT <= 0) {
          this.shotT = 0.5 / sp;
          const dx = p.cx - (this.x + this.face * 24), dy = p.cy - (this.y - 48);
          const a = Math.atan2(dy, dx);
          const n = this.phase >= 2 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const ang = a + (k - (n - 1) / 2) * 0.3;
            G.projectiles.push(new Bolt(this.x + this.face * 24, this.y - 48,
                                        Math.cos(ang) * 3.2, Math.sin(ang) * 3.2, 1));
          }
          Snd.zap();
        }
        if (this.stateT <= 0) { this.state = 'move'; this.stateT = 0.9; }
        break;
      }
      case 'move': {
        this.mode = 'idle';
        this.frame = Math.floor(this.animT / 0.16) % 4;
        if (this.stateT <= 0) {
          this.teleport();
          this.state = 'cast'; this.mode = 'cast'; this.stateT = 1.6; this.castT = 0.2;
        }
        break;
      }
      default:
        this.state = 'cast'; this.stateT = 1.4;
    }
    this.touchPlayer(2);
  }
  draw(c2) {
    const a = Art.zeus.anchor;
    let img;
    if (!this.awake) img = Art.zeus.idle[this.frame % 4];
    else if (this.mode === 'cast') img = Art.zeus.cast[this.frame % 4];
    else if (this.mode === 'throw') img = Art.zeus.throw[this.frame % 3];
    else img = Art.zeus.idle[this.frame % 4];
    let alpha = 1;
    if (this.dying) alpha = 0.5 + Math.sin(this.deathT * 24) * 0.5;
    c2.save();
    if (alpha < 1) c2.globalAlpha = alpha;
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face > 0);
    c2.restore();
  }
}

/* ============================================================
   GUARDIANS — one engine, six very different fights
   ============================================================ */
class Shot {
  constructor(x, y, vx, vy, cfg) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.c = cfg; this.dmg = cfg.dmg || 1;
    this.life = cfg.life || 3.4; this.dead = false; this.t = 0;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const s = dt * 60;
    this.x += this.vx * s; this.y += this.vy * s;
    this.vy += (this.c.grav === undefined ? 0.03 : this.c.grav) * s;
    if (this.c.home) {
      const p2 = G.player;
      const dx = p2.cx - this.x, dy = p2.cy - this.y, l = Math.hypot(dx, dy) || 1;
      this.vx = approach(this.vx, dx / l * this.c.home, 0.05 * s);
      this.vy = approach(this.vy, dy / l * this.c.home, 0.05 * s);
    }
    if (Math.random() < 0.6) G.particles.push(new Particle({
      x: this.x + rr(-3, 3), y: this.y + rr(-3, 3), vx: rr(-0.3, 0.3), vy: rr(-0.4, 0.1),
      life: rr(0.16, 0.42), col: this.c.col, col2: this.c.col2, size: rr(1.2, 2.6),
      grav: -0.01, type: this.c.fiery ? 'fire' : 'disc'
    }));
    if (projImpact(this, 6, 6)) this.burst();
    if (G.room.solidPx(this.x, this.y) || this.life <= 0) this.burst();
  }
  burst() {
    if (this.dead) return;
    this.dead = true;
    if (this.c.snd) Snd[this.c.snd]();
    for (let i = 0; i < 14; i++) G.particles.push(new Particle({
      x: this.x, y: this.y, vx: rr(-2.6, 2.6), vy: rr(-2.6, 1.6), life: rr(0.2, 0.55),
      col: this.c.col, col2: this.c.col2, size: rr(1.4, 3.2), grav: 0.06, drag: 0.92
    }));
  }
  draw(c2) {
    const r = 4.4 + Math.sin(this.t * 10) * 0.7;
    c2.fillStyle = this.c.col2;
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), r + 1.4, 0, TAU); c2.fill();
    c2.fillStyle = this.c.col;
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), r, 0, TAU); c2.fill();
    c2.fillStyle = '#ffffff';
    c2.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
  }
}

const GUARDIANS = {
  /* the three of the Sunken Depths land every blow three times as hard */
  tideWarden: { art: 'tideWarden', title: 'THE TIDE WARDEN', hp: 70, scale: 1.8,
    attacks: ['volley', 'shock', 'aimed'], shots: 7, spread: 1.5, dmgMul: 3,
    proj: { col: '#a8cbd6', col2: '#2f6fb0', dmg: 2, grav: 0.02, snd: 'splash' } },
  /* The kraken asks for skill, not for hearts.  Nothing it does takes more
     than one heart, it stands half the health it once did, and it knits
     itself back together at a quarter of the usual rate. */
  kraken: { art: 'kraken', title: 'THE KRAKEN MAW', hp: 44, scale: 2.1,
    attacks: ['volley', 'sweep', 'summon', 'grab'], shots: 9, spread: 2.4, minion: 'Jelly', brood: 3,
    maxHit: 2, regen: 0.00175,
    proj: { col: '#c9a8ff', col2: '#4a1f6b', dmg: 3, grav: 0.01, snd: 'gulp' } },
  /* three hearts a hit, from the jaws, the body and the spit alike */
  leviathan: { art: 'leviathan', title: 'THE LEVIATHAN', hp: 104, scale: 2.4,
    attacks: ['charge', 'aimed', 'swallow', 'strike', 'bite'], shots: 3, spread: 0.5,
    strikeCol: '#8fd0c0', touch: 6, dmgMul: 3,
    proj: { col: '#8fd0c0', col2: '#1d5a5a', dmg: 6, grav: 0, home: 1.6, snd: 'gulp' } },
  forgefiend: { art: 'forgefiend', title: 'THE FORGEFIEND', hp: 120, scale: 1.5,
    attacks: ['slam', 'forge', 'aimed'], shots: 3, spread: 0.34,
    proj: { col: '#ffd06a', col2: '#c0341a', dmg: 4, grav: 0.05, fiery: true, snd: 'fireball' } },
  ashTitan: { art: 'ashTitan', title: 'THE ASHEN TITAN', hp: 140, scale: 1.7,
    attacks: ['strike', 'quake', 'summon', 'slam'], minion: 'Emberling', brood: 3, strikeCol: '#ff7a2a',
    shots: 5, spread: 1.2,
    proj: { col: '#ff7a2a', col2: '#4a3a44', dmg: 4, grav: 0.04, fiery: true, snd: 'fireball' } },
  /* the last guardian: three times the health, fire that sticks, and a hand
     that takes you off the floor */
  /* ---- the White Silence ---- */
  rimeColossus: { art: 'rimeColossus', title: 'THE RIME COLOSSUS', hp: 190, scale: 1.4,
    attacks: ['slam', 'volley', 'shock', 'strike'], shots: 9, spread: 2.0,
    strikeCol: '#8fd0e8', touch: 5,
    proj: { col: '#8fd0e8', col2: '#3f7f9e', dmg: 5, grav: 0.04, snd: 'fire' } },
  frostWyrm: { art: 'frostWyrm', title: 'THE FROST WYRM', hp: 220, scale: 1.5,
    attacks: ['charge', 'aimed', 'bite', 'volley'], shots: 5, spread: 1.1, touch: 6,
    proj: { col: '#dff4ff', col2: '#4f8fb0', dmg: 6, grav: 0, home: 1.4, snd: 'fire' } },
  paleMonarch: { art: 'paleMonarch', title: 'THE PALE MONARCH', hp: 260, scale: 1.4,
    attacks: ['nova', 'strike', 'summon', 'grasp'], minion: 'IceWisp', brood: 3,
    shots: 13, spread: 2.6, strikeCol: '#dff4ff', touch: 6, graspDmg: 8,
    proj: { col: '#8fd0e8', col2: '#3f7f9e', dmg: 6, grav: 0, home: 1.0, snd: 'fire' } },
  /* ---- the Golden Waste ---- */
  /* The three of the waste stand through five phases, each one worse than the
     last, and the fifth calls up three of the guard.  They take a long time
     to bring down, and each one leaves something no shop sells. */
  duneMaw: { art: 'duneMaw', title: 'THE DUNE MAW', hp: 800, scale: 1.3,
    attacks: ['bite', 'quake', 'volley', 'aimed', 'spear'], shots: 9, spread: 2.2, touch: 6,
    phases: 5, stoneGuards: true, mythic: 'sunheart',
    proj: { col: '#e0bd86', col2: '#8a6a3a', dmg: 6, grav: 0.05, snd: 'gulp' } },
  sphinx: { art: 'sphinx', title: 'THE SPHINX', hp: 800, scale: 1.3,
    attacks: ['strike', 'nova', 'summon', 'charge', 'spear'], minion: 'Scarab', brood: 4,
    shots: 12, spread: 2.6, strikeCol: '#e0b040', touch: 6,
    phases: 5, stoneGuards: true, mythic: 'riddlestone',
    proj: { col: '#f6d878', col2: '#9c7418', dmg: 6, grav: 0, home: 1.2, snd: 'fire' } },
  pharaoh: { art: 'pharaoh', title: 'THE PHARAOH', hp: 850, scale: 1.4,
    attacks: ['spear', 'army', 'brand', 'nova', 'strike', 'grasp'], minion: 'Soldier', brood: 5,
    shots: 15, spread: 2.9, strikeCol: '#f6d878', touch: 6, graspDmg: 10,
    phases: 5, stoneGuards: true, mythic: 'pharaohcrook',
    proj: { col: '#f6d878', col2: '#9c7418', dmg: 6, grav: 0, home: 1.1, fiery: true, snd: 'fireball' } },
  ifrit: { art: 'ifrit', title: 'IFRIT, THE MOLTEN CROWN', hp: 504, scale: 1.9,
    attacks: ['volley', 'nova', 'charge', 'strike', 'brand', 'grasp'],
    shots: 11, spread: 2.8, strikeCol: '#ffd06a', touch: 4,
    proj: { col: '#ffd06a', col2: '#8a2410', dmg: 4, grav: 0, home: 1.2, fiery: true, snd: 'fireball' } }
};

/* The keeper of an island.  It borrows the shape of a guardian whose realm
   matches the island, and it hardens the further out the island lies. */
const ISLE_BOSS_ART = {
  snow: ['rimeColossus', 'frostWyrm', 'paleMonarch'],
  fire: ['forgefiend', 'ashTitan', 'ifrit'],
  desert: ['duneMaw', 'sphinx', 'pharaoh'],
  forest: ['tideWarden', 'kraken', 'leviathan'],
  mesa: ['ashTitan', 'duneMaw', 'rimeColossus']
};
/* the three shapes a keeper may take are spread over the fifty islands */
function isleBossKey(kind, tier) {
  const list = ISLE_BOSS_ART[kind] || ISLE_BOSS_ART.forest;
  return list[Math.min(list.length - 1, Math.floor(tier / 17))];
}
class Guardian extends Enemy {
  /* `extra` lets the room that raises a guardian ask for more than the table
     gives it: a heavier blow, or more phases to stand through. */
  constructor(x, y, key, extra) {
    let cfg = GUARDIANS[key];
    /* A guardian may hit harder than its plain numbers say.  The multiplier
       is folded in once, here, so every blow it lands carries it. */
    const mul = (cfg.dmgMul || 1) * ((extra && extra.dmgMul) || 1);
    const phases = (extra && extra.phases) || cfg.phases;
    /* A guardian may also carry a cap: the most any one blow of its may
       take, whatever the rest of its numbers say. */
    const cap = cfg.maxHit || 0;
    if (mul !== 1 || phases !== cfg.phases || cap) {
      const up = n => {
        const v = Math.max(1, Math.round(n * mul));
        return cap ? Math.min(cap, v) : v;
      };
      cfg = Object.assign({}, cfg, {
        phases: phases,
        graspDmg: cfg.graspDmg === undefined ? undefined : up(cfg.graspDmg),
        proj: Object.assign({}, cfg.proj, { dmg: up(cfg.proj.dmg) })
      });
    }
    super({ x: x, y: y, w: 48, h: 60, hp: cfg.hp, damage: 2, coinDrop: 0, blood: cfg.proj.col });
    this.kbScale = 0;                 /* a guardian holds its ground */
    this.cfg = cfg; this.key = key; this.title = cfg.title;
    this.dmgMul = mul; this.hitCap = cap;
    this.maxHp = cfg.hp; this.homeY = y; this.homeX = x;
    this.face = -1; this.state = 'sleep'; this.stateT = 0; this.phase = 1;
    this.awake = false; this.dying = false; this.deathT = 0; this.mode = 'idle';
    this.turn = 0;
  }
  get scale() { return this.cfg.scale || 1; }
  /* what a blow of n points comes to, for this guardian */
  dm(n) {
    const v = Math.max(1, Math.round(n * (this.dmgMul || 1)));
    return this.hitCap ? Math.min(this.hitCap, v) : v;
  }
  box() {
    const s = this.scale;
    return { x: this.x - 24 * s, y: this.y - 62 * s, w: 48 * s, h: 62 * s };
  }
  hurt(dmg, fx, fy, mult) {
    if (this.dying) return;
    if (!this.awake) this.wake();
    this.regenHold = 1.4;             /* the mending stalls when it is struck */
    super.hurt(dmg, fx, fy, mult);
    this.vx = 0; this.vy = 0;
    if (!this.dead) {
      const f = this.hp / this.maxHp;
      const n = this.cfg.phases || 3;
      /* the health splits evenly between the phases, whatever their number */
      const want = clamp(n - Math.floor(f * n), 1, n);
      while (this.phase < want) { this.phase++; this.enterPhase(); }
    }
  }
  /* Every phase is harder than the one before it.  The last one of a five
     phase fight calls up the guard. */
  enterPhase() {
    this.bellow();
    const n = this.cfg.phases || 3;
    if (this.phase === n && this.cfg.stoneGuards) {
      this.guardsUp = true;
      G.texts.push(new FloatText(this.cx, this.y - 80, 'THE GUARD RISES', '#f6d878'));
      Snd.boom(); G.shake(14); G.flash(0.45);
      const each = Math.max(60, Math.round(this.maxHp / 6));
      for (let k = 0; k < 3; k++) {
        const gx = clamp(this.x + (k - 1) * 96 + rr(-14, 14), 60, G.room.pxW() - 60);
        const gy = G.room.groundBelow(gx, this.y - 70);
        const sg = new StoneGuard(gx, gy, each);
        G.enemies.push(sg);
        for (let i = 0; i < 26; i++) G.particles.push(new Particle({
          x: gx + rr(-16, 16), y: gy, vx: rr(-3, 3), vy: rr(-4, -0.5), life: rr(0.4, 1),
          col: '#c9a06a', col2: '#7b6338', size: rr(1.4, 3.4), grav: 0.2
        }));
      }
    }
  }
  bellow() { Snd.bellow(); G.shake(9); G.flash(0.2); this.mode = 'attack'; this.state = 'rest'; this.stateT = 0.9; }
  wake() { if (this.awake) return; this.awake = true; this.bellow(); G.banner(this.title, 2.6); }
  kill() { if (this.dying) return; this.dying = true; this.deathT = 0; Snd.bellow(); G.shake(12); }
  nextAttack() {
    const list = this.cfg.attacks;
    this.state = list[this.turn % list.length];
    this.turn++;
    this.stateT = 1.9;
    this.shotT = 0; this.brood = 0;
    this.mode = 'attack';
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.animT += dt;
    const p = G.player;
    if (this.dying) {
      this.deathT += dt;
      if (Math.random() < 0.7) G.particles.push(new Particle({
        x: this.x + rr(-32, 32), y: this.y - rr(0, 66), vx: rr(-2.4, 2.4), vy: rr(-3, -0.3),
        life: rr(0.4, 1.1), col: this.cfg.proj.col, col2: this.cfg.proj.col2, size: rr(2, 4.6), grav: -0.01
      }));
      if (Math.random() < 0.1) { G.shake(5); Snd.boom(); }
      if (this.deathT > 2.8 && !this.dead) {
        this.dead = true;
        Snd.explode(); G.shake(16); G.flash(0.9);
        for (let i = 0; i < 90; i++) G.particles.push(new Particle({
          x: this.x, y: this.y - 34, vx: rr(-7, 7), vy: rr(-7, 3), life: rr(0.6, 1.5),
          col: this.cfg.proj.col, col2: this.cfg.proj.col2, size: rr(2, 5), grav: 0.07
        }));
        G.payOut(46, this.x, this.y - 20);
        /* the three of the waste each leave a mythical thing */
        if (this.cfg.mythic && G.giveArtifact) G.giveArtifact(this.cfg.mythic);
        G.onBossDead();
      }
      return;
    }
    if (!this.awake) {
      this.frame = Math.floor(this.animT / 0.3) % 4;
      if (Math.abs(p.cx - this.x) < 220) this.wake();
      return;
    }
    /* most guardians knit at seven parts in a thousand a second; one that
       carries its own figure mends at that instead */
    this.bossRegen(dt, this.cfg.regen === undefined ? 0.007 : this.cfg.regen);
    this.stateT -= dt;
    this.face = p.cx > this.x ? 1 : -1;
    const sp = 1 + (this.phase - 1) * 0.22;
    this.frame = Math.floor(this.animT / 0.12) % 4;
    const cfg = this.cfg;

    switch (this.state) {
      case 'volley': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = 0.85 / sp;
          const n = cfg.shots + (this.phase - 1) * 2;
          const base = Math.atan2(p.cy - (this.y - 40), p.cx - this.x);
          for (let k = 0; k < n; k++) {
            const a = base + (k / (n - 1) - 0.5) * cfg.spread;
            G.projectiles.push(new Shot(this.x + this.face * 14, this.y - 40,
              Math.cos(a) * 2.4, Math.sin(a) * 2.4, cfg.proj));
          }
          Snd.fire();
        }
        break;
      }
      case 'aimed': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = 0.42 / sp;
          const dx = p.cx - this.x, dy = p.cy - (this.y - 40);
          const a = Math.atan2(dy, dx) + rr(-0.08, 0.08);
          G.projectiles.push(new Shot(this.x + this.face * 18, this.y - 40,
            Math.cos(a) * 3.1, Math.sin(a) * 3.1, cfg.proj));
          Snd.fire();
        }
        break;
      }
      case 'strike': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0) {
          this.shotT = 0.6 / sp;
          const n = this.phase >= 3 ? 3 : (this.phase === 2 ? 2 : 1);
          for (let k = 0; k < n; k++) {
            const tx = clamp(p.cx + (k - (n - 1) / 2) * 44 + rr(-8, 8), 40, G.room.pxW() - 40);
            const st = new LightningStrike(tx, G.room.groundBelow(tx, 40) - 1, 8, this.dm(2));
            st.col = cfg.strikeCol || '#9fe8ff';
            G.projectiles.push(st);
          }
          Snd.charge();
        }
        break;
      }
      /* the Tide Warden stamps, and the sea itself blasts you off your feet */
      case 'shock': {
        this.mode = 'attack';
        if (!this.shocked && this.stateT < 1.25) {
          this.shocked = true;
          const gy = this.y;
          G.waves.push(new Shockwave(this.x, gy, this.dm(4), cfg.proj.col, cfg.proj.col2));
          Snd.boom(); G.shake(10); G.flash(0.16);
          for (let i = 0; i < 30; i++) G.particles.push(new Particle({
            x: this.x + rr(-24, 24), y: gy, vx: rr(-4, 4), vy: rr(-4, -0.5), life: rr(0.3, 0.8),
            col: cfg.proj.col, col2: cfg.proj.col2, size: rr(1.4, 3.4), grav: 0.16
          }));
        }
        if (this.stateT <= 0) this.shocked = false;
        break;
      }
      /* the Kraken lashes out with an arm */
      case 'sweep': {
        this.mode = 'attack';
        if (!this.swept && this.stateT < 1.4) {
          this.swept = true;
          const dir = p.cx > this.x ? 1 : -1;
          G.waves.push(new Tentacle(this.x + dir * 10, this.y - 34 * this.scale, dir, this.dm(4), 150));
          Snd.gulp(); G.shake(5);
        }
        if (this.stateT <= 0) this.swept = false;
        break;
      }
      /* and takes you up in one, and squeezes */
      case 'grab': {
        this.mode = 'attack';
        if (!this.grabbed && this.stateT < 1.45) {
          this.grabbed = true;
          const near = Math.abs(p.cx - this.x) < 120 * this.scale && Math.abs(p.cy - this.y) < 110 * this.scale;
          if (near && !p.dead && p.heldBy === null) {
            p.seize(this, 1.35, this.dm(6));   /* three hearts, over the squeeze */
            Snd.gulp(); G.shake(6);
          } else {
            /* out of reach, so it lashes instead of leaving you alone */
            const dir = p.cx > this.x ? 1 : -1;
            G.waves.push(new Tentacle(this.x + dir * 10, this.y - 34 * this.scale, dir, this.dm(4), 170));
            Snd.gulp();
          }
        }
        if (this.stateT <= 0) this.grabbed = false;
        break;
      }
      /* the Leviathan takes you down whole */
      case 'swallow': {
        this.mode = 'attack';
        if (!this.gulped && this.stateT < 1.4) {
          this.gulped = true;
          const near = Math.abs(p.cx - this.x) < 130 * this.scale && Math.abs(p.cy - this.y) < 120 * this.scale;
          if (near && !p.dead && G.swallowInto) {
            Snd.gulp(); G.shake(9); G.flash(0.5);
            G.swallowInto(this);
          } else {
            const dir = p.cx > this.x ? 1 : -1;
            G.waves.push(new Tentacle(this.x + dir * 10, this.y - 30 * this.scale, dir, this.dm(4), 180));
            Snd.gulp();
          }
        }
        if (this.stateT <= 0) this.gulped = false;
        break;
      }
      /* the Leviathan's jaws close where you stand */
      case 'bite': {
        this.mode = 'attack';
        if (!this.bit && this.stateT < 1.3) {
          this.bit = true;
          const n = this.phase >= 3 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const bx = clamp(p.cx + (k ? rr(-70, 70) : 0), 30, G.room.pxW() - 30);
            const by = p.cy + (k ? rr(-16, 16) : 0);
            G.waves.push(new Maw(bx, by, this.dm(cfg.touch || 6), cfg.proj.col, cfg.proj.col2));
          }
          Snd.gulp(); G.shake(4);
        }
        if (this.stateT <= 0) this.bit = false;
        break;
      }
      /* Ifrit sets you alight with a lash of fire */
      case 'brand': {
        this.mode = 'attack';
        if (!this.branded && this.stateT < 1.25) {
          this.branded = true;
          const dir = p.cx > this.x ? 1 : -1;
          /* the lash runs at the height you stand at, so it can be jumped */
          const ly = clamp(p.cy, this.y - 80 * this.scale, this.y - 6);
          G.waves.push(new FireLash(this.x + dir * 16, ly, dir, this.dm(3), 190, 4 + this.phase));
          Snd.fire(); G.shake(5);
        }
        if (this.stateT <= 0) this.branded = false;
        break;
      }
      /* and reaches out for you with a burning hand */
      case 'grasp': {
        this.mode = 'attack';
        if (!this.grasped && this.stateT < 1.4) {
          this.grasped = true;
          G.waves.push(new GrabHand(this, p.cx, p.cy, cfg.graspDmg || 10,
                                    cfg.proj.col, cfg.proj.col2));
          Snd.charge(); G.shake(4);
        }
        if (this.stateT <= 0) this.grasped = false;
        break;
      }
      /* the spear goes out, and it comes back to the hand that threw it */
      case 'spear': {
        this.mode = 'attack';
        if (!this.speared && this.stateT < 1.45) {
          this.speared = true;
          const n = this.phase >= 4 ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const tx = p.cx + (k ? rr(-60, 60) : 0), ty = p.cy + (k ? rr(-20, 20) : 0);
            G.waves.push(new Spear(this, tx, ty, this.dm(6), this.dm(4)));
          }
          G.shake(5);
        }
        if (this.stateT <= 0) this.speared = false;
        break;
      }
      /* the Pharaoh calls up a rank of the household guard */
      case 'army': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0 && this.brood < cfg.brood + this.phase) {
          this.shotT = 0.34; this.brood++;
          const side = this.brood % 2 ? 1 : -1;
          const sx = clamp(this.x + side * (60 + this.brood * 22), 40, G.room.pxW() - 40);
          const sy = G.room.groundBelow(sx, this.y - 60);
          const sd = new Soldier(sx, sy);
          sd.face = sx > p.cx ? -1 : 1;
          G.enemies.push(sd);
          Snd.charge(); G.shake(3);
          for (let k = 0; k < 18; k++) G.particles.push(new Particle({
            x: sx + rr(-10, 10), y: sy, vx: rr(-2, 2), vy: rr(-3, -0.4), life: rr(0.3, 0.7),
            col: '#f6d878', col2: '#9c7418', size: rr(1, 2.6), grav: 0.16
          }));
        }
        break;
      }
      /* the Forgefiend beats the floor, and fire walks out of it */
      case 'forge': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0 && this.brood < 7) {
          this.shotT = 0.13;
          const dir = p.cx > this.x ? 1 : -1;
          const px = this.x + dir * (34 + this.brood * 34);
          G.waves.push(new FirePillar(px, this.y, this.dm(5), cfg.proj.col, cfg.proj.col2));
          this.brood++;
          Snd.fire(); G.shake(2);
        }
        break;
      }
      /* the Ashen Titan brings the roof down */
      case 'quake': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0 && this.brood < 9) {
          this.shotT = 0.16;
          const px = G.cam.x + rr(20, VW - 20);
          const gy = G.room.groundBelow(px, G.cam.y + 10);
          G.waves.push(new FirePillar(px, gy, this.dm(5), '#c9a89a', '#4a3a44'));
          this.brood++;
          if (this.brood === 1) { Snd.boom(); G.shake(9); }
        }
        break;
      }
      /* Ifrit throws a crown of fire out on every side */
      case 'nova': {
        this.mode = 'attack';
        if (!this.novaed && this.stateT < 1.35) {
          this.novaed = true;
          const n = 14;
          for (let i = 0; i < n; i++) {
            const a = i / n * TAU;
            G.projectiles.push(new Shot(this.x, this.y - 34 * this.scale,
              Math.cos(a) * 2.6, Math.sin(a) * 2.6, cfg.proj));
          }
          Snd.explode(); G.shake(11); G.flash(0.3);
        }
        if (this.stateT <= 0) this.novaed = false;
        break;
      }
      case 'summon': {
        this.mode = 'attack';
        this.shotT -= dt;
        if (this.shotT <= 0 && this.brood < cfg.brood + this.phase - 1) {
          this.shotT = 0.5; this.brood++;
          const Ctor = { Jelly: Jelly, Emberling: Emberling, IceWisp: IceWisp,
                         Scarab: Scarab, Soldier: Soldier }[cfg.minion];
          const m = new Ctor(this.x + rr(-40, 40), this.y - 40);
          m.vy = -3;
          G.enemies.push(m);
          Snd.spore();
        }
        break;
      }
      case 'charge': {
        this.mode = 'idle';
        this.vx = approach(this.vx, this.face * 2.6 * sp, 0.12 * dt * 60);
        this.x += this.vx * dt * 60;
        this.x = clamp(this.x, 70, G.room.pxW() - 70);
        if (Math.random() < 0.5) G.particles.push(new Particle({
          x: this.x - this.face * 20, y: this.y - rr(4, 40), vx: -this.face * rr(0.6, 2), vy: rr(-1, 0.4),
          life: rr(0.2, 0.5), col: cfg.proj.col, col2: cfg.proj.col2, size: rr(1, 2.6), grav: 0.02
        }));
        this.touchPlayer(this.dm(cfg.touch || 2));
        break;
      }
      case 'slam': {
        this.mode = 'attack';
        if (this.stateT > 1.2) { this.y = approach(this.y, this.homeY - 34, 90 * dt); }
        else {
          this.y = approach(this.y, this.homeY, 320 * dt);
          if (Math.abs(this.y - this.homeY) < 2 && !this.slammed) {
            this.slammed = true;
            Snd.slam(); G.shake(10); G.flash(0.14);
            if (!p.dead && p.grounded && Math.abs(p.cx - this.x) < 130) p.hurt(this.dm(2), this.x, this.y);
            for (let k = 0; k < 30; k++) G.particles.push(new Particle({
              x: this.x + rr(-60, 60), y: this.y, vx: rr(-4, 4), vy: rr(-4, -0.4), life: rr(0.3, 0.8),
              col: cfg.proj.col, col2: cfg.proj.col2, size: rr(1, 3.4), grav: 0.22
            }));
          }
        }
        break;
      }
      default: {
        this.mode = 'idle';
        this.vx = approach(this.vx, 0, 0.1 * dt * 60);
        this.y = approach(this.y, this.homeY, 60 * dt);
        break;
      }
    }
    if (this.stateT <= 0) {
      if (this.state === 'rest' || this.state === 'sleep') { this.slammed = false; this.nextAttack(); }
      else { this.state = 'rest'; this.mode = 'idle'; this.stateT = 1.0 / sp; this.slammed = false; }
    }
    this.touchPlayer(this.dm(cfg.touch || 2));
  }
  draw(c2) {
    const set = Art[this.cfg.art];
    const a = set.anchor;
    const img = (this.mode === 'attack' ? set.attack : set.idle)[this.frame % 4];
    let alpha = 1;
    if (this.dying) alpha = 0.55 + Math.sin(this.deathT * 22) * 0.45;
    c2.save();
    if (alpha < 1) c2.globalAlpha = alpha;
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face > 0, this.scale);
    c2.restore();
  }
}

/* ============================================================
   THE CREATURES OF THE WHITE SILENCE AND THE GOLDEN WASTE
   Each keeps the habits of a creature you already know, and
   wears its own coat.
   ============================================================ */

/* a snow wolf: leaner and faster than a bear, and it howls first */
class Wolf extends Bear {
  constructor(x, y) {
    super(x, y);
    this.w = 34; this.h = 18;
    this.hp = 7; this.damage = 3; this.coinDrop = ri(10, 16);
    this.blood = '#c8d2e2'; this.speed = 0.7; this.swims = false;
  }
  draw(c2) {
    let img;
    if (this.state === 'roar') img = Art.wolf.roar[this.frame % 2];
    else if (this.state === 'charge') img = Art.wolf.charge[this.frame % 6];
    else img = Art.wolf.walk[this.frame % 8];
    const a = Art.wolf.anchor;
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
  }
}
/* a shard of cold that hangs in the air and spits ice */
class IceWisp extends Wisp {
  constructor(x, y) {
    super(x, y);
    this.w = 20; this.h = 20;
    this.hp = 6; this.damage = 3; this.coinDrop = ri(9, 14); this.blood = '#8fd0e8';
  }
  box() { return { x: this.x - 10, y: this.y - 10, w: 20, h: 20 }; }
  draw(c2) {
    const a = Art.iceWisp.anchor;
    const f = Art.iceWisp.idle[Math.floor(this.animT / 0.09) % 8];
    c2.save();
    c2.globalCompositeOperation = 'lighter';
    c2.globalAlpha = 0.20 + Math.sin(this.t * 3) * 0.06;
    c2.fillStyle = '#8fd0e8';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), 17, 0, TAU); c2.fill();
    c2.restore();
    this.drawFlash(c2, f, this.x, this.y, a.x, a.y, false);
  }
}
/* a yeti: it hits the ground the way a golem does, and it throws snow */
class Yeti extends Golem {
  constructor(x, y) {
    super(x, y);
    this.w = 34; this.h = 44;
    this.hp = 14; this.damage = 6; this.coinDrop = ri(16, 24); this.blood = '#c8d2e2';
    this.speed = 0.3;
  }
  draw(c2) {
    const a = Art.yeti.anchor;
    let set = Art.yeti.walk, len = 6;
    if (this.state === 'wind' || this.state === 'throw') { set = Art.yeti.throw; len = 5; }
    else if (this.state === 'slam' || this.state === 'land') { set = Art.yeti.slam; len = 4; }
    this.drawFlash(c2, set[this.frame % len], this.x, this.y, a.x, a.y, this.face < 0);
  }
}
/* a scarab: armoured like a crab, and it rushes head down */
class Scarab extends Crab {
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 18;
    this.hp = 8; this.damage = 4; this.coinDrop = ri(14, 20); this.blood = '#3f7f5a';
    this.speed = 0.7;
  }
  draw(c2) {
    const a = Art.scarab.anchor;
    const rush = this.state === 'charge' || this.state === 'rush';
    const set = rush ? Art.scarab.rush : Art.scarab.walk;
    this.drawFlash(c2, set[this.frame % set.length], this.x, this.y, a.x, a.y, this.face < 0);
  }
}
/* a vulture: it circles, then it stoops */
class Vulture extends Cinderwing {
  constructor(x, y) {
    super(x, y);
    this.w = 22; this.h = 16;
    this.hp = 7; this.damage = 4; this.coinDrop = ri(12, 18); this.blood = '#4a4038';
    /* dust off its wings, not embers */
    this.trailCol = '#d9bd7e'; this.trailCol2 = '#8a6a3a'; this.trailType = 'leaf';
  }
  box() { return { x: this.x - 11, y: this.y - 8, w: 22, h: 16 }; }
  draw(c2) {
    const a = Art.vulture.anchor;
    const stoop = this.state === 'dive' || this.state === 'stoop';
    const set = stoop ? Art.vulture.dive : Art.vulture.fly;
    this.drawFlash(c2, set[this.frame % set.length], this.x, this.y, a.x, a.y, this.face < 0);
  }
}
/* a mummy: slow, hard to put down, and it reaches for you */
class Mummy extends Bear {
  constructor(x, y) {
    super(x, y);
    this.w = 22; this.h = 30;
    this.hp = 12; this.damage = 4; this.coinDrop = ri(16, 22);
    this.blood = '#d8c9a0'; this.speed = 0.26; this.swims = false;
  }
  draw(c2) {
    const a = Art.mummy.anchor;
    const reach = this.state === 'charge' || this.state === 'roar';
    const set = reach ? Art.mummy.grab : Art.mummy.walk;
    this.drawFlash(c2, set[this.frame % set.length], this.x, this.y, a.x, a.y, this.face < 0);
  }
}
/* One of the Pharaoh's household guard.  It closes to spear length, holds
   there behind its shield, and drives the point home. */
class Soldier extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 20, h: 30, hp: 8, damage: 4, coinDrop: ri(10, 16), blood: '#c9a06a' });
    this.face = rpick([-1, 1]); this.speed = 0.72;
    this.state = 'walk'; this.reach = 40;
  }
  hurt(dmg, fx, fy, mult) {
    /* the shield turns a blow struck from in front while it holds the line */
    const fromFront = Math.sign(fx - this.x) === this.face;
    super.hurt(fromFront && this.state !== 'thrust' ? Math.max(1, Math.round(dmg * 0.6)) : dmg, fx, fy, mult);
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.stateT -= dt;
    this.animT += dt;
    const p = G.player;
    const d = p.cx - this.cx, ad = Math.abs(d);
    if (this.state === 'walk') {
      this.frame = Math.floor(this.animT / 0.09) % 6;
      if (!p.dead && ad < 210 && Math.abs(p.cy - this.cy) < 44) this.face = d > 0 ? 1 : -1;
      this.vx = this.face * this.speed;
      if (this.grounded && this.edgeAhead()) this.turn();
      if (ad < this.reach && !p.dead) { this.state = 'ready'; this.stateT = 0.4; this.vx = 0; }
    } else if (this.state === 'ready') {
      this.vx = 0;
      this.frame = 0;
      if (this.stateT <= 0) { this.state = 'thrust'; this.stateT = 0.34; this.hitDone = false; Snd.swing(); }
    } else if (this.state === 'thrust') {
      this.frame = Math.min(3, Math.floor((0.34 - this.stateT) / 0.09));
      this.vx = this.face * 1.2;
      if (!this.hitDone && this.stateT < 0.2) {
        this.hitDone = true;
        const box = { x: this.face > 0 ? this.x + this.w : this.x - 34, y: this.y - this.h + 6, w: 34, h: 14 };
        if (!p.dead && rectsOverlap(box, { x: p.x, y: p.y, w: p.w, h: p.h }))
          if (p.hurt(this.damage, this.cx, this.cy)) { p.vx = this.face * 4.4; p.hurtT = 0.24; }
      }
      if (this.stateT <= 0) { this.state = 'rest'; this.stateT = 0.5; }
    } else {
      this.vx = approach(this.vx, 0, 0.1 * dt * 60);
      this.frame = 0;
      if (this.stateT <= 0) this.state = 'walk';
    }
    this.physics(dt);
    this.touchPlayer(2);
  }
  draw(c2) {
    const a = Art.soldier.anchor;
    const set = (this.state === 'thrust' || this.state === 'ready') ? Art.soldier.thrust : Art.soldier.walk;
    this.drawFlash(c2, set[this.frame % set.length], this.x, this.y, a.x, a.y, this.face < 0);
  }
}

/* A chest on a plinth at the end of a room under the world.  Touch it and
   it gives up what it holds. */
class RelicChest {
  constructor(x, y, pool) {
    this.x = x; this.y = y; this.pool = pool || 'sand';
    this.open = false; this.t = 0; this.dead = false;
  }
  box() { return { x: this.x - 13, y: this.y - 22, w: 26, h: 22 }; }
  update(dt) {
    this.t += dt;
    if (this.open) return;
    const p = G.player;
    if (p.dead) return;
    if (!rectsOverlap(this.box(), { x: p.x, y: p.y, w: p.w, h: p.h })) return;
    this.open = true;
    G.flags['chest_' + (G.vaultKey || G.roomId)] = 1;
    const key = G.rollArtifact ? G.rollArtifact(2) : null;
    if (key) G.giveArtifact(key);
    else { G.payOut(400, this.x, this.y - 14); G.texts.push(new FloatText(this.x, this.y - 26, 'NOTHING NEW', '#a89270')); }
    Snd.unlock(); G.shake(6); G.flash(0.35);
    for (let i = 0; i < 40; i++) G.particles.push(new Particle({
      x: this.x + rr(-10, 10), y: this.y - 12, vx: rr(-2.4, 2.4), vy: rr(-4, -0.4),
      life: rr(0.4, 1), col: rpick(['#e0b040', '#f6d878', '#ffffff']), col2: '#9c7418',
      size: rr(1, 2.8), grav: 0.14
    }));
  }
  draw(c2) {
    const img = Art.item.chest[this.open ? 1 : 0];
    const bob = this.open ? 0 : Math.sin(this.t * 2) * 0.8;
    if (!this.open) {
      c2.save(); c2.globalCompositeOperation = 'lighter';
      c2.globalAlpha = 0.14 + Math.sin(this.t * 3) * 0.06;
      c2.fillStyle = '#e0b040';
      c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y - 12), 24, 0, TAU); c2.fill();
      c2.restore();
    }
    blit(c2, img, this.x, this.y + bob, 13, 22);
  }
}

/* One of the three that rise when a Pharaoh runs out of patience.  It carries
   a guardian's health and it hits like one. */
class StoneGuard extends Golem {
  constructor(x, y, hp) {
    super(x, y);
    this.w = 40; this.h = 56;
    this.hp = hp || 300; this.maxHp = this.hp;
    this.damage = 8; this.coinDrop = ri(60, 90);
    this.blood = '#c9a06a'; this.speed = 0.36;
    this.kbScale = 0.15;
    this.spawnT = 0;
  }
  box() { return { x: this.x - 20, y: this.y - 56, w: 40, h: 56 }; }
  update(dt) {
    this.spawnT += dt;
    /* it heaves itself out of the ground before it does anything */
    if (this.spawnT < 1.0) {
      this.flash = Math.max(0, this.flash - dt);
      this.animT += dt;
      this.frame = 0;
      if (Math.random() < dt * 40) G.particles.push(new Particle({
        x: this.x + rr(-20, 20), y: this.y, vx: rr(-2, 2), vy: rr(-3, -0.4),
        life: rr(0.3, 0.8), col: '#c9a06a', col2: '#7b6338', size: rr(1, 3), grav: 0.2
      }));
      return;
    }
    super.update(dt);
  }
  draw(c2) {
    const a = Art.stoneGuard.anchor;
    const set = (this.state === 'slam' || this.state === 'wind') ? Art.stoneGuard.slam : Art.stoneGuard.walk;
    const img = set[this.frame % set.length];
    const rise = clamp(this.spawnT / 1.0, 0, 1);
    c2.save();
    if (rise < 1) {
      /* clipped to the ground it is climbing out of */
      c2.beginPath();
      c2.rect(this.x - 30, this.y - 60 * rise, 60, 60 * rise + 2);
      c2.clip();
    }
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
    c2.restore();
    /* a bar over its head, because it is a guardian in all but name */
    if (this.spawnT > 1 && !this.dead) {
      const w = 44, f = clamp(this.hp / this.maxHp, 0, 1);
      const bx = Math.round(this.x - w / 2), by = Math.round(this.y - this.h - 12);
      c2.fillStyle = '#12101c'; c2.fillRect(bx - 1, by - 1, w + 2, 5);
      c2.fillStyle = '#3a2c1c'; c2.fillRect(bx, by, w, 3);
      c2.fillStyle = '#e0b040'; c2.fillRect(bx, by, Math.round(w * f), 3);
    }
  }
}

/* ============================================================
   THE FURNITURE OF A LEVEL — lifts to ride, spikes to clear,
   and blocks that sweep the ground you want to stand on.
   ============================================================ */

/* A platform that runs a line, back and forth, and carries what stands on it. */
class Lift {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.w = o.w || 48; this.h = 6;
    this.ax = o.x; this.ay = o.y;
    this.bx = o.bx === undefined ? o.x : o.bx;
    this.by = o.by === undefined ? o.y : o.by;
    this.speed = o.speed || 34;
    this.wait = o.wait || 0.5;
    this.t = o.phase || 0; this.dir = 1; this.hold = 0;
    this.dx = 0; this.dy = 0; this.dead = false;
    this.col = o.col || '#8a94a6'; this.col2 = o.col2 || '#4a5165';
  }
  update(dt) {
    const px = this.x, py = this.y;
    if (this.hold > 0) { this.hold -= dt; this.dx = 0; this.dy = 0; return; }
    const len = Math.hypot(this.bx - this.ax, this.by - this.ay) || 1;
    this.t += this.dir * (this.speed / len) * dt;
    if (this.t >= 1) { this.t = 1; this.dir = -1; this.hold = this.wait; }
    if (this.t <= 0) { this.t = 0; this.dir = 1; this.hold = this.wait; }
    this.x = lerp(this.ax, this.bx, this.t);
    this.y = lerp(this.ay, this.by, this.t);
    this.dx = this.x - px; this.dy = this.y - py;
  }
  draw(c2) {
    const x = Math.round(this.x), y = Math.round(this.y);
    c2.fillStyle = this.col2; c2.fillRect(x, y, this.w, this.h);
    c2.fillStyle = this.col;  c2.fillRect(x, y, this.w, 2);
    c2.fillStyle = '#20182c';
    c2.fillRect(x, y + this.h - 1, this.w, 1);
    c2.fillRect(x, y, 1, this.h); c2.fillRect(x + this.w - 1, y, 1, this.h);
    /* studs, so the movement reads */
    c2.fillStyle = this.col2;
    for (let i = 4; i < this.w - 3; i += 8) c2.fillRect(x + i, y + 3, 2, 2);
  }
}

/* A bed of spikes. Standing in it costs you, so you clear it or ride over. */
class Spikes {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.w = o.w || 32; this.h = 10;
    this.dmg = o.dmg || 2; this.up = o.up === undefined ? true : o.up;
    this.cd = 0; this.dead = false;
  }
  box() { return { x: this.x, y: this.up ? this.y : this.y, w: this.w, h: this.h }; }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    const p = G.player;
    if (p.dead || this.cd > 0) return;
    if (!rectsOverlap(this.box(), { x: p.x, y: p.y, w: p.w, h: p.h })) return;
    this.cd = 0.7;
    if (p.hurt(this.dmg, p.cx, this.y + (this.up ? 12 : -12))) {
      /* thrown clear of the bed, so you are not pinned in it */
      p.vy = this.up ? -4.6 : 3.2;
      G.shake(4);
    }
  }
  draw(c2) {
    const x = Math.round(this.x), y = Math.round(this.y);
    for (let i = 0; i < this.w; i += 6) {
      const h = this.h - 2;
      for (let k = 0; k < h; k++) {
        const wdt = Math.max(1, Math.round(5 - k * 5 / h));
        const yy = this.up ? y + this.h - 1 - k : y + k;
        c2.fillStyle = k > h * 0.6 ? '#8a94a6' : '#e6edf6';
        c2.fillRect(x + i + Math.round((5 - wdt) / 2), yy, wdt, 1);
      }
    }
    c2.fillStyle = '#4a5165';
    c2.fillRect(x, this.up ? y + this.h - 2 : y, this.w, 2);
  }
}

/* A block that sweeps a line. It will not crush you, but it shoves you off
   whatever you were standing on. */
class Crusher {
  constructor(o) {
    this.ax = o.x; this.ay = o.y;
    this.bx = o.bx === undefined ? o.x : o.bx;
    this.by = o.by === undefined ? o.y : o.by;
    this.w = o.w || 22; this.h = o.h || 22;
    this.speed = o.speed || 62; this.dmg = o.dmg || 2;
    this.x = this.ax; this.y = this.ay;
    this.t = o.phase || 0; this.dir = 1; this.cd = 0; this.dead = false;
    this.col = o.col || '#6d5a4a'; this.col2 = o.col2 || '#3a2f28';
  }
  box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    const len = Math.hypot(this.bx - this.ax, this.by - this.ay) || 1;
    this.t += this.dir * (this.speed / len) * dt;
    if (this.t >= 1) { this.t = 1; this.dir = -1; }
    if (this.t <= 0) { this.t = 0; this.dir = 1; }
    /* it eases at each end, so there is a beat to slip past it */
    const e = 0.5 - Math.cos(this.t * Math.PI) * 0.5;
    this.x = lerp(this.ax, this.bx, e);
    this.y = lerp(this.ay, this.by, e);
    const p = G.player;
    if (!p.dead && this.cd <= 0 &&
        rectsOverlap(this.box(), { x: p.x, y: p.y, w: p.w, h: p.h })) {
      this.cd = 0.8;
      if (p.hurt(this.dmg, this.x, this.y)) {
        const dir = Math.sign(p.cx - this.x) || 1;
        p.vx = dir * 6.2; p.vy = -3.4; p.hurtT = 0.28;
        G.shake(5);
      }
    }
  }
  draw(c2) {
    const b = this.box();
    const x = Math.round(b.x), y = Math.round(b.y);
    c2.fillStyle = this.col2; c2.fillRect(x, y, this.w, this.h);
    c2.fillStyle = this.col;  c2.fillRect(x + 1, y + 1, this.w - 2, this.h - 3);
    c2.fillStyle = '#20182c';
    c2.fillRect(x, y, this.w, 1); c2.fillRect(x, y + this.h - 1, this.w, 1);
    c2.fillRect(x, y, 1, this.h); c2.fillRect(x + this.w - 1, y, 1, this.h);
    /* a row of teeth on the leading face */
    c2.fillStyle = '#e6edf6';
    for (let i = 2; i < this.w - 2; i += 5) {
      c2.fillRect(x + i, y + this.h - 4, 3, 3);
      c2.fillRect(x + i, y + 1, 3, 3);
    }
  }
}

/* A blade of wind, thrown from a charged swing. It runs a long way, cuts
   everything it passes, and bats shots back on its way. */
class WindSwipe {
  constructor(x, y, dir, dmg) {
    const a = aimVec(dir);
    this.x = x; this.y = y; this.dx = a.x; this.dy = a.y; this.dir = a.x || 1;
    this.dmg = dmg;
    this.t = 0; this.life = 1.05; this.dead = false; this.hit = new Set();
    this.speed = 4.4;
    this.range = GALE_RANGE; this.gone = 0;
  }
  box() {
    const grow = 1 + this.t * 0.9;
    /* the blade of air stands across the way it goes */
    const across = 22 * grow, along = 14;
    const w = this.dy === 0 ? along : across, h = this.dy === 0 ? across : along;
    return { x: this.x - w, y: this.y - h, w: w * 2, h: h * 2 };
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    let step = this.speed * dt * 60;
    if (this.gone + step >= this.range) { step = this.range - this.gone; this.dead = true; }
    this.x += this.dx * step; this.y += this.dy * step;
    this.gone += step;
    const box = this.box();
    const walled = G.room.mode === 'top';
    for (const en of G.enemies) {
      if (en.dead || this.hit.has(en)) continue;
      if (!rectsOverlap(box, en.box())) continue;
      if (walled && G.room.losBlocked(this.x, this.y, en.cx, en.cy)) continue;
      this.hit.add(en);
      en.hurt(this.dmg, this.x - this.dx * 20, this.y - this.dy * 20);
      G.hitStop(0.04);
    }
    for (const pr of G.projectiles) {
      if (pr.dead || pr.friendly || typeof pr.vx !== 'number') continue;
      if (this.hit.has(pr)) continue;
      if (!rectsOverlap(box, { x: pr.x - 8, y: pr.y - 8, w: 16, h: 16 })) continue;
      this.hit.add(pr);
      deflectShot(pr, this.dmg);
      Snd.parry();
    }
    /* the air scatters across the blade and runs on with it */
    for (let i = 0; i < 2; i++) {
      const across = rr(-20, 20), along = rr(-10, 10), sp = rr(1, 3.4), drift = rr(-0.8, 0.8);
      G.particles.push(new Particle({
        x: this.x - this.dy * across + this.dx * along,
        y: this.y + this.dx * across + this.dy * along,
        vx: this.dx * sp - this.dy * drift, vy: this.dy * sp + this.dx * drift,
        life: rr(0.12, 0.3), col: '#ffffff', col2: '#8fd0ff', size: rr(1, 2.4), grav: 0, drag: 0.9
      }));
    }
    if (G.room.solidPx(this.x + this.dx * 8, this.y + this.dy * 8) || this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const k = clamp(1 - this.life / 1.05, 0, 1);
    const grow = 1 + this.t * 0.9;
    c2.save();
    c2.globalAlpha = (1 - k) * 0.95;
    c2.globalCompositeOperation = 'lighter';
    /* three crescents, one inside the next, turned to face the way it goes */
    const ca = this.dx, sa = this.dy;
    for (let ring = 0; ring < 3; ring++) {
      const r = (13 + ring * 6) * grow;
      c2.fillStyle = ring === 0 ? '#ffffff' : (ring === 1 ? '#dff0ff' : '#8fd0ff');
      for (let step = 0; step <= 22; step++) {
        const ang = -1.25 + (step / 22) * 2.5;
        const ux = Math.cos(ang) * r * 0.55, uy = Math.sin(ang) * r;
        const px = this.x + ux * ca - uy * sa;
        const py = this.y + ux * sa + uy * ca;
        c2.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
    }
    c2.restore();
  }
}

/* The wide arc of air a special swing throws off. It is the swipe you see,
   and it carries the blow well past the blade itself. */
class AirSlash {
  constructor(x, y, dir, dmg, kind) {
    this.x = x; this.y = y; this.dir = dir; this.dmg = dmg;
    this.kind = kind || 'flip';
    this.t = 0; this.life = 0.46; this.dead = false; this.hit = new Set();
    this.speed = kind === 'pierce' ? 2.4 : 5.0;
    this.col = kind === 'pierce' ? '#dcefff' : '#e8f4ff';
    this.col2 = kind === 'pierce' ? '#7fb6e8' : '#8fd0ff';
    /* the pierce throws its arc out flat along the ground on both sides */
    this.flat = kind === 'pierce';
  }
  box() {
    const grow = 1 + this.t * 2.4;
    if (this.flat) return { x: this.x - 46 * grow, y: this.y - 12, w: 92 * grow, h: 26 };
    return { x: this.dir > 0 ? this.x : this.x - 54 * grow, y: this.y - 26 * grow,
             w: 54 * grow, h: 52 * grow };
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (!this.flat) this.x += this.dir * this.speed * dt * 60;
    const box = this.box();
    for (const en of G.enemies) {
      if (en.dead || this.hit.has(en)) continue;
      if (!rectsOverlap(box, en.box())) continue;
      this.hit.add(en);
      en.hurt(this.dmg, this.x, this.y, 2);        /* the arc pays double too */
      G.hitStop(0.03);
    }
    for (let i = 0; i < 2; i++) G.particles.push(new Particle({
      x: this.x + (this.flat ? rr(-40, 40) : this.dir * rr(0, 40)), y: this.y + rr(-18, 18),
      vx: (this.flat ? rr(-2, 2) : this.dir * rr(1, 3)), vy: rr(-0.8, 0.8),
      life: rr(0.12, 0.3), col: this.col, col2: this.col2, size: rr(1, 2.4), grav: 0, drag: 0.9
    }));
    if (this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const k = clamp(1 - this.life / 0.46, 0, 1);
    const a = 1 - k;
    c2.save();
    c2.globalAlpha = a * 0.9;
    c2.globalCompositeOperation = 'lighter';
    if (this.flat) {
      /* a low sheet of air running both ways from the landing */
      const w = Math.round(46 * (1 + k * 2.4));
      for (let i = 0; i < 3; i++) {
        c2.fillStyle = i === 0 ? '#ffffff' : (i === 1 ? this.col : this.col2);
        const hh = 3 - i;
        c2.fillRect(Math.round(this.x - w), Math.round(this.y - hh), w * 2, hh * 2);
      }
    } else {
      /* a crescent, opening as it flies */
      const r = 22 * (1 + k * 2.2);
      for (let step = 0; step < 26; step++) {
        const ang = -1.15 + (step / 25) * 2.3;
        const px = this.x + this.dir * Math.cos(ang) * r;
        const py = this.y + Math.sin(ang) * r;
        const thick = Math.round(4 - Math.abs(step - 12.5) / 5);
        c2.fillStyle = step % 5 === 0 ? '#ffffff' : this.col;
        c2.fillRect(Math.round(px), Math.round(py), Math.max(1, thick), Math.max(1, thick));
        c2.fillStyle = this.col2;
        c2.fillRect(Math.round(px - this.dir * 3), Math.round(py), 2, 2);
      }
    }
    c2.restore();
  }
}

/* A ring of force running out along the ground. The Tide Warden throws it,
   and it blasts you off your feet rather than merely stinging. */
class Shockwave {
  constructor(x, y, dmg, col, col2) {
    this.x = x; this.y = y; this.dmg = dmg || 2;
    this.col = col || '#a8cbd6'; this.col2 = col2 || '#2f6fb0';
    this.r = 6; this.life = 1.15; this.dead = false; this.t = 0; this.hit = false;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.r += 210 * dt;
    const p = G.player;
    if (!this.hit && !p.dead) {
      const dx = p.cx - this.x, d = Math.abs(dx);
      /* it catches you as the ring passes, and only near the ground */
      if (Math.abs(d - this.r) < 14 && Math.abs(p.cy - this.y) < 46) {
        this.hit = true;
        if (p.hurt(this.dmg, this.x, this.y + 20)) {
          /* blasted away, far harder than an ordinary blow */
          const dir = Math.sign(dx) || 1;
          p.vx = dir * 8.5; p.vy = -5.2; p.hurtT = 0.42;
          p.spinT = 0; p.rollT = 0;
          G.shake(9);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      G.particles.push(new Particle({
        x: this.x + side * this.r + rr(-4, 4), y: this.y + rr(-4, 4),
        vx: side * rr(0.5, 2), vy: rr(-2.4, -0.3), life: rr(0.2, 0.5),
        col: this.col, col2: this.col2, size: rr(1, 2.6), grav: 0.1
      }));
    }
    if (this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const a = clamp(this.life / 1.15, 0, 1);
    c2.save();
    c2.globalAlpha = a;
    for (const side of [-1, 1]) {
      const x = Math.round(this.x + side * this.r);
      const h = Math.round(10 + a * 16);
      c2.fillStyle = this.col2; c2.fillRect(x - 2, Math.round(this.y - h), 4, h);
      c2.fillStyle = this.col;  c2.fillRect(x - 1, Math.round(this.y - h), 2, h);
      c2.fillStyle = '#ffffff'; c2.fillRect(x, Math.round(this.y - h), 1, Math.round(h * 0.4));
    }
    c2.restore();
  }
}

/* A tentacle thrown out in an arc. It knocks you back hard. */
class Tentacle {
  constructor(x, y, dir, dmg, reach) {
    this.x = x; this.y = y; this.dir = dir; this.dmg = dmg || 4;
    this.reach = reach || 130;
    this.t = 0; this.life = 0.62; this.dead = false; this.hit = false;
  }
  tipAt(k) {
    const bend = Math.sin(k * Math.PI) * 26;
    return { x: this.x + this.dir * this.reach * k, y: this.y - bend };
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const k = clamp(this.t / 0.34, 0, 1);
    const tip = this.tipAt(k);
    const p = G.player;
    if (!this.hit && !p.dead && this.t > 0.06 &&
        rectsOverlap({ x: tip.x - 14, y: tip.y - 14, w: 28, h: 28 },
                     { x: p.x, y: p.y, w: p.w, h: p.h })) {
      this.hit = true;
      if (p.hurt(this.dmg, this.x, this.y)) {
        p.vx = this.dir * 7.6; p.vy = -4.2; p.hurtT = 0.34;
        p.spinT = 0; p.rollT = 0;
        G.shake(7);
      }
    }
    if (Math.random() < 0.8) G.particles.push(new Particle({
      x: tip.x + rr(-5, 5), y: tip.y + rr(-5, 5), vx: rr(-1, 1), vy: rr(-1, 0.4),
      life: rr(0.16, 0.4), col: '#c9a8ff', col2: '#4a1f6b', size: rr(1, 2.6), grav: 0.04
    }));
    if (this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const k = clamp(this.t / 0.34, 0, 1);
    const fade = clamp(this.life / 0.62, 0, 1);
    c2.save(); c2.globalAlpha = 0.5 + fade * 0.5;
    let px = this.x, py = this.y;
    const steps = 14;
    for (let i = 1; i <= steps; i++) {
      const q = k * i / steps, pt = this.tipAt(q);
      const w = Math.max(2, Math.round(7 * (1 - i / steps) + 2));
      c2.fillStyle = i % 3 === 0 ? '#4a1f6b' : '#8f5fc0';
      c2.fillRect(Math.round(pt.x - w / 2), Math.round(pt.y - w / 2), w, w);
      px = pt.x; py = pt.y;
    }
    c2.fillStyle = '#c9a8ff';
    c2.fillRect(Math.round(px - 3), Math.round(py - 3), 6, 6);
    c2.restore();
  }
}

/* The Leviathan's jaws.  They open where you stand, hold a moment, then
   snap shut.  Step out of them and they close on nothing. */
class Maw {
  constructor(x, y, dmg, col, col2) {
    this.x = x; this.y = y; this.dmg = dmg || 6;
    this.col = col || '#8fd0c0'; this.col2 = col2 || '#1d5a5a';
    this.t = 0; this.life = 1.05; this.dead = false; this.hit = false;
    this.open = 0.52;                 /* the jaws hang open this long */
    this.rw = 34; this.rh = 40;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (!this.hit && this.t >= this.open && this.t < this.open + 0.2) {
      this.hit = true;
      const p = G.player;
      if (!p.dead && rectsOverlap({ x: this.x - this.rw, y: this.y - this.rh, w: this.rw * 2, h: this.rh * 2 },
                                  { x: p.x, y: p.y, w: p.w, h: p.h })) {
        if (p.hurt(this.dmg, this.x, this.y)) {
          p.vx = Math.sign(p.cx - this.x || 1) * 6.4; p.vy = -4.0; p.hurtT = 0.34;
          G.shake(10); G.hitStop(0.08);
        }
      }
      Snd.gulp(); G.shake(6);
      for (let i = 0; i < 20; i++) G.particles.push(new Particle({
        x: this.x + rr(-this.rw, this.rw), y: this.y + rr(-8, 8), vx: rr(-3, 3), vy: rr(-3, 1),
        life: rr(0.2, 0.5), col: this.col, col2: this.col2, size: rr(1, 2.8), grav: 0.14
      }));
    }
    if (this.life <= 0) this.dead = true;
  }
  /* how wide the jaws stand at this moment */
  gape() {
    if (this.t < this.open) return 1 - Math.pow(this.t / this.open, 2) * 0.15;
    const k = clamp((this.t - this.open) / 0.16, 0, 1);
    return 1 - k;
  }
  draw(c2) {
    const g = this.gape();
    const fade = clamp(this.life / 1.05, 0, 1);
    c2.save();
    c2.globalAlpha = Math.min(1, fade * 1.6);
    /* the dark of the throat between the jaws */
    c2.fillStyle = '#0d1216';
    c2.beginPath();
    c2.ellipse(Math.round(this.x), Math.round(this.y), this.rw * 0.8, this.rh * g * 0.8, 0, 0, TAU);
    c2.fill();
    /* two rows of teeth, closing on each other */
    for (const side of [-1, 1]) {
      const jy = this.y + side * this.rh * g;
      c2.fillStyle = this.col2;
      c2.fillRect(Math.round(this.x - this.rw), Math.round(jy - 4), this.rw * 2, 8);
      c2.fillStyle = '#f2f6ea';
      for (let k = 0; k < 9; k++) {
        const tx = this.x - this.rw + 4 + k * (this.rw * 2 - 8) / 8;
        const th = 5 + (k % 2) * 3;
        c2.beginPath();
        c2.moveTo(Math.round(tx - 3), Math.round(jy));
        c2.lineTo(Math.round(tx + 3), Math.round(jy));
        c2.lineTo(Math.round(tx), Math.round(jy - side * th));
        c2.closePath(); c2.fill();
      }
    }
    /* the warning ring while the jaws still hang open */
    if (this.t < this.open) {
      c2.globalAlpha = 0.5 + Math.sin(this.t * 26) * 0.3;
      c2.strokeStyle = this.col;
      c2.lineWidth = 1;
      c2.strokeRect(Math.round(this.x - this.rw), Math.round(this.y - this.rh),
                    this.rw * 2, this.rh * 2);
    }
    c2.restore();
  }
}

/* A lash of fire.  It does not knock you far, but it sets you alight, and
   the fire costs half a heart a second until it burns out. */
class FireLash {
  constructor(x, y, dir, dmg, reach, burn) {
    this.x = x; this.y = y; this.dir = dir; this.dmg = dmg || 3;
    this.reach = reach || 180; this.burn = burn || 4;
    this.t = 0; this.life = 0.7; this.dead = false; this.hit = false;
  }
  tipAt(k) {
    return { x: this.x + this.dir * this.reach * k,
             y: this.y + Math.sin(k * Math.PI * 1.4 + this.t * 6) * 11 };
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const k = clamp(this.t / 0.3, 0, 1);
    const tip = this.tipAt(k);
    const p = G.player;
    if (!this.hit && !p.dead && this.t > 0.05 &&
        rectsOverlap({ x: tip.x - 15, y: tip.y - 15, w: 30, h: 30 },
                     { x: p.x, y: p.y, w: p.w, h: p.h })) {
      this.hit = true;
      if (p.hurt(this.dmg, this.x, this.y)) { p.hurtT = 0.26; G.shake(6); }
      p.ignite(this.burn);
    }
    for (let i = 0; i < 2; i++) {
      const q = Math.random() * k, pt = this.tipAt(q);
      G.particles.push(new Particle({
        x: pt.x + rr(-4, 4), y: pt.y + rr(-4, 4), vx: rr(-0.6, 0.6), vy: rr(-1.6, -0.2),
        life: rr(0.16, 0.44), col: rpick(['#ffd06a', '#ff7a2a', '#fff0b0']), col2: '#8a2410',
        size: rr(1, 2.8), grav: -0.02, type: 'fire'
      }));
    }
    if (this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const k = clamp(this.t / 0.3, 0, 1);
    const fade = clamp(this.life / 0.7, 0, 1);
    c2.save();
    c2.globalAlpha = 0.55 + fade * 0.45;
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const q = k * i / steps, pt = this.tipAt(q);
      const w = Math.max(2, Math.round(8 * (1 - i / steps * 0.5)));
      c2.fillStyle = i % 3 === 0 ? '#8a2410' : (i % 3 === 1 ? '#ff7a2a' : '#ffd06a');
      c2.fillRect(Math.round(pt.x - w / 2), Math.round(pt.y - w / 2), w, w);
    }
    c2.restore();
  }
}

/* The Pharaoh's spear.  It goes out hard, and it comes back to the hand that
   threw it, and it bites on both legs of the journey. */
class Spear {
  constructor(owner, tx, ty, outDmg, backDmg) {
    this.owner = owner;
    this.x = owner.x + owner.face * 20 * (owner.scale || 1);
    this.y = owner.y - 46 * (owner.scale || 1);
    this.hx = this.x; this.hy = this.y;
    const dx = tx - this.x, dy = ty - this.y, l = Math.hypot(dx, dy) || 1;
    this.dx = dx / l; this.dy = dy / l;
    this.reach = clamp(l + 40, 90, 260);
    this.outDmg = outDmg || 6;                 /* three hearts on the way out */
    this.backDmg = backDmg || 4;               /* two on the way home */
    this.ang = Math.atan2(dy, dx);
    this.t = 0; this.dead = false;
    this.phase = 'out'; this.hitOut = false; this.hitBack = false;
    this.outT = 0.5; this.holdT = 0.25; this.backT = 0.7;
    Snd.swing();
  }
  box() { return { x: this.hx - 13, y: this.hy - 8, w: 26, h: 16 }; }
  bite(dmg, which) {
    const p = G.player;
    if (p.dead) return false;
    if (!rectsOverlap(this.box(), { x: p.x, y: p.y, w: p.w, h: p.h })) return false;
    if (p.hurt(dmg, this.hx - this.dx * 20, this.hy)) {
      p.vx = this.dx * (which === 'out' ? 7 : -5.4);
      p.vy = -3.6; p.hurtT = 0.34;
      G.shake(which === 'out' ? 9 : 7); G.hitStop(0.07);
    }
    return true;
  }
  update(dt) {
    this.t += dt;
    const own = this.owner;
    if (this.phase === 'out') {
      const k = clamp(this.t / this.outT, 0, 1);
      const ease = 1 - Math.pow(1 - k, 2);
      this.hx = this.x + this.dx * this.reach * ease;
      this.hy = this.y + this.dy * this.reach * ease;
      if (!this.hitOut && this.bite(this.outDmg, 'out')) this.hitOut = true;
      if (k >= 1) { this.phase = 'hold'; this.t = 0; }
    } else if (this.phase === 'hold') {
      /* it hangs a moment at the end of its flight, quivering */
      this.hy += Math.sin(this.t * 30) * 0.4;
      if (this.t >= this.holdT) { this.phase = 'back'; this.t = 0;
        this.bx = this.hx; this.by = this.hy;
        Snd.charge();
      }
    } else {
      const k = clamp(this.t / this.backT, 0, 1);
      const ease = k * k;
      /* home to whatever hand threw it, wherever that hand is now */
      const hx = (own && !own.dead) ? own.x + own.face * 20 * (own.scale || 1) : this.x;
      const hy = (own && !own.dead) ? own.y - 46 * (own.scale || 1) : this.y;
      this.hx = lerp(this.bx, hx, ease);
      this.hy = lerp(this.by, hy, ease);
      this.ang = Math.atan2(hy - this.by, hx - this.bx);
      if (!this.hitBack && this.bite(this.backDmg, 'back')) this.hitBack = true;
      if (k >= 1) {
        this.dead = true;
        Snd.parry(); G.shake(3);
        for (let i = 0; i < 12; i++) G.particles.push(new Particle({
          x: hx, y: hy, vx: rr(-2, 2), vy: rr(-2, 1), life: rr(0.2, 0.5),
          col: '#f6d878', col2: '#9c7418', size: rr(1, 2.4), grav: 0.1
        }));
      }
    }
    if (Math.random() < 0.6) G.particles.push(new Particle({
      x: this.hx + rr(-6, 6), y: this.hy + rr(-4, 4), vx: rr(-0.6, 0.6), vy: rr(-0.8, 0.2),
      life: rr(0.12, 0.32), col: '#f6d878', col2: '#9c7418', size: rr(1, 2.2), grav: 0
    }));
  }
  draw(c2) {
    c2.save();
    c2.translate(Math.round(this.hx), Math.round(this.hy));
    c2.rotate(this.ang);
    /* the shaft */
    c2.fillStyle = '#7a5230';
    c2.fillRect(-18, -1, 30, 3);
    c2.fillStyle = '#9c6c41';
    c2.fillRect(-18, -1, 30, 1);
    /* the binding */
    c2.fillStyle = '#e0b040';
    c2.fillRect(-2, -2, 3, 5);
    c2.fillRect(-12, -2, 2, 5);
    /* the head */
    c2.fillStyle = '#b8c2d0';
    c2.beginPath();
    c2.moveTo(12, -5); c2.lineTo(24, 0); c2.lineTo(12, 5);
    c2.closePath(); c2.fill();
    c2.fillStyle = '#e8eef8';
    c2.beginPath();
    c2.moveTo(12, -3); c2.lineTo(21, 0); c2.lineTo(12, 1);
    c2.closePath(); c2.fill();
    /* the tail feather */
    c2.fillStyle = '#c9403a';
    c2.fillRect(-20, -3, 4, 7);
    c2.globalCompositeOperation = 'lighter';
    c2.globalAlpha = 0.22;
    c2.fillStyle = '#ffd06a';
    c2.beginPath(); c2.arc(16, 0, 12, 0, TAU); c2.fill();
    c2.restore();
  }
}

/* Ifrit's burning hand.  It reaches out for you and closes on whatever it
   touches.  Stay out of its way and it grasps nothing. */
class GrabHand {
  constructor(owner, tx, ty, dmg, col, col2) {
    this.col = col || '#ff7a2a'; this.col2 = col2 || '#8a2410';
    this.owner = owner;
    this.x = owner.x + owner.face * 22 * (owner.scale || 1);
    this.y = owner.y - 44 * (owner.scale || 1);
    this.hx = this.x; this.hy = this.y;
    const dx = tx - this.x, dy = ty - this.y, l = Math.hypot(dx, dy) || 1;
    this.dx = dx / l; this.dy = dy / l;
    this.reach = Math.min(190, l + 24);
    this.dmg = dmg || 10;
    this.t = 0; this.life = 1.5; this.dead = false; this.took = false;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    /* out fast, then back */
    const outT = 0.42;
    const k = this.t < outT ? this.t / outT : Math.max(0, 1 - (this.t - outT) / 0.6);
    const ease = 1 - Math.pow(1 - k, 2);
    this.hx = this.x + this.dx * this.reach * ease;
    this.hy = this.y + this.dy * this.reach * ease;
    const p = G.player;
    if (!this.took && !p.dead && !p.heldBy && this.t > 0.05 &&
        rectsOverlap({ x: this.hx - 15, y: this.hy - 15, w: 30, h: 30 },
                     { x: p.x, y: p.y, w: p.w, h: p.h })) {
      this.took = true;
      p.seize(this.owner, 1.5, this.dmg, 'slam');
      Snd.slam(); G.shake(8);
    }
    if (Math.random() < 0.8) G.particles.push(new Particle({
      x: this.hx + rr(-7, 7), y: this.hy + rr(-7, 7), vx: rr(-1, 1), vy: rr(-1.4, 0.2),
      life: rr(0.16, 0.42), col: rpick(['#ffd06a', '#ff7a2a']), col2: '#8a2410',
      size: rr(1, 2.8), grav: -0.01, type: 'fire'
    }));
    if (this.life <= 0 || (this.t > outT && k <= 0)) this.dead = true;
  }
  draw(c2) {
    c2.save();
    /* the arm of fire */
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      const q = i / steps;
      const px = lerp(this.x, this.hx, q), py = lerp(this.y, this.hy, q);
      const w = Math.max(3, Math.round(9 * q + 2));
      c2.fillStyle = i % 3 === 0 ? '#8a2410' : (i % 3 === 1 ? '#ff7a2a' : '#c0341a');
      c2.fillRect(Math.round(px - w / 2), Math.round(py - w / 2), w, w);
    }
    /* the hand itself: a palm and four grasping fingers */
    const hx = Math.round(this.hx), hy = Math.round(this.hy);
    c2.fillStyle = '#c0341a';
    c2.fillRect(hx - 7, hy - 8, 14, 15);
    c2.fillStyle = '#ff7a2a';
    c2.fillRect(hx - 5, hy - 6, 10, 11);
    c2.fillStyle = '#ffd06a';
    c2.fillRect(hx - 3, hy - 4, 5, 6);
    const grip = Math.sin(this.t * 12) * 2;
    c2.fillStyle = '#c0341a';
    for (let f = 0; f < 4; f++) {
      const fy = hy - 9 + f * 5;
      c2.fillRect(hx + 5, fy, 6 - grip, 3);
      c2.fillRect(hx - 11 + grip, fy, 6 - grip, 3);
    }
    /* the glow that says how far it reaches */
    c2.globalCompositeOperation = 'lighter';
    c2.globalAlpha = 0.24;
    c2.fillStyle = '#ff9a4a';
    c2.beginPath(); c2.arc(hx, hy, 18, 0, TAU); c2.fill();
    c2.restore();
  }
}

/* A pillar of fire that erupts from the floor after a warning scorch. */
class FirePillar {
  constructor(x, groundY, dmg, col, col2) {
    this.x = x; this.gy = groundY; this.dmg = dmg || 4;
    this.col = col || '#ffd06a'; this.col2 = col2 || '#c0341a';
    this.t = 0; this.warn = 0.55; this.live = 0.42; this.dead = false; this.hit = false;
  }
  get y() { return this.gy - 24; }
  update(dt) {
    this.t += dt;
    if (this.t > this.warn && this.t < this.warn + this.live) {
      const p = G.player;
      if (!this.hit && !p.dead &&
          rectsOverlap({ x: this.x - 10, y: this.gy - 54, w: 20, h: 58 },
                       { x: p.x, y: p.y, w: p.w, h: p.h })) {
        this.hit = true; p.hurt(this.dmg, this.x, this.gy - 20);
      }
      if (Math.random() < 0.9) G.particles.push(new Particle({
        x: this.x + rr(-8, 8), y: this.gy - rr(0, 50), vx: rr(-0.7, 0.7), vy: rr(-3.4, -1),
        life: rr(0.2, 0.5), col: this.col, col2: this.col2, size: rr(1.6, 3.6), grav: -0.02, type: 'fire'
      }));
    }
    if (this.t > this.warn + this.live) this.dead = true;
  }
  draw(c2) {
    if (this.t < this.warn) {
      const k = this.t / this.warn;
      c2.save(); c2.globalAlpha = 0.35 + Math.sin(this.t * 28) * 0.25;
      c2.fillStyle = this.col;
      c2.fillRect(Math.round(this.x - 9 * k), Math.round(this.gy - 2), Math.round(18 * k), 3);
      c2.restore();
      return;
    }
    const k = clamp((this.t - this.warn) / this.live, 0, 1);
    const h = Math.round(54 * Math.sin(Math.min(1, k * 1.7) * Math.PI * 0.5));
    c2.save(); c2.globalAlpha = 1 - k * 0.4;
    for (let i = 0; i < h; i++) {
      const w = Math.round(14 - i * 0.14 + Math.sin(i * 0.5 + this.t * 30) * 2);
      c2.fillStyle = i < h * 0.4 ? '#ffffff' : (i < h * 0.75 ? this.col : this.col2);
      c2.fillRect(Math.round(this.x - w / 2), this.gy - i, w, 1);
    }
    c2.restore();
  }
}

/* the Emberheart's wave: a swing that carries */
/* The emberheart wave burns out after five tiles. The gale carries it to
   seven and a half. Both hold, whatever the whetstone step. */
const EMBER_RANGE = TILE * 5;
const GALE_RANGE = TILE * 7.5;
/* a direction given either as a sign along the ground or as a vector */
function aimVec(d) {
  if (typeof d === 'number') return { x: d, y: 0 };
  return { x: d.x, y: d.y };
}
class Wave {
  constructor(x, y, dir, dmg, range) {
    const a = aimVec(dir);
    this.x = x; this.y = y; this.dx = a.x; this.dy = a.y; this.dir = a.x || 1;
    this.dmg = dmg;
    this.range = range || EMBER_RANGE;
    this.gone = 0;
    this.life = 1.1; this.dead = false; this.t = 0; this.hit = new Set();
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    /* the last step is cut short, so the reach is exact */
    let step = 4.2 * dt * 60;
    if (this.gone + step >= this.range) { step = this.range - this.gone; this.dead = true; }
    this.x += this.dx * step; this.y += this.dy * step;
    this.gone += step;
    const box = { x: this.x - 8, y: this.y - 13, w: 16, h: 26 };
    const walled = G.room.mode === 'top';
    for (const en of G.enemies) {
      if (en.dead || this.hit.has(en)) continue;
      if (!rectsOverlap(box, en.box())) continue;
      if (walled && G.room.losBlocked(this.x, this.y, en.cx, en.cy)) continue;
      this.hit.add(en);
      en.hurt(this.dmg, this.x, this.y);
    }
    if (Math.random() < 0.7) G.particles.push(new Particle({
      x: this.x + rr(-5, 5), y: this.y + rr(-11, 11), vx: -this.dir * rr(0.2, 1), vy: rr(-0.5, 0.2),
      life: rr(0.16, 0.4), col: '#ffd06a', col2: '#8a2410', size: rr(1.4, 2.8), grav: -0.01, type: 'fire'
    }));
    if (G.room.solidPx(this.x + this.dx * 6, this.y + this.dy * 6) || this.life <= 0) this.dead = true;
  }
  draw(c2) {
    const f = Art.item.wave[Math.floor(this.t / 0.06) % 4];
    if (this.dy === 0) { blit(c2, f, this.x, this.y, 11, 13, this.dx < 0); return; }
    /* thrown up or down, the fire turns with it */
    c2.save();
    c2.translate(Math.round(this.x), Math.round(this.y));
    c2.rotate(this.dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    blit(c2, f, 0, 0, 11, 13, false);
    c2.restore();
  }
}

/* ============================================================
   THE SHINE.  Bronze, silver and gold gear catches a light that
   runs down the body.  The sprite is drawn a second time inside
   a moving band, so only the hero lights up, never the ground.
   ============================================================ */
function drawHeroShine(c2, img, x, y, ax, ay, flip) {
  if (!G.heroShines || !G.heroShines()) return;
  const w = img.width, h = img.height;
  const left = Math.round(x - (flip ? w - ax : ax));
  const top = Math.round(y - ay);
  /* the band runs from above the head to below the boots and back again */
  const span = h + 26;
  const k = ((G.t * 0.55) % 1) * span - 13;
  c2.save();
  c2.beginPath();
  c2.moveTo(left - 4, top + k);
  c2.lineTo(left + w + 4, top + k - 10);
  c2.lineTo(left + w + 4, top + k - 2);
  c2.lineTo(left - 4, top + k + 8);
  c2.closePath();
  c2.clip();
  c2.globalCompositeOperation = 'lighter';
  c2.globalAlpha = 0.5;
  blit(c2, img, x, y, ax, ay, flip, 1, 1, 0);
  c2.restore();
}

/* ---------- the Mother Spore ---------- */
class SporeShot {
  constructor(x, y, vx, vy, dmg) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg || 2;
    this.life = 3.4; this.dead = false; this.t = 0;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    const s = dt * 60;
    this.x += this.vx * s; this.y += this.vy * s;
    if (!this.friendly) this.vy += 0.035 * s;
    if (Math.random() < 0.5) G.particles.push(new Particle({
      x: this.x + rr(-3, 3), y: this.y + rr(-3, 3), vx: rr(-0.3, 0.3), vy: rr(-0.4, 0),
      life: rr(0.2, 0.5), col: '#f6efdc', col2: '#9be89a', size: rr(1, 2.4), grav: -0.01
    }));
    if (projImpact(this, 8, 8)) this.burst();
    if (G.room.solidPx(this.x, this.y) || this.life <= 0) this.burst();
  }
  burst() {
    if (this.dead) return;
    this.dead = true; Snd.spore();
    for (let i = 0; i < 12; i++) G.particles.push(new Particle({
      x: this.x, y: this.y, vx: rr(-2, 2), vy: rr(-2, 1), life: rr(0.3, 0.8),
      col: '#f6efdc', col2: '#5aa05a', size: rr(1, 3), grav: -0.01, drag: 0.93
    }));
  }
  draw(c2) {
    const r = 4 + Math.sin(this.t * 9) * 0.8;
    c2.fillStyle = '#5aa05a';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), r + 1, 0, TAU); c2.fill();
    c2.fillStyle = '#9be89a';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y), r, 0, TAU); c2.fill();
    c2.fillStyle = '#f6efdc';
    c2.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
  }
}
class MotherSpore extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 70, h: 60, hp: 56, damage: 2, coinDrop: 0, blood: '#c9403a' });
    this.kbScale = 0;                 /* a guardian holds its ground */
    this.maxHp = 56; this.face = -1;
    this.state = 'sleep'; this.stateT = 0; this.phase = 1;
    this.awake = false; this.dying = false; this.deathT = 0; this.mode = 'idle';
    this.brood = 0;
  }
  box() { return { x: this.x - 38, y: this.y - 62, w: 76, h: 62 }; }
  hurt(dmg, fx, fy, mult) {
    if (this.dying) return;
    if (!this.awake) this.wake();
    super.hurt(dmg, fx, fy, mult);
    this.vx = 0; this.vy = 0;
    if (!this.dead) {
      const f = this.hp / this.maxHp;
      if (f < 0.6 && this.phase === 1) { this.phase = 2; this.bellow(); }
      else if (f < 0.3 && this.phase === 2) { this.phase = 3; this.bellow(); }
    }
  }
  bellow() { Snd.bellow(); G.shake(8); this.state = 'burst'; this.mode = 'burst'; this.stateT = 1.3; }
  wake() { if (this.awake) return; this.awake = true; this.bellow(); }
  kill() { if (this.dying) return; this.dying = true; this.deathT = 0; Snd.bellow(); G.shake(11); }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.bossRegen(dt, 0.005);
    this.animT += dt;
    const p = G.player;
    if (this.dying) {
      this.deathT += dt;
      if (Math.random() < 0.7) G.particles.push(new Particle({
        x: this.x + rr(-40, 40), y: this.y - rr(0, 70), vx: rr(-2, 2), vy: rr(-2.6, -0.3),
        life: rr(0.5, 1.2), col: '#f6efdc', col2: '#9be89a', size: rr(2, 4.6), grav: -0.02
      }));
      if (Math.random() < 0.1) { Snd.spore(); G.shake(5); }
      if (this.deathT > 2.8 && !this.dead) {
        this.dead = true;
        Snd.explode(); G.shake(15); G.flash(0.8);
        for (let i = 0; i < 80; i++) G.particles.push(new Particle({
          x: this.x, y: this.y - 34, vx: rr(-6, 6), vy: rr(-6, 3), life: rr(0.6, 1.5),
          col: '#f6efdc', col2: '#c9403a', size: rr(2, 5), grav: 0.06
        }));
        G.payOut(40, this.x, this.y - 20);
        G.onBossDead();
      }
      return;
    }
    if (!this.awake) {
      this.frame = Math.floor(this.animT / 0.3) % 4;
      if (Math.abs(p.cx - this.x) < 210) this.wake();
      return;
    }
    this.stateT -= dt;
    this.face = p.cx > this.x ? 1 : -1;
    const sp = this.phase === 3 ? 1.5 : (this.phase === 2 ? 1.24 : 1);

    switch (this.state) {
      case 'burst': {
        this.mode = 'burst';
        this.frame = Math.floor(this.animT / 0.1) % 4;
        this.shotT = (this.shotT || 0) - dt;
        if (this.shotT <= 0) {
          this.shotT = 0.6 / sp;
          const n = 5 + this.phase * 2;
          for (let k = 0; k < n; k++) {
            const a = -Math.PI * 0.92 + (k / (n - 1)) * Math.PI * 0.84;
            G.projectiles.push(new SporeShot(this.x, this.y - 48, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 2));
          }
          /* and two thrown straight at where you stand, so the fan is not
             the whole of it */
          for (let k = -1; k <= 1; k += 2) {
            const dx = p.cx - this.x, dy = (p.cy - 6) - (this.y - 48);
            const l = Math.hypot(dx, dy) || 1;
            const sp2 = 3.1;
            G.projectiles.push(new SporeShot(this.x, this.y - 48,
              (dx / l) * sp2 + k * 0.22, (dy / l) * sp2 - 0.5, 2));
          }
          Snd.spore();
        }
        if (this.stateT <= 0) { this.state = 'spawn'; this.mode = 'spawn'; this.stateT = 1.6; this.brood = 0; }
        break;
      }
      case 'spawn': {
        this.mode = 'spawn';
        this.frame = Math.floor(this.animT / 0.12) % 4;
        this.spawnT = (this.spawnT || 0) - dt;
        if (this.spawnT <= 0 && this.brood < 2 + this.phase) {
          this.spawnT = 0.45;
          this.brood++;
          const s = new Sporeling(this.x + rr(-30, 30), this.y - 40);
          s.vy = -3; s.vx = rr(-1.5, 1.5);
          G.enemies.push(s);
          Snd.hopSoft();
        }
        if (this.stateT <= 0) { this.state = 'rest'; this.mode = 'idle'; this.stateT = 1.3 / sp; }
        break;
      }
      default: {
        this.mode = 'idle';
        this.frame = Math.floor(this.animT / 0.18) % 4;
        if (this.stateT <= 0) { this.state = 'burst'; this.mode = 'burst'; this.stateT = 1.5; this.shotT = 0; }
        break;
      }
    }
    this.touchPlayer(2);
  }
  draw(c2) {
    const a = Art.mother.anchor;
    let img;
    if (this.mode === 'burst') img = Art.mother.burst[this.frame % 4];
    else if (this.mode === 'spawn') img = Art.mother.spawn[this.frame % 4];
    else img = Art.mother.idle[this.frame % 4];
    let alpha = 1;
    if (this.dying) alpha = 0.55 + Math.sin(this.deathT * 22) * 0.45;
    c2.save();
    if (alpha < 1) c2.globalAlpha = alpha;
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, false);
    c2.restore();
  }
}

/* ---------- the dragon ---------- */
class Dragon extends Enemy {
  constructor(x, y) {
    super({ x: x, y: y, w: 64, h: 52, hp: 48, damage: 2, coinDrop: 0, blood: '#9b3230' });
    this.kbScale = 0;                 /* a guardian holds its ground */
    this.maxHp = 48;
    this.face = -1; this.state = 'sleep'; this.stateT = 0;
    this.homeY = y; this.flyY = y - 70; this.phase = 1;
    this.awake = false; this.deathT = 0; this.dying = false;
  }
  box() { return { x: this.x - 30, y: this.y - 46, w: 60, h: 46 }; }
  hurt(dmg, fx, fy, coinMult) {
    if (this.dying) return;
    if (this.state === 'sleep') this.wake();
    super.hurt(dmg, fx, fy, coinMult);
    this.vx = 0; this.vy = 0;
    if (!this.dead) {
      const frac = this.hp / this.maxHp;
      if (frac < 0.5 && this.phase === 1) { this.phase = 2; this.roar(); }
      else if (frac < 0.22 && this.phase === 2) { this.phase = 3; this.roar(); }
    }
  }
  roar() { Snd.dragonRoar(); G.shake(9); this.state = 'roar'; this.stateT = 1.2; }
  wake() { if (this.awake) return; this.awake = true; this.roar(); G.bossFight = true; }
  kill() {
    if (this.dying) return;
    this.dying = true; this.deathT = 0;
    Snd.dragonRoar(); G.shake(12);
  }
  update(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.bossRegen(dt, 0.005);
    this.animT += dt;
    const p = G.player;

    if (this.dying) {
      this.deathT += dt;
      this.y += 12 * dt;
      if (Math.random() < 0.7) {
        G.particles.push(new Particle({
          x: this.x + rr(-34, 34), y: this.y - rr(0, 50), vx: rr(-1.4, 1.4), vy: rr(-2.4, -0.3),
          life: rr(0.4, 1.0), col: '#ffb638', col2: '#7a1e12', size: rr(2, 5), grav: -0.02, type: 'fire'
        }));
      }
      if (Math.random() < 0.12) { Snd.boom(); G.shake(6); }
      if (this.deathT > 3.0 && !this.dead) {
        this.dead = true;
        Snd.explode(); G.shake(16); G.flash(0.8);
        for (let i = 0; i < 90; i++) G.particles.push(new Particle({
          x: this.x, y: this.y - 24, vx: rr(-7, 7), vy: rr(-7, 3), life: rr(0.6, 1.6),
          col: '#ffd06a', col2: '#8e2a20', size: rr(2, 5), grav: 0.1, type: 'fire'
        }));
        G.payOut(40, this.x, this.y - 20);
        G.onBossDead();
      }
      return;
    }
    if (!this.awake) {
      if (Math.abs(p.cx - this.x) < 190) this.wake();
      this.frame = Math.floor(this.animT / 0.3) % 4;
      return;
    }
    this.stateT -= dt;
    const sp = this.phase === 3 ? 1.5 : (this.phase === 2 ? 1.25 : 1);
    this.face = p.cx > this.x ? 1 : -1;

    switch (this.state) {
      case 'roar':
        this.frame = Math.floor(this.animT / 0.16) % 2;
        if (this.stateT <= 0) { this.state = 'hover'; this.stateT = 2.0; this.shots = 0; }
        break;
      case 'hover': {
        this.y = approach(this.y, this.flyY, 60 * dt);
        this.x = approach(this.x, clamp(p.cx + (this.face > 0 ? -90 : 90), 120, G.room.pxW() - 120), 44 * dt * sp);
        this.frame = Math.floor(this.animT / 0.09) % 6;
        this.shotT = (this.shotT || 0) - dt;
        if (this.shotT <= 0) {
          this.shotT = 0.55 / sp;
          this.shots = (this.shots || 0) + 1;
          const n = this.phase === 3 ? 3 : (this.phase === 2 ? 2 : 1);
          for (let k = 0; k < n; k++) {
            const dx = p.cx - (this.x + this.face * 40), dy = p.cy - (this.y - 44);
            const l = Math.hypot(dx, dy) || 1;
            const spread = (k - (n - 1) / 2) * 0.22;
            const ang = Math.atan2(dy, dx) + spread;
            G.projectiles.push(new Fireball(this.x + this.face * 40, this.y - 44,
              Math.cos(ang) * 2.6, Math.sin(ang) * 2.6, 1));
          }
          Snd.fire();
        }
        if (this.stateT <= 0) { this.state = rpick(['swoop', 'land', 'swoop']); this.stateT = 2.4; }
        break;
      }
      case 'swoop': {
        this.frame = Math.floor(this.animT / 0.07) % 6;
        const ty = p.cy - 6;
        this.y = approach(this.y, ty, 130 * dt);
        this.x += this.face * 2.9 * sp * dt * 60;
        if (this.x < 90 || this.x > G.room.pxW() - 90 || this.stateT <= 0) {
          this.state = 'hover'; this.stateT = 2.2;
        }
        this.touchPlayer(2);
        break;
      }
      case 'land': {
        this.frame = Math.floor(this.animT / 0.12) % 4;
        this.y = approach(this.y, this.homeY, 110 * dt);
        if (Math.abs(this.y - this.homeY) < 2) { this.state = 'breathe'; this.stateT = 1.9; Snd.fire(); G.shake(4); }
        break;
      }
      case 'breathe': {
        this.frame = Math.floor(this.animT / 0.1) % 4;
        const bx = this.x + this.face * 52, by = this.y - 56;
        for (let i = 0; i < 4; i++) {
          const ang = (this.face > 0 ? 0 : Math.PI) + rr(-0.34, 0.34) + 0.28;
          G.particles.push(new Particle({
            x: bx, y: by, vx: Math.cos(ang) * rr(2.4, 5.4), vy: Math.sin(ang) * rr(2.4, 5.4) - 0.4,
            life: rr(0.4, 0.9), col: '#ffd76a', col2: '#c0341a', size: rr(2.5, 5.5), grav: 0.02, type: 'fire', drag: 0.97
          }));
        }
        /* the flame itself hurts */
        const p2 = G.player;
        const fx = bx + this.face * 40, fy = by + 26;
        if (!p2.dead && rectsOverlap({ x: fx - 46, y: fy - 26, w: 92, h: 56 }, { x: p2.x, y: p2.y, w: p2.w, h: p2.h }))
          p2.hurt(1, bx, by);
        if (Math.random() < 0.2) Snd.fire();
        if (this.stateT <= 0) { this.state = 'hover'; this.stateT = 2.0; }
        break;
      }
    }
    if (this.state !== 'swoop') this.touchPlayer(2);
  }
  draw(c2) {
    let img, a = Art.dragon.anchor;
    if (!this.awake) img = Art.dragon.idle[this.frame % 4];
    else if (this.state === 'roar') img = Art.dragon.roar[this.frame % 2];
    else if (this.state === 'breathe') img = Art.dragon.breathe[this.frame % 4];
    else if (this.state === 'land') img = Art.dragon.idle[this.frame % 4];
    else img = Art.dragon.fly[this.frame % 6];
    let alpha = 1;
    if (this.dying) alpha = 0.55 + Math.sin(this.deathT * 26) * 0.45;
    c2.save();
    if (alpha < 1) c2.globalAlpha = alpha;
    this.drawFlash(c2, img, this.x, this.y, a.x, a.y, this.face < 0);
    c2.restore();
  }
}

/* ---------- pickups ---------- */
class Coin {
  constructor(x, y, vx, vy, still, value) {
    this.x = x; this.y = y; this.vx = vx || 0; this.vy = vy || 0;
    this.t = rr(0, 3); this.dead = false; this.life = 0; this.still = !!still;
    this.grounded = false; this.magnet = false;
    /* a heap stands in for several coins, so a rich kill does not flood
       the room with hundreds of separate things to move and draw */
    this.value = Math.max(1, value || 1);
  }
  update(dt) {
    this.t += dt; this.life += dt;
    const p = G.player, room = G.room, s = dt * 60;
    const d = Math.hypot(p.cx - this.x, p.cy - this.y);
    this.magnet = d < p.magnetR && this.life > 0.25 && !p.dead;
    if (this.magnet) {
      /* one fixed draw, gentler far off and firmer close to hand */
      const dx = p.cx - this.x, dy = p.cy - this.y, l = d || 1;
      const near = clamp(1 - d / (p.magnetR || 1), 0, 1);
      const pull = COIN_PULL * (0.45 + near * 0.55);
      this.vx = approach(this.vx, dx / l * pull, 0.5 * s);
      this.vy = approach(this.vy, dy / l * pull, 0.5 * s);
    } else if (room.boxSolid(this.x - 3, this.y - 3, 6, 6)) {
      /* left inside rock after a pull: hold still and wait to be drawn out again */
      this.vx = 0; this.vy = 0;
      return;
    } else if (room.mode === 'side' && !this.still) {
      this.vy = Math.min(this.vy + 0.3 * s, 6);
      this.vx *= Math.pow(0.94, s);
    } else {
      this.vx *= Math.pow(0.9, s); this.vy *= Math.pow(0.9, s);
    }
    const nx = this.x + this.vx * s, ny = this.y + this.vy * s;
    if (this.magnet) {
      /* drawn to the hero, a coin passes straight through the rock */
      this.x = nx; this.y = ny;
    } else {
      if (room.boxSolid(nx - 3, this.y - 3, 6, 6)) { this.vx *= -0.5; } else this.x = nx;
      if (room.boxSolid(this.x - 3, ny - 3, 6, 6)) {
        if (this.vy > 0.6) { this.vy *= -0.42; this.vx *= 0.7; } else { this.vy = 0; this.grounded = true; }
      } else this.y = ny;
    }
    if (d < 11 && !p.dead) {
      this.dead = true;
      p.coins += this.value; G.stats.coins += this.value;
      Snd.coin();
      G.texts.push(new FloatText(this.x, this.y - 6, '+' + this.value, '#ffe98a'));
      for (let i = 0; i < (this.value > 1 ? 12 : 7); i++) G.particles.push(new Particle({
        x: this.x, y: this.y, vx: rr(-1.6, 1.6), vy: rr(-2, -0.2), life: rr(0.2, 0.45),
        col: '#ffeaa0', col2: '#f5c53a', size: rr(1, 2), grav: 0.1
      }));
    }
  }
  draw(c2) {
    if (this.value > 1) {
      const fp = Math.floor(this.t / 0.09) % 8;
      const img = Art.item.coinPile ? Art.item.coinPile[fp] : Art.item.coin[fp];
      blit(c2, img, this.x, this.y + 1, img.width / 2, img.height / 2, false,
           this.magnet ? 1 : 0.96);
      return;
    }
    const f = Math.floor(this.t / 0.075) % 8;
    const bobY = this.grounded || this.still ? Math.sin(this.t * 3.4) * 1.6 : 0;
    blit(c2, Art.item.coin[f], this.x, this.y + bobY, 7, 7);
  }
}
class CodePaper {
  constructor(x, y, code, si) { this.x = x; this.y = y; this.code = code; this.si = si; this.t = rr(0, 4); this.dead = false; }
  update(dt) {
    this.t += dt;
    const p = G.player;
    if (Math.hypot(p.cx - this.x, p.cy - this.y) < 14 && !p.dead) {
      this.dead = true;
      G.foundCode(this.code, this.si);
    }
  }
  draw(c2) {
    const bob = Math.sin(this.t * 2.2) * 2;
    c2.save();
    c2.globalCompositeOperation = 'lighter';
    c2.globalAlpha = 0.16 + Math.sin(this.t * 3) * 0.06;
    c2.fillStyle = '#ffeec0';
    c2.beginPath(); c2.arc(Math.round(this.x), Math.round(this.y + bob), 13, 0, TAU); c2.fill();
    c2.restore();
    blit(c2, Art.item.paper, this.x, this.y + bob, 8, 9, false, 1, 1, Math.sin(this.t * 1.4) * 0.08);
  }
}

class KeyItem {
  constructor(x, y) { this.x = x; this.y = y; this.t = 0; this.dead = false; }
  update(dt) {
    this.t += dt;
    const p = G.player;
    if (Math.hypot(p.cx - this.x, p.cy - this.y) < 14 && !p.dead) {
      this.dead = true; p.hasKey = true;
      Snd.keyGet(); G.flash(0.35);
      G.texts.push(new FloatText(this.x, this.y - 14, 'CAVE KEY!', '#ffe98a'));
      G.banner('THE CAVE KEY IS YOURS', 2.6);
      for (let i = 0; i < 30; i++) G.particles.push(new Particle({
        x: this.x, y: this.y, vx: rr(-3, 3), vy: rr(-3, 3), life: rr(0.4, 0.9),
        col: '#ffeaa0', col2: '#f5c53a', size: rr(1, 3), grav: 0.02, drag: 0.92
      }));
    }
  }
  draw(c2) {
    const bob = Math.sin(this.t * 2.6) * 2.4;
    c2.save();
    c2.globalAlpha = 0.28 + Math.sin(this.t * 4) * 0.12;
    c2.fillStyle = '#ffe98a';
    c2.beginPath(); c2.arc(this.x, this.y + bob, 13 + Math.sin(this.t * 3) * 2, 0, TAU); c2.fill();
    c2.restore();
    blit(c2, Art.item.key, this.x, this.y + bob, 8, 5);
  }
}
