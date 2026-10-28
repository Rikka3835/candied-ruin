#!/usr/bin/env node
/**
 * novelops-sync.mjs — 把站点章节数据同步进 NovelOps 的 truth 文件。
 *
 * 正源：content/chapters/*.md（front-matter + 正文）、public/novel/ch/index.json
 * 产物：docs/novelops/chapter_summaries.md、docs/novelops/current_state.md（标记区）
 *
 * 只写 <!-- novelops-sync:start --> 与 <!-- novelops-sync:end --> 之间，
 * 标记区外的手写内容不会被覆盖。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHAPTER_DIR = path.join(ROOT, "content", "chapters");
const INDEX = path.join(ROOT, "public", "novel", "ch", "index.json");
const STATE_DIR = path.join(ROOT, "docs", "novelops");
const START = "<!-- novelops-sync:start -->";
const END = "<!-- novelops-sync:end -->";

const read = (p) => fs.readFileSync(p, "utf8");

/** 极简 front-matter 解析：只认 `key: value` 单行。 */
function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

/** 段落统计：短段（≤12 字）占比、长段（≥60 字）数量。 */
function paragraphStats(body) {
  const paras = body
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("#") && !s.startsWith(">"));
  const lens = paras.map((p) => p.replace(/\s/g, "").length);
  if (!lens.length) return { n: 0, short: 0, long: 0, shortPct: 0 };
  const short = lens.filter((n) => n <= 12).length;
  const long = lens.filter((n) => n >= 60).length;
  return { n: lens.length, short, long, shortPct: Math.round((short / lens.length) * 100) };
}

function fillBlock(file, content) {
  let text = fs.existsSync(file) ? read(file) : `# ${path.basename(file)}\n\n${START}\n${END}\n`;
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const block = `${START}\n${content.trim()}\n${END}`;
  text = re.test(text) ? text.replace(re, block) : `${text.trimEnd()}\n\n${block}\n`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

const index = fs.existsSync(INDEX) ? JSON.parse(read(INDEX)) : { chapters: [] };
const chapters = (index.chapters || []).slice().sort((a, b) => a.n - b.n);

const rows = [];
const stateLines = [];

for (const ch of chapters) {
  const file = path.join(CHAPTER_DIR, `${String(ch.n).padStart(3, "0")}.md`);
  let meta = {};
  let stats = { n: 0, short: 0, long: 0, shortPct: 0 };
  if (fs.existsSync(file)) {
    const parsed = parseFrontMatter(read(file));
    meta = parsed.meta;
    stats = paragraphStats(parsed.body);
  }
  const cast = (ch.cast || []).join("、") || meta["出场"] || "（未标注）";
  const beats = (meta["本章"] || "").trim();
  const stateChange = (meta["状态"] || "").trim();

  rows.push(
    [
      `## 第 ${ch.n} 章 · ${ch.title}`,
      "",
      `- 卷：${ch.vol}`,
      `- 字数：${ch.chars}（约 ${ch.minutes} 分钟）`,
      `- 出场：${cast}`,
      `- 段落：${stats.n} 段，短段占比 ${stats.shortPct}%，长段 ${stats.long} 段`,
      beats ? `- 本章：${beats}` : "",
      stateChange ? `- 状态变化：${stateChange}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );

  stateLines.push(
    `- 第 ${ch.n} 章《${ch.title}》已写（${ch.chars} 字，${ch.updated || "—"}），出场：${cast}`
  );
}

const total = chapters.length;
const last = chapters[chapters.length - 1];
const summaryDoc = [
  "# 章节摘要（机器生成）",
  "",
  "> 由 `npm run sync:state` 从 `content/chapters/*.md` 与 `public/novel/ch/index.json` 生成；改章节后重跑一次即可。",
  "",
  START,
  rows.length ? rows.join("\n\n") : "（还没有章节）",
  END,
  "",
].join("\n");

const stateDoc = [
  `- 已写章节：${total} / 8（卷一试水）`,
  last
    ? `- 最新章节：第 ${last.n} 章《${last.title}》（${last.chars} 字，${last.updated || "—"}）`
    : "- 最新章节：无",
  ...stateLines,
].join("\n");

fillBlock(path.join(STATE_DIR, "chapter_summaries.md"), rows.length ? rows.join("\n\n") : "（还没有章节）");
fillBlock(path.join(STATE_DIR, "current_state.md"), stateDoc);

// chapter_summaries 需要标题行，单独补一次（fillBlock 只替换标记区）
const csFile = path.join(STATE_DIR, "chapter_summaries.md");
let cs = read(csFile);
if (!cs.startsWith("#")) cs = `# 章节摘要（机器生成）\n\n${cs}`;
fs.writeFileSync(csFile, cs, "utf8");

console.log(`novelops-sync：${total} 章 → docs/novelops/{chapter_summaries,current_state}.md`);
void summaryDoc;
