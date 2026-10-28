/*
 * Build the canonical chapter data from the TXT sources.
 *
 * Outputs:
 *   data/chapters.json  — metadata + sections used by the local dev server
 *   data/seed.sql       — D1 seed file (one row per chapter, sections as JSON)
 *
 * Run: node scripts/build-content.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const DATA = path.join(ROOT, 'data');

const META = {
  3: {
    subtitle: '「先救谁」这句话，谁都没有说出口。',
    summary: '三张泡契摊在桌上，三张地图指向三个方向。琉璃要往苔泡小径，末语要挣灯火钱，暗烽只想先弄清雾为什么跟着他们。芙兰夹在中间，第一次发现「一起走」并不是一句话就能做到的事。',
    quote: '地图只有三张，人却有四个。',
    tags: ['榆关镇', '三张泡契', '菌母'],
    glyph: '图', tone: 'gold'
  },
  4: {
    subtitle: '被拖进巢里的那一夜，菌母没有死。',
    summary: '苔泡小径的菌母把阿禾和末语拖进旧巢。芙兰在黑暗里听见阿禾的呼吸，也听见琉璃第一次说「我可能算错了」。这一夜他们救回了人，却没能带回一场胜利。',
    quote: '活着回来，不等于赢了。',
    tags: ['苔泡小径', '菌母', '第一次失败'],
    glyph: '菌', tone: 'teal'
  },
  5: {
    subtitle: '矿洞深处，有人把灯一盏一盏埋进墙里。',
    summary: '晶石矿洞的旧灯站没有灯芯，只有一墙被埋住的灯。周吏说那是前辈留下的路标，可墙里的灯一盏比一盏暗，像有人在里面数着他们还剩多少时间。',
    quote: '别点灯。',
    tags: ['晶石矿洞', '埋灯人', '旧灯站'],
    glyph: '灯', tone: 'violet'
  },
  6: {
    subtitle: '它守着矿脉，也守着被埋住的灯。',
    summary: '晶簇王醒了。矿洞的每一块晶石都在响，像无数盏灯同时碎裂。四个人第一次看见五阶的怪物，也第一次明白：有些东西不是靠勇敢就能打赢的。',
    quote: '跑。不是逃，是活着出去。',
    tags: ['晶簇王', '矿脉', '岑叔的笔记'],
    glyph: '晶', tone: 'blue'
  },
  7: {
    subtitle: '糖霜镇的每一张脸，都朝着城门。',
    summary: '糖霜镇安静得像一幅画。街上的人全被糖霜包住，阿糖守着一盏不肯灭的灯。霜糖骑士的枪尖上挂着糖丝，末语站在最前面，说他来拖住它。',
    quote: '糖是甜的。糖底下的人，不一定。',
    tags: ['糖霜镇', '霜糖骑士', '糖像'],
    glyph: '霜', tone: 'rose'
  },
  8: {
    subtitle: '风把每个人的名字吹回来，除了末语母亲的。',
    summary: '风车原野的风铃一直响。阿风说，风会记住每一个名字；可末语在风里听见母亲的声音时，却发现自己已经想不起她叫他的语调。芙兰第一次看见末语哭。',
    quote: '有些名字，要活着才敢叫。',
    tags: ['风车原野', '阿风', '母亲的名字'],
    glyph: '风', tone: 'teal'
  },
  9: {
    subtitle: '风铃响的时候，阿风没有影子。',
    summary: '风铃怪不是怪物，是阿风死去的母亲。阿风用全镇的风铃留住了她，也把自己留在了那一天。末语举起母亲留下的铜风铃，替阿风说出了那句迟到了很多年的话。',
    quote: '风会停。人得往前走。',
    tags: ['风铃怪', '影子', '铜风铃'],
    glyph: '铃', tone: 'gold'
  },
  10: {
    subtitle: '花女把死去的人种成花，等他们再开一次。',
    summary: '荆棘花园没有门，只有一圈会呼吸的藤。花女说，每朵花都是她救回来的人；芙兰在花根下看见熟悉的村人衣裳，也看见阿禾差点被种进去的那一双手。',
    quote: '花开的时候，人还会记得自己是谁吗？',
    tags: ['荆棘花园', '花女', '花肥'],
    glyph: '荆', tone: 'violet'
  },
  11: {
    subtitle: '阿荞的花园里，没有一朵花是自己愿意开的。',
    summary: '花女阿荞把「救」变成了一座花园。末语在花露里看见自己死去的那天，琉璃逼他选：留在没有痛的梦里，还是带着痛回到同伴身边。花女最后把剪刀递给了他们。',
    quote: '不要替我开花。',
    tags: ['阿荞', '花露', '凋零'],
    glyph: '花', tone: 'rose'
  },
  12: {
    subtitle: '观众席上，坐满了没有脸的人。',
    summary: '星辉城堡的大门开着，像一张等人入场的嘴。观众席上坐满糖像，舞台中央只放着一张写了「迟到者，补票入场」的票。夜徊在幕布后等他们。',
    quote: '戏还没开场，你们怎么先哭了？',
    tags: ['星辉城堡', '观众席', '夜徊'],
    glyph: '城', tone: 'blue'
  },
  13: {
    subtitle: '面具裂开时，琉璃叫了一声叔。',
    summary: '夜徊的泡术和岑叔一模一样。面具碎裂后，露出的那张脸让琉璃丢了魂。芙兰第一次看见琉璃连手都在抖，也第一次意识到，岑叔失踪的三年也许一直在这座城堡里。',
    quote: '叔。',
    tags: ['夜徊', '面具', '岑叔'],
    glyph: '夜', tone: 'violet'
  },
  14: {
    subtitle: '舞台上的灯亮着，台下却没有一个活人。',
    summary: '夜徊不是岑叔，是岑叔留在舞台上的影子。真正的岑叔被关在灯里，观众席上的糖像都是被抽走名字的人。要救人，先得拆掉这座演了三年的大戏。',
    quote: '台下没有人，戏为什么还在演？',
    tags: ['舞台', '观众', '真相'],
    glyph: '台', tone: 'gold'
  },
  15: {
    subtitle: '灰潮从每一道门里涌进来。',
    summary: '舞台的幕布落下，灰潮从城堡每一道门里涌进来。四个人背靠背站在台中央，泡灯一盏接一盏熄灭。弥戏的声音从观众席最后面传来，像在点评一场不够精彩的戏。',
    quote: '别回头。回头看，就会少一个人。',
    tags: ['灰潮', '灾将', '城堡'],
    glyph: '潮', tone: 'teal'
  },
  16: {
    subtitle: '灯灭的时候，芙兰听见心里有什么断了。',
    summary: '琉璃的泡图碎了，末语的盾裂了，暗烽只剩最后一支箭。芙兰的灯也灭了。黑暗里她第一次承认：她一直害怕的不是死，而是被留在原地。',
    quote: '我怕的不是黑。是你们都不在了，只剩我。',
    tags: ['灯灭', '同爆前夜', '选择'],
    glyph: '灭', tone: 'violet'
  },
  17: {
    subtitle: '四个人的泡同时亮起，像四颗不肯落的星。',
    summary: '四阶的灾将，四阶的他们。琉璃画出最后一根线，末语把盾压在地上，暗烽把箭咬在嘴里，芙兰点燃了自己的灯。四个泡在同一秒亮起，越阶同爆。',
    quote: '一起亮。一起灭。一起活。',
    tags: ['同爆', '越阶', '四个人'],
    glyph: '爆', tone: 'rose'
  },
  18: {
    subtitle: '它站起来时，整座舞台都在低头。',
    summary: '同爆撕开了灾将的壳，却没有杀死它。灾将站起来，灰潮重新合拢。四个人已经没有力气再点第二次灯，只能看着它把最后的光吞下去。',
    quote: '我们不是它的对手。可它也不是我们的结局。',
    tags: ['灾将', '灰潮', '舞台'],
    glyph: '灾', tone: 'blue'
  },
  19: {
    subtitle: '岑叔坐在灯下，像很多年前那个晚上。',
    summary: '岑叔从灯里走出来，身体薄得像一张纸。他没有解释三年，只把一枚旧灯芯放在琉璃手心，说这回别再替他做决定。琉璃哭着点头，又摇头。',
    quote: '琉璃，灯不是用来等人的。',
    tags: ['岑叔', '旧灯', '告别'],
    glyph: '岑', tone: 'gold'
  },
  20: {
    subtitle: '戏台拆了，戏还没有演完。',
    summary: '岑叔用最后的灯芯拆掉舞台，夜徊的影子在光里散开。弥戏终于从观众席站起来，鼓了掌。他说这一场比三年前好看，因为他终于看见有人不肯按剧本死。',
    quote: '谢幕？谁说的。',
    tags: ['戏台', '弥戏', '谢幕'],
    glyph: '戏', tone: 'violet'
  },
  21: {
    subtitle: '弥戏在笑，像台下唯一的观众。',
    summary: '弥戏不急着杀他们。他把手伸进灰潮，让整座城堡变成一张巨大的嘴。芙兰在那一刻明白，弥戏要的不是他们的命，是他们亲眼看着灯灭。',
    quote: '你把人当戏看，人就把你当灯点。',
    tags: ['弥戏', '神明', '最后一幕'],
    glyph: '神', tone: 'rose'
  },
  22: {
    subtitle: '天亮了，灯还亮着。',
    summary: '星辉城堡塌了，灰潮退了。四个人带着岑叔的灯芯回到白榆村，村口的灯还亮着。芙兰在灯下写完这一卷的最后一行，然后听见远处海面传来第二卷的风声。',
    quote: '灯亮着。故事就没有完。',
    tags: ['天亮', '灯还亮着', '第一卷完'],
    glyph: '灯', tone: 'gold'
  }
};

function readText(file) {
  return fs.readFileSync(path.join(CONTENT, file), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseChapter(number) {
  const file = `chapter-${String(number).padStart(2, '0')}.txt`;
  const text = readText(file);
  const lines = text.split('\n');
  const titleLine = lines.find((line) => /^第[一二三四五六七八九十百零〇]+章\s+/.test(line));
  if (!titleLine) throw new Error(`No chapter title in ${file}`);
  const titleMatch = titleLine.match(/^(第[一二三四五六七八九十百零〇]+章)\s+(.+)$/);
  const ordinal = titleMatch[1];
  const title = titleMatch[2].trim();

  const headings = [];
  lines.forEach((line, index) => {
    const match = line.match(/^(\d+)\.\s+(.+?)\s*$/);
    if (match) headings.push({ index, number: match[1], title: match[2].trim() });
  });
  if (!headings.length) throw new Error(`No numbered sections in ${file}`);

  const sections = headings.map((heading, i) => {
    const end = i + 1 < headings.length ? headings[i + 1].index : lines.length;
    const body = lines.slice(heading.index + 1, end).join('\n').trim();
    const paras = body
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean);
    return {
      number: String(i + 1).padStart(2, '0'),
      title: heading.title,
      paras
    };
  });

  const meta = META[number] || {};
  const bodyChars = sections.reduce((sum, section) => sum + section.paras.join('').replace(/\s/g, '').length, 0);
  const chapter = {
    number,
    numberText: String(number).padStart(2, '0'),
    slug: `chapter-${String(number).padStart(2, '0')}`,
    ordinal,
    title,
    subtitle: meta.subtitle || '',
    summary: meta.summary || sections[0].paras.slice(0, 2).join(''),
    quote: meta.quote || '',
    kicker: `CHAPTER ${String(number).padStart(2, '0')} · 白榆之灯`,
    volume: '第一卷 白榆之灯',
    cover: number === 1 ? 'lamp' : number === 2 ? 'fog' : 'ink',
    glyph: meta.glyph || '灯',
    tone: meta.tone || 'gold',
    tags: meta.tags || [],
    chars: bodyChars,
    minutes: Math.max(6, Math.ceil(bodyChars / 500)),
    sections,
    updatedAt: '2026-10-25T00:00:00.000Z'
  };
  return chapter;
}

const chapters = Array.from({ length: 22 }, (_, i) => parseChapter(i + 1));

fs.mkdirSync(DATA, { recursive: true });
const payload = {
  title: 'BUBBLE VANGUARD',
  subtitle: '啵啵开荒团',
  volume: '第一卷 白榆之灯',
  chapterCount: chapters.length,
  generatedAt: '2026-10-25T00:00:00.000Z',
  chapters
};
fs.writeFileSync(path.join(DATA, 'chapters.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');

function sqlString(value) {
  return `'${String(value == null ? '' : value).replace(/'/g, "''")}'`;
}

const lines = [
  '-- Generated by scripts/build-content.mjs. Do not edit by hand.',
  'DELETE FROM chapters;',
  ''
];
for (const chapter of chapters) {
  lines.push(
    'INSERT INTO chapters (number, slug, ordinal, title, subtitle, kicker, volume, summary, quote, tags_json, sections_json, chars, minutes, updated_at) VALUES (' +
      [
        chapter.number,
        sqlString(chapter.slug),
        sqlString(chapter.ordinal),
        sqlString(chapter.title),
        sqlString(chapter.subtitle),
        sqlString(chapter.kicker),
        sqlString(chapter.volume),
        sqlString(chapter.summary),
        sqlString(chapter.quote),
        sqlString(JSON.stringify(chapter.tags)),
        sqlString(JSON.stringify(chapter.sections)),
        chapter.chars,
        chapter.minutes,
        sqlString(chapter.updatedAt)
      ].join(', ') +
      ');'
  );
}
lines.push('');
fs.writeFileSync(path.join(DATA, 'seed.sql'), lines.join('\n'), 'utf8');

console.log(`Wrote data/chapters.json and data/seed.sql — ${chapters.length} chapters`);
for (const chapter of chapters) {
  console.log(`${chapter.numberText} ${chapter.title} | sections=${chapter.sections.length} | chars=${chapter.chars}`);
}
