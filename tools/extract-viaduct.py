"""Cut a tileable strip out of the viaduct picture.

The picture is a regular arcade: ten piers with their centres 105.6 pixels
apart.  Eight of those bays, taken centre to centre, repeat exactly, so the
strip made from them tiles with no seam.  The cream sky between the arches
becomes transparent, because in the game there is no sky behind the
viaduct - there is the eye.
"""
import struct, zlib, sys

# Run it as:  sips -s format bmp <the original>.jpg --out /tmp/viaduct.bmp
#             python3 tools/extract-viaduct.py /tmp/viaduct.bmp images/viaduct.png
d = open(sys.argv[1], 'rb').read()
off = struct.unpack_from('<I', d, 10)[0]
w, h = struct.unpack_from('<ii', d, 18)
H = abs(h); flip = h < 0
stride = (w * 3 + 3) // 4 * 4

def px(x, y):
    x = max(0, min(w - 1, x)); y = max(0, min(H - 1, y))
    yy = y if flip else H - 1 - y
    i = off + yy * stride + x * 3
    return d[i + 2], d[i + 1], d[i]

# measured from the picture itself
PIER0 = 88.5              # the centre of the first pier
PITCH = 105.611           # and how far it is to the next one
BAYS = 8                  # eight of them, because 8 x 32 = 2048, the wrap
TOP = 391                 # the top edge of the coping, measured off the picture
OUT_W, OUT_H = 32 * BAYS, 200
SRC_W = PITCH * BAYS
SRC_H = SRC_W / OUT_W * OUT_H
# The sky is one flat warm colour and the stone is neutral, so the key is a
# distance from that colour rather than a brightness.  The coping's own top
# course is nearly as bright as the sky but not as warm, and a brightness
# key ate it.
SKY_RGB = (239, 235, 224)
SKY_TOL = 14              # inside this, it is sky; past twice it, it is stone

out = bytearray()
for oy in range(OUT_H):
    row = bytearray()
    y0 = TOP + oy * SRC_H / OUT_H
    y1 = TOP + (oy + 1) * SRC_H / OUT_H
    for ox in range(OUT_W):
        x0 = PIER0 + ox * SRC_W / OUT_W
        x1 = PIER0 + (ox + 1) * SRC_W / OUT_W
        # average the source box, counting sky as clear and stone as solid
        r = g = b = 0.0; solid = 0; total = 0
        for sy in range(int(y0), max(int(y0) + 1, int(y1 + 0.999))):
            for sx in range(int(x0), max(int(x0) + 1, int(x1 + 0.999))):
                pr, pg, pb = px(sx, sy)
                total += 1
                dist = max(abs(pr - SKY_RGB[0]), abs(pg - SKY_RGB[1]), abs(pb - SKY_RGB[2]))
                if dist <= SKY_TOL:
                    cover = 0.0
                elif dist >= SKY_TOL * 2:
                    cover = 1.0
                else:
                    cover = (dist - SKY_TOL) / SKY_TOL
                if cover <= 0:
                    continue
                solid += cover; r += pr * cover; g += pg * cover; b += pb * cover
        if solid > 0:
            r, g, b = r / solid, g / solid, b / solid
        a = 255 * solid / max(1, total)
        row += bytes((int(r), int(g), int(b), int(a)))
    out += b'\x00' + row

def chunk(tag, data):
    return (struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

png = (b'\x89PNG\r\n\x1a\n'
       + chunk(b'IHDR', struct.pack('>IIBBBBB', OUT_W, OUT_H, 8, 6, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(bytes(out), 9))
       + chunk(b'IEND', b''))
path = sys.argv[2]
open(path, 'wb').write(png)
print('wrote', path, OUT_W, 'x', OUT_H, len(png), 'bytes')
