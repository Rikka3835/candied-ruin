# 单章分享卡（OG）：public/assets/og/ch-NN.jpg
# 用法：python scripts/make-chapter-cards.py
#
# 为什么单独做：/novel/12/ 这类章页分享到聊天软件时要有图。22 张图共用一个模板，
# 排版语言照抄品牌卡 make-brand.py（左压暗、金色眉标、宋体大标题），
# 只是把「书名」换成「章名」，并按卷换背景图，避免一章一张同款封面。
#
# 注意：字体用系统里的 NotoSerifSC-VF.ttf（与站点自托管字体同族），
#       不要换成 msyh，否则字形与站内不一致。
import json
import os
from PIL import Image, ImageDraw, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, ".."))
PUBLIC = os.path.join(ROOT, "public")
ART_DIR = os.path.join(PUBLIC, "new", "assets", "art")
OUT = os.path.join(PUBLIC, "assets", "og")
IDX = os.path.join(PUBLIC, "novel", "ch", "index.json")

FONT_SERIF = r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"
FONT_UI = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"

INK = (9, 8, 18)
GOLD = (255, 179, 71)
HONEY = (255, 217, 160)
TEXT = (246, 240, 231)
DIM = (206, 195, 180)

W, H = 1200, 630
X0 = 88

# 卷 → 背景图（按卷首次出现顺序取；不够就轮流用）
VOL_ART = ["town-hero-1600.jpg", "gate-hall.jpg", "enter-1920.jpg"]

_FONTS = {}


def font(path, size):
    key = (path, size)
    if key not in _FONTS:
        from PIL import ImageFont
        _FONTS[key] = ImageFont.truetype(path, size)
    return _FONTS[key]


def tracked(d, xy, text, f, fill, tracking=0):
    """逐字画，模拟 letter-spacing（PIL 没有这个参数）。"""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + tracking
    return x


def tracked_width(text, f, tracking=0):
    return sum(f.getlength(ch) for ch in text) + tracking * max(0, len(text) - 1)


def cover(im, w, h, focus_x=0.5, focus_y=0.5):
    scale = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left = round((im.width - w) * focus_x)
    top = round((im.height - h) * focus_y)
    return im.crop((left, top, left + w, top + h))


def shade_left(img):
    """左侧压暗给字让位置，右边保留画面。"""
    mask = Image.new("L", (W, H), 0)
    px = mask.load()
    for x in range(W):
        t = x / (W - 1)
        v = 0.94 if t < 0.12 else max(0.0, 0.94 - (t - 0.12) / 0.52 * 0.94)
        col = int(255 * min(1.0, v))
        for y in range(H):
            px[x, y] = col
    return Image.composite(Image.new("RGB", (W, H), INK), img, mask)


def shade_edges(img):
    veil = Image.new("L", (W, H), 0)
    vp = veil.load()
    for y in range(H):
        t = y / (H - 1)
        if t < 0.26:
            a = 0.52 * (1 - t / 0.26)
        elif t > 0.72:
            a = 0.52 * ((t - 0.72) / 0.28) ** 1.3
        else:
            a = 0.0
        col = int(255 * a)
        for x in range(W):
            vp[x, y] = col
    return Image.composite(Image.new("RGB", (W, H), INK), img, veil)


def card_bg(art_name):
    art = cover(Image.open(os.path.join(ART_DIR, art_name)).convert("RGB"), W, H, 0.56, 0.5)
    art = ImageEnhance.Brightness(art).enhance(0.9)
    art = ImageEnhance.Contrast(art).enhance(1.05)
    return shade_edges(shade_left(art))


def draw_card(bg, vol_text, ch_no, title, chars, minutes):
    img = bg.copy()
    d = ImageDraw.Draw(img, "RGBA")

    f_meta = font(FONT_UI, 24)
    f_en = font(FONT_UI, 23)

    # 标题：按可用宽度收缩，长标题不撞边、短标题不显小
    avail = W - X0 - 96
    size = 98
    while size > 58:
        f_title = font(FONT_SERIF, size)
        if tracked_width(title, f_title, 4) <= avail:
            break
        size -= 4
    f_title = font(FONT_SERIF, size)

    # 竖向：整块居中（眉标 → 英文 → 标题 → 线 → 计数）
    title_h = size * 1.32
    block_h = 34 + 44 + title_h + 56 + 40
    y = (H - block_h) / 2 - 6

    # 眉标：金色小菱形 + 卷名
    d.ellipse((X0 + 1, y + 10, X0 + 8, y + 17), fill=GOLD)
    tracked(d, (X0 + 20, y - 2), vol_text, f_meta, DIM + (235,), tracking=6)
    y += 44

    tracked(d, (X0, y), "CHAPTER %02d" % ch_no, f_en, HONEY + (225,), tracking=9)
    y += 44

    tracked(d, (X0, y - size * 0.16), title, f_title, TEXT + (255,), tracking=4)
    y += title_h

    d.rectangle((X0, y, X0 + 132, y + 1), fill=GOLD + (95,))
    y += 40

    tracked(d, (X0, y), "第 %d 章 · %s 字 · 约 %d 分钟" % (ch_no, format(chars, ","), minutes),
            f_meta, DIM + (215,), tracking=3)

    return img


def main():
    idx = json.load(open(IDX, encoding="utf-8"))
    chapters = sorted(idx["chapters"], key=lambda c: c["n"])
    vols = []
    for c in chapters:
        if c["vol"] not in vols:
            vols.append(c["vol"])

    os.makedirs(OUT, exist_ok=True)
    bgs = {}
    made = []
    for c in chapters:
        vi = vols.index(c["vol"])
        art = VOL_ART[vi % len(VOL_ART)]
        if art not in bgs:
            bgs[art] = card_bg(art)
        short = c["vol"].split("·")[0].strip()
        img = draw_card(bgs[art], short, c["n"], c["title"], c.get("chars", 0), c.get("minutes", 0))
        name = "ch-%02d.jpg" % c["n"]
        path = os.path.join(OUT, name)
        img.save(path, "JPEG", quality=82, optimize=True, progressive=True)
        made.append((name, round(os.path.getsize(path) / 1024)))

    total = sum(k for _, k in made)
    print("cards=%d total=%dKB avg=%dKB" % (len(made), total, total / len(made)))
    print("sample: " + ", ".join("%s %dKB" % m for m in made[:4]))


if __name__ == "__main__":
    main()
