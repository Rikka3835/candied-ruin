import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'data', 'chapters.json');

if (!fs.existsSync(file)) {
  console.error('缺少 data/chapters.json，请先运行 node scripts/build-content.mjs');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];

if (!Array.isArray(data.chapters) || data.chapters.length !== 22) {
  errors.push(`章数应为 22，实际 ${data.chapters?.length || 0}`);
}

const seen = new Set();
for (const chapter of data.chapters || []) {
  if (!Number.isInteger(chapter.number) || chapter.number < 1) errors.push('非法章节号');
  if (seen.has(chapter.number)) errors.push(`重复章节号 ${chapter.number}`);
  seen.add(chapter.number);
  if (!chapter.title) errors.push(`第 ${chapter.number} 章缺标题`);
  if (!Array.isArray(chapter.sections) || chapter.sections.length < 1) errors.push(`第 ${chapter.number} 章缺小节`);
  if (!chapter.chars || chapter.chars < 200) errors.push(`第 ${chapter.number} 章字数异常`);
}

for (let i = 1; i <= 22; i += 1) {
  if (!seen.has(i)) errors.push(`缺少第 ${i} 章`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`OK: ${data.chapters.length} chapters, ${data.chapters.reduce((sum, c) => sum + c.chars, 0)} chars, ${data.chapters.reduce((sum, c) => sum + c.sections.length, 0)} sections`);
