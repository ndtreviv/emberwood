/* ============================================================
   world.js — tile ids, the Room type and the level generators.
   ============================================================ */
'use strict';

const T_EMPTY = 0, T_GRASS = 1, T_DIRT = 2, T_ROCK = 3, T_ROCKTOP = 4,
      T_WOOD = 5, T_WATER = 6, T_WATERD = 7, T_CAVEBG = 8, T_PATH = 9,
      T_BOUNCE = 10, T_CLOUD = 11, T_MARBLE = 12, T_CLOUDP = 13, T_MYC = 14,
      T_DEEPSTONE = 15, T_DEEPTOP = 16, T_SAND = 17, T_ASH = 18, T_ASHTOP = 19, T_OBSID = 20,
      T_LADDER = 21;

const SOLID_TILE = { 1: 1, 2: 1, 3: 1, 4: 1, 10: 1, 11: 1, 12: 1, 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1 };
const ONEWAY_TILE = { 5: 1, 13: 1 };
const WET_TILE = { 6: 1, 7: 1 };
const BOUNCE_TILE = { 10: 1 };
const LADDER_TILE = { 21: 1 };

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
  decorate(room, rng, { surface: surf, treeChance: opt.treeChance || 0.5, vineChance: opt.vineChance || 0.02 });
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
                          w: W, h: H, music: 'cave', bg: 'cave', ambient: 0.12, dark: 0.45 });
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

  /* way-markers daubed on the rock, pointing along the route out */
  for (const run of runs) {
    const a = Math.min(run.x0, run.x1), b = Math.max(run.x0, run.x1);
    for (let x = a + 8; x < b - 8; x += 15) {
      const gy = room.groundBelow(x * TILE + 8, (run.y - 3) * TILE);
      room.decor.push({ kind: 'arrow', dir: run.dir > 0 ? 'right' : 'left',
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
    if (room.get(tx, ty - 1) === T_EMPTY && rng.bool(0.05))
      room.decor.push({ kind: 'crystal', idx: rng.i(0, 2), x: tx * TILE + 8, y: ty * TILE + 2, layer: 1, glow: true });
    if (room.get(tx, ty - 1) === T_EMPTY && rng.bool(0.035))
      room.decor.push({ kind: 'torch', x: tx * TILE + 8, y: ty * TILE - 4, layer: 1 });
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
function buildGullet(seed) {
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
    const wide = clamp(12 - Math.floor(n / 4), 11, 12);
    const x0 = side > 0 ? L + 1 : R - 1 - wide;
    const x1 = x0 + wide;
    if (n > 0 && n % 3 === 0) {
      /* a gap through the middle: dash it, or carry a run into the jump */
      const half = Math.floor(wide / 2) - 1;
      put(x0, x0 + half, y);
      put(x0 + half + 4, x1, y);
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
  room.acid = { y: (H - 2) * TILE, rate: 26 };
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
    w: 132, h: 22, base: 14, treeChance: 0.42, vineChance: 0.02,
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
    for (let k = 0; k < 9; k++) {
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
    w: 168, h: 26, base: 17, treeChance: 0.72, vineChance: 0.05,
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
    for (let k = 0; k < 16; k++) {
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
  World.rooms.gullet = buildGullet(4444);
  World.rooms.lair = buildLair(666);

  World.rooms.cloud1 = buildCloud(7788);
  World.rooms.olympus = buildOlympus(7789);
  World.rooms.mush1 = buildMush(9911);
  World.rooms.mushboss = buildMushBoss(9912);

  /* ---- chapter two: the Sunken Depths ---- */
  const seaDecor = [{ kind: 'coral', n: 3, p: 0.22 }, { kind: 'kelp', n: 3, p: 0.26 },
                    { kind: 'rock', n: 3, p: 0.06 }, { kind: 'crystal', n: 3, p: 0.05 }];
  const deepRooms = [
    { id: 'shore', hazards: 5, music: 'tide', name: 'TIDEWRACK SHORE', seed: 4101, w: 150, pools: 0, ambient: 0.4, dark: 0,
      spawns: [{ type: 'crab', n: 14 }, { type: 'jelly', n: 12, air: true }, { type: 'angler', n: 6, air: true }],
      to: 'shoreEnd', toLabel: 'THE WARDEN', boss: 'tideWarden' },
    { id: 'drowned', hazards: 7, music: 'deep', name: 'THE DROWNED HALL', seed: 4102, w: 158, pools: 0, ambient: 0.3, dark: 0.3,
      spawns: [{ type: 'crab', n: 12 }, { type: 'jelly', n: 16, air: true }, { type: 'angler', n: 10, air: true }],
      to: 'drownedEnd', toLabel: 'THE KRAKEN MAW', boss: 'kraken' },
    { id: 'abyss', hazards: 9, music: 'trench', name: 'THE ABYSSAL TRENCH', seed: 4103, w: 166, pools: 0, ambient: 0.2, dark: 0.45,
      spawns: [{ type: 'crab', n: 12 }, { type: 'jelly', n: 18, air: true }, { type: 'angler', n: 14, air: true }],
      to: 'abyssEnd', toLabel: 'THE LEVIATHAN', boss: 'leviathan' }
  ];
  for (const d of deepRooms) {
    World.rooms[d.id] = buildChapterRoom(Object.assign({}, d, {
      bg: 'deep', ground: T_DEEPSTONE, groundTop: T_DEEPTOP, plat: T_SAND,
      decor: seaDecor, doorKind: 'mush'
    }));
    World.rooms[d.id + 'End'] = buildChapterArena({
      id: d.id + 'End', name: d.toLabel, seed: d.seed + 500, bg: 'deep', music: 'bossDeep',
      ground: T_DEEPSTONE, groundTop: T_DEEPTOP, plat: T_SAND,
      ambient: d.ambient, dark: d.dark, decor: seaDecor, boss: d.boss
    });
  }

  /* ---- chapter three: the Ashen Reach ---- */
  const ashDecor = [{ kind: 'pillar', n: 2, p: 0.14 }, { kind: 'rock', n: 3, p: 0.10 },
                    { kind: 'crystal', n: 3, p: 0.06 }, { kind: 'torch', p: 0.05 }];
  const ashRooms = [
    { id: 'cinder', hazards: 7, name: 'THE CINDER FIELDS', seed: 4201, w: 158, pools: 0, ambient: 0.26, dark: 0.3,
      spawns: [{ type: 'emberling', n: 16 }, { type: 'cinderwing', n: 10, air: true }, { type: 'golem', n: 4 }],
      to: 'cinderEnd', toLabel: 'THE FORGEFIEND', boss: 'forgefiend' },
    { id: 'obsidian', hazards: 9, name: 'THE OBSIDIAN STEPS', seed: 4202, w: 166, pools: 0, ambient: 0.22, dark: 0.4,
      spawns: [{ type: 'emberling', n: 16 }, { type: 'cinderwing', n: 14, air: true }, { type: 'golem', n: 7 }],
      to: 'obsidianEnd', toLabel: 'THE ASHEN TITAN', boss: 'ashTitan' },
    { id: 'molten', hazards: 11, name: 'THE MOLTEN CROWN', seed: 4203, w: 174, pools: 0, ambient: 0.2, dark: 0.45,
      spawns: [{ type: 'emberling', n: 18 }, { type: 'cinderwing', n: 16, air: true }, { type: 'golem', n: 10 }],
      to: 'moltenEnd', toLabel: 'IFRIT', boss: 'ifrit' }
  ];
  for (const d of ashRooms) {
    World.rooms[d.id] = buildChapterRoom(Object.assign({}, d, {
      music: 'ember', bg: 'ash', ground: T_ASH, groundTop: T_ASHTOP, plat: T_OBSID,
      decor: ashDecor, doorKind: 'cave'
    }));
    World.rooms[d.id + 'End'] = buildChapterArena({
      id: d.id + 'End', name: d.toLabel, seed: d.seed + 500, bg: 'ash', music: 'bossAsh',
      ground: T_ASH, groundTop: T_ASHTOP, plat: T_OBSID,
      ambient: d.ambient, dark: d.dark, decor: ashDecor, boss: d.boss
    });
  }

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
    rooms: ['shore', 'shoreEnd'], start: 'shore', boss: 'shoreEnd', node: { x: 76, y: 152 } },
  { name: 'DROWNED HALL', taker: 'THE DEEP TAKES', sub: 'THE KRAKEN MAW', theme: 'drowned', enemyHp: 5,
    coinScale: 9, coinBonus: 3, bossHp: 11,
    rooms: ['drowned', 'drownedEnd'], start: 'drowned', boss: 'drownedEnd', node: { x: 194, y: 74 } },
  { name: 'THE TRENCH', taker: 'THE TRENCH TAKES', sub: 'THE LEVIATHAN', theme: 'abyss', enemyHp: 6,
    coinScale: 12, coinBonus: 4, bossHp: 13,
    rooms: ['abyss', 'abyssEnd'], start: 'abyss', boss: 'abyssEnd', node: { x: 310, y: 148 } },

  { name: 'CINDER FIELDS', taker: 'THE ASH TAKES', sub: 'THE FORGEFIEND', theme: 'cinder', enemyHp: 8,
    coinScale: 18, coinBonus: 6, bossHp: 14,
    rooms: ['cinder', 'cinderEnd'], start: 'cinder', boss: 'cinderEnd', node: { x: 76, y: 152 } },
  { name: 'OBSIDIAN STEPS', taker: 'THE DARK TAKES', sub: 'THE ASHEN TITAN', theme: 'obsidian', enemyHp: 10,
    coinScale: 22, coinBonus: 8, bossHp: 16,
    rooms: ['obsidian', 'obsidianEnd'], start: 'obsidian', boss: 'obsidianEnd', node: { x: 194, y: 74 } },
  { name: 'MOLTEN CROWN', taker: 'THE MAGMA TAKES', sub: 'IFRIT, THE LAST FLAME', theme: 'molten', enemyHp: 12,
    coinScale: 28, coinBonus: 10, bossHp: 18,
    rooms: ['molten', 'moltenEnd'], start: 'molten', boss: 'moltenEnd', node: { x: 310, y: 148 } }
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
  { code: 'MOLTENUPGRADE', kind: 'ticket', amount: 4, level: 8 }
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
  { name: 'CHAPTER THREE', sub: 'THE ASHEN REACH', levels: [6, 7, 8] }
];
World.chapterOf = function (level) {
  for (let i = 0; i < World.CHAPTERS.length; i++) if (World.CHAPTERS[i].levels.indexOf(level) >= 0) return i;
  return 0;
};
