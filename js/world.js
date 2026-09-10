/* ============================================================
   world.js — tile ids, the Room type and the level generators.
   ============================================================ */
'use strict';

const T_EMPTY = 0, T_GRASS = 1, T_DIRT = 2, T_ROCK = 3, T_ROCKTOP = 4,
      T_WOOD = 5, T_WATER = 6, T_WATERD = 7, T_CAVEBG = 8, T_PATH = 9,
      T_BOUNCE = 10, T_CLOUD = 11, T_MARBLE = 12, T_CLOUDP = 13, T_MYC = 14,
      T_DEEPSTONE = 15, T_DEEPTOP = 16, T_SAND = 17, T_ASH = 18, T_ASHTOP = 19, T_OBSID = 20,
      T_LADDER = 21,
      /* the white silence and the golden waste */
      T_SNOW = 22, T_SNOWTOP = 23, T_ICE = 24, T_POWDER = 25,
      T_SANDTOP = 26, T_QUICK = 27, T_TOMB = 28, T_TOMBTOP = 29;

const SOLID_TILE = { 1: 1, 2: 1, 3: 1, 4: 1, 10: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1,
                     22: 1, 23: 1, 24: 1, 26: 1, 28: 1, 29: 1 };
const ONEWAY_TILE = { 5: 1, 13: 1 };
const WET_TILE = { 6: 1, 7: 1 };
const BOUNCE_TILE = { 10: 1 };
const LADDER_TILE = { 21: 1 };
/* A phase tile looks like ground and is not.  It swallows anyone who steps on
   it, unless the Pharaoh's Ring lets them fall straight through. */
const PHASE_TILE = { 25: 1, 27: 1 };
/* ice holds no grip */
const SLIP_TILE = { 24: 1 };

class Room {
  constructor(o) {
    this.id = o.id; this.name = o.name; this.mode = o.mode || 'side';
    this.w = o.w; this.h = o.h;
    this.music = o.music || 'forest';
    this.bg = o.bg || 'forest';
    this.grid = new Uint8Array(this.w * this.h);
    this.decor = [];          /* {kind, idx, x, y, layer, sway, phase, flip} */
    this.spawns = [];         /* {type, x, y, ...} */
    this.exits = [];          /* {x,y,w,h,to,sx,sy,needKey,label,door} */
    this.start = o.start || { x: 64, y: 64 };
    this.ambient = o.ambient === undefined ? 0.35 : o.ambient;
    this.dark = o.dark || 0;  /* vignette strength */
    this.tint = o.tint || null;
  }
  get(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return -1;
    return this.grid[ty * this.w + tx];
  }
  set(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.grid[ty * this.w + tx] = v;
  }
  fillRect(x, y, w, h, v) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }
  solid(tx, ty) {
    const t = this.get(tx, ty);
    if (t === -1) return (tx < 0 || tx >= this.w || ty >= this.h);   /* walls and a floor, open sky */
    return !!SOLID_TILE[t];
  }
  oneway(tx, ty) { return !!ONEWAY_TILE[this.get(tx, ty)]; }
  bouncy(tx, ty) { return !!BOUNCE_TILE[this.get(tx, ty)]; }
  ladder(tx, ty) { return !!LADDER_TILE[this.get(tx, ty)]; }
  /* which way you must walk to climb: toward whatever the ladder is bolted to */
  ladderSide(tx, ty) {
    if (this.solid(tx + 1, ty)) return 1;
    if (this.solid(tx - 1, ty)) return -1;
    return 0;
  }
  wet(tx, ty) { return !!WET_TILE[this.get(tx, ty)]; }
  phase(tx, ty) { return !!PHASE_TILE[this.get(tx, ty)]; }
  slippy(tx, ty) { return !!SLIP_TILE[this.get(tx, ty)]; }
  boxPhase(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (this.phase(tx, ty)) return true;
    return false;
  }
  solidPx(x, y) { return this.solid(Math.floor(x / TILE), Math.floor(y / TILE)); }
  /* does an axis aligned box overlap solid tiles? */
  boxSolid(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (this.solid(tx, ty)) return true;
    return false;
  }
  boxWet(x, y, w, h) {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 1) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 1) / TILE);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
      if (this.wet(tx, ty)) return true;
    return false;
  }
  /* first solid surface below a pixel column */
  groundBelow(px, py) {
    const tx = Math.floor(px / TILE);
    for (let ty = Math.floor(py / TILE); ty < this.h; ty++)
      if (this.solid(tx, ty) || this.oneway(tx, ty)) return ty * TILE;
    return this.h * TILE;
  }
  pxW() { return this.w * TILE; }
  pxH() { return this.h * TILE; }
}

const World = { rooms: {}, };

/* ---------- shared decoration helpers ---------- */
function decorate(room, rng, opt) {
  const surf = opt.surface;    /* array of ground tile y per column, -1 = none */
  const W = room.w;

  /* background tree line — dense forest, drawn behind everything */
  for (let x = 2; x < W - 2; x += 1) {
    if (!rng.bool(opt.treeChance)) continue;
    const gy = surf[x];
    if (gy < 0) continue;
    if (room.wet(x, gy) || room.wet(x, gy + 1)) continue;
    const t = rng.pick(Art.prop.trees);
    room.decor.push({ kind: 'tree', idx: Art.prop.trees.indexOf(t),
      x: x * TILE + rng.r(-6, 6), y: gy * TILE + rng.r(0, 5),
      layer: rng.bool(0.55) ? 0 : 1, sway: rng.r(1.4, 3.0), phase: rng.r(0, TAU),
      scale: rng.r(0.85, 1.15) });
  }
  /* forest giants: the crown of one of these stands above the top of the
     screen, so the wood feels tall */
  if (opt.giantChance) {
    let lastX = -99;
    for (let x = 4; x < W - 4; x++) {
      const gy = surf[x];
      if (gy < 0) continue;
      if (x - lastX < 7) continue;
      if (!rng.bool(opt.giantChance)) continue;
      if (room.wet(x, gy) || room.wet(x, gy + 1)) continue;
      lastX = x;
      const px = x * TILE + rng.r(-4, 4), py = gy * TILE + rng.r(0, 3);
      const front = rng.bool(0.22);
      room.decor.push({ kind: 'giant', idx: rng.i(0, 2), x: px, y: py,
        layer: front ? 2 : 0, sway: rng.r(0.7, 1.5), phase: rng.r(0, TAU),
        scale: rng.r(0.9, 1.25), alpha: front ? 0.9 : 1 });
      /* vines off its limbs */
      const nv = rng.i(2, 4);
      for (let v = 0; v < nv; v++)
        room.decor.push({ kind: 'vine', x: px + rng.r(-40, 40), y: py - rng.i(96, 190),
          len: rng.i(24, 74), layer: front ? 2 : 1, sway: rng.r(1.4, 3.0), phase: rng.r(0, TAU) });
      /* and a nest wedged in a fork, sometimes with the bird at home */
      if (rng.bool(0.55))
        room.decor.push({ kind: 'nest', idx: rng.i(0, 2), x: px + rng.r(-26, 26),
          y: py - rng.i(104, 176), layer: front ? 2 : 1,
          bird: rng.bool(0.5), phase: rng.r(0, TAU) });
    }
  }
  /* a few trees in front of the player for depth */
  for (let x = 6; x < W - 6; x += 1) {
    if (!rng.bool(opt.treeChance * 0.16)) continue;
    const gy = surf[x]; if (gy < 0) continue;
    if (room.wet(x, gy) || room.wet(x, gy + 1)) continue;
    room.decor.push({ kind: 'tree', idx: 6 + rng.i(0, 2),
      x: x * TILE, y: gy * TILE + rng.r(2, 8), layer: 2,
      sway: rng.r(2.0, 3.6), phase: rng.r(0, TAU), scale: rng.r(1.1, 1.35), alpha: 0.92 });
  }
  /* ground clutter */
  for (let x = 1; x < W - 1; x++) {
    const gy = surf[x];
    if (gy < 0) continue;
    const y = gy * TILE;
    if (room.get(x, gy) !== T_GRASS && room.get(x, gy) !== T_ROCKTOP) continue;
    if (rng.bool(0.55)) room.decor.push({ kind: 'tuft', idx: rng.i(0, 3), x: x * TILE + rng.r(0, 14), y: y + 1, layer: 1, sway: rng.r(0.8, 1.8), phase: rng.r(0, TAU) });
    if (rng.bool(0.16)) room.decor.push({ kind: 'flower', idx: rng.i(0, 4), x: x * TILE + rng.r(2, 12), y: y + 1, layer: 1, sway: rng.r(0.6, 1.4), phase: rng.r(0, TAU) });
    if (rng.bool(0.09)) room.decor.push({ kind: 'bush', idx: rng.i(0, 2), x: x * TILE + rng.r(0, 14), y: y + 2, layer: 1, sway: rng.r(0.7, 1.6), phase: rng.r(0, TAU) });
    if (rng.bool(0.05)) room.decor.push({ kind: 'mushroom', idx: rng.i(0, 2), x: x * TILE + rng.r(2, 12), y: y + 1, layer: 1, sway: 0, phase: 0 });
    if (rng.bool(0.05)) room.decor.push({ kind: 'rock', idx: rng.i(0, 2), x: x * TILE + rng.r(2, 12), y: y + 2, layer: 1, sway: 0, phase: 0 });
    if (rng.bool(opt.fernChance || 0)) room.decor.push({ kind: 'fern', idx: rng.i(0, 2), x: x * TILE + rng.r(0, 14), y: y + 2, layer: rng.bool(0.7) ? 1 : 2, sway: rng.r(0.9, 1.9), phase: rng.r(0, TAU) });
    /* reeds at the water's edge */
    if (room.get(x + 1, gy) === T_WATER || room.get(x - 1, gy) === T_WATER)
      if (rng.bool(0.6)) room.decor.push({ kind: 'reed', idx: rng.i(0, 2), x: x * TILE + rng.r(0, 14), y: y + 2, layer: 1, sway: rng.r(1.2, 2.4), phase: rng.r(0, TAU) });
  }
  /* hanging vines from overhangs */
  for (let x = 2; x < W - 2; x++) {
    for (let y = 2; y < room.h - 2; y++) {
      if (!room.solid(x, y) || room.solid(x, y + 1) || !rng.bool(opt.vineChance)) continue;
      room.decor.push({ kind: 'vine', x: x * TILE + rng.r(2, 13), y: (y + 1) * TILE,
        len: rng.i(14, 46), layer: rng.bool(0.5) ? 1 : 2, sway: rng.r(1.0, 2.4), phase: rng.r(0, TAU) });
      break;
    }
  }
}

/* ============================================================
   OUTDOOR ROOMS
   ============================================================ */
function buildForest(id, name, seed, opt) {
  const rng = new RNG(seed);
  const W = opt.w, H = opt.h;
  const room = new Room({ id: id, name: name, mode: 'side', w: W, h: H,
                          music: 'forest', bg: 'forest', ambient: 0.4 });
  const base = opt.base;
  const surf = new Int16Array(W);

  /* rolling ground */
  for (let x = 0; x < W; x++) {
    const gy = base
      + Math.sin(x * 0.045 + seed) * 2.2
      + Math.sin(x * 0.017 + seed * 0.7) * 3.0
      + Math.sin(x * 0.008 + seed * 1.9) * 1.6;
    surf[x] = clamp(Math.round(gy), 5, H - 3);
  }
  /* limit the slope so the ground rolls instead of jumping in steps */
  for (let pass = 0; pass < 3; pass++) {
    for (let x = 1; x < W; x++) surf[x] = clamp(surf[x], surf[x - 1] - 1, surf[x - 1] + 1);
    for (let x = W - 2; x >= 0; x--) surf[x] = clamp(surf[x], surf[x + 1] - 1, surf[x + 1] + 1);
  }
  /* terraces — a couple of hard steps make the ground feel built, not noisy */
  for (const st of opt.steps || []) {
    for (let x = st.x; x < W; x++) surf[x] = clamp(surf[x] + st.d, 5, H - 3);
  }

  /* streams */
  const streams = opt.streams || [];
  for (const s of streams) {
    for (let x = s.x; x < s.x + s.w; x++) {
      const t = (x - s.x) / s.w;
      const dip = Math.round(Math.sin(t * Math.PI) * s.depth);
      surf[x] = clamp(surf[x] + dip, 5, H - 3);
    }
  }

  /* paint terrain */
  for (let x = 0; x < W; x++) {
    const gy = surf[x];
    room.set(x, gy, T_GRASS);
    for (let y = gy + 1; y < H; y++) room.set(x, y, T_DIRT);
    /* bedrock */
    for (let y = H - 2; y < H; y++) room.set(x, y, T_ROCK);
  }
  /* fill stream beds with water */
  for (const s of streams) {
    let bed = 0;
    for (let x = s.x; x < s.x + s.w; x++) bed = Math.max(bed, surf[x]);
    const top = bed - s.depth + 1;
    for (let x = s.x + 1; x < s.x + s.w - 1; x++) {
      /* open the column to the sky first: without this the shallow ends of the
         stream keep a grass lid over the water and nothing can surface there */
      for (let y = Math.min(top, surf[x]); y < top; y++) room.set(x, y, T_EMPTY);
      /* then fill an even channel, so the stream is swimmable end to end */
      for (let y = top; y <= bed; y++) room.set(x, y, y === top ? T_WATER : T_WATERD);
      surf[x] = top;
    }
    /* a fallen log bridges the stream */
    if (s.log) {
      const ly = top - 3;
      for (let x = s.x + 1; x < s.x + s.w - 1; x++) room.set(x, ly, T_WOOD);
    }
  }

  /* floating ledges and log platforms */
  for (const p of opt.platforms || []) {
    for (let x = p.x; x < p.x + p.w; x++) {
      room.set(x, p.y, p.solid ? T_GRASS : T_WOOD);
      if (p.solid) for (let y = p.y + 1; y < p.y + (p.thick || 2); y++) room.set(x, y, T_DIRT);
    }
    if (p.solid) for (let x = p.x; x < p.x + p.w; x++) surf[x] = Math.min(surf[x], p.y);
  }

  room.surface = surf;
  room.canopy = !!opt.giantChance;      /* the giants throw a deep shade */
  decorate(room, rng, { surface: surf, treeChance: opt.treeChance || 0.5,
                        vineChance: opt.vineChance || 0.02,
                        giantChance: opt.giantChance || 0,
                        fernChance: opt.fernChance || 0 });
  return room;
}

/* ============================================================
   THE MAZE — recursive backtracker, seen from above
   ============================================================ */
function buildMaze(seed) {
  const rng = new RNG(seed);
  const CW = 13, CH = 9;            /* cells */
  const W = CW * 4 + 1, H = CH * 4 + 1;
  const room = new Room({ id: 'maze', name: 'THE HOLLOW MAZE', mode: 'top',
                          w: W, h: H, music: 'cave', bg: 'maze', ambient: 0.16, dark: 0.55 });
  room.fillRect(0, 0, W, H, T_ROCK);

  const idx = (cx, cy) => cy * CW + cx;
  const links = new Uint8Array(CW * CH);   /* 1=N 2=E 4=S 8=W */
  const seen = new Uint8Array(CW * CH);
  const stack = [[0, CH - 1]];
  seen[idx(0, CH - 1)] = 1;
  const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = [];
    for (const d of DIRS) {
      const nx = cx + d[0], ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
      if (seen[idx(nx, ny)]) continue;
      opts.push(d);
    }
    if (!opts.length) { stack.pop(); continue; }
    const d = rng.pick(opts);
    const nx = cx + d[0], ny = cy + d[1];
    links[idx(cx, cy)] |= d[2];
    links[idx(nx, ny)] |= d[3];
    seen[idx(nx, ny)] = 1;
    stack.push([nx, ny]);
  }
  /* knock a few extra holes so the maze has loops and escape routes */
  for (let k = 0; k < 14; k++) {
    const cx = rng.i(0, CW - 1), cy = rng.i(0, CH - 1);
    const d = rng.pick(DIRS);
    const nx = cx + d[0], ny = cy + d[1];
    if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
    links[idx(cx, cy)] |= d[2]; links[idx(nx, ny)] |= d[3];
  }

  /* carve into tiles */
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    const tx = cx * 4 + 1, ty = cy * 4 + 1;
    room.fillRect(tx, ty, 3, 3, T_PATH);
    const l = links[idx(cx, cy)];
    if (l & 2) room.fillRect(tx + 3, ty, 1, 3, T_PATH);
    if (l & 4) room.fillRect(tx, ty + 3, 3, 1, T_PATH);
  }

  /* breadth-first distance from the entrance, for placing the key far away */
  const dist = new Int16Array(CW * CH).fill(-1);
  let q = [[0, CH - 1]]; dist[idx(0, CH - 1)] = 0;
  while (q.length) {
    const nq = [];
    for (const [cx, cy] of q) {
      const l = links[idx(cx, cy)];
      for (const d of DIRS) {
        if (!(l & d[2])) continue;
        const nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue;
        if (dist[idx(nx, ny)] >= 0) continue;
        dist[idx(nx, ny)] = dist[idx(cx, cy)] + 1;
        nq.push([nx, ny]);
      }
    }
    q = nq;
  }
  let best = 0, keyCell = [CW - 1, 0];
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++)
    if (dist[idx(cx, cy)] > best) { best = dist[idx(cx, cy)]; keyCell = [cx, cy]; }

  const cellPx = (cx, cy) => ({ x: (cx * 4 + 2) * TILE + 8, y: (cy * 4 + 2) * TILE + 8 });

  room.start = cellPx(0, CH - 1);
  const kp = cellPx(keyCell[0], keyCell[1]);
  room.spawns.push({ type: 'key', x: kp.x, y: kp.y });

  /* the way out sits in the far top-right cell */
  const ex = cellPx(CW - 1, 0);
  room.exits.push({ x: ex.x - 22, y: ex.y - 22, w: 44, h: 44, to: 'deep',
                    sx: 0, sy: 0, useSaved: 'mazeExit', label: 'BACK TO THE WOOD', kind: 'arch' });
  room.exits.push({ x: room.start.x - 26, y: room.start.y + 6, w: 52, h: 30, to: 'deep',
                    sx: 0, sy: 0, useSaved: 'mazeEntry', label: 'LEAVE THE MAZE', kind: 'arch' });
  room.exitCells = { out: ex, back: room.start };

  /* dead ends are worth searching */
  const deadEnds = [];
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) {
    let n = 0; const l = links[idx(cx, cy)];
    for (const d of DIRS) if (l & d[2]) n++;
    if (n === 1) deadEnds.push([cx, cy]);
  }
  for (const de of deadEnds) {
    if (de[0] === 0 && de[1] === CH - 1) continue;
    const p = cellPx(de[0], de[1]);
    const n = rng.i(2, 5);
    for (let k = 0; k < n; k++)
      room.spawns.push({ type: 'coin', x: p.x + rng.r(-10, 10), y: p.y + rng.r(-10, 10), still: true });
  }
  /* patrolling beasts */
  for (let k = 0; k < 16; k++) {
    const cx = rng.i(1, CW - 1), cy = rng.i(0, CH - 2);
    if (cx === 0 && cy === CH - 1) continue;
    const p = cellPx(cx, cy);
    room.spawns.push({ type: rng.bool(0.55) ? 'snake' : 'bat', x: p.x, y: p.y, top: true });
  }
  /* torches on the walls, plus the odd vine */
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    if (room.get(tx, ty) !== T_ROCK) continue;
    if (room.get(tx, ty + 1) !== T_PATH) continue;
    if (rng.bool(0.10)) room.decor.push({ kind: 'torch', x: tx * TILE + 8, y: ty * TILE + 14, layer: 1 });
    else if (rng.bool(0.16)) room.decor.push({ kind: 'vine', x: tx * TILE + rng.r(2, 13), y: ty * TILE + 12,
      len: rng.i(8, 18), layer: 1, sway: rng.r(0.6, 1.4), phase: rng.r(0, TAU) });
  }
  return room;
}

/* ============================================================
   THE CAVE — a serpentine descent carved out of solid rock
   ============================================================ */
function buildCave(seed) {
  const rng = new RNG(seed);
  const W = 128, H = 46;
  const room = new Room({ id: 'cave', name: 'BRIARDEEP CAVERN', mode: 'side',
                          w: W, h: H, music: 'cave', bg: 'cave', ambient: 0.12, dark: 0.82 });
  room.fillRect(0, 0, W, H, T_ROCK);

  const carve = (x, y, r) => {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++)
      if (i * i + j * j <= r * r) room.set(x + i, y + j, T_EMPTY);
  };
  const runs = [];
  let y = 7, dir = 1, x = 6;
  for (let lane = 0; lane < 5; lane++) {
    const x0 = dir > 0 ? 6 : W - 7, x1 = dir > 0 ? W - 7 : 6;
    runs.push({ y: y, x0: x0, x1: x1, dir: dir });
    /* corridor */
    for (let xx = Math.min(x0, x1); xx <= Math.max(x0, x1); xx++) {
      const wob = Math.round(Math.sin(xx * 0.19 + lane) * 1.2);
      const rad = 3 + (rng.bool(0.25) ? 1 : 0);
      carve(xx, y + wob, rad);
      /* a flat floor to walk on */
      for (let i = -rad; i <= rad; i++) room.set(xx + i, y + wob + rad, T_ROCK);
    }
    /* chambers make the run less tube-like */
    for (let k = 0; k < 3; k++) {
      const cx = Math.round(lerp(Math.min(x0, x1) + 8, Math.max(x0, x1) - 8, (k + 0.5) / 3));
      const rx = rng.i(7, 11), ry = rng.i(4, 6);
      for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++)
        if ((i / rx) * (i / rx) + (j / ry) * (j / ry) <= 1) room.set(cx + i, y + j, T_EMPTY);
      for (let i = -rx; i <= rx; i++) {
        const fy = y + Math.round(ry * Math.sqrt(Math.max(0, 1 - (i / rx) * (i / rx))));
        for (let j = fy; j < fy + 2; j++) room.set(cx + i, j, T_ROCK);
      }
      /* platforms inside the chamber */
      if (rng.bool(0.8)) {
        const px = cx + rng.i(-5, 2), py = y - rng.i(3, 5), pw = rng.i(3, 6);
        for (let i = 0; i < pw; i++) room.set(px + i, py, T_WOOD);
      }
    }
    /* shaft down to the next lane */
    if (lane < 4) {
      const sx = x1;
      const ny = y + 9;
      for (let yy = y - 2; yy <= ny + 2; yy++) carve(sx, yy, 3);
      /* staggered ledges so the shaft can be climbed back up */
      for (let k = 0; k < 4; k++) {
        const py = y + 2 + k * 2, off = (k % 2) ? 2 : -3;
        for (let i = 0; i < 3; i++) room.set(sx + off + i, py, T_WOOD);
      }
      y = ny;
    }
    dir *= -1;
  }
  void x;
  /* seal the outer shell */
  for (let i = 0; i < W; i++) { room.set(i, 0, T_ROCK); room.set(i, 1, T_ROCK); room.set(i, H - 1, T_ROCK); room.set(i, H - 2, T_ROCK); }
  for (let j = 0; j < H; j++) { room.set(0, j, T_ROCK); room.set(1, j, T_ROCK); room.set(W - 1, j, T_ROCK); room.set(W - 2, j, T_ROCK); }

  /* mossy caps on any rock that meets open air */
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < W - 1; tx++)
    if (room.get(tx, ty) === T_ROCK && room.get(tx, ty - 1) === T_EMPTY && rng.bool(0.5))
      room.set(tx, ty, T_ROCKTOP);

  /* pools */
  for (let k = 0; k < 6; k++) {
    const px = rng.i(10, W - 12);
    for (let ty = 3; ty < H - 3; ty++) {
      if (room.get(px, ty) === T_EMPTY && room.solid(px, ty + 1)) {
        let ok = true;
        for (let i = -3; i <= 3; i++) if (!room.solid(px + i, ty + 1)) ok = false;
        if (ok) {
          for (let i = -3; i <= 3; i++) { room.set(px + i, ty, T_WATER); }
          break;
        }
      }
    }
  }

  /* entrance and exit */
  room.start = { x: 7 * TILE, y: 7 * TILE };
  const lastRun = runs[runs.length - 1];
  const exX = (lastRun.dir > 0 ? W - 9 : 9) * TILE;
  room.exits.push({ x: exX - 20, y: lastRun.y * TILE - 26, w: 40, h: 52,
                    to: 'mine', sx: 0, sy: 0, label: 'THE OLD MINESHAFT', kind: 'mine',
                    door: { x: exX, y: lastRun.y * TILE + 14 } });
  room.saved = { mineEntry: { x: exX - 60, y: lastRun.y * TILE } };
  room.exits.push({ x: 3 * TILE, y: 4 * TILE, w: 3 * TILE, h: 7 * TILE, to: 'deep',
                    useSaved: 'caveEntry', label: 'BACK TO THE WOOD', kind: 'cave' });

  /* A chamber hidden off the third lane.  A low crawl leads to it, and no
     torch burns near the mouth, so only the dark marks the way in. */
  {
    const run = runs[2];
    const a = Math.min(run.x0, run.x1), b = Math.max(run.x0, run.x1);
    const mouth = Math.round(lerp(a, b, 0.62));
    const cy = run.y;
    /* the crawl: two tiles tall, straight back from the corridor wall */
    const deepX = mouth + 7;
    for (let x = mouth; x <= deepX; x++) {
      room.set(x, cy + 2, T_EMPTY);
      room.set(x, cy + 3, T_EMPTY);
      room.set(x, cy + 4, T_ROCK);
    }
    /* the chamber at the end of it */
    const chX = deepX + 1, chY = cy + 3, chW = 11, chH = 7;
    for (let j = 0; j < chH; j++) for (let i = 0; i < chW; i++)
      room.set(chX + i, chY - chH + 2 + j, T_EMPTY);
    for (let i = -1; i <= chW; i++) room.set(chX + i, chY + 2, T_ROCK);
    /* a ledge and a crystal seam inside, so it pays to have found it */
    for (let i = 2; i < 7; i++) room.set(chX + i, chY - 2, T_WOOD);
    room.secret = { x: (chX + chW / 2) * TILE, y: chY * TILE,
                    mouth: { x: mouth * TILE, y: (cy + 3) * TILE } };
    for (let k = 0; k < 26; k++)
      room.spawns.push({ type: 'coin', x: (chX + 1 + (k % 9)) * TILE + 8,
                         y: (chY - (k < 9 ? 0 : (k < 18 ? 3 : 5))) * TILE - 6 });
    for (let k = 0; k < 5; k++)
      room.decor.push({ kind: 'crystal', idx: rng.i(0, 2), x: (chX + 1 + k * 2) * TILE + 8,
                        y: (chY + 1) * TILE + 2, layer: 1, glow: true });
  }

  /* way-markers daubed on the rock, pointing along the route out */
  for (const run of runs) {
    const a = Math.min(run.x0, run.x1), b = Math.max(run.x0, run.x1);
    for (let x = a + 8; x < b - 8; x += 15) {
      const gy = room.groundBelow(x * TILE + 8, (run.y - 3) * TILE);
      const dark = room.secret &&
        Math.abs(x * TILE - room.secret.mouth.x) < 160 &&
        Math.abs(gy - room.secret.mouth.y) < 100;
      if (!dark) room.decor.push({ kind: 'arrow', dir: run.dir > 0 ? 'right' : 'left',
                                   x: x * TILE + 8, y: gy - 30, layer: 1 });
    }
    /* and a downward marker at the head of each shaft */
    if (run !== runs[runs.length - 1]) {
      const sx = run.x1 * TILE + 8;
      const gy = room.groundBelow(sx, (run.y - 3) * TILE);
      room.decor.push({ kind: 'arrow', dir: 'down', x: sx, y: gy - 30, layer: 1 });
    }
  }

  /* dressing: stalactites, crystals, torches */
  for (let ty = 2; ty < H - 2; ty++) for (let tx = 2; tx < W - 2; tx++) {
    if (room.get(tx, ty) === T_EMPTY) continue;
    if (room.get(tx, ty + 1) === T_EMPTY && rng.bool(0.07))
      room.decor.push({ kind: 'stal', idx: rng.i(0, 3), x: tx * TILE + 8, y: (ty + 1) * TILE - 2, layer: rng.bool(0.4) ? 2 : 1 });
    if (room.get(tx, ty - 1) === T_EMPTY && rng.bool(0.05)) {
      const near = room.secret &&
        Math.abs(tx * TILE - room.secret.mouth.x) < 150 &&
        Math.abs(ty * TILE - room.secret.mouth.y) < 90;
      if (!near) room.decor.push({ kind: 'crystal', idx: rng.i(0, 2), x: tx * TILE + 8, y: ty * TILE + 2, layer: 1, glow: true });
    }
    if (room.get(tx, ty - 1) === T_EMPTY && rng.bool(0.10)) {
      /* the mouth of the hidden way keeps its dark: no torch stands near it */
      const near = room.secret &&
        Math.abs(tx * TILE - room.secret.mouth.x) < 150 &&
        Math.abs(ty * TILE - room.secret.mouth.y) < 90;
      if (!near) room.decor.push({ kind: 'torch', x: tx * TILE + 8, y: ty * TILE - 4, layer: 1 });
    }
    if (room.get(tx, ty + 1) === T_EMPTY && rng.bool(0.05))
      room.decor.push({ kind: 'vine', x: tx * TILE + rng.r(2, 13), y: (ty + 1) * TILE,
        len: rng.i(16, 52), layer: rng.bool(0.5) ? 1 : 2, sway: rng.r(0.8, 2.0), phase: rng.r(0, TAU) });
  }
  /* inhabitants */
  runs.forEach((run, lane) => {
    for (let k = 0; k < 4; k++) {
      const px = rng.i(12, W - 14) * TILE;
      const gy = room.groundBelow(px, run.y * TILE - 20);
      if (gy > (run.y + 8) * TILE) continue;
      room.spawns.push({ type: rng.bool(0.5) ? 'snake' : 'bat', x: px, y: gy - 8 });
    }
    /* spiders keep to the deeper workings */
    if (lane >= 2) for (let k = 0; k < 4; k++) {
      const px = rng.i(12, W - 14) * TILE;
      let ty = run.y - 4;
      while (ty > 2 && !room.solid(Math.floor(px / TILE), ty)) ty--;
      room.spawns.push({ type: 'spider', x: px, y: (ty + 1) * TILE });
    }
    for (let k = 0; k < 3; k++) {
      const px = rng.i(12, W - 14) * TILE;
      const gy = room.groundBelow(px, run.y * TILE - 20);
      room.spawns.push({ type: 'coin', x: px, y: gy - 12 });
    }
    if (rng.bool(0.7)) {
      const px = rng.i(16, W - 18) * TILE;
      const gy = room.groundBelow(px, run.y * TILE - 20);
      room.spawns.push({ type: 'bear', x: px, y: gy - 4 });
    }
  });
  return room;
}

/* ============================================================
   THE TUTORIAL — one corridor that teaches every move
   ============================================================ */
function buildTutorial(seed) {
  const rng = new RNG(seed);
  const W = 132, H = 28;
  const room = new Room({ id: 'tutorial', name: 'TUTORIAL', mode: 'side',
                          w: W, h: H, music: 'forest', bg: 'forest', ambient: 0.4 });
  const GY = 18;
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) surf[x] = GY;
  /* a step to hop up and back down: three tiles, so only a held jump clears it */
  for (let x = 24; x < 30; x++) surf[x] = GY - 3;
  for (let x = 0; x < W; x++) {
    room.set(x, surf[x], T_GRASS);
    for (let y = surf[x] + 1; y < H; y++) room.set(x, y, T_DIRT);
  }
  /* a pool to swim */
  const pTop = GY - 1, pBed = GY + 3;
  for (let x = 45; x < 57; x++) {
    for (let y = pTop; y <= pBed; y++) room.set(x, y, y === pTop ? T_WATER : T_WATERD);
    for (let y = pBed + 1; y < H; y++) room.set(x, y, T_DIRT);
    surf[x] = pTop;
  }
  /* the gap that only a dash will cross: six tiles, with a way back up on the near side */
  const gapA = 66, gapB = 72, pitFloor = GY + 6;
  for (let x = gapA; x < gapB; x++) {
    for (let y = 0; y < pitFloor; y++) room.set(x, y, T_EMPTY);
    room.set(x, pitFloor, T_GRASS);
    for (let y = pitFloor + 1; y < H; y++) room.set(x, y, T_DIRT);
    surf[x] = pitFloor;
  }
  /* steps back up on the left, a sheer wall on the right */
  for (let k = 0; k < 5; k++) {
    const sx = gapA - 1 + k, sy = pitFloor - 1 - k;
    if (sx >= gapA) { room.set(sx, sy, T_GRASS); surf[sx] = Math.min(surf[sx], sy); }
  }
  /* a high ledge to dive from */
  for (let x = 78; x < 85; x++) { room.set(x, GY - 6, T_WOOD); }
  /* a wall too tall to jump, with a ladder bolted to its near face */
  const upper = GY - 6, wallX = 88;
  for (let x = wallX; x < W; x++) {
    for (let y = upper; y < H; y++) room.set(x, y, y === upper ? T_GRASS : T_DIRT);
    surf[x] = upper;
  }
  for (let y = upper - 1; y <= GY - 1; y++) room.set(wallX - 1, y, T_LADDER);
  /* the door out — it stands on the high ground past the wall, not on the
     old floor level, which would bury it under the hillside */
  const doorX = W - 12;
  const doorY = surf[doorX];
  room.surface = surf;

  room.start = { x: 4 * TILE, y: (GY - 3) * TILE };
  room.exits.push({ x: doorX * TILE - 16, y: (doorY - 3) * TILE, w: 34, h: 3 * TILE,
                    to: 'tutorialDone', label: 'INTO THE REALM', kind: 'arch',
                    door: { x: doorX * TILE, y: doorY * TILE } });

  /* what it teaches, in order */
  /* a name in braces is filled in with the key the player has bound */
  const signs = [
    { x: 7,  key: 'move',  pc: '{left} {right} TO WALK   {up} TO JUMP', mob: 'USE THE PAD TO WALK AND JUMP' },
    { x: 14, key: 'move',  pc: 'HOLD {down} TO CROUCH', mob: 'HOLD DOWN TO CROUCH' },
    { x: 21, key: 'move',  pc: '{down} AND A WAY TO ROLL', mob: 'DOWN AND A WAY TO ROLL' },
    { x: 26, key: 'move',  pc: 'HOLD {up} FOR A HIGHER JUMP', mob: 'HOLD UP FOR A HIGHER JUMP' },
    { x: 34, key: 'fight', pc: '{attack} OR CLICK TO SWING', mob: 'TAP CUT TO SWING' },
    { x: 43, key: 'swim',  pc: 'HOLD {swim} TO SWIM ACROSS', mob: 'HOLD THE SWIMMER TO SWIM' },
    { x: 63, key: 'dash',  pc: 'JUMP, THEN {dash} TO DASH THE GAP', mob: 'JUMP, THEN TAP DSH' },
    { x: 75, key: 'pierce', pc: 'TWO TILES UP, {pierce} TO DIVE', mob: 'HIGH UP, TAP PRC TO DIVE' },
    { x: 84, key: 'climb', pc: 'WALK INTO THE LADDER TO CLIMB', mob: 'HOLD TOWARD THE LADDER TO CLIMB' },
    { x: 93, key: 'parry', pc: 'SWING AT ITS FIRE TO TURN IT', mob: 'TAP CUT AT ITS FIRE' },
    { x: doorX - 8, key: 'door', pc: 'STAND HERE AND CLICK THE DOOR', mob: 'STAND HERE AND TAP THE DOOR' }
  ];
  for (const s of signs)
    room.decor.push({ kind: 'sign', x: s.x * TILE + 8, y: (surf[s.x] + 1) * TILE, layer: 1,
                      pc: s.pc, mob: s.mob });

  /* practice foes, the idol that spits fire, and coins to sweep up */
  room.spawns.push({ type: 'snake', x: 36 * TILE, y: (GY) * TILE, tame: true });
  room.spawns.push({ type: 'snake', x: 40 * TILE, y: (GY) * TILE, tame: true });
  room.spawns.push({ type: 'snake', x: 81 * TILE, y: (GY) * TILE, tame: true });
  room.spawns.push({ type: 'idol', x: 102 * TILE, y: (GY - 7) * TILE });
  for (let k = 0; k < 16; k++) {
    const x = rng.i(6, W - 14);
    room.spawns.push({ type: 'coin', x: x * TILE, y: (surf[x] - 2) * TILE });
  }
  /* a little greenery, without the usual dense wood */
  for (let x = 2; x < W - 2; x++) {
    if (room.get(x, surf[x]) !== T_GRASS) continue;
    if (rng.bool(0.45)) room.decor.push({ kind: 'tuft', idx: rng.i(0, 3), x: x * TILE + rng.r(0, 14), y: surf[x] * TILE + 1, layer: 1, sway: rng.r(0.8, 1.8), phase: rng.r(0, TAU) });
    if (rng.bool(0.12)) room.decor.push({ kind: 'flower', idx: rng.i(0, 4), x: x * TILE + rng.r(2, 12), y: surf[x] * TILE + 1, layer: 1, sway: rng.r(0.6, 1.4), phase: rng.r(0, TAU) });
    if (rng.bool(0.06)) room.decor.push({ kind: 'tree', idx: rng.i(0, 5), x: x * TILE, y: surf[x] * TILE + 2, layer: 0, sway: rng.r(1.4, 2.6), phase: rng.r(0, TAU) });
  }
  return room;
}

/* ============================================================
   THE GULLET — inside the Leviathan. A shaft you must climb out of
   before the acid below reaches you. Dash the gaps, jump the ledges,
   roll under the low bones.
   ============================================================ */
/* The belly gets meaner every time it takes you. The shelves narrow and
   split, and the acid climbs faster. Three tiers of shelf are as far as it
   can go and still be climbed, so past that only the acid rises. */
const GULLET_TIERS = [
  { base: 12, min: 11, gap: 4, every: 3 },
  { base: 12, min: 11, gap: 4, every: 2 },
  { base: 11, min: 11, gap: 5, every: 2 }
];
function gulletTier(visits) { return GULLET_TIERS[clamp(visits | 0, 0, GULLET_TIERS.length - 1)]; }
function gulletAcidRate(visits) { return Math.min(46, 26 + (visits | 0) * 7); }
function buildGullet(seed, visits) {
  const tier = gulletTier(visits || 0);
  const rng = new RNG(seed);
  const W = 28, H = 58;
  const room = new Room({ id: 'gullet', name: 'THE GULLET', mode: 'side',
                          w: W, h: H, music: 'bossDeep', bg: 'abyss', ambient: 0.1, dark: 0.42 });
  room.fillRect(0, 0, W, H, T_EMPTY);
  const L = 4, R = W - 4;                      /* the walls of the throat */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) room.set(x, y, T_DEEPSTONE);
    for (let x = R; x < W; x++) room.set(x, y, T_DEEPSTONE);
  }
  for (let x = 0; x < W; x++) room.set(x, H - 1, T_DEEPSTONE);

  /* Ledges climb three tiles at a time, which a held jump clears, and they
     overlap across the middle so there is always a way straight up. Every
     third one is split by a gap wide enough to want a dash, a running jump or
     the speed a roll carries. */
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) surf[x] = H - 1;
  /* the shelves are ribs you can rise through and drop back down, so the
     climb never traps you under one */
  const put = (x0, x1, y) => {
    for (let x = Math.max(L, x0); x < Math.min(R, x1); x++) {
      room.set(x, y, T_WOOD);
      surf[x] = Math.min(surf[x], y);
    }
  };
  const ledges = [];
  let side = 1;
  for (let y = H - 5, n = 0; y > 5; y -= 3, n++) {
    /* narrow shelves, and narrower the higher you climb */
    const wide = clamp(tier.base - Math.floor(n / 4), tier.min, tier.base);
    const x0 = side > 0 ? L + 1 : R - 1 - wide;
    const x1 = x0 + wide;
    if (n > 0 && n % tier.every === 0) {
      /* a gap through the middle: dash it, or carry a run into the jump */
      const half = Math.floor(wide / 2) - 1;
      put(x0, x0 + half, y);
      put(x0 + half + tier.gap, x1, y);
      ledges.push({ x: x0, y: y, w: wide, gap: true });
    } else {
      put(x0, x1, y);
      ledges.push({ x: x0, y: y, w: wide, gap: false });
    }
    side *= -1;
  }
  room.surface = surf;
  const first = ledges[0];
  room.start = { x: (first.x + 3) * TILE, y: first.y * TILE };

  /* the way out, on the topmost shelf */
  const top = ledges[ledges.length - 1];
  const dx = (top.x + Math.floor(top.w / 2)) * TILE;
  room.exits.push({ x: dx - 18, y: (top.y - 3) * TILE, w: 36, h: 3 * TILE,
                    to: 'gulletOut', label: 'CUT YOUR WAY OUT', kind: 'arch',
                    door: { x: dx, y: top.y * TILE } });

  /* coins on the way, and a glow off the ribs */
  ledges.forEach((l, i) => {
    if (i === 0) return;
    room.spawns.push({ type: 'coin', x: (l.x + 2) * TILE, y: (l.y - 2) * TILE });
    if (i % 2 === 0) room.spawns.push({ type: 'coin', x: (l.x + l.w - 2) * TILE, y: (l.y - 2) * TILE });
    if (i % 3 === 0) room.decor.push({ kind: 'crystal', idx: rng.i(0, 2), x: (l.x + l.w - 1) * TILE, y: (l.y - 1) * TILE, layer: 1 });
  });

  /* the acid starts under the first shelf and climbs hard after you */
  room.acid = { y: (H - 2) * TILE, rate: gulletAcidRate(visits || 0) };
  return room;
}

/* ============================================================
   THE OLD MINESHAFT — dug, not worn: square tunnels, timber
   supports, rails and spiders.
   ============================================================ */
function buildMine(seed) {
  const rng = new RNG(seed);
  const W = 112, H = 40;
  const room = new Room({ id: 'mine', name: 'THE OLD MINESHAFT', mode: 'side',
                          w: W, h: H, music: 'cave', bg: 'cave', ambient: 0.14, dark: 0.52 });
  room.fillRect(0, 0, W, H, T_ROCK);

  const lanes = [];
  let y = 8, dir = 1;
  for (let l = 0; l < 3; l++) {
    const x0 = dir > 0 ? 6 : W - 7, x1 = dir > 0 ? W - 7 : 6;
    lanes.push({ y: y, x0: x0, x1: x1, dir: dir });
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    /* a square-cut tunnel, five tiles tall */
    for (let x = a; x <= b; x++) {
      for (let j = y - 4; j <= y; j++) room.set(x, j, T_EMPTY);
      room.set(x, y + 1, T_ROCKTOP);
      for (let j = y + 2; j <= y + 4; j++) room.set(x, j, T_ROCK);
    }
    /* shallow pits you can hop, or climb straight back out of */
    for (let k = 0; k < 4; k++) {
      const px = rng.i(a + 12, b - 16);
      for (let x = px; x < px + 2; x++) for (let j = y + 1; j <= y + 2; j++) room.set(x, j, T_EMPTY);
      room.spawns.push({ type: 'coin', x: (px + 1) * TILE, y: (y + 2) * TILE + 8 });
    }
    /* raised plank walkways */
    for (let k = 0; k < 3; k++) {
      const px = rng.i(a + 8, b - 12), pw = rng.i(4, 7);
      for (let x = px; x < px + pw; x++) room.set(x, y - 2, T_WOOD);
    }
    /* timber supports and rails */
    for (let x = a + 3; x < b - 2; x += rng.i(6, 9))
      room.decor.push({ kind: 'support', x: x * TILE + 8, y: (y + 1) * TILE, layer: 1 });
    for (let x = a; x <= b; x++)
      room.decor.push({ kind: 'rail', x: x * TILE, y: (y + 1) * TILE, layer: 1 });
    for (let k = 0; k < 2; k++)
      room.decor.push({ kind: 'cart', x: rng.i(a + 6, b - 6) * TILE, y: (y + 1) * TILE, layer: 1 });
    for (let x = a + 5; x < b - 4; x += rng.i(9, 14))
      room.decor.push({ kind: 'lantern', x: x * TILE + 8, y: (y - 4) * TILE, layer: 1 });
    /* ore in the walls */
    for (let k = 0; k < 10; k++) {
      const x = rng.i(a, b);
      room.decor.push({ kind: 'ore', idx: rng.i(0, 3), x: x * TILE + 8, y: (y + 1) * TILE, layer: 1 });
    }
    /* way-markers */
    for (let x = a + 10; x < b - 10; x += 17)
      room.decor.push({ kind: 'arrow', dir: dir > 0 ? 'right' : 'left', x: x * TILE + 8, y: (y - 3) * TILE, layer: 1 });

    /* the shaft down to the next level */
    if (l < 2) {
      const sx = x1, ny = y + 11;
      for (let j = y - 4; j <= ny + 1; j++) for (let i = -2; i <= 2; i++) room.set(sx + i, j, T_EMPTY);
      for (let k = 0; k < 5; k++) {
        const py = y + 2 + k * 2, off = (k % 2) ? 1 : -3;
        for (let i = 0; i < 3; i++) room.set(sx + off + i, py, T_WOOD);
      }
      room.decor.push({ kind: 'arrow', dir: 'down', x: sx * TILE + 8, y: (y - 3) * TILE, layer: 1 });
      y = ny;
    }
    dir *= -1;
  }
  /* seal the outside */
  for (let i = 0; i < W; i++) { room.set(i, 0, T_ROCK); room.set(i, 1, T_ROCK); room.set(i, H - 1, T_ROCK); room.set(i, H - 2, T_ROCK); }
  for (let j = 0; j < H; j++) { room.set(0, j, T_ROCK); room.set(1, j, T_ROCK); room.set(W - 1, j, T_ROCK); room.set(W - 2, j, T_ROCK); }

  room.start = { x: 8 * TILE, y: 8 * TILE };
  const last = lanes[lanes.length - 1];
  const exX = (last.dir > 0 ? W - 10 : 10) * TILE;
  room.exits.push({ x: exX - 20, y: last.y * TILE - 26, w: 40, h: 52, to: 'lair',
                    label: 'THE EMBER THRONE', kind: 'cave',
                    door: { x: exX, y: last.y * TILE + 14 } });
  room.exits.push({ x: 4 * TILE, y: 4 * TILE, w: 3 * TILE, h: 6 * TILE, to: 'cave',
                    useSaved: 'mineEntry', label: 'BACK TO THE CAVERN', kind: 'mine' });

  /* what lives down here */
  for (const lane of lanes) {
    const a = Math.min(lane.x0, lane.x1), b = Math.max(lane.x0, lane.x1);
    for (let k = 0; k < 7; k++) {
      const px = rng.i(a + 4, b - 4) * TILE;
      room.spawns.push({ type: 'spider', x: px, y: (lane.y - 4) * TILE });
    }
    for (let k = 0; k < 3; k++) {
      const px = rng.i(a + 4, b - 4) * TILE;
      room.spawns.push({ type: 'bat', x: px, y: (lane.y - 2) * TILE });
    }
    for (let k = 0; k < 2; k++) {
      const px = rng.i(a + 6, b - 6) * TILE;
      room.spawns.push({ type: 'snake', x: px, y: lane.y * TILE });
    }
    for (let k = 0; k < 9; k++) {
      const px = rng.i(a + 3, b - 3) * TILE;
      room.spawns.push({ type: 'coin', x: px, y: (lane.y - 1) * TILE });
    }
  }
  return room;
}

/* ============================================================
   AETHER CITY — a marble city adrift on the cloud tops
   ============================================================ */
function buildCloud(seed) {
  const rng = new RNG(seed);
  const W = 152, H = 28;
  const room = new Room({ id: 'cloud1', name: 'THE AETHER APPROACH', mode: 'side',
                          w: W, h: H, music: 'sky', bg: 'cloud', ambient: 0.5 });
  const surf = new Int16Array(W);
  /* a rolling bank of cloud you can always land on: no bottomless falls up here */
  for (let x = 0; x < W; x++) {
    const gy = 20 + Math.sin(x * 0.035 + seed) * 2.2 + Math.sin(x * 0.014) * 3.0;
    surf[x] = clamp(Math.round(gy), 12, H - 4);
  }
  for (let pass = 0; pass < 3; pass++)
    for (let x = 1; x < W; x++) surf[x] = clamp(surf[x], surf[x - 1] - 1, surf[x - 1] + 1);
  for (let x = 0; x < W; x++) {
    for (let y = surf[x]; y < H; y++) room.set(x, y, T_CLOUD);
    /* marble paving on the flatter stretches */
    if (x > 2 && surf[x] === surf[x - 1] && rng.bool(0.5)) room.set(x, surf[x], T_MARBLE);
  }
  room.surface = surf;

  /* ruined terraces to climb */
  const plats = [];
  for (let x = 12; x < W - 12; x += rng.i(9, 15)) {
    const py = surf[x] - rng.i(4, 9), pw = rng.i(4, 8);
    plats.push({ x: x, y: py, w: pw });
    for (let i = 0; i < pw; i++) {
      room.set(x + i, py, T_MARBLE);
      room.set(x + i, py + 1, T_MARBLE);
    }
    if (rng.bool(0.55)) {
      const cy = py - rng.i(4, 7), cw = rng.i(3, 5), cx2 = x + rng.i(-3, 3);
      for (let i = 0; i < cw; i++) room.set(cx2 + i, cy, T_CLOUDP);
    }
  }
  /* columns, braziers and statues on the terraces */
  for (const pl of plats) {
    if (rng.bool(0.75)) {
      const n = rng.i(1, 3);
      for (let k = 0; k < n; k++)
        room.decor.push({ kind: 'column', idx: rng.i(0, 1), x: (pl.x + 1 + k * 2) * TILE + 8, y: pl.y * TILE, layer: rng.bool(0.4) ? 0 : 1 });
    }
    if (rng.bool(0.5)) room.decor.push({ kind: 'brazier', x: (pl.x + pl.w - 1) * TILE + 8, y: pl.y * TILE, layer: 1 });
  }
  for (let x = 6; x < W - 6; x += rng.i(11, 20)) {
    const gy = surf[x] * TILE;
    if (rng.bool(0.5)) room.decor.push({ kind: 'statue', x: x * TILE + 8, y: gy, layer: 1 });
    else room.decor.push({ kind: 'column', idx: rng.i(0, 1), x: x * TILE + 8, y: gy, layer: rng.bool(0.5) ? 0 : 2 });
  }
  /* drifting cloudlets, front and back */
  for (let k = 0; k < 40; k++)
    room.decor.push({ kind: 'puff', idx: rng.i(0, 2), x: rng.r(0, W * TILE), y: rng.r(2, H - 6) * TILE,
                      layer: rng.bool(0.7) ? 0 : 2, drift: rng.r(2, 7), phase: rng.r(0, TAU) });

  room.start = { x: 5 * TILE, y: (surf[5] - 3) * TILE };
  const ex = W - 6;
  room.exits.push({ x: (ex - 1) * TILE, y: (surf[ex] - 4) * TILE, w: 3 * TILE, h: 5 * TILE,
                    to: 'olympus', label: 'THE OLYMPIAN COURT', kind: 'cloud',
                    door: { x: ex * TILE, y: surf[ex] * TILE } });
  for (let k = 0; k < 18; k++) {
    const x = rng.i(10, W - 8);
    room.spawns.push({ type: 'wisp', x: x * TILE, y: (surf[x] - rng.i(2, 7)) * TILE });
  }
  for (let k = 0; k < 14; k++) {
    const x = rng.i(10, W - 8);
    room.spawns.push({ type: 'bird', x: x * TILE, y: (surf[x] - rng.i(3, 9)) * TILE });
  }
  for (let k = 0; k < 24; k++) {
    const x = rng.i(6, W - 6);
    room.spawns.push({ type: 'coin', x: x * TILE, y: (surf[x] - rng.i(1, 8)) * TILE });
  }
  for (let x = 10; x < W - 10; x += 26)
    room.decor.push({ kind: 'arrow', dir: 'right', x: x * TILE, y: (surf[x] - 5) * TILE, layer: 1 });
  return room;
}
function buildOlympus(seed) {
  const rng = new RNG(seed);
  const W = 50, H = 26;
  const room = new Room({ id: 'olympus', name: 'THE OLYMPIAN COURT', mode: 'side',
                          w: W, h: H, music: 'boss', bg: 'cloud', ambient: 0.4 });
  for (let x = 0; x < W; x++) for (let y = H - 5; y < H; y++) room.set(x, y, y === H - 5 ? T_MARBLE : T_CLOUD);
  for (let x = 0; x < 4; x++) for (let y = 0; y < H; y++) { room.set(x, y, T_CLOUD); room.set(W - 1 - x, y, T_CLOUD); }
  for (const [lx, ly, lw] of [[8, H - 11, 7], [W - 15, H - 11, 7], [W / 2 - 4, H - 16, 8]])
    for (let i = 0; i < lw; i++) { room.set(Math.round(lx) + i, Math.round(ly), T_MARBLE); room.set(Math.round(lx) + i, Math.round(ly) + 1, T_MARBLE); }
  for (const cx of [7, 14, W - 15, W - 8])
    room.decor.push({ kind: 'column', idx: 1, x: cx * TILE + 8, y: (H - 5) * TILE, layer: rng.bool(0.5) ? 0 : 1 });
  for (const bx of [10, W - 11]) room.decor.push({ kind: 'brazier', x: bx * TILE + 8, y: (H - 5) * TILE, layer: 1 });
  room.decor.push({ kind: 'statue', x: (W / 2) * TILE, y: (H - 16) * TILE, layer: 0 });
  for (let k = 0; k < 24; k++)
    room.decor.push({ kind: 'puff', idx: rng.i(0, 2), x: rng.r(0, W * TILE), y: rng.r(1, H - 8) * TILE,
                      layer: rng.bool(0.6) ? 0 : 2, drift: rng.r(2, 6), phase: rng.r(0, TAU) });
  room.start = { x: 7 * TILE, y: (H - 5) * TILE };
  room.spawns.push({ type: 'zeus', x: (W - 14) * TILE, y: (H - 5) * TILE });
  return room;
}

/* ============================================================
   SPOREWOOD — bounce caps and fungus
   ============================================================ */
function buildMush(seed) {
  const rng = new RNG(seed);
  const W = 156, H = 30;
  const room = new Room({ id: 'mush1', name: 'SPOREWOOD HOLLOW', mode: 'side',
                          w: W, h: H, music: 'spore', bg: 'mush', ambient: 0.24, dark: 0.28 });
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const gy = 21 + Math.sin(x * 0.04 + seed) * 2.4 + Math.sin(x * 0.015) * 3.2;
    surf[x] = clamp(Math.round(gy), 12, H - 4);
  }
  for (let pass = 0; pass < 3; pass++)
    for (let x = 1; x < W; x++) surf[x] = clamp(surf[x], surf[x - 1] - 1, surf[x - 1] + 1);
  for (let x = 0; x < W; x++) for (let y = surf[x]; y < H; y++) room.set(x, y, T_MYC);
  room.surface = surf;

  /* bounce caps: on the ground to launch you, and floating as stepping stones */
  const caps = [];
  for (let x = 10; x < W - 10; x += rng.i(7, 13)) {
    const w2 = rng.i(2, 4);
    for (let i = 0; i < w2; i++) room.set(x + i, surf[x] - 1, T_BOUNCE);
    caps.push({ x: x, y: surf[x] - 1, w: w2 });
    if (rng.bool(0.6)) {
      const fy = surf[x] - rng.i(6, 11), fx = x + rng.i(-4, 4), fw = rng.i(2, 3);
      for (let i = 0; i < fw; i++) room.set(fx + i, fy, T_BOUNCE);
    }
  }
  /* high ledges worth bouncing up to */
  for (let x = 16; x < W - 16; x += rng.i(14, 22)) {
    const py = surf[x] - rng.i(10, 15), pw = rng.i(4, 7);
    for (let i = 0; i < pw; i++) { room.set(x + i, py, T_MYC); room.set(x + i, py + 1, T_MYC); }
    for (let k = 0; k < 3; k++) room.spawns.push({ type: 'coin', x: (x + 1 + k) * TILE, y: (py - 1) * TILE });
  }
  /* fungal forest */
  for (let x = 2; x < W - 2; x++) {
    const gy = surf[x];
    if (room.get(x, gy) !== T_MYC) continue;
    if (rng.bool(0.30)) {
      const s = rng.i(0, 5);
      room.decor.push({ kind: 'shroom', idx: s, x: x * TILE + rng.r(-4, 4), y: gy * TILE + rng.r(0, 4),
                        layer: rng.bool(0.6) ? 0 : (rng.bool(0.7) ? 1 : 2), sway: rng.r(0.6, 1.6), phase: rng.r(0, TAU) });
    }
    if (rng.bool(0.22)) room.decor.push({ kind: 'tuft', idx: rng.i(0, 3), x: x * TILE + rng.r(0, 14), y: gy * TILE + 1, layer: 1, sway: rng.r(0.7, 1.5), phase: rng.r(0, TAU) });
    if (rng.bool(0.10)) room.decor.push({ kind: 'mushroom', idx: rng.i(0, 2), x: x * TILE + rng.r(2, 12), y: gy * TILE + 1, layer: 1, sway: 0, phase: 0 });
    if (rng.bool(0.07)) room.decor.push({ kind: 'crystal', idx: 2, x: x * TILE + 8, y: gy * TILE, layer: 1, glow: true });
  }
  room.start = { x: 5 * TILE, y: (surf[5] - 3) * TILE };
  const ex = W - 7;
  room.exits.push({ x: (ex - 1) * TILE, y: (surf[ex] - 4) * TILE, w: 3 * TILE, h: 5 * TILE,
                    to: 'mushboss', label: 'THE MOTHER SPORE', kind: 'mush',
                    door: { x: ex * TILE, y: surf[ex] * TILE } });
  for (let k = 0; k < 20; k++) {
    const x = rng.i(10, W - 8);
    room.spawns.push({ type: 'sporeling', x: x * TILE, y: (surf[x] - 1) * TILE });
  }
  for (let k = 0; k < 8; k++) {
    const x = rng.i(10, W - 8);
    room.spawns.push({ type: 'spider', x: x * TILE, y: (surf[x] - 12) * TILE });
  }
  for (let k = 0; k < 8; k++) {
    const x = rng.i(10, W - 8);
    room.spawns.push({ type: 'snake', x: x * TILE, y: (surf[x] - 1) * TILE });
  }
  for (let k = 0; k < 24; k++) {
    const x = rng.i(6, W - 6);
    room.spawns.push({ type: 'coin', x: x * TILE, y: (surf[x] - rng.i(1, 6)) * TILE });
  }
  for (let x = 12; x < W - 12; x += 28)
    room.decor.push({ kind: 'arrow', dir: 'right', x: x * TILE, y: (surf[x] - 6) * TILE, layer: 1 });
  return room;
}
function buildMushBoss(seed) {
  const rng = new RNG(seed);
  const W = 48, H = 26;
  const room = new Room({ id: 'mushboss', name: 'THE MOTHER SPORE', mode: 'side',
                          w: W, h: H, music: 'boss', bg: 'mush', ambient: 0.2, dark: 0.34 });
  room.fillRect(0, 0, W, H, T_MYC);
  room.fillRect(3, 3, W - 6, H - 8, T_EMPTY);
  for (let x = 3; x < W - 3; x++) room.set(x, H - 5, T_MYC);
  /* bounce caps in the corners, so you can reach her cap */
  for (const bx of [7, 15, W - 17, W - 9])
    for (let i = 0; i < 3; i++) room.set(bx + i, H - 6, T_BOUNCE);
  for (const [lx, ly, lw] of [[10, H - 13, 6], [W - 16, H - 13, 6]])
    for (let i = 0; i < lw; i++) room.set(lx + i, ly, T_MYC);
  for (let k = 0; k < 12; k++)
    room.decor.push({ kind: 'shroom', idx: rng.i(0, 3), x: rng.r(4, W - 4) * TILE, y: (H - 5) * TILE,
                      layer: rng.bool(0.5) ? 0 : 2, sway: rng.r(0.5, 1.2), phase: rng.r(0, TAU) });
  for (let k = 0; k < 10; k++)
    room.decor.push({ kind: 'crystal', idx: 2, x: rng.r(4, W - 4) * TILE, y: (H - 5) * TILE, layer: 1, glow: true });
  room.start = { x: 6 * TILE, y: (H - 5) * TILE };
  room.spawns.push({ type: 'mother', x: (W / 2) * TILE, y: (H - 5) * TILE });
  return room;
}

/* ============================================================
   THE LAIR — the dragon's arena
   ============================================================ */
function buildLair(seed) {
  const rng = new RNG(seed);
  /* The hall is only a little taller than the view, so the windows and the
     light they throw are both on screen at once. */
  const W = 46, H = 18;
  /* A throne room, not a cave: swept stone, tall windows, and nothing in it
     but the armour standing watch. It plays no music until the dragon comes. */
  const room = new Room({ id: 'lair', name: 'THE EMBER THRONE', mode: 'side',
                          w: W, h: H, music: 'silence', bg: 'lair', ambient: 0, dark: 0.30 });
  room.fillRect(0, 0, W, H, T_ROCK);
  room.fillRect(3, 2, W - 6, H - 5, T_EMPTY);
  /* one long swept floor, so the fight has room */
  const FY = H - 4;
  for (let x = 3; x < W - 3; x++) for (let y = FY; y < H; y++) room.set(x, y, y === FY ? T_MARBLE : T_ROCK);
  room.surface = new Int16Array(W);
  for (let x = 0; x < W; x++) room.surface[x] = FY;

  /* the windows, and the light they throw down onto the floor */
  room.windows = [];
  for (let k = 0; k < 5; k++) {
    const wx = 7 + k * 8;
    room.windows.push({ x: wx * TILE + 8, y: 5 * TILE, w: 5 * TILE, h: 6 * TILE, seed: 300 + k });
  }
  /* pillars between the windows, drawn behind everything */
  for (let k = 0; k < 6; k++) {
    const px = (4 + k * 8) * TILE;
    room.decor.push({ kind: 'column', idx: rng.i(0, 1), x: px, y: FY * TILE, layer: 0 });
  }
  /* the dais and the throne at the far end */
  for (let x = W - 12; x < W - 4; x++) { room.set(x, FY - 1, T_MARBLE); room.set(x, FY, T_ROCK); }
  room.decor.push({ kind: 'statue', x: (W - 8) * TILE, y: (FY - 1) * TILE, layer: 1 });

  room.start = { x: 6 * TILE, y: FY * TILE };
  /* the armour stands watch on the dais steps; the dragon comes later */
  room.spawns.push({ type: 'armour', x: (W - 16) * TILE, y: FY * TILE });
  room.spawns.push({ type: 'armour', x: 20 * TILE, y: FY * TILE });
  room.dragonDrop = { x: (W - 14) * TILE, y: 3 * TILE };
  return room;
}

/* Every realm of the later chapters is a run of three stretches and then
   the arena. Each stretch is longer and rougher than the one before it,
   and the door at the end of one opens the next. */
function buildRealmChain(d, theme) {
  const names = d.parts || [d.name, d.name, d.name];
  const ids = names.map((_, k) => k === 0 ? d.id : d.id + (k + 1));
  for (let k = 0; k < ids.length; k++) {
    const last = k === ids.length - 1;
    World.rooms[ids[k]] = buildChapterRoom(Object.assign({}, d, theme, {
      id: ids[k], name: names[k], seed: d.seed + k * 137,
      w: d.w + k * 14,
      hazards: d.hazards + k * 2,
      ambient: d.ambient, dark: d.dark,
      riddle: d.riddleAt === k,
      to: last ? d.id + 'End' : ids[k + 1],
      toLabel: last ? d.toLabel : names[k + 1]
    }));
  }
  World.rooms[d.id + 'End'] = buildChapterArena({
    id: d.id + 'End', name: d.toLabel, seed: d.seed + 500, bg: theme.bg,
    music: theme.bossMusic, oasis: theme.oasis,
    ground: theme.ground, groundTop: theme.groundTop, plat: theme.plat,
    ambient: d.ambient, dark: d.dark, decor: theme.decor, boss: d.boss
  });
}

/* ============================================================
   CHAPTERS TWO AND THREE — one generator per theme, run three
   times each with rising difficulty.
   ============================================================ */
function buildChapterRoom(o) {
  const rng = new RNG(o.seed);
  const W = o.w, H = 30;
  const room = new Room({ id: o.id, name: o.name, mode: 'side', w: W, h: H,
                          music: o.music, bg: o.bg, ambient: o.ambient, dark: o.dark || 0 });
  const ground = o.ground, groundTop = o.groundTop, plat = o.plat;
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const gy = 21 + Math.sin(x * 0.038 + o.seed) * 2.6 + Math.sin(x * 0.016) * 3.4;
    surf[x] = clamp(Math.round(gy), 11, H - 4);
  }
  for (let pass = 0; pass < 3; pass++)
    for (let x = 1; x < W; x++) surf[x] = clamp(surf[x], surf[x - 1] - 1, surf[x - 1] + 1);
  for (let x = 0; x < W; x++) {
    room.set(x, surf[x], groundTop);
    for (let y = surf[x] + 1; y < H; y++) room.set(x, y, ground);
  }
  room.surface = surf;
  /* terraces and ledges to climb */
  for (let x = 12; x < W - 12; x += rng.i(9, 16)) {
    const py = surf[x] - rng.i(4, 10), pw = rng.i(4, 8);
    for (let i = 0; i < pw; i++) { room.set(x + i, py, plat); room.set(x + i, py + 1, ground); }
    if (rng.bool(0.5)) for (let k = 0; k < 3; k++)
      room.spawns.push({ type: 'coin', x: (x + 1 + k) * TILE, y: (py - 1) * TILE });
  }
  /* pools of water, where the theme calls for them */
  if (o.pools) for (let k = 0; k < o.pools; k++) {
    const px = rng.i(10, W - 18), pw = rng.i(8, 16), depth = rng.i(3, 5);
    let bed = 0;
    for (let x = px; x < px + pw; x++) bed = Math.max(bed, surf[x]);
    const top = bed - depth + 1;
    for (let x = px + 1; x < px + pw - 1; x++) {
      for (let y = Math.min(top, surf[x]); y < top; y++) room.set(x, y, T_EMPTY);
      for (let y = top; y <= bed; y++) room.set(x, y, y === top ? T_WATER : T_WATERD);
      surf[x] = top;
    }
  }
  /* ---- ground that is not what it looks like ---- */
  /* patches of bare ice: no grip at all */
  if (o.ice) for (let k = 0; k < o.ice; k++) {
    const px = rng.i(12, W - 20), pw = rng.i(6, 13);
    for (let x = px; x < px + pw; x++) room.set(x, surf[x], T_ICE);
  }
  /* ---- traps and moving ground, so the walk is not one flat line ----
     Each feature asks for a different piece of movement: a pit wants a jump
     or a dash, a lift wants patience or a roll across, a spike bed wants a
     jump, and a sweeping block wants you to time the gap. */
  const feats = o.hazards || 0;
  let fx = 24;
  for (let n = 0; n < feats && fx < W - 30; n++) {
    const kind = n % 4;
    if (kind === 0) {
      /* a pit, spiked at the bottom, with a lift running across it */
      const pw = rng.i(6, 9), floor = H - 3;
      for (let x = fx; x < fx + pw; x++) {
        for (let y = surf[x]; y < floor; y++) room.set(x, y, T_EMPTY);
        for (let y = floor; y < H; y++) room.set(x, y, y === floor ? groundTop : ground);
        surf[x] = floor;
      }
      room.spawns.push({ type: 'spikes', x: fx * TILE, y: floor * TILE - 10, w: pw * TILE, dmg: 3 });
      const ly = (floor - rng.i(4, 6)) * TILE;
      room.spawns.push({ type: 'lift', x: fx * TILE, y: ly, w: 40,
                         bx: (fx + pw - 3) * TILE, by: ly, speed: 40, wait: 0.6 });
      room.spawns.push({ type: 'coin', x: (fx + Math.floor(pw / 2)) * TILE, y: ly - 20 });
      fx += pw + rng.i(8, 13);
    } else if (kind === 1) {
      /* a bed of spikes on open ground: jump it, dash it or roll over */
      const sw = rng.i(3, 5);
      let flat = surf[fx];
      for (let x = fx; x < fx + sw; x++) { room.set(x, flat, groundTop); for (let y = flat + 1; y < H; y++) room.set(x, y, ground); surf[x] = flat; }
      room.spawns.push({ type: 'spikes', x: fx * TILE, y: flat * TILE - 10, w: sw * TILE, dmg: 2 });
      fx += sw + rng.i(9, 15);
    } else if (kind === 2) {
      /* a lift rising to a shelf of coins above */
      const top = surf[fx] - rng.i(7, 10);
      for (let i = 0; i < 5; i++) { room.set(fx + i, top, plat); room.set(fx + i, top + 1, ground); }
      for (let k = 0; k < 4; k++) room.spawns.push({ type: 'coin', x: (fx + k) * TILE + 8, y: (top - 2) * TILE });
      room.spawns.push({ type: 'lift', x: (fx - 3) * TILE, y: (surf[fx] - 2) * TILE, w: 38,
                         bx: (fx - 3) * TILE, by: (top + 1) * TILE, speed: 30, wait: 0.9,
                         col: '#c68e3f', col2: '#6d5a2a' });
      fx += rng.i(11, 16);
    } else {
      /* a block sweeping the ground you want to run along */
      const gy = surf[fx];
      room.spawns.push({ type: 'crusher', x: fx * TILE + 8, y: (gy - 7) * TILE,
                         bx: fx * TILE + 8, by: gy * TILE - 12, w: 24, h: 24,
                         speed: 74, dmg: 3, phase: rng.r(0, 1) });
      fx += rng.i(9, 14);
    }
  }

  /* dressing */
  for (let x = 2; x < W - 2; x++) {
    const gy = surf[x];
    if (room.get(x, gy) !== groundTop) continue;
    for (const d of o.decor) if (rng.bool(d.p))
      room.decor.push({ kind: d.kind, idx: d.n ? rng.i(0, d.n - 1) : 0,
                        x: x * TILE + rng.r(-4, 12), y: gy * TILE + rng.r(0, 3),
                        layer: rng.bool(0.5) ? 0 : (rng.bool(0.7) ? 1 : 2),
                        sway: rng.r(0.6, 1.8), phase: rng.r(0, TAU) });
  }
  /* Pools of quicksand and drifts of powdered snow.  Each one lies in a pit
     dug into the ground, and the pit is filled to the brim: the top row of
     the pool sits level with the ground on either side of it, and every row
     under that one is buried.  So what you see is a surface, and what is
     under it swallows you. */
  const phaseKind = o.powder ? T_POWDER : (o.quick ? T_QUICK : 0);
  const phaseN = o.powder || o.quick || 0;
  if (phaseKind) {
    room.phasePools = [];
    for (let k = 0; k < phaseN; k++) {
      const px = 20 + Math.round((W - 44) * (k + 0.5) / phaseN) + rng.i(-5, 5);
      const pw = rng.i(5, 8), depth = rng.i(4, 6);
      /* Level the lip, so the pool reads as one flat surface.  Everything
         above the lip is cleared and everything below it is filled, right
         across the pit and one column past it on either side. */
      let lip = 0;
      for (let x = px - 2; x <= px + pw + 1; x++) lip = Math.max(lip, surf[x]);
      lip = Math.min(lip, H - depth - 4);
      for (let x = px - 2; x <= px + pw + 1; x++) {
        for (let y = 0; y < lip; y++) room.set(x, y, T_EMPTY);
        room.set(x, lip, groundTop);
        for (let y = lip + 1; y < H; y++) room.set(x, y, ground);
        surf[x] = lip;
      }
      /* dig the pit and fill it to the brim, the top row level with the lip */
      for (let x = px; x < px + pw; x++) {
        for (let y = lip; y < lip + depth; y++) room.set(x, y, phaseKind);
        /* a floor under it, so a ring bearer lands rather than falls for ever */
        for (let y = lip + depth; y < H; y++) room.set(x, y, ground);
        surf[x] = lip;
      }
      room.phasePools.push({ x: px, w: pw, y: lip, depth: depth,
                             seed: (o.seed * 1013 + k * 7919 + px * 31) >>> 0 });
    }
  }


  /* the sphinx sits in one stretch of its own realm and asks its question */
  if (o.riddle) {
    const rx = Math.floor(W * 0.56);
    let gy = surf[rx];
    for (let i = -5; i <= 5; i++) { surf[rx + i] = gy; room.set(rx + i, gy, groundTop);
      for (let y = gy + 1; y < H; y++) room.set(rx + i, y, ground); }
    room.decor.push({ kind: 'sphinx', x: rx * TILE + 8, y: gy * TILE, layer: 1 });
    room.riddle = { x: rx * TILE + 8, y: gy * TILE, seed: o.seed };
    /* The wall it keeps.  It runs from the ground to the roof of the room and
       it is three courses thick, so there is no way over it and no way round
       it.  The only way past is the answer. */
    const gx = rx + 9;
    for (let x = gx; x <= gx + 2; x++) {
      for (let y = 1; y <= gy; y++) room.set(x, y, T_TOMB);
      for (let y = gy + 1; y < H; y++) room.set(x, y, ground);
    }
    room.gate = { x0: gx, x1: gx + 2, y0: 1, y1: gy, doorX: gx + 1, doorY: gy };
    /* level the ground either side of it, so the wall stands square */
    for (let x = gx - 2; x <= gx + 4; x++) {
      surf[x] = gy; room.set(x, gy, x >= gx && x <= gx + 2 ? T_TOMB : groundTop);
      for (let y = gy + 1; y < H; y++) room.set(x, y, ground);
    }
    for (let k = 0; k < 8; k++)
      room.spawns.push({ type: 'coin', x: (gx + 5 + k) * TILE, y: (gy - 2) * TILE });
  }
  /* fresh snow lies over whatever is left standing */
  if (o.snow) laySnow(room, rng);
  room.start = { x: 5 * TILE, y: (surf[5] - 3) * TILE };
  const ex = W - 7;
  room.exits.push({ x: (ex - 1) * TILE, y: (surf[ex] - 4) * TILE, w: 3 * TILE, h: 5 * TILE,
                    to: o.to, label: o.toLabel, kind: o.doorKind,
                    door: { x: ex * TILE, y: surf[ex] * TILE } });
  for (let x = 12; x < W - 12; x += 26)
    room.decor.push({ kind: 'arrow', dir: 'right', x: x * TILE, y: (surf[x] - 5) * TILE, layer: 1 });
  /* inhabitants */
  for (const sp of o.spawns) for (let k = 0; k < sp.n; k++) {
    const x = rng.i(9, W - 8);
    room.spawns.push({ type: sp.type, x: x * TILE, y: (surf[x] - (sp.air ? rng.i(3, 9) : 1)) * TILE });
  }
  for (let k = 0; k < 26; k++) {
    const x = rng.i(6, W - 6);
    room.spawns.push({ type: 'coin', x: x * TILE, y: (surf[x] - rng.i(1, 7)) * TILE });
  }
  return room;
}
/* A blanket of fresh snow, measured every four pixels across the room.  The
   player carves tracks in it and the drift fills them in again. */
const SNOW_SPAN = 4;
function laySnow(room, rng) {
  const n = Math.ceil(room.w * TILE / SNOW_SPAN);
  room.snow = new Float32Array(n);
  room.snowMax = new Float32Array(n);
  room.snowGY = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const px = i * SNOW_SPAN + SNOW_SPAN / 2;
    const tx = Math.floor(px / TILE);
    /* the first firm ground under the sky in this column */
    let ty = -1;
    for (let y = 0; y < room.h; y++) {
      if (room.phase(tx, y) || room.wet(tx, y)) break;      /* no snow lies on these */
      if (room.solid(tx, y)) { ty = y; break; }
    }
    if (ty < 0) { room.snowGY[i] = -1; continue; }
    room.snowGY[i] = ty * TILE;
    const d = 4 + Math.sin(px * 0.021 + 1.3) * 2.2 + Math.sin(px * 0.007) * 1.6 + rng.r(-0.5, 0.5);
    room.snowMax[i] = clamp(d, 1.5, 8);
    room.snow[i] = room.snowMax[i];
  }
  room.snowFill = 0;
}
/* ============================================================
   THE VAULTS UNDER THE WORLD.  Every patch of quicksand and
   every drift of powdered snow has its own.  The seed of the
   patch shapes it, so no two are the same.

   Every vault ends the same way: a shaft twenty tiles tall and
   four tiles wide, which only a wall climb gets you up.  The
   prize sits at the top of it.
   ============================================================ */
const VAULT_SHAFT_H = 20;      /* tiles of climb */
const VAULT_SHAFT_W = 4;       /* tiles across, inside the walls */
function buildVault(seed, kind, name) {
  const rng = new RNG(seed);
  const sandy = kind !== 'snow';
  const W = 52, H = 34;
  const FY = H - 5;                                  /* the floor of the gallery */
  const ground = sandy ? T_TOMB : T_ROCK;
  const groundTop = sandy ? T_TOMBTOP : T_ROCKTOP;
  const plat = sandy ? T_SANDTOP : T_ICE;
  const room = new Room({ id: 'vault', name: name || (sandy ? 'THE BURIED VAULT' : 'THE HOLLOW UNDER THE DRIFT'),
                          mode: 'side', w: W, h: H,
                          music: 'cave', bg: sandy ? 'tomb' : 'cave',
                          ambient: 0.14, dark: 0.58 });
  room.fillRect(0, 0, W, H, ground);

  /* --- the shaft, on the right, and the chamber over it --- */
  const sx0 = W - 9, sx1 = sx0 + VAULT_SHAFT_W - 1;  /* 43..46 inside the walls */
  const topRow = FY - VAULT_SHAFT_H;                 /* 9 */
  room.fillRect(sx0, topRow, VAULT_SHAFT_W, FY - topRow, T_EMPTY);
  /* the chamber at the head of it, reached by stepping right off the climb */
  room.fillRect(sx0, topRow - 5, W - 2 - sx0, 5, T_EMPTY);
  for (let x = sx1 + 1; x < W - 2; x++) room.set(x, topRow, groundTop);
  /* the way in at the foot of the shaft */
  room.set(sx0 - 1, FY - 1, T_EMPTY);
  room.set(sx0 - 1, FY - 2, T_EMPTY);

  /* --- the gallery you land in --- */
  const gy0 = 13;
  room.fillRect(2, gy0, sx0 - 3, FY - gy0, T_EMPTY);
  for (let x = 2; x < sx0 - 1; x++) room.set(x, FY, groundTop);
  room.start = { x: 5 * TILE, y: FY * TILE };

  /* --- what the gallery holds, drawn from the seed --- */
  const kinds = ['pit', 'ledge', 'spikes', 'crusher', 'lift', 'pillars'];
  /* shuffle, so each patch lays its gallery out differently */
  for (let i = kinds.length - 1; i > 0; i--) { const j = rng.i(0, i); const t = kinds[i]; kinds[i] = kinds[j]; kinds[j] = t; }
  let fx = 11;
  const feats = rng.i(4, 6);
  for (let n = 0; n < feats && fx < sx0 - 10; n++) {
    const k = kinds[n % kinds.length];
    if (k === 'pit') {
      /* Four tiles across at the most, so a plain jump clears it, and three
         deep, so a jump also gets you out of it again. */
      const pw = rng.i(3, 4), bottom = FY + 2;
      for (let x = fx; x < fx + pw; x++) {
        for (let y = FY; y <= bottom; y++) room.set(x, y, T_EMPTY);
        for (let y = bottom + 1; y < H; y++) room.set(x, y, ground);
        room.set(x, bottom + 1, groundTop);
      }
      room.spawns.push({ type: 'spikes', x: fx * TILE, y: (bottom + 1) * TILE - 10, w: pw * TILE, dmg: 3 });
      fx += pw + rng.i(5, 8);
    } else if (k === 'ledge') {
      const py = FY - rng.i(4, 7), pw = rng.i(4, 7);
      for (let i2 = 0; i2 < pw; i2++) room.set(fx + i2, py, T_WOOD);
      for (let i2 = 0; i2 < pw; i2++) room.spawns.push({ type: 'coin', x: (fx + i2) * TILE + 8, y: (py - 1) * TILE });
      fx += pw + rng.i(4, 6);
    } else if (k === 'spikes') {
      const sw = rng.i(3, 5);
      room.spawns.push({ type: 'spikes', x: fx * TILE, y: FY * TILE - 10, w: sw * TILE, dmg: 3 });
      fx += sw + rng.i(5, 8);
    } else if (k === 'crusher') {
      room.spawns.push({ type: 'crusher', x: fx * TILE + 8, y: (FY - 8) * TILE,
                         bx: fx * TILE + 8, by: (FY - 2) * TILE, w: 24, h: 24,
                         speed: 70, dmg: 3, phase: rng.r(0, 1) });
      fx += rng.i(6, 9);
    } else if (k === 'lift') {
      const ly = (FY - rng.i(4, 6)) * TILE;
      room.spawns.push({ type: 'lift', x: fx * TILE, y: ly, w: 40,
                         bx: (fx + rng.i(3, 5)) * TILE, by: ly, speed: 38, wait: 0.6 });
      fx += rng.i(7, 10);
    } else {
      /* Two screens of stone.  The gap in each one stands on the floor, so it
         is a doorway you walk through.  Their heights vary, not their gaps. */
      for (let i2 = 0; i2 < 2; i2++) {
        const px = fx + i2 * 5;
        const top = gy0 + 1 + rng.i(0, 5);
        for (let y = top; y < FY - 2; y++) room.set(px, y, plat);
      }
      fx += rng.i(9, 12);
    }
  }

  /* Nothing laid in the gallery may seal it.  Any run of missing floor wider
     than three tiles gets a plank across the middle of it. */
  {
    let run = 0;
    for (let x = 3; x < sx0 - 1; x++) {
      let floor = false;
      for (let y = FY; y < H; y++) if (room.solid(x, y) || room.oneway(x, y)) { floor = true; break; }
      if (!floor) run++;
      else {
        if (run > 3) for (let i2 = x - run; i2 < x; i2++) room.set(i2, FY, T_WOOD);
        run = 0;
      }
    }
    if (run > 3) for (let i2 = sx0 - 1 - run; i2 < sx0 - 1; i2++) room.set(i2, FY, T_WOOD);
  }

  /* --- its keepers, and what they guard --- */
  const walker = sandy ? (rng.bool(0.5) ? 'mummy' : 'scarab') : (rng.bool(0.5) ? 'wolf' : 'yeti');
  const flier = sandy ? 'vulture' : 'icewisp';
  for (let k = 0; k < rng.i(4, 7); k++) {
    const x = rng.i(12, sx0 - 4);
    room.spawns.push({ type: walker, x: x * TILE, y: (FY - 1) * TILE });
  }
  for (let k = 0; k < rng.i(4, 8); k++) {
    const x = rng.i(10, sx0 - 4);
    room.spawns.push({ type: flier, x: x * TILE, y: (FY - rng.i(3, 8)) * TILE });
  }
  /* a pair of them waiting at the head of the climb */
  for (let k = 0; k < 2; k++)
    room.spawns.push({ type: flier, x: (sx1 + 2 + k) * TILE, y: (topRow - 3) * TILE });
  for (let k = 0; k < rng.i(18, 28); k++) {
    const x = rng.i(6, sx0 - 4);
    room.spawns.push({ type: 'coin', x: x * TILE, y: (FY - rng.i(1, 7)) * TILE });
  }
  /* coins up the shaft, to say which way is out */
  for (let k = 0; k < 6; k++)
    room.spawns.push({ type: 'coin', x: (sx0 + (k % 2 ? 0 : 3)) * TILE + 8,
                       y: (FY - 3 - k * 3) * TILE });

  /* the prize, at the head of the climb */
  const cx = sx1 + 3;
  room.spawns.push({ type: 'relicChest', x: cx * TILE + 8, y: topRow * TILE, pool: sandy ? 'sand' : 'snow' });
  room.exits.push({ x: (W - 4) * TILE - 14, y: topRow * TILE - 44, w: 30, h: 44,
                    to: '@surface', label: 'BACK TO THE SURFACE', kind: 'cave',
                    door: { x: (W - 4) * TILE, y: topRow * TILE } });

  /* --- dressing --- */
  for (let tx = 6; tx < sx0 - 2; tx += 7)
    room.decor.push({ kind: 'torch', x: tx * TILE + 8, y: (gy0 + 1) * TILE, layer: 1 });
  /* a torch every few tiles up the shaft, so the climb is lit */
  for (let ty = FY - 3; ty > topRow; ty -= 4)
    room.decor.push({ kind: 'torch', x: (ty % 8 < 4 ? sx0 : sx1) * TILE + 8, y: ty * TILE, layer: 1 });
  room.decor.push({ kind: 'torch', x: (sx1 + 1) * TILE + 8, y: (topRow - 1) * TILE, layer: 1 });
  for (let k = 0; k < 22; k++)
    room.decor.push({ kind: sandy ? 'column' : 'stal', idx: rng.i(0, sandy ? 1 : 3),
                      x: rng.i(4, sx0 - 3) * TILE, y: (rng.bool(0.5) ? FY : gy0 + 1) * TILE,
                      layer: rng.bool(0.5) ? 0 : 2 });
  room.vaultShaft = { x0: sx0, x1: sx1, top: topRow, bottom: FY };
  return room;
}
World.buildVault = buildVault;

/* ============================================================
   THE ISLANDS.  Cut on demand from the kind of island, which
   one of the twenty it is, and which of its four levels.  The
   twentieth island of a spoke is a harder place than the first.
   ============================================================ */
const ISLES_PER_TYPE = 20;
const ISLE_LEVELS = 4;              /* three levels and the guardian's ground */
const ISLE_THEME = {
  snow:   { ground: T_SNOW, top: T_SNOWTOP, plat: T_ICE, bg: 'snow', music: 'tide',
            walkers: ['wolf', 'yeti'], fliers: ['icewisp'], decor: ['pine', 'rock'], snow: true },
  fire:   { ground: T_ASH, top: T_ASHTOP, plat: T_OBSID, bg: 'ash', music: 'ember',
            walkers: ['emberling', 'golem'], fliers: ['cinderwing'], decor: ['pillar', 'rock'] },
  desert: { ground: T_SAND, top: T_SANDTOP, plat: T_TOMB, bg: 'waste', music: 'ember',
            walkers: ['scarab', 'mummy'], fliers: ['vulture'], decor: ['cactus', 'bone', 'rock'] },
  forest: { ground: T_DIRT, top: T_GRASS, plat: T_WOOD, bg: 'forest', music: 'forest',
            walkers: ['snake', 'bear', 'spider'], fliers: ['bird'], decor: ['tree', 'bush', 'tuft', 'fern'] },
  /* the mesa: red rock, timber trestles, clapboard houses and tumbleweed */
  mesa:   { ground: T_DIRT, top: T_ROCKTOP, plat: T_WOOD, bg: 'waste', music: 'ember',
            walkers: ['bear', 'wolf', 'snake'], fliers: ['vulture'],
            decor: ['cactus', 'rock', 'tumbleweed'], mesa: true }
};
function buildIsle(typeKey, index, level) {
  const th = ISLE_THEME[typeKey] || ISLE_THEME.forest;
  const seed = (typeKey.charCodeAt(0) * 7919 + index * 613 + level * 97) >>> 0;
  const rng = new RNG(seed);
  const boss = level === ISLE_LEVELS - 1;
  const hard = index / (ISLES_PER_TYPE - 1);          /* 0 at the first, 1 at the last */
  const W = boss ? 54 : 86 + Math.round(hard * 40) + level * 8;
  const H = 30;
  const room = new Room({ id: 'isle', name: '', mode: 'side', w: W, h: H,
                          music: boss ? (typeKey === 'snow' ? 'bossDeep' : 'bossAsh') : th.music,
                          bg: th.bg, ambient: 0.34, dark: typeKey === 'fire' ? 0.24 : 0.08 });
  const surf = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const gy = 21 + Math.sin(x * 0.04 + seed) * 2.4 + Math.sin(x * 0.017 + seed * 0.3) * 3.2;
    surf[x] = clamp(Math.round(gy), 12, H - 4);
  }
  for (let pass = 0; pass < 3; pass++)
    for (let x = 1; x < W; x++) surf[x] = clamp(surf[x], surf[x - 1] - 1, surf[x - 1] + 1);
  /* the island stands out of the sea, so both ends fall away into it */
  for (let x = 0; x < W; x++) {
    const edge = Math.min(x, W - 1 - x);
    if (edge < 3) surf[x] = H - 1;
    room.set(x, surf[x], th.top);
    for (let y = surf[x] + 1; y < H; y++) room.set(x, y, th.ground);
  }
  room.surface = surf;

  /* ledges to climb */
  for (let x = 10; x < W - 10; x += rng.i(8, 15)) {
    const py = surf[x] - rng.i(4, 9), pw = rng.i(4, 8);
    for (let i = 0; i < pw; i++) { room.set(x + i, py, th.plat); if (!boss) room.set(x + i, py + 1, th.ground); }
    if (rng.bool(0.6)) for (let k = 0; k < 3; k++)
      room.spawns.push({ type: 'coin', x: (x + 1 + k) * TILE, y: (py - 1) * TILE });
  }

  /* the mesa carries timber trestles across its gorges, and houses on its flats */
  if (th.mesa && !boss) {
    for (let k = 0; k < 2 + Math.round(hard * 2); k++) {
      const gx = rng.i(14, W - 26), gw = rng.i(9, 15);
      for (let x = gx; x < gx + gw; x++) { for (let y = surf[x]; y < H; y++) room.set(x, y, T_EMPTY); surf[x] = H - 1; }
      const by = Math.min(surf[gx - 1], surf[gx + gw]) - 1;
      for (let x = gx - 1; x <= gx + gw; x++) room.set(x, by, T_WOOD);
      room.decor.push({ kind: 'trestle', x: gx * TILE, y: by * TILE, w: (gw + 2) * TILE,
                        h: (H - 2 - by) * TILE, layer: 0 });
      for (let x = gx; x < gx + gw; x += 3)
        room.spawns.push({ type: 'coin', x: x * TILE + 8, y: (by - 2) * TILE });
    }
    for (let k = 0; k < 2 + Math.round(hard * 2); k++) {
      const hx = rng.i(8, W - 12);
      let flat = surf[hx];
      for (let i = -3; i <= 3; i++) { surf[hx + i] = flat; room.set(hx + i, flat, th.top);
        for (let y = flat + 1; y < H; y++) room.set(hx + i, y, th.ground); }
      room.decor.push({ kind: 'house', idx: rng.i(0, 2), x: hx * TILE + 8, y: flat * TILE, layer: 1 });
    }
  }

  /* the guardian's ground is a plain arena */
  if (boss) {
    room.fillRect(3, 4, W - 6, H - 9, T_EMPTY);
    for (let x = 3; x < W - 3; x++) { surf[x] = H - 5; room.set(x, H - 5, th.top);
      for (let y = H - 4; y < H; y++) room.set(x, y, th.ground); }
    for (const [lx, ly, lw] of [[9, H - 12, 7], [W - 16, H - 12, 7], [W / 2 - 4, H - 17, 8]])
      for (let i = 0; i < lw; i++) room.set(Math.round(lx) + i, Math.round(ly), th.plat);
    room.start = { x: 7 * TILE, y: (H - 5) * TILE };
    room.spawns.push({ type: 'isleBoss', kind: typeKey, tier: index, x: (W - 14) * TILE, y: (H - 5) * TILE });
  } else {
    room.start = { x: 5 * TILE, y: (surf[5] - 3) * TILE };
    const ex = W - 6;
    let exX = ex;
    while (exX > 8 && surf[exX] >= H - 2) exX--;
    room.exits.push({ x: (exX - 1) * TILE, y: (surf[exX] - 4) * TILE, w: 3 * TILE, h: 5 * TILE,
                      to: '@isleNext', label: 'ONWARD', kind: 'cave',
                      door: { x: exX * TILE, y: surf[exX] * TILE } });
    /* its people */
    const n = 8 + Math.round(hard * 14) + level * 2;
    for (let k = 0; k < n; k++) {
      const x = rng.i(8, W - 8);
      if (surf[x] >= H - 2) continue;
      const air = rng.bool(0.4);
      const type = air ? rng.pick(th.fliers) : rng.pick(th.walkers);
      room.spawns.push({ type: type, x: x * TILE, y: (surf[x] - (air ? rng.i(3, 8) : 1)) * TILE });
    }
    for (let k = 0; k < 24; k++) {
      const x = rng.i(6, W - 6);
      if (surf[x] >= H - 2) continue;
      room.spawns.push({ type: 'coin', x: x * TILE, y: (surf[x] - rng.i(1, 6)) * TILE });
    }
  }

  /* dressing */
  for (let x = 2; x < W - 2; x++) {
    if (surf[x] >= H - 2) continue;
    for (const k of th.decor) {
      const p2 = k === 'tree' ? 0.28 : (k === 'tumbleweed' ? 0.04 : 0.10);
      if (!rng.bool(p2)) continue;
      room.decor.push({ kind: k, idx: rng.i(0, 2), x: x * TILE + rng.r(-4, 12),
                        y: surf[x] * TILE + rng.r(0, 3),
                        layer: rng.bool(0.5) ? 0 : (rng.bool(0.7) ? 1 : 2),
                        sway: rng.r(0.6, 1.8), phase: rng.r(0, TAU),
                        drift: rng.r(10, 26) });
    }
  }
  if (th.snow) laySnow(room, rng);
  room.isle = { type: typeKey, index: index, level: level, boss: boss };
  return room;
}
World.buildIsle = buildIsle;

function buildChapterArena(o) {
  const rng = new RNG(o.seed);
  const W = 52, H = 26;
  const room = new Room({ id: o.id, name: o.name, mode: 'side', w: W, h: H,
                          music: o.music || 'boss', bg: o.bg, ambient: o.ambient, dark: o.dark || 0 });
  room.fillRect(0, 0, W, H, o.ground);
  room.fillRect(3, 3, W - 6, H - 8, T_EMPTY);
  for (let x = 3; x < W - 3; x++) room.set(x, H - 5, o.groundTop);
  for (const [lx, ly, lw] of [[8, H - 12, 7], [W - 15, H - 12, 7], [W / 2 - 4, H - 17, 8]])
    for (let i = 0; i < lw; i++) { room.set(Math.round(lx) + i, Math.round(ly), o.plat); room.set(Math.round(lx) + i, Math.round(ly) + 1, o.ground); }
  for (let k = 0; k < 14; k++) {
    const d = rng.pick(o.decor);
    room.decor.push({ kind: d.kind, idx: d.n ? rng.i(0, d.n - 1) : 0,
                      x: rng.r(4, W - 4) * TILE, y: (H - 5) * TILE,
                      layer: rng.bool(0.5) ? 0 : 2, sway: rng.r(0.5, 1.2), phase: rng.r(0, TAU) });
  }
  room.start = { x: 7 * TILE, y: (H - 5) * TILE };
  /* A pool of clear water at the near end, in the shade of two palms.  Stand
     in it and it puts your hearts back before you go on. */
  if (o.oasis) {
    const ox = 6, ow = 7, bed = H - 5;
    for (let x = ox; x < ox + ow; x++) {
      room.set(x, bed, T_WATER);
      room.set(x, bed + 1, T_WATERD);
      room.set(x, bed + 2, o.groundTop);
    }
    room.oasis = { x: ox * TILE, y: bed * TILE, w: ow * TILE, h: 2 * TILE };
    for (const px of [(ox - 1) * TILE, (ox + ow) * TILE])
      room.decor.push({ kind: 'palm', x: px, y: bed * TILE, layer: 1, sway: 1.4, phase: rng.r(0, TAU) });
    room.start = { x: (ox + 2) * TILE, y: (bed - 1) * TILE };
  }
  room.spawns.push({ type: 'guardian', key: o.boss, x: (W - 14) * TILE, y: (H - 5) * TILE });
  return room;
}

/* a doorway needs dry, flat ground; streams and slopes are no place for an arch */
function dryFlatTile(room, want) {
  for (let d = 0; d < 46; d++) {
    for (const x of [want + d, want - d]) {
      if (x < 5 || x > room.w - 6) continue;
      const gy = room.surface[x];
      let ok = !room.wet(x, gy) && !room.wet(x, gy - 1);
      for (let i = -2; i <= 2 && ok; i++) if (room.surface[x + i] !== gy) ok = false;
      if (ok) return x;
    }
  }
  return want;
}

/* ============================================================
   assemble the map
   ============================================================ */
World.build = function () {
  /* --- the glade you start in --- */
  const glade = buildForest('glade', 'EMBERWOOD GLADE', 4711, {
    w: 132, h: 22, base: 14, treeChance: 0.42, vineChance: 0.10,
    giantChance: 0.16, fernChance: 0.22,
    steps: [{ x: 58, d: -2 }, { x: 96, d: -2 }],
    streams: [{ x: 30, w: 14, depth: 3, log: true }, { x: 82, w: 11, depth: 2, log: false }],
    platforms: [
      { x: 22, y: 11, w: 4 }, { x: 47, y: 9, w: 5 }, { x: 66, y: 10, w: 4 },
      { x: 74, y: 7, w: 3 }, { x: 104, y: 8, w: 5 }, { x: 116, y: 6, w: 4 }
    ]
  });
  glade.start = { x: 6 * TILE, y: 4 * TILE };
  glade.exits.push({ x: (glade.w - 3) * TILE, y: 0, w: 3 * TILE, h: glade.h * TILE,
                     to: 'deep', edge: 'right', label: 'TANGLEWOOD DEEP' });
  {
    const rng = new RNG(99);
    /* the glade crawls: a snake roughly every four tiles of open ground */
    for (let k = 0; k < 30; k++) {
      const tx = rng.i(12, glade.w - 6);
      glade.spawns.push({ type: 'snake', x: tx * TILE, y: glade.surface[tx] * TILE - 10 });
    }
    for (let k = 0; k < 3; k++) {
      const tx = rng.i(60, glade.w - 8);
      glade.spawns.push({ type: 'bear', x: tx * TILE, y: glade.surface[tx] * TILE - 6 });
    }
    for (let k = 0; k < 14; k++) {
      const tx = rng.i(8, glade.w - 4);
      glade.spawns.push({ type: 'coin', x: tx * TILE, y: glade.surface[tx] * TILE - 20 });
    }
  }
  World.rooms.glade = glade;

  /* --- the deep wood, where the two doors are --- */
  const deep = buildForest('deep', 'TANGLEWOOD DEEP', 8123, {
    w: 168, h: 26, base: 17, treeChance: 0.72, vineChance: 0.18,
    giantChance: 0.22, fernChance: 0.34,
    steps: [{ x: 40, d: -2 }, { x: 88, d: 2 }, { x: 130, d: -2 }],
    streams: [{ x: 20, w: 12, depth: 3, log: true }, { x: 60, w: 16, depth: 4, log: true },
              { x: 112, w: 13, depth: 3, log: false }],
    platforms: [
      { x: 34, y: 13, w: 4 }, { x: 44, y: 11, w: 4 }, { x: 78, y: 12, w: 5 },
      { x: 96, y: 10, w: 4 }, { x: 104, y: 13, w: 6 }, { x: 140, y: 11, w: 5 },
      { x: 150, y: 9, w: 4 }
    ]
  });
  deep.exits.push({ x: 0, y: 0, w: 2 * TILE, h: deep.h * TILE, to: 'glade', edge: 'left', label: 'EMBERWOOD GLADE' });
  /* maze arch, part way in */
  {
    const mtx = dryFlatTile(deep, 92), my = deep.surface[mtx] * TILE;
    deep.exits.push({ x: mtx * TILE - 14, y: my - 44, w: 30, h: 44, to: 'maze',
                      label: 'THE HOLLOW MAZE', kind: 'arch', door: { x: mtx * TILE, y: my } });
    deep.savedSpawn = deep.savedSpawn || {};
    deep.saved = { mazeEntry: { x: mtx * TILE + 26, y: my - 20 }, mazeExit: { x: mtx * TILE + 26, y: my - 20 } };
  }
  /* the cave mouth at the far end, sealed until the key is found */
  {
    const ctx2 = dryFlatTile(deep, deep.w - 12), cy = deep.surface[ctx2] * TILE;
    deep.exits.push({ x: ctx2 * TILE - 16, y: cy - 44, w: 34, h: 44, to: 'cave',
                      needKey: true, label: 'BRIARDEEP CAVERN', kind: 'cave', door: { x: ctx2 * TILE, y: cy } });
    deep.saved.caveEntry = { x: ctx2 * TILE - 34, y: cy - 20 };
  }
  deep.start = { x: 3 * TILE, y: 4 * TILE };
  {
    const rng = new RNG(1234);
    /* the deep wood crawls harder still */
    for (let k = 0; k < 52; k++) {
      const tx = rng.i(6, deep.w - 6);
      deep.spawns.push({ type: 'snake', x: tx * TILE, y: deep.surface[tx] * TILE - 10 });
    }
    for (let k = 0; k < 8; k++) {
      const tx = rng.i(14, deep.w - 8);
      deep.spawns.push({ type: 'bear', x: tx * TILE, y: deep.surface[tx] * TILE - 6 });
    }
    for (let k = 0; k < 20; k++) {
      const tx = rng.i(6, deep.w - 4);
      deep.spawns.push({ type: 'coin', x: tx * TILE, y: deep.surface[tx] * TILE - 20 });
    }
  }
  World.rooms.deep = deep;

  World.rooms.maze = buildMaze(31337);
  World.rooms.cave = buildCave(5150);
  World.rooms.mine = buildMine(2468);
  World.rooms.tutorial = buildTutorial(1717);
  World.rooms.gullet = buildGullet(4444, 0);
  World.rooms.lair = buildLair(666);

  World.rooms.cloud1 = buildCloud(7788);
  World.rooms.olympus = buildOlympus(7789);
  World.rooms.mush1 = buildMush(9911);
  World.rooms.mushboss = buildMushBoss(9912);

  /* ---- chapter two: the Sunken Depths ---- */
  const seaDecor = [{ kind: 'coral', n: 3, p: 0.22 }, { kind: 'kelp', n: 3, p: 0.26 },
                    { kind: 'rock', n: 3, p: 0.06 }, { kind: 'crystal', n: 3, p: 0.05 }];
  const deepRooms = [
    { id: 'shore', parts: ['TIDEWRACK SHORE', 'THE WRACK LINE', 'THE SUNKEN REEF'], hazards: 5, music: 'tide', name: 'TIDEWRACK SHORE', seed: 4101, w: 150, pools: 0, ambient: 0.4, dark: 0,
      spawns: [{ type: 'crab', n: 14 }, { type: 'jelly', n: 12, air: true }, { type: 'angler', n: 6, air: true }],
      to: 'shoreEnd', toLabel: 'THE WARDEN', boss: 'tideWarden' },
    { id: 'drowned', parts: ['THE DROWNED HALL', 'THE FLOODED NAVE', 'THE CHOIR BELOW'], hazards: 7, music: 'deep', name: 'THE DROWNED HALL', seed: 4102, w: 158, pools: 0, ambient: 0.3, dark: 0.3,
      spawns: [{ type: 'crab', n: 12 }, { type: 'jelly', n: 16, air: true }, { type: 'angler', n: 10, air: true }],
      to: 'drownedEnd', toLabel: 'THE KRAKEN MAW', boss: 'kraken' },
    { id: 'abyss', parts: ['THE ABYSSAL TRENCH', 'THE COLD SHELF', 'THE BLACK SMOKERS'], hazards: 9, music: 'trench', name: 'THE ABYSSAL TRENCH', seed: 4103, w: 166, pools: 0, ambient: 0.2, dark: 0.45,
      spawns: [{ type: 'crab', n: 12 }, { type: 'jelly', n: 18, air: true }, { type: 'angler', n: 14, air: true }],
      to: 'abyssEnd', toLabel: 'THE LEVIATHAN', boss: 'leviathan' }
  ];
  for (const d of deepRooms) {
    buildRealmChain(d, {
      bg: 'deep', ground: T_DEEPSTONE, groundTop: T_DEEPTOP, plat: T_SAND,
      decor: seaDecor, doorKind: 'mush', bossMusic: 'bossDeep'
    });
  }

  /* ---- chapter three: the Ashen Reach ---- */
  const ashDecor = [{ kind: 'pillar', n: 2, p: 0.14 }, { kind: 'rock', n: 3, p: 0.10 },
                    { kind: 'crystal', n: 3, p: 0.06 }, { kind: 'torch', p: 0.05 }];
  const ashRooms = [
    { id: 'cinder', parts: ['THE CINDER FIELDS', 'THE ASH FLATS', 'THE SLAG PITS'], hazards: 7, name: 'THE CINDER FIELDS', seed: 4201, w: 158, pools: 0, ambient: 0.26, dark: 0.3,
      spawns: [{ type: 'emberling', n: 16 }, { type: 'cinderwing', n: 10, air: true }, { type: 'golem', n: 4 }],
      to: 'cinderEnd', toLabel: 'THE FORGEFIEND', boss: 'forgefiend' },
    { id: 'obsidian', parts: ['THE OBSIDIAN STEPS', 'THE GLASS TERRACES', 'THE SHATTERED STAIR'], hazards: 9, name: 'THE OBSIDIAN STEPS', seed: 4202, w: 166, pools: 0, ambient: 0.22, dark: 0.4,
      spawns: [{ type: 'emberling', n: 16 }, { type: 'cinderwing', n: 14, air: true }, { type: 'golem', n: 7 }],
      to: 'obsidianEnd', toLabel: 'THE ASHEN TITAN', boss: 'ashTitan' },
    { id: 'molten', parts: ['THE MOLTEN CROWN', 'THE LAVA CHANNELS', 'THE CALDERA RIM'], hazards: 11, name: 'THE MOLTEN CROWN', seed: 4203, w: 174, pools: 0, ambient: 0.2, dark: 0.45,
      spawns: [{ type: 'emberling', n: 18 }, { type: 'cinderwing', n: 16, air: true }, { type: 'golem', n: 10 }],
      to: 'moltenEnd', toLabel: 'IFRIT', boss: 'ifrit' }
  ];
  for (const d of ashRooms) {
    buildRealmChain(Object.assign({ music: 'ember' }, d), {
      bg: 'ash', ground: T_ASH, groundTop: T_ASHTOP, plat: T_OBSID,
      decor: ashDecor, doorKind: 'cave', bossMusic: 'bossAsh'
    });
  }

  /* ---- chapter four: the White Silence ---- */
  const snowDecor = [{ kind: 'pine', n: 3, p: 0.20 }, { kind: 'rock', n: 3, p: 0.08 },
                     { kind: 'crystal', n: 3, p: 0.06 }, { kind: 'tuft', n: 4, p: 0.10 }];
  const snowRooms = [
    { id: 'frost', name: 'FROSTFELL', seed: 4301, w: 154, hazards: 6, ambient: 0.34, dark: 0.16,
      parts: ['FROSTFELL', 'THE WIND SCOUR', 'THE DRIFT ROAD', 'THE HOAR WOOD', 'THE WHITE STAIR'],
      snow: true, powder: 2, ice: 3,
      spawns: [{ type: 'wolf', n: 12 }, { type: 'icewisp', n: 10, air: true }, { type: 'yeti', n: 3 }],
      to: 'frostEnd', toLabel: 'THE RIME COLOSSUS', boss: 'rimeColossus' },
    { id: 'glacier', name: 'GLACIER HEART', seed: 4302, w: 162, hazards: 8, ambient: 0.28, dark: 0.3,
      parts: ['GLACIER HEART', 'THE BLUE CREVASSE', 'THE MORAINE', 'THE ICEFALL', 'THE COLD VAULT'],
      snow: true, powder: 3, ice: 5,
      spawns: [{ type: 'wolf', n: 13 }, { type: 'icewisp', n: 14, air: true }, { type: 'yeti', n: 5 }],
      to: 'glacierEnd', toLabel: 'THE FROST WYRM', boss: 'frostWyrm' },
    { id: 'aurora', name: 'AURORA CROWN', seed: 4303, w: 170, hazards: 10, ambient: 0.24, dark: 0.38,
      parts: ['AURORA CROWN', 'THE LIGHT FIELDS', 'THE STILL LAKE', 'THE NORTH GATE', 'THE PALE THRONE'],
      snow: true, powder: 4, ice: 6,
      spawns: [{ type: 'wolf', n: 14 }, { type: 'icewisp', n: 18, air: true }, { type: 'yeti', n: 8 }],
      to: 'auroraEnd', toLabel: 'THE PALE MONARCH', boss: 'paleMonarch' }
  ];
  for (const d of snowRooms) {
    buildRealmChain(Object.assign({ music: 'tide' }, d), {
      bg: 'snow', ground: T_SNOW, groundTop: T_SNOWTOP, plat: T_ICE,
      decor: snowDecor, doorKind: 'cave', bossMusic: 'bossDeep'
    });
  }

  /* ---- chapter five: the Golden Waste ---- */
  const sandDecor = [{ kind: 'pillar', n: 2, p: 0.12 }, { kind: 'rock', n: 3, p: 0.10 },
                     { kind: 'cactus', n: 3, p: 0.12 }, { kind: 'bone', n: 3, p: 0.08 }];
  const sandRooms = [
    { id: 'dune', name: 'THE DUNE SEA', seed: 4401, w: 162, hazards: 8, ambient: 0.4, dark: 0,
      parts: ['THE DUNE SEA', 'THE SHIFTING FLATS', 'THE BONE FIELD', 'THE SALT PAN', 'THE LAST WELL'],
      quick: 4,
      spawns: [{ type: 'scarab', n: 14 }, { type: 'vulture', n: 12, air: true }, { type: 'mummy', n: 4 }],
      to: 'duneEnd', toLabel: 'THE DUNE MAW', boss: 'duneMaw' },
    { id: 'sphinx', name: 'SPHINX HOLLOW', seed: 4402, w: 170, hazards: 10, ambient: 0.34, dark: 0.2,
      parts: ['SPHINX HOLLOW', 'THE ASKING ROAD', 'THE RIDDLE GATE', 'THE COURT OF QUESTIONS', 'THE LION STAIR'],
      quick: 4, riddleAt: 2,
      spawns: [{ type: 'scarab', n: 14 }, { type: 'vulture', n: 14, air: true }, { type: 'mummy', n: 7 }],
      to: 'sphinxEnd', toLabel: 'THE SPHINX', boss: 'sphinx' },
    { id: 'suntomb', name: 'THE SUN TOMB', seed: 4403, w: 178, hazards: 12, ambient: 0.26, dark: 0.4,
      parts: ['THE SUN TOMB', 'THE PAINTED HALL', 'THE SHAFT OF KINGS', 'THE TREASURY', 'THE GOLDEN DOOR'],
      quick: 4, tomb: true,
      spawns: [{ type: 'scarab', n: 12 }, { type: 'vulture', n: 12, air: true }, { type: 'mummy', n: 10 },
               { type: 'soldier', n: 8 }],
      to: 'suntombEnd', toLabel: 'THE PHARAOH', boss: 'pharaoh' }
  ];
  for (const d of sandRooms) {
    buildRealmChain(Object.assign({ music: 'ember' }, d), {
      bg: d.tomb ? 'tomb' : 'waste', ground: d.tomb ? T_TOMB : T_SAND,
      groundTop: d.tomb ? T_TOMBTOP : T_SANDTOP, oasis: true,
      plat: T_TOMB, decor: sandDecor, doorKind: 'cave', bossMusic: 'bossAsh'
    });
  }

  /* One vault is kept ready.  Falling through a patch rebuilds it from that
     patch's own seed, so every patch has a vault of its own. */
  World.rooms.vault = buildVault(5501, 'sand');

  /* hide the code papers: two per realm, out in its first area */
  World.LEVELS.forEach((lv, li) => {
    const room = World.rooms[lv.start];
    if (!room) return;
    const rng = new RNG(6000 + li * 37);
    const mine = World.CODES.filter(c => c.level === li);
    mine.forEach((c, k) => {
      let x, y;
      if (room.surface) {
        const tx = rng.i(Math.floor(room.w * (0.2 + k * 0.45)), Math.floor(room.w * (0.42 + k * 0.45)));
        x = tx * TILE + 8;
        y = (room.surface[tx] - 1) * TILE - 2;
      } else {
        x = room.start.x + (k ? 120 : -60); y = room.start.y - 10;
      }
      room.spawns.push({ type: 'paper', code: c.code, x: x, y: y });
    });
  });

  /* stamp each room with the level it belongs to */
  World.LEVELS.forEach((lv, i) => { for (const id of lv.rooms) if (World.rooms[id]) World.rooms[id].level = i; });
};

World.buildGullet = buildGullet;
World.gulletAcidRate = gulletAcidRate;

World.LEVELS = [
  { name: 'EMBERWOOD', taker: 'THE WOOD TAKES', sub: 'THE DRAGON OF BRIARDEEP', theme: 'forest',
    rooms: ['glade', 'deep', 'maze', 'cave', 'mine', 'lair'], start: 'glade', boss: 'lair', coinScale: 1,
    bossHp: 1,
    node: { x: 76, y: 152 } },
  { name: 'AETHER CITY', taker: 'THE CLOUDS TAKE', sub: 'THE STORM ON THE MOUNTAIN', theme: 'cloud',
    rooms: ['cloud1', 'olympus'], start: 'cloud1', boss: 'olympus',
    /* everything up here is storm-fed: three sword blows apiece, not one */
    enemyHp: 3, coinScale: 2, coinBonus: 1,
    node: { x: 194, y: 74 } },
  { name: 'SPOREWOOD', taker: 'THE SPORES TAKE', sub: 'THE MOTHER SPORE', theme: 'mush',
    rooms: ['mush1', 'mushboss'], start: 'mush1', boss: 'mushboss', coinScale: 2,
    enemyHp: 2, enemyDmg: 2,
    node: { x: 310, y: 148 } },

  /* the deep and the ash: guardians many times hardier, and kills that pay
     for the deeper shop stock */
  { name: 'TIDEWRACK', taker: 'THE TIDE TAKES', sub: 'THE TIDE WARDEN', theme: 'shore', enemyHp: 4,
    coinScale: 7, coinBonus: 2, bossHp: 9,
    rooms: ['shore', 'shore2', 'shore3', 'shoreEnd'], start: 'shore', boss: 'shoreEnd', node: { x: 76, y: 152 } },
  { name: 'DROWNED HALL', taker: 'THE DEEP TAKES', sub: 'THE KRAKEN MAW', theme: 'drowned', enemyHp: 5,
    coinScale: 9, coinBonus: 3, bossHp: 11,
    rooms: ['drowned', 'drowned2', 'drowned3', 'drownedEnd'], start: 'drowned', boss: 'drownedEnd', node: { x: 194, y: 74 } },
  { name: 'THE TRENCH', taker: 'THE TRENCH TAKES', sub: 'THE LEVIATHAN', theme: 'abyss', enemyHp: 6,
    coinScale: 12, coinBonus: 4, bossHp: 13,
    rooms: ['abyss', 'abyss2', 'abyss3', 'abyssEnd'], start: 'abyss', boss: 'abyssEnd', node: { x: 310, y: 148 } },

  { name: 'CINDER FIELDS', taker: 'THE ASH TAKES', sub: 'THE FORGEFIEND', theme: 'cinder', enemyHp: 8,
    coinScale: 18, coinBonus: 6, bossHp: 14,
    rooms: ['cinder', 'cinder2', 'cinder3', 'cinderEnd'], start: 'cinder', boss: 'cinderEnd', node: { x: 76, y: 152 } },
  { name: 'OBSIDIAN STEPS', taker: 'THE DARK TAKES', sub: 'THE ASHEN TITAN', theme: 'obsidian', enemyHp: 10,
    coinScale: 22, coinBonus: 8, bossHp: 16,
    rooms: ['obsidian', 'obsidian2', 'obsidian3', 'obsidianEnd'], start: 'obsidian', boss: 'obsidianEnd', node: { x: 194, y: 74 } },
  { name: 'MOLTEN CROWN', taker: 'THE MAGMA TAKES', sub: 'IFRIT, THE LAST FLAME', theme: 'molten', enemyHp: 12,
    coinScale: 28, coinBonus: 10, bossHp: 18,
    rooms: ['molten', 'molten2', 'molten3', 'moltenEnd'], start: 'molten', boss: 'moltenEnd', node: { x: 310, y: 148 } },

  /* the white silence: five levels to a realm, and the cold bites */
  { name: 'FROSTFELL', taker: 'THE COLD TAKES', sub: 'THE RIME COLOSSUS', theme: 'frost', enemyHp: 14,
    coinScale: 34, coinBonus: 12, bossHp: 16,
    rooms: ['frost', 'frost2', 'frost3', 'frost4', 'frost5', 'frostEnd'],
    start: 'frost', boss: 'frostEnd', node: { x: 76, y: 152 } },
  { name: 'GLACIER HEART', taker: 'THE ICE TAKES', sub: 'THE FROST WYRM', theme: 'frost', enemyHp: 16,
    coinScale: 40, coinBonus: 14, bossHp: 18,
    rooms: ['glacier', 'glacier2', 'glacier3', 'glacier4', 'glacier5', 'glacierEnd'],
    start: 'glacier', boss: 'glacierEnd', node: { x: 194, y: 74 } },
  { name: 'AURORA CROWN', taker: 'THE NIGHT TAKES', sub: 'THE PALE MONARCH', theme: 'frost', enemyHp: 18,
    coinScale: 46, coinBonus: 16, bossHp: 20,
    rooms: ['aurora', 'aurora2', 'aurora3', 'aurora4', 'aurora5', 'auroraEnd'],
    start: 'aurora', boss: 'auroraEnd', node: { x: 310, y: 148 } },

  /* the golden waste */
  { name: 'THE DUNE SEA', taker: 'THE SAND TAKES', sub: 'THE DUNE MAW', theme: 'waste', enemyHp: 20,
    coinScale: 54, coinBonus: 18, bossHp: 20,
    rooms: ['dune', 'dune2', 'dune3', 'dune4', 'dune5', 'duneEnd'],
    start: 'dune', boss: 'duneEnd', node: { x: 76, y: 152 } },
  { name: 'SPHINX HOLLOW', taker: 'THE QUESTION TAKES', sub: 'THE SPHINX', theme: 'waste', enemyHp: 22,
    coinScale: 62, coinBonus: 20, bossHp: 22,
    rooms: ['sphinx', 'sphinx2', 'sphinx3', 'sphinx4', 'sphinx5', 'sphinxEnd'],
    start: 'sphinx', boss: 'sphinxEnd', node: { x: 194, y: 74 } },
  { name: 'THE SUN TOMB', taker: 'THE TOMB TAKES', sub: 'THE PHARAOH', theme: 'waste', enemyHp: 24,
    coinScale: 72, coinBonus: 24, bossHp: 24,
    rooms: ['suntomb', 'suntomb2', 'suntomb3', 'suntomb4', 'suntomb5', 'suntombEnd'],
    start: 'suntomb', boss: 'suntombEnd', node: { x: 310, y: 148 } }
];

/* ============================================================
   CODE PAPERS — scraps hidden in the realms, redeemed in the
   codes box.  Later realms hide richer ones.
   ============================================================ */
World.CODES = [
  { code: 'BEAR50', kind: 'coins', amount: 50, level: 0 },
  { code: 'ITEMUPGRADE', kind: 'ticket', amount: 1, level: 0 },
  { code: 'WISP150', kind: 'coins', amount: 150, level: 1 },
  { code: 'SKYUPGRADE', kind: 'ticket', amount: 1, level: 1 },
  { code: 'SPORE300', kind: 'coins', amount: 300, level: 2 },
  { code: 'SPOREUPGRADE', kind: 'ticket', amount: 1, level: 2 },
  { code: 'CRAB600', kind: 'coins', amount: 600, level: 3 },
  { code: 'TIDEUPGRADE', kind: 'ticket', amount: 2, level: 3 },
  { code: 'KRAKEN1000', kind: 'coins', amount: 1000, level: 4 },
  { code: 'DROWNEDUPGRADE', kind: 'ticket', amount: 2, level: 4 },
  { code: 'ANGLER1600', kind: 'coins', amount: 1600, level: 5 },
  { code: 'ABYSSUPGRADE', kind: 'ticket', amount: 2, level: 5 },
  { code: 'EMBER2400', kind: 'coins', amount: 2400, level: 6 },
  { code: 'CINDERUPGRADE', kind: 'ticket', amount: 3, level: 6 },
  { code: 'GOLEM3400', kind: 'coins', amount: 3400, level: 7 },
  { code: 'OBSIDIANUPGRADE', kind: 'ticket', amount: 3, level: 7 },
  { code: 'IFRIT5000', kind: 'coins', amount: 5000, level: 8 },
  { code: 'MOLTENUPGRADE', kind: 'ticket', amount: 4, level: 8 },
  { code: 'WOLF7000', kind: 'coins', amount: 7000, level: 9 },
  { code: 'FROSTUPGRADE', kind: 'ticket', amount: 4, level: 9 },
  { code: 'YETI9000', kind: 'coins', amount: 9000, level: 10 },
  { code: 'GLACIERUPGRADE', kind: 'ticket', amount: 4, level: 10 },
  { code: 'MONARCH12000', kind: 'coins', amount: 12000, level: 11 },
  { code: 'AURORAUPGRADE', kind: 'ticket', amount: 5, level: 11 },
  { code: 'SCARAB15000', kind: 'coins', amount: 15000, level: 12 },
  { code: 'DUNEUPGRADE', kind: 'ticket', amount: 5, level: 12 },
  { code: 'RIDDLE18000', kind: 'coins', amount: 18000, level: 13 },
  { code: 'SPHINXUPGRADE', kind: 'ticket', amount: 5, level: 13 },
  { code: 'PHARAOH25000', kind: 'coins', amount: 25000, level: 14 },
  { code: 'TOMBUPGRADE', kind: 'ticket', amount: 6, level: 14 }
];
World.codeByName = function (name) {
  const n = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const c of World.CODES) if (c.code === n) return c;
  return null;
};

World.TUTORIAL = { name: 'TUTORIAL', sub: 'LEARN THE MOVES', start: 'tutorial',
                   rooms: ['tutorial'], node: { x: VW / 2, y: 118 } };

World.CHAPTERS = [
  { name: 'CHAPTER ONE', sub: 'THE GREEN REALM', levels: [0, 1, 2] },
  { name: 'CHAPTER TWO', sub: 'THE SUNKEN DEPTHS', levels: [3, 4, 5] },
  { name: 'CHAPTER THREE', sub: 'THE ASHEN REACH', levels: [6, 7, 8] },
  { name: 'CHAPTER FOUR', sub: 'THE WHITE SILENCE', levels: [9, 10, 11] },
  { name: 'CHAPTER FIVE', sub: 'THE GOLDEN WASTE', levels: [12, 13, 14] }
];
/* The last page of the map holds one realm and no levels yet.  Chains hold
   it shut.  It sits after every chapter. */
World.FINAL = { name: 'THE ARCHIPELAGO', sub: 'BOUND IN CHAINS',
                node: { x: VW / 2, y: 80 } };
World.mapPages = function () { return World.CHAPTERS.length + 1; };
World.finalPage = function () { return World.CHAPTERS.length; };
World.chapterOf = function (level) {
  for (let i = 0; i < World.CHAPTERS.length; i++) if (World.CHAPTERS[i].levels.indexOf(level) >= 0) return i;
  return 0;
};
