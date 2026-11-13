// Lists text in the Kazakh copy that is still the same as in the Russian files, or reads as Russian. Usage: node src/kk/check.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const PAIRS = [
  ...['blocks', 'core', 'examples', 'lesson', 'program', 'robot', 'scenes', 'sim', 'vm'].map((f) => [`js/${f}.js`, `kk/js/${f}.js`]),
  ...['start', 'lesson', 'examples', 'program'].map((v) => [`src/views/${v}.html`, `src/kk/views/${v}.html`]),
  ['src/index.template.html', 'src/kk/index.template.html'],
];
const CYR = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;
// Words spelled the same in Kazakh, and the app path that stays Russian because SPIKE has no Kazakh.
const SAME_IN_BOTH = new Set(['А', 'Б', 'F', 'Автономия', 'Хаб', 'Мотор', 'Кабель', 'Порт', 'Контроллер',
  'Шарнир', 'Хирургия', 'Ферма', 'таймер', 'Пробел', '%=percent|Н=newton']);
const RUSSIAN = /(^|[^А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])(и|в|на|с|что|это|как|для|по|из|от|до|или|но|если|то|когда|ты|твой|твоя|рука|кнопка|мотор[ауе]|блок[аи])(?=$|[^А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі])/i;

// String literals of a JS file, comments skipped; text inside ${…} is scanned too.
function jsTexts(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 1; continue; }
    if (c !== '"' && c !== "'" && c !== '`') continue;
    let j = i + 1, buf = '';
    while (j < s.length && s[j] !== c) {
      if (s[j] === '\\') { buf += s.slice(j, j + 2); j += 2; continue; }
      if (c === '`' && s[j] === '$' && s[j + 1] === '{') {
        let depth = 1, k = j + 2;
        while (k < s.length && depth) { if (s[k] === '{') depth++; else if (s[k] === '}') depth--; k++; }
        out.push(...jsTexts(s.slice(j + 2, k - 1)));
        buf += '${…}';
        j = k;
        continue;
      }
      buf += s[j++];
    }
    out.push(buf);
    i = j;
  }
  return out;
}
// Text nodes and the attributes people read or hear.
const htmlTexts = (s) => [
  ...s.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/g, '').split(/<[^>]+>/),
  ...[...s.matchAll(/(?:aria-label|title|alt|placeholder|content)="([^"]*)"/g)].map((m) => m[1]),
  ...[...s.matchAll(/content: "([^"]*)"/g)].map((m) => m[1]),
];
const texts = (file) => {
  const s = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const parts = file.endsWith('.js') ? jsTexts(s).flatMap((t) => (/<\w/.test(t) ? htmlTexts(t) : [t])) : htmlTexts(s);
  return parts.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => CYR.test(t));
};

let issues = 0;
for (const [ru, kk] of PAIRS) {
  const russian = new Set(texts(ru));
  const left = texts(kk).filter((t) => !SAME_IN_BOTH.has(t) && (russian.has(t) || RUSSIAN.test(t)));
  if (!left.length) continue;
  issues += left.length;
  console.log(`\n${kk}: ${left.length}`);
  [...new Set(left)].forEach((t) => console.log('  ' + t.slice(0, 140)));
}
console.log(issues ? `\n${issues} strings look untranslated` : 'All text is translated.');
process.exitCode = issues ? 1 : 0;
