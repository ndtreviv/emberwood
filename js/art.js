/* ============================================================
   art.js — every sprite, tile and backdrop in the game is
   generated here as pixel art. Nothing is loaded from disk.
   ============================================================ */
'use strict';

const Art = { hero: {}, top: {}, snake: {}, bear: {}, bat: {}, spider: {}, dragon: {},
              wisp: {}, sporeling: {}, zeus: {}, mother: {}, bird: {}, map: {},
              item: {}, tile: {}, prop: {}, bg: {}, ui: {} };

/* ---------- palettes ---------- */
const HP = {
  skin: C('#f2c692'), skinD: C('#cf9a63'), skinL: C('#ffe0b4'),
  hair: C('#7b4a26'), hairD: C('#53301a'), hairL: C('#a06a38'),
  tunic: C('#48a24f'), tunicD: C('#2e6c38'), tunicL: C('#71c96e'),
  belt: C('#7d4f25'), beltD: C('#513118'),
  legs: C('#dccdA6'), legsD: C('#b2a279'),
  boot: C('#6d4626'), bootD: C('#452b16'),
  scarf: C('#c9392b'), scarfD: C('#8f2820'),
  blade: C('#eaf1fa'), bladeD: C('#94a2b8'), bladeE: C('#ffffff'),
  hilt: C('#c68e3f'), hiltD: C('#8a5f26'),
  out: C('#21182b')
};

/* ---------- shared drawing helpers ---------- */
function limb(g, x0, y0, x1, y1, bend, t, col) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len;
  const kx = (x0 + x1) / 2 + px * bend, ky = (y0 + y1) / 2 + py * bend;
  g.thick(x0, y0, kx, ky, t, col);
  g.thick(kx, ky, x1, y1, t, col);
  return [kx, ky];
}
function drawSword(g, hx, hy, ang, len, pal) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx;
  /* grip */
  g.thick(hx - dx * 2, hy - dy * 2, hx + dx * 1, hy + dy * 1, 2, pal.hiltD);
  /* pommel */
  g.set(hx - dx * 3, hy - dy * 3, pal.hilt);
  /* cross guard */
  g.thick(hx + dx * 1.5 + px * 2.5, hy + dy * 1.5 + py * 2.5,
          hx + dx * 1.5 - px * 2.5, hy + dy * 1.5 - py * 2.5, 1, pal.hilt);
  /* blade */
  const bx = hx + dx * 3, by = hy + dy * 3;
  const tx = hx + dx * (3 + len), ty = hy + dy * (3 + len);
  g.thick(bx, by, tx, ty, 2, pal.bladeD);
  g.line(bx + px * 0.4, by + py * 0.4, tx + px * 0.4, ty + py * 0.4, pal.blade);
  g.set(tx, ty, pal.bladeE);
}

/* ============================================================
   HERO — side view.  Pose driven, so every animation shares one
   consistent body.  Canvas 30x30, feet anchor at (15, 23).
   ============================================================ */
const HERO_AX = 15, HERO_AY = 23;
const H_HEADT = 7, H_TORT = 13, H_TORB = 17, H_HIP = 18, H_FEET = 22;

function heroFrame(po) {
  const g = new Pix(30, 30);
  const OX = HERO_AX;
  const bob = po.bob || 0, lean = po.lean || 0;
  const torT = H_TORT + bob, torB = H_TORB + bob, hipY = H_HIP + bob, headT = H_HEADT + bob;
  const cx = OX + lean;

  const feet = po.feet || [[OX - 2, H_FEET], [OX + 2, H_FEET]];
  const hands = po.hands || [[OX - 5, torT + 4], [OX + 4, torT + 4]];
  const bend = po.bend || [2, -2];
  const abend = po.abend || [2, -2];

  /* --- back arm --- */
  const shB = [cx - 3, torT + 1];
  limb(g, shB[0], shB[1], hands[0][0], hands[0][1], abend[0], 2, HP.tunicD);
  g.disc(hands[0][0], hands[0][1], 1, HP.skinD);

  /* --- back leg --- */
  limb(g, cx - 2, hipY, feet[0][0], feet[0][1], bend[0], 3, HP.legsD);
  g.rect(feet[0][0] - 2, feet[0][1] - 1, 5, 2, HP.bootD);

  /* --- front leg --- */
  limb(g, cx + 2, hipY, feet[1][0], feet[1][1], bend[1], 3, HP.legs);
  g.rect(feet[1][0] - 2, feet[1][1] - 1, 5, 2, HP.boot);
  g.rect(feet[1][0] + 1, feet[1][1] - 1, 2, 1, HP.bootD);

  /* --- torso --- */
  g.rect(cx - 4, torT, 8, 2, HP.tunic);
  g.rect(cx - 4, torT + 2, 8, 1, HP.tunic);
  g.rect(cx - 3, torT + 3, 7, 1, HP.tunic);
  g.rect(cx - 3, torB, 6, 1, HP.belt);
  g.set(cx + 1, torB, HP.hilt);                       /* buckle */
  g.rect(cx - 4, torT, 3, 1, HP.tunicL);              /* shoulder light */
  g.rect(cx + 1, torT + 2, 3, 2, HP.tunicD);          /* fold shadow */

  /* --- head --- */
  g.rect(cx - 3, headT, 6, 1, HP.hair);
  g.rect(cx - 4, headT + 1, 8, 2, HP.hair);
  g.rect(cx - 4, headT + 3, 8, 3, HP.skin);
  g.rect(cx - 3, headT + 6, 6, 0, HP.skin);
  /* hair sides and fringe */
  g.rect(cx - 4, headT + 3, 1, 2, HP.hairD);
  g.rect(cx + 3, headT + 3, 1, 1, HP.hair);
  g.rect(cx - 2, headT + 3, 4, 1, HP.hairD);
  g.rect(cx - 3, headT, 2, 1, HP.hairL);
  g.set(cx - 5, headT + 3, HP.hairD);                 /* back tuft */
  g.set(cx - 5, headT + 4, HP.hair);
  g.set(cx + 2, headT, HP.hairD);
  /* face */
  if (po.blink) {
    g.set(cx, headT + 4, HP.skinD); g.set(cx + 2, headT + 4, HP.skinD);
  } else {
    g.set(cx, headT + 4, HP.out); g.set(cx + 2, headT + 4, HP.out);
    g.set(cx + 3, headT + 4, HP.skinL);
  }
  g.set(cx + 4, headT + 4, HP.skin);                  /* nose */
  g.set(cx + 1, headT + 5, HP.skinD);                 /* mouth */
  g.set(cx - 3, headT + 4, HP.skinD);                 /* ear */

  /* --- scarf --- */
  const fl = po.flutter || 0;
  g.rect(cx - 3, torT - 1, 7, 1, HP.scarf);
  g.set(cx + 3, torT - 1, HP.scarfD);
  g.thick(cx - 3, torT, cx - 5 - fl * 0.6, torT + 1 - fl * 0.5, 2, HP.scarf);
  g.thick(cx - 5 - fl * 0.6, torT + 1 - fl * 0.5, cx - 7 - fl, torT + 3 - fl * 0.9, 1, HP.scarfD);

  /* --- front arm + sword --- */
  const shF = [cx + 3, torT + 1];
  limb(g, shF[0], shF[1], hands[1][0], hands[1][1], abend[1], 2, HP.tunic);
  g.disc(hands[1][0], hands[1][1], 1, HP.skin);
  if (po.sword !== false) {
    drawSword(g, hands[1][0], hands[1][1], po.swordAng === undefined ? -Math.PI / 2.1 : po.swordAng,
              po.swordLen === undefined ? 8 : po.swordLen, HP);
  }

  g.shade({ top: 0.14, bot: 0.20, right: 0.09, left: 0.05 });
  g.outline(HP.out, false);
  return g;
}

/* ---------- pose builders ---------- */
function poseIdle(i) {
  const b = [0, 0, 0, -1, -1, -1, 0, 0][i % 8];
  const arm = [0, 0, 1, 1, 1, 0, 0, 0][i % 8];
  return {
    bob: b, blink: i === 6,
    feet: [[HERO_AX - 3, H_FEET], [HERO_AX + 3, H_FEET]],
    hands: [[HERO_AX - 5, H_TORT + 5 + b + arm], [HERO_AX + 5, H_TORT + 5 + b + arm]],
    bend: [1.5, -1.5], abend: [1.5, -1.5],
    swordAng: -Math.PI / 2 + 0.12 * arm, swordLen: 8,
    flutter: 0.6 + arm * 0.5
  };
}
function poseWalk(i) {
  const p = (i % 8) / 8 * TAU;
  const sw = Math.sin(p) * 4;
  const sw2 = Math.sin(p + Math.PI) * 4;
  const lift = Math.max(0, Math.cos(p)) * 2;
  const lift2 = Math.max(0, Math.cos(p + Math.PI)) * 2;
  const b = (i % 4 < 2) ? 0 : -1;
  return {
    bob: b,
    feet: [[HERO_AX - 2 + sw, H_FEET - lift], [HERO_AX + 2 + sw2, H_FEET - lift2]],
    hands: [[HERO_AX - 4 + sw2 * 0.7, H_TORT + 5 + b], [HERO_AX + 4 + sw * 0.7, H_TORT + 5 + b]],
    bend: [2, -2], abend: [2, -2],
    swordAng: -Math.PI / 2 - 0.15 + sw * 0.03, swordLen: 8,
    flutter: 1.4 + Math.sin(p) * 0.6
  };
}
function poseRun(i) {
  const p = (i % 8) / 8 * TAU;
  const sw = Math.sin(p) * 6;
  const sw2 = Math.sin(p + Math.PI) * 6;
  const lift = Math.max(0, Math.cos(p)) * 4;
  const lift2 = Math.max(0, Math.cos(p + Math.PI)) * 4;
  const b = (i % 4 < 2) ? -1 : -2;
  return {
    bob: b, lean: 1,
    feet: [[HERO_AX - 1 + sw, H_FEET - lift], [HERO_AX + 1 + sw2, H_FEET - lift2]],
    hands: [[HERO_AX - 4 + sw2 * 0.9, H_TORT + 4 + b], [HERO_AX + 5 + sw * 0.9, H_TORT + 4 + b]],
    bend: [3, -3], abend: [3, -3],
    swordAng: -Math.PI / 2 - 0.4, swordLen: 8,
    flutter: 3.2 + Math.sin(p) * 0.8
  };
}
function poseJump() {
  return {
    bob: -1, lean: 1,
    feet: [[HERO_AX - 4, H_FEET - 3], [HERO_AX + 3, H_FEET - 1]],
    hands: [[HERO_AX - 5, H_TORT + 1], [HERO_AX + 5, H_TORT + 1]],
    bend: [3, -1], abend: [2, -2],
    swordAng: -Math.PI / 2.6, swordLen: 8, flutter: 3.4
  };
}
function poseFall() {
  return {
    bob: 0, lean: 0,
    feet: [[HERO_AX - 4, H_FEET - 1], [HERO_AX + 4, H_FEET - 2]],
    hands: [[HERO_AX - 6, H_TORT + 2], [HERO_AX + 6, H_TORT + 3]],
    bend: [2, -2], abend: [3, -3],
    swordAng: -Math.PI / 3, swordLen: 8, flutter: 4.2
  };
}
function poseLand() {
  return {
    bob: 2,
    feet: [[HERO_AX - 4, H_FEET], [HERO_AX + 4, H_FEET]],
    hands: [[HERO_AX - 6, H_TORT + 7], [HERO_AX + 6, H_TORT + 7]],
    bend: [4, -4], abend: [1, -1],
    swordAng: -Math.PI / 6, swordLen: 8, flutter: 1
  };
}
/* swimming: the back arm strokes while the sword hand skims the surface */
function poseSwim(i) {
  const ph = i / 6 * TAU;
  const kick = Math.sin(ph) * 3.2;
  const pull = Math.sin(ph);
  return {
    bob: Math.round(Math.sin(ph) * 0.6),
    lean: 1,
    feet: [[HERO_AX - 5 + kick, H_FEET - 2], [HERO_AX - 3 - kick, H_FEET - 1]],
    hands: [[HERO_AX - 5 - pull * 2.2, H_TORT + 4 + pull * 1.4],
            [HERO_AX + 6, H_TORT + 1 - pull * 1.2]],
    bend: [3, -3], abend: [2.5, -2],
    swordAng: -0.5, swordLen: 8,
    flutter: 3 + pull
  };
}
/* treading water: both hands scull at the sides, legs cycle, the body bobs */
function poseSwimIdle(i) {
  const ph = i / 4 * TAU;
  const scull = Math.sin(ph) * 2.2;
  const cyc = Math.cos(ph) * 2.2;
  return {
    bob: Math.round(Math.sin(ph) * 1.3),
    lean: 0,
    feet: [[HERO_AX - 3 + cyc, H_FEET - 3 + Math.sin(ph) * 1.6],
           [HERO_AX + 3 - cyc, H_FEET - 3 - Math.sin(ph) * 1.6]],
    hands: [[HERO_AX - 6 - scull, H_TORT + 4], [HERO_AX + 6 + scull, H_TORT + 3]],
    bend: [3.2, -3.2], abend: [3, -3],
    swordAng: -Math.PI / 2 - 0.2, swordLen: 8,
    flutter: 1.2 + Math.abs(scull) * 0.5
  };
}
/* the air pierce: legs tucked back, both hands driving the blade straight down */
/* climbing: hands over hands on the rungs, sword slung out of the way */
function poseClimb(i) {
  const ph = i / 6 * TAU;
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    bob: Math.round(s * 0.8),
    lean: 0,
    feet: [[HERO_AX - 3, H_FEET - 2 - Math.max(0, s) * 4],
           [HERO_AX + 3, H_FEET - 2 - Math.max(0, -s) * 4]],
    hands: [[HERO_AX - 4, H_TORT - 3 - Math.max(0, -s) * 4],
            [HERO_AX + 4, H_TORT - 3 - Math.max(0, s) * 4]],
    bend: [2.4, -2.4], abend: [1.4, -1.4],
    swordAng: -2.5 + c * 0.1, swordLen: 8,
    flutter: 1 + Math.abs(s)
  };
}
function posePierce(i) {
  return {
    bob: -1, lean: 2,
    feet: [[HERO_AX - 6 - i, H_FEET - 5], [HERO_AX - 4, H_FEET - 3 - i]],
    hands: [[HERO_AX, H_TORT + 2], [HERO_AX + 1, H_TORT + 2]],
    bend: [3, -2], abend: [2, -2],
    swordAng: Math.PI / 2, swordLen: 11,
    flutter: 7 + i
  };
}
function poseDash(i) {
  return {
    bob: 1, lean: 2,
    feet: [[HERO_AX - 6 - i, H_FEET - 3], [HERO_AX - 2, H_FEET - 1 - i]],
    hands: [[HERO_AX - 6, H_TORT + 5], [HERO_AX + 6, H_TORT + 2]],
    bend: [3, -3], abend: [2, -3],
    swordAng: -0.35, swordLen: 8, flutter: 6 + i
  };
}
/* crouch: the body drops onto its heels, the blade held low and ready */
function poseCrouch(i) {
  const b = [4, 4, 5, 4][i % 4];
  return {
    bob: b, lean: 1,
    feet: [[HERO_AX - 4, H_FEET], [HERO_AX + 4, H_FEET]],
    hands: [[HERO_AX - 5, H_TORT + 7 + b], [HERO_AX + 5, H_TORT + 6 + b]],
    bend: [4.5, -4.5], abend: [1.6, -1.6],
    swordAng: -0.25, swordLen: 8, flutter: 0.8
  };
}
/* the flip cut: the body turns right over, the blade swung out wide */
function poseFlip(i) {
  const t = i / 4 * TAU;
  const sweep = Math.sin(t);
  return {
    bob: 3, lean: 0,
    feet: [[HERO_AX - 4 - sweep, H_FEET - 4], [HERO_AX + 4, H_FEET - 5 + sweep]],
    hands: [[HERO_AX - 4, H_TORT + 5], [HERO_AX + 5 + sweep, H_TORT + 3]],
    bend: [4, -4], abend: [3, -3],
    swordAng: -0.15 + sweep * 0.55, swordLen: 11,
    flutter: 7
  };
}
/* the roll cut: still tucked, the blade thrown out low and ahead */
function poseRollCut(i) {
  const t = i / 4 * TAU;
  const sweep = Math.sin(t);
  return {
    bob: 5, lean: 1,
    feet: [[HERO_AX - 3, H_FEET - 1], [HERO_AX + 3, H_FEET - 2]],
    hands: [[HERO_AX - 2, H_TORT + 8], [HERO_AX + 5, H_TORT + 7 - sweep]],
    bend: [5, -5], abend: [4, -4],
    swordAng: 0.4 + sweep * 0.35, swordLen: 10,
    flutter: 5
  };
}
/* the roll: knees and elbows tucked into a ball, spun by the draw code */
function poseRoll(i) {
  const t = i / 4 * TAU;
  const tuck = 1 + Math.sin(t) * 0.35;
  return {
    bob: 5, lean: 0, sword: false,
    feet: [[HERO_AX - 3 * tuck, H_FEET - 1], [HERO_AX + 3 * tuck, H_FEET - 2]],
    hands: [[HERO_AX - 3, H_TORT + 8], [HERO_AX + 3, H_TORT + 8]],
    bend: [5, -5], abend: [4, -4],
    flutter: 5
  };
}
/* attack: wind up over the head, then a wide downward arc */
const ATK_ANG = [-2.5, -2.9, -1.7, -0.45, 0.35, 0.15];
function poseAtk(i) {
  const a = ATK_ANG[i];
  const reach = i < 2 ? 4 : 7;
  const hy = H_TORT + (i < 2 ? 0 : (i < 4 ? 2 : 5));
  const lean = i < 2 ? -1 : (i < 4 ? 2 : 1);
  return {
    bob: i < 2 ? -1 : (i === 2 ? -1 : 0), lean: lean,
    feet: [[HERO_AX - 4, H_FEET], [HERO_AX + 4, H_FEET]],
    hands: [[HERO_AX - 5, H_TORT + 4], [HERO_AX + reach * Math.cos(a * 0.5 + 0.6), hy]],
    bend: [2, -3], abend: [2, -2],
    swordAng: a, swordLen: 9,
    flutter: 2 + i
  };
}

/* ============================================================
   HERO — top-down view for the maze.  You look at the top of
   the head: hair crown, shoulders, arms and the toes poking out.
   ============================================================ */
function heroTopFrame(dir, i, atkA) {
  /* dir: 0 down, 1 left, 2 up, 3 right.  atkA, when given, is the sword arm's
     angle offset for a swing frame. */
  const g = new Pix(26, 26);
  const cx = 13, cy = 13;
  const ang = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][dir];
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const px = -fy, py = fx;
  const attacking = atkA !== undefined && atkA !== null;
  const swing = attacking ? 0 : Math.sin(i / 4 * TAU) * 2.4;
  /* the body leans into the middle of a swing */
  const lunge = attacking ? Math.cos(atkA * 0.8) * 2.2 : 0;
  const bx = cx + fx * lunge, by = cy + fy * lunge;

  /* feet, poking out in the facing direction */
  const stance = attacking ? 3.2 : 2.4;
  g.disc(bx + fx * 5 + px * stance + px * swing * 0.3, by + fy * 5 + py * stance + py * swing * 0.3, 1.6, HP.bootD);
  g.disc(bx + fx * 5 - px * stance - px * swing * 0.3, by + fy * 5 - py * stance - py * swing * 0.3, 1.6, HP.boot);

  /* shoulders / tunic seen from above */
  g.ell(bx - fx * 0.6, by - fy * 0.6, 5.2, 5.2, HP.tunic);
  g.ell(bx - fx * 1.6, by - fy * 1.6, 4.0, 4.0, HP.tunicD);
  g.ell(bx + fx * 1.2, by + fy * 1.2, 3.4, 3.4, HP.tunicL);

  /* arms: on a swing the sword arm rides the arc and the other counterbalances */
  let ax1, ay1, ax2, ay2, swordAng;
  if (attacking) {
    const sa = ang + atkA;
    const oa = ang + atkA + Math.PI * 0.85;
    const reach = 6.2;
    ax1 = bx + Math.cos(sa) * reach; ay1 = by + Math.sin(sa) * reach;
    ax2 = bx + Math.cos(oa) * 4.4; ay2 = by + Math.sin(oa) * 4.4;
    swordAng = sa + 0.25;
  } else {
    ax1 = bx + px * 5 + fx * swing; ay1 = by + py * 5 + fy * swing;
    ax2 = bx - px * 5 - fx * swing; ay2 = by - py * 5 - fy * swing;
    swordAng = ang - 0.25;
  }
  g.disc(ax2, ay2, 1.8, HP.tunicD);
  g.disc(ax2 + fx, ay2 + fy, 1.2, HP.skinD);
  g.disc(ax1, ay1, 1.8, HP.tunic);
  g.disc(ax1 + fx * 0.4, ay1 + fy * 0.4, 1.2, HP.skin);
  drawSword(g, ax1 + fx * 0.4, ay1 + fy * 0.4, swordAng, attacking ? 8 : 7, HP);

  /* head — the crown of hair */
  g.disc(bx + fx * 0.8, by + fy * 0.8, 4.3, HP.hair);
  g.disc(bx + fx * 1.6, by + fy * 1.6, 2.6, HP.hairL);
  g.disc(bx + fx * 2.0 + px * 1.2, by + fy * 2.0 + py * 1.2, 1.1, HP.hairD);
  /* a hint of nose / brow at the front edge */
  g.set(bx + fx * 4.4, by + fy * 4.4, HP.skin);
  g.set(bx + fx * 4.0 + px * 1.6, by + fy * 4.0 + py * 1.6, HP.skinD);
  g.set(bx + fx * 4.0 - px * 1.6, by + fy * 4.0 - py * 1.6, HP.skinD);

  g.shade({ top: 0.15, bot: 0.18, right: 0.10, left: 0.06 });
  g.outline(HP.out, false);
  return g;
}
/* the sweep of a top-down swing, front to back across the facing arc */
const ATK_TOP = [-1.95, -1.30, -0.20, 0.85, 1.45];

/* ============================================================
   ENEMIES
   ============================================================ */
const SNP = { body: C('#4e8c3c'), dark: C('#2f5c26'), band: C('#3a6f2c'),
              belly: C('#9ccf62'), eye: C('#ffd23f'), tongue: C('#e0403a'), out: C('#1b2a16') };

function snakeFrame(i, n) {
  const g = new Pix(32, 18);
  const ph = i / n * TAU;
  const baseY = 13;
  for (let x = 3; x <= 26; x++) {
    const t = (x - 3) / 23;
    const wob = Math.sin(ph + t * TAU * 1.25) * (1.0 + t * 1.6);
    const y = baseY - 1.5 - wob * 0.55 - t * 1.2;
    const r = 0.9 + t * 1.9;
    const band = (Math.floor(x / 3) % 2 === 0);
    g.disc(x, y, r, band ? SNP.band : SNP.body);
    g.disc(x, y + r * 0.55, Math.max(0.5, r - 1.1), SNP.belly);
  }
  const hy = baseY - 2.7 - Math.sin(ph + TAU * 1.25) * 1.6 - 1.2;
  g.ell(27, hy, 3.6, 2.9, SNP.body);
  g.ell(28.6, hy + 0.6, 2.2, 1.6, SNP.band);
  g.set(28, hy - 1, SNP.eye); g.set(29, hy - 1, SNP.eye);
  g.set(28, hy - 1, SNP.out);
  g.set(29, hy - 1.1, SNP.eye);
  if (i % n < n / 2) {
    g.line(31, hy + 1, 29.5, hy + 0.6, SNP.tongue);
    g.set(31, hy, SNP.tongue); g.set(31, hy + 2, SNP.tongue);
  }
  g.shade({ top: 0.16, bot: 0.20 });
  g.outline(SNP.out);
  return g;
}

const BRP = { fur: C('#6d4a2e'), furD: C('#472f1c'), furL: C('#8a6039'),
              snout: C('#b08a5c'), claw: C('#efe6d2'), eye: C('#ffcf5a'),
              mouth: C('#8c2f2f'), out: C('#1e1410') };

function bearFrame(mode, i, n) {
  const g = new Pix(46, 34);
  const gy = 30;
  const p = i / n * TAU;
  const speed = mode === 'charge' ? 7 : 4;
  const bodyY = 18 + (mode === 'roar' ? -1 : Math.sin(p * 2) * 0.8);
  const lean = mode === 'charge' ? 2 : 0;

  for (let s = 0; s < 2; s++) {
    const off = s * Math.PI;
    const fx = 14 + lean + Math.sin(p + off) * speed;
    const fy = gy - Math.max(0, Math.cos(p + off)) * (mode === 'charge' ? 5 : 3);
    limb(g, 15 + lean, bodyY + 3, fx, fy, 3, 5, s ? BRP.furD : BRP.fur);
    g.ell(fx, fy - 0.5, 3.2, 2.0, s ? BRP.furD : BRP.fur);
    g.set(fx + 2, fy, BRP.claw); g.set(fx - 2, fy, BRP.claw);
  }
  for (let s = 0; s < 2; s++) {
    const off = s * Math.PI + Math.PI / 2;
    const fx = 29 + lean + Math.sin(p + off) * speed;
    const fy = gy - Math.max(0, Math.cos(p + off)) * (mode === 'charge' ? 5 : 3);
    limb(g, 28 + lean, bodyY + 3, fx, fy, 3, 5, s ? BRP.furD : BRP.fur);
    g.ell(fx, fy - 0.5, 3.2, 2.0, s ? BRP.furD : BRP.fur);
    g.set(fx + 2, fy, BRP.claw); g.set(fx - 2, fy, BRP.claw);
  }
  g.disc(9 + lean, bodyY + 1, 2.2, BRP.furD);
  g.ell(22 + lean, bodyY, 12.5, 7.5, BRP.fur);
  g.ell(20 + lean, bodyY - 3, 9.0, 3.6, BRP.furL);
  g.ell(24 + lean, bodyY + 3.5, 9.5, 3.2, BRP.furD);
  const rr2 = new RNG(77);
  for (let k = 0; k < 46; k++) {
    const a = rr2.r(0, TAU), rad = rr2.r(0, 1);
    const x = 22 + lean + Math.cos(a) * 12 * rad, y = bodyY + Math.sin(a) * 7 * rad;
    if (g.alphaAt(x, y) > 200) g.set(x, y, rr2.bool() ? BRP.furD : BRP.furL);
  }
  const hx = 35 + lean, hy = bodyY - (mode === 'roar' ? 8 : (mode === 'charge' ? 2 : 5));
  g.disc(hx, hy, 5.6, BRP.fur);
  g.disc(hx - 3.5, hy - 4.6, 2.2, BRP.furD);
  g.disc(hx + 1.5, hy - 5.4, 2.2, BRP.fur);
  g.disc(hx - 3.5, hy - 4.6, 1.1, BRP.snout);
  g.disc(hx + 1.5, hy - 5.4, 1.1, BRP.snout);
  g.ell(hx + 4.6, hy + 1.4, 3.6, 2.6, BRP.snout);
  g.disc(hx + 7.4, hy + 0.6, 1.3, BRP.out);
  if (mode === 'roar') {
    g.ell(hx + 5.2, hy + 3.2, 2.6, 1.9, BRP.mouth);
    g.set(hx + 4, hy + 2, BRP.claw); g.set(hx + 6.6, hy + 2, BRP.claw);
  }
  g.set(hx + 2.4, hy - 1.4, BRP.eye);
  g.set(hx + 2.4, hy - 1.4, BRP.out);
  g.set(hx + 3.0, hy - 1.8, BRP.eye);
  g.shade({ top: 0.14, bot: 0.20, right: 0.08 });
  g.outline(BRP.out);
  return g;
}

const BTP = { body: C('#5b4a6e'), dark: C('#372c46'), wing: C('#7a6490'),
              wingD: C('#4a3b60'), eye: C('#ff5c4d'), out: C('#1a1424') };

function batFrame(i, n) {
  const g = new Pix(28, 20);
  const cx = 14, cy = 11;
  const f = Math.sin(i / n * TAU);
  const up = f * 5;
  for (const s of [-1, 1]) {
    const pts = [
      [cx + s * 2, cy - 1],
      [cx + s * 7, cy - 3 - up],
      [cx + s * 12, cy - 1 - up * 1.3],
      [cx + s * 11, cy + 2 - up * 0.5],
      [cx + s * 8, cy + 1 - up * 0.3],
      [cx + s * 6, cy + 3 - up * 0.2],
      [cx + s * 3, cy + 2]
    ];
    g.poly(pts, s < 0 ? BTP.wingD : BTP.wing);
    g.line(cx + s * 2, cy - 1, cx + s * 12, cy - 1 - up * 1.3, BTP.dark);
    g.line(cx + s * 2, cy - 1, cx + s * 8, cy + 1 - up * 0.3, BTP.dark);
  }
  g.ell(cx, cy, 2.8, 3.4, BTP.body);
  g.ell(cx, cy + 1.5, 1.8, 1.8, BTP.dark);
  g.poly([[cx - 2.5, cy - 2.5], [cx - 3.5, cy - 6], [cx - 0.8, cy - 3]], BTP.body);
  g.poly([[cx + 2.5, cy - 2.5], [cx + 3.5, cy - 6], [cx + 0.8, cy - 3]], BTP.body);
  g.set(cx - 1, cy - 1, BTP.eye); g.set(cx + 1, cy - 1, BTP.eye);
  g.set(cx - 1, cy + 4, BTP.dark); g.set(cx + 1, cy + 4, BTP.dark);
  g.shade({ top: 0.12, bot: 0.16 });
  g.outline(BTP.out);
  return g;
}

/* ---------- storm bird ---------- */
const BDP = { body: C('#41506b'), bodyD: C('#26314a'), bodyL: C('#6d7f9e'),
              belly: C('#e6edf6'), beak: C('#f0c93a'), beakD: C('#a8791f'),
              eye: C('#1a1024'), out: C('#151d2e') };
function birdFrame(mode, i, n) {
  const g = new Pix(26, 20);
  const cx = 13, cy = 10;
  const f = Math.sin(i / n * TAU);
  const dive = mode === 'dive';
  const lean = dive ? 2 : 0;

  /* tail */
  g.poly([[cx - 5 + lean, cy], [cx - 12 + lean, cy - 3 - (dive ? 1 : f)], [cx - 12 + lean, cy + 3], [cx - 5 + lean, cy + 2]], BDP.bodyD);
  /* wings: spread when gliding, swept back on a dive */
  for (const s of [-1, 1]) {
    if (dive) {
      g.poly([[cx - 1, cy - 1 + s], [cx - 9, cy - 5 * s - 1], [cx - 11, cy - 2 * s], [cx - 2, cy + 2 * s]],
             s < 0 ? BDP.bodyD : BDP.body);
    } else {
      const up = f * 6 * s;
      g.poly([[cx - 1, cy - 1], [cx - 6, cy - 6 + up], [cx - 13, cy - 4 + up * 1.3], [cx - 9, cy + 1 + up * 0.4], [cx - 2, cy + 2]],
             s < 0 ? BDP.bodyD : BDP.body);
      g.line(cx - 1, cy - 1, cx - 13, cy - 4 + up * 1.3, BDP.bodyL);
    }
  }
  /* body */
  g.ell(cx, cy, 5.4, 3.6, BDP.body);
  g.ell(cx + 0.5, cy + 1.6, 4.4, 2.2, BDP.belly);
  g.ell(cx - 1.5, cy - 1.6, 3.4, 1.8, BDP.bodyL);
  /* head and beak */
  g.disc(cx + 5, cy - 1.5, 3, BDP.body);
  g.disc(cx + 5, cy - 0.4, 1.8, BDP.belly);
  g.poly([[cx + 7.5, cy - 2.4], [cx + 13 + (dive ? 2 : 0), cy - 0.6], [cx + 7.5, cy + 0.6]], BDP.beak);
  g.line(cx + 7.5, cy - 0.9, cx + 12 + (dive ? 2 : 0), cy - 0.7, BDP.beakD);
  g.set(cx + 5.4, cy - 2.2, BDP.eye);
  g.set(cx + 6, cy - 2.6, C('#ffffff'));
  /* feet tucked up */
  g.set(cx - 1, cy + 3.6, BDP.beakD); g.set(cx + 1, cy + 3.6, BDP.beakD);
  g.shade({ top: 0.15, bot: 0.18 });
  g.outline(BDP.out);
  return g;
}

const SPP = { body: C('#332a44'), bodyD: C('#1e1830'), bodyL: C('#4d4067'),
              leg: C('#241d34'), mark: C('#c9403a'), eye: C('#ff5c4d'),
              fang: C('#e8dcc0'), silk: C('#cfd6e4'), out: C('#150f22') };

function spiderFrame(i, n, mode) {
  const g = new Pix(28, 24);
  const cx = 14, cy = 11;
  const ph = i / n * TAU;
  const hang = mode === 'hang';
  for (let s = 0; s < 4; s++) {
    for (const side of [-1, 1]) {
      const lp = ph + s * 0.7 + (side < 0 ? Math.PI * 0.5 : 0);
      const swing = Math.sin(lp);
      const baseX = cx + (s - 1.5) * 1.9;
      const reach = 6.5 + s * 0.7;
      const kneeX = baseX + side * reach * 0.55;
      const kneeY = cy - 5.5 - Math.abs(swing) * (hang ? 0.6 : 1.6);
      const footX = baseX + side * reach * (hang ? 0.75 : 1.05 + swing * 0.12);
      const footY = hang ? cy - 1 + Math.abs(swing) * 1.2 : cy + 8 - Math.max(0, swing) * 2.6;
      g.thick(baseX, cy, kneeX, kneeY, 1, SPP.leg);
      g.thick(kneeX, kneeY, footX, footY, 1, side < 0 ? SPP.leg : SPP.bodyD);
    }
  }
  g.ell(cx - 4, cy + 0.5, 5.4, 4.8, SPP.body);
  g.ell(cx - 5, cy - 1, 3.4, 2.6, SPP.bodyL);
  g.ell(cx - 3.5, cy + 1, 2.6, 2.2, SPP.mark);
  g.set(cx - 3.5, cy - 1, SPP.mark);
  g.ell(cx + 3, cy + 0.5, 3.2, 2.9, SPP.body);
  g.ell(cx + 2.6, cy - 0.6, 2.2, 1.6, SPP.bodyL);
  g.set(cx + 5, cy - 1, SPP.eye); g.set(cx + 6, cy - 1, SPP.eye);
  g.set(cx + 5, cy + 1, SPP.eye); g.set(cx + 6.4, cy + 0.4, SPP.eye);
  g.set(cx + 6, cy + 2.6, SPP.fang); g.set(cx + 5, cy + 3, SPP.fang);
  g.shade({ top: 0.15, bot: 0.18 });
  g.outline(SPP.out);
  return g;
}

function arrowSprite() {
  const g = new Pix(22, 22), r = new RNG(4242);
  const c = C('#f0c93a'), cl = C('#fff0b8'), cd = C('#a8791f');
  g.rect(2, 9, 11, 4, c);
  g.poly([[11, 3], [20, 11], [11, 19]], c);
  g.rect(2, 9, 11, 1, cl);
  g.poly([[11, 3], [17, 8.5], [11, 9]], cl);
  g.rect(2, 12, 11, 1, cd);
  for (let k = 0; k < 46; k++) {
    const x = r.i(1, 20), y = r.i(2, 19);
    if (g.alphaAt(x, y) > 200 && r.bool(0.5)) g.set(x, y, [0, 0, 0, 0]);
  }
  for (let k = 0; k < 10; k++) g.set(r.i(2, 19), r.i(3, 18), cd);
  g.outline(C('#4a3208'));
  return g;
}

const MNP = { beam: C('#7a5230'), beamD: C('#4e3320'), beamL: C('#9c6c41'),
              iron: C('#6b7382'), ironD: C('#454c58'), rail: C('#8a94a6') };

function supportSprite(h) {
  const g = new Pix(44, h);
  g.rect(2, 6, 6, h - 6, MNP.beam);
  g.rect(36, 6, 6, h - 6, MNP.beam);
  g.rect(2, 6, 2, h - 6, MNP.beamL);
  g.rect(40, 6, 2, h - 6, MNP.beamD);
  g.rect(0, 0, 44, 7, MNP.beam);
  g.rect(0, 0, 44, 2, MNP.beamL);
  g.rect(0, 5, 44, 2, MNP.beamD);
  g.poly([[8, 7], [8, 15], [16, 7]], MNP.beam);
  g.poly([[36, 7], [36, 15], [28, 7]], MNP.beam);
  const r = new RNG(31);
  for (let k = 0; k < 40; k++) {
    const x = r.i(0, 43), y = r.i(0, h - 1);
    if (g.alphaAt(x, y) > 200) g.set(x, y, r.bool() ? MNP.beamD : MNP.beamL);
  }
  for (const [x, y] of [[4, 3], [39, 3], [4, h - 4], [39, h - 4]]) g.rect(x, y, 2, 2, MNP.ironD);
  g.shade({ top: 0.12, bot: 0.16 });
  g.outline(C('#1d1410'));
  return g;
}
function railSprite() {
  const g = new Pix(16, 7);
  for (let k = 0; k < 2; k++) g.rect(k * 8 + 1, 3, 6, 2, MNP.beamD);
  g.rect(0, 1, 16, 1, MNP.rail);
  g.rect(0, 5, 16, 1, MNP.iron);
  g.rect(0, 2, 16, 1, MNP.ironD);
  return g;
}
function cartSprite() {
  const g = new Pix(28, 22);
  g.rect(3, 4, 22, 11, MNP.beam);
  g.rect(3, 4, 22, 2, MNP.beamL);
  g.rect(3, 13, 22, 2, MNP.beamD);
  g.rect(2, 6, 2, 9, MNP.ironD);
  g.rect(24, 6, 2, 9, MNP.ironD);
  for (let k = 0; k < 5; k++) g.rect(5 + k * 4, 5, 1, 10, MNP.beamD);
  const r = new RNG(88);
  for (let k = 0; k < 16; k++) g.disc(6 + r.r(0, 16), 4 + r.r(-2, 1), r.r(1.2, 2.4), r.bool(0.4) ? C('#f0c93a') : C('#6b7382'));
  for (const wx of [8, 20]) { g.disc(wx, 17, 3.4, MNP.ironD); g.disc(wx, 17, 1.4, MNP.iron); }
  g.rect(2, 19, 24, 1, MNP.ironD);
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(C('#191014'));
  return g;
}
function lanternSprite() {
  const g = new Pix(12, 18);
  g.rect(5, 0, 2, 4, MNP.ironD);
  g.rect(2, 3, 8, 2, MNP.iron);
  g.rect(2, 4, 8, 9, C('#3a3140'));
  g.rect(3, 5, 6, 7, C('#ffdf7a'));
  g.rect(2, 12, 8, 3, MNP.iron);
  g.rect(2, 4, 1, 9, MNP.ironD);
  g.rect(9, 4, 1, 9, MNP.ironD);
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#151020'));
  return g;
}
function oreSprite(col) {
  const g = new Pix(18, 14), r = new RNG(51), c = C(col);
  g.ell(9, 8, 7.5, 5.5, TP.rockD);
  g.ell(8, 6.5, 5.5, 3.5, TP.rock);
  for (let k = 0; k < 7; k++) {
    const x = 4 + r.r(0, 10), y = 4 + r.r(0, 7);
    g.disc(x, y, r.r(1, 1.9), c);
    g.set(x - 1, y - 1, sh(c, 0.4));
  }
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(C('#1d1d2c'));
  return g;
}

/* ---------- the dragon ---------- */
const DRP = {
  scale: C('#9b3230'), scaleD: C('#5f1c1e'), scaleL: C('#c14a3c'),
  belly: C('#e0a94a'), bellyD: C('#b07f2c'),
  wing: C('#7d2b2c'), wingD: C('#4a181b'), memb: C('#b1544a'),
  horn: C('#efe2c2'), hornD: C('#bfae8a'),
  eye: C('#ffe14d'), fire: C('#ffb638'), out: C('#170d14')
};
const DR_W = 118, DR_H = 84, DR_AX = 59, DR_AY = 78;

function dragonFrame(i, n, mode) {
  const g = new Pix(DR_W, DR_H);
  const r = new RNG(4242);
  const f = Math.sin(i / n * TAU);
  const bodyY = 46 + (mode === 'fly' ? f * 3 : 0);
  const bx = 52;

  /* --- far wing, sitting behind the spine --- */
  drawWing(g, bx - 2, bodyY - 4, 0.82, f, DRP.wingD, sh(DRP.wingD, -0.12));

  /* --- tail: tapering coils, ridged, with a spade at the tip --- */
  const tailPts = [];
  for (let k = 0; k < 17; k++) {
    const t = k / 16;
    const px2 = bx - 16 - k * 2.4;
    const py2 = bodyY + 2 + Math.sin(i / n * TAU + k * 0.42) * (1.2 + t * 3.4) + t * 2;
    tailPts.push([px2, py2, t]);
    g.disc(px2, py2, 4.6 * (1 - t * 0.86) + 0.6, t > 0.5 ? DRP.scaleD : DRP.scale);
    /* belly side catches the light */
    g.disc(px2 + 0.6, py2 + 1.4, Math.max(0.5, 2.6 * (1 - t)), t > 0.6 ? DRP.bellyD : DRP.belly);
    if (k % 3 === 0 && t < 0.85)
      g.poly([[px2, py2 - 4 * (1 - t)], [px2 - 2, py2 - 8.5 * (1 - t)], [px2 + 2, py2 - 7 * (1 - t)]], DRP.horn);
  }
  /* the tail spade */
  {
    const e2 = tailPts[tailPts.length - 1];
    g.poly([[e2[0] + 2, e2[1]], [e2[0] - 7, e2[1] - 7], [e2[0] - 4, e2[1]], [e2[0] - 7, e2[1] + 6]], DRP.memb);
    g.line(e2[0] + 1, e2[1], e2[0] - 6, e2[1] - 6, DRP.horn);
    g.line(e2[0] + 1, e2[1], e2[0] - 6, e2[1] + 5, DRP.horn);
  }

  /* --- hind legs: thigh, shin, three claws --- */
  const legPh = mode === 'fly' ? f * 0.6 : 0;
  for (const s of [0, 1]) {
    const ox = bx - 8 + s * 4, gy = mode === 'fly' ? bodyY + 22 + s * 2 : DR_AY;
    const col = s ? DRP.scaleD : DRP.scale;
    g.ell(ox - 1, bodyY + 7, 7 - s, 6 - s, col);              /* haunch */
    limb(g, ox, bodyY + 8, ox - 4 + legPh * 3, gy, 5, 8, col);
    g.ell(ox - 5 + legPh * 3, gy - 1, 5, 2.6, col);
    for (let c = 0; c < 3; c++) {
      const cx2 = ox - 9 + c * 2.6 + legPh * 3;
      g.poly([[cx2, gy - 2], [cx2 - 2, gy + 1], [cx2 + 1, gy]], DRP.horn);
    }
    g.set(ox - 2, bodyY + 6, DRP.scaleL);
  }

  /* --- body: scaled hide over plated belly --- */
  g.ell(bx, bodyY, 20, 13, DRP.scale);
  g.ell(bx - 4, bodyY - 5, 14, 6, DRP.scaleL);
  g.ell(bx + 2, bodyY + 6, 15, 5, DRP.belly);
  /* overlapping belly plates */
  for (let k = -3; k <= 3; k++) {
    g.rect(bx + k * 4 - 1, bodyY + 3, 3, 7, k % 2 ? DRP.belly : DRP.bellyD);
    g.set(bx + k * 4 - 1, bodyY + 3, sh(DRP.belly, 0.3));
  }
  /* scale texture: rows of little crescents across the flank */
  for (let row = -2; row <= 2; row++) {
    for (let col = -4; col <= 4; col++) {
      const sx2 = bx + col * 4 + (row % 2 ? 2 : 0);
      const sy2 = bodyY - 6 + row * 3.4;
      if (Math.hypot((sx2 - bx) / 19, (sy2 - bodyY) / 12) > 0.92) continue;
      if (sy2 > bodyY + 2) continue;
      g.set(sx2, sy2, r.bool(0.5) ? DRP.scaleD : DRP.scaleL);
      g.set(sx2 + 1, sy2, DRP.scaleD);
    }
  }
  /* shoulder muscle */
  g.ell(bx + 9, bodyY - 2, 6, 5, DRP.scaleL);
  g.ell(bx + 10, bodyY - 1, 4, 3, DRP.scale);
  /* dorsal ridge: paired spines, longer over the shoulders */
  for (let k = 0; k < 8; k++) {
    const sx2 = bx - 16 + k * 4.6;
    const hgt = 5 + Math.sin(k / 7 * Math.PI) * 4;
    g.poly([[sx2 - 2, bodyY - 10], [sx2, bodyY - 10 - hgt], [sx2 + 2, bodyY - 10]], DRP.horn);
    g.line(sx2, bodyY - 10 - hgt, sx2, bodyY - 10, DRP.hornD);
  }

  /* --- fore legs --- */
  for (const s of [0, 1]) {
    const ox = bx + 12 + s * 3, gy = mode === 'fly' ? bodyY + 20 + s * 2 : DR_AY;
    const col = s ? DRP.scaleD : DRP.scale;
    limb(g, ox, bodyY + 6, ox + 3 - legPh * 3, gy, -4, 6, col);
    g.ell(ox + 4 - legPh * 3, gy - 1, 4, 2.2, col);
    for (let c = 0; c < 3; c++) {
      const cx2 = ox + 6 + c * 2.2 - legPh * 3;
      g.poly([[cx2, gy - 2], [cx2 + 2, gy + 1], [cx2 - 1, gy]], DRP.horn);
    }
  }

  /* --- neck: plated underside, ridged crest --- */
  const headUp = mode === 'breathe' ? 4 : 0;
  const nx0 = bx + 16, ny0 = bodyY - 6;
  const nx1 = 92, ny1 = 20 - headUp;
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const x = lerp(nx0, nx1, t) + Math.sin(t * 2.2) * 3;
    const y = lerp(ny0, ny1, t) - Math.sin(t * Math.PI) * 6;
    const rad = 7.5 - t * 3.4;
    g.disc(x, y, rad, DRP.scale);
    g.disc(x - rad * 0.3, y - rad * 0.3, rad * 0.55, DRP.scaleL);
    /* throat rings */
    g.disc(x + 1.5, y + 2, 4.2 - t * 2.2, DRP.belly);
    if (k % 2 === 0) g.line(x + 0.5, y + 3.6 - t * 1.6, x + 3, y + 2.6 - t * 1.4, DRP.bellyD);
    if (k % 2 === 0) {
      const hgt = 9 - t * 4;
      g.poly([[x - 2, y - rad + 1], [x, y - rad - hgt * 0.5], [x + 2, y - rad + 1]], DRP.horn);
    }
  }

  /* --- head --- */
  const hx = 96, hy = 18 - headUp;
  g.ell(hx, hy, 8.5, 6, DRP.scale);
  g.ell(hx - 1, hy - 2, 6, 3, DRP.scaleL);
  g.ell(hx + 6, hy + 1.5, 6.5, 3.6, DRP.scale);              /* snout */
  g.ell(hx + 6, hy + 3.0, 6.0, 1.8, DRP.scaleD);
  g.ell(hx + 7, hy + 0.4, 4, 1.6, DRP.scaleL);
  /* cheek scales */
  for (let k = 0; k < 4; k++) g.set(hx - 3 + k * 2, hy + 3 + (k % 2), DRP.scaleD);
  /* jaw */
  const open = mode === 'breathe' ? 5 : (mode === 'roar' ? 4 : 1);
  g.ell(hx + 5, hy + 3 + open, 6.0, 2.2, DRP.scaleD);
  g.ell(hx + 5, hy + 3.6 + open, 5.0, 1.2, DRP.bellyD);
  if (open > 2) {
    g.ell(hx + 5, hy + 2 + open * 0.6, 5.4, open * 0.6, C('#3d0f12'));
    g.ell(hx + 4, hy + 2 + open * 0.6, 3.2, open * 0.35, C('#7a1d20'));
  }
  /* teeth, whether the jaw is open or shut */
  for (let k = 0; k < 5; k++) {
    const tx2 = hx + 0.5 + k * 2.6;
    g.poly([[tx2, hy + 4.2], [tx2 + 1, hy + 6.6], [tx2 + 2, hy + 4.2]], DRP.horn);
    if (open > 2) g.poly([[tx2, hy + 2.4 + open], [tx2 + 1, hy + open], [tx2 + 2, hy + 2.4 + open]], DRP.horn);
  }
  /* horns: a heavy pair with ridges, and a slimmer second pair */
  g.thick(hx - 3, hy - 4, hx - 12, hy - 11, 3, DRP.horn);
  g.thick(hx - 12, hy - 11, hx - 18, hy - 9, 2, DRP.hornD);
  for (let k = 0; k < 4; k++) g.set(hx - 5 - k * 2.4, hy - 5.5 - k * 1.7, DRP.hornD);
  g.thick(hx - 1, hy - 5, hx - 8, hy - 15, 2, DRP.hornD);
  g.thick(hx - 8, hy - 15, hx - 12, hy - 17, 1, DRP.horn);
  /* jaw spikes */
  for (let k = 0; k < 3; k++) g.poly([[hx - 2 + k * 2, hy + 6], [hx - 3 + k * 2, hy + 9], [hx, hy + 6]], DRP.hornD);
  /* brow and eye with a slit pupil */
  g.ell(hx + 1, hy - 2.4, 3.8, 2.2, DRP.scaleL);
  g.line(hx - 2, hy - 4, hx + 4, hy - 3, DRP.scaleD);
  g.ell(hx + 2.4, hy - 1, 2.4, 1.8, DRP.eye);
  g.rect(hx + 2.4, hy - 2.2, 1, 3, DRP.out);
  g.set(hx + 1.4, hy - 1.8, C('#ffffff'));
  /* nostril */
  g.set(hx + 10, hy + 0.6, DRP.out);
  g.set(hx + 10, hy - 0.2, DRP.scaleD);

  /* --- near wing, over the shoulder --- */
  drawWing(g, bx + 6, bodyY - 11, 1, f, DRP.wing, DRP.memb);

  g.shade({ top: 0.13, bot: 0.19, right: 0.08 });
  g.outline(DRP.out);
  return g;
}
/* Both wings sweep back over the spine; `sc` only sets how far the far one
   sits behind the near one. */
function drawWing(g, ox, oy, sc, f, boneCol, membCol) {
  const spread = 1.0 + f * 0.30;
  const rise = -f * 14;
  const tips = [
    [ox - 5 * sc, oy - 30 * spread * sc + rise],
    [ox - 22 * sc, oy - 33 * spread * sc + rise * 0.8],
    [ox - 37 * sc, oy - 19 * spread * sc + rise * 0.5],
    [ox - 43 * sc, oy - 1 + rise * 0.2],
    [ox - 34 * sc, oy + 11]
  ];
  const pts = [[ox, oy]];
  for (const t of tips) pts.push(t);
  pts.push([ox - 10 * sc, oy + 7]);
  g.poly(pts, membCol);
  /* the membrane is thinner between the fingers */
  const lite = sh(membCol, 0.16), dark = sh(membCol, -0.18);
  for (let k = 0; k + 1 < tips.length; k++) {
    const a = tips[k], b = tips[k + 1];
    for (let s = 1; s < 5; s++) {
      const t = s / 5;
      const mx = lerp(a[0], b[0], t), my = lerp(a[1], b[1], t);
      g.line(lerp(ox, mx, 0.45), lerp(oy, my, 0.45), mx, my, s % 2 ? lite : dark);
    }
  }
  /* the scalloped trailing edge */
  for (let k = 0; k + 1 < tips.length; k++) {
    const a = tips[k], b = tips[k + 1];
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const x0 = lerp(a[0], b[0], t0), y0 = lerp(a[1], b[1], t0);
      const x1 = lerp(a[0], b[0], t1), y1 = lerp(a[1], b[1], t1);
      const mx = (x0 + x1) / 2 + (x1 - x0) * 0.06;
      const my = (y0 + y1) / 2 + 2.2;
      g.line(x0, y0, mx, my, boneCol);
      g.line(mx, my, x1, y1, boneCol);
    }
  }
  /* finger bones, thicker at the shoulder */
  tips.forEach((t, k) => {
    g.thick(ox, oy, t[0], t[1], k < 2 ? 3 : 2, boneCol);
    g.line(ox, oy, t[0], t[1], sh(boneCol, 0.22));
    /* a knuckle part way along */
    g.disc(lerp(ox, t[0], 0.55), lerp(oy, t[1], 0.55), 1.4, sh(boneCol, -0.2));
  });
  /* shoulder joint */
  g.disc(ox, oy, 3.4, boneCol);
  g.disc(ox - 1, oy - 1, 1.8, sh(boneCol, 0.25));
  /* claws on the leading fingers */
  for (const k of [0, 1]) {
    const t = tips[k];
    g.poly([[t[0], t[1]], [t[0] - 3 * sc, t[1] - 5], [t[0] + 2 * sc, t[1] - 2]], DRP.horn);
  }
}

/* ============================================================
   ITEMS, PICKUPS, ICONS
   ============================================================ */
const GOLD = C('#f5c53a'), GOLDD = C('#b8811b'), GOLDL = C('#ffeaa0');

function coinFrame(i, n) {
  const g = new Pix(14, 14);
  const t = i / n * TAU;
  const w = Math.abs(Math.cos(t)) * 4.4 + 0.7;
  g.ell(7, 7, w, 5.0, GOLDD);
  g.ell(7, 7, Math.max(0.4, w - 1.0), 4.0, GOLD);
  if (w > 2.2) {
    g.ell(7, 7, Math.max(0.4, w - 2.6), 2.4, GOLDL);
    g.set(6, 5, C('#ffffff'));
  }
  g.shade({ top: 0.20, bot: 0.22 });
  g.outline(C('#4b2f08'));
  return g;
}
function heartSprite(state) {
  const g = new Pix(13, 12);
  const base = state === 'empty' ? C('#4a2d3a') : C('#e8433f');
  const lite = state === 'empty' ? C('#5d3a49') : C('#ff8b7a');
  const drawHalf = (from, to, col, colL) => {
    for (let x = from; x <= to; x++) for (let y = 1; y <= 10; y++) {
      const inTop = (Math.hypot(x - 3.6, y - 3.6) <= 2.9) || (Math.hypot(x - 8.4, y - 3.6) <= 2.9);
      const inBot = Math.abs(x - 6) / 5.6 + Math.max(0, (y - 3.4) / 6.6) <= 1 && y >= 3;
      if (inTop || inBot) g.set(x, y, col);
    }
    g.set(from + 1, 3, colL); g.set(from + 2, 2, colL);
  };
  if (state === 'half') {
    drawHalf(0, 6, base, lite);
    drawHalf(7, 12, C('#4a2d3a'), C('#5d3a49'));
  } else drawHalf(0, 12, base, lite);
  g.shade({ top: 0.18, bot: 0.20 });
  g.outline(C('#25121c'));
  return g;
}
function keySprite() {
  const g = new Pix(16, 10);
  g.ell(4, 5, 3.2, 3.2, GOLD);
  g.ell(4, 5, 1.4, 1.4, [0, 0, 0, 0]);
  g.rect(4, 4, 10, 2, GOLD);
  g.rect(11, 6, 2, 2, GOLD);
  g.rect(8, 6, 2, 2, GOLD);
  g.rect(4, 4, 9, 1, GOLDL);
  g.shade({ top: 0.2, bot: 0.24 });
  g.outline(C('#4b2f08'));
  return g;
}
function potionSprite() {
  const g = new Pix(12, 15);
  g.rect(4, 1, 4, 2, C('#8a6a3a'));
  g.rect(5, 3, 2, 2, C('#c9ddea'));
  g.ell(6, 9, 4.2, 4.6, C('#c9ddea'));
  g.ell(6, 10, 3.2, 3.4, C('#e14a68'));
  g.ell(5, 9, 1.2, 1.6, C('#ff96a8'));
  g.set(4, 6, C('#ffffff'));
  g.shade({ top: 0.2, bot: 0.2 });
  g.outline(C('#22161f'));
  return g;
}
function bootSprite() {
  const g = new Pix(14, 12);
  g.rect(3, 1, 5, 7, C('#7a5230'));
  g.rect(3, 8, 9, 3, C('#5c3c22'));
  g.rect(3, 1, 5, 1, C('#a06e42'));
  g.poly([[10, 4], [13, 2], [13, 5], [10, 6]], C('#cfd9e8'));
  g.poly([[10, 6], [13, 6], [13, 8], [10, 8]], C('#aab7cc'));
  g.shade({ top: 0.18, bot: 0.2 });
  g.outline(C('#1d1410'));
  return g;
}
function swordIcon() {
  const g = new Pix(16, 16);
  drawSword(g, 4, 12, -Math.PI / 4, 9, HP);
  g.shade(); g.outline(HP.out);
  return g;
}
function ringIcon(col) {
  const g = new Pix(14, 14);
  g.ell(7, 7, 5, 5, C(col));
  g.ell(7, 7, 3, 3, [0, 0, 0, 0]);
  g.ell(7, 3.5, 1.8, 1.8, C('#bff0ff'));
  g.shade({ top: 0.2, bot: 0.2 });
  g.outline(C('#20182c'));
  return g;
}
/* the duellist's sigil: a spinning blade struck through a ring, for the
   upgrade that sharpens the flip, the roll cut and the dive */
function sigilIcon() {
  const g = new Pix(14, 14);
  /* the turning ring */
  g.ell(7, 7, 6, 6, C('#c68e3f'));
  g.ell(7, 7, 4, 4, [0, 0, 0, 0]);
  /* a gap, so the ring reads as a sweep rather than a band */
  g.rect(8, 0, 6, 4, [0, 0, 0, 0]);
  /* the blade through it, corner to corner */
  g.thick(3, 11, 11, 3, 2, C('#c9d4e8'));
  g.line(3, 10, 10, 3, C('#f6f8ff'));
  g.rect(2, 10, 3, 3, C('#8a5f26'));           /* the grip */
  g.set(11, 2, C('#fff4d6'));                  /* the point catches the light */
  g.shade({ top: 0.22, bot: 0.2 });
  g.outline(C('#20182c'));
  return g;
}
function paperSprite() {
  const g = new Pix(16, 18), r = new RNG(707);
  g.rect(2, 1, 12, 16, C('#ebdcb6'));
  g.rect(2, 1, 12, 1, C('#fff4d6'));
  g.rect(2, 16, 12, 1, C('#c0a97e'));
  /* a torn corner and some scrawl */
  g.poly([[11, 1], [14, 4], [11, 4]], [0, 0, 0, 0]);
  g.poly([[11, 1], [14, 4], [12, 4]], C('#d8c49a'));
  for (let k = 0; k < 5; k++) {
    const y = 5 + k * 2.2;
    g.rect(4, y, r.i(5, 8), 1, C('#6d543a'));
  }
  g.rect(4, 13, 7, 2, C('#b8862f'));
  for (let k = 0; k < 6; k++) g.set(r.i(3, 12), r.i(2, 15), C('#c0a97e'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#3a2c1c'));
  return g;
}
function doorBtnIcon() {
  const g = new Pix(16, 18);
  const frame = C('#e6edf6'), dark = C('#8a94a6'), knob = C('#f0c93a');
  /* a plain door: frame, panel lines and a knob */
  g.rect(1, 1, 14, 17, frame);
  g.rect(3, 3, 10, 15, dark);
  g.rect(3, 3, 10, 15, [0, 0, 0, 0]);
  g.frame(1, 1, 14, 17, frame);
  g.frame(2, 2, 12, 16, frame);
  g.frame(4, 5, 8, 5, dark);
  g.frame(4, 12, 8, 4, dark);
  g.disc(11, 11, 1.4, knob);
  g.set(11, 10, C('#fff4d6'));
  return g;
}
function swimBtnIcon() {
  const g = new Pix(18, 16);
  const skin = C('#f2c692'), skinD = C('#cf9a63');
  const water = C('#3f88c8'), waterD = C('#2a5f92'), foam = C('#cfeaff');
  /* water fills only the lower third, so the swimmer stays legible */
  for (let x = 0; x < 18; x++) {
    const wy = 10 + Math.round(Math.sin(x * 0.8) * 1.2);
    g.set(x, wy, foam);
    for (let y = wy + 1; y < 16; y++) g.set(x, y, y > wy + 2 ? waterD : water);
  }
  /* the trailing arm and a kick of spray behind */
  g.thick(2, 6, 6, 8, 2, skinD);
  g.set(1, 5, foam); g.set(0, 7, foam); g.set(2, 4, foam);
  /* body, cutting forward through the surface */
  g.thick(5, 9, 11, 6, 3, skin);
  g.thick(4, 10, 7, 9, 2, skinD);
  /* the leading arm, thrown out ahead */
  g.thick(11, 6, 16, 2, 2, skin);
  g.disc(16, 2, 1.4, skin);
  /* head, turned to breathe */
  g.disc(12, 4, 2.6, skin);
  g.set(13, 3, C('#3a2a1c'));
  g.set(11, 3, C('#7b4a26')); g.set(12, 2, C('#7b4a26')); g.set(13, 2, C('#7b4a26'));
  /* the bow wave it pushes */
  g.set(15, 8, foam); g.set(16, 9, foam); g.set(14, 9, foam);
  g.shade({ top: 0.12, bot: 0.14 });
  return g;
}
function gearIcon() {
  const g = new Pix(22, 22);
  const cx = 11, cy = 11;
  const body = C('#8a94a6'), lite = C('#c0c8d6'), dark = C('#5f6774');
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU;
    g.rect(cx + Math.cos(a) * 8 - 2, cy + Math.sin(a) * 8 - 2, 4, 4, body);
  }
  g.disc(cx, cy, 7.4, body);
  g.disc(cx - 1, cy - 1.4, 5.2, lite);
  g.disc(cx, cy, 3.2, [0, 0, 0, 0]);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU;
    g.set(cx + Math.cos(a) * 5.6, cy + Math.sin(a) * 5.6, dark);
  }
  g.shade({ top: 0.18, bot: 0.2 });
  g.outline(C('#2a2f3a'));
  return g;
}
function codesIcon() {
  const g = new Pix(22, 22);
  g.rect(2, 3, 18, 16, C('#241f36'));
  g.rect(2, 3, 18, 2, C('#3a3350'));
  g.rect(3, 6, 16, 10, C('#12101c'));
  /* a caret and a couple of glyph blocks, like a typed line */
  g.rect(5, 9, 2, 4, C('#6fc46a'));
  g.rect(8, 9, 3, 4, C('#c9d4e8'));
  g.rect(12, 9, 3, 4, C('#c9d4e8'));
  g.rect(16, 9, 1, 4, C('#ffe98a'));
  g.rect(2, 3, 1, 16, C('#c68e3f'));
  g.rect(19, 3, 1, 16, C('#8a5f26'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#0d0b16'));
  return g;
}
function mantleIcon() {
  const g = new Pix(16, 14);
  g.poly([[8, 1], [14, 5], [11, 12], [5, 12], [2, 5]], C('#2f6fb0'));
  g.poly([[8, 2], [12, 5], [10, 10], [8, 10]], C('#5fa3dc'));
  g.poly([[8, 2], [4, 5], [6, 10], [8, 10]], C('#1e4b80'));
  for (let k = 0; k < 3; k++) g.line(3 + k, 6 + k, 13 - k, 6 + k, C('#a8cbd6'));
  g.ell(8, 4, 2, 1.4, C('#cfeaff'));
  g.shade({ top: 0.18, bot: 0.18 });
  g.outline(C('#0d1c30'));
  return g;
}
function emberheartIcon() {
  const g = new Pix(16, 16);
  g.ell(8, 8, 6, 6, C('#8a2410'));
  g.ell(8, 8, 4.4, 4.4, C('#ff7a2a'));
  g.ell(8, 7.4, 2.6, 2.6, C('#ffd06a'));
  g.ell(7.4, 6.6, 1.2, 1.2, C('#ffffff'));
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * TAU;
    g.disc(8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 1.2, k % 2 ? C('#ff7a2a') : C('#ffd06a'));
  }
  g.outline(C('#3a1008'));
  return g;
}
function waveSprite(i, n) {
  const g = new Pix(22, 26);
  const t = i / n * TAU;
  for (let k = 0; k < 12; k++) {
    const p = k / 11;
    const y = 3 + p * 20;
    const w = Math.sin(p * Math.PI) * 8 + 1.5;
    const x = 6 + Math.sin(t + p * 3) * 1.6;
    g.rect(x, y, w, 2, C('#c0341a'));
    g.rect(x + 1, y, Math.max(1, w - 2), 1, C('#ff7a2a'));
    if (k % 2 === 0) g.set(x + w * 0.4, y, C('#ffd06a'));
  }
  g.outline(C('#5c1808'));
  return g;
}
function wingsIcon() {
  const g = new Pix(16, 14);
  for (const s of [-1, 1]) {
    const cx = 8 + s * 0.5;
    g.poly([[cx, 6], [cx + s * 7, 2], [cx + s * 8, 6], [cx + s * 5, 9], [cx + s * 2, 9]], C('#e6edf6'));
    g.poly([[cx, 6], [cx + s * 5, 4], [cx + s * 6, 6], [cx + s * 3, 8]], C('#ffffff'));
    for (let k = 0; k < 3; k++) g.line(cx + s, 6, cx + s * (4 + k * 1.6), 3 + k * 2, C('#aab7cc'));
  }
  g.ell(8, 7, 1.6, 2.4, C('#f0c93a'));
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(C('#26314a'));
  return g;
}
function magnetIcon() {
  const g = new Pix(14, 14);
  g.ell(7, 7, 5.4, 5.4, C('#c9403a'));
  g.ell(7, 7, 2.6, 2.6, [0, 0, 0, 0]);
  g.rect(2, 7, 11, 6, [0, 0, 0, 0]);
  g.rect(2, 7, 3, 5, C('#c9403a'));
  g.rect(9, 7, 3, 5, C('#c9403a'));
  g.rect(2, 10, 3, 2, C('#dfe6f0'));
  g.rect(9, 10, 3, 2, C('#dfe6f0'));
  g.shade({ top: 0.18, bot: 0.2 });
  g.outline(C('#20182c'));
  return g;
}
function shopIcon() {
  const g = new Pix(22, 22);
  g.rect(2, 6, 18, 5, C('#c4453d'));
  for (let k = 0; k < 3; k++) g.rect(3 + k * 6, 6, 3, 5, C('#eae3d2'));
  g.rect(2, 11, 18, 1, C('#8e2f2a'));
  g.rect(3, 12, 16, 8, C('#7a5230'));
  g.rect(3, 12, 16, 1, C('#a06e42'));
  g.ell(11, 16, 3.4, 3.4, GOLD);
  g.ell(11, 16, 2.0, 2.2, GOLDL);
  g.rect(5, 2, 2, 4, C('#6a4a2a'));
  g.rect(15, 2, 2, 4, C('#6a4a2a'));
  g.rect(1, 1, 20, 2, C('#8a6236'));
  g.shade({ top: 0.16, bot: 0.2 });
  g.outline(C('#1c1219'));
  return g;
}
function fireballSprite(i, n) {
  const g = new Pix(16, 16);
  const t = i / n * TAU;
  const r = 4.4 + Math.sin(t) * 0.6;
  g.ell(8, 8, r + 1.6, r + 0.4, C('#d1421f'));
  g.ell(8, 8, r, r - 0.6, C('#f5892c'));
  g.ell(7.4, 7.4, r - 1.8, r - 2.0, C('#ffdf7a'));
  for (let k = 0; k < 5; k++) {
    const a = t + k / 5 * TAU;
    g.set(8 + Math.cos(a) * (r + 2.4), 8 + Math.sin(a) * (r + 2.0), C('#ff9d3c'));
  }
  g.outline(C('#5c1808'));
  return g;
}

/* ============================================================
   TILES — 16x16, several variants each so terrain never repeats
   in an obvious grid.
   ============================================================ */
const TP = {
  grass: C('#4f9a3f'), grassD: C('#367030'), grassL: C('#7ec44f'), grassX: C('#2a5626'),
  dirt: C('#6b4a2f'), dirtD: C('#4a3220'), dirtL: C('#87613d'),
  rock: C('#5b5b71'), rockD: C('#3c3c50'), rockL: C('#7c7c94'), rockX: C('#26263a'),
  moss: C('#43793a'), mossD: C('#2c5228'),
  water: C('#2f6fb0'), waterD: C('#1e4b80'), waterL: C('#5fa3dc'), foam: C('#cfeaff'),
  wood: C('#7a5230'), woodD: C('#54371f'), woodL: C('#9c6c41'),
  path: C('#7a6244'), pathD: C('#5a4630'), pathL: C('#98805c'),
  caveBg: C('#2a2436'), caveBgD: C('#1d1828')
};

function tileGrass(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.16) ? TP.dirtD : (r.bool(0.12) ? TP.dirtL : TP.dirt));
  for (let k = 0; k < 4; k++) {
    const px = r.i(1, 13), py = r.i(7, 14);
    g.rect(px, py, r.i(1, 2), 1, TP.dirtD);
    g.set(px, py - 1, TP.dirtL);
  }
  for (let x = 0; x < 16; x++) {
    const d = 4 + Math.round(Math.sin(x * 0.9 + seed) * 1.2) + r.i(0, 2);
    for (let y = 0; y < d; y++) g.set(x, y, r.bool(0.2) ? TP.grassD : TP.grass);
    g.set(x, 0, r.bool(0.45) ? TP.grassL : TP.grass);
    if (r.bool(0.3)) g.set(x, d, TP.grassD);
    if (r.bool(0.25)) g.set(x, d + 1, TP.grassX);
  }
  for (let k = 0; k < 5; k++) {
    const px = r.i(0, 15);
    g.set(px, 0, TP.grassL); g.set(px, 1, TP.grassL);
  }
  if (r.bool(0.4)) {
    let x = r.i(3, 12), y = 6;
    for (let k = 0; k < 6; k++) { g.set(x, y, TP.dirtD); x += r.i(-1, 1); y++; }
  }
  return g;
}
function tileDirt(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.18) ? TP.dirtD : (r.bool(0.1) ? TP.dirtL : TP.dirt));
  for (let k = 0; k < 6; k++) {
    const px = r.i(1, 13), py = r.i(1, 13), w = r.i(2, 3);
    g.rect(px, py, w, 1, TP.dirtD);
    g.rect(px, py - 1, w - 1, 1, TP.dirtL);
  }
  for (let k = 0; k < 2; k++) {
    let x = r.i(2, 13), y = r.i(0, 4);
    for (let s = 0; s < 8; s++) { g.set(x, y, TP.dirtD); x += r.i(-1, 1); y += 1; }
  }
  return g;
}
function tileRock(seed, mossy) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.2) ? TP.rockD : (r.bool(0.14) ? TP.rockL : TP.rock));
  const seams = r.i(2, 3);
  for (let s = 0; s < seams; s++) {
    const horiz = r.bool(0.6);
    if (horiz) {
      let y = r.i(3, 12);
      for (let x = 0; x < 16; x++) { g.set(x, y, TP.rockX); g.set(x, y + 1, TP.rockL); if (r.bool(0.35)) y += r.i(-1, 1); }
    } else {
      let x = r.i(3, 12);
      for (let y = 0; y < 16; y++) { g.set(x, y, TP.rockX); g.set(x + 1, y, TP.rockL); if (r.bool(0.35)) x += r.i(-1, 1); }
    }
  }
  for (let k = 0; k < 2; k++) {
    let x = r.i(2, 13), y = r.i(2, 13);
    for (let s = 0; s < r.i(4, 8); s++) { g.set(x, y, TP.rockX); x += r.i(-1, 1); y += r.i(0, 1); }
  }
  for (let k = 0; k < 5; k++) {
    const px = r.i(0, 14), py = r.i(0, 14);
    g.set(px, py, TP.rockL); g.set(px + 1, py, TP.rockL);
  }
  if (mossy) {
    for (let x = 0; x < 16; x++) {
      const d = 2 + r.i(0, 3);
      for (let y = 0; y < d; y++) g.set(x, y, r.bool(0.25) ? TP.mossD : TP.moss);
      if (r.bool(0.4)) g.set(x, 0, TP.grassL);
      if (r.bool(0.2)) g.set(x, d, TP.mossD);
    }
    for (let k = 0; k < 3; k++) {
      const px = r.i(0, 15), py = r.i(5, 11);
      g.disc(px, py, r.r(1, 2), TP.mossD);
    }
  }
  return g;
}
function tilePath(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.2) ? TP.pathD : (r.bool(0.14) ? TP.pathL : TP.path));
  for (let k = 0; k < 7; k++) {
    const px = r.i(0, 14), py = r.i(0, 14);
    g.set(px, py, TP.pathD); g.set(px + 1, py, TP.pathD); g.set(px, py - 1, TP.pathL);
  }
  for (let k = 0; k < 2; k++) g.disc(r.i(2, 13), r.i(2, 13), r.r(1.2, 2.2), TP.mossD);
  return g;
}
function tileWood(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  g.rect(0, 0, 16, 6, TP.wood);
  g.rect(0, 0, 16, 1, TP.woodL);
  g.rect(0, 5, 16, 1, TP.woodD);
  for (let k = 0; k < 10; k++) {
    const px = r.i(0, 15), py = r.i(1, 4);
    g.rect(px, py, r.i(2, 4), 1, r.bool() ? TP.woodD : TP.woodL);
  }
  g.rect(0, 6, 16, 1, C('#00000055'));
  return g;
}
function tileWater(frame, deep) {
  const g = new Pix(16, 16);
  const base = deep ? TP.waterD : TP.water;
  const ph = frame / 8 * TAU;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const s = Math.sin(x * 0.55 + y * 0.35 - ph * 2) + Math.sin(x * 0.31 - y * 0.7 + ph * 3);
    g.set(x, y, s > 1.1 ? TP.waterL : (s < -1.0 ? TP.waterD : base));
  }
  if (!deep) {
    /* a rolling band of foam just under the surface */
    for (let x = 0; x < 16; x++) {
      const h = Math.sin(x * 0.6 - ph * 2.2) * 1.2 + Math.sin(x * 0.21 + ph) * 0.8;
      const top = clamp(Math.round(1 - h), 0, 4);
      g.set(x, top, TP.foam);
      g.set(x, top + 1, TP.waterL);
      if (h > 1.4) g.set(x, top, C('#ffffff'));
    }
  }
  return g;
}
function tileCaveBg(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.14) ? TP.caveBgD : TP.caveBg);
  for (let k = 0; k < 3; k++) {
    let x = r.i(1, 14), y = r.i(1, 12);
    for (let s = 0; s < r.i(3, 7); s++) { g.set(x, y, TP.caveBgD); x += r.i(-1, 1); y += r.i(0, 1); }
  }
  return g;
}

/* ============================================================
   PROPS — foliage, trees, cave dressing
   ============================================================ */
function treeSprite(size, seed) {
  const r = new RNG(seed);
  const w = size === 0 ? 44 : (size === 1 ? 64 : 84);
  const h = size === 0 ? 60 : (size === 1 ? 86 : 116);
  const g = new Pix(w, h);
  const cx = w / 2;
  const trunkW = size === 0 ? 5 : (size === 1 ? 7 : 9);
  const trunkTop = h * (size === 0 ? 0.45 : 0.42);
  g.poly([[cx - trunkW / 2 - 4, h - 1], [cx - trunkW / 2, h - 9], [cx + trunkW / 2, h - 9], [cx + trunkW / 2 + 4, h - 1]], TP.woodD);
  for (let y = h - 1; y > trunkTop; y--) {
    const t = (h - y) / (h - trunkTop);
    const ww = trunkW * (1 - t * 0.25);
    const bend = Math.sin(t * 2.2 + seed) * (size + 1) * 1.4;
    g.rect(cx - ww / 2 + bend, y, ww, 1, TP.wood);
    g.set(cx - ww / 2 + bend, y, TP.woodD);
    g.set(cx + ww / 2 + bend - 1, y, TP.woodD);
    if (r.bool(0.22)) g.set(cx - ww / 2 + bend + r.i(1, Math.max(1, ww - 2)), y, TP.woodL);
  }
  const nb = size === 0 ? 2 : 4;
  for (let k = 0; k < nb; k++) {
    const t = 0.15 + k / nb * 0.6;
    const y = trunkTop + (h - trunkTop) * t;
    const dir = k % 2 ? 1 : -1;
    g.thick(cx, y, cx + dir * (8 + size * 5), y - 8 - size * 3, 2, TP.woodD);
  }
  const clumps = size === 0 ? 7 : (size === 1 ? 11 : 16);
  const cy = trunkTop * 0.62;
  for (let k = 0; k < clumps; k++) {
    const a = r.r(0, TAU), rad = r.r(0, 1);
    const x = cx + Math.cos(a) * (w * 0.34) * rad;
    const y = cy + Math.sin(a) * (trunkTop * 0.5) * rad;
    const rr3 = r.r(6, 11) + size * 1.6;
    g.disc(x, y, rr3, TP.grassD);
    g.disc(x - rr3 * 0.2, y - rr3 * 0.25, rr3 * 0.8, TP.grass);
    g.disc(x - rr3 * 0.35, y - rr3 * 0.4, rr3 * 0.45, TP.grassL);
  }
  for (let k = 0; k < clumps * 26; k++) {
    const x = r.i(0, w - 1), y = r.i(0, Math.floor(trunkTop));
    if (g.alphaAt(x, y) > 200) g.set(x, y, r.bool(0.5) ? TP.grassX : TP.grassL);
  }
  g.shade({ top: 0.13, bot: 0.16, right: 0.08 });
  g.outline(C('#1c2c18'));
  return g;
}
function bushSprite(seed) {
  const g = new Pix(30, 22), r = new RNG(seed);
  for (let k = 0; k < 6; k++) {
    const x = 5 + r.r(0, 20), y = 10 + r.r(-3, 6), rr3 = r.r(4, 7);
    g.disc(x, y, rr3, TP.grassD);
    g.disc(x - 1, y - 1.5, rr3 * 0.7, TP.grass);
    g.disc(x - 2, y - 2.5, rr3 * 0.35, TP.grassL);
  }
  for (let k = 0; k < 40; k++) {
    const x = r.i(0, 29), y = r.i(0, 21);
    if (g.alphaAt(x, y) > 200) g.set(x, y, r.bool(0.5) ? TP.grassX : TP.grassL);
  }
  if (r.bool(0.5)) for (let k = 0; k < 3; k++) g.set(r.i(6, 24), r.i(6, 16), C('#e14a68'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#1c2c18'));
  return g;
}
function tuftSprite(seed) {
  const g = new Pix(16, 14), r = new RNG(seed);
  const n = r.i(4, 7);
  for (let k = 0; k < n; k++) {
    const x0 = 3 + r.r(0, 10), hgt = r.r(5, 12), bend = r.r(-3, 3);
    for (let y = 0; y < hgt; y++) {
      const t = y / hgt;
      g.set(x0 + bend * t * t, 13 - y, t > 0.7 ? TP.grassL : (k % 2 ? TP.grassD : TP.grass));
    }
  }
  g.outline(C('#1c2c18'));
  return g;
}
function flowerSprite(col, seed) {
  const g = new Pix(12, 16), r = new RNG(seed);
  const c = C(col), cl = sh(c, 0.3);
  const hgt = r.i(8, 12);
  for (let y = 0; y < hgt; y++) g.set(6 + Math.sin(y * 0.3) * 0.8, 15 - y, TP.grassD);
  g.set(4, 15 - hgt * 0.5, TP.grass); g.set(8, 15 - hgt * 0.65, TP.grass);
  const cy = 15 - hgt;
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * TAU + r.r(0, 1);
    g.disc(6 + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.2, 1.5, k % 2 ? c : cl);
  }
  g.disc(6, cy, 1.4, C('#ffd75e'));
  g.outline(C('#22301c'));
  return g;
}
function mushroomSprite(seed) {
  const g = new Pix(14, 12), r = new RNG(seed);
  const c = r.bool() ? C('#c9403a') : C('#d98c3a');
  g.rect(6, 6, 3, 5, C('#e8dcc0'));
  g.ell(7, 6, 5.2, 3.4, c);
  g.ell(6, 5, 3.4, 2.0, sh(c, 0.25));
  for (let k = 0; k < 4; k++) g.set(r.i(3, 10), r.i(3, 6), C('#f6efdc'));
  g.rect(3, 7, 9, 1, sh(c, -0.3));
  g.shade({ top: 0.18, bot: 0.18 });
  g.outline(C('#241a1a'));
  return g;
}
function rockSprite(seed) {
  const g = new Pix(20, 14), r = new RNG(seed);
  g.ell(10, 11, 8, 6, TP.rock);
  g.ell(8, 9, 5.5, 3.6, TP.rockL);
  g.ell(12, 12, 6, 3, TP.rockD);
  for (let k = 0; k < 8; k++) g.set(r.i(3, 16), r.i(6, 13), r.bool() ? TP.rockX : TP.rockL);
  if (r.bool(0.6)) for (let x = 3; x < 17; x++) if (r.bool(0.4)) g.set(x, 6 + r.i(0, 1), TP.mossD);
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(C('#1d1d2c'));
  return g;
}
function reedSprite(seed) {
  const g = new Pix(16, 22), r = new RNG(seed);
  for (let k = 0; k < 4; k++) {
    const x0 = 3 + r.r(0, 10), hgt = r.r(12, 20), bend = r.r(-2.5, 2.5);
    for (let y = 0; y < hgt; y++) g.set(x0 + bend * (y / hgt) * (y / hgt), 21 - y, k % 2 ? TP.grassD : TP.grass);
    if (r.bool(0.6)) g.ell(x0 + bend, 21 - hgt, 1.2, 2.4, C('#6b4a2f'));
  }
  g.outline(C('#1c2c18'));
  return g;
}
function stalactiteSprite(len, seed) {
  const g = new Pix(16, len + 2), r = new RNG(seed);
  for (let y = 0; y < len; y++) {
    const t = y / len;
    const w = Math.max(1, Math.round((1 - t) * 6));
    g.rect(8 - w / 2 + r.i(0, 1) * (t > 0.5 ? 0 : 1), y, w, 1, t > 0.6 ? TP.rockD : TP.rock);
  }
  for (let k = 0; k < 6; k++) g.set(r.i(5, 10), r.i(0, len - 1), TP.rockL);
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#1d1d2c'));
  return g;
}
function crystalSprite(col, seed) {
  const g = new Pix(18, 22), r = new RNG(seed);
  const c = C(col);
  for (let k = 0; k < 3; k++) {
    const x = 5 + r.r(0, 8), hgt = r.r(8, 16), w = r.r(2, 3.6);
    g.poly([[x, 21 - hgt], [x + w, 21 - hgt * 0.45], [x + w * 0.7, 21], [x - w * 0.7, 21], [x - w, 21 - hgt * 0.45]], c);
    g.poly([[x, 21 - hgt], [x + w * 0.35, 21 - hgt * 0.45], [x + w * 0.2, 21], [x - w * 0.1, 21]], sh(c, 0.35));
  }
  g.outline(C('#141024'));
  return g;
}
function torchSprite() {
  const g = new Pix(10, 18);
  g.rect(4, 5, 3, 12, TP.wood);
  g.rect(4, 5, 1, 12, TP.woodD);
  g.rect(3, 3, 5, 3, C('#3a2a1c'));
  g.rect(2, 8, 7, 2, C('#4a4a5c'));
  g.shade({ top: 0.16, bot: 0.16 });
  g.outline(C('#1a1220'));
  return g;
}
function doorSprite(kind) {
  const g = new Pix(32, 44);
  if (kind === 'cave') {
    g.ell(16, 30, 15, 22, C('#0a0812'));
    g.rect(1, 30, 30, 14, C('#0a0812'));
    for (let k = 0; k < 26; k++) {
      const a = Math.PI + k / 25 * Math.PI;
      const x = 16 + Math.cos(a) * 15.5, y = 30 + Math.sin(a) * 22.5;
      g.disc(x, y, 2.4, TP.rockD);
      g.disc(x - 0.8, y - 0.8, 1.4, TP.rock);
    }
    g.rect(0, 42, 32, 2, TP.rockD);
  } else {
    g.rect(2, 6, 28, 38, C('#0d1418'));
    for (let k = 0; k < 24; k++) {
      const a = Math.PI + k / 23 * Math.PI;
      const x = 16 + Math.cos(a) * 14, y = 20 + Math.sin(a) * 14;
      g.disc(x, y, 2.6, TP.rock);
      g.disc(x, y - 1, 1.4, TP.rockL);
    }
    g.rect(1, 20, 4, 24, TP.rock); g.rect(27, 20, 4, 24, TP.rock);
    g.rect(1, 20, 2, 24, TP.rockL); g.rect(29, 20, 2, 24, TP.rockD);
    for (let x = 0; x < 32; x++) if (x % 3) g.set(x, 4 + (x % 2), TP.moss);
  }
  g.shade({ top: 0.12, bot: 0.14 });
  g.outline(C('#12101c'));
  return g;
}

/* ============================================================
   PARALLAX BACKDROPS
   ============================================================ */
function ridgeHeights(w, seed, base, amp, rough) {
  const r = new RNG(seed);
  const h = new Float32Array(w);
  const n = 4;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(base + r.r(-amp, amp));
  let arr = pts, spread = amp * rough;
  while (arr.length < w) {
    const out = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      out.push((arr[i - 1] + arr[i]) / 2 + r.r(-spread, spread));
      out.push(arr[i]);
    }
    arr = out; spread *= 0.55;
  }
  for (let x = 0; x < w; x++) h[x] = arr[Math.floor(x / w * (arr.length - 1))];
  return h;
}
function mountainLayer(w, h, seed, col, snow) {
  const g = new Pix(w, h), r = new RNG(seed);
  const c = C(col), cl = sh(c, 0.22), cd = sh(c, -0.22);
  const top = ridgeHeights(w, seed, h * 0.42, h * 0.3, 0.62);
  for (let x = 0; x < w; x++) {
    const y0 = Math.round(top[x]);
    for (let y = y0; y < h; y++) {
      const t = (y - y0) / (h - y0 + 1);
      g.set(x, y, t < 0.06 ? cl : (t > 0.55 ? cd : c));
    }
    if (x > 0 && top[x] > top[x - 1]) for (let y = y0; y < Math.min(h, y0 + 8); y++) g.set(x, y, cd);
    if (snow && y0 < h * 0.34) {
      const depth = Math.round((h * 0.34 - y0) * 0.7);
      for (let y = y0; y < y0 + Math.max(1, depth); y++) {
        if (r.bool(0.75 - (y - y0) / (depth + 1) * 0.6)) g.set(x, y, C('#eef4ff'));
      }
    }
  }
  return g;
}
function hillLayer(w, h, seed, col, topCol) {
  const g = new Pix(w, h), r = new RNG(seed);
  const c = C(col), ct = C(topCol);
  for (let x = 0; x < w; x++) {
    const y0 = Math.round(h * 0.5
      + Math.sin(x * 0.011 + seed) * h * 0.22
      + Math.sin(x * 0.031 + seed * 2) * h * 0.11
      + Math.sin(x * 0.007 + seed * 3) * h * 0.14);
    for (let y = Math.max(0, y0); y < h; y++) g.set(x, y, c);
    for (let y = Math.max(0, y0); y < Math.min(h, y0 + 3); y++) g.set(x, y, ct);
    if (r.bool(0.10)) { g.set(x, y0 - 1, ct); g.set(x, y0 - 2, ct); }
  }
  return g;
}
function treeLineLayer(w, h, seed, col) {
  const g = new Pix(w, h), r = new RNG(seed);
  const c = C(col), cl = sh(c, 0.14), cd = sh(c, -0.16);
  for (let k = 0; k < w / 7; k++) {
    const x = r.r(0, w), th = r.r(h * 0.35, h * 0.9), tw = r.r(5, 11);
    const layers = 4;
    for (let l = 0; l < layers; l++) {
      const ly = h - th * (1 - l / layers) - 2;
      const lw = tw * (0.35 + l / layers * 0.9);
      g.poly([[x, ly - th * 0.18], [x + lw, ly + th * 0.1], [x - lw, ly + th * 0.1]], l === 0 ? cl : (l === layers - 1 ? cd : c));
    }
    g.rect(x - 1, h - 6, 2, 6, cd);
  }
  for (let x = 0; x < w; x++) for (let y = h - 5; y < h; y++) g.set(x, y, cd);
  return g;
}
function cloudSprite(seed) {
  const g = new Pix(70, 30), r = new RNG(seed);
  const n = r.i(5, 8);
  for (let k = 0; k < n; k++) {
    const x = 10 + r.r(0, 50), y = 16 + r.r(-6, 3), rr3 = r.r(5, 10);
    g.ell(x, y, rr3 * 1.2, rr3, C('#ffffff'));
  }
  const src = g.clone();
  for (let x = 0; x < 70; x++) for (let y = 0; y < 30; y++)
    if (src.alphaAt(x, y) > 200 && src.alphaAt(x, y + 3) < 100) g.set(x, y, C('#dfe9f7'));
  return g;
}
function sunSprite(r0, col, glow) {
  const s = Math.ceil(r0 * 3);
  const g = new Pix(s, s), c = C(col);
  const cc = s / 2;
  for (let k = 6; k >= 1; k--) {
    const a = Math.round(26 * (1 - k / 7));
    g.ell(cc, cc, r0 * (1 + k * 0.22), r0 * (1 + k * 0.22), [c[0], c[1], c[2], a + (glow ? 10 : 0)]);
  }
  g.ell(cc, cc, r0, r0, c);
  g.ell(cc - r0 * 0.25, cc - r0 * 0.25, r0 * 0.6, r0 * 0.6, sh(c, 0.35));
  return g;
}

/* draw a sprite with a wind sway: slices shift more the higher they are */
function blitSway(c2, img, x, y, amp, phase, anchorX, anchorY, slices, scale, alpha) {
  slices = slices || 8;
  scale = scale || 1;
  const sh2 = img.height / slices;
  const dh = sh2 * scale;
  const dw = img.width * scale;
  if (alpha !== undefined && alpha < 1) { c2.save(); c2.globalAlpha = alpha; }
  for (let i = 0; i < slices; i++) {
    const t = 1 - (i * sh2 + sh2 / 2) / img.height;
    const dx = Math.sin(phase + t * 1.6) * amp * t * t;
    c2.drawImage(img, 0, i * sh2, img.width, sh2 + 0.5,
                 Math.round(x - anchorX * scale + dx), Math.round(y - anchorY * scale + i * dh),
                 Math.ceil(dw), Math.ceil(dh + 1));
  }
  if (alpha !== undefined && alpha < 1) c2.restore();
}

/* ============================================================
   SPOREWOOD — bounce caps, glow and fungus
   ============================================================ */
const MSP = {
  cap: C('#c9403a'), capD: C('#8e2a20'), capL: C('#e8695c'), spot: C('#f6efdc'),
  stem: C('#e8dcc0'), stemD: C('#bdae90'),
  soil: C('#3b2a4d'), soilD: C('#2a1e38'), soilL: C('#55406e'),
  moss: C('#5aa05a'), glow: C('#9be89a'), glowB: C('#6fd0ff'),
  flesh: C('#d98c3a'), fleshD: C('#a5651f'),
  eye: C('#1a1024'), out: C('#1a1024')
};
/* A ladder hugs the face of whatever it is bolted to, so it takes the side
   of its tile: -1 wall on the left, +1 wall on the right, 0 free standing. */
function tileLadder(side) {
  const g = new Pix(16, 16), r = new RNG(600 + side);
  const wood = C('#9c6c41'), woodL = C('#c08d58'), woodD = C('#5c3c22'), iron = C('#6b7382');
  const x0 = side > 0 ? 6 : (side < 0 ? 1 : 3.5);
  const railA = Math.round(x0), railB = Math.round(x0 + 7);
  for (const rx of [railA, railB]) {
    for (let y = 0; y < 16; y++) {
      g.set(rx, y, wood); g.set(rx + 1, y, woodD);
      if (r.bool(0.2)) g.set(rx, y, woodL);
    }
  }
  /* rungs, worn at the middle */
  for (let k = 0; k < 3; k++) {
    const y = 2 + k * 5;
    for (let x = railA + 1; x < railB + 1; x++) g.set(x, y, wood);
    for (let x = railA + 1; x < railB + 1; x++) g.set(x, y + 1, woodD);
    g.set(railA + 2, y, woodL); g.set(railB - 1, y, woodL);
  }
  /* iron brackets into the wall */
  if (side !== 0) {
    const wx = side > 0 ? railB + 2 : railA - 2;
    for (const y of [3, 12]) {
      g.set(wx, y, iron); g.set(wx, y + 1, iron);
      g.set(wx - side, y, iron);
    }
  }
  return g;
}
function tileMycelium(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.18) ? MSP.soilD : (r.bool(0.12) ? MSP.soilL : MSP.soil));
  /* a mossy, faintly glowing crust on top */
  for (let x = 0; x < 16; x++) {
    const d = 3 + Math.round(Math.sin(x * 0.7 + seed) * 1.2) + r.i(0, 1);
    for (let y = 0; y < d; y++) g.set(x, y, r.bool(0.3) ? C('#3f7a45') : MSP.moss);
    if (r.bool(0.35)) g.set(x, 0, MSP.glow);
    if (r.bool(0.2)) g.set(x, d, C('#2c5230'));
  }
  /* mycelial threads */
  for (let k = 0; k < 3; k++) {
    let x = r.i(1, 14), y = r.i(5, 12);
    for (let s = 0; s < r.i(4, 8); s++) { g.set(x, y, MSP.soilL); x += r.i(-1, 1); y += r.i(0, 1); }
  }
  for (let k = 0; k < 4; k++) g.set(r.i(0, 15), r.i(6, 15), MSP.glow);
  return g;
}
function tileBounceCap(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  /* a springy cap: the dome crowns the top of the tile, gills underneath */
  for (let x = 0; x < 16; x++) {
    const dome = Math.round(3 - Math.sqrt(Math.max(0, 64 - (x - 7.5) * (x - 7.5))) * 0.36);
    const top = clamp(dome, 0, 4);
    for (let y = top; y < 16; y++) {
      const d = y - top;
      let col;
      if (d === 0) col = MSP.capL;
      else if (d < 7) col = r.bool(0.12) ? MSP.capL : MSP.cap;
      else if (d === 7) col = MSP.capD;
      else col = (x % 2 === 0) ? MSP.capD : sh(MSP.capD, -0.25);   /* gills */
      g.set(x, y, col);
    }
    /* the lip of the cap */
    if (top > 0) for (let y = 0; y < top; y++) g.set(x, y, [0, 0, 0, 0]);
  }
  for (let k = 0; k < 4; k++) {
    const sx = r.i(2, 13), sy = r.i(1, 5);
    if (g.alphaAt(sx, sy) > 200) g.disc(sx, sy, r.r(1.2, 2.1), MSP.spot);
  }
  return g;
}
function giantShroomSprite(size, seed) {
  const r = new RNG(seed);
  const w = 30 + size * 22, h = 40 + size * 30;
  const g = new Pix(w, h);
  const cx = w / 2;
  const col = r.bool(0.5) ? MSP.cap : C('#8e5fd0');
  const stemW = 5 + size * 2;
  for (let y = h - 1; y > h * 0.42; y--) {
    const t = (h - y) / (h - h * 0.42);
    const ww = stemW * (1 - t * 0.2);
    const bend = Math.sin(t * 1.8 + seed) * (size + 1) * 1.2;
    g.rect(cx - ww / 2 + bend, y, ww, 1, MSP.stem);
    g.set(cx - ww / 2 + bend, y, MSP.stemD);
    g.set(cx + ww / 2 + bend - 1, y, MSP.stemD);
  }
  const cy = h * 0.40, cr = w * 0.44;
  g.ell(cx, cy, cr, cr * 0.66, sh(col, -0.25));
  g.ell(cx, cy - cr * 0.12, cr * 0.96, cr * 0.6, col);
  g.ell(cx - cr * 0.25, cy - cr * 0.28, cr * 0.55, cr * 0.3, sh(col, 0.3));
  g.rect(cx - cr, cy + cr * 0.4, cr * 2, 3, sh(col, -0.4));
  for (let k = 0; k < 7 + size * 3; k++) {
    const a2 = r.r(0, TAU), rad = r.r(0, 0.8);
    g.disc(cx + Math.cos(a2) * cr * rad, cy - cr * 0.15 + Math.sin(a2) * cr * 0.4 * rad, r.r(1.4, 3), MSP.spot);
  }
  for (let k = 0; k < 5; k++) g.set(r.i(2, w - 3), r.i(Math.floor(h * 0.5), h - 2), MSP.glow);
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(C('#241832'));
  return g;
}
function sporelingFrame(i, n) {
  const g = new Pix(24, 22);
  const p = i / n * TAU;
  const hop = Math.max(0, Math.sin(p)) * 3;
  const cx = 12, base = 20 - hop;
  const squash = 1 + Math.max(0, -Math.sin(p)) * 0.25;
  /* two little legs */
  for (const s of [-1, 1]) {
    g.thick(cx + s * 2, base - 5, cx + s * 3.5, base, 2, MSP.stemD);
    g.rect(cx + s * 3.5 - 2, base - 1, 4, 2, MSP.stemD);
  }
  /* stem body */
  g.ell(cx, base - 7, 4.2 * squash, 4.6 / squash, MSP.stem);
  /* cap */
  const cr = 8 * squash;
  g.ell(cx, base - 12, cr, cr * 0.62 / squash, MSP.capD);
  g.ell(cx, base - 13, cr * 0.94, cr * 0.55 / squash, MSP.cap);
  g.ell(cx - cr * 0.3, cy0(base) - 0, cr * 0.5, cr * 0.26, MSP.capL);
  for (let k = 0; k < 4; k++) {
    const a2 = k / 4 * Math.PI - 0.4;
    g.disc(cx + Math.cos(a2) * cr * 0.55, base - 14 + Math.sin(a2) * cr * 0.2, 1.5, MSP.spot);
  }
  /* eyes under the brim */
  g.set(cx - 2, base - 8, MSP.eye); g.set(cx + 2, base - 8, MSP.eye);
  g.set(cx - 2, base - 9, C('#ffffff')); g.set(cx + 2, base - 9, C('#ffffff'));
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(MSP.out);
  return g;
  function cy0(b) { return b - 14; }
}

/* ---------- the Mother Spore ---------- */
const MW = 96, MH = 88, MAX = 48, MAY = 84;
function motherFrame(mode, i, n) {
  const g = new Pix(MW, MH);
  const p = i / n * TAU;
  const breathe = Math.sin(p) * 2;
  const cx = MAX, base = MAY;
  /* roots */
  for (let k = -4; k <= 4; k++) {
    const rx = cx + k * 7;
    g.thick(cx + k * 2, base - 6, rx, base + 2, 3, MSP.stemD);
  }
  /* stem */
  g.ell(cx, base - 20, 15 + breathe * 0.3, 16, MSP.stem);
  g.ell(cx - 5, base - 24, 8, 10, C('#f6efdc'));
  g.rect(cx - 16, base - 30, 32, 4, MSP.stemD);
  /* mouth */
  const open = mode === 'burst' ? 8 : (mode === 'spawn' ? 5 : 2);
  g.ell(cx, base - 16, 9, open, C('#3a1420'));
  if (open > 3) {
    for (let k = -3; k <= 3; k++) {
      g.poly([[cx + k * 3 - 1, base - 16 - open], [cx + k * 3, base - 16 - open + 3], [cx + k * 3 + 1, base - 16 - open]], MSP.spot);
      g.poly([[cx + k * 3 - 1, base - 16 + open], [cx + k * 3, base - 16 + open - 3], [cx + k * 3 + 1, base - 16 + open]], MSP.spot);
    }
  }
  /* eyes */
  for (const s of [-1, 1]) {
    g.disc(cx + s * 8, base - 30, 3.4, C('#f6efdc'));
    g.disc(cx + s * 8 + s, base - 30, 1.8, MSP.eye);
    g.set(cx + s * 8 + s, base - 31, C('#ffffff'));
  }
  /* the great cap */
  const cr = 40 + breathe;
  g.ell(cx, base - 42, cr, cr * 0.56, MSP.capD);
  g.ell(cx, base - 46, cr * 0.95, cr * 0.5, MSP.cap);
  g.ell(cx - cr * 0.3, base - 52, cr * 0.5, cr * 0.22, MSP.capL);
  g.rect(cx - cr, base - 40, cr * 2, 4, sh(MSP.capD, -0.3));
  for (let k = 0; k < 5; k++) {
    const gx = cx - cr + 8 + k * (cr * 2 - 16) / 4;
    g.rect(gx, base - 40, 2, 5, sh(MSP.capD, -0.5));
  }
  const r = new RNG(303);
  for (let k = 0; k < 16; k++) {
    const a2 = r.r(0, TAU), rad = r.r(0, 0.85);
    g.disc(cx + Math.cos(a2) * cr * rad, base - 48 + Math.sin(a2) * cr * 0.34 * rad, r.r(2, 4.4), MSP.spot);
  }
  /* smaller caps clustered at the base */
  for (const [ox, oy, orr] of [[-34, -8, 7], [32, -6, 6], [-24, -2, 5], [26, -1, 4]]) {
    g.rect(cx + ox - 2, base + oy - 4, 4, 6, MSP.stem);
    g.ell(cx + ox, base + oy - 5, orr, orr * 0.6, MSP.cap);
    g.ell(cx + ox - orr * 0.3, base + oy - 6, orr * 0.5, orr * 0.3, MSP.capL);
  }
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(MSP.out);
  return g;
}

/* ============================================================
   AETHER CITY — cloud and marble
   ============================================================ */
const CLP = {
  cloud: C('#eef4ff'), cloudD: C('#c3d2e8'), cloudS: C('#9fb2ce'),
  marble: C('#e8e2d2'), marbleD: C('#bdb49f'), marbleL: C('#fbf7ec'),
  gold: C('#e0b166'), goldD: C('#a87c2e'),
  sky: C('#6fb6e8'), bolt: C('#ffe14d'), boltL: C('#fffbe0'), arc: C('#9fe8ff'),
  skin: C('#f2c692'), skinD: C('#cf9a63'), hair: C('#e8eaf0'), hairD: C('#b9bfcc'),
  robe: C('#f6f8ff'), robeD: C('#ccd6ea'), out: C('#2a2438')
};
function tileCloud(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.18) ? CLP.cloudD : CLP.cloud);
  for (let x = 0; x < 16; x++) {
    const d = 2 + Math.round(Math.sin(x * 0.8 + seed) * 1.4) + r.i(0, 1);
    for (let y = 0; y < d; y++) g.set(x, y, CLP.cloud);
    g.set(x, d, C('#ffffff'));
  }
  for (let k = 0; k < 5; k++) g.ell(r.i(0, 15), r.i(9, 15), r.r(2, 4), r.r(1.4, 2.6), CLP.cloudS);
  for (let x = 0; x < 16; x++) g.set(x, 15, CLP.cloudS);
  return g;
}
function tileCloudLedge(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let x = 0; x < 16; x++) {
    const h = 4 + r.i(0, 2);
    for (let y = 0; y < h; y++) g.set(x, y, y === 0 ? C('#ffffff') : (r.bool(0.2) ? CLP.cloudD : CLP.cloud));
    g.set(x, h, CLP.cloudS);
  }
  return g;
}
function tileMarble(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.12) ? CLP.marbleD : (r.bool(0.1) ? CLP.marbleL : CLP.marble));
  /* veining */
  for (let k = 0; k < 2; k++) {
    let x = r.i(0, 15), y = r.i(0, 15);
    for (let s = 0; s < r.i(6, 12); s++) { g.set(x, y, CLP.marbleD); x += r.i(-1, 1); y += r.i(0, 1); }
  }
  g.rect(0, 0, 16, 1, CLP.marbleL);
  g.rect(0, 15, 16, 1, CLP.marbleD);
  g.rect(0, 0, 1, 16, CLP.marbleL);
  g.rect(15, 0, 1, 16, CLP.marbleD);
  if (seed % 3 === 0) { g.rect(0, 7, 16, 1, CLP.gold); g.rect(0, 8, 16, 1, CLP.goldD); }
  return g;
}
function columnSprite(h) {
  const g = new Pix(24, h);
  g.rect(2, 0, 20, 5, CLP.marble);
  g.rect(2, 0, 20, 2, CLP.marbleL);
  g.rect(0, 4, 24, 3, CLP.marbleD);
  g.rect(4, 7, 16, h - 13, CLP.marble);
  for (let k = 0; k < 5; k++) g.rect(5 + k * 3, 7, 1, h - 13, CLP.marbleD);
  g.rect(4, 7, 2, h - 13, CLP.marbleL);
  g.rect(0, h - 6, 24, 3, CLP.marbleD);
  g.rect(2, h - 4, 20, 4, CLP.marble);
  g.rect(2, h - 4, 20, 1, CLP.marbleL);
  g.shade({ top: 0.1, bot: 0.14 });
  g.outline(C('#8c8474'));
  return g;
}
function brazierSprite() {
  const g = new Pix(20, 22);
  g.rect(8, 8, 4, 10, CLP.goldD);
  g.poly([[2, 18], [10, 12], [18, 18], [18, 21], [2, 21]], CLP.goldD);
  g.ell(10, 7, 7, 3.4, CLP.gold);
  g.ell(10, 6, 5.4, 2.4, C('#3a2a18'));
  g.rect(3, 7, 14, 2, CLP.goldD);
  g.shade({ top: 0.18, bot: 0.2 });
  g.outline(C('#3a2a10'));
  return g;
}
function statueSprite() {
  const g = new Pix(22, 34);
  g.rect(2, 29, 18, 5, CLP.marbleD);
  g.rect(3, 28, 16, 2, CLP.marble);
  g.rect(8, 16, 6, 13, CLP.marble);
  g.poly([[6, 29], [8, 16], [14, 16], [16, 29]], CLP.marble);
  g.thick(9, 18, 4, 12, 3, CLP.marble);
  g.thick(13, 18, 18, 9, 3, CLP.marble);
  g.disc(11, 12, 4, CLP.marble);
  g.disc(10, 11, 2.4, CLP.marbleL);
  for (let k = 0; k < 6; k++) g.disc(7 + k * 1.6, 8.5 - Math.abs(k - 2.5) * 0.4, 1.2, CLP.gold);
  g.shade({ top: 0.12, bot: 0.16 });
  g.outline(C('#8c8474'));
  return g;
}
function cloudPuffSprite(seed) {
  const g = new Pix(64, 30), r = new RNG(seed);
  for (let k = 0; k < 7; k++) g.ell(10 + r.r(0, 44), 16 + r.r(-6, 4), r.r(7, 13), r.r(4, 8), CLP.cloud);
  const src = g.clone();
  for (let x = 0; x < 64; x++) for (let y = 0; y < 30; y++)
    if (src.alphaAt(x, y) > 200 && src.alphaAt(x, y + 3) < 100) g.set(x, y, CLP.cloudD);
  return g;
}
function wispFrame(i, n) {
  const g = new Pix(22, 22), r = new RNG(70 + i);
  const cx = 11, cy = 11, p = i / n * TAU;
  g.disc(cx, cy, 5.6 + Math.sin(p) * 0.5, C('#3f6fd8'));
  g.disc(cx, cy, 4.2, CLP.arc);
  g.disc(cx - 0.6, cy - 0.8, 2.6, C('#ffffff'));
  /* crackling arcs around it */
  for (let k = 0; k < 4; k++) {
    let a2 = p + k / 4 * TAU, x = cx + Math.cos(a2) * 5, y = cy + Math.sin(a2) * 5;
    for (let s = 0; s < 4; s++) {
      const nx = x + Math.cos(a2) * 2 + r.r(-1.4, 1.4), ny = y + Math.sin(a2) * 2 + r.r(-1.4, 1.4);
      g.line(x, y, nx, ny, s < 2 ? CLP.boltL : CLP.bolt);
      x = nx; y = ny;
    }
  }
  g.outline(C('#1a2a55'));
  return g;
}

/* ---------- Zeus ---------- */
const ZW = 88, ZH = 108, ZAX = 44, ZAY = 104;
function zeusFrame(mode, i, n) {
  const g = new Pix(ZW, ZH);
  const p = i / n * TAU;
  const bob = Math.sin(p) * 2;
  const cx = ZAX;
  const cloudY = 96 + bob;
  /* the cloud he rides */
  for (let k = 0; k < 7; k++) {
    const a2 = k / 7 * Math.PI;
    g.ell(cx - 26 + k * 8.5, cloudY + Math.sin(a2) * -3, 9, 5.5, CLP.cloud);
  }
  g.ell(cx, cloudY + 4, 28, 4.5, CLP.cloudD);

  const hipY = 74 + bob, shY = 46 + bob, headY = 30 + bob;
  /* robe */
  g.poly([[cx - 16, hipY + 18], [cx - 11, shY + 4], [cx + 11, shY + 4], [cx + 16, hipY + 18]], CLP.robe);
  for (let k = -3; k <= 3; k++)
    g.line(cx + k * 4, shY + 6, cx + k * 5.2, hipY + 17, CLP.robeD);
  g.rect(cx - 16, hipY + 15, 32, 3, CLP.gold);
  g.rect(cx - 12, shY + 3, 24, 2, CLP.gold);
  /* torso */
  g.ell(cx, shY + 8, 11, 10, CLP.skin);
  g.ell(cx, shY + 3, 12, 5, CLP.skin);
  g.ell(cx - 5, shY + 6, 4, 3, CLP.skinD);
  g.ell(cx + 5, shY + 6, 4, 3, CLP.skinD);
  g.poly([[cx - 12, shY + 2], [cx - 4, shY - 2], [cx + 12, shY + 2], [cx + 4, shY + 6]], CLP.robe);
  /* arms */
  const up = (mode === 'cast') ? 1 : 0;
  const thr = (mode === 'throw') ? 1 : 0;
  const lh = [cx - 20 - thr * 4, shY + (up ? -22 : 14) + Math.sin(p) * 1.5];
  const rh = [cx + 20 + thr * 8, shY + (up ? -24 : 10) - thr * 12 + Math.sin(p) * 1.5];
  limb(g, cx - 10, shY + 2, lh[0], lh[1], up ? 4 : 3, 5, CLP.skin);
  limb(g, cx + 10, shY + 2, rh[0], rh[1], up ? -4 : -3, 5, CLP.skin);
  g.disc(lh[0], lh[1], 2.6, CLP.skin);
  g.disc(rh[0], rh[1], 2.6, CLP.skin);
  /* the bolt in his hand */
  if (mode !== 'hurt') {
    const bx = rh[0], by = rh[1];
    const glow = mode === 'cast' ? 1.5 : 1;
    g.poly([[bx + 2, by - 12 * glow], [bx - 2, by - 2], [bx + 2, by - 2],
            [bx - 3, by + 10 * glow], [bx + 5, by - 1], [bx + 1, by - 1], [bx + 7, by - 12 * glow]], CLP.bolt);
    g.poly([[bx + 3, by - 9 * glow], [bx, by - 2], [bx + 2, by - 2], [bx, by + 6 * glow]], CLP.boltL);
  }
  /* head */
  g.disc(cx, headY, 9, CLP.skin);
  g.ell(cx, headY + 8, 8, 7, CLP.hair);              /* beard */
  g.ell(cx, headY + 10, 6, 5, CLP.hairD);
  g.ell(cx, headY - 6, 9.5, 5, CLP.hair);            /* hair */
  g.ell(cx - 3, headY - 7, 5, 3, C('#ffffff'));
  g.set(cx - 4, headY - 1, CLP.out); g.set(cx + 3, headY - 1, CLP.out);
  g.set(cx - 4, headY - 2, C('#ffffff')); g.set(cx + 3, headY - 2, C('#ffffff'));
  g.rect(cx - 6, headY - 3, 3, 1, CLP.hairD);
  g.rect(cx + 3, headY - 3, 3, 1, CLP.hairD);
  /* laurel crown */
  for (let k = -4; k <= 4; k++) {
    const lx = cx + k * 2.2, ly = headY - 9 + Math.abs(k) * 0.7;
    g.ell(lx, ly, 1.6, 1.1, k % 2 ? C('#6fc46a') : C('#48a24f'));
  }
  g.shade({ top: 0.13, bot: 0.18, right: 0.09 });
  g.outline(CLP.out);
  /* eyes glow after the outline pass so they stay bright */
  if (mode === 'cast') { g.set(cx - 4, headY - 1, CLP.boltL); g.set(cx + 3, headY - 1, CLP.boltL); }
  return g;
}

/* ============================================================
   THE SIX NEW GUARDIANS
   ============================================================ */
/* --- chapter two --- */
const GB_W = 96, GB_H = 92, GB_AX = 48, GB_AY = 88;

function tideWardenFrame(mode, i, n) {          /* level 4 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p) * 2;
  const open = mode === 'attack' ? 6 : 1;
  /* trident */
  const tx = cx + 30, ty = base - 60 + bob;
  g.thick(tx, ty, tx, base - 4, 3, C('#7a6f74'));
  for (let k = -1; k <= 1; k++) g.thick(tx + k * 5, ty + 4, tx + k * 5, ty - 12, 2, C('#c9d4e8'));
  g.thick(tx - 5, ty + 4, tx + 5, ty + 4, 2, C('#c9d4e8'));
  /* fish tail instead of legs */
  for (let k = 0; k < 8; k++) {
    const t = k / 7;
    g.ell(cx + Math.sin(p + t * 3) * t * 6, base - 4 - k * 3 + bob, 10 - t * 4, 4, t > 0.5 ? DPP.stoneD : DPP.stone);
  }
  g.poly([[cx - 4, base - 2], [cx - 16, base + 2], [cx - 6, base - 10]], DPP.kelp);
  g.poly([[cx + 4, base - 2], [cx + 16, base + 2], [cx + 6, base - 10]], DPP.kelpL);
  /* torso and arms */
  g.ell(cx, base - 40 + bob, 13, 12, DPP.stoneL);
  g.ell(cx, base - 44 + bob, 11, 6, C('#7ba3ae'));
  for (const s of [-1, 1]) {
    limb(g, cx + s * 10, base - 48 + bob, cx + s * (20 + (mode === 'attack' ? 8 : 0)), base - 40 + bob, s * 5, 5, DPP.stoneL);
    g.disc(cx + s * 22, base - 40 + bob, 3, DPP.stone);
  }
  /* crowned head */
  g.disc(cx, base - 58 + bob, 8.5, DPP.stoneL);
  g.ell(cx, base - 52 + bob, 7, 5, DPP.kelp);
  g.set(cx - 3, base - 60 + bob, DPP.eye); g.set(cx + 3, base - 60 + bob, DPP.eye);
  g.ell(cx, base - 55 + bob, open * 0.7, open * 0.5, C('#2a1420'));
  for (let k = -3; k <= 3; k++)
    g.poly([[cx + k * 3 - 1, base - 65 + bob], [cx + k * 3, base - 74 + Math.abs(k) * 2 + bob], [cx + k * 3 + 1, base - 65 + bob]], C('#c9d4e8'));
  g.shade({ top: 0.14, bot: 0.18 }); g.outline(DPP.out);
  return g;
}
function krakenFrame(mode, i, n) {              /* level 5 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p) * 2.5;
  /* eight arms */
  for (let k = 0; k < 8; k++) {
    const s = k < 4 ? -1 : 1, idx = k % 4;
    const a0 = -0.5 - idx * 0.35;
    let x = cx + s * 8, y = base - 30 + bob;
    for (let seg = 0; seg < 9; seg++) {
      const t = seg / 8;
      const ang = a0 + Math.sin(p + k + seg * 0.4) * 0.5 + t * 1.2;
      x += s * Math.cos(ang) * 5; y += Math.sin(ang) * 5;
      g.disc(x, y, 4.6 * (1 - t * 0.75), idx % 2 ? C('#6b2f6b') : C('#8e3f8e'));
      if (seg % 2 === 0) g.disc(x + s, y, 1.1, C('#e8a8d8'));
    }
  }
  /* mantle */
  g.ell(cx, base - 46 + bob, 17, 22, C('#8e3f8e'));
  g.ell(cx, base - 54 + bob, 13, 13, C('#a85fa8'));
  g.ell(cx - 4, base - 60 + bob, 7, 5, C('#c98fc9'));
  /* eyes */
  for (const s of [-1, 1]) {
    g.disc(cx + s * 8, base - 38 + bob, 5.4, C('#f6efdc'));
    g.disc(cx + s * 8, base - 38 + bob, 2.6, DPP.out);
    g.rect(cx + s * 8 - 3, base - 38.5 + bob, 6, 1, DPP.out);
    g.set(cx + s * 8 - 2, base - 40 + bob, C('#ffffff'));
  }
  /* beak */
  const open = mode === 'attack' ? 5 : 2;
  g.poly([[cx - 5, base - 28 + bob], [cx, base - 28 + open + bob], [cx + 5, base - 28 + bob]], C('#3a2a18'));
  g.poly([[cx - 4, base - 26 + bob], [cx, base - 26 - open * 0.6 + bob], [cx + 4, base - 26 + bob]], C('#5a4228'));
  g.shade({ top: 0.14, bot: 0.18 }); g.outline(DPP.out);
  return g;
}
function leviathanFrame(mode, i, n) {           /* level 6 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p) * 3;
  /* coiled serpent body */
  for (let k = 14; k >= 0; k--) {
    const t = k / 14;
    const ang = p * 0.4 + t * 4.2;
    const x = cx - 6 + Math.cos(ang) * (10 + t * 22);
    const y = base - 22 + Math.sin(ang) * (7 + t * 12) + t * 6 + bob;
    g.disc(x, y, 10 - t * 6, t > 0.45 ? C('#1d5a5a') : C('#2f8080'));
    g.disc(x, y + 2, Math.max(1, 6 - t * 4), C('#8fd0c0'));
    if (k % 2 === 0) g.poly([[x - 2, y - 8 + t * 4], [x, y - 14 + t * 7], [x + 2, y - 8 + t * 4]], C('#c9f0e0'));
  }
  /* head */
  const hx = cx + 22, hy = base - 56 + bob;
  g.ell(hx, hy, 13, 9, C('#2f8080'));
  g.ell(hx + 7, hy + 2, 9, 5, C('#2f8080'));
  const open = mode === 'attack' ? 8 : 2;
  g.ell(hx + 6, hy + 4 + open, 9, 3.4, C('#1d5a5a'));
  if (open > 3) {
    g.ell(hx + 6, hy + 3 + open * 0.6, 8, open * 0.5, C('#3a1420'));
    for (let k = 0; k < 6; k++) {
      g.poly([[hx - 1 + k * 3, hy + 6], [hx + k * 3, hy + 10], [hx + 1 + k * 3, hy + 6]], C('#f6efdc'));
      g.poly([[hx - 1 + k * 3, hy + 3 + open], [hx + k * 3, hy - 1 + open], [hx + 1 + k * 3, hy + 3 + open]], C('#f6efdc'));
    }
  }
  for (const dy of [-1, 1]) g.thick(hx - 4, hy + dy * 3, hx - 16, hy + dy * 12 - 4, 3, C('#c9f0e0'));
  g.disc(hx + 2, hy - 3, 3, DPP.eye);
  g.disc(hx + 2.6, hy - 3, 1.4, DPP.out);
  g.set(hx + 1, hy - 4, C('#ffffff'));
  g.shade({ top: 0.14, bot: 0.18 }); g.outline(DPP.out);
  return g;
}
/* --- chapter three --- */
function forgefiendFrame(mode, i, n) {          /* level 7 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p * 2) * 1.4;
  const raise = mode === 'attack' ? 12 : 0;
  for (const s of [-1, 1]) {
    g.rect(cx + s * 8 - 4, base - 16 + bob, 8, 16, ASP.rock);
    g.rect(cx + s * 8 - 4, base - 3, 10, 3, ASP.rockD);
  }
  g.rect(cx - 14, base - 44 + bob, 28, 30, ASP.rock);
  g.rect(cx - 14, base - 44 + bob, 28, 3, ASP.rockL);
  for (let k = -2; k <= 2; k++) { g.rect(cx + k * 5 - 1, base - 40 + bob, 3, 22, ASP.emberD); g.rect(cx + k * 5 - 1, base - 38 + bob, 2, 18, ASP.ember); }
  g.ell(cx, base - 30 + bob, 8, 7, ASP.emberL);
  /* hammer arm */
  g.rect(cx + 13, base - 44 - raise + bob, 8, 20, ASP.rock);
  g.rect(cx + 8, base - 52 - raise + bob, 18, 9, ASP.iron);
  g.rect(cx + 8, base - 52 - raise + bob, 18, 3, C('#8a94a6'));
  g.rect(cx - 21, base - 42 + bob, 8, 20, ASP.rock);
  g.ell(cx - 17, base - 21 + bob, 5.4, 4.4, ASP.rockD);
  /* head: a helm with a burning slit */
  g.rect(cx - 8, base - 58 + bob, 16, 14, ASP.iron);
  g.rect(cx - 8, base - 58 + bob, 16, 3, C('#8a94a6'));
  g.rect(cx - 6, base - 51 + bob, 12, 3, ASP.ember);
  g.rect(cx - 6, base - 51 + bob, 12, 1, ASP.emberL);
  for (const s of [-1, 1]) g.poly([[cx + s * 8, base - 56 + bob], [cx + s * 15, base - 64 + bob], [cx + s * 8, base - 48 + bob]], ASP.horn);
  for (let k = 0; k < 4; k++) g.disc(cx + rr(-10, 10), base - 62 - k * 3 + bob, 2 - k * 0.3, k ? ASP.emberD : ASP.ember);
  g.shade({ top: 0.14, bot: 0.18 }); g.outline(ASP.out);
  return g;
}
function ashTitanFrame(mode, i, n) {            /* level 8 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p) * 2;
  const open = mode === 'attack' ? 7 : 2;
  for (const s of [-1, 1]) {
    limb(g, cx + s * 7, base - 26 + bob, cx + s * 13, base - 2, s * 4, 8, ASP.obsid);
    g.ell(cx + s * 13, base - 2, 6, 3, ASP.obsidL);
  }
  /* a hulking body of fused obsidian shards */
  g.poly([[cx - 20, base - 20 + bob], [cx - 14, base - 52 + bob], [cx + 14, base - 52 + bob],
          [cx + 20, base - 20 + bob], [cx + 10, base - 12 + bob], [cx - 10, base - 12 + bob]], ASP.obsid);
  for (let k = -3; k <= 3; k++)
    g.poly([[cx + k * 5, base - 50 + bob], [cx + k * 5 - 3, base - 64 - Math.abs(k) * -3 + bob], [cx + k * 5 + 3, base - 50 + bob]], ASP.obsidL);
  const r = new RNG(23);
  for (let k = 0; k < 14; k++) g.line(cx + r.i(-16, 16), base - 48 + bob + r.i(0, 30), cx + r.i(-16, 16), base - 40 + bob + r.i(0, 20), ASP.ember);
  /* arms */
  for (const s of [-1, 1]) {
    limb(g, cx + s * 16, base - 46 + bob, cx + s * (26 + (mode === 'attack' ? 6 : 0)), base - 20 + bob, s * -6, 7, ASP.obsid);
    g.ell(cx + s * 27, base - 18 + bob, 6, 5, ASP.obsidL);
  }
  /* a face of embers */
  g.ell(cx, base - 44 + bob, 9, 7, ASP.rockD);
  g.ell(cx - 4, base - 46 + bob, 2.6, 2, ASP.ember);
  g.ell(cx + 4, base - 46 + bob, 2.6, 2, ASP.ember);
  g.ell(cx, base - 40 + bob, open, open * 0.55, ASP.emberD);
  g.ell(cx, base - 40 + bob, open * 0.6, open * 0.3, ASP.emberL);
  g.shade({ top: 0.13, bot: 0.18 }); g.outline(ASP.out);
  return g;
}
function ifritFrame(mode, i, n) {               /* level 9 */
  const g = new Pix(GB_W, GB_H), p = i / n * TAU;
  const cx = GB_AX, base = GB_AY, bob = Math.sin(p) * 3;
  /* a column of fire where the legs should be */
  for (let k = 0; k < 9; k++) {
    const t = k / 8;
    const w = 16 * (1 - t * 0.55) + Math.sin(p * 2 + k) * 1.6;
    g.ell(cx + Math.sin(p + k * 0.6) * 3 * t, base - 2 - k * 4, w, 4, k > 5 ? ASP.ember : (k > 2 ? ASP.emberD : C('#8a2410')));
  }
  /* torso */
  g.ell(cx, base - 48 + bob, 14, 13, ASP.imp);
  g.ell(cx, base - 52 + bob, 11, 7, ASP.impL);
  g.ell(cx, base - 46 + bob, 5.4, 5, ASP.emberL);
  /* arms wreathed in flame */
  const spread = mode === 'attack' ? 10 : 0;
  for (const s of [-1, 1]) {
    limb(g, cx + s * 11, base - 54 + bob, cx + s * (24 + spread), base - 60 - spread + bob, s * 6, 5, ASP.imp);
    for (let k = 0; k < 3; k++)
      g.disc(cx + s * (25 + spread) + rr(-2, 2), base - 62 - spread - k * 3 + bob, 3 - k * 0.7, k ? ASP.ember : ASP.emberL);
  }
  /* crowned head */
  g.disc(cx, base - 68 + bob, 9, ASP.imp);
  g.disc(cx, base - 70 + bob, 6, ASP.impL);
  g.set(cx - 3, base - 69 + bob, ASP.emberL); g.set(cx + 3, base - 69 + bob, ASP.emberL);
  g.set(cx - 3, base - 69 + bob, C('#ffffff')); g.set(cx + 3, base - 69 + bob, C('#ffffff'));
  const jaw = mode === 'attack' ? 5 : 2;
  g.ell(cx, base - 63 + bob, 5, jaw * 0.7, C('#3a1008'));
  for (let k = -4; k <= 4; k++) {
    const hx = cx + k * 3.4, hh = 8 - Math.abs(k) * 1.1;
    g.poly([[hx - 1.6, base - 74 + bob], [hx, base - 74 - hh + bob], [hx + 1.6, base - 74 + bob]], k % 2 ? ASP.ember : ASP.emberL);
  }
  g.shade({ top: 0.14, bot: 0.18 }); g.outline(ASP.out);
  return g;
}

/* ============================================================
   THE ASHEN REACH — chapter three
   ============================================================ */
const ASP = {
  rock: C('#4a3a44'), rockD: C('#2f242e'), rockL: C('#6b5560'),
  ember: C('#ff7a2a'), emberL: C('#ffd06a'), emberD: C('#c0341a'),
  obsid: C('#241c2c'), obsidL: C('#4a3a58'),
  ash: C('#7a6f74'), ashL: C('#a89ba0'),
  imp: C('#8e2f22'), impL: C('#d9663a'), horn: C('#2a1a18'),
  iron: C('#5c5f6b'), ironD: C('#33353f'),
  eye: C('#ffe14d'), out: C('#170f16')
};
function tileAsh(seed, hot) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.18) ? ASP.rockD : (r.bool(0.13) ? ASP.rockL : ASP.rock));
  for (let k = 0; k < 3; k++) {
    let x = r.i(1, 14), y = r.i(1, 13);
    for (let s = 0; s < r.i(4, 9); s++) { g.set(x, y, ASP.obsid); x += r.i(-1, 1); y += r.i(0, 1); }
  }
  if (hot) {
    /* cracks glowing from underneath */
    for (let k = 0; k < 2; k++) {
      let x = r.i(2, 13), y = r.i(4, 13);
      for (let s = 0; s < r.i(4, 8); s++) {
        g.set(x, y, ASP.ember);
        g.set(x, y + 1, ASP.emberD);
        x += r.i(-1, 1); y += r.i(0, 1);
      }
    }
    for (let x = 0; x < 16; x++) {
      const d = 2 + r.i(0, 2);
      for (let y = 0; y < d; y++) g.set(x, y, r.bool(0.3) ? ASP.ashL : ASP.ash);
      if (r.bool(0.2)) g.set(x, d, ASP.emberD);
    }
  }
  return g;
}
function tileObsidian(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.2) ? ASP.obsidL : ASP.obsid);
  for (let k = 0; k < 4; k++) {
    const x = r.i(1, 13), y = r.i(1, 13), w = r.i(3, 7);
    g.line(x, y, x + w, y + r.i(-3, 3), ASP.obsidL);
  }
  g.rect(0, 0, 16, 1, C('#6a5680'));
  g.rect(0, 15, 16, 1, C('#150f1c'));
  for (let k = 0; k < 3; k++) g.set(r.i(0, 15), r.i(0, 15), ASP.ember);
  return g;
}
function ashPillarSprite(h, seed) {
  const g = new Pix(26, h), r = new RNG(seed);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const w = 8 + Math.sin(t * 6) * 2 + t * 4;
    g.rect(13 - w / 2, y, w, 1, r.bool(0.2) ? ASP.rockD : ASP.rock);
    g.set(13 - w / 2, y, ASP.rockL);
    g.set(13 + w / 2 - 1, y, ASP.rockD);
  }
  for (let k = 0; k < h / 4; k++) {
    const y = r.i(2, h - 3);
    g.rect(r.i(6, 16), y, r.i(2, 4), 1, ASP.ember);
  }
  g.shade({ top: 0.12, bot: 0.16 });
  g.outline(C('#150f16'));
  return g;
}
function emberlingFrame(i, n) {
  const g = new Pix(22, 22);
  const p = i / n * TAU;
  const hop = Math.max(0, Math.sin(p)) * 3;
  const cx = 11, base = 20 - hop;
  /* legs */
  for (const s of [-1, 1]) {
    g.thick(cx + s * 2, base - 6, cx + s * 3.5, base, 2, ASP.horn);
    g.rect(cx + s * 3.5 - 2, base - 1, 4, 2, ASP.horn);
  }
  /* body */
  g.ell(cx, base - 8, 5.4, 5.4, ASP.imp);
  g.ell(cx, base - 9, 4, 3.6, ASP.impL);
  g.ell(cx, base - 8, 2.2, 2.6, ASP.ember);
  /* arms */
  for (const s of [-1, 1]) g.thick(cx + s * 4, base - 10, cx + s * 7, base - 6 + Math.sin(p + s) * 1.5, 2, ASP.imp);
  /* head with horns */
  g.disc(cx, base - 14, 4.2, ASP.imp);
  g.disc(cx, base - 15, 2.8, ASP.impL);
  for (const s of [-1, 1]) g.poly([[cx + s * 3, base - 16], [cx + s * 5.5, base - 21], [cx + s * 1.5, base - 17]], ASP.horn);
  g.set(cx - 1.6, base - 14, ASP.eye); g.set(cx + 1.6, base - 14, ASP.eye);
  /* flame crest */
  for (let k = 0; k < 3; k++) {
    const fy = base - 18 - k * 1.6 + Math.sin(p * 3 + k) * 0.6;
    g.disc(cx + Math.sin(p * 2 + k) * 1.2, fy, 1.8 - k * 0.4, k === 0 ? ASP.ember : ASP.emberL);
  }
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(ASP.out);
  return g;
}
function golemFrame(mode, i, n) {
  const g = new Pix(38, 34);
  const p = i / n * TAU;
  const cx = 19, base = 31;
  const raise = mode === 'slam' ? 10 : 0;
  const bob = Math.sin(p * 2) * 0.8;
  /* legs */
  for (const s of [-1, 1]) {
    g.rect(cx + s * 6 - 3, base - 10 + bob, 6, 10, ASP.rock);
    g.rect(cx + s * 6 - 3, base - 2, 7, 3, ASP.rockD);
    g.rect(cx + s * 6 - 3, base - 10 + bob, 2, 10, ASP.rockL);
  }
  /* torso: cracked stone with a molten core */
  g.rect(cx - 9, base - 24 + bob, 18, 15, ASP.rock);
  g.rect(cx - 9, base - 24 + bob, 18, 2, ASP.rockL);
  g.rect(cx - 9, base - 11 + bob, 18, 2, ASP.rockD);
  g.ell(cx, base - 17 + bob, 4.4, 4, ASP.emberD);
  g.ell(cx, base - 17 + bob, 3, 2.6, ASP.ember);
  g.ell(cx, base - 17.6 + bob, 1.6, 1.4, ASP.emberL);
  const r = new RNG(19);
  for (let k = 0; k < 8; k++) g.rect(cx - 8 + r.i(0, 15), base - 23 + r.i(0, 12) + bob, r.i(2, 4), 1, ASP.rockD);
  /* arms, the right one hauled up to slam */
  g.rect(cx - 15, base - 23 + bob, 6, 13 - raise, ASP.rock);
  g.rect(cx - 15, base - 23 + bob, 2, 13 - raise, ASP.rockL);
  g.ell(cx - 12, base - 10 - raise + bob, 4.4, 3.6, ASP.rockD);
  g.rect(cx + 9, base - 23 - raise + bob, 6, 13, ASP.rock);
  g.rect(cx + 13, base - 23 - raise + bob, 2, 13, ASP.rockD);
  g.ell(cx + 12, base - 10 - raise + bob, 5, 4.2, ASP.rockD);
  if (raise) for (let k = 0; k < 4; k++) g.set(cx + 10 + k, base - 15 - raise + bob, ASP.ember);
  /* head */
  g.rect(cx - 5, base - 32 + bob, 10, 9, ASP.rock);
  g.rect(cx - 5, base - 32 + bob, 10, 2, ASP.rockL);
  g.rect(cx - 4, base - 28 + bob, 3, 2, ASP.ember);
  g.rect(cx + 1, base - 28 + bob, 3, 2, ASP.ember);
  for (const s of [-1, 1]) g.poly([[cx + s * 5, base - 31 + bob], [cx + s * 9, base - 35 + bob], [cx + s * 5, base - 27 + bob]], ASP.rockD);
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(ASP.out);
  return g;
}
function cinderwingFrame(i, n) {
  const g = new Pix(28, 22);
  const p = i / n * TAU;
  const cx = 14, cy = 11;
  const up = Math.sin(p) * 6;
  for (const s of [-1, 1]) {
    g.poly([[cx + s * 2, cy - 1], [cx + s * 8, cy - 6 + up], [cx + s * 13, cy - 2 + up * 1.2],
            [cx + s * 9, cy + 3 + up * 0.3], [cx + s * 3, cy + 2]], s < 0 ? ASP.emberD : ASP.ember);
    g.line(cx + s * 2, cy - 1, cx + s * 13, cy - 2 + up * 1.2, ASP.emberL);
  }
  g.ell(cx, cy, 3.6, 4, ASP.imp);
  g.ell(cx, cy + 1, 2.4, 2.4, ASP.ember);
  g.disc(cx + 3, cy - 3, 2.6, ASP.imp);
  g.poly([[cx + 5, cy - 4], [cx + 9, cy - 2.6], [cx + 5, cy - 1.6]], ASP.horn);
  g.set(cx + 3, cy - 3.6, ASP.eye);
  for (const s of [-1, 1]) g.poly([[cx + s * 2, cy - 3], [cx + s * 3.4, cy - 7], [cx + s * 0.6, cy - 3.6]], ASP.horn);
  for (let k = 0; k < 3; k++) g.disc(cx - 5 - k * 2.4, cy + 2 + Math.sin(p + k) * 1.4, 1.6 - k * 0.4, k ? ASP.emberD : ASP.ember);
  g.shade({ top: 0.15, bot: 0.16 });
  g.outline(ASP.out);
  return g;
}

/* ============================================================
   THE SUNKEN DEPTHS — chapter two
   ============================================================ */
const DPP = {
  stone: C('#3f5f6b'), stoneD: C('#284450'), stoneL: C('#5d8390'),
  coral: C('#c9556b'), coralL: C('#e8879a'), kelp: C('#2f7a5e'), kelpL: C('#4fae7f'),
  sand: C('#c8b98c'), sandD: C('#9c8d63'),
  jelly: C('#8f6fd0'), jellyL: C('#c9a8ff'), shell: C('#d9663a'), shellD: C('#9c3f1e'),
  fish: C('#2b4a63'), fishD: C('#172c3e'), lure: C('#a8f0d8'),
  eye: C('#ffe14d'), out: C('#101c26')
};
function tileDeepStone(seed, mossy) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.18) ? DPP.stoneD : (r.bool(0.14) ? DPP.stoneL : DPP.stone));
  for (let k = 0; k < 2; k++) {
    let y = r.i(3, 12);
    for (let x = 0; x < 16; x++) { g.set(x, y, C('#16262f')); if (r.bool(0.3)) y += r.i(-1, 1); }
  }
  for (let k = 0; k < 6; k++) g.disc(r.i(1, 14), r.i(1, 14), r.r(0.8, 1.6), r.bool() ? DPP.stoneL : DPP.stoneD);
  if (mossy) {
    for (let x = 0; x < 16; x++) {
      const d = 2 + r.i(0, 3);
      for (let y = 0; y < d; y++) g.set(x, y, r.bool(0.3) ? C('#215c47') : DPP.kelp);
      if (r.bool(0.35)) g.set(x, 0, DPP.kelpL);
    }
    for (let k = 0; k < 3; k++) g.disc(r.i(0, 15), r.i(2, 8), r.r(1, 2), DPP.coral);
  }
  return g;
}
function tileSand(seed) {
  const g = new Pix(16, 16), r = new RNG(seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
    g.set(x, y, r.bool(0.16) ? DPP.sandD : DPP.sand);
  for (let x = 0; x < 16; x++) {
    const d = 2 + Math.round(Math.sin(x * 0.6 + seed) * 1.2);
    for (let y = 0; y < d; y++) g.set(x, y, C('#e0d3a8'));
  }
  for (let k = 0; k < 8; k++) { const x = r.i(0, 14), y = r.i(3, 14); g.set(x, y, DPP.sandD); g.set(x + 1, y, DPP.sandD); }
  for (let k = 0; k < 3; k++) g.disc(r.i(1, 14), r.i(4, 14), r.r(0.8, 1.4), C('#f0e8cc'));
  return g;
}
function coralSprite(size, seed) {
  const r = new RNG(seed);
  const w = 22 + size * 14, h = 26 + size * 20;
  const g = new Pix(w, h);
  const cx = w / 2;
  const col = r.bool(0.5) ? DPP.coral : C('#d98c3a');
  const branch = (x, y, ang, len, wdt) => {
    if (len < 3) return;
    const nx = x + Math.cos(ang) * len, ny = y + Math.sin(ang) * len;
    g.thick(x, y, nx, ny, wdt, col);
    g.line(x, y, nx, ny, sh(col, 0.28));
    branch(nx, ny, ang - r.r(0.35, 0.8), len * r.r(0.55, 0.75), Math.max(1, wdt - 1));
    branch(nx, ny, ang + r.r(0.35, 0.8), len * r.r(0.55, 0.75), Math.max(1, wdt - 1));
  };
  branch(cx, h - 1, -Math.PI / 2, 9 + size * 5, 3 + size);
  for (let k = 0; k < 10 + size * 6; k++) {
    const x = r.i(1, w - 2), y = r.i(1, h - 2);
    if (g.alphaAt(x, y) > 200) g.set(x, y, r.bool() ? DPP.coralL : sh(col, -0.3));
  }
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(C('#3a1420'));
  return g;
}
function kelpSprite(len, seed) {
  const g = new Pix(14, len), r = new RNG(seed);
  for (let k = 0; k < 3; k++) {
    const x0 = 4 + r.r(0, 6);
    for (let y = 0; y < len; y++) {
      const t = y / len;
      const x = x0 + Math.sin(t * 5 + k) * 2.6 * (1 - t);
      g.set(x, len - 1 - y, k % 2 ? DPP.kelp : C('#215c47'));
      if (y % 5 === 0) { g.set(x - 2, len - 1 - y, DPP.kelpL); g.set(x + 2, len - 1 - y, DPP.kelp); }
    }
  }
  g.outline(C('#0f2b22'));
  return g;
}
function jellyFrame(i, n) {
  const g = new Pix(22, 26), r = new RNG(11);
  const p = i / n * TAU;
  const squash = 1 + Math.sin(p) * 0.2;
  const cx = 11, cy = 9;
  /* trailing stingers */
  for (let k = 0; k < 6; k++) {
    const x0 = cx - 5 + k * 2;
    for (let y = 0; y < 13; y++) {
      const t = y / 13;
      g.set(x0 + Math.sin(p + t * 3 + k) * 2.4 * t, cy + 5 + y, t > 0.6 ? DPP.jellyL : DPP.jelly);
    }
  }
  /* bell */
  g.ell(cx, cy, 8 * squash, 6 / squash, DPP.jelly);
  g.ell(cx, cy - 1, 6.4 * squash, 4.4 / squash, DPP.jellyL);
  g.ell(cx - 2, cy - 2.4, 3 * squash, 2 / squash, C('#f0e2ff'));
  g.rect(cx - 8 * squash, cy + 4 / squash, 16 * squash, 1, sh(DPP.jelly, -0.3));
  for (let k = 0; k < 5; k++) g.set(cx + r.r(-5, 5), cy + r.r(-2, 3), C('#ffffff'));
  g.shade({ top: 0.16, bot: 0.14 });
  g.outline(C('#2b1a4a'));
  return g;
}
function crabFrame(mode, i, n) {
  const g = new Pix(30, 22);
  const p = i / n * TAU;
  const cx = 15, base = 19;
  const bob = Math.sin(p * 2) * 0.8;
  /* legs */
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const ph = p + k * 0.9 + (s < 0 ? 1.6 : 0);
    const fx = cx + s * (7 + k * 2.4) + Math.sin(ph) * 2;
    limb(g, cx + s * 4, base - 6 + bob, fx, base - Math.max(0, Math.cos(ph)) * 2, s * 3, 2, DPP.shellD);
  }
  /* claws */
  const open = mode === 'charge' ? 3 : 1;
  for (const s of [-1, 1]) {
    const clx = cx + s * 11, cly = base - 9 + bob;
    limb(g, cx + s * 5, base - 8 + bob, clx, cly, s * 2, 3, DPP.shell);
    g.ell(clx + s * 2, cly, 3.6, 2.8, DPP.shell);
    g.poly([[clx + s * 1, cly - 1], [clx + s * 6, cly - 1 - open], [clx + s * 6, cly + 1]], DPP.shellD);
    g.poly([[clx + s * 1, cly + 1], [clx + s * 6, cly + 1 + open], [clx + s * 6, cly - 1]], DPP.shell);
  }
  /* shell */
  g.ell(cx, base - 8 + bob, 9, 6, DPP.shell);
  g.ell(cx, base - 10 + bob, 7.4, 3.6, sh(DPP.shell, 0.25));
  g.rect(cx - 9, base - 6 + bob, 18, 2, DPP.shellD);
  for (let k = -2; k <= 2; k++) g.disc(cx + k * 3.4, base - 9 + bob, 1.1, DPP.shellD);
  /* eyes on stalks */
  for (const s of [-1, 1]) {
    g.rect(cx + s * 3, base - 16 + bob, 1, 3, DPP.shellD);
    g.disc(cx + s * 3, base - 17 + bob, 1.6, C('#f6efdc'));
    g.set(cx + s * 3, base - 17 + bob, DPP.out);
  }
  g.shade({ top: 0.16, bot: 0.18 });
  g.outline(C('#3a1a10'));
  return g;
}
function anglerFrame(i, n) {
  const g = new Pix(34, 24);
  const p = i / n * TAU;
  const cx = 16, cy = 13;
  const swim = Math.sin(p) * 2;
  /* tail */
  g.poly([[cx - 8, cy], [cx - 16, cy - 6 + swim], [cx - 13, cy], [cx - 16, cy + 6 + swim]], DPP.fishD);
  /* body */
  g.ell(cx, cy, 9, 7.4, DPP.fish);
  g.ell(cx + 1, cy + 2.6, 7, 4, sh(DPP.fish, 0.2));
  g.ell(cx - 2, cy - 3, 5, 2.6, DPP.fishD);
  /* fins */
  g.poly([[cx - 2, cy - 7], [cx + 2, cy - 12 + swim], [cx + 4, cy - 6]], DPP.fishD);
  g.poly([[cx - 1, cy + 6], [cx + 1, cy + 11 - swim], [cx + 4, cy + 5]], DPP.fishD);
  /* jaw and teeth */
  g.poly([[cx + 6, cy - 3], [cx + 14, cy - 1], [cx + 6, cy + 4]], DPP.fish);
  g.poly([[cx + 6, cy + 1], [cx + 14, cy + 1], [cx + 6, cy + 5]], DPP.fishD);
  for (let k = 0; k < 5; k++) {
    g.poly([[cx + 6 + k * 1.7, cy - 0.6], [cx + 7 + k * 1.7, cy + 2], [cx + 8 + k * 1.7, cy - 0.6]], C('#f6efdc'));
    g.poly([[cx + 6 + k * 1.7, cy + 2.6], [cx + 7 + k * 1.7, cy + 0.4], [cx + 8 + k * 1.7, cy + 2.6]], C('#f6efdc'));
  }
  /* eye */
  g.disc(cx + 3, cy - 3, 2.2, C('#f6efdc'));
  g.disc(cx + 3.6, cy - 3, 1.1, DPP.out);
  /* the lure on its stalk */
  const lx = cx + 8 + Math.sin(p) * 1.4, ly = cy - 13 + Math.cos(p) * 1.2;
  g.thick(cx + 1, cy - 6, lx, ly, 1, DPP.fishD);
  g.disc(lx, ly, 2.4, DPP.lure);
  g.disc(lx, ly, 1.2, C('#ffffff'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(DPP.out);
  return g;
}

/* ============================================================
   THE REALM MAP
   ============================================================ */
function mapBackground() {
  const g = new Pix(VW, VH), r = new RNG(9091);
  const paper = C('#d8c49a'), paperD = C('#c0a97e'), paperL = C('#ebdcb6');
  const ink = C('#4a3826'), inkL = C('#6d543a');
  const sea = C('#7fa8b8'), seaD = C('#5f8698'), seaL = C('#a8cbd6');
  /* aged paper */
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++)
    g.set(x, y, r.bool(0.12) ? paperD : (r.bool(0.1) ? paperL : paper));
  /* stains */
  for (let k = 0; k < 26; k++) {
    const cx = r.i(0, VW), cy = r.i(0, VH), rad = r.r(6, 26);
    for (let y = cy - rad; y < cy + rad; y++) for (let x = cx - rad; x < cx + rad; x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d < 1 && r.bool(0.20 * (1 - d))) g.set(x, y, paperD);
    }
  }
  /* burnt edges */
  for (let x = 0; x < VW; x++) {
    const t = Math.min(x, VW - 1 - x) / 26;
    for (let y = 0; y < VH; y++) {
      const u = Math.min(y, VH - 1 - y) / 20;
      const e = Math.min(t, u);
      if (e < 1 && r.bool((1 - e) * 0.5)) g.set(x, y, e < 0.4 ? C('#8a6a45') : paperD);
    }
  }
  /* the sea, drawn as an inked coastline */
  const coast = (x) => VH * 0.62 + Math.sin(x * 0.021) * 20 + Math.sin(x * 0.008 + 2) * 14 + Math.sin(x * 0.05) * 5;
  for (let x = 6; x < VW - 6; x++) {
    const cy = coast(x);
    for (let y = Math.round(cy); y < VH - 8; y++) {
      const d = (y - cy) / (VH - 8 - cy);
      g.set(x, y, d < 0.05 ? seaL : (r.bool(0.16) ? seaD : sea));
    }
    g.set(x, Math.round(cy), ink);
    g.set(x, Math.round(cy) - 1, inkL);
  }
  /* wave hatching */
  for (let k = 0; k < 90; k++) {
    const x = r.i(10, VW - 20), y = r.i(0, VH - 12);
    if (y < coast(x) + 6) continue;
    for (let i = 0; i < r.i(3, 7); i++) g.set(x + i, y + (i % 2 ? 0 : 1), seaL);
  }
  /* inland hatching */
  for (let k = 0; k < 260; k++) {
    const x = r.i(8, VW - 10), y = r.i(14, VH - 14);
    if (y > coast(x) - 4) continue;
    if (r.bool(0.5)) { g.set(x, y, inkL); g.set(x + 1, y, inkL); }
    else { g.set(x, y, inkL); g.set(x, y + 1, inkL); }
  }
  /* compass rose */
  const cx = VW - 40, cy = VH - 40;
  for (const [dx, dy, len] of [[0, -1, 15], [0, 1, 15], [1, 0, 15], [-1, 0, 15]]) {
    for (let i = 0; i < len; i++) {
      const w = Math.max(0, 2 - Math.floor(i / 6));
      for (let o = -w; o <= w; o++)
        g.set(cx + dx * i + (dy ? o : 0), cy + dy * i + (dx ? o : 0), i < len - 3 ? ink : C('#b8862f'));
    }
  }
  for (const [dx, dy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]])
    for (let i = 0; i < 9; i++) g.set(cx + dx * i, cy + dy * i, inkL);
  g.disc(cx, cy, 3, C('#b8862f'));
  g.disc(cx, cy, 1, ink);
  return g;
}
function mapNodeSprite(theme) {
  const g = new Pix(64, 64), r = new RNG(theme.length * 137 + 7);
  const cx = 32, cy = 30, R = 24;
  if (theme === 'forest') {
    g.disc(cx, cy, R, C('#9fd4ee'));
    g.rect(cx - R, cy + 4, R * 2, R, C('#4f7f4a'));
    for (let x = cx - R; x < cx + R; x++) {
      const h = 6 + Math.sin((x - cx) * 0.35) * 4;
      for (let y = cy + 8 - h; y < cy + R; y++) if (Math.hypot(x - cx, y - cy) <= R) g.set(x, y, C('#3d6b40'));
    }
    for (let k = 0; k < 9; k++) {
      const x = cx - 18 + k * 4.5, y = cy + 2 + r.r(-3, 3);
      if (Math.hypot(x - cx, y - cy) > R - 3) continue;
      g.rect(x, y + 3, 1, 5, C('#54371f'));
      g.disc(x, y, r.r(2.6, 4), C('#2f5636'));
      g.disc(x - 0.6, y - 1, r.r(1.4, 2.4), C('#54924a'));
    }
    g.ell(cx + 12, cy + 12, 5, 4, C('#3c3c50'));
    g.ell(cx + 12, cy + 13, 3.2, 2.6, C('#0f0c18'));
  } else if (theme === 'cloud') {
    g.disc(cx, cy, R, C('#6fb6e8'));
    for (let k = 0; k < 10; k++) {
      const x = cx + r.r(-20, 20), y = cy + r.r(-6, 18);
      if (Math.hypot(x - cx, y - cy) > R - 2) continue;
      g.ell(x, y, r.r(6, 11), r.r(3.5, 6), C('#f2f6ff'));
      g.ell(x, y + 2, r.r(5, 9), r.r(2.5, 4), C('#cfdcf0'));
    }
    for (const [px, ph] of [[cx - 11, 15], [cx - 2, 19], [cx + 8, 14]]) {
      g.rect(px - 2, cy - ph, 5, ph, C('#eee6d2'));
      g.rect(px - 2, cy - ph, 2, ph, C('#fffaf0'));
      g.rect(px - 4, cy - ph - 2, 9, 3, C('#dcd2ba'));
      g.rect(px - 4, cy - 1, 9, 3, C('#dcd2ba'));
    }
    /* a bolt over the city */
    g.poly([[cx + 15, cy - 22], [cx + 9, cy - 10], [cx + 13, cy - 10], [cx + 7, cy + 1],
            [cx + 17, cy - 12], [cx + 13, cy - 12], [cx + 19, cy - 22]], C('#ffe14d'));
  } else if (theme === 'tutorial') {
    g.disc(cx, cy, R, C('#9fd4ee'));
    g.rect(cx - R, cy + 6, R * 2, R, C('#4f9a3f'));
    for (let x = cx - R; x < cx + R; x++)
      for (let y = cy + 4; y < cy + R; y++)
        if (Math.hypot(x - cx, y - cy) <= R) g.set(x, y, r.bool(0.2) ? C('#367030') : C('#4f9a3f'));
    /* a straw dummy on a post, and a practice blade stuck in the turf */
    g.rect(cx - 3, cy - 2, 3, 14, C('#7a5230'));
    g.ell(cx - 2, cy - 6, 5, 5, C('#d9c07a'));
    g.rect(cx - 8, cy - 3, 13, 4, C('#c9a95a'));
    g.set(cx - 4, cy - 7, C('#3a2a1c')); g.set(cx, cy - 7, C('#3a2a1c'));
    g.thick(cx + 11, cy + 10, cx + 9, cy - 6, 2, C('#c9d4e8'));
    g.thick(cx + 6, cy - 4, cx + 12, cy - 4, 2, C('#c68e3f'));
    /* a couple of fence rails */
    for (const fx of [cx - 16, cx + 16]) g.rect(fx, cy + 2, 2, 10, C('#6a4a2a'));
    g.rect(cx - 16, cy + 4, 34, 2, C('#7a5230'));
  } else if (theme === 'shore' || theme === 'drowned' || theme === 'abyss') {
    const deep = theme === 'abyss' ? 0.55 : (theme === 'drowned' ? 0.3 : 0);
    g.disc(cx, cy, R, mixc(C('#5fa3dc'), C('#0d1c30'), deep));
    for (let k = 0; k < 5; k++) {
      const y = cy - 14 + k * 7;
      for (let x = cx - R; x < cx + R; x++)
        if (Math.hypot(x - cx, y - cy) <= R - 1 && ((x + k) % 5) < 3)
          g.set(x, y + Math.sin(x * 0.4 + k) * 1.2, mixc(C('#a8cbd6'), C('#1d3a52'), deep));
    }
    if (theme === 'shore') {
      g.rect(cx - R, cy + 10, R * 2, R, C('#c8b98c'));
      for (let k = 0; k < 3; k++) g.ell(cx - 12 + k * 12, cy + 10, 5, 2.4, C('#e0d3a8'));
    }
    if (theme === 'drowned') for (const px of [cx - 12, cx + 2, cx + 12]) {
      g.rect(px - 2, cy - 6, 5, 20, C('#3f5f6b'));
      g.rect(px - 4, cy - 9, 9, 3, C('#5d8390'));
    }
    if (theme === 'abyss') {
      for (const s of [-1, 1]) { g.disc(cx + s * 7, cy - 2, 4, C('#f6efdc')); g.disc(cx + s * 7, cy - 2, 2, C('#101c26')); }
      for (let k = 0; k < 6; k++) g.thick(cx + (k - 2.5) * 6, cy + 6, cx + (k - 2.5) * 9, cy + 20, 2, C('#6b2f6b'));
    }
    for (let k = 0; k < 8; k++) g.disc(cx + r.r(-R * 0.8, R * 0.8), cy + r.r(-R * 0.8, R * 0.8), r.r(0.8, 1.6), C('#cfeaff'));
  } else if (theme === 'cinder' || theme === 'obsidian' || theme === 'molten') {
    g.disc(cx, cy, R, theme === 'molten' ? C('#5a1408') : C('#241c2c'));
    for (let x = cx - R; x < cx + R; x++) {
      const h = 8 + Math.sin(x * 0.3) * 5 + Math.sin(x * 0.11) * 6;
      for (let y = cy + 24 - h; y < cy + R; y++)
        if (Math.hypot(x - cx, y - cy) <= R - 1) g.set(x, y, theme === 'obsidian' ? C('#241c2c') : C('#4a3a44'));
    }
    for (let k = 0; k < 22; k++) {
      const x = cx + r.r(-R * 0.9, R * 0.9), y = cy + r.r(-4, R * 0.85);
      if (Math.hypot(x - cx, y - cy) > R - 2) continue;
      g.set(x, y, r.bool(0.5) ? C('#ff7a2a') : C('#ffd06a'));
    }
    if (theme === 'obsidian') for (let k = -2; k <= 2; k++)
      g.poly([[cx + k * 9, cy + 16], [cx + k * 9 - 4, cy - 6 - Math.abs(k) * -4], [cx + k * 9 + 4, cy + 16]], C('#4a3a58'));
    if (theme === 'molten') {
      g.ell(cx, cy + 14, 18, 6, C('#ff7a2a'));
      g.ell(cx, cy + 13, 12, 3.6, C('#ffd06a'));
      for (let k = 0; k < 6; k++) g.disc(cx + r.r(-14, 14), cy + r.r(-2, 8), r.r(1.2, 2.6), C('#ffd06a'));
    }
    for (let k = 0; k < 10; k++) g.disc(cx + r.r(-R * 0.8, R * 0.8), cy + r.r(-R * 0.9, 0), r.r(0.7, 1.4), C('#ff9a4a'));
  } else {
    g.disc(cx, cy, R, C('#2a1e38'));
    g.rect(cx - R, cy + 6, R * 2, R, C('#3b2a4d'));
    for (let k = 0; k < 40; k++) {
      const x = cx + r.r(-R, R), y = cy + r.r(-R, R);
      if (Math.hypot(x - cx, y - cy) > R - 1) continue;
      if (r.bool(0.4)) g.set(x, y, C('#7a5ea8'));
    }
    const caps = [[cx - 13, cy + 6, 8, '#c9403a'], [cx + 10, cy + 8, 6, '#d98c3a'], [cx - 1, cy + 2, 10, '#c9403a']];
    for (const [mx, my, mr, col] of caps) {
      g.rect(mx - 2, my, 4, 12, C('#e8dcc0'));
      g.ell(mx, my, mr, mr * 0.72, C(col));
      g.ell(mx - mr * 0.25, my - mr * 0.2, mr * 0.6, mr * 0.42, sh(C(col), 0.28));
      for (let k = 0; k < 4; k++) g.disc(mx + r.r(-mr * 0.7, mr * 0.7), my + r.r(-mr * 0.4, mr * 0.3), r.r(0.9, 1.6), C('#f6efdc'));
    }
    for (let k = 0; k < 14; k++) {
      const x = cx + r.r(-R, R), y = cy + r.r(-R, 0);
      if (Math.hypot(x - cx, y - cy) > R - 2) continue;
      g.set(x, y, C('#9be89a'));
    }
  }
  /* medallion frame */
  for (let a2 = 0; a2 < 360; a2 += 2) {
    const rad = a2 * Math.PI / 180;
    g.set(cx + Math.cos(rad) * R, cy + Math.sin(rad) * R, C('#4a3826'));
    g.set(cx + Math.cos(rad) * (R + 1), cy + Math.sin(rad) * (R + 1), C('#b8862f'));
    g.set(cx + Math.cos(rad) * (R + 2), cy + Math.sin(rad) * (R + 2), C('#8a6224'));
  }
  for (let k = 0; k < 8; k++) {
    const rad = k / 8 * TAU + 0.4;
    g.disc(cx + Math.cos(rad) * (R + 2), cy + Math.sin(rad) * (R + 2), 1.6, C('#e0b166'));
  }
  return g;
}
function signSprite() {
  const g = new Pix(20, 26), r = new RNG(555);
  g.rect(9, 10, 3, 16, C('#6a4a2a'));
  g.rect(9, 10, 1, 16, C('#8a6236'));
  g.rect(1, 2, 18, 11, C('#9c6c41'));
  g.rect(1, 2, 18, 2, C('#b98a55'));
  g.rect(1, 11, 18, 2, C('#5c3c22'));
  for (let k = 0; k < 14; k++) g.rect(r.i(2, 16), r.i(4, 10), r.i(2, 4), 1, r.bool() ? C('#7a5230') : C('#a97a48'));
  for (const [x, y] of [[3, 4], [16, 4], [3, 10], [16, 10]]) g.rect(x, y, 2, 2, C('#5f6774'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#2a1a10'));
  return g;
}
function idolSprite(i, n) {
  const g = new Pix(28, 28);
  const glow = Math.abs(Math.sin(i / n * Math.PI));
  g.ell(14, 15, 12, 13, TP.rock);
  g.ell(12, 12, 9, 9, TP.rockL);
  g.ell(14, 18, 9, 7, TP.rockD);
  const r = new RNG(31);
  for (let k = 0; k < 26; k++) g.set(r.i(3, 24), r.i(3, 25), r.bool() ? TP.rockX : TP.rockL);
  /* a carved face with a glowing mouth */
  for (const s of [-1, 1]) {
    g.poly([[14 + s * 4, 10], [14 + s * 8, 12], [14 + s * 4, 14]], TP.rockX);
    g.ell(14 + s * 5, 12, 1.6, 1.4, mixc(C('#ff7a2a'), C('#ffd06a'), glow));
  }
  g.ell(14, 20, 5.4, 3.0 + glow, TP.rockX);
  g.ell(14, 20, 4.2, 2.0 + glow, mixc(C('#c0341a'), C('#ffd06a'), glow));
  g.ell(14, 20, 2.4, 1.0 + glow * 0.8, C('#fff4d6'));
  for (let k = 0; k < 5; k++) g.poly([[8 + k * 3, 17], [9 + k * 3, 19], [10 + k * 3, 17]], C('#efe6d2'));
  g.rect(2, 3, 24, 1, TP.rockL);
  g.shade({ top: 0.14, bot: 0.18 });
  g.outline(C('#1d1d2c'));
  return g;
}
function lockSprite() {
  const g = new Pix(16, 18);
  g.rect(3, 7, 10, 9, C('#8a94a6'));
  g.rect(3, 7, 10, 2, C('#c0c8d6'));
  g.rect(3, 14, 10, 2, C('#5f6774'));
  for (let x = 5; x <= 10; x++) { g.set(x, 2, C('#c0c8d6')); }
  g.rect(4, 3, 2, 5, C('#a8b0c0')); g.rect(10, 3, 2, 5, C('#a8b0c0'));
  g.set(5, 2, C('#c0c8d6')); g.set(10, 2, C('#c0c8d6'));
  g.disc(8, 11, 1.6, C('#3a4150'));
  g.rect(7, 11, 2, 4, C('#3a4150'));
  g.shade({ top: 0.18, bot: 0.2 });
  g.outline(C('#20242e'));
  return g;
}
function mapIconSprite() {
  const g = new Pix(22, 22);
  /* a folded chart */
  g.rect(1, 3, 20, 16, C('#d8c49a'));
  g.rect(1, 3, 20, 2, C('#ebdcb6'));
  g.rect(1, 17, 20, 2, C('#c0a97e'));
  g.rect(7, 3, 1, 16, C('#b09a72'));
  g.rect(14, 3, 1, 16, C('#b09a72'));
  /* route and markers */
  for (let x = 3; x < 19; x += 2) g.set(x, 12 - Math.round(Math.sin(x * 0.5) * 3), C('#8a6a45'));
  g.disc(4, 14, 1.6, C('#4f7f4a'));
  g.disc(11, 8, 1.6, C('#6fb6e8'));
  g.disc(18, 13, 1.6, C('#c9403a'));
  g.shade({ top: 0.14, bot: 0.16 });
  g.outline(C('#3a2c1c'));
  return g;
}

Art.buildGold = function () {
  if (Art.heroGold) return;
  const save = {};
  for (const k in HP) save[k] = HP[k];
  const gold = {
    skin: C('#ffe9a8'), skinD: C('#d8a832'), skinL: C('#fffbe0'),
    hair: C('#e0b166'), hairD: C('#a87c2e'), hairL: C('#ffeec0'),
    tunic: C('#f0c93a'), tunicD: C('#b8862f'), tunicL: C('#ffeec0'),
    belt: C('#8a5f26'), beltD: C('#5c3f16'),
    legs: C('#ffe9a8'), legsD: C('#c69a3a'),
    boot: C('#a87c2e'), bootD: C('#6d4e18'),
    scarf: C('#fff4d6'), scarfD: C('#e0b166'),
    blade: C('#fffbe0'), bladeD: C('#d8a832'), bladeE: C('#ffffff'),
    hilt: C('#fff4d6'), hiltD: C('#c69a3a'),
    out: C('#4a3208')
  };
  for (const k in gold) HP[k] = gold[k];
  const H = {
    anchor: Art.hero.anchor,
    idle: frames(8, i => heroFrame(poseIdle(i))),
    walk: frames(8, i => heroFrame(poseWalk(i))),
    run: frames(8, i => heroFrame(poseRun(i))),
    jump: [heroFrame(poseJump()).canvas()],
    fall: [heroFrame(poseFall()).canvas()],
    land: [heroFrame(poseLand()).canvas()],
    dash: [heroFrame(poseDash(0)).canvas(), heroFrame(poseDash(1)).canvas()],
    atk: frames(6, i => heroFrame(poseAtk(i))),
    pierce: [heroFrame(posePierce(0)).canvas(), heroFrame(posePierce(1)).canvas()],
    climb: frames(6, i => heroFrame(poseClimb(i))),
    swim: frames(6, i => heroFrame(poseSwim(i))),
    swimIdle: frames(4, i => heroFrame(poseSwimIdle(i))),
    crouch: frames(4, i => heroFrame(poseCrouch(i))),
    roll: frames(4, i => heroFrame(poseRoll(i))),
    flip: frames(4, i => heroFrame(poseFlip(i))),
    rollcut: frames(4, i => heroFrame(poseRollCut(i)))
  };
  const T = { anchor: Art.top.anchor, walk: [], idle: [], atk: [] };
  for (let d = 0; d < 4; d++) {
    T.walk.push(frames(8, i => heroTopFrame(d, i)));
    T.idle.push([heroTopFrame(d, 0).canvas(), heroTopFrame(d, 4).canvas()]);
    T.atk.push(ATK_TOP.map(ang => heroTopFrame(d, 0, ang).canvas()));
  }
  for (const k in save) HP[k] = save[k];
  Art.heroGold = H; Art.topGold = T;
};

/* ============================================================
   BUILD — runs in slices so the loading screen can animate
   ============================================================ */
function frames(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(i, n).canvas());
  return out;
}
function prop(pix, ax, ay) { return { c: pix.canvas(), ax: ax, ay: ay, w: pix.w, h: pix.h }; }

Art.steps = function () {
  const S = [];
  const push = (label, fn) => S.push({ label: label, fn: fn });

  push('HERO', () => {
    Art.hero.anchor = { x: HERO_AX, y: HERO_AY };
    Art.hero.idle = frames(8, i => heroFrame(poseIdle(i)));
    Art.hero.walk = frames(8, i => heroFrame(poseWalk(i)));
  });
  push('HERO', () => {
    Art.hero.run = frames(8, i => heroFrame(poseRun(i)));
    Art.hero.jump = [heroFrame(poseJump()).canvas()];
    Art.hero.fall = [heroFrame(poseFall()).canvas()];
    Art.hero.land = [heroFrame(poseLand()).canvas()];
    Art.hero.dash = [heroFrame(poseDash(0)).canvas(), heroFrame(poseDash(1)).canvas()];
    Art.hero.pierce = [heroFrame(posePierce(0)).canvas(), heroFrame(posePierce(1)).canvas()];
    Art.hero.climb = frames(6, i => heroFrame(poseClimb(i)));
    Art.hero.swim = frames(6, i => heroFrame(poseSwim(i)));
    Art.hero.swimIdle = frames(4, i => heroFrame(poseSwimIdle(i)));
    Art.hero.atk = frames(6, i => heroFrame(poseAtk(i)));
    Art.hero.crouch = frames(4, i => heroFrame(poseCrouch(i)));
    Art.hero.roll = frames(4, i => heroFrame(poseRoll(i)));
    Art.hero.flip = frames(4, i => heroFrame(poseFlip(i)));
    Art.hero.rollcut = frames(4, i => heroFrame(poseRollCut(i)));
  });
  push('HERO', () => {
    Art.top.anchor = { x: 13, y: 13 };
    Art.top.walk = [];
    Art.top.idle = [];
    Art.top.atk = [];
    for (let d = 0; d < 4; d++) {
      Art.top.walk.push(frames(8, i => heroTopFrame(d, i)));
      Art.top.idle.push([heroTopFrame(d, 0).canvas(), heroTopFrame(d, 4).canvas()]);
      Art.top.atk.push(ATK_TOP.map(ang => heroTopFrame(d, 0, ang).canvas()));
    }
  });
  push('BEASTS', () => {
    Art.snake.anchor = { x: 16, y: 16 };
    Art.snake.move = frames(8, (i, n) => snakeFrame(i, n));
    Art.bat.anchor = { x: 14, y: 11 };
    Art.bat.fly = frames(6, (i, n) => batFrame(i, n));
  });
  push('BEASTS', () => {
    Art.bird.anchor = { x: 13, y: 10 };
    Art.bird.fly = frames(6, (i, n) => birdFrame('fly', i, n));
    Art.bird.dive = [birdFrame('dive', 0, 2).canvas(), birdFrame('dive', 1, 2).canvas()];
    Art.spider.anchor = { x: 14, y: 11 };
    Art.spider.walk = frames(6, (i, n) => spiderFrame(i, n, 'walk'));
    Art.spider.hang = frames(6, (i, n) => spiderFrame(i, n, 'hang'));
  });
  push('BEASTS', () => {
    Art.bear.anchor = { x: 23, y: 31 };
    Art.bear.walk = frames(8, (i, n) => bearFrame('walk', i, n));
    Art.bear.charge = frames(6, (i, n) => bearFrame('charge', i, n));
    Art.bear.roar = [bearFrame('roar', 0, 2).canvas(), bearFrame('roar', 1, 2).canvas()];
  });
  push('THE DRAGON', () => {
    Art.dragon.anchor = { x: DR_AX, y: DR_AY };
    Art.dragon.fly = frames(6, (i, n) => dragonFrame(i, n, 'fly'));
  });
  push('THE DRAGON', () => {
    Art.dragon.idle = frames(4, (i, n) => dragonFrame(i, n, 'idle'));
    Art.dragon.breathe = frames(4, (i, n) => dragonFrame(i, n, 'breathe'));
    Art.dragon.roar = frames(2, (i, n) => dragonFrame(i, n, 'roar'));
  });
  push('TREASURE', () => {
    Art.item.coin = frames(8, (i, n) => coinFrame(i, n));
    Art.item.coinAnchor = { x: 7, y: 7 };
    Art.item.heart = { full: heartSprite('full').canvas(), half: heartSprite('half').canvas(), empty: heartSprite('empty').canvas() };
    Art.item.key = keySprite().canvas();
    Art.item.potion = potionSprite().canvas();
    Art.item.boot = bootSprite().canvas();
    Art.item.sword = swordIcon().canvas();
    Art.item.ring = ringIcon('#59c9e8').canvas();
    Art.item.ward = ringIcon('#c9403a').canvas();
    Art.item.magnet = magnetIcon().canvas();
    Art.item.sigil = sigilIcon().canvas();
    Art.item.wings = wingsIcon().canvas();
    Art.item.mantle = mantleIcon().canvas();
    Art.item.emberheart = emberheartIcon().canvas();
    Art.item.paper = paperSprite().canvas();
    Art.item.wave = frames(4, (i, n) => waveSprite(i, n));
    Art.ui.codes = codesIcon().canvas();
    Art.ui.gear = gearIcon().canvas();
    Art.ui.doorBtn = doorBtnIcon().canvas();
    Art.ui.swimBtn = swimBtnIcon().canvas();
    Art.ui.shop = shopIcon().canvas();
    Art.item.fireball = frames(4, (i, n) => fireballSprite(i, n));
  });
  push('TERRAIN', () => {
    Art.tile.grass = []; Art.tile.dirt = []; Art.tile.path = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.grass.push(tileGrass(101 + i).canvas());
      Art.tile.dirt.push(tileDirt(211 + i).canvas());
      Art.tile.path.push(tilePath(311 + i).canvas());
    }
  });
  push('TERRAIN', () => {
    Art.tile.rock = []; Art.tile.rockTop = []; Art.tile.caveBg = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.rock.push(tileRock(401 + i, false).canvas());
      Art.tile.rockTop.push(tileRock(501 + i, true).canvas());
      Art.tile.caveBg.push(tileCaveBg(601 + i).canvas());
    }
    Art.tile.wood = [tileWood(701).canvas(), tileWood(702).canvas()];
    Art.tile.water = frames(8, i => tileWater(i, false));
    Art.tile.waterDeep = frames(8, i => tileWater(i, true));
  });
  push('THE FOREST', () => {
    Art.prop.trees = [];
    for (let s = 0; s < 3; s++) for (let v = 0; v < 3; v++) {
      const p = treeSprite(s, 900 + s * 10 + v);
      Art.prop.trees.push({ c: p.canvas(), ax: p.w / 2, ay: p.h, w: p.w, h: p.h, size: s });
    }
  });
  push('THE FOREST', () => {
    Art.prop.bush = [];
    for (let i = 0; i < 3; i++) { const p = bushSprite(1000 + i); Art.prop.bush.push(prop(p, p.w / 2, p.h)); }
    Art.prop.tuft = [];
    for (let i = 0; i < 4; i++) { const p = tuftSprite(1100 + i); Art.prop.tuft.push(prop(p, p.w / 2, p.h)); }
    Art.prop.flower = [];
    ['#e8557a', '#f0c93a', '#9a6fd8', '#f2f0e6', '#5fa3dc'].forEach((c, i) => {
      const p = flowerSprite(c, 1200 + i); Art.prop.flower.push(prop(p, p.w / 2, p.h));
    });
    Art.prop.mushroom = [];
    for (let i = 0; i < 3; i++) { const p = mushroomSprite(1300 + i); Art.prop.mushroom.push(prop(p, p.w / 2, p.h)); }
    Art.prop.rock = [];
    for (let i = 0; i < 3; i++) { const p = rockSprite(1400 + i); Art.prop.rock.push(prop(p, p.w / 2, p.h)); }
    Art.prop.reed = [];
    for (let i = 0; i < 3; i++) { const p = reedSprite(1500 + i); Art.prop.reed.push(prop(p, p.w / 2, p.h)); }
  });
  push('THE CAVE', () => {
    Art.prop.stal = [];
    for (let i = 0; i < 4; i++) { const p = stalactiteSprite(10 + i * 6, 1600 + i); Art.prop.stal.push(prop(p, p.w / 2, 0)); }
    Art.prop.crystal = [];
    ['#59c9e8', '#a86fe0', '#5ce09a'].forEach((c, i) => {
      const p = crystalSprite(c, 1700 + i); Art.prop.crystal.push(prop(p, p.w / 2, p.h));
    });
    Art.prop.torch = prop(torchSprite(), 5, 18);
    const ar = arrowSprite();
    Art.prop.arrow = { right: prop(ar, 11, 11), left: prop(ar.flipX(), 11, 11),
                       down: prop(ar.rotCW(), 11, 11), up: prop(ar.rotCW().rotCW().rotCW(), 11, 11) };
    Art.prop.support = prop(supportSprite(80), 22, 80);
    Art.prop.rail = prop(railSprite(), 0, 7);
    Art.prop.cart = prop(cartSprite(), 14, 21);
    Art.prop.lantern = prop(lanternSprite(), 6, 0);
    Art.prop.ore = ['#59c9e8', '#f0c93a', '#c9403a', '#5ce09a'].map(c => {
      const p = oreSprite(c); return prop(p, p.w / 2, p.h);
    });
    Art.prop.doorCave = prop(doorSprite('cave'), 16, 44);
    Art.prop.doorMaze = prop(doorSprite('maze'), 16, 44);
  });
  push('AETHER CITY', () => {
    Art.tile.cloud = []; Art.tile.marble = []; Art.tile.cloudLedge = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.cloud.push(tileCloud(801 + i).canvas());
      Art.tile.marble.push(tileMarble(811 + i).canvas());
      Art.tile.cloudLedge.push(tileCloudLedge(821 + i).canvas());
    }
    Art.prop.column = [prop(columnSprite(54), 12, 54), prop(columnSprite(76), 12, 76)];
    Art.prop.brazier = prop(brazierSprite(), 10, 22);
    Art.prop.statue = prop(statueSprite(), 11, 34);
    Art.prop.puff = [cloudPuffSprite(831).canvas(), cloudPuffSprite(832).canvas(), cloudPuffSprite(833).canvas()];
    Art.wisp.anchor = { x: 11, y: 11 };
    Art.wisp.fly = frames(6, (i, n) => wispFrame(i, n));
  });
  push('ZEUS', () => {
    Art.zeus.anchor = { x: ZAX, y: ZAY };
    Art.zeus.idle = frames(4, (i, n) => zeusFrame('idle', i, n));
    Art.zeus.cast = frames(4, (i, n) => zeusFrame('cast', i, n));
    Art.zeus.throw = frames(3, (i, n) => zeusFrame('throw', i, n));
  });
  push('SPOREWOOD', () => {
    Art.tile.ladder = { l: tileLadder(-1).canvas(), r: tileLadder(1).canvas(), c: tileLadder(0).canvas() };
    Art.tile.myc = []; Art.tile.bounce = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.myc.push(tileMycelium(841 + i).canvas());
      Art.tile.bounce.push(tileBounceCap(851 + i).canvas());
    }
    Art.prop.shroom = [];
    for (let s = 0; s < 3; s++) for (let v = 0; v < 2; v++) {
      const p = giantShroomSprite(s, 861 + s * 5 + v);
      Art.prop.shroom.push({ c: p.canvas(), ax: p.w / 2, ay: p.h, w: p.w, h: p.h });
    }
    Art.sporeling.anchor = { x: 12, y: 21 };
    Art.sporeling.hop = frames(8, (i, n) => sporelingFrame(i, n));
  });
  push('THE MOTHER SPORE', () => {
    Art.mother.anchor = { x: MAX, y: MAY };
    Art.mother.idle = frames(4, (i, n) => motherFrame('idle', i, n));
    Art.mother.burst = frames(4, (i, n) => motherFrame('burst', i, n));
    Art.mother.spawn = frames(4, (i, n) => motherFrame('spawn', i, n));
  });
  push('THE DEPTHS', () => {
    Art.tile.deepStone = []; Art.tile.deepTop = []; Art.tile.sand = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.deepStone.push(tileDeepStone(901 + i, false).canvas());
      Art.tile.deepTop.push(tileDeepStone(911 + i, true).canvas());
      Art.tile.sand.push(tileSand(921 + i).canvas());
    }
    Art.prop.coral = [];
    for (let s = 0; s < 3; s++) { const p = coralSprite(s, 931 + s); Art.prop.coral.push(prop(p, p.w / 2, p.h)); }
    Art.prop.kelp = [];
    for (let i = 0; i < 3; i++) { const p = kelpSprite(26 + i * 12, 941 + i); Art.prop.kelp.push(prop(p, p.w / 2, p.h)); }
    Art.jelly = { anchor: { x: 11, y: 9 }, swim: frames(6, (i, n) => jellyFrame(i, n)) };
    Art.crab = { anchor: { x: 15, y: 21 }, walk: frames(6, (i, n) => crabFrame('walk', i, n)),
                 charge: frames(4, (i, n) => crabFrame('charge', i, n)) };
    Art.angler = { anchor: { x: 16, y: 13 }, swim: frames(6, (i, n) => anglerFrame(i, n)) };
  });
  push('THE ASHEN REACH', () => {
    Art.tile.ash = []; Art.tile.ashTop = []; Art.tile.obsid = [];
    for (let i = 0; i < 4; i++) {
      Art.tile.ash.push(tileAsh(951 + i, false).canvas());
      Art.tile.ashTop.push(tileAsh(961 + i, true).canvas());
      Art.tile.obsid.push(tileObsidian(971 + i).canvas());
    }
    Art.prop.pillar = [prop(ashPillarSprite(46, 981), 13, 46), prop(ashPillarSprite(70, 982), 13, 70)];
    Art.emberling = { anchor: { x: 11, y: 21 }, hop: frames(8, (i, n) => emberlingFrame(i, n)) };
    Art.golem = { anchor: { x: 19, y: 32 }, walk: frames(6, (i, n) => golemFrame('walk', i, n)),
                  slam: frames(4, (i, n) => golemFrame('slam', i, n)) };
    Art.cinderwing = { anchor: { x: 14, y: 11 }, fly: frames(6, (i, n) => cinderwingFrame(i, n)) };
  });
  push('THE GUARDIANS', () => {
    const anch = { x: GB_AX, y: GB_AY };
    const mk = (fn) => ({ anchor: anch, idle: frames(4, (i, n) => fn('idle', i, n)),
                          attack: frames(4, (i, n) => fn('attack', i, n)) });
    Art.tideWarden = mk(tideWardenFrame);
    Art.kraken = mk(krakenFrame);
    Art.leviathan = mk(leviathanFrame);
  });
  push('THE GUARDIANS', () => {
    const anch = { x: GB_AX, y: GB_AY };
    const mk = (fn) => ({ anchor: anch, idle: frames(4, (i, n) => fn('idle', i, n)),
                          attack: frames(4, (i, n) => fn('attack', i, n)) });
    Art.forgefiend = mk(forgefiendFrame);
    Art.ashTitan = mk(ashTitanFrame);
    Art.ifrit = mk(ifritFrame);
  });
  push('THE REALM', () => {
    Art.map.bg = mapBackground().canvas();
    Art.map.tutorial = mapNodeSprite('tutorial').canvas();
    Art.prop.sign = prop(signSprite(), 10, 26);
    Art.idol = { anchor: { x: 14, y: 27 }, idle: frames(6, (i, n) => idolSprite(i, n)) };
    Art.map.node = ['forest', 'cloud', 'mush', 'shore', 'drowned', 'abyss', 'cinder', 'obsidian', 'molten']
      .map(t => mapNodeSprite(t).canvas());
    Art.map.lock = lockSprite().canvas();
    Art.ui.map = mapIconSprite().canvas();
  });
  push('THE SKY', () => {
    Art.bg.mtnFar = mountainLayer(512, 108, 21, '#5a6a94', true).canvas();
    Art.bg.mtnNear = mountainLayer(512, 96, 33, '#47547d', true).canvas();
  });
  push('THE SKY', () => {
    Art.bg.hillFar = hillLayer(512, 76, 44, '#4f7f4a', '#63a055').canvas();
    Art.bg.hillMid = hillLayer(512, 84, 55, '#3d6b40', '#54924a').canvas();
    Art.bg.hillNear = hillLayer(512, 92, 66, '#2f5636', '#417a3d').canvas();
    Art.bg.treeFar = treeLineLayer(512, 84, 77, '#2c4c37').canvas();
    Art.bg.treeMid = treeLineLayer(512, 96, 88, '#22402e').canvas();
    Art.bg.clouds = [cloudSprite(1801).canvas(), cloudSprite(1802).canvas(), cloudSprite(1803).canvas()];
    Art.bg.sun = sunSprite(14, '#ffe9a8', true).canvas();
  });
  return S;
};
