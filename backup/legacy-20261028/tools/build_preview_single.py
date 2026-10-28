import base64, json, re
from pathlib import Path

root = Path(r"C:\Users\44186\Documents\deepseek-harness\default-workspace\bubble-vanguard-app\preview-1-1")
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "style.css").read_text(encoding="utf-8")
js = (root / "game.js").read_text(encoding="utf-8")

pairs = re.findall(r"^\s*(\w+): '(assets/[^']+)'", js, re.M)
assets = {}
for key, rel in pairs:
    data = (root / rel).read_bytes()
    assets[key] = "data:image/png;base64," + base64.b64encode(data).decode("ascii")

html = re.sub(r'\s*<link rel="stylesheet" href="style\.css[^"]*">', "", html)
html = re.sub(
    r'\s*<script src="game\.js[^"]*"></script>',
    "\n  <script>window.__PREVIEW_ASSETS__=" + json.dumps(assets, ensure_ascii=False) + ";</script>\n"
    "  <script>\n" + js.replace("</script>", "<\\/script>") + "\n  </script>",
    html,
)
html = html.replace("</head>", "  <style>\n" + css + "\n  </style>\n</head>")
out = root / "BUBBLE-VANGUARD-1-1.html"
out.write_text(html, encoding="utf-8")
print(out)
print("assets", len(assets), "bytes", out.stat().st_size)
