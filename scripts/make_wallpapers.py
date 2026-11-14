"""
Original pixel-art wallpapers for Capi's Deck.

Pure Python stdlib: draws into a pixel buffer and writes PNGs. Every scene uses warm, low-contrast
palettes and a final golden haze, so nothing glares while you study.

    python scripts/make_wallpapers.py public/wallpapers
"""
import math, os, random, struct, sys, zlib

W, H = 384, 216
BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


def hexc(h):
    if isinstance(h, tuple):
        return h
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    a, b = hexc(a), hexc(b)
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


class Canvas:
    def __init__(self, fill='#000000'):
        f = hexc(fill)
        self.px = [[f] * W for _ in range(H)]

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < W and 0 <= y < H else (0, 0, 0)

    def set(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < W and 0 <= y < H:
            self.px[y][x] = hexc(c)

    def rect(self, x0, y0, x1, y1, c):
        c = hexc(c)
        for y in range(max(0, int(y0)), min(H, int(y1))):
            row = self.px[y]
            for x in range(max(0, int(x0)), min(W, int(x1))):
                row[x] = c

    def disc(self, cx, cy, r, c, sx=1.0):
        c = hexc(c)
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r * sx) - 1, int(cx + r * sx) + 2):
                if ((x - cx) / sx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.set(x, y, c)

    def dither(self, x, y, a, b, t):
        """Pick a or b by ordered dithering for blend amount t (0..1)."""
        return hexc(b) if t * 16 > BAYER[y % 4][x % 4] else hexc(a)

    def gradient(self, y0, y1, stops, x0=0, x1=W):
        cols = [hexc(s) for s in stops]
        span = len(cols) - 1
        for y in range(max(0, y0), min(H, y1)):
            t = (y - y0) / max(1, y1 - y0 - 1) * span
            i = min(int(t), span - 1)
            f = t - i
            for x in range(x0, x1):
                self.px[y][x] = self.dither(x, y, cols[i], cols[i + 1], f)

    def ridge(self, base, amp, freq, phase, c, top=None, x0=0, x1=W, rough=0.0, rnd=None):
        """Fill everything below a wavy line."""
        for x in range(x0, x1):
            h = base - amp * (0.6 * math.sin(x * freq + phase) + 0.4 * math.sin(x * freq * 2.7 + phase * 1.9))
            if rough and rnd:
                h += rnd.uniform(-rough, rough)
            h = int(h)
            for y in range(max(0, h), H):
                self.px[y][x] = hexc(c)
            if top:
                self.set(x, h, top)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            self.set(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def haze(self, color, amount, lift=0.0):
        """Golden-hour wash: pull every pixel toward a warm tone and soften the darks a little."""
        hc = hexc(color)
        for y in range(H):
            row = self.px[y]
            for x in range(W):
                r, g, b = row[x]
                r, g, b = r + (hc[0] - r) * amount, g + (hc[1] - g) * amount, b + (hc[2] - b) * amount
                if lift:
                    r, g, b = r + (255 - r) * lift * 0.15, g + (255 - g) * lift * 0.15, b + (255 - b) * lift * 0.15
                row[x] = (int(r), int(g), int(b))

    def save(self, path):
        raw = b''.join(b'\x00' + b''.join(bytes(p) for p in row) for row in self.px)

        def chunk(t, d):
            return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)

        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
        open(path, 'wb').write(png)


# ---------------------------------------------------------------- shared pieces

def cloud(c, x, y, s, light, mid, shade):
    puffs = [(0, 0, 8), (10, -4, 10), (22, -1, 8), (31, 2, 6), (-9, 2, 6), (15, 3, 7)]
    for dx, dy, r in puffs:
        c.disc(x + dx * s, y + dy * s + 2, r * s, shade)
    for dx, dy, r in puffs:
        c.disc(x + dx * s, y + dy * s, r * s * 0.92, mid)
    for dx, dy, r in puffs[:3]:
        c.disc(x + dx * s - 2, y + dy * s - 2, r * s * 0.6, light)


def foliage(c, rnd, cx, cy, r, tones, light=None, n=None, sx=1.0):
    """A leafy clump: dark base, mid clusters, sunlit clusters on the upper left."""
    dark, mid, hi = tones
    c.disc(cx, cy, r, dark, sx)
    for _ in range(n or int(r * 1.6)):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(0, r * 0.75)
        c.disc(cx + math.cos(a) * d * sx, cy + math.sin(a) * d, rnd.uniform(r * 0.22, r * 0.4), mid)
    for _ in range(n or int(r * 1.2)):
        a = rnd.uniform(math.pi * 1.0, math.pi * 1.75)
        d = rnd.uniform(r * 0.2, r * 0.75)
        c.disc(cx + math.cos(a) * d * sx, cy + math.sin(a) * d, rnd.uniform(r * 0.12, r * 0.26), hi)
    if light:
        for _ in range(int(r)):
            a = rnd.uniform(math.pi * 1.1, math.pi * 1.6)
            d = rnd.uniform(r * 0.4, r * 0.85)
            c.set(cx + math.cos(a) * d * sx, cy + math.sin(a) * d, light)


def crown(c, rnd, cx, cy, r, tones, light=None, sx=1.0):
    """An irregular tree crown made of overlapping clumps, so it doesn't read as a ball."""
    clumps = [(0, 0, 0.62)] + [(math.cos(a) * 0.55, math.sin(a) * 0.42, rnd.uniform(0.38, 0.52)) for a in (rnd.uniform(0, math.tau) for _ in range(7))]
    for dx, dy, k in clumps:
        foliage(c, rnd, cx + dx * r * sx, cy + dy * r, r * k, tones, light, sx=sx)
    for _ in range(int(r * 1.5)):
        a = rnd.uniform(0, math.tau)
        d = rnd.uniform(r * 0.7, r * 1.05)
        c.set(cx + math.cos(a) * d * sx, cy + math.sin(a) * d * 0.8, tones[1])


def tree(c, rnd, x, ground, trunk_h, r, tones, trunk='#6a4632', light=None):
    c.rect(x - 1, ground - trunk_h - 2, x + 2, ground, trunk)
    c.set(x - 2, ground - 1, trunk)
    c.set(x + 2, ground - 1, trunk)
    foliage(c, rnd, x, ground - trunk_h - r * 0.7, r, tones, light)


def pine(c, x, ground, h, tones):
    dark, mid, hi = tones
    c.rect(x, ground - 4, x + 2, ground, '#4d3426')
    for i in range(h):
        w = int((h - i) * 0.42) + 1
        y = ground - 4 - i
        c.rect(x + 1 - w, y, x + 1 + w, y + 1, dark)
        if i % 5 in (1, 2):
            c.rect(x + 1 - w + 1, y, x + 1, y + 1, mid)
        if i % 5 == 1:
            c.rect(x + 1 - w + 1, y, x + 1 - w // 2, y + 1, hi)


def flowers(c, rnd, n, x0, x1, y0, y1, colors):
    for _ in range(n):
        x, y = rnd.randint(x0, x1), rnd.randint(y0, y1)
        col = rnd.choice(colors)
        c.set(x, y, col)
        if rnd.random() < 0.3:
            c.set(x + 1, y, col)


def grass(c, rnd, y0, y1, base, dark, light):
    c.rect(0, y0, W, y1, base)
    for y in range(y0, y1):
        for x in range((y * 5) % 9, W, 9):
            c.set(x, y, dark)
    for _ in range((y1 - y0) * 8):
        c.set(rnd.randint(0, W - 1), rnd.randint(y0, y1 - 1), light)


def roof(c, x0, x1, y_top, y_eave, tile, tile_dark, overhang=3):
    """A gabled roof drawn as shingle rows."""
    h = y_eave - y_top
    mid = (x0 + x1) / 2
    for i in range(h):
        y = y_top + i
        half = (x1 - x0) / 2 * (i + 1) / h + overhang * (i + 1) / h
        c.rect(int(mid - half), y, int(mid + half), y + 1, tile if (i % 3) else tile_dark)
        if i % 3 == 1:
            for x in range(int(mid - half), int(mid + half), 4):
                c.set(x + (i % 2) * 2, y, tile_dark)


# ---------------------------------------------------------------- scenes

def cottage(out):
    """Warm afternoon meadow with a red-roofed cottage (the original, redrawn warmer)."""
    rnd = random.Random(7)
    c = Canvas()
    c.gradient(0, 130, ['#e9c49a', '#f0d2aa', '#f5dfbe', '#f3e6cc'])
    c.disc(300, 54, 30, '#f7e3b8')
    c.disc(300, 54, 18, '#fbeccb')
    cloud(c, 60, 34, 1.15, '#fbf0dc', '#f3dcc0', '#e3c3a3')
    cloud(c, 210, 22, 0.9, '#fbf0dc', '#f3dcc0', '#e3c3a3')
    cloud(c, 330, 58, 0.7, '#fbf0dc', '#f3dcc0', '#e3c3a3')
    c.ridge(126, 12, 0.016, 0.4, '#b8b585', '#c8c497')
    c.ridge(138, 9, 0.028, 2.0, '#9ea86a', '#afb67a')
    for x in range(-6, W + 10, 10):
        tree(c, rnd, x, 146, 3, 8 + rnd.randint(0, 3), ('#5f7a45', '#728d50', '#8ea35e'))
    grass(c, rnd, 146, H, '#8fa85a', '#7f9850', '#a6b86c')
    # path
    for y in range(160, H):
        t = (y - 160) / (H - 160)
        cx = 244 - 50 * t
        w = 6 + 34 * t
        c.rect(int(cx - w / 2), y, int(cx + w / 2), y + 1, '#d8bd8a')
        c.set(int(cx - w / 2), y, '#c2a571')
        c.set(int(cx + w / 2), y, '#c2a571')
    # cottage
    c.rect(222, 128, 274, 162, '#efdcb8')
    c.rect(222, 158, 274, 162, '#d6c098')
    roof(c, 218, 278, 108, 129, '#b8563e', '#93402f')
    c.rect(238, 98, 244, 112, '#8c5b44')
    c.rect(242, 144, 252, 162, '#7a5236')
    c.set(250, 153, '#f1c76a')
    for wx in (227, 260):
        c.rect(wx, 136, wx + 10, 145, '#f3cf86')
        c.rect(wx + 4, 136, wx + 5, 145, '#efdcb8')
        c.rect(wx, 140, wx + 10, 141, '#efdcb8')
        c.rect(wx - 1, 145, wx + 11, 147, '#a77a55')
        flowers(c, rnd, 6, wx - 1, wx + 10, 144, 145, ['#d9776a', '#efb36a'])
    # framing trees
    for x, h, r in [(16, 34, 24), (46, 24, 17), (348, 38, 26), (376, 26, 18), (312, 20, 13)]:
        tree(c, rnd, x, 176, h, r, ('#4d6b3c', '#5f7f46', '#7b9655'), light='#a9b46c')
    for x in (86, 160, 300):
        tree(c, rnd, x, 160, 6, 7, ('#62804a', '#759256', '#8fa766'))
    flowers(c, rnd, 320, 0, W - 1, 168, H - 1, ['#e7a39a', '#f1dc9a', '#f6efe0', '#e9b46e'])
    c.haze('#f2c993', 0.12)
    c.save(out)


def sakura(out):
    """Shrine gate and cherry trees at dusk, with a soft amber sky."""
    rnd = random.Random(3)
    c = Canvas()
    c.gradient(0, 160, ['#d99a8a', '#e7b199', '#f0c8a6', '#f4dcbc'])
    c.disc(286, 82, 20, '#f8e2bd')
    c.disc(286, 82, 14, '#fbecd0')
    for y in range(48, 136):
        half = (y - 48) * 1.6
        top = y < 68
        if top:
            c.rect(int(132 - half), y, int(132 + half), y + 1, '#ece0e2')
        else:
            for x in range(int(132 - half), int(132 + half)):
                # lit left face, shaded right face, dithered ridge between
                t = (x - (132 - half)) / max(1, 2 * half)
                c.px[y][x] = c.dither(x, y, '#a796ad', '#8f7f99', max(0, min(1, (t - 0.45) * 4)))
        if 66 <= y < 72:
            for x in range(int(132 - half), int(132 + half), 3):
                c.set(x, y, '#ece0e2')
    c.ridge(136, 7, 0.022, 1.0, '#ab8c9a')
    c.ridge(150, 6, 0.02, 3.0, '#9daa78', '#acb887')
    grass(c, rnd, 164, H, '#9fb07c', '#93a571', '#b2bf8d')
    # torii
    c.rect(256, 108, 316, 113, '#b9493c')
    c.rect(251, 105, 321, 108, '#4a2c28')
    c.rect(261, 119, 311, 122, '#b9493c')
    c.rect(265, 111, 271, 176, '#b9493c')
    c.rect(301, 111, 307, 176, '#b9493c')
    c.rect(283, 113, 289, 119, '#b9493c')
    c.rect(265, 172, 271, 176, '#4a2c28')
    c.rect(301, 172, 307, 176, '#4a2c28')
    # stone path
    for i, y in enumerate(range(176, H, 7)):
        w = 12 + i * 7
        c.rect(286 - w // 2, y, 286 + w // 2, y + 5, '#d9cbb4')
        c.rect(286 - w // 2, y + 4, 286 + w // 2, y + 5, '#c2b39b')
    # stone lanterns
    for lx in (238, 334):
        c.rect(lx, 160, lx + 6, 178, '#b9ae9d')
        c.rect(lx - 3, 156, lx + 9, 160, '#a69a88')
        c.rect(lx + 1, 164, lx + 5, 168, '#f2c27a')
    for x, h, r in [(34, 34, 26), (92, 24, 18), (176, 20, 14), (360, 36, 26), (214, 16, 11)]:
        c.rect(x - 1, 178 - h, x + 2, 178, '#5b3a36')
        c.line(x, 178 - h, x - r // 2, 178 - h - r // 2, '#5b3a36')
        crown(c, rnd, x, 178 - h - r * 0.55, r, ('#d1879a', '#e3a2b1', '#f2c4cc'), light='#f8dfe2')
    flowers(c, rnd, 200, 0, W - 1, 70, H - 1, ['#ecb0bf', '#f6d6dc'])
    c.haze('#f0bf98', 0.12)
    c.save(out)


def night(out):
    """A warm night street: plum sky, amber windows, power lines, a vending machine."""
    rnd = random.Random(11)
    c = Canvas()
    c.gradient(0, 160, ['#241d2e', '#2f2638', '#433246', '#5c4150'])
    for _ in range(110):
        x, y = rnd.randint(0, W - 1), rnd.randint(0, 100)
        c.set(x, y, rnd.choice(['#d8c7b0', '#bfae9d', '#efdcb8']))
    c.disc(312, 40, 14, '#efd9a6')
    c.disc(319, 35, 13, '#271f30')
    x = 0
    while x < W:
        w = rnd.randint(22, 40)
        h = rnd.randint(34, 80)
        top = 176 - h
        col = rnd.choice(['#2e2536', '#342a3b', '#2a2232'])
        c.rect(x, top, x + w, 176, col)
        if rnd.random() < 0.55:
            for i in range(6):
                c.rect(x - 3 + i, top - 6 + i, x + w + 3 - i, top - 5 + i, '#221b28')
        for wy in range(top + 6, 170, 8):
            for wx in range(x + 4, x + w - 4, 7):
                if rnd.random() < 0.4:
                    col = rnd.choice(['#e3a964', '#d9935a', '#efc07c'])
                    c.rect(wx, wy, wx + 4, wy + 4, col)
                    c.rect(wx, wy + 3, wx + 4, wy + 4, mix(col, '#2e2536', 0.4))
        x += w + rnd.randint(0, 3)
    for px in (48, 204, 344):
        c.rect(px, 70, px + 3, 186, '#1a1520')
        c.rect(px - 8, 76, px + 11, 78, '#1a1520')
    for a, b in ((48, 204), (204, 344)):
        for x in range(a, b):
            t = (x - a) / (b - a)
            sag = int(12 * math.sin(math.pi * t))
            c.set(x, 77 + sag, '#1a1520')
            c.set(x, 82 + sag, '#1a1520')
    c.rect(0, 176, W, H, '#2a2230')
    c.rect(0, 188, W, 190, '#3b3040')
    # street lamp pools and vending machine
    for lx in (120, 270):
        c.rect(lx, 132, lx + 2, 186, '#1a1520')
        c.rect(lx - 3, 130, lx + 6, 133, '#f2c27a')
        for i in range(1, 10):
            for xx in range(lx - i * 3, lx + i * 3):
                if (xx + i) % 2 == 0:
                    c.set(xx, 186 + i // 2, '#5a4645')
    c.rect(150, 156, 166, 186, '#c9bba8')
    c.rect(152, 159, 164, 170, '#e7c38c')
    c.rect(152, 173, 164, 180, '#d98c78')
    c.haze('#3b2a2c', 0.08)
    c.save(out)


def seaside(out):
    """Soft apricot sunset over a muted sea, with a lighthouse."""
    rnd = random.Random(5)
    c = Canvas()
    c.gradient(0, 120, ['#e8b98f', '#eeb995', '#e7a598', '#d9989c'])
    c.disc(192, 118, 26, '#f5d9a8')
    c.disc(192, 118, 20, '#f8e4ba')
    cloud(c, 60, 40, 1.0, '#f6dcc0', '#ecc2a8', '#dba997')
    cloud(c, 290, 26, 1.1, '#f6dcc0', '#ecc2a8', '#dba997')
    c.gradient(120, 176, ['#cc969a', '#9d8ea3', '#7f8aa0'])
    for y in range(122, 176, 3):
        for x in range(rnd.randint(0, 9), W, rnd.randint(14, 26)):
            c.rect(x, y, x + rnd.randint(3, 8), y + 1, '#f2cfa6' if abs(x - 192) < 34 else '#a9a8bb')
    for x in range(272, 368):
        h = int(16 * math.sqrt(max(0, 1 - ((x - 320) / 48) ** 2)))
        c.rect(x, 124 - h, x + 1, 128, '#5d5a6c')
        if h > 2:
            c.set(x, 124 - h, '#736d80')
    c.rect(312, 84, 324, 110, '#efe5d6')
    for y in range(88, 110, 8):
        c.rect(312, y, 324, y + 4, '#b9584a')
    c.rect(310, 80, 326, 84, '#3f3946')
    c.rect(314, 75, 322, 80, '#f5d89a')
    c.rect(0, 176, W, H, '#e2c79d')
    for x in range(W):
        y = 176 + int(2 * math.sin(x * 0.07))
        c.rect(x, 173, x + 1, y + 1, '#f1e4cf')
    flowers(c, rnd, 220, 0, W - 1, 180, H - 1, ['#d3b689', '#ecd8b4'])
    for sx, sy in ((48, 196), (110, 204), (250, 199), (330, 207)):
        c.rect(sx, sy, sx + 4, sy + 2, '#d9897a')
    c.haze('#efc39b', 0.1)
    c.save(out)


def timber_house(c, rnd, x0, x1, base, wall_h, roof_h, wall, beam, tile, tile_dark, door=True):
    c.rect(x0, base - wall_h, x1, base, wall)
    for bx in range(x0, x1 + 1, 12):
        c.rect(bx, base - wall_h, bx + 2, base, beam)
    c.rect(x0, base - wall_h, x1, base - wall_h + 2, beam)
    c.rect(x0, base - wall_h // 2, x1, base - wall_h // 2 + 2, beam)
    roof(c, x0 - 2, x1 + 2, base - wall_h - roof_h, base - wall_h + 1, tile, tile_dark)
    for wx in range(x0 + 5, x1 - 8, 16):
        c.rect(wx, base - wall_h + 6, wx + 7, base - wall_h + 13, '#f0c27a')
        c.rect(wx + 3, base - wall_h + 6, wx + 4, base - wall_h + 13, beam)
    if door:
        mid = (x0 + x1) // 2
        c.rect(mid - 4, base - 14, mid + 5, base, '#6c4630')
        c.rect(mid - 4, base - 15, mid + 5, base - 14, beam)


def ivy_cottage(out):
    """A storybook cottage with timber beams, a chimney, climbing ivy and a flower garden."""
    rnd = random.Random(21)
    c = Canvas()
    c.gradient(0, 120, ['#a9c1bf', '#c2cfc0', '#dbd6bf', '#ead9b9'])
    cloud(c, 54, 30, 1.2, '#f7ecd8', '#ead9bf', '#d6c4a8')
    cloud(c, 300, 18, 1.0, '#f7ecd8', '#ead9bf', '#d6c4a8')
    c.ridge(120, 10, 0.02, 1.2, '#8e9a6c')
    for x in range(-4, W + 10, 12):
        tree(c, rnd, x, 128, 2, 10 + rnd.randint(0, 3), ('#566d43', '#677f4d', '#7f945b'))
    grass(c, rnd, 128, H, '#86995a', '#788c50', '#9cac6a')
    # house body
    hx0, hx1, base = 112, 268, 176
    c.rect(hx0, 120, hx1, base, '#e9d8b6')
    for bx in (112, 140, 168, 212, 240, 266):
        c.rect(bx, 120, bx + 3, base, '#6e4a34')
    c.rect(hx0, 120, hx1, 123, '#6e4a34')
    c.rect(hx0, 146, hx1, 149, '#6e4a34')
    for i in range(10):
        c.line(140 + i * 3, 149, 140 + i * 3 + 6, 158, '#6e4a34') if i % 4 == 0 else None
    # big roof with gable
    roof(c, 98, 282, 58, 122, '#b7614a', '#934a38', overhang=6)
    roof(c, 160, 220, 74, 112, '#c06a52', '#9c513f', overhang=4)
    c.rect(170, 92, 210, 112, '#ead9b8')
    c.rect(176, 96, 204, 108, '#5f6f88')
    c.rect(189, 96, 191, 108, '#ead9b8')
    c.rect(176, 101, 204, 103, '#ead9b8')
    c.rect(174, 94, 206, 96, '#6e4a34')
    # chimney
    c.rect(234, 46, 248, 82, '#8d97a0')
    for y in range(48, 82, 4):
        for x in range(234 + (y // 4) % 2 * 3, 248, 6):
            c.rect(x, y, x + 1, y + 1, '#717b85')
    c.rect(232, 44, 250, 48, '#6d7680')
    # door and windows
    c.rect(182, 152, 198, base, '#7a4c33')
    c.disc(190, 152, 8, '#7a4c33')
    c.rect(188, 150, 189, base, '#5c3826')
    c.set(195, 164, '#e2b56a')
    for wx in (124, 228):
        c.rect(wx, 128, wx + 20, 142, '#f0c27a')
        c.rect(wx + 9, 128, wx + 11, 142, '#6e4a34')
        c.rect(wx, 134, wx + 20, 136, '#6e4a34')
        c.rect(wx - 2, 142, wx + 22, 145, '#7f5a3e')
        flowers(c, rnd, 14, wx - 2, wx + 22, 140, 142, ['#d9776a', '#e6a7c0', '#f2d18a'])
    # ivy climbing the left and over the door
    for _ in range(160):
        x = rnd.randint(108, 150)
        y = rnd.randint(84 + (150 - x) // 3, base)
        c.set(x, y, rnd.choice(['#5d7a43', '#6f8f4e', '#86a35e']))
    for _ in range(90):
        a = rnd.uniform(math.pi, math.tau)
        r = rnd.uniform(9, 14)
        c.set(190 + math.cos(a) * r, 152 + math.sin(a) * r, rnd.choice(['#5d7a43', '#6f8f4e', '#86a35e']))
    # garden, stepping stones, pond
    for i, y in enumerate(range(180, H, 8)):
        sx = 190 - i * 6 + (i % 2) * 6
        c.rect(sx - 6, y, sx + 6, y + 4, '#cbbfa8')
        c.rect(sx - 6, y + 3, sx + 6, y + 4, '#b1a48b')
    c.disc(96, 196, 10, '#7f98a0', sx=2.0)
    c.disc(96, 195, 7, '#9fb4b5', sx=2.0)
    for x, r in ((70, 9), (300, 10), (330, 8), (40, 7)):
        foliage(c, rnd, x, 188, r, ('#5d7342', '#6f874f', '#86995c'))
    flowers(c, rnd, 260, 0, W - 1, 180, H - 1, ['#c96f8f', '#e6a7c0', '#f2d18a', '#b58ccc', '#f4ece0'])
    for x, h, r in [(24, 40, 30), (366, 46, 32)]:
        tree(c, rnd, x, 200, h, r, ('#4b6339', '#5b7642', '#728c50'), light='#9aac68')
    c.haze('#ecd2a6', 0.12)
    c.save(out)


def autumn_village(out):
    """Hillside houses in autumn, a church tower, and a still lake at the bottom."""
    rnd = random.Random(42)
    c = Canvas()
    c.gradient(0, 70, ['#e2c7a8', '#e9cfac', '#eed7b4'])
    c.ridge(60, 10, 0.012, 0.6, '#b8a38e', rough=0.5, rnd=rnd)
    tones = [('#9e4a2e', '#c0643a', '#dc8c4a'), ('#b05a2c', '#d07a38', '#e7a24c'), ('#8c3f34', '#ad5440', '#c97850'), ('#a87432', '#c99440', '#e2b85a')]
    # hillside: rows of houses and autumn trees, back to front
    for row, y in enumerate(range(70, 180, 18)):
        x = rnd.randint(-20, 0)
        while x < W:
            if rnd.random() < 0.45:
                w = rnd.randint(20, 30)
                wall = rnd.choice(['#e8d6b8', '#d9c6a6', '#c9b39a', '#9fa7b0'])
                tile = rnd.choice([('#8f4a3a', '#733a2e'), ('#5e5a6e', '#4a4658'), ('#a3573e', '#844431')])
                c.rect(x, y - 12, x + w, y + 4, wall)
                roof(c, x - 1, x + w + 1, y - 26, y - 11, tile[0], tile[1], overhang=2)
                for wx in range(x + 4, x + w - 4, 7):
                    c.rect(wx, y - 8, wx + 3, y - 4, rnd.choice(['#f0c27a', '#6b6f7a']))
                x += w + rnd.randint(2, 8)
            else:
                r = rnd.randint(8, 13)
                foliage(c, rnd, x + r, y - r * 0.4, r, rnd.choice(tones), light='#f0c27a')
                x += r + rnd.randint(4, 12)
    # church tower on the right
    c.rect(326, 44, 346, 112, '#e5d5b8')
    c.rect(330, 54, 342, 64, '#6a6670')
    for i in range(16):
        c.rect(326 + i // 2, 44 - i, 346 - i // 2, 45 - i, '#4f4b5c')
    c.rect(335, 22, 337, 30, '#4f4b5c')
    # lake with reflection
    c.gradient(186, H, ['#7a6a6a', '#5f5866'])
    for y in range(186, H, 2):
        src = 186 - (y - 186) * 2 - 6
        for x in range(0, W, 1):
            if (x + y) % 3 == 0 and 0 <= src < H:
                c.px[y][x] = mix(c.get(x, src), '#5f5866', 0.55)
    for _ in range(140):
        x, y = rnd.randint(0, W - 4), rnd.randint(188, H - 1)
        c.rect(x, y, x + rnd.randint(2, 6), y + 1, '#8f7f7c')
    # foreground branches
    for x, r in ((10, 26), (360, 28), (300, 14)):
        foliage(c, rnd, x, 205, r, rnd.choice(tones), light='#f2c67a')
    flowers(c, rnd, 160, 0, W - 1, 60, 185, ['#e7a24c', '#d07a38'])
    c.haze('#e9bf8e', 0.12)
    c.save(out)


def village_lane(out):
    """A stone lane between wooden houses, a cherry tree, power lines and green mountains."""
    rnd = random.Random(8)
    c = Canvas()
    c.gradient(0, 90, ['#b7c7c4', '#cdd5c6', '#e4dcc4'])
    cloud(c, 230, 30, 1.6, '#f6eedc', '#e7dcc5', '#d2c6ae')
    c.ridge(70, 16, 0.02, 0.5, '#7d9579', rough=0.6, rnd=rnd)
    c.ridge(92, 12, 0.03, 2.2, '#617d5c', rough=0.8, rnd=rnd)
    for _ in range(140):
        x, y = rnd.randint(0, W - 1), rnd.randint(70, 120)
        if c.get(x, y) != hexc('#b7c7c4'):
            c.disc(x, y, rnd.uniform(1.5, 3.5), rnd.choice(['#566f50', '#6c8762', '#7f9a6d']))
    vx, vy = 200, 112  # vanishing point
    # road
    for y in range(vy, H):
        t = (y - vy) / (H - vy)
        half = 6 + t * 150
        c.rect(int(vx - half), y, int(vx + half), y + 1, '#b3a185')
        c.set(int(vx - half), y, '#8f7e66')
        c.set(int(vx + half), y, '#8f7e66')
        if (y // 4) % 2 == 0:
            for x in range(int(vx - half), int(vx + half), int(6 + t * 18)):
                c.set(x, y, '#9d8c71')
        else:
            for x in range(int(vx - half) + 3, int(vx + half), int(6 + t * 18)):
                c.set(x, y, '#9d8c71')
    # houses on both sides, receding
    def side(sign):
        for i in range(6, -1, -1):
            t = i / 6
            depth = 1 - t
            near = 0.25 + depth * 0.75
            base = int(vy + 6 + near * 96)
            h = int(14 + near * 64)
            w = int(10 + near * 46)
            inner = int(vx + sign * (8 + near * 118))
            x0, x1 = (inner, inner + w) if sign > 0 else (inner - w, inner)
            wall = '#7b5a40' if i % 2 else '#6c4e38'
            c.rect(x0, base - h, x1, base, wall)
            for bx in range(x0, x1, max(3, w // 6)):
                c.rect(bx, base - h, bx + 1, base, '#4f3626')
            c.rect(x0, base - h + h // 3, x1, base - h + h // 3 + 2, '#4f3626')
            for i2 in range(max(3, h // 4)):
                yy = base - h - i2
                c.rect(x0 - (3 if sign < 0 else 0) - i2 // 2, yy, x1 + (3 if sign > 0 else 0) + i2 // 2, yy + 1, '#5a5552' if i2 % 2 else '#4a4644')
            c.rect(x0 + w // 4, base - h // 2, x0 + w // 4 + max(2, w // 5), base - h // 2 + max(2, h // 6), '#e8b56e')
    side(-1)
    side(1)
    # power poles and wires
    for i, px in enumerate((300, 252, 228)):
        top = 40 + i * 22
        c.rect(px, top, px + 3 - i, 200 - i * 40, '#3e3230')
        c.rect(px - 6 + i, top + 4, px + 8 - i, top + 6, '#3e3230')
    c.line(300, 45, 252, 67, '#3e3230')
    c.line(252, 67, 228, 89, '#3e3230')
    c.line(300, 49, 0, 64, '#3e3230')
    # cherry tree on the left
    c.rect(44, 110, 50, 200, '#5c3d36')
    c.line(47, 140, 80, 110, '#5c3d36')
    c.line(47, 130, 20, 104, '#5c3d36')
    for cx, cy, r in ((54, 72, 38), (96, 100, 20)):
        crown(c, rnd, cx, cy, r, ('#d48ba0', '#e6a8b6', '#f3c9cf'), light='#f8e1e3')
    for bx, by in ((47, 140), (47, 130), (47, 118)):
        for _ in range(6):
            c.set(bx + rnd.randint(-20, 30), by - rnd.randint(10, 50), '#5c3d36')
    flowers(c, rnd, 120, 0, 200, 100, H - 1, ['#ecb0bf', '#f6d6dc'])
    # potted plants along the lane
    for px, py in ((128, 186), (276, 182), (98, 204)):
        c.rect(px, py, px + 8, py + 8, '#9a6a4e')
        foliage(c, rnd, px + 4, py - 3, 6, ('#5d7342', '#6f874f', '#86995c'))
    c.haze('#ebd1a8', 0.12)
    c.save(out)


def scroll(out):
    """A horizontal handscroll painting: parchment, a pagoda, pines and cherry blossom, in a green frame."""
    rnd = random.Random(15)
    c = Canvas('#2d2620')
    # paper
    px0, px1, py0, py1 = 26, W - 26, 16, H - 16
    for y in range(py0, py1):
        for x in range(px0, px1):
            n = rnd.random()
            base = mix('#e6d1a3', '#d8bf8e', ((x * 7 + y * 13) % 29) / 29 * 0.5 + n * 0.3)
            c.px[y][x] = base
    for _ in range(60):
        c.disc(rnd.randint(px0, px1), rnd.randint(py0, py1), rnd.uniform(3, 9), mix('#d4b98a', '#e2cb9e', rnd.random()))
    # green key-pattern frame
    def border(x0, y0, x1, y1):
        c.rect(x0, y0, x1, y0 + 3, '#3f6b48')
        c.rect(x0, y1 - 3, x1, y1, '#3f6b48')
        c.rect(x0, y0, x0 + 3, y1, '#3f6b48')
        c.rect(x1 - 3, y0, x1, y1, '#3f6b48')
    border(px0 + 6, py0 + 6, px1 - 6, py1 - 6)
    for (x, y) in ((px0 + 4, py0 + 4), (px1 - 22, py0 + 4), (px0 + 4, py1 - 22), (px1 - 22, py1 - 22)):
        for i in range(4):
            c.rect(x + i * 4, y, x + i * 4 + 2, y + 18, '#3f6b48') if i % 2 == 0 else c.rect(x, y + i * 4, x + 18, y + i * 4 + 2, '#3f6b48')
    # far mountains and mist
    ix0, ix1 = px0 + 12, px1 - 12
    for x in range(ix0, ix1):
        h = 84 + 10 * math.sin(x * 0.03) + 6 * math.sin(x * 0.081 + 1)
        for y in range(int(h), 110):
            c.px[y][x] = mix(c.px[y][x], '#9db08f', 0.35)
    for y in range(104, 116):
        for x in range(ix0, ix1):
            if (x + y) % 3:
                c.px[y][x] = mix(c.px[y][x], '#efe0bd', 0.6)
    # water band
    for y in range(116, 128):
        for x in range(ix0, ix1):
            if (y % 3 == 0 and (x // 6) % 3) or (x * 3 + y) % 11 == 0:
                c.px[y][x] = mix(c.px[y][x], '#8fa9a0', 0.45)
    # green hills (left) with pines and the pagoda
    for x in range(ix0, 230):
        h = 96 + 22 * ((x - ix0) / 200) ** 1.5 + 4 * math.sin(x * 0.09)
        for y in range(int(h), 150):
            c.px[y][x] = mix('#5f8a5a', '#3f6b48', ((y - h) / 60))
        c.set(x, int(h), '#2f5338')
    for px, ground, h in ((70, 104, 26), (92, 100, 30), (120, 106, 22), (54, 112, 20)):
        pine(c, px, ground, h, ('#2f5338', '#3f6b48', '#5f8a5a'))
    # pagoda
    bx = 108
    for i, (w, y) in enumerate(((30, 62), (26, 72), (22, 82), (18, 92))):
        c.rect(bx - w // 2, y, bx + w // 2, y + 3, '#3a5f45')
        c.rect(bx - w // 2 + 3, y + 3, bx + w // 2 - 3, y + 10, '#c7a774')
        c.rect(bx - w // 2 - 3, y, bx - w // 2, y + 1, '#3a5f45')
        c.rect(bx + w // 2, y, bx + w // 2 + 3, y + 1, '#3a5f45')
    c.rect(bx - 1, 46, bx + 1, 62, '#3a5f45')
    # foreground: rolling green bank and cherry trees
    for x in range(ix0, ix1):
        h = 150 + 10 * math.sin(x * 0.04 + 0.5) + 4 * math.sin(x * 0.13)
        for y in range(int(h), py1 - 12):
            c.px[y][x] = mix('#6f9a63', '#3f6b48', min(1, (y - h) / 30))
        c.set(x, int(h), '#2f5338')
        c.set(x, int(h) + 1, '#2f5338')
    for tx, ty, r in ((150, 150, 26), (226, 124, 16), (262, 128, 14), (300, 134, 18), (190, 132, 12)):
        c.line(tx, ty + r, tx - 6, ty - 4, '#3a2a24')
        c.line(tx, ty + r, tx + 10, ty - 6, '#3a2a24')
        c.line(tx - 6, ty - 4, tx - 18, ty - 12, '#3a2a24')
        crown(c, rnd, tx, ty - 6, r * 0.85, ('#e2b8b8', '#efcfcc', '#f8e6e0'), light='#fbf1ea', sx=1.25)
        for _ in range(int(r * 2)):
            c.set(tx + rnd.randint(-r, r), ty + rnd.randint(-r // 2, r // 2), '#3a2a24')
    # seal
    c.rect(px1 - 40, py1 - 34, px1 - 30, py1 - 24, '#b04a3a')
    c.rect(px1 - 38, py1 - 32, px1 - 32, py1 - 26, '#d47a62')
    # rods at the left and right edges
    for rx in (6, W - 24):
        c.rect(rx, 6, rx + 18, H - 6, '#6b4a33')
        c.rect(rx + 3, 6, rx + 6, H - 6, '#8a6446')
        c.rect(rx + 2, 2, rx + 16, 8, '#3a2a20')
        c.rect(rx + 2, H - 8, rx + 16, H - 2, '#3a2a20')
    c.haze('#e8cf9e', 0.08)
    c.save(out)


SCENES = {
    'cottage': cottage,
    'sakura': sakura,
    'night': night,
    'seaside': seaside,
    'ivy': ivy_cottage,
    'autumn': autumn_village,
    'lane': village_lane,
    'scroll': scroll,
}

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    only = sys.argv[2:] or list(SCENES)
    for name in only:
        SCENES[name](os.path.join(out, f'{name}.png'))
    print(sorted(os.listdir(out)))
