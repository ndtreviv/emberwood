"""Cut the hanging vines, and the brick they hang from, out of the artist's
background picture into strips that repeat without a seam.

    sips -s format bmp <the background>.jpg --out /tmp/bg.bmp
    python3 tools/extract-vines.py /tmp/bg.bmp images/vines.png

It writes bricks.png beside vines.png.  Both are cut with the same
horizontal mapping, so the courses of one line up with the courses of the
other and the wall above the lip is the same wall.

The picture is a lip of old brick, a mat of leaves under it and strands
hanging off that, all over a cream wall.  In the game there is no wall
behind the vines - there is the eye - so the cream is keyed out, the same
warm-colour key the viaduct uses.

Vines have no natural period to cut on, so the strip is made seamless
instead: a margin wider than the tile is taken, and its overhang is faded
back over the start.  Foliage hides a fade of that width completely.
"""
import struct, zlib, sys

src, out = sys.argv[1], sys.argv[2]
TILE_W = 256                 # 2048 wraps on eight of these, like the viaduct
MARGIN = 28                  # how much overhang is faded back over the start
# Brick, leaf mat, and as much of the strands as there is room for above
# the deck.  Past here the strands are a few stragglers, and they would hang
# down over the road itself.
SRC_Y0, SRC_Y1 = 0, 560
CREAM = (244, 240, 228)
TOL = 16                     # inside this it is wall; past twice it, it is not

d = open(src, 'rb').read()
off = struct.unpack_from('<I', d, 10)[0]
W, h = struct.unpack_from('<ii', d, 18)
H = abs(h); flip = h < 0
stride = (W * 3 + 3) // 4 * 4

def px(x, y):
    x = max(0, min(W - 1, x)); y = max(0, min(H - 1, y))
    yy = y if flip else H - 1 - y
    i = off + yy * stride + x * 3
    return d[i + 2], d[i + 1], d[i]

STRIP_W = TILE_W + MARGIN
SC = STRIP_W / W
OUT_H = int(round((SRC_Y1 - SRC_Y0) * SC))
inv = 1 / SC
print('source', W, 'x', SRC_Y1 - SRC_Y0, '-> strip', STRIP_W, 'x', OUT_H,
      ' scale', round(SC, 4))

# ---- the strip, wall keyed out, area averaged ----
strip = []
for oy in range(OUT_H):
    row = []
    sy0 = SRC_Y0 + oy * inv
    for ox in range(STRIP_W):
        sx0 = ox * inv
        r = g = b = 0.0; a = 0.0; n = 0
        iy = int(sy0)
        while iy < sy0 + inv:
            ix = int(sx0)
            while ix < sx0 + inv:
                pr, pg, pb = px(ix, iy)
                n += 1
                dist = max(abs(pr - CREAM[0]), abs(pg - CREAM[1]), abs(pb - CREAM[2]))
                cover = 0.0 if dist <= TOL else (1.0 if dist >= TOL * 2 else (dist - TOL) / TOL)
                if cover > 0:
                    r += pr * cover; g += pg * cover; b += pb * cover; a += cover
                ix += 1
            iy += 1
        if a > 0: r, g, b = r / a, g / a, b / a
        row.append((r, g, b, a / max(1, n)))
    strip.append(row)

# ---- fade the overhang back over the start, so the two ends meet ----
tile = []
for oy in range(OUT_H):
    row = []
    for ox in range(TILE_W):
        c = strip[oy][ox]
        if ox < MARGIN:
            o = strip[oy][TILE_W + ox]
            t = ox / MARGIN                      # 0 at the seam, 1 past the fade
            aa = c[3] * t + o[3] * (1 - t)
            wc = c[3] * t; wo = o[3] * (1 - t)
            wsum = wc + wo
            if wsum > 0:
                c = ((c[0] * wc + o[0] * wo) / wsum,
                     (c[1] * wc + o[1] * wo) / wsum,
                     (c[2] * wc + o[2] * wo) / wsum, aa)
            else:
                c = (0, 0, 0, 0)
        row.append(c)
    tile.append(row)

buf = bytearray()
for oy in range(OUT_H):
    buf += b'\x00'
    for ox in range(TILE_W):
        r, g, b, a = tile[oy][ox]
        buf += bytes((int(r), int(g), int(b), int(255 * a)))

def ch(t, dd):
    return struct.pack('>I', len(dd)) + t + dd + struct.pack('>I', zlib.crc32(t + dd) & 0xffffffff)
def png(path, w, hh, body):
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n'
        + ch(b'IHDR', struct.pack('>IIBBBBB', w, hh, 8, 6, 0, 0, 0))
        + ch(b'IDAT', zlib.compress(bytes(body), 9)) + ch(b'IEND', b''))
png(out, TILE_W, OUT_H, buf)
print('wrote', out, TILE_W, 'x', OUT_H)

# ------------------------------------------------------------------
# THE WALL ABOVE THE LIP.
# The brick the vines hang from carries on upward out of sight, and it is
# the same brick: cut from the same picture, at the same scale, with the
# same horizontal mapping, so its courses line up with the lip's.
#
# Two whole courses are taken, because two tile upward without a join.  The
# courses in the picture stand 49 pixels apart, and the window is set so
# that two of them land on a whole number of pixels at this scale.
# ------------------------------------------------------------------
BRICK_H = 25                      # two courses, in the game's own pixels
BRICK_Y0 = 82.0                   # the top of a course, measured off the picture
BRICK_SRC_H = BRICK_H / SC

bstrip = []
for oy in range(BRICK_H):
    row = []
    sy0 = BRICK_Y0 + oy * inv if False else BRICK_Y0 + oy * (BRICK_SRC_H / BRICK_H)
    for ox in range(STRIP_W):
        sx0 = ox * inv
        r = g = b = 0.0; n = 0
        iy = int(sy0)
        while iy < sy0 + BRICK_SRC_H / BRICK_H:
            ix = int(sx0)
            while ix < sx0 + inv:
                pr, pg, pb = px(ix, iy)
                r += pr; g += pg; b += pb; n += 1
                ix += 1
            iy += 1
        if n: r, g, b = r / n, g / n, b / n
        row.append((r, g, b, 255.0))
    bstrip.append(row)

bbuf = bytearray()
for oy in range(BRICK_H):
    bbuf += b'\x00'
    for ox in range(TILE_W):
        c = bstrip[oy][ox]
        if ox < MARGIN:
            o = bstrip[oy][TILE_W + ox]
            t = ox / MARGIN
            c = (c[0] * t + o[0] * (1 - t), c[1] * t + o[1] * (1 - t),
                 c[2] * t + o[2] * (1 - t), 255.0)
        bbuf += bytes((int(c[0]), int(c[1]), int(c[2]), 255))

bout = out.replace('vines.png', 'bricks.png')
png(bout, TILE_W, BRICK_H, bbuf)
print('wrote', bout, TILE_W, 'x', BRICK_H)
