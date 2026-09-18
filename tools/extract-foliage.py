"""Cut the artist's dark foliage into a tile that repeats without a seam.

    sips -s format bmp <the foliage>.jpg --out /tmp/fol.bmp
    python3 tools/extract-foliage.py /tmp/fol.bmp images/foliage.png

The picture is a mat of dark leaves, and it does not tile as it stands: its
two edges differ.  A square window is taken, scaled down, and its overhang
faded back over its start on both axes, which foliage hides completely.

It is also very dark - nothing in it is brighter than 38 of 255 - so the
levels are lifted as it is cut.  The chapter has to be playable in, not
merely black, and the game darkens the far layers itself.
"""
import struct, zlib, sys

src, out = sys.argv[1], sys.argv[2]
TILE = 128                     # the tile the game repeats
MARGIN = 18                    # how much overhang is faded back over the start
LIFT = 2.15                    # how much the levels are opened up

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

SIDE = TILE + MARGIN
SRC = min(W, H)                # a square window out of the middle of it
X0 = (W - SRC) // 2
Y0 = (H - SRC) // 2
step = SRC / SIDE
print('source', SRC, 'x', SRC, '-> strip', SIDE, ' tile', TILE)

strip = []
for oy in range(SIDE):
    row = []
    for ox in range(SIDE):
        r = g = b = 0.0; n = 0
        iy = int(Y0 + oy * step)
        while iy < Y0 + (oy + 1) * step:
            ix = int(X0 + ox * step)
            while ix < X0 + (ox + 1) * step:
                pr, pg, pb = px(ix, iy)
                r += pr; g += pg; b += pb; n += 1
                ix += 1
            iy += 1
        if n: r, g, b = r / n, g / n, b / n
        row.append([r, g, b])
    strip.append(row)

# fade the overhang back over the start, on both axes
def mix(a, b, t):
    return [a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t)]
tile = [[list(strip[y][x]) for x in range(TILE)] for y in range(TILE)]
for y in range(TILE):
    for x in range(MARGIN):
        tile[y][x] = mix(tile[y][x], strip[y][TILE + x], x / MARGIN)
for x in range(TILE):
    for y in range(MARGIN):
        tile[y][x] = mix(tile[y][x], strip[TILE + y][x] if x >= MARGIN else
                         mix(strip[TILE + y][x], strip[TILE + y][TILE + x], x / MARGIN),
                         y / MARGIN)

buf = bytearray()
for y in range(TILE):
    buf += b'\x00'
    for x in range(TILE):
        c = tile[y][x]
        buf += bytes(tuple(min(255, int(v * LIFT + 3)) for v in c) + (255,))

def ch(t, dd):
    return struct.pack('>I', len(dd)) + t + dd + struct.pack('>I', zlib.crc32(t + dd) & 0xffffffff)
open(out, 'wb').write(b'\x89PNG\r\n\x1a\n'
    + ch(b'IHDR', struct.pack('>IIBBBBB', TILE, TILE, 8, 6, 0, 0, 0))
    + ch(b'IDAT', zlib.compress(bytes(buf), 9)) + ch(b'IEND', b''))
print('wrote', out, TILE, 'x', TILE)
