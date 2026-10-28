import base64
import io
import re
from pathlib import Path

from PIL import Image

ROOT = Path(r"C:\Users\44186\Documents\deepseek-harness\default-workspace\art-direction\preview")
SRC = ROOT / "index.html"
OUT = ROOT / "BUBBLE-VANGUARD-UI-PREVIEW.html"

html = SRC.read_text(encoding="utf-8")
css = (ROOT / "style.css").read_text(encoding="utf-8")
js = (ROOT / "preview.js").read_text(encoding="utf-8")

image_cache = {}

def data_uri(rel_path: str) -> str:
    full = (ROOT / rel_path).resolve()
    key = str(full)
    if key in image_cache:
        return image_cache[key]
    im = Image.open(full)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (7, 27, 28))
        bg.paste(im, mask=im.getchannel("A"))
        im = bg
    else:
        im = im.convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90, optimize=True, progressive=True)
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    image_cache[key] = uri
    return uri

def repl_src(match):
    return 'src="' + data_uri(match.group(1)) + '"'

html = re.sub(r'src="(\.\./[^"]+)"', repl_src, html)
html = re.sub(r"url\('(\.\./[^']+)'\)", lambda m: "url('" + data_uri(m.group(1)) + "')", html)

html = re.sub(
    r'<link rel="stylesheet" href="style\.css[^"]*">',
    "<style>\n" + css + "\n</style>",
    html,
)
html = re.sub(r'<script src="preview\.js[^"]*"></script>', lambda m: "<script>\n" + js + "\n</script>", html)
html = html.replace("</head>", "<!-- Single-file local preview. All CSS, JS and images are embedded; no network required. -->\n</head>")

OUT.write_text(html, encoding="utf-8")
print(f"{OUT}\nbytes {OUT.stat().st_size}\nimages {len(image_cache)}")
