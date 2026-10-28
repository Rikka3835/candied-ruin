# 提取"标题级"用字（h1/h2/h3/nav/brand/按钮/页脚），用于给 700 字重做极小字体子集。
# 用法：python scripts/make-head-chars.py  → 生成 scripts/_head-chars.txt
import re, io, glob

chars = set()
for f in glob.glob('public/**/*.html', recursive=True):
    norm = f.replace(chr(92), '/')
    if '/demo/' in norm:
        continue
    s = io.open(f, encoding='utf-8', errors='ignore').read()
    for m in re.finditer(r'<(h1|h2|h3|a|button|span|p)[^>]*>(.*?)</\1>', s, re.S):
        txt = re.sub(r'<[^>]+>', '', m.group(2))
        chars.update(txt)

chars.update('糖渍旧蜜小说人物档案游戏世界地图卷章连载准备中正文尚未开始去目录看看第一章还没有发布更新回到门前异世界轻人类把做成泡当武器在最深的那层他们不只是为挖宝·—…、。，《》「」：；！？（）【】0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz -')
chars = {c for c in chars if c.strip() and ord(c) > 31}
text = ''.join(sorted(chars))
io.open('scripts/_head-chars.txt', 'w', encoding='utf-8').write(text)
print('heading chars:', len(text))
print(text[:160])
