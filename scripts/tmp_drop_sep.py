# -*- coding: utf-8 -*-
import re
from pathlib import Path

for n in ('006', '007', '008', '009'):
    p = Path(f'content/chapters/{n}.md')
    t = p.read_text(encoding='utf-8')
    parts = t.split('---', 2)          # ['', front, body]
    body = parts[2]
    # 删除正文里的场景分隔行（独占一行的 ---），替换成空行
    lines = []
    removed = 0
    for ln in body.split('\n'):
        if ln.strip() == '---':
            removed += 1
            lines.append('')
            continue
        lines.append(ln)
    nb = '\n'.join(lines)
    nb = re.sub(r'\n{3,}', '\n\n', nb)
    p.write_text(parts[0] + '---' + parts[1] + '---' + nb, encoding='utf-8')
    print(n, 'removed', removed)
