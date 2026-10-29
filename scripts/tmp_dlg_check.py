import subprocess, re, io, sys
from collections import Counter
from pathlib import Path

root = Path('.')
files = subprocess.run(['git','status','--porcelain','content/chapters'],capture_output=True,text=True,encoding='utf-8').stdout
names = [l.split()[-1] for l in files.strip().splitlines() if l.strip()]

def quotes(text):
    # 提取全部引号内文字
    seg = re.findall(r'「([^」]*)」', text)
    # 只比较含汉字的部分，且去掉空白
    out = []
    for s in seg:
        s = re.sub(r'\s+', '', s)
        if re.search(r'[\u4e00-\u9fff]', s or ''):
            out.append(s)
    return out

rows=[]
for n in sorted(names):
    old = subprocess.run(['git','show',f'HEAD:{n}'],capture_output=True,text=True,encoding='utf-8').stdout
    new = Path(n).read_text(encoding='utf-8')
    o, w = Counter(quotes(old)), Counter(quotes(new))
    only_old = o - w
    only_new = w - o
    han_o = len(re.findall(r'[\u4e00-\u9fff]', old))
    han_n = len(re.findall(r'[\u4e00-\u9fff]', new))
    rows.append((n, sum(o.values()), sum(w.values()), len(only_old), len(only_new), han_o, han_n,
                 list(only_old.elements())[:3], list(only_new.elements())[:3]))

print(f"{'file':28s} {'q0':>4s} {'q1':>4s} {'lost':>5s} {'added':>6s} {'han0':>5s} {'han1':>5s}")
for r in rows:
    print(f"{r[0]:28s} {r[1]:4d} {r[2]:4d} {r[3]:5d} {r[4]:6d} {r[5]:5d} {r[6]:5d}")
    if r[3] or r[4]:
        print('   lost:', r[7])
        print('   new :', r[8])
