#!/usr/bin/env python3
"""
Render the skillsight animated logo mark.

Everything is drawn on a 32x32 logical pixel grid and upscaled by exact integer
multiples with nearest-neighbour, so every edge stays hard at every size. The
palette is fixed at four colours, which keeps the GIFs tiny.

The loop: SKILL tickers in a letter at a time, SIGHT hard-cuts letter by letter,
then red, white and black slide in and down as stingers before it repeats. Every
frame is held for exactly FRAME_MS.

    python3 .github/logo/mark.py

Outputs (alongside this script):
    mark-64.gif    64x64  animated  — the small mark
    mark-256.gif   256x256 animated — for a blog body
    mark-256.png   256x256 static   — the resting S, for favicon / og:image
"""

from pathlib import Path

from PIL import Image

# --- palette -----------------------------------------------------------------
# Brand red is theme.accent from src/render/ink/theme.ts — the same red used for
# +N counts, the cursor and the active tab in the dashboard.
FIELD, TYPE, BRAND, SHADOW = 0, 1, 2, 3
PALETTE = [
    0x0D, 0x0D, 0x0D,  # 0 field
    0xFF, 0xFF, 0xFF,  # 1 type
    0xB7, 0x1C, 0x1C,  # 2 brand
    0x5C, 0x0E, 0x0E,  # 3 shadow
]

GRID = 32

# One duration for every frame in the loop. build_frames() returns bare grids
# and this gets applied uniformly at the end, so no beat can drift faster than
# any other — mixed durations made the animation visibly lurch.
FRAME_MS = 250

TICKER_WORD = "SKILL"           # slides in, a letter at a time
FLASH_WORD = "SIGHT"            # hard cuts, one frame a letter
STINGERS = (BRAND, TYPE, FIELD)  # red, white, black — each slides in and down
PAN_STEPS = 2                   # intermediate frames per letter slide
WIPE_STEPS = 3                  # intermediate frames per stinger

# --- 18x19 display face ------------------------------------------------------
# Hand-drawn so stroke weight (4px stems, 3px bars) and the angled terminals sit
# properly on the grid. The angles echo the ANSI Shadow wordmark's bevel without
# trying to reproduce it.
BIG = {
    "S": [
        "..XXXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXXXXX.",
        "XXXXXXXXXXXXXXXXXX",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXXXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXXXXX.",
        "..XXXXXXXXXXXXXXXX",
        "..............XXXX",
        "..............XXXX",
        "..............XXXX",
        "..............XXXX",
        "..............XXXX",
        "XXXXXXXXXXXXXXXXXX",
        ".XXXXXXXXXXXXXXXX.",
        "..XXXXXXXXXXXXXX..",
    ],
    "K": [
        "XXXX..........XXXX",
        "XXXX.........XXXX.",
        "XXXX........XXXX..",
        "XXXX.......XXXX...",
        "XXXX......XXXX....",
        "XXXX.....XXXX.....",
        "XXXX....XXXX......",
        "XXXX...XXXX.......",
        "XXXX..XXXX........",
        "XXXXXXXX..........",
        "XXXX..XXXX........",
        "XXXX...XXXX.......",
        "XXXX....XXXX......",
        "XXXX.....XXXX.....",
        "XXXX......XXXX....",
        "XXXX.......XXXX...",
        "XXXX........XXXX..",
        "XXXX.........XXXX.",
        "XXXX..........XXXX",
    ],
    "I": [
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
    ],
    "L": [
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
    ],
    "G": [
        "..XXXXXXXXXXXXXX..",
        ".XXXXXXXXXXXXXXXX.",
        "XXXXXXXXXXXXXXXXXX",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX..............",
        "XXXX.......XXXXXXX",
        "XXXX.......XXXXXXX",
        "XXXX.......XXXXXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXXXXXXXXXXXXXXXX",
        ".XXXXXXXXXXXXXXXX.",
        "..XXXXXXXXXXXXXX..",
    ],
    "H": [
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
        "XXXX..........XXXX",
    ],
    "T": [
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXX",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
        ".......XXXX.......",
    ],
}

# Every glyph must share a bounding box, or the hard cuts would jitter as
# letters change size.
_dims = {(len(rows[0]), len(rows)) for rows in BIG.values()}
assert len(_dims) == 1, f"display glyphs disagree on size: {_dims}"
assert all(len(set(map(len, rows))) == 1 for rows in BIG.values()), "ragged glyph"
assert set(TICKER_WORD + FLASH_WORD) <= set(BIG), "word uses an undrawn glyph"
BIG_W, BIG_H = _dims.pop()

BIG_OFF = 2                                      # drop-shadow offset, +x +y
BIG_X = (GRID - (BIG_W + BIG_OFF)) // 2
BIG_Y = (GRID - (BIG_H + BIG_OFF)) // 2


# --- drawing primitives ------------------------------------------------------
def blank():
    """A fresh field-coloured grid."""
    return [[FIELD] * GRID for _ in range(GRID)]


def stamp(grid, rows, x, y, colour):
    """Blit an ASCII bitmap, skipping '.' cells and anything off-grid."""
    for dy, row in enumerate(rows):
        py = y + dy
        for dx, cell in enumerate(row):
            if cell != "X":
                continue
            px = x + dx
            if 0 <= px < GRID and 0 <= py < GRID:
                grid[py][px] = colour


def big(grid, ch, colour=BRAND, shadow=SHADOW, x=None):
    x = BIG_X if x is None else x
    if shadow is not None:
        stamp(grid, BIG[ch], x + BIG_OFF, BIG_Y + BIG_OFF, shadow)
    stamp(grid, BIG[ch], x, BIG_Y, colour)


def big_frame(ch):
    g = blank()
    big(g, ch)
    return g


# --- motion ------------------------------------------------------------------
def pan(out_ch, in_ch, steps):
    """Slide out_ch off to the left as in_ch enters from the right.

    Letters sit one full grid-width apart, so exactly one is in frame at rest.
    Returns only the intermediate frames — the letters either side are ordinary
    display frames. out_ch may be None for the first letter of the loop.
    """
    frames = []
    for i in range(1, steps + 1):
        p = round(GRID * i / (steps + 1))
        g = blank()
        if out_ch is not None:
            big(g, out_ch, x=BIG_X - p)
        big(g, in_ch, x=BIG_X + GRID - p)
        frames.append(g)
    return frames


def wipe_down(prev, colour, steps):
    """Slide a flat colour in from the top, pushing down over `prev`.

    The last frame is the colour edge-to-edge, so wipes chain: each stinger
    wipes over whatever the previous one left behind.
    """
    frames = []
    for i in range(1, steps + 1):
        edge = round(GRID * i / steps)
        g = [row[:] for row in prev]
        for y in range(edge):
            g[y] = [colour] * GRID
        frames.append(g)
    return frames


# --- the loop ----------------------------------------------------------------
def build_frames():
    """Return [(grid, duration_ms), ...] for one full loop.

    The body builds bare grids and FRAME_MS is applied to all of them at the
    end, so every beat runs at the same speed by construction.
    """
    grids = []

    # 1. SKILL tickers in — each letter slides in from the right and settles.
    # The doubled L needs the pan anyway: two identical adjacent frames get
    # merged by GIF optimisation, which would drop one L outright.
    prev = None
    for ch in TICKER_WORD:
        grids.extend(pan(prev, ch, PAN_STEPS))
        grids.append(big_frame(ch))
        prev = ch

    # 2. SIGHT hard-cuts, one frame a letter — no motion, straight swaps
    for ch in FLASH_WORD:
        grids.append(big_frame(ch))

    # 3. stingers — red, white then black slide in and down over what is there.
    # Black lands on the field colour, which is what resets the loop.
    for colour in STINGERS:
        grids.extend(wipe_down(grids[-1], colour, WIPE_STEPS))

    return [(g, FRAME_MS) for g in grids]


# --- output ------------------------------------------------------------------
def to_image(grid, scale):
    img = Image.new("P", (GRID, GRID))
    img.putpalette(PALETTE + [0] * (768 - len(PALETTE)))
    img.putdata([px for row in grid for px in row])
    if scale == 1:
        return img
    return img.resize((GRID * scale, GRID * scale), Image.NEAREST)


def write_gif(path, frames, scale):
    # GIF stores frame delays in centiseconds, so anything not a multiple of
    # 10ms is silently truncated on write (55 -> 50). Keep source and output
    # honest by refusing durations the format cannot represent.
    odd = [ms for _, ms in frames if ms % 10]
    if odd:
        raise ValueError(f"durations must be multiples of 10ms, got {odd}")

    # Identical neighbours get merged by the optimiser into one longer frame,
    # silently changing the timing. Doubled letters are the usual culprit.
    same = [i for i in range(1, len(frames))
            if frames[i][0] == frames[i - 1][0]]
    if same:
        raise ValueError(f"frames identical to their predecessor: {same}")

    images = [to_image(g, scale) for g, _ in frames]
    images[0].save(
        path,
        save_all=True,
        append_images=images[1:],
        duration=[ms for _, ms in frames],
        loop=0,
        disposal=1,
        # Verified pixel-exact against the source frames, and much smaller —
        # the frames share a palette and differ little.
        optimize=True,
    )


def main():
    out = Path(__file__).parent
    frames = build_frames()

    write_gif(out / "mark-64.gif", frames, 2)
    write_gif(out / "mark-256.gif", frames, 8)

    to_image(big_frame("S"), 8).save(out / "mark-256.png")

    total = sum(ms for _, ms in frames)
    print(f"{len(frames)} frames, {total / 1000:.1f}s loop")
    for name in ("mark-64.gif", "mark-256.gif", "mark-256.png"):
        print(f"  {name:<14} {(out / name).stat().st_size / 1024:6.1f} KB")


if __name__ == "__main__":
    main()
