#!/usr/bin/env python3
"""
StackPeek icon generator.

Pure-Python supersampled software renderer (no PIL/cairo dependency): each icon
is drawn at high resolution with hard edges, then box-downsampled for real
anti-aliasing, and written as an 8-bit RGBA PNG.

The mark is an ISOMETRIC STACK of three layers (green -> blue -> light) on a
deep-navy rounded tile — a literal "stack" that reads at a glance and stays
legible down to 16px. Re-run to regenerate stackpeek/icons/*.png.
"""
import struct, zlib, math, os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "stackpeek", "icons")

# ---- palette (deep navy neutral, blue->green brand layers) ----
NAVY_T = (0x1e, 0x2a, 0x49)
NAVY_B = (0x0d, 0x13, 0x21)
LAYERS = [  # (center_y, side_face_rgb, top_face_rgb, edge_highlight_rgb)
    (0.660, (0x25, 0x9a, 0x50), (0x3f, 0xcf, 0x76), (0x86, 0xe8, 0xac)),  # bottom green
    (0.500, (0x2f, 0x66, 0xd8), (0x4c, 0x8d, 0xff), (0x9a, 0xc2, 0xff)),  # middle blue
    (0.340, (0x36, 0x54, 0xa6), (0x86, 0xb4, 0xff), (0xc4, 0xdb, 0xff)),  # top light-blue
]

def lerp(a, b, t):
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return tuple(a[i] + (b[i]-a[i])*t for i in range(3))
def over(dst, src, a):
    return tuple(src[i]*a + dst[i]*(1-a) for i in range(3))
def rrect(x, y, cx, cy, hw, hh, r):
    dx = abs(x-cx); dy = abs(y-cy)
    if dx > hw or dy > hh: return False
    ix = dx-(hw-r); iy = dy-(hh-r)
    if ix > 0 and iy > 0: return ix*ix+iy*iy <= r*r
    return True
def pip(pts, x, y):
    inside = False; n = len(pts); j = n-1
    for i in range(n):
        xi, yi = pts[i]; xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj-xi)*(y-yi)/(yj-yi)+xi):
            inside = not inside
        j = i
    return inside

def _seg(px, py, ax, ay, bx, by):
    vx, vy = bx-ax, by-ay; wx, wy = px-ax, py-ay
    d = vx*vx+vy*vy
    t = 0.0 if d == 0 else max(0.0, min(1.0, (wx*vx+wy*vy)/d))
    return math.hypot(px-(ax+t*vx), py-(ay+t*vy))

CX = 0.5
HW = 0.275      # rhombus half-width
DH = 0.082      # rhombus half-height (top face)
FRONT = 0.090   # front face depth

def shade(u, v):
    if not rrect(u, v, 0.5, 0.5, 0.5, 0.5, 0.185):
        return None
    c = lerp(NAVY_T, NAVY_B, v)

    # soft ambient glow behind the stack for depth
    gd = math.hypot(u-0.5, v-0.5)
    if gd < 0.45:
        c = over(c, (0x2a, 0x4a, 0x8f), (1-gd/0.45)*0.10)

    for (cy, side, topc, edge) in LAYERS:
        top = [(CX, cy-DH), (CX+HW, cy), (CX, cy+DH), (CX-HW, cy)]
        fl = [(CX-HW, cy), (CX, cy+DH), (CX, cy+DH+FRONT), (CX-HW, cy+FRONT)]
        fr = [(CX, cy+DH), (CX+HW, cy), (CX+HW, cy+FRONT), (CX, cy+DH+FRONT)]
        if pip(fl, u, v):
            c = lerp(side, (0, 0, 0), 0.16)      # shaded left face
        if pip(fr, u, v):
            c = side                              # lit right face
        if pip(top, u, v):
            c = topc                              # top face
            d_ul = _seg(u, v, CX, cy-DH, CX-HW, cy)
            d_ur = _seg(u, v, CX, cy-DH, CX+HW, cy)
            if min(d_ul, d_ur) < 0.012:          # bright top edges
                c = edge
    return c

def render(size, ss):
    W = size*ss
    hi = [[None]*W for _ in range(W)]
    for j in range(W):
        v = (j+0.5)/W; row = hi[j]
        for i in range(W):
            row[i] = shade((i+0.5)/W, v)
    raw = bytearray()
    for oy in range(size):
        raw.append(0)
        for ox in range(size):
            ar = ag = ab = cov = 0
            for dy in range(ss):
                srow = hi[oy*ss+dy]; base = ox*ss
                for dx in range(ss):
                    cc = srow[base+dx]
                    if cc is not None:
                        ar += cc[0]; ag += cc[1]; ab += cc[2]; cov += 1
            n = ss*ss
            if cov == 0:
                raw += bytes((0, 0, 0, 0))
            else:
                a = int(round(255*cov/n))
                raw += bytes((int(round(ar/cov)), int(round(ag/cov)), int(round(ab/cov)), a))
    return bytes(raw)

def write_png(path, raw, size):
    def ch(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t+d) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", ihdr) +
                ch(b"IDAT", zlib.compress(raw, 9)) + ch(b"IEND", b""))

SS = {16: 16, 32: 8, 48: 6, 128: 4}
if __name__ == "__main__":
    for s in (16, 32, 48, 128):
        write_png(os.path.join(OUT, f"icon{s}.png"), render(s, SS[s]), s)
        print("wrote", f"icon{s}.png")
