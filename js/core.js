/* ============================================================
   core.js — constants, math, seeded RNG, colour, pixel canvas,
             bitmap font, input, display scaling.
   ============================================================ */
'use strict';

const TILE = 16;
const VW = 384, VH = 216;          // virtual (pixel) resolution
const STEP = 1 / 60;               // fixed simulation step

/* ---------- math ---------- */
const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
const lerp  = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
function approach(v, t, d) { return v < t ? Math.min(v + d, t) : Math.max(v - d, t); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------- seeded rng ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class RNG {
  constructor(s) { this.f = mulberry32((s | 0) || 1); }
  n() { return this.f(); }
  r(a, b) { return a + this.f() * (b - a); }
  i(a, b) { return Math.floor(a + this.f() * (b - a + 1)); }
  pick(a) { return a[this.i(0, a.length - 1)]; }
  bool(p) { return this.f() < (p === undefined ? 0.5 : p); }
}
function rr(a, b) { return a + Math.random() * (b - a); }
function ri(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function rpick(a) { return a[(Math.random() * a.length) | 0]; }

/* ---------- colour ---------- */
function C(h) {
  if (typeof h !== 'string') return h;
  let s = h[0] === '#' ? h.slice(1) : h;
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16),
          parseInt(s.slice(4, 6), 16), s.length > 6 ? parseInt(s.slice(6, 8), 16) : 255];
}
function mixc(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t, a[3] === undefined ? 255 : a[3]];
}
/* t>0 lightens, t<0 darkens */
function sh(c, t) { return t >= 0 ? mixc(c, [255, 255, 255, 255], t) : mixc(c, [12, 8, 18, 255], -t); }
function css(c) {
  const a = c[3] === undefined ? 255 : c[3];
  return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a / 255) + ')';
}

/* ---------- offscreen canvas ---------- */
function mkc(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return c;
}

/* ============================================================
   Pix — a raw RGBA pixel buffer with drawing primitives.
   All sprite art in this game is produced through it.
   ============================================================ */
class Pix {
  constructor(w, h) { this.w = Math.max(0, w | 0); this.h = Math.max(0, h | 0); this.d = new Uint8ClampedArray(this.w * this.h * 4); }

  set(x, y, c) {
    x |= 0; y |= 0;
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const i = (y * this.w + x) * 4;
    const a = c[3] === undefined ? 255 : c[3];
    if (a === 0) {          /* a fully transparent colour erases, so holes can be punched */
      this.d[i] = 0; this.d[i + 1] = 0; this.d[i + 2] = 0; this.d[i + 3] = 0;
      return this;
    }
    if (a >= 255) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255; }
    else if (a > 0) {
      const t = a / 255, ia = this.d[i + 3] / 255, o = t + ia * (1 - t);
      this.d[i]     = (c[0] * t + this.d[i]     * ia * (1 - t)) / o;
      this.d[i + 1] = (c[1] * t + this.d[i + 1] * ia * (1 - t)) / o;
      this.d[i + 2] = (c[2] * t + this.d[i + 2] * ia * (1 - t)) / o;
      this.d[i + 3] = o * 255;
    }
    return this;
  }
  alphaAt(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  getc(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  clear() { this.d.fill(0); return this; }
  fill(c) { return this.rect(0, 0, this.w, this.h, c); }

  rect(x, y, w, h, c) {
    x |= 0; y |= 0; w |= 0; h |= 0;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
    return this;
  }
  frame(x, y, w, h, c) {
    this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c);
    this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c);
    return this;
  }
  disc(cx, cy, r, c) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx || 1), dy = (y - cy) / (ry || 1);
        if (dx * dx + dy * dy <= 1.0) this.set(x, y, c);
      }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  thick(x0, y0, x1, y1, t, c) {
    const r = (t - 1) / 2;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      if (t <= 1) this.set(Math.round(x), Math.round(y), c);
      else this.disc(Math.round(x), Math.round(y), r, c);
    }
    return this;
  }
  poly(pts, c) {
    let miny = 1e9, maxy = -1e9;
    for (const p of pts) { if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]; }
    for (let y = Math.floor(miny); y <= Math.ceil(maxy); y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y))
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let i = 0; i + 1 < xs.length; i += 2)
        for (let x = Math.round(xs[i]); x <= Math.round(xs[i + 1]); x++) this.set(x, y, c);
    }
    return this;
  }
  /* draw another Pix on top */
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const a = src.alphaAt(x, y);
      if (a > 0) this.set(x + ox, y + oy, src.getc(x, y));
    }
    return this;
  }
  /* auto volume shading: rim light on top, shadow underneath */
  shade(o) {
    o = o || {};
    const top = o.top === undefined ? 0.17 : o.top;
    const bot = o.bot === undefined ? 0.22 : o.bot;
    const rgt = o.right === undefined ? 0.11 : o.right;
    const lft = o.left === undefined ? 0.07 : o.left;
    const src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[(y * this.w + x) * 4 + 3];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      if (src[i + 3] < 250) continue;
      let c = [src[i], src[i + 1], src[i + 2], 255], hit = false;
      if (A(x, y - 1) < 250) { c = sh(c, top); hit = true; }
      else if (A(x, y + 1) < 250) { c = sh(c, -bot); hit = true; }
      else if (A(x + 1, y) < 250) { c = sh(c, -rgt); hit = true; }
      else if (A(x - 1, y) < 250) { c = sh(c, lft); hit = true; }
      if (!hit) continue;
      this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    }
    return this;
  }
  outline(col, diag) {
    const c = C(col);
    const src = new Uint8ClampedArray(this.d);
    const A = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : src[(y * this.w + x) * 4 + 3];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (A(x, y) > 8) continue;
      let n = A(x - 1, y) > 180 || A(x + 1, y) > 180 || A(x, y - 1) > 180 || A(x, y + 1) > 180;
      if (!n && diag) n = A(x - 1, y - 1) > 180 || A(x + 1, y - 1) > 180 || A(x - 1, y + 1) > 180 || A(x + 1, y + 1) > 180;
      if (n) this.set(x, y, c);
    }
    return this;
  }
  tintAll(col, t) {
    const c = C(col);
    for (let i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] < 8) continue;
      this.d[i] = this.d[i] + (c[0] - this.d[i]) * t;
      this.d[i + 1] = this.d[i + 1] + (c[1] - this.d[i + 1]) * t;
      this.d[i + 2] = this.d[i + 2] + (c[2] - this.d[i + 2]) * t;
    }
    return this;
  }
  clone() { const p = new Pix(this.w, this.h); p.d.set(this.d); return p; }
  rotCW() {
    const p = new Pix(this.h, this.w);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.getc(x, y);
      if (c && c[3] > 0) p.set(this.h - 1 - y, x, c);
    }
    return p;
  }
  flipX() {
    const p = new Pix(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.getc(x, y); if (c[3] > 0) p.set(this.w - 1 - x, y, c);
    }
    return p;
  }
  canvas() {
    const cv = mkc(this.w, this.h);
    const ctx = cv.getContext('2d');
    const id = ctx.createImageData(this.w, this.h);
    id.data.set(this.d);
    ctx.putImageData(id, 0, 0);
    return cv;
  }
}

/* ============================================================
   bitmap font — 5x7 pixel glyphs
   ============================================================ */
const GLYPHS = {
  'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
  'B': '####./#...#/#...#/####./#...#/#...#/####.',
  'C': '.###./#...#/#..../#..../#..../#...#/.###.',
  'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
  'E': '#####/#..../#..../####./#..../#..../#####',
  'F': '#####/#..../#..../####./#..../#..../#....',
  'G': '.###./#...#/#..../#.###/#...#/#...#/.###.',
  'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  'I': '#####/..#../..#../..#../..#../..#../#####',
  'J': '..###/...#./...#./...#./...#./#..#./.##..',
  'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  'L': '#..../#..../#..../#..../#..../#..../#####',
  'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  'N': '#...#/##..#/##..#/#.#.#/#..##/#..##/#...#',
  'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  'P': '####./#...#/#...#/####./#..../#..../#....',
  'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  'R': '####./#...#/#...#/####./#.#../#..#./#...#',
  'S': '.####/#..../#..../.###./....#/....#/####.',
  'T': '#####/..#../..#../..#../..#../..#../..#..',
  'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
  'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
  'Z': '#####/....#/...#./..#../.#.../#..../#####',
  '0': '.###./#..##/#.#.#/#.#.#/#.#.#/##..#/.###.',
  '1': '..#../.##../..#../..#../..#../..#../.###.',
  '2': '.###./#...#/....#/...#./..#../.#.../#####',
  '3': '####./....#/....#/.###./....#/....#/####.',
  '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
  '5': '#####/#..../####./....#/....#/#...#/.###.',
  '6': '.###./#..../#..../####./#...#/#...#/.###.',
  '7': '#####/....#/...#./..#../.#.../.#.../.#...',
  '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
  '9': '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '...../...../...../...../...../...../.....',
  '.': '...../...../...../...../...../.##../.##..',
  ',': '...../...../...../...../.##../.##../.#...',
  '!': '..#../..#../..#../..#../..#../...../..#..',
  '?': '.###./#...#/....#/..##./..#../...../..#..',
  ':': '...../.##../.##../...../.##../.##../.....',
  '-': '...../...../...../.###./...../...../.....',
  '+': '...../..#../..#../#####/..#../..#../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
  ')': '.#.../..#../...#./...#./...#./..#../.#...',
  "'": '..#../..#../...../...../...../...../.....',
  '"': '.#.#./.#.#./...../...../...../...../.....',
  '*': '...../.#.#./..#../#####/..#../.#.#./.....',
  '%': '#...#/...#./..#../..#../.#.../#...#/.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.',
  '>': '.#.../..#../...#./....#/...#./..#../.#...',
  '=': '...../...../#####/...../#####/...../.....',
  '_': '...../...../...../...../...../...../#####',
  '#': '.#.#./#####/.#.#./#####/.#.#./...../.....',
  '$': '..#../.####/#.#../.###./..#.#/####./..#..'
};
/* the infinity mark, keyed by code point so this file stays plain ASCII */
const INF = String.fromCharCode(0x221E);
GLYPHS[INF] = '...../.#.#./#.#.#/#.#.#/#.#.#/.#.#./.....';
const GW = 5, GH = 7;
const _glyphCache = new Map();
function glyphRows(ch) {
  let g = _glyphCache.get(ch);
  if (!g) { g = (GLYPHS[ch] || GLYPHS['?']).split('/'); _glyphCache.set(ch, g); }
  return g;
}
function textWidth(s, sp) { sp = sp === undefined ? 1 : sp; return s.length ? s.length * (GW + sp) - sp : 0; }

const _textCache = new Map();
const _emptyText = mkc(1, 1);
function textCanvas(str, col, shadow) {
  if (!str.length) return _emptyText;          /* an empty line has nothing to raster */
  const key = str + '|' + col + '|' + (shadow || '');
  let cv = _textCache.get(key);
  if (cv) return cv;
  const w = textWidth(str) + (shadow ? 1 : 0), h = GH + (shadow ? 1 : 0);
  const p = new Pix(w, h);
  const c = C(col), sc = shadow ? C(shadow) : null;
  for (let pass = shadow ? 0 : 1; pass < 2; pass++) {
    const cc = pass === 0 ? sc : c, ox = pass === 0 ? 1 : 0, oy = pass === 0 ? 1 : 0;
    for (let i = 0; i < str.length; i++) {
      const rows = glyphRows(str[i]);
      for (let y = 0; y < GH; y++) {
        const r = rows[y] || '';
        for (let x = 0; x < GW; x++) if (r[x] === '#') p.set(i * (GW + 1) + x + ox, y + oy, cc);
      }
    }
  }
  cv = p.canvas();
  if (_textCache.size > 600) _textCache.clear();
  _textCache.set(key, cv);
  return cv;
}
function drawText(ctx, str, x, y, col, scale, align, shadow) {
  str = String(str).toUpperCase();
  scale = scale || 1;
  if (!str.length) return 0;
  const cv = textCanvas(str, col || '#ffffff', shadow);
  let dx = x;
  if (align === 'center') dx = x - (cv.width * scale) / 2;
  else if (align === 'right') dx = x - cv.width * scale;
  ctx.drawImage(cv, Math.round(dx), Math.round(y), cv.width * scale, cv.height * scale);
  return cv.width * scale;
}

/* ============================================================
   keybinds — every game control is named, so a key can be swapped
   ============================================================ */
const DEFAULT_KEYS = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  attack: 'Space', dash: 'KeyD', pierce: 'KeyF', swim: 'KeyS', interact: 'KeyE',
  shop: 'Escape', codes: 'KeyC', map: 'Backspace', mute: 'KeyM'
};
/* extra keys that keep working whatever the player binds */
const ALT_KEYS = { attack: ['KeyX', 'KeyZ'] };
const KEYS = Object.assign(Object.create(null), DEFAULT_KEYS);
/* the controls the settings panel lists, in order */
const ACTIONS = [
  { key: 'left', name: 'MOVE LEFT' },
  { key: 'right', name: 'MOVE RIGHT' },
  { key: 'up', name: 'JUMP / CLIMB UP' },
  { key: 'down', name: 'CROUCH / DROP' },
  { key: 'attack', name: 'SWORD' },
  { key: 'dash', name: 'DASH' },
  { key: 'pierce', name: 'AIR PIERCE' },
  { key: 'swim', name: 'SWIM' },
  { key: 'interact', name: 'ENTER A DOOR' },
  { key: 'shop', name: 'SHOP' },
  { key: 'codes', name: 'CODES BOX' },
  { key: 'map', name: 'LEAVE THE REALM' },
  { key: 'mute', name: 'MUTE' }
];
/* a short name a player recognises, from the raw event code */
function keyLabel(code) {
  if (!code) return '--';
  if (code.indexOf('Key') === 0) return code.slice(3);
  if (code.indexOf('Digit') === 0) return code.slice(5);
  if (code.indexOf('Numpad') === 0) return 'NUM ' + code.slice(6);
  if (code.indexOf('Arrow') === 0) return code.slice(5).toUpperCase();
  const named = {
    Space: 'SPACE', Escape: 'ESC', Backspace: 'BKSP', Enter: 'ENTER', Tab: 'TAB',
    ShiftLeft: 'L SHIFT', ShiftRight: 'R SHIFT', ControlLeft: 'L CTRL', ControlRight: 'R CTRL',
    AltLeft: 'L ALT', AltRight: 'R ALT', Comma: ',', Period: '.', Slash: '/',
    Semicolon: ';', Quote: "'", BracketLeft: '(', BracketRight: ')', Backslash: '/',
    Minus: '-', Equal: '=', Backquote: '`'
  };
  return named[code] || code.toUpperCase();
}

/* ============================================================
   input
   ============================================================ */
const Input = {
  held: Object.create(null),
  hitKeys: Object.create(null),
  mx: VW / 2, my: VH / 2,
  mdown: false, mhit: false, mrelease: false,
  wheel: 0, typed: '',
  touches: [], touchDown: false,
  /* every finger and click that began this frame, so a second finger can
     press a thing while the first one holds the pad */
  taps: [],
  anyKey: false,
  lastCode: '',
  /* the touch pad writes action state straight in */
  padHeld: Object.create(null), padHitAct: Object.create(null),
  down(k) { return !!this.held[k]; },
  hit(k) { return !!this.hitKeys[k]; },
  /* named controls, so a rebound key and a touch button read the same */
  act(a) {
    if (this.padHeld[a]) return true;
    if (this.held[KEYS[a]]) return true;
    const alt = ALT_KEYS[a];
    if (alt) for (const k of alt) if (this.held[k]) return true;
    return false;
  },
  actHit(a) {
    if (this.padHitAct[a]) return true;
    if (this.hitKeys[KEYS[a]]) return true;
    const alt = ALT_KEYS[a];
    if (alt) for (const k of alt) if (this.hitKeys[k]) return true;
    return false;
  },
  /* is the pointer inside this rectangle of virtual pixels */
  over(r) { return this.mx >= r.x && this.mx <= r.x + r.w && this.my >= r.y && this.my <= r.y + r.h; },
  /* did a click or a fresh finger land inside it this frame */
  tap(r) {
    for (const t of this.taps)
      if (t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h) return true;
    return false;
  },
  endFrame() {
    this.hitKeys = Object.create(null); this.mhit = false; this.mrelease = false;
    this.wheel = 0; this.typed = ''; this.anyKey = false; this.taps = []; this.lastCode = '';
  }
};

/* ============================================================
   saved options and save files
   ============================================================ */
const Store = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
  drop(key) { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } }
};

/* ============================================================
   display
   ============================================================ */
let cv, ctx;
/* the page fills the screen on a phone; a desktop keeps its border */
const Screen = { fullscreen: false, landscape: false, wantFull: false };

function screenIsLandscape() {
  const w = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  return w > h;
}
/* a phone in landscape gets the whole screen; the browser only grants this
   inside a touch or a click, so the game asks again on every gesture */
function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (!fn) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const r = fn.call(el, { navigationUI: 'hide' });
    if (r && r.then) r.then(lockLandscape, () => {});
    else lockLandscape();
  } catch (e) { /* the browser said no */ }
}
function lockLandscape() {
  try {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  } catch (e) { /* not supported */ }
}
function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) {
    try { fn.call(document); } catch (e) { /* nothing to undo */ }
  }
}

function initDisplay() {
  cv = document.getElementById('game');
  ctx = cv.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  function resize() {
    Screen.landscape = screenIsLandscape();
    Screen.fullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const vv = window.visualViewport;
    const winW = (vv && vv.width) || window.innerWidth;
    const winH = (vv && vv.height) || window.innerHeight;
    /* on a phone the canvas takes the whole screen, so no button falls off it */
    const full = typeof G !== 'undefined' && G.mobile;
    document.body.classList.toggle('full', !!full);
    const hint = document.getElementById('hint');
    if (hint) hint.style.display = full ? 'none' : '';
    const pad = full ? 0 : 24;
    const aw = winW - pad, ah = winH - pad - (full ? 0 : 18);
    let s = Math.min(aw / VW, ah / VH);
    if (!full) s = s >= 1 ? Math.max(1, Math.floor(s * 2) / 2) : s;   // half-step scaling
    cv.style.width = Math.round(VW * s) + 'px';
    cv.style.height = Math.round(VH * s) + 'px';
  }
  Screen.resize = resize;
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);
  document.addEventListener('webkitfullscreenchange', resize);
  resize();

  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!Input.held[e.code]) Input.hitKeys[e.code] = true;
    Input.held[e.code] = true;
    Input.anyKey = true;
    Input.lastCode = e.code;
    /* raw characters, for the code box */
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) Input.typed += e.key;
  });
  addEventListener('keyup', e => { Input.held[e.code] = false; });
  addEventListener('blur', () => { Input.held = Object.create(null); });

  function toVirtual(e) {
    const r = cv.getBoundingClientRect();
    Input.mx = clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1);
    Input.my = clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1);
  }
  addEventListener('mousemove', toVirtual);
  cv.addEventListener('mousedown', e => {
    toVirtual(e); Input.mdown = true; Input.mhit = true;
    Input.taps.push({ id: 'mouse', x: Input.mx, y: Input.my });
    e.preventDefault();
  });
  addEventListener('mouseup', e => { Input.mdown = false; Input.mrelease = true; });

  /* touch: every finger is tracked, and the first one also drives the pointer
     so every existing click target keeps working */
  function touchPoint(t) {
    const r = cv.getBoundingClientRect();
    return { id: t.identifier,
             x: clamp((t.clientX - r.left) / r.width * VW, 0, VW - 1),
             y: clamp((t.clientY - r.top) / r.height * VH, 0, VH - 1) };
  }
  function readTouches(e) {
    const out = [];
    for (let i = 0; i < e.touches.length; i++) out.push(touchPoint(e.touches[i]));
    Input.touches = out;
    Input.touchDown = out.length > 0;
    if (out.length) { Input.mx = out[0].x; Input.my = out[0].y; }
  }
  cv.addEventListener('touchstart', e => {
    const had = Input.touches.length;
    /* record every finger that is new this frame, not only the first, so one
       thumb can hold the pad while another taps a button or a door */
    for (let i = 0; i < e.changedTouches.length; i++) {
      const p = touchPoint(e.changedTouches[i]);
      Input.taps.push(p);
    }
    readTouches(e);
    if (!had) { Input.mdown = true; Input.mhit = true; }
    if (Screen.wantFull) requestFullscreen();
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => { readTouches(e); e.preventDefault(); }, { passive: false });
  const endTouch = e => {
    readTouches(e);
    if (!Input.touches.length) { Input.mdown = false; Input.mrelease = true; }
    e.preventDefault();
  };
  cv.addEventListener('touchend', endTouch, { passive: false });
  cv.addEventListener('touchcancel', endTouch, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('wheel', e => {
    /* trackpads send x, wheels send y: either one scrolls the map sideways */
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    Input.wheel += d;
  }, { passive: true });
}
