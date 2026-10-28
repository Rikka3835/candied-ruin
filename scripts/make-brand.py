# 生成社交分享卡（OG）与站点图标
# 用法：python make-brand.py
import os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.normpath(os.path.join(HERE, "..", "public"))
ART = os.path.join(PUBLIC, "new", "assets", "art", "gate-hall.jpg")
OUT = os.path.join(PUBLIC, "assets", "brand")
FONT_SERIF = r"C:\Windows\Fonts\NotoSerifSC-VF.ttf"
FONT_UI = r"C:\Windows\Fonts\NotoSansSC-VF.ttf"

INK = (9, 8, 18)
HONEY = (255, 217, 160)
GOLD = (255, 179, 71)
EMBER = (255, 240, 194)
TEXT = (241, 234, 219)
DIM = (217, 205, 186)


def tracked(draw, xy, text, font, fill, tracking=0, anchor_top=True):
    """逐字画，模拟 letter-spacing。"""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return x


def cover(im, w, h, focus_x=0.5, focus_y=0.5):
    scale = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    left = round((im.width - w) * focus_x)
    top = round((im.height - h) * focus_y)
    return im.crop((left, top, left + w, top + h))


def make_og():
    W, H = 1200, 630
    art = cover(Image.open(ART).convert("RGB"), W, H, 0.52, 0.5)
    art = ImageEnhance.Brightness(art).enhance(0.92)
    art = ImageEnhance.Contrast(art).enhance(1.04)

    # 左压暗（给字）+ 上下收边
    shade = Image.new("L", (W, H), 0)
    px = shade.load()
    for x in range(W):
        t = x / (W - 1)
        v = 0.95 if t < 0.1 else max(0.0, 0.95 - (t - 0.1) / 0.55 * 0.95)
        for y in range(H):
            px[x, y] = int(255 * min(1.0, v))
    dark = Image.new("RGB", (W, H), INK)
    img = Image.composite(dark, art, shade)

    veil = Image.new("L", (W, H), 0)
    vp = veil.load()
    for y in range(H):
        t = y / (H - 1)
        if t < 0.30:
            a = 0.58 * (1 - t / 0.30)
        elif t > 0.66:
            a = 0.58 * ((t - 0.66) / 0.34) ** 1.4
        else:
            a = 0.0
        for x in range(W):
            vp[x, y] = int(255 * a)
    img = Image.composite(Image.new("RGB", (W, H), INK), img, veil)

    d = ImageDraw.Draw(img, "RGBA")
    track = ImageDraw.Draw(img)

    f_en = ImageFontCache(FONT_UI, 26)
    f_title = ImageFontCache(FONT_SERIF, 128)
    f_sub = ImageFontCache(FONT_SERIF, 30)

    x0 = 92
    # 眉标
    d.ellipse((x0, 168, x0 + 7, 175), fill=GOLD)
    tracked(d, (x0 + 20, 155), "地 下 城 · 冒 险 · 异 世 界 轻 小 说".replace(" ", ""),
            f_en.get(), (217, 205, 186, 235), tracking=7)

    # 英文名
    tracked(d, (x0, 208), "CANDIED RUIN", f_en.get(), (255, 217, 160, 235), tracking=13)

    # 中文主标题：糖渍 + 旧蜜（琥珀）
    y = 262
    x = tracked(d, (x0, y), "糖渍", f_title.get(), (255, 246, 233, 255), tracking=6)
    tracked(d, (x + 14, y), "旧蜜", f_title.get(), (255, 196, 120, 255), tracking=6)

    # 细线
    d.rectangle((x0, 452, x0 + 168, 453), fill=(255, 179, 71, 90))

    # 副标题
    tracked(d, (x0, 486), "人类把糖做成泡，把泡当武器。", f_sub.get(), (217, 205, 186, 230), tracking=2)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "og.jpg")
    img.save(path, "JPEG", quality=88, optimize=True, progressive=True)
    print("og", path, img.size, round(os.path.getsize(path) / 1024), "KB")


_FONT_CACHE = {}


class ImageFontCache:
    def __init__(self, path, size):
        self.path = path
        self.size = size

    def get(self):
        key = (self.path, self.size)
        if key not in _FONT_CACHE:
            from PIL import ImageFont
            _FONT_CACHE[key] = ImageFont.truetype(self.path, self.size)
        return _FONT_CACHE[key]


def radial(size, inner, outer):
    """粗糙但够用的径向渐变圆。"""
    im = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(im)
    steps = size // 2
    for i in range(steps, 0, -1):
        t = i / steps
        col = tuple(round(inner[c] * (1 - t) + outer[c] * t) for c in range(3))
        d.ellipse((size / 2 - i, size / 2 - i, size / 2 + i, size / 2 + i), fill=col)
    return im


def make_icon(px):
    S = px * 4
    cx, cy = S * 0.5, S * 0.5

    # 底：深墨，中心带一点暖
    base = Image.new("RGB", (S, S), (7, 6, 15))
    bd = ImageDraw.Draw(base)
    steps = max(8, S // 8)
    for i in range(steps, 0, -1):
        t = i / steps
        col = (round(14 * (1 - t) + 7 * t), round(11 * (1 - t) + 6 * t), round(34 * (1 - t) + 15 * t))
        r = S * 0.52 * t
        bd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=col)
    icon = base.convert("RGBA")

    # 泡后的暖光
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gr = S * 0.40
    gd.ellipse((cx - gr, cy - gr, cx + gr, cy + gr), fill=(255, 150, 50, 120))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.075))
    icon = Image.alpha_composite(icon, glow)

    # 糖泡本体：琥珀玻璃珠 —— 先铺满球体，再加一团偏左上的高光和一圈暗边
    b = int(S * 0.60)
    half = b / 2
    bubble = Image.new("RGB", (b, b), (0, 0, 0))
    pd = ImageDraw.Draw(bubble)
    steps = b // 2
    for i in range(steps, 0, -1):
        t = i / steps
        col = (
            round(255 * (1 - t) + 96 * t),
            round(186 * (1 - t) + 52 * t),
            round(92 * (1 - t) + 10 * t),
        )
        pd.ellipse((half - i, half - i, half + i, half + i), fill=col)
    # 左上高光团
    hi = Image.new("RGBA", (b, b), (0, 0, 0, 0))
    hd2 = ImageDraw.Draw(hi)
    hr2 = b * 0.30
    hd2.ellipse((b * 0.33 - hr2, b * 0.28 - hr2, b * 0.33 + hr2, b * 0.28 + hr2),
                fill=(255, 243, 214, 210))
    hi = hi.filter(ImageFilter.GaussianBlur(b * 0.075))
    bubble = Image.alpha_composite(bubble.convert("RGBA"), hi).convert("RGB")
    # 边缘收暗：越靠外越沉，泡才有厚度
    depth = Image.new("L", (b, b), 0)
    dd = ImageDraw.Draw(depth)
    for i in range(steps, 0, -1):
        t = i / steps
        dd.ellipse((half - i, half - i, half + i, half + i), fill=int(255 * (t ** 2.4) * 0.92))
    bubble = Image.composite(Image.new("RGB", (b, b), (46, 24, 6)), bubble, depth)
    # 边缘亮线
    rim = Image.new("RGBA", (b, b), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    rd.ellipse((0, 0, b - 1, b - 1), outline=(255, 198, 128, 190), width=max(2, b // 110))
    bmask = Image.new("L", (b, b), 0)
    ImageDraw.Draw(bmask).ellipse((0, 0, b - 1, b - 1), fill=255)
    bubble_rgba = Image.alpha_composite(bubble.convert("RGBA"), rim)
    icon.paste(bubble_rgba, (int(cx - half), int(cy - half)), bmask)

    # 十字爆裂：四角尖的菱形臂（比泡小一圈，别盖住球）
    arm = S * 0.28
    th = S * 0.019
    cross = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cross)
    cd.polygon([(cx - arm, cy), (cx, cy - th), (cx + arm, cy), (cx, cy + th)], fill=(255, 246, 220, 225))
    cd.polygon([(cx, cy - arm), (cx + th, cy), (cx, cy + arm), (cx - th, cy)], fill=(255, 246, 220, 225))
    glow2 = cross.filter(ImageFilter.GaussianBlur(S * 0.018))
    icon = Image.alpha_composite(icon, glow2)
    icon = Image.alpha_composite(icon, cross)

    # 高光点
    hd = ImageDraw.Draw(icon)
    hr = S * 0.045
    hx, hy = cx - b * 0.16, cy - b * 0.20
    hd.ellipse((hx - hr, hy - hr, hx + hr, hy + hr), fill=(255, 252, 244, 245))

    return icon.resize((px, px), Image.LANCZOS)


def make_icons():
    os.makedirs(OUT, exist_ok=True)
    for px in (512, 192, 180, 32):
        im = make_icon(px)
        if px in (180, 192):
            im = im.convert("RGB")  # apple-touch 不吃透明
        path = os.path.join(OUT, f"icon-{px}.png")
        im.save(path, "PNG", optimize=True)
        print("icon", path, im.size, round(os.path.getsize(path) / 1024), "KB")


if __name__ == "__main__":
    make_og()
    make_icons()
