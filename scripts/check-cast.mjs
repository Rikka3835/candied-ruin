// 人物卡与正文的一致性检查：谁在正文里出场了却没建档、谁建了档却从没登场。
// 用法：node scripts/check-cast.mjs          普通检查（有缺失也返回 0，只报警）
//       node scripts/check-cast.mjs --strict 严格模式（有未建档人物则退出码 1）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CH_DIR = path.join(ROOT, 'content', 'chapters');
const CHARS = path.join(ROOT, 'docs', 'characters.md');
const REPORT = path.join(ROOT, 'docs', 'cast-pending.md');
const strict = process.argv.includes('--strict');

/* ---------- 1. 建档：docs/characters.md 的 ### 标题 ---------- */
const md = fs.readFileSync(CHARS, 'utf8').replace(/\r\n/g, '\n');
const documented = [];
for (const line of md.split('\n')) {
  const m = line.match(/^###\s+(.+?)\s*$/);
  if (!m) continue;
  const full = m[1];
  const aliases = new Set([full]);
  const inner = full.match(/^(.+?)（(.+?)）$/);
  if (inner) {
    aliases.add(inner[1].trim()); // 塞德里克
    aliases.add(inner[2].trim()); // 老塞
  }
  documented.push({ full, aliases });
}
const aliasTo = new Map();
for (const d of documented) for (const a of d.aliases) aliasTo.set(a, d.full);

// 正文里常写简称（「柯林」对「柯林·维尔」），按包含关系认人；与 gallery.js 的 hit() 同口径。
const resolve = (raw) => {
  if (aliasTo.has(raw)) return aliasTo.get(raw);
  for (const d of documented) {
    for (const a of d.aliases) if (a.includes(raw) || raw.includes(a)) return d.full;
  }
  return null;
};

/* ---------- 2. 正文：每章 front-matter 的 出场 ---------- */
const files = fs.readdirSync(CH_DIR).filter((f) => f.endsWith('.md')).sort();
const chapters = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(CH_DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;
  const fields = {};
  for (const line of fm[1].split('\n')) {
    const kv = line.match(/^([^:：]+)[:：]\s*(.*)$/);
    if (kv) fields[kv[1].trim()] = kv[2].trim();
  }
  const names = (fields['出场'] || '').split(/[、,，/]/).map((x) => x.trim()).filter(Boolean);
  chapters.push({ n: Number(fields['章'] || 0), title: fields['标题'] || f, names, file: f });
}
chapters.sort((a, b) => a.n - b.n);

/* ---------- 3. 比对 ---------- */
const firstSeen = new Map(); // 建档名 -> 首次出场章
const unknown = new Map(); // 未建档名 -> [章]
for (const c of chapters) {
  for (const raw of c.names) {
    const full = resolve(raw);
    if (!full) {
      if (!unknown.has(raw)) unknown.set(raw, []);
      unknown.get(raw).push(c.n);
      continue;
    }
    if (!firstSeen.has(full)) firstSeen.set(full, { n: c.n, title: c.title, raw });
  }
}
const neverAppeared = documented.filter((d) => !firstSeen.has(d.full)).map((d) => d.full);

/* ---------- 4. 输出 ---------- */
const order = [...firstSeen.entries()].sort((a, b) => a[1].n - b[1].n)
  .map(([full, v], i) => `${i + 1}. ${full} — 第 ${v.n} 章《${v.title}》`);

const lines = [
  '# 人物卡 ↔ 正文 一致性（由 scripts/check-cast.mjs 生成，勿手改）',
  '',
  `生成时间：${new Date().toISOString().slice(0, 10)}　正文 ${chapters.length} 章　建档 ${documented.length} 人`,
  '',
  '## 一、正文已出场（按首次报出名字的章排序）',
  '',
  ...order,
  '',
  `## 二、未建档（正文出现但 characters.md 里没有）　共 ${unknown.size} 人`,
  '',
  ...(unknown.size
    ? [...unknown.entries()].map(([raw, ns]) => `- **${raw}** — 第 ${ns.join(' / ')} 章`)
    : ['（无）']),
  '',
  `## 三、已建档但正文尚未登场　共 ${neverAppeared.length} 人`,
  '',
  ...(neverAppeared.length ? neverAppeared.map((n) => `- ${n}`) : ['（无）']),
  '',
  '## 四、纪律',
  '',
  '- 章末 front-matter 的 `出场:` 只写**本章真正登场**的人，它决定档案页解锁谁。',
  '- 正文里第一次报出名字才算登场；只写绰号/职务（「那个老水手」）不算。',
  '- 新名字一出现，同一轮就要在 `docs/characters.md` 建 14 栏的卡，不许拖到后面补。',
  '',
];
fs.writeFileSync(REPORT, lines.join('\n'));

console.log(`[check-cast] 正文 ${chapters.length} 章 · 建档 ${documented.length} 人 · 已出场 ${firstSeen.size} 人`);
if (unknown.size) {
  console.log('[check-cast] ⚠ 未建档（正文出现但没卡）：');
  for (const [raw, ns] of unknown) console.log(`  · ${raw}（第 ${ns.join(' / ')} 章）`);
} else {
  console.log('[check-cast] ✓ 未建档：0 人');
}
if (neverAppeared.length) console.log(`[check-cast] 已建档未登场 ${neverAppeared.length} 人：${neverAppeared.join('、')}`);
console.log(`[check-cast] 报告已写入 docs/cast-pending.md`);
if (strict && unknown.size) process.exit(1);
