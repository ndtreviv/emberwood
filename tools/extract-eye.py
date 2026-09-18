"""Cut the eye out of the artist's picture into the two layers the game
paints it in: the body, and the iris that follows the hero.

    sips -s format bmp <the eye>.jpg --out /tmp/eye.bmp
    python3 tools/extract-eye.py /tmp/eye.bmp images

The picture is an eye on a transparency checkerboard, saved as a JPEG, so
the checkerboard is baked in.  It cannot be keyed on brightness, because
the sclera is nearly as pale as the light squares.  It is keyed by flooding
in from the border instead: the eye is one blob with an unbroken black
outline, and the flood stops dead at that outline, so the sclera is safe
however generous the key is.

The iris is taken out of the body and the hole it leaves is filled with the
sclera that surrounds it, drawn inward along the radius.  That is what lets
the iris move without a hole opening up behind it.
"""
import struct, zlib, sys, math
from collections import deque

src, outdir = sys.argv[1], sys.argv[2]
OUT_W = 300                                  # what the game draws it at
d = open(src, 'rb').read()
off = struct.unpack_from('<I', d, 10)[0]
W, h = struct.unpack_from('<ii', d, 18)
H = abs(h); flip = h < 0
stride = (W * 3 + 3) // 4 * 4

def px(x, y):
    yy = y if flip else H - 1 - y
    i = off + yy * stride + x * 3
    return d[i + 2], d[i + 1], d[i]
def lum(x, y):
    r, g, b = px(x, y); return (r + g + b) / 3

# ---- 1. flood the checkerboard away, in from the border ----
def pale(x, y):
    r, g, b = px(x, y)
    if max(r, g, b) - min(r, g, b) > 12: return False
    return (r + g + b) / 3 >= 196

out = bytearray(W * H)
q = deque()
for x in range(W):
    for y in (0, H - 1):
        if not out[y * W + x] and pale(x, y): out[y * W + x] = 1; q.append((x, y))
for y in range(H):
    for x in (0, W - 1):
        if not out[y * W + x] and pale(x, y): out[y * W + x] = 1; q.append((x, y))
while q:
    x, y = q.popleft()
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        nx, ny = x + dx, y + dy
        if nx < 0 or ny < 0 or nx >= W or ny >= H: continue
        i = ny * W + nx
        if out[i] or not pale(nx, ny): continue
        out[i] = 1; q.append((nx, ny))
inside = lambda x, y: not out[y * W + x]

x0, y0, x1, y1 = W, H, -1, -1
for y in range(H):
    for x in range(W):
        if inside(x, y):
            x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
BW, BH = x1 - x0 + 1, y1 - y0 + 1
print('eye box', x0, y0, BW, 'x', BH)

# ---- 2. the iris, as a circle ----
# The pupil is the only pure black thing in the middle of the eye, so its
# centre is found first.  The rim is then found by walking left and right
# from it until the sclera starts - and the sclera is only called started
# when it stays bright for a good stretch.  A single dark pixel will not do
# it, because the sclera is full of cracks and every one of them fooled an
# earlier test into walking straight past the rim and out to the corner of
# the eye.
BAND0, BAND1 = int(y0 + BH * 0.42), int(y0 + BH * 0.72)
sx = sy = n = 0
for y in range(BAND0, BAND1):
    for x in range(x0, x1 + 1, 2):
        if inside(x, y) and lum(x, y) < 30: sx += x; sy += y; n += 1
PCX, PCY = int(sx / n), int(sy / n)
print('pupil centre', PCX, PCY, 'from', n, 'black pixels')

RUN, BRIGHT = 25, 175
def rim(step):
    x = PCX
    while x0 < x < x1:
        x += step
        if lum(x, PCY) <= BRIGHT: continue
        k = 0
        while k < RUN and x0 < x + k * step < x1 and lum(x + k * step, PCY) > BRIGHT: k += 1
        if k >= RUN: return abs(x - PCX)
    return abs(x - PCX)
rl, rr = rim(-1), rim(1)
IR = (rl + rr) / 2
ICX, ICY = PCX + (rr - rl) / 2, PCY
print('iris rim left', rl, 'right', rr, '-> centre', round(ICX), round(ICY), 'radius', round(IR))

# ---- 3. the sclera that fills the hole the iris leaves ----
def scleraAt(x, y):
    dx, dy = x - ICX, y - ICY
    r = math.hypot(dx, dy) or 1
    for k in (1.08, 1.16, 1.26, 1.38, 1.52):
        sx, sy = int(ICX + dx / r * IR * k), int(ICY + dy / r * IR * k)
        if 0 <= sx < W and 0 <= sy < H and inside(sx, sy) and lum(sx, sy) > 120:
            return px(sx, sy)
    return (188, 188, 190)

# ---- 4. the two layers, at the size the game wants ----
SC = OUT_W / BW
OUT_H = int(round(BH * SC))
STEP = max(1, int(1 / SC / 3))               # how finely to sample the source
print('drawn at', OUT_W, 'x', OUT_H, ' scale', round(SC, 4))

def build(kind):
    buf = bytearray()
    inv = 1 / SC
    for oy in range(OUT_H):
        row = bytearray()
        sy0 = y0 + oy * inv
        for ox in range(OUT_W):
            sx0 = x0 + ox * inv
            r = g = b = 0.0; a = 0.0; n = 0
            iy = int(sy0)
            while iy < sy0 + inv:
                ix = int(sx0)
                while ix < sx0 + inv:
                    n += 1
                    if 0 <= ix < W and 0 <= iy < H and inside(ix, iy):
                        inIris = math.hypot(ix - ICX, iy - ICY) <= IR
                        if kind == 'iris':
                            if inIris:
                                pr, pg, pb = px(ix, iy); r += pr; g += pg; b += pb; a += 1
                        else:
                            pr, pg, pb = scleraAt(ix, iy) if inIris else px(ix, iy)
                            r += pr; g += pg; b += pb; a += 1
                    ix += STEP
                iy += STEP
            if a > 0: r, g, b = r / a, g / a, b / a
            row += bytes((int(r), int(g), int(b), int(255 * a / max(1, n))))
        buf += b'\x00' + row
    return buf

def png(path, w, hh, buf):
    def ch(t, dd):
        return struct.pack('>I', len(dd)) + t + dd + struct.pack('>I', zlib.crc32(t + dd) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n'
        + ch(b'IHDR', struct.pack('>IIBBBBB', w, hh, 8, 6, 0, 0, 0))
        + ch(b'IDAT', zlib.compress(bytes(buf), 9)) + ch(b'IEND', b''))

png(outdir + '/eye-body.png', OUT_W, OUT_H, build('body')); print('wrote eye-body.png')
png(outdir + '/eye-iris.png', OUT_W, OUT_H, build('iris')); print('wrote eye-iris.png')
print('--- numbers for art.js ---')
print('EYE_IMG_W =', OUT_W, ', EYE_IMG_H =', OUT_H)
print('iris in the sprite: x', round((ICX - x0) * SC, 1),
      ' y', round((ICY - y0) * SC, 1), ' r', round(IR * SC, 1))
