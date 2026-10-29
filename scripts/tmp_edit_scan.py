# -*- coding: utf-8 -*-
"""扫描 22 章：句长分布、章首章末、重复语、可合并短句串、段落重复。只读。"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CH = ROOT / "content" / "chapters"
OUT = ROOT / "tmp_scan.json"

SENT_END = "。！？…"
def is_cjk(ch):
    return "\u4e00" <= ch <= "\u9fff"

def han(s):
    return sum(1 for c in s if is_cjk(c))

def body_lines(text):
    lines = text.split("\n")
    if lines and lines[0].strip() == "---":
        for i in range(1, len(lines)):
            if lines[i].strip() == "---":
                return lines, i + 1
    return lines, 0

rows = []
dup_report = []
all_paras = {}

for f in sorted(CH.glob("*.md")):
    raw = f.read_text(encoding="utf-8")
    lines, start = body_lines(raw)
    body = lines[start:]
    paras = [ln.strip() for ln in body if ln.strip()]
    all_paras[f.name] = paras
    text = "".join(paras)
    n = han(text)
    sents = [s for s in re.split("[" + SENT_END + "]", text) if han(s) > 0]
    mean_len = round(n / len(sents), 1) if sents else 0
    sp = [p for p in paras if len(p) <= 25]
    ratio = round(100 * len(sp) / len(paras), 1) if paras else 0
    # 短句串：叙述行（不含引号）连续 >=3 句且每句 <=12 汉字
    runs = []
    run = []
    for ln in body:
        s = ln.strip()
        if not s:
            continue
        if "「" in s or "「" in s:
            run = []
            continue
        parts = [p for p in re.split("(?<=[" + SENT_END + "])", s) if han(p) > 0]
        ok = all(han(p) <= 12 for p in parts) and len(parts) >= 1
        if ok:
            run.append(s)
            if len(run) >= 3:
                runs.append(list(run))
        else:
            run = []
    uniq_runs = []
    seen = set()
    for r in runs:
        k = "|".join(r)
        if k not in seen:
            seen.add(k)
            uniq_runs.append(r)
    rows.append({
        "ch": f.stem,
        "han": n,
        "sents": len(sents),
        "mean_sent": mean_len,
        "paras": len(paras),
        "short_para_pct": ratio,
        "open": paras[:2],
        "end": paras[-3:],
        "runs": uniq_runs[:8],
        "pao": text.count("破折号"),
        "nzd": text.count("你怎么知道"),
        "tsy": text.count("她说"),
        "tshuo": text.count("他说"),
        "hxq": text.count("忽然想起"),
        "huran": text.count("忽然"),
    })

# 段落重复（跨章 + 章内）
seen = {}
for ch, paras in all_paras.items():
    for i, p in enumerate(paras):
        if len(p) < 20:
            continue
        key = p
        if key in seen:
            dup_report.append({"para": p, "a": seen[key], "b": [ch, i]})
        else:
            seen[key] = [ch, i]

data = {"rows": rows, "dups": dup_report}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")

tot = sum(r["han"] for r in rows)
tot_s = sum(r["sents"] for r in rows)
print("chapters", len(rows), "han", tot, "mean_sent", round(tot / tot_s, 2))
print("ch  han  mean sents short% | nzd tsy tshuo hxq huran")
for r in rows:
    print("%s %5d %5.1f %4d %5.1f | %2d %3d %4d %2d %3d" % (
        r["ch"], r["han"], r["mean_sent"], r["sents"], r["short_para_pct"],
        r["nzd"], r["tsy"], r["tshuo"], r["hxq"], r["huran"]))
print("dups:", len(dup_report))
for d in dup_report:
    print(" DUP", d["a"], d["b"], d["para"][:40])
