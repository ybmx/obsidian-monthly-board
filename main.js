const { MarkdownView, Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require('obsidian');

// CSS injected only into the popout window's document, never the main Obsidian
// window. Hides Obsidian's tab bar / view header / breadcrumbs, kills the H1
// title and all chrome padding so the monthly board card sits flush in the
// popout frame.


const DEFAULT_SETTINGS = {
  configPath: '_tools/monthly-board/monthly-board.config.json',
  forceReadingMode: true,
  writeNotesToMarkdown: false,
  floatingSourcePath: 'Journal/月历总览.md',
  externalWindow: {
    width: 1080,
    height: 720,
    left: null,
    top: null,
    alwaysOnTop: true,
    frameless: false,
    compact: true,
    minimalHeader: false,
    opacity: 96,
  },
};

function parseCodeBlock(source) {
  const result = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2].replace(/^[']|['"]$/g, '');
  }
  return result;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function isSafeVaultPath(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 240) return false;
  if (/^[a-z]+:/i.test(raw) || raw.startsWith('/') || raw.startsWith('\\\\')) return false;
  const normalized = normalizePath(raw);
  return normalized && !normalized.split('/').includes('..');
}

function normalizeExternalWindowSettings(input = {}) {
  return {
    width: clampNumber(input.width, 420, 2200, DEFAULT_SETTINGS.externalWindow.width),
    height: clampNumber(input.height, 360, 1600, DEFAULT_SETTINGS.externalWindow.height),
    left: input.left == null ? null : clampNumber(input.left, 0, 10000, 80),
    top: input.top == null ? null : clampNumber(input.top, 0, 10000, 80),
    alwaysOnTop: input.alwaysOnTop !== false,
    frameless: !!input.frameless,
    compact: input.compact !== false,
    minimalHeader: !!input.minimalHeader,
    opacity: clampNumber(input.opacity, 55, 100, DEFAULT_SETTINGS.externalWindow.opacity),
  };
}

function getSafeExternalWindowBounds(settings) {
  const width = clampNumber(settings.width, 420, 2200, DEFAULT_SETTINGS.externalWindow.width);
  const height = clampNumber(settings.height, 360, 1600, DEFAULT_SETTINGS.externalWindow.height);
  const availLeft = Number.isFinite(Number(screen?.availLeft)) ? Number(screen.availLeft) : 0;
  const availTop = Number.isFinite(Number(screen?.availTop)) ? Number(screen.availTop) : 0;
  const availWidth = Number.isFinite(Number(screen?.availWidth)) ? Number(screen.availWidth) : width;
  const availHeight = Number.isFinite(Number(screen?.availHeight)) ? Number(screen.availHeight) : height;
  const minLeft = Math.round(availLeft);
  const minTop = Math.round(availTop);
  const maxLeft = Math.max(minLeft, Math.round(availLeft + availWidth - width));
  const maxTop = Math.max(minTop, Math.round(availTop + availHeight - height));
  const fallbackLeft = Math.max(minLeft, Math.round(availLeft + (availWidth - width) / 2));
  const fallbackTop = Math.max(minTop, Math.round(availTop + (availHeight - height) / 2));
  const left = settings.left == null ? fallbackLeft : clampNumber(settings.left, minLeft, maxLeft, fallbackLeft);
  const top = settings.top == null ? fallbackTop : clampNumber(settings.top, minTop, maxTop, fallbackTop);
  return { width, height, left, top };
}

function createMonthlyBoardRenderer() {  const module = { exports: {} };
  const exports = module.exports;

const DEFAULT_CONFIG = {
  stateKey: 'obsidian-monthly-journal-board:v1',
  version: 'v2026-05-25 14:20 floating-panel',
  monthsCn: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
  monthsEn: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  weekdays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  dateFields: ['预估完成时间', 'date', 'created_at', '创建时间', '发布时间', '公布时间', 'clipped', 'modified_at'],
  journal: {
    query: '"Journal"',
    dailyFilePattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
  sources: [
    { query: '"数据/工作"', label: '工作' },
    { query: '"数据/旅行"', label: '旅行' },
    { query: '"数据/生活"', label: '生活' },
    { query: '"数据/Clippings"', label: '收藏' },
  ],
  periodicNotes: {
    year: ['Journal/{year}/{year}.md'],
    month: [
      'Journal/{year}/{year}-Q{quarter}/{monthName}, {year}/{monthName}, {year}.md',
      'Journal/{year}/{year}-Q{quarter}/{monthNameEn}, {year}/{monthNameEn}, {year}.md',
    ],
    week: [
      'Journal/{mondayYear}/{mondayYear}-Q{mondayQuarter}/{mondayMonthName}, {mondayYear}/{isoYear}-W{week2}.md',
      'Journal/{mondayYear}/{mondayYear}-Q{mondayQuarter}/{mondayMonthNameEn}, {mondayYear}/{isoYear}-W{week2}.md',
    ],
  },
  theme: {
    handwritingFont: '数据/Attachments/fonts/AaYouLongZeLingKeAiTi-2.ttf',
    options: [['garden','绿野'], ['paper','纸页'], ['night','夜空'], ['rose','玫瑰'], ['ao3','AO3档案'], ['archive','青档案'], ['custom','自定背景']],
    backgroundPresets: [
      { name: 'winter', label: '冬夜', image: '![[数据/Attachments/monthly-backgrounds/A_refined_custom_background_fo_2026-05-23T22-07-49.png]]' },
    ],
  },
};
function mergeDeep(base, override) {
  if (!override || typeof override !== 'object') return Array.isArray(base) ? [...base] : { ...base };
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) out[key] = mergeDeep(base[key], value);
    else out[key] = value;
  }
  return out;
}
async function renderMonthlyBoard(ctx = {}) {
  const dv = ctx.dv;
  const app = ctx.app || (typeof window !== 'undefined' ? window.app : null);
  if (!dv || !app) throw new Error('MonthlyBoard requires { dv, app }.');
  const ROOT = ctx.container || dv.container;
  ROOT.classList?.add('monthly-journal-board');
  ROOT.style.width = '100%';
  ROOT.style.maxWidth = 'none';
  ROOT.style.maxHeight = 'calc(100vh - 92px)';
  ROOT.style.overflow = 'hidden';
  const previewSection = ROOT.closest?.('.markdown-preview-section');
  if (previewSection) { previewSection.style.maxWidth = 'none'; previewSection.style.width = '100%'; }
  const previewSizer = ROOT.closest?.('.markdown-preview-sizer');
  if (previewSizer) { previewSizer.style.maxWidth = 'none'; previewSizer.style.width = '100%'; }
  const config = mergeDeep(DEFAULT_CONFIG, ctx.config || {});
  const STATE_KEY = config.stateKey;
  const BOARD_VERSION = config.version || DEFAULT_CONFIG.version;
  const HAND_FONT_PATH = config.theme?.handwritingFont || '';
  const MONTHS_CN = config.monthsCn || DEFAULT_CONFIG.monthsCn;
  const MONTHS_EN = config.monthsEn || DEFAULT_CONFIG.monthsEn;
  const WEEKDAYS = config.weekdays || DEFAULT_CONFIG.weekdays;
  const DATE_FIELDS = config.dateFields || DEFAULT_CONFIG.dateFields;
  const SOURCE_CONFIGS = config.sources || DEFAULT_CONFIG.sources;
  const THEME_OPTIONS = config.theme?.options || DEFAULT_CONFIG.theme.options;
  const BACKGROUND_PRESETS = config.theme?.backgroundPresets || [];
  const DAILY_FILE_RE = new RegExp(config.journal?.dailyFilePattern || DEFAULT_CONFIG.journal.dailyFilePattern);

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); }
  catch { return {}; }
}
function saveState(next) {
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
}
const now = new Date();
let state = Object.assign({
  year: now.getFullYear(),
  month: now.getMonth(),
  theme: 'garden',
  sideWidth: 320,
  sideHidden: false,
  zoom: 1,
  selectedDate: '',
  bg: '',
  monthNotes: {},
  dayNotes: {},
  imageCovers: {},
  imageFocus: {},
  imageToolsOpen: {},
  hiddenGridItems: {},
}, loadState());
let monthMarkdownNoteTimer = 0;
let dayMarkdownNoteTimer = 0;

function pad(n) { return String(n).padStart(2, '0'); }
function ymd(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstMondayOffset(y, m) { return (new Date(y, m, 1).getDay() + 6) % 7; }
function monthKey(y = state.year, m = state.month) { return `${y}-${pad(m + 1)}`; }
function quarterFromMonth(m) { return Math.floor(m / 3) + 1; }
function isoWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return { year: isoYear, week, monday };
}
function notePathFromCandidates(candidates) {
  for (const raw of candidates.filter(Boolean)) {
    const path = String(raw).replace(/\\/g, '/');
    const direct = app.vault.getAbstractFileByPath(path);
    if (direct) return direct.path;
    const dest = app.metadataCache.getFirstLinkpathDest(path.replace(/\.md$/i, ''), dv.current().file.path);
    if (dest) return dest.path;
  }
  return '';
}
function renderTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}
function templateCandidates(templates, vars) {
  return (Array.isArray(templates) ? templates : [templates]).filter(Boolean).map(t => renderTemplate(t, vars));
}
function yearNotePath(year) {
  return notePathFromCandidates([...templateCandidates(config.periodicNotes.year, { year }), String(year)]);
}
function monthNotePath(year, month) {
  const q = quarterFromMonth(month);
  const vars = { year, quarter: q, month: pad(month + 1), monthName: MONTHS_CN[month], monthNameEn: MONTHS_EN[month] };
  return notePathFromCandidates([...templateCandidates(config.periodicNotes.month, vars), vars.monthName + ', ' + year, vars.monthNameEn + ', ' + year]);
}
function normalizeVaultPath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}
function monthNoteTargetPath(year, month) {
  const existing = monthNotePath(year, month);
  if (existing) return existing;
  const q = quarterFromMonth(month);
  const vars = { year, quarter: q, month: pad(month + 1), monthName: MONTHS_CN[month], monthNameEn: MONTHS_EN[month] };
  const candidate = templateCandidates(config.periodicNotes.month, vars)[0] || `Journal/${year}/${MONTHS_CN[month]}, ${year}.md`;
  const path = normalizeVaultPath(candidate.endsWith('.md') ? candidate : candidate + '.md');
  if (!path || /^[a-z]+:/i.test(path) || path.split('/').includes('..')) return '';
  return path;
}
function markdownNotesEnabled() {
  return !!(config.plugin?.writeNotesToMarkdown ?? config.notes?.writeToMarkdown);
}
const MONTH_NOTE_BEGIN = '<!-- MONTHLY-BOARD-NOTES:BEGIN -->';
const MONTH_NOTE_END = '<!-- MONTHLY-BOARD-NOTES:END -->';
async function ensureFolderForPath(path) {
  const parts = normalizeVaultPath(path).split('/').slice(0, -1);
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      try { await app.vault.createFolder(current); } catch {}
    }
  }
}
function extractMarkedMonthNotes(raw) {
  const start = String(raw || '').indexOf(MONTH_NOTE_BEGIN);
  const end = String(raw || '').indexOf(MONTH_NOTE_END);
  if (start < 0 || end < start) return '';
  return String(raw || '').slice(start + MONTH_NOTE_BEGIN.length, end).replace(/^\r?\n|\r?\n$/g, '');
}
async function readMonthMarkdownNote(year, month) {
  if (!markdownNotesEnabled()) return '';
  const path = monthNotePath(year, month);
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  if (!file) return '';
  return extractMarkedMonthNotes(await app.vault.read(file));
}
async function writeMonthMarkdownNote(year, month, text) {
  if (!markdownNotesEnabled()) return;
  const path = monthNoteTargetPath(year, month);
  if (!path) return;
  await ensureFolderForPath(path);
  const file = app.vault.getAbstractFileByPath(path);
  const block = `${MONTH_NOTE_BEGIN}\n${String(text || '').trimEnd()}\n${MONTH_NOTE_END}`;
  if (!file) {
    await app.vault.create(path, `# ${MONTHS_CN[month]} ${year}\n\n## Monthly Board Notes\n${block}\n`);
    return;
  }
  const raw = await app.vault.read(file);
  const start = raw.indexOf(MONTH_NOTE_BEGIN);
  const end = raw.indexOf(MONTH_NOTE_END);
  const next = start >= 0 && end >= start
    ? raw.slice(0, start) + block + raw.slice(end + MONTH_NOTE_END.length)
    : raw.replace(/\s*$/, '') + `\n\n## Monthly Board Notes\n${block}\n`;
  if (next !== raw) await app.vault.modify(file, next);
}
function scheduleMonthMarkdownNoteSave(year, month, text) {
  if (!markdownNotesEnabled()) return;
  clearTimeout(monthMarkdownNoteTimer);
  monthMarkdownNoteTimer = setTimeout(() => {
    writeMonthMarkdownNote(year, month, text).catch(err => console.error('Monthly Board note save failed:', err));
  }, 650);
}
const DAY_NOTE_BEGIN = '<!-- MONTHLY-BOARD-DAY-NOTES:BEGIN -->';
const DAY_NOTE_END = '<!-- MONTHLY-BOARD-DAY-NOTES:END -->';
function dayNoteTargetPath(dateStr) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const year = m[1];
  const monthNum = Number(m[2]);
  const quarter = quarterFromMonth(monthNum - 1);
  const monthName = MONTHS_CN[monthNum - 1];
  if (!monthName) return '';
  return normalizeVaultPath(`Journal/${year}/${year}-Q${quarter}/${monthName}, ${year}/${dateStr}.md`);
}
function extractMarkedDayNotes(raw) {
  const start = String(raw || '').indexOf(DAY_NOTE_BEGIN);
  const end = String(raw || '').indexOf(DAY_NOTE_END);
  if (start < 0 || end < start) return '';
  return String(raw || '').slice(start + DAY_NOTE_BEGIN.length, end).replace(/^\r?\n|\r?\n$/g, '');
}
async function readDayMarkdownNote(dateStr, existingPath = '') {
  const path = normalizeVaultPath(existingPath || dayNoteTargetPath(dateStr));
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  if (!file) return '';
  return extractMarkedDayNotes(await app.vault.read(file));
}
async function writeDayMarkdownNote(dateStr, existingPath, text) {
  const path = normalizeVaultPath(existingPath || dayNoteTargetPath(dateStr));
  if (!path) return;
  const trimmed = String(text || '').trimEnd();
  let file = app.vault.getAbstractFileByPath(path);
  if (!file && !trimmed) return;
  const block = `${DAY_NOTE_BEGIN}\n${trimmed}\n${DAY_NOTE_END}`;
  if (!file) {
    await ensureFolderForPath(path);
    await app.vault.create(path, `---\ntags:\n  - journal/dailynote\ndate: ${dateStr}\nid: journal-${dateStr}\n---\n\n## Monthly Board Notes\n${block}\n`);
    return;
  }
  const raw = await app.vault.read(file);
  const start = raw.indexOf(DAY_NOTE_BEGIN);
  const end = raw.indexOf(DAY_NOTE_END);
  const next = start >= 0 && end >= start
    ? raw.slice(0, start) + block + raw.slice(end + DAY_NOTE_END.length)
    : raw.replace(/\s*$/, '') + `\n\n## Monthly Board Notes\n${block}\n`;
  if (next !== raw) await app.vault.modify(file, next);
}
function scheduleDayMarkdownNoteSave(dateStr, existingPath, text) {
  clearTimeout(dayMarkdownNoteTimer);
  dayMarkdownNoteTimer = setTimeout(() => {
    writeDayMarkdownNote(dateStr, existingPath, text).catch(err => console.error('Monthly Board daily note save failed:', err));
  }, 650);
}
function weekNotePath(info) {
  const m = info.monday.getMonth();
  const y = info.monday.getFullYear();
  const vars = {
    mondayYear: y,
    mondayQuarter: quarterFromMonth(m),
    mondayMonth: pad(m + 1),
    mondayMonthName: MONTHS_CN[m],
    mondayMonthNameEn: MONTHS_EN[m],
    isoYear: info.year,
    week: info.week,
    week2: pad(info.week),
    name: info.year + '-W' + pad(info.week),
  };
  return notePathFromCandidates([...templateCandidates(config.periodicNotes.week, vars), vars.name]);
}
function normalizeStatus(status) {
  const s = String(status || '').trim();
  if (/完成|已完成|done|complete/i.test(s)) return 'done';
  if (/进行|在做|处理中|doing|progress/i.test(s)) return 'doing';
  if (/取消|放弃|废弃|cancel|drop/i.test(s)) return 'cancelled';
  if (/待|计划|todo|pending/i.test(s)) return 'todo';
  return 'unknown';
}
function isDone(status) { return normalizeStatus(status) === 'done'; }
function iconFor(status) {
  const kind = normalizeStatus(status);
  if (kind === 'done') return '✓';
  if (kind === 'doing') return '▶';
  if (kind === 'cancelled') return '×';
  if (kind === 'todo') return '○';
  return '•';
}
function setText(el, text) { el.textContent = text == null ? '' : String(text); return el; }
function make(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) setText(el, text);
  return el;
}
function safeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/^(https?:|app:|obsidian:|capacitor:|file:|blob:|cdvfile:)/i.test(raw)) return raw;
  if (raw.startsWith('data:image/')) return raw;
  return '';
}
function imageKey(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.hash = '';
    u.search = '';
    return decodeURIComponent(`${u.protocol}//${u.host}${u.pathname}`).replace(/\\/g, '/');
  } catch {
    return decodeURIComponent(raw.split('#')[0].split('?')[0]).replace(/\\/g, '/');
  }
}
function stripMd(text) {
  return String(text || '')
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1')
    .replace(/[*_`>#-]/g, '')
    .trim();
}
function parseFrontmatterEntryArray(page, rawText = '') {
  const raw = page.notion_ids;
  const arr = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const fromDataview = arr
    .filter(v => v && typeof v === 'object')
    .map(v => ({
      id: String(v.id || ''),
      title: String(v.title || 'Untitled'),
      time: String(v.time || ''),
      status: String(v.status || v['状态'] || ''),
      url: String(v.notion_url || ''),
    }));
  if (fromDataview.length) return fromDataview;

  const fm = String(rawText || '').match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/);
  const lines = (fm?.[1] || '').split(/\r?\n/);
  const out = [];
  let inNotionIds = false;
  let current = null;
  for (const line of lines) {
    if (/^notion_ids:\s*$/.test(line)) { inNotionIds = true; continue; }
    if (!inNotionIds) continue;
    if (/^[^\s-][^\n]*:/.test(line)) break;
    const item = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
    if (item) {
      if (current) out.push(current);
      current = { id: item[1].replace(/^['\"]|['\"]$/g, '') };
      continue;
    }
    const prop = line.match(/^\s+([A-Za-z_]+):\s*(.*?)\s*$/);
    if (current && prop) current[prop[1]] = prop[2].replace(/^['\"]|['\"]$/g, '');
  }
  if (current) out.push(current);
  return out.map(v => ({
    id: String(v.id || ''),
    title: String(v.title || 'Untitled'),
    time: String(v.time || ''),
    status: String(v.status || ''),
    url: String(v.notion_url || ''),
  }));
}
function cleanItemTitle(text) {
  return stripMd(String(text || '')
    .replace(/<!--\s*notion:[^>]+-->/gi, '')
    .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, '')
    .replace(/\[Notion\]\([^)]+\)/gi, '')
    .replace(/状态[:：]\s*\S+/g, '')
    .replace(/[✓▶×○•↗]/g, '')
  ).replace(/\s+/g, ' ').trim();
}

function parseBodyDoneLines(raw) {
  const out = [];
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!/^\s*-\s+/.test(line)) continue;
    if (!/(dt-status-done|状态[:：]\s*完成|\[x\])/i.test(line)) continue;
    const id = (line.match(/<!--\s*notion:([0-9a-fA-F-]{32,36})\s*-->/) || [])[1] || '';
    const time = (line.match(/\*\*(\d{2}:\d{2}|--:--)\*\*/) || [])[1] || '';
    const url = (line.match(/href="([^"]+)"/) || line.match(/\[Notion\]\(([^)]+)\)/) || [])[1] || '';
    const title = cleanItemTitle(line.replace(/^\s*-\s+/, '').replace(/\*\*(\d{2}:\d{2}|--:--)\*\*/, ''));
    if (title) out.push({ id, title, time, status: '完成', url });
  }
  return out;
}
function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const titleKey = cleanItemTitle(item.title).toLowerCase();
    const key = item.id ? `id:${item.id.toLowerCase()}` : `text:${item.time}|${titleKey}|${item.url || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function resolveImageFile(clean, filePath) {
  const raw = decodeURIComponent(String(clean || '').trim()).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw) return null;
  const sourceDir = String(filePath || '').split('/').slice(0, -1).join('/');
  const candidates = [raw];
  if (sourceDir && !raw.startsWith('/')) candidates.push(`${sourceDir}/${raw}`);
  for (const candidate of candidates) {
    const direct = app.vault.getAbstractFileByPath(candidate);
    if (direct) return direct;
  }
  return app.metadataCache.getFirstLinkpathDest(raw, filePath);
}
function imageEntryKey(urlOrPath) {
  return imageKey(urlOrPath);
}
function makeImageEntry(url, key) {
  const imageUrl = String(url || '').trim();
  if (!imageUrl) return null;
  return { url: imageUrl, key: String(key || imageEntryKey(imageUrl)) };
}
function normalizeImageEntry(image) {
  if (!image) return null;
  if (typeof image === 'object') return makeImageEntry(image.url, image.key);
  return makeImageEntry(String(image), imageEntryKey(image));
}
function extractImageFromRaw(raw, filePath) {
  const candidates = [];
  const text = String(raw || '');
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) candidates.push(`[[${m[1]}]]`);

  for (const candidate of candidates) {
    const val = String(candidate || '').trim();
    if (!val) continue;
    if (/^https?:\/\//i.test(val)) return makeImageEntry(val, imageEntryKey(val));
    const wiki = val.match(/^\[\[([^\]]+)\]\]$/);
    const link = wiki ? wiki[1] : val;
    const clean = link.split('|')[0].split('#')[0].trim();
    const dest = resolveImageFile(clean, filePath);
    if (dest) return makeImageEntry(app.vault.getResourcePath(dest), dest.path || clean);
  }
  return null;
}
function stripFrontmatter(raw) {
  return String(raw || '').replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function extractEssay(raw) {
  const lines = stripFrontmatter(raw).split(/\r?\n/);
  const skip = /^(---|# |## Glimpse of the day|## Info|## Things I am grateful|> |-|<center>|<\/center>|\s*$)/;
  const picked = [];
  for (const line of lines) {
    if (skip.test(line)) continue;
    const clean = stripMd(line);
    if (clean && clean.length > 8) picked.push(clean);
    if (picked.join('').length > 220) break;
  }
  return picked.join(' · ');
}
function dateFromValue(value) {
  if (!value) return '';
  if (value.start) return dateFromValue(value.start);
  if (typeof value.toISODate === 'function') return value.toISODate();
  const m = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}
function pageDate(p) {
  for (const key of DATE_FIELDS) {
    const d = dateFromValue(p[key]);
    if (d) return d;
  }
  return '';
}
function addDayData(byDate, date, patch) {
  if (!date) return;
  const current = byDate.get(date) || { entries: [], related: [], images: [], path: '', raw: '', essay: '' };
  if (patch.entries) current.entries = uniqueItems([...current.entries, ...patch.entries]);
  if (patch.related) current.related = uniqueItems([...current.related, ...patch.related]);
  const imageEntry = normalizeImageEntry(patch.image);
  if (imageEntry && !current.images.some(img => img.key === imageEntry.key)) current.images.push(imageEntry);
  if (patch.path && !current.path) current.path = patch.path;
  if (patch.raw) current.raw = patch.raw;
  if (patch.essay) current.essay = patch.essay;
  const preferredKey = String(state.imageCovers?.[date] || '');
  const selected = preferredKey ? (current.images.find(img => img.key === preferredKey) || current.images[0] || null) : (current.images[0] || null);
  current.image = selected?.url || '';
  current.imageKey = selected?.key || '';
  byDate.set(date, current);
}
function autoFocusForImageUrl(url) {
  return new Promise(resolve => {
    const probe = new Image();
    probe.onload = () => {
      const ratio = probe.naturalWidth / Math.max(1, probe.naturalHeight);
      resolve({ x: 50, y: ratio < .82 ? 34 : (ratio > 1.45 ? 50 : 42) });
    };
    probe.onerror = () => resolve({ x: 50, y: 50 });
    probe.src = url;
  });
}
function getImageFocus(dateStr) {
  const f = state.imageFocus?.[dateStr] || {};
  const x = Number.isFinite(Number(f.x)) ? Math.max(0, Math.min(100, Number(f.x))) : 50;
  const y = Number.isFinite(Number(f.y)) ? Math.max(0, Math.min(100, Number(f.y))) : 42;
  return { x, y };
}
function applyImageFocus(img, dateStr) {
  const f = getImageFocus(dateStr);
  img.style.objectPosition = `${f.x}% ${f.y}%`;
}
function setImageFocus(dateStr, x, y) {
  if (!state.imageFocus) state.imageFocus = {};
  state.imageFocus[dateStr] = { x: Math.round(Number(x)), y: Math.round(Number(y)) };
  saveState(state);
}
function setImageCover(dateStr, image) {
  if (!state.imageCovers) state.imageCovers = {};
  const entry = normalizeImageEntry(image);
  if (entry) state.imageCovers[dateStr] = entry.key;
  else delete state.imageCovers[dateStr];
  saveState(state);
}
function itemGridKey(item) {
  if (!item) return '';
  if (item.id) return `id:${String(item.id).toLowerCase()}`;
  if (item.path) return `path:${String(item.path)}`;
  return `text:${item.source || ''}|${item.time || ''}|${cleanItemTitle(item.title).toLowerCase()}|${item.url || ''}`;
}
function isGridHidden(item) {
  const key = itemGridKey(item);
  return !!(key && state.hiddenGridItems?.[key]);
}
function setGridHidden(item, hidden) {
  const key = itemGridKey(item);
  if (!key) return;
  if (!state.hiddenGridItems) state.hiddenGridItems = {};
  if (hidden) state.hiddenGridItems[key] = true;
  else delete state.hiddenGridItems[key];
  saveState(state);
}
function areGridItemsHidden(items) {
  const list = (items || []).filter(Boolean);
  return list.length > 0 && list.every(item => isGridHidden(item));
}
function setGridItemsHidden(items, hidden) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return;
  for (const item of list) setGridHidden(item, hidden);
}
function clampZoom(value) {
  const zoom = Number(value);
  return Math.max(1, Math.min(2.4, Number.isFinite(zoom) ? zoom : 1));
}
function zoomLabel() {
  return `${Math.round(clampZoom(state.zoom) * 100)}%`;
}
function obsidianUiScale() {
  if (typeof document === 'undefined') return 1;
  const styles = getComputedStyle(document.body || document.documentElement);
  const raw = styles.getPropertyValue('--font-ui-medium') || styles.getPropertyValue('--font-text-size') || styles.fontSize || '15px';
  const px = Number.parseFloat(raw);
  return Math.max(0.75, Math.min(1.35, Number.isFinite(px) ? px / 15 : 1));
}
function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function stabilizeCalendarGrid(root) {
  if (!root) return;
  root.querySelectorAll('.mjb-grid').forEach(grid => {
    const style = getComputedStyle(grid);
    const gap = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
    const width = Math.max(1, grid.clientWidth || grid.getBoundingClientRect().width || grid.parentElement?.clientWidth || 1);
    const daySize = Math.max(42, Math.floor((width - gap * 6) / 7));
    grid.style.gridAutoRows = `${daySize}px`;
    grid.querySelectorAll('.mjb-day').forEach(day => {
      day.style.height = `${daySize}px`;
      day.style.minHeight = `${daySize}px`;
    });
  });
}
function syncZoomViewportBounds(viewport, frameHeight = 0) {
  if (!viewport) return;
  const visual = window.visualViewport;
  const visualHeight = Math.floor(visual?.height || window.innerHeight || document.documentElement.clientHeight || 720);
  const top = Math.max(0, Math.floor(viewport.getBoundingClientRect?.().top || 0));
  const available = Math.max(260, visualHeight - top - 8);
  // 视口始终铺满可用高度（看板已 contain-fit 居中其中），既填满 OB 阅读区又不截断；
  // 用户放大到超出时由 overflow:auto 提供滚动。
  viewport.style.maxHeight = `${available}px`;
  viewport.style.height = `${available}px`;
  const wrapper = viewport.parentElement;
  if (wrapper?.classList?.contains('monthly-journal-board')) {
    wrapper.style.maxHeight = `${available}px`;
    wrapper.style.height = `${available}px`;
    wrapper.style.overflow = 'hidden';
  }
}
// 测量看板可用的渲染高度：可视高度 - 视口顶端位置 - 顶部工具条（sticky）- 余量。
function measureBoardAvailableHeight(viewport) {
  if (!viewport) return 0;
  const visual = window.visualViewport;
  const visualHeight = Math.floor(visual?.height || window.innerHeight || document.documentElement.clientHeight || 720);
  const top = Math.max(0, Math.floor(viewport.getBoundingClientRect?.().top || 0));
  const available = Math.max(200, visualHeight - top - 8);
  const toolbar = viewport.querySelector?.('.mjb-zoom-toolbar');
  const toolbarH = toolbar ? Math.ceil(toolbar.getBoundingClientRect?.().height || toolbar.offsetHeight || 0) : 0;
  return Math.max(120, available - toolbarH);
}
function applyBoardZoom(canvas, label, frame) {
  const boardZoom = clampZoom(state.zoom);
  const uiScale = obsidianUiScale();
  if (canvas) {
    const viewport = frame?.parentElement || canvas.parentElement;
    const measuredWidth = Math.floor(viewport?.clientWidth || viewport?.getBoundingClientRect?.().width || 0);
    const fallbackWidth = Math.floor(
      viewport?.parentElement?.clientWidth ||
      viewport?.closest?.('.markdown-preview-section')?.clientWidth ||
      viewport?.closest?.('.markdown-preview-sizer')?.clientWidth ||
      0
    );
    const viewportWidth = Math.max(1, measuredWidth >= 160 ? measuredWidth : (fallbackWidth || measuredWidth || canvas.offsetWidth || 1));
    if (frame) {
      frame.style.width = '';
      frame.style.height = '';
    }
    canvas.style.zoom = '';
    canvas.style.transform = 'none';
    canvas.style.transformOrigin = 'top left';
    const baseWidth = Math.max(1, Math.floor(viewportWidth / uiScale));
    canvas.style.width = `${baseWidth}px`;
    canvas.style.height = '';
    canvas.style.maxWidth = 'none';
    const root = canvas.firstElementChild;
    stabilizeCalendarGrid(root);
    const baseHeight = Math.max(1, Math.ceil(root?.scrollHeight || canvas.scrollHeight || canvas.offsetHeight || 1));
    canvas.style.height = `${baseHeight}px`;
    // contain-fit：宽、高都要放得下，取较小的缩放，保证整块看板完整显示、不被截断。
    // boardZoom 作为用户在「适应屏幕」基础上的额外倍数（默认 1 = 刚好铺满可用区）。
    const availForFrame = measureBoardAvailableHeight(viewport);
    const widthScale = uiScale;                                              // 铺满宽度所需缩放
    const heightScale = availForFrame > 0 ? availForFrame / baseHeight : widthScale; // 铺满高度所需缩放
    const fitScale = Math.max(0.05, Math.min(widthScale, heightScale));
    const zoom = fitScale * boardZoom;
    canvas.style.transform = `scale(${zoom})`;
    let frameHeight = 0;
    if (frame) {
      const dispWidth = Math.ceil(baseWidth * zoom);
      frame.style.width = `${dispWidth}px`;
      frameHeight = Math.ceil(baseHeight * zoom);
      frame.style.height = `${frameHeight}px`;
      // 水平居中；可用区还有富余则垂直居中，超出（用户放大）则顶对齐靠滚动查看。
      frame.style.marginLeft = 'auto';
      frame.style.marginRight = 'auto';
      const slack = availForFrame - frameHeight;
      frame.style.marginTop = slack > 0 ? `${Math.floor(slack / 2)}px` : '0px';
      frame.style.marginBottom = '0px';
    }
    syncZoomViewportBounds(viewport, frameHeight);
  }
  if (label) setText(label, zoomLabel());
}
function setBoardZoom(value, canvas, label, frame) {
  state.zoom = clampZoom(value);
  saveState(state);
  applyBoardZoom(canvas, label, frame);
  const viewport = frame?.parentElement || canvas?.parentElement;
  if (viewport && state.zoom <= 1.001) viewport.scrollLeft = 0;
}
function installZoomGestures(viewport, canvas, label, frame) {
  let pinch = null;
  viewport.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 2) return;
    pinch = { distance: touchDistance(ev.touches), zoom: clampZoom(state.zoom) };
    ev.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchmove', ev => {
    if (!pinch || ev.touches.length !== 2) return;
    const nextDistance = touchDistance(ev.touches);
    if (nextDistance > 0 && pinch.distance > 0) setBoardZoom(pinch.zoom * nextDistance / pinch.distance, canvas, label, frame);
    ev.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', ev => {
    if (ev.touches.length < 2) pinch = null;
  }, { passive: true });
  viewport.addEventListener('wheel', ev => {
    if (ev.ctrlKey) {
      ev.preventDefault();
      const factor = ev.deltaY > 0 ? 0.92 : 1.08;
      setBoardZoom(clampZoom(state.zoom) * factor, canvas, label, frame);
      return;
    }
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    if (maxTop <= 1 && maxLeft <= 1) return;
    const nextTop = Math.max(0, Math.min(maxTop, viewport.scrollTop + ev.deltaY));
    const nextLeft = Math.max(0, Math.min(maxLeft, viewport.scrollLeft + ev.deltaX));
    viewport.scrollTop = nextTop;
    viewport.scrollLeft = nextLeft;
    ev.preventDefault();
  }, { passive: false });
}
function installZoomResize(viewport, canvas, label, frame) {
  let raf = 0;
  let observer = null;
  let lastWidth = 0;
  let lastScale = 0;
  const refresh = () => {
    if (!viewport.isConnected) {
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('resize', refresh);
      window.visualViewport?.removeEventListener('scroll', refresh);
      return;
    }
    const width = Math.round(viewport.clientWidth || 0);
    const scale = Math.round(obsidianUiScale() * 1000) / 1000;
    const widthChanged = Math.abs(width - lastWidth) >= 2;
    const scaleChanged = Math.abs(scale - lastScale) >= 0.002;
    if (!widthChanged && !scaleChanged) return;
    lastWidth = width;
    lastScale = scale;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      applyBoardZoom(canvas, label, frame);
      if (widthChanged) viewport.scrollLeft = 0;
    });
  };
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(refresh);
    [viewport, viewport.parentElement, viewport.closest?.('.markdown-preview-view'), viewport.closest?.('.view-content')]
      .filter(Boolean)
      .forEach(el => observer.observe(el));
  }
  window.addEventListener('resize', refresh, { passive: true });
  window.visualViewport?.addEventListener('resize', refresh, { passive: true });
  window.visualViewport?.addEventListener('scroll', refresh, { passive: true });
  refresh();
  setTimeout(refresh, 60);
  setTimeout(refresh, 180);
  setTimeout(refresh, 420);
}
function relatedLabel(source, title) {
  return source ? `${source} · ${title}` : title;
}
async function readPageRaw(p) {
  const file = app.vault.getAbstractFileByPath(p.file.path);
  return file ? await app.vault.read(file) : '';
}
async function loadMonthData(year, month) {
  const byDate = new Map();
  const monthPrefix = `${year}-${pad(month + 1)}-`;
  const journalPages = dv.pages(config.journal.query)
    .where(p => DAILY_FILE_RE.test(p.file.name))
    .where(p => p.file.name.startsWith(monthPrefix))
    .array();
  await Promise.all(journalPages.map(async p => {
    const raw = await readPageRaw(p);
    const entries = uniqueItems([
      ...parseFrontmatterEntryArray(p, raw).filter(e => isDone(e.status)),
      ...parseBodyDoneLines(raw),
    ]);
    addDayData(byDate, p.file.name, {
      entries,
      image: extractImageFromRaw(raw, p.file.path),
      path: p.file.path,
      raw,
      essay: extractEssay(raw),
    });
  }));

  const sources = SOURCE_CONFIGS;
  for (const { query, label: source } of sources) {
    const pages = dv.pages(query).where(p => {
      const d = pageDate(p);
      return d && d.startsWith(monthPrefix);
    }).array();
    await Promise.all(pages.map(async p => {
      const raw = await readPageRaw(p);
      const d = pageDate(p);
      const title = String(p.title || p.file.name || 'Untitled');
      const status = String(p['状态'] || p.status || '');
      const url = String(p.notion_url || p.url || '');
      addDayData(byDate, d, {
        related: [{ id: String(p.notion_id || p.file.path), title: relatedLabel(source, title), status, url, source, path: p.file.path }],
        image: extractImageFromRaw(raw, p.file.path),
      });
    }));
  }
  return byDate;
}

function installStyles() {
  const id = 'monthly-journal-board-style';
  document.getElementById(id)?.remove();
  const style = document.createElement('style');
  style.id = id;
  const handFontFile = app.vault.getAbstractFileByPath(HAND_FONT_PATH);
  const handFontUrl = handFontFile ? app.vault.getResourcePath(handFontFile) : '';
  const handFontFace = handFontUrl ? `@font-face { font-family: 'AaYouLongZeLingKeAiTi'; src: url('${handFontUrl}') format('truetype'); font-display: swap; }\n` : '';
  style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Ma+Shan+Zheng&display=swap');
${handFontFace}.monthly-journal-board { display: block; max-height: calc(100vh - 92px); overflow: hidden; }
.markdown-preview-section:has(.monthly-journal-board) { max-width: 100% !important; }
.mjb-root {
  --mjb-side: ${Math.max(150, Number(state.sideWidth) || 300)}px;
  --mjb-ink: #213729;
  --mjb-muted: rgba(33, 55, 41, .62);
  --mjb-accent: #79a965;
  --mjb-accent-2: #e4a07d;
  --mjb-card: rgba(255, 252, 244, .82);
  --mjb-line: rgba(83, 125, 91, .28);
  position: relative;
  container: mjb-board / inline-size;
  width: 100%;
  box-sizing: border-box;
  min-height: 760px;
  padding: 24px;
  border-radius: 28px;
  font-size: var(--font-ui-medium, 15px);
  color: var(--mjb-ink);
  overflow: hidden;
  background: #f7f1e5;
  background-image: radial-gradient(circle at 20% 10%, rgba(255,255,255,.75), transparent 28%), radial-gradient(circle at 88% 84%, rgba(148,179,120,.18), transparent 30%);
  box-shadow: 0 18px 55px rgba(54, 62, 48, .12);
}
.mjb-root[data-theme="night"] {
  --mjb-ink: #f2f5ff; --mjb-muted: rgba(242,245,255,.72); --mjb-accent: #d8e7ff; --mjb-accent-2: #ffe89a; --mjb-card: rgba(255,255,255,.11); --mjb-line: rgba(255,255,255,.22);
  background: #405a79; background-image: radial-gradient(circle at 10% 18%, rgba(255,255,255,.16) 0 1px, transparent 2px), radial-gradient(circle at 72% 16%, rgba(255,255,255,.2) 0 1px, transparent 2px), linear-gradient(160deg, #405a79, #263a55);
}
.mjb-root[data-theme="night"] .mjb-side { background: rgba(220, 232, 246, .28); box-shadow: inset 0 1px 0 rgba(255,255,255,.34), 0 16px 42px rgba(20,34,52,.18); }
.mjb-root[data-theme="night"] .mjb-note-area { background: rgba(235, 243, 252, .24); color: #f2f5ff; }
.mjb-root[data-theme="custom"] .mjb-side { background: rgba(18, 31, 48, .34); box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 16px 42px rgba(0,0,0,.18); }
.mjb-root[data-theme="custom"] .mjb-note-area { background: rgba(255,255,255,.16); color: #f7fbff; }
.mjb-root[data-theme="night"] .mjb-date,
.mjb-root[data-theme="night"] .mjb-month-tab.is-active,
.mjb-root[data-theme="night"] .mjb-open-note,
.mjb-root[data-theme="custom"] .mjb-date,
.mjb-root[data-theme="custom"] .mjb-open-note { color: #18243a !important; }
.mjb-root[data-theme="night"] .mjb-day:not(.has-image) .mjb-item { color: #f2f5ff; background: rgba(255,255,255,.16); }
.mjb-root[data-theme="paper"] { --mjb-accent: #d7b16d; --mjb-accent-2: #c57f62; background: #fbf7ee; background-image: linear-gradient(rgba(85,70,45,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(85,70,45,.035) 1px, transparent 1px); background-size: 28px 28px; }
.mjb-root[data-theme="rose"] { --mjb-accent: #c78396; --mjb-accent-2: #9bbf88; --mjb-card: rgba(255, 252, 248, .84); --mjb-line: rgba(199,131,150,.22); background: #fff3f4; background-image: radial-gradient(circle at 90% 20%, rgba(199,131,150,.16), transparent 30%), radial-gradient(circle at 18% 88%, rgba(155,191,136,.16), transparent 30%); }
.mjb-root[data-theme="ao3"] { --mjb-ink: #3a2e2a; --mjb-muted: #8B7E72; --mjb-accent: #E07A8F; --mjb-accent-2: #2C3E64; --mjb-card: rgba(255,253,250,.94); --mjb-line: rgba(120,90,80,.18); background: #FAF6F0; background-image: linear-gradient(180deg, #FAF6F0, #F5EFE7); box-shadow: 0 12px 40px rgba(80,50,40,.10); }
.mjb-root[data-theme="ao3"] .mjb-side, .mjb-root[data-theme="ao3"] .mjb-note-area { background: rgba(255,253,250,.82); border-color: rgba(120,90,80,.22); }
.mjb-root[data-theme="ao3"] .mjb-title,
.mjb-root[data-theme="ao3"] .mjb-title-link,
.mjb-root[data-theme="ao3"] .mjb-title-link:visited { color: #E07A8F !important; font-weight: 700; }
.mjb-root[data-theme="ao3"] .mjb-month-tab { color: #C95C76; background: transparent; border: 1px solid rgba(120,90,80,.20); }
.mjb-root[data-theme="ao3"] .mjb-month-tab:hover { background: rgba(224,122,143,.12); }
.mjb-root[data-theme="ao3"] .mjb-month-tab.is-active { background: linear-gradient(90deg, #E07A8F, #C95C76); color: #ffffff; border-color: transparent; }
.mjb-root[data-theme="ao3"] .mjb-item { background: rgba(60,42,38,.62); color: #ffffff; border-radius: 4px; }
.mjb-root[data-theme="ao3"] .mjb-day.has-image .mjb-item { background: rgba(40,28,25,.58); color: #ffffff; }
.mjb-root[data-theme="ao3"] .mjb-day:not(.has-image) .mjb-item { background: rgba(70,52,46,.75); color: #ffffff; border: none; }
.mjb-root[data-theme="ao3"] .mjb-more { color: #ffffff; font-weight: 600; }
.mjb-root[data-theme="ao3"] .mjb-day:not(.has-image) .mjb-more { color: #E07A8F; }
.mjb-root[data-theme="ao3"] .mjb-photo-count { background: #E07A8F; color: #ffffff; box-shadow: 0 1px 4px rgba(60,30,20,.18); }
.mjb-root[data-theme="ao3"] .mjb-date { background: linear-gradient(135deg, #F0B968, #E07A8F); color: #ffffff; box-shadow: 0 1px 4px rgba(60,30,20,.18); }
.mjb-root[data-theme="ao3"] a { color: #C95C76; }
.mjb-root[data-theme="ao3"] a:hover { color: #E07A8F; }
.mjb-root[data-theme="ao3"] .mjb-detail h1,
.mjb-root[data-theme="ao3"] .mjb-detail h2,
.mjb-root[data-theme="ao3"] .mjb-detail h3,
.mjb-root[data-theme="ao3"] .mjb-detail h4 { color: #E07A8F !important; }
.mjb-root[data-theme="ao3"] .mjb-side h1,
.mjb-root[data-theme="ao3"] .mjb-side h2,
.mjb-root[data-theme="ao3"] .mjb-side h3,
.mjb-root[data-theme="ao3"] .mjb-side h4 { color: #E07A8F !important; }
.mjb-root[data-theme="archive"] { --mjb-ink: #384E39; --mjb-muted: rgba(56,78,57,.68); --mjb-accent: #7C8C65; --mjb-accent-2: #4F6550; --mjb-card: rgba(236,246,221,.76); --mjb-line: rgba(79,101,80,.26); background: #ECF6DD; background-image: radial-gradient(circle at 10% 8%, rgba(255,255,255,.72), transparent 24%), linear-gradient(180deg, rgba(236,246,221,.98), rgba(247,241,232,.78)), repeating-linear-gradient(0deg, rgba(79,101,80,.045) 0 1px, transparent 1px 34px); box-shadow: 0 18px 55px rgba(56,78,57,.16); }
.mjb-root[data-theme="archive"] .mjb-side, .mjb-root[data-theme="archive"] .mjb-note-area { background: rgba(236,246,221,.58); border-color: rgba(79,101,80,.30); }
.mjb-root[data-theme="archive"] .mjb-month-tab.is-active { background: linear-gradient(90deg, #7C8C65, #4F6550); color: #ECF6DD; }
.mjb-root[data-theme="archive"] .mjb-day:hover { border-color: rgba(124,140,101,.62); box-shadow: 0 12px 28px rgba(56,78,57,.15); }
.mjb-root[data-theme="custom"] { --mjb-ink: #f7fbff; --mjb-muted: rgba(247,251,255,.80); --mjb-accent: #e7f1ff; --mjb-accent-2: #a9d28f; --mjb-card: rgba(255,255,255,.16); --mjb-line: rgba(255,255,255,.30); background-image: var(--mjb-bg-image); background-size: cover; background-position: center; }
.mjb-root[data-theme="custom"] .mjb-head { padding: 14px 16px; margin: -8px -8px 18px; border-radius: 26px; background: linear-gradient(90deg, rgba(7,14,24,.22), rgba(7,14,24,.10) 58%, transparent); }
.mjb-root[data-theme="custom"] .mjb-title { color: #f4f8ff; text-shadow: 0 3px 14px rgba(0,0,0,.72), 0 0 2px rgba(0,0,0,.95); }
.mjb-root[data-theme="custom"] .mjb-subtitle,
.mjb-root[data-theme="custom"] .mjb-weekdays { color: rgba(247,251,255,.88); text-shadow: 0 2px 7px rgba(0,0,0,.72), 0 0 1px rgba(0,0,0,.9); }
.mjb-root[data-theme="custom"] .mjb-month-tab { color: rgba(247,251,255,.88); background: rgba(15,27,43,.28); text-shadow: 0 1px 4px rgba(0,0,0,.45); }
.mjb-root[data-theme="custom"] .mjb-month-tab.is-active { color: #19324a; background: rgba(238,247,255,.92); text-shadow: none; }
.mjb-zoom-viewport { width: 100%; max-height: calc(100vh - 92px); overflow: auto; touch-action: pan-x pan-y; overscroll-behavior: contain; scrollbar-gutter: stable; -webkit-overflow-scrolling: touch; }
.mjb-zoom-toolbar { position: sticky; top: 0; left: 0; z-index: 30; display: flex; justify-content: flex-end; width: 100%; box-sizing: border-box; padding: 0 0 8px; pointer-events: none; }
.mjb-zoom-toolbar .mjb-zoom-controls { pointer-events: auto; }
.mjb-zoom-frame { position: relative; }
.mjb-zoom-canvas { transform-origin: top left; width: 100%; max-width: none; will-change: transform; }
.mjb-zoom-controls { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(83, 125, 91, .28); border-radius: 999px; padding: 2px; background: rgba(255,255,255,.52); backdrop-filter: blur(10px); box-shadow: 0 8px 22px rgba(54,62,48,.12); }
.mjb-zoom-controls button { min-width: 30px; border: 1px solid rgba(83, 125, 91, .28); background: rgba(255,255,255,.50); color: #213729; border-radius: 999px; padding: 5px 8px; font-size: 12px; cursor: pointer; font-weight: 800; }
.mjb-zoom-reset { min-width: 48px !important; }
.mjb-root::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(rgba(255,255,255,.35) 0.7px, transparent 0.7px); background-size: 5px 5px; opacity: .24; }
.mjb-head, .mjb-main { position: relative; z-index: 1; }
.mjb-head { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.mjb-title { font-size: clamp(32px, 4.4vw, 56px); line-height: .9; font-family: Georgia, 'Times New Roman', serif; letter-spacing: -2px; }
.mjb-title-link { color: inherit !important; text-decoration: none !important; cursor: pointer; border-radius: 14px; transition: background .16s ease, opacity .16s ease; }
.mjb-title-link:hover { background: rgba(255,255,255,.22); opacity: .88; }
.mjb-subtitle { color: var(--mjb-muted); font-size: 12px; letter-spacing: .18em; text-transform: uppercase; margin-top: 4px; }
.mjb-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 580px; }
.mjb-controls button, .mjb-controls select, .mjb-controls input { border: 1px solid var(--mjb-line); background: rgba(255,255,255,.45); color: var(--mjb-ink); border-radius: 999px; padding: 7px 12px; font-size: 12px; backdrop-filter: blur(10px); }
.mjb-controls select option { color: #263347; background: #f7f1e8; }
.mjb-root[data-theme="night"] .mjb-controls select option { color: #223047; background: #edf3fb; }
.mjb-controls button { cursor: pointer; font-weight: 700; }
.mjb-controls input { min-width: 190px; }
.mjb-month-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 2px 0 10px; }
.mjb-month-tab { border: 0; border-radius: 999px; padding: 6px 10px; background: rgba(255,255,255,.32); color: var(--mjb-muted); cursor: pointer; }
.mjb-month-tab.is-active { color: white; background: var(--mjb-accent); box-shadow: 0 6px 20px rgba(80,120,70,.22); }
.mjb-main { display: grid; grid-template-columns: minmax(0, 1fr) 8px clamp(150px, 30%, var(--mjb-side)); gap: clamp(10px, 1.3vw, 16px); align-items: start; }
.mjb-root[data-side-hidden="true"] .mjb-main { grid-template-columns: minmax(0, 1fr) 0 34px; gap: 8px; }
.mjb-calendar { min-width: 0; }
.mjb-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: clamp(6px, .9vw, 10px); margin-bottom: 10px; color: var(--mjb-muted); font: 700 clamp(10px, 1.15vw, 13px) Georgia, serif; letter-spacing: .12em; }
.mjb-weekdays > div { text-align: center; border-bottom: 2px solid var(--mjb-line); padding-bottom: 8px; white-space: nowrap; }
.mjb-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); grid-auto-rows: minmax(42px, auto); align-items: start; gap: clamp(6px, .9vw, 10px); }
.mjb-day { position: relative; aspect-ratio: auto; box-sizing: border-box; min-height: 42px; border: 1px solid var(--mjb-line); border-radius: clamp(12px, 1.4vw, 18px); background: var(--mjb-card); overflow: hidden; padding: 8px; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
.mjb-day:hover { transform: translateY(-2px); border-color: rgba(121,169,101,.55); box-shadow: 0 12px 28px rgba(36,50,34,.13); z-index: 8; }
.mjb-root img { max-width: none !important; margin: 0 !important; padding: 0 !important; opacity: 1 !important; filter: none !important; mix-blend-mode: normal !important; }
.mjb-day.is-empty { opacity: .22; background: transparent; border-style: dashed; cursor: default; }
.mjb-day.is-selected { outline: 2px solid var(--mjb-accent-2); outline-offset: 2px; }
.mjb-date { position: absolute; top: 7px; left: 7px; z-index: 3; min-width: 22px; height: 22px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: var(--mjb-accent); color: white !important; font-size: 11px; font-weight: 800; box-shadow: 0 2px 10px rgba(0,0,0,.18); text-decoration: none !important; }
a.mjb-date { cursor: pointer; }
a.mjb-date:hover { filter: brightness(1.06); transform: translateY(-1px); }
.mjb-week-chip { position: absolute; top: 34px; left: 7px; z-index: 3; padding: 1px 5px; border-radius: 999px; background: rgba(255,255,255,.62); color: var(--mjb-muted) !important; font: 800 9px Georgia, serif; letter-spacing: .02em; text-decoration: none !important; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
.mjb-week-chip:hover { color: var(--mjb-ink) !important; background: rgba(255,255,255,.82); }
.mjb-thumb { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; max-height: none; object-fit: cover; border-radius: inherit; margin: 0; display: block; background: rgba(255,255,255,.35); }
.mjb-day.has-image::after { content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.02) 48%, rgba(0,0,0,.26) 100%); }
.mjb-day:not(.has-image) .mjb-thumb { display: none; }
.mjb-items { position: absolute; left: 7px; right: 7px; bottom: 7px; z-index: 2; display: flex; flex-direction: column; gap: 2px; }
.mjb-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(10px, 1vw, 12px); letter-spacing: .01em; color: var(--mjb-ink); background: linear-gradient(90deg, rgba(255,255,255,.30), rgba(255,255,255,.16)); border-radius: 8px; padding: 1px 5px; font-weight: 800; text-shadow: 0 1px 1px rgba(255,255,255,.42); box-shadow: 0 1px 4px rgba(0,0,0,.045); }
.mjb-day.has-image .mjb-item { color: #f7fbff; background: linear-gradient(90deg, rgba(8,14,22,.50), rgba(8,14,22,.30)); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 1px rgba(0,0,0,.85); backdrop-filter: blur(.8px); }
.mjb-more { font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(10px, .95vw, 11px); color: var(--mjb-muted); margin-top: 1px; font-weight: 800; text-shadow: 0 1px 1px rgba(255,255,255,.36); }
.mjb-day.has-image .mjb-more { color: rgba(247,251,255,.96); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 1px rgba(0,0,0,.85); }
.mjb-photo-count { position: absolute; top: 7px; right: 7px; z-index: 3; display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border-radius: 999px; background: rgba(255,255,255,.68); color: #263347; font-size: 10px; font-weight: 800; box-shadow: 0 2px 10px rgba(0,0,0,.16); }
.mjb-pop { display: none; position: fixed; left: 0; top: 0; width: clamp(240px, 30vw, 360px); max-height: min(420px, calc(100vh - 48px)); overflow: auto; padding: 12px; border-radius: 16px; background: rgba(28, 39, 31, .94); color: #fff; box-shadow: 0 18px 42px rgba(0,0,0,.25); backdrop-filter: blur(10px); z-index: 9999; }
.mjb-pop.is-visible { display: block; }
.mjb-pop-title { font-weight: 800; margin-bottom: 7px; }
.mjb-pop ul { margin: 0; padding-left: 18px; }
.mjb-pop li { margin: 4px 0; font-size: 12px; }
.mjb-pop p { margin: 8px 0 0; font-size: 12px; color: rgba(255,255,255,.82); }
.mjb-pop a { color: #d9f1ff !important; }
.mjb-detail-group-title { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.mjb-detail-group-title .mjb-grid-toggle { flex: 0 0 auto; }
.mjb-resizer { border-radius: 999px; background: linear-gradient(var(--mjb-line), var(--mjb-accent), var(--mjb-line)); opacity: .45; cursor: col-resize; }
.mjb-root[data-side-hidden="true"] .mjb-resizer { opacity: 0; pointer-events: none; }
.mjb-side { min-width: 0; height: min(76vh, 720px); max-height: min(76vh, 720px); box-sizing: border-box; position: sticky; top: 12px; display: flex; flex-direction: column; border: 1px solid var(--mjb-line); border-radius: 24px; padding: 16px; background: rgba(255,255,255,.46); backdrop-filter: blur(12px); overflow: hidden; transition: padding .18s ease, border-radius .18s ease, background .18s ease; }
.mjb-side.is-collapsed { min-width: 0; width: 34px; height: auto; min-height: 104px; max-height: none; align-self: start; align-items: center; padding: 8px 4px; border-radius: 16px; cursor: pointer; z-index: 5; }
.mjb-side.is-collapsed:hover { background: rgba(255,255,255,.62); border-color: var(--mjb-accent); }
.mjb-side-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; }
.mjb-side h3 { margin: 0; font-family: Georgia, serif; font-size: 28px; }
.mjb-side-toggle { border: 1px solid var(--mjb-line); border-radius: 999px; padding: 4px 8px; background: rgba(255,255,255,.34); color: var(--mjb-muted); cursor: pointer; font-size: 12px; font-weight: 850; line-height: 1; }
.mjb-side-toggle:hover { color: var(--mjb-ink); background: rgba(255,255,255,.54); }
.mjb-side.is-collapsed .mjb-side-head { writing-mode: vertical-rl; gap: 8px; margin: 0; }
.mjb-side.is-collapsed h3 { font-size: 13px; letter-spacing: .06em; }
.mjb-side.is-collapsed .mjb-side-toggle { padding: 4px 4px; font-size: 10px; }
.mjb-side.is-collapsed .mjb-note-area,
.mjb-side.is-collapsed .mjb-detail { display: none; }
.mjb-note-area { width: 100%; min-height: 96px; max-height: 160px; resize: vertical; box-sizing: border-box; border: 1px solid var(--mjb-line); border-radius: 16px; background: rgba(255,255,255,.58); color: var(--mjb-ink); padding: 12px; margin: 8px 0 14px; flex: 0 0 auto; }
.mjb-detail { border-top: 1px solid var(--mjb-line); padding-top: 12px; color: var(--mjb-ink); overflow: auto; min-height: 0; flex: 1 1 auto; padding-right: 6px; scrollbar-gutter: stable; }
.mjb-detail p,
.mjb-detail-list,
.mjb-detail-list li,
.mjb-open-message { font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; letter-spacing: .01em; }
.mjb-detail a { color: var(--mjb-ink) !important; }
.mjb-detail-list { padding-left: 18px; margin-top: 8px; }
.mjb-detail-list li { margin: 6px 0; line-height: 1.42; }
.mjb-grid-toggle { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; margin-left: 3px; color: var(--mjb-muted); cursor: pointer; font: 900 10px/1 Georgia, serif; opacity: .34; vertical-align: .08em; user-select: none; }
.mjb-grid-toggle.is-hidden { color: var(--mjb-accent-2); opacity: .78; }
.mjb-grid-toggle:hover { color: var(--mjb-ink); opacity: .9; }
.mjb-detail-image { display: block; width: 100%; max-height: 220px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 18px; margin: 12px 0 14px; border: 1px solid var(--mjb-line); box-shadow: 0 10px 28px rgba(0,0,0,.12); opacity: 1; filter: none !important; mix-blend-mode: normal; }
.mjb-root[data-theme="night"] .mjb-detail-image { box-shadow: 0 10px 28px rgba(18,30,46,.18); }
.mjb-photo-toggle { display: inline-flex; margin: -4px 0 10px; border: 1px solid var(--mjb-line); border-radius: 999px; padding: 5px 10px; background: rgba(255,255,255,.56); color: var(--mjb-ink); cursor: pointer; font-size: 11px; font-weight: 800; }
.mjb-photo-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.mjb-photo-tools button { border: 1px solid var(--mjb-line); border-radius: 999px; padding: 5px 9px; background: rgba(255,255,255,.56); color: var(--mjb-ink); cursor: pointer; font-size: 11px; font-weight: 750; }
.mjb-photo-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 8px 0 12px; }
.mjb-photo-choice { position: relative; aspect-ratio: 1 / 1; padding: 0; border: 2px solid transparent; border-radius: 12px; overflow: hidden; background: transparent; cursor: pointer; }
.mjb-photo-choice.is-active { border-color: var(--mjb-accent-2); box-shadow: 0 0 0 2px rgba(255,255,255,.42); }
.mjb-photo-choice img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mjb-focus-panel { display: grid; gap: 7px; margin: 8px 0 12px; padding: 10px; border: 1px solid var(--mjb-line); border-radius: 16px; background: rgba(255,255,255,.36); }
.mjb-focus-panel label { display: grid; grid-template-columns: 32px 1fr; gap: 8px; align-items: center; font-size: 11px; color: var(--mjb-muted); font-weight: 800; }
.mjb-focus-panel input[type="range"] { width: 100%; accent-color: var(--mjb-accent); }
.mjb-open-note { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-left: 6px; color: var(--mjb-muted) !important; text-decoration: none !important; font: 900 12px/1 Georgia, serif; opacity: .42; vertical-align: .08em; cursor: pointer; }
.mjb-open-note:hover { color: var(--mjb-ink) !important; opacity: .9; }
.mjb-day-grid-toggle { margin-left: 8px; vertical-align: .05em; }
.mjb-open-message { margin: 8px 0 0; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.38); color: var(--mjb-muted); font-size: 12px; white-space: pre-wrap; }
.mjb-open-message.is-error { color: #8a2f2f; background: rgba(255, 228, 228, .72); }
@container mjb-board (max-width: 1200px) {
  .mjb-root { padding: 16px; border-radius: 22px; min-height: 0; }
  .mjb-head { gap: 10px; margin-bottom: 12px; }
  .mjb-title { font-size: clamp(30px, 10cqi, 56px); }
  .mjb-subtitle { font-size: 10px; letter-spacing: .12em; }
  .mjb-controls { gap: 5px; }
  .mjb-controls button, .mjb-controls select, .mjb-controls input { padding: 5px 8px; font-size: 10px; }
  .mjb-month-tabs { gap: 4px; margin-bottom: 12px; }
  .mjb-month-tab { padding: 4px 7px; font-size: 11px; }
  .mjb-main { grid-template-columns: minmax(0, 1fr) 6px clamp(132px, 27%, 180px); gap: 8px; }
  .mjb-weekdays { gap: 4px; margin-bottom: 6px; font-size: clamp(8px, 2.2cqi, 11px); letter-spacing: .08em; }
  .mjb-weekdays > div { padding-bottom: 5px; }
  .mjb-grid { gap: 4px; }
  .mjb-day { padding: 4px; border-radius: 12px; min-height: 34px; }
  .mjb-date { top: 4px; left: 4px; min-width: 18px; height: 18px; font-size: 9px; }
  .mjb-week-chip { top: 24px; left: 4px; padding: 0 3px; font-size: 7px; }
  .mjb-photo-count { top: 4px; right: 4px; gap: 1px; padding: 2px 4px; font-size: 8px; }
  .mjb-items { left: 4px; right: 4px; bottom: 4px; gap: 1px; }
  .mjb-item { font-size: clamp(6px, 1.4cqi, 9px); line-height: 1.18; border-radius: 6px; padding: 1px 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.2px; }
  .mjb-more { font-size: clamp(6px, 1.3cqi, 8px); line-height: 1.15; }
  .mjb-side { height: min(70vh, 560px); max-height: min(70vh, 560px); padding: 10px; border-radius: 18px; }
  .mjb-side h3 { font-size: 20px; }
  .mjb-side-toggle { padding: 4px 7px; }
  .mjb-note-area { min-height: 64px; max-height: 96px; padding: 9px; font-size: 11px; margin-bottom: 10px; }
  .mjb-detail { font-size: 12px; padding-right: 2px; }
  .mjb-detail-list { padding-left: 14px; }
  .mjb-detail-image { max-height: 120px; border-radius: 14px; margin: 8px 0 10px; }
  .mjb-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container mjb-board (max-width: 960px) {
  .mjb-root { padding: 10px; border-radius: 18px; }
  .mjb-head { align-items: flex-start; }
  .mjb-title { font-size: clamp(26px, 12cqi, 42px); letter-spacing: -1px; }
  .mjb-subtitle { font-size: 9px; letter-spacing: .08em; }
  .mjb-controls input { min-width: 120px; }
  .mjb-month-tab { padding: 3px 6px; font-size: 10px; }
  .mjb-main { grid-template-columns: minmax(0, 1fr) 5px clamp(112px, 24%, 140px); gap: 6px; }
  .mjb-weekdays { gap: 3px; font-size: 7px; letter-spacing: .04em; }
  .mjb-grid { gap: 3px; }
  .mjb-day { padding: 3px; border-radius: 10px; min-height: 30px; }
  .mjb-date { top: 3px; left: 3px; min-width: 15px; height: 15px; font-size: 8px; box-shadow: 0 1px 5px rgba(0,0,0,.18); }
  .mjb-week-chip { display: none; }
  .mjb-photo-count { top: 3px; right: 3px; padding: 1px 3px; font-size: 7px; }
  .mjb-items { left: 3px; right: 3px; bottom: 3px; }
  .mjb-item { font-size: 6px; line-height: 1.14; padding: 1px 2px; border-radius: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: -0.2px; }
  .mjb-more { font-size: 6px; line-height: 1.1; }
  .mjb-side { padding: 8px; border-radius: 16px; }
  .mjb-side h3 { font-size: 18px; }
  .mjb-note-area { min-height: 52px; max-height: 76px; padding: 8px; }
  .mjb-detail { font-size: 11px; }
  .mjb-detail-image { max-height: 96px; }
  .mjb-photo-tools { display: none; }
  .mjb-open-note { width: 15px; height: 15px; margin-left: 5px; font-size: 11px; }
}
@container mjb-board (max-width: 920px) { .mjb-main, .mjb-root[data-side-hidden="true"] .mjb-main { grid-template-columns: 1fr; } .mjb-resizer { display:none; } .mjb-side { position: static; height: auto; max-height: none; overflow: visible; } .mjb-detail { overflow: visible; flex: 0 0 auto; max-height: none; } .mjb-side.is-collapsed { width: auto; min-height: 44px; align-items: stretch; } .mjb-side.is-collapsed .mjb-side-head { writing-mode: horizontal-tb; } .mjb-grid { grid-auto-rows: minmax(100px, auto); } }
@media (max-width: 920px) { .mjb-main, .mjb-root[data-side-hidden="true"] .mjb-main { grid-template-columns: 1fr; } .mjb-resizer { display:none; } .mjb-side { position: static; height: auto; max-height: none; overflow: visible; } .mjb-detail { overflow: visible; flex: 0 0 auto; max-height: none; } .mjb-side.is-collapsed { width: auto; min-height: 44px; align-items: stretch; } .mjb-side.is-collapsed .mjb-side-head { writing-mode: horizontal-tb; } .mjb-grid { grid-auto-rows: minmax(100px, auto); } }
`;
  document.head.appendChild(style);
}

function applyBackground(root, input) {
  const raw = String(input || '').trim();
  if (!raw) {
    root.style.removeProperty('--mjb-bg-image');
    return;
  }
  let url = raw;
  const wiki = raw.match(/^!??\[\[([^\]]+)\]\]$/);
  if (wiki) {
    const clean = wiki[1].split('|')[0].split('#')[0].trim();
    const dest = resolveImageFile(clean, dv.current().file.path);
    if (dest) url = app.vault.getResourcePath(dest);
  }
  if (safeUrl(url)) root.style.setProperty('--mjb-bg-image', `url("${url.replace(/"/g, '%22')}")`);
}

function configureInternalLink(el, pathText) {
  const cleanPath = String(pathText || '').replace(/\\/g, '/');
  el.href = cleanPath;
  el.dataset.href = cleanPath;
  el.setAttribute('data-href', cleanPath);
  el.title = cleanPath;
  el.rel = 'noopener nofollow';
  el.onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    app.workspace.openLinkText(cleanPath, dv.current().file.path, false);
  };
  return el;
}

function fillPopover(pop, info, dateStr) {
  pop.textContent = '';
  pop.appendChild(make('div', 'mjb-pop-title', dateStr));
  const ul = make('ul');
  for (const item of info.entries || []) {
    const li = make('li');
    setText(li, `${item.time ? item.time + ' · ' : ''}${item.title}`);
    if (safeUrl(item.url)) {
      li.appendChild(document.createTextNode(' '));
      const a = make('a', '', '↗');
      a.href = safeUrl(item.url);
      li.appendChild(a);
    }
    ul.appendChild(li);
  }
  pop.appendChild(ul);
  if (info.essay) pop.appendChild(make('p', '', info.essay));
}

function placePopover(pop, card) {
  const margin = 18;
  const gap = 12;
  const boundsRect = card.closest('.mjb-calendar')?.getBoundingClientRect()
    || card.closest('.mjb-root')?.getBoundingClientRect()
    || { left: margin, right: window.innerWidth - margin, top: margin, bottom: window.innerHeight - margin, width: window.innerWidth - margin * 2 };
  const cardRect = card.getBoundingClientRect();
  const boundLeft = Math.max(margin, boundsRect.left + margin);
  const boundRight = Math.min(window.innerWidth - margin, boundsRect.right - margin);
  const boundTop = Math.max(margin, boundsRect.top + margin);
  const boundBottom = Math.min(window.innerHeight - margin, boundsRect.bottom - margin);
  const availableWidth = Math.max(220, boundRight - boundLeft);
  pop.style.width = `${Math.min(340, Math.max(230, availableWidth * 0.5))}px`;
  const popRect = pop.getBoundingClientRect();

  const spaces = [
    { left: cardRect.right + gap, room: boundRight - (cardRect.right + gap), align: 'right' },
    { left: cardRect.left - popRect.width - gap, room: cardRect.left - gap - boundLeft, align: 'left' },
  ].sort((a, b) => b.room - a.room);
  let left = spaces[0].room >= popRect.width ? spaces[0].left : cardRect.left + cardRect.width / 2 - popRect.width / 2;
  left = Math.min(Math.max(left, boundLeft), boundRight - popRect.width);

  let top = cardRect.top + cardRect.height / 2 - popRect.height / 2;
  if (top + popRect.height > boundBottom) top = boundBottom - popRect.height;
  if (top < boundTop) top = boundTop;

  pop.style.left = `${Math.round(left)}px`;
  pop.style.top = `${Math.round(top)}px`;
}

function renderDetail(side, data, dateStr) {
  const detail = side.querySelector('.mjb-detail');
  detail.textContent = '';
  const title = make('h3', '', dateStr || '选择一天');
  detail.appendChild(title);
  if (!dateStr) {
    detail.appendChild(make('p', '', '点击任意日期格，可以在这里查看当天完整完成项和照片。'));
    return;
  }
  const day = data.get(dateStr);
  if (!day) {
    detail.appendChild(make('p', '', '这一天没有日记。'));
    return;
  }
  const dayGridItems = [...(day.entries || []), ...(day.related || [])];
  const refreshDayCard = () => {
    const rootEl = side.closest?.('.mjb-root');
    const card = rootEl?.querySelector?.(`.mjb-day[data-date="${dateStr}"]`);
    const holder = card?.querySelector?.('.mjb-items');
    if (!holder) return;
    holder.textContent = '';
    const gridItems = dayGridItems.filter(item => !isGridHidden(item));
    const visible = gridItems.slice(0, day.image ? 2 : 3);
    for (const item of visible) holder.appendChild(make('div', 'mjb-item', `${item.time ? item.time + ' ' : ''}${item.title}`));
    if (gridItems.length > visible.length) holder.appendChild(make('div', 'mjb-more', `+${gridItems.length - visible.length} more`));
  };
  const refreshDetailOnly = () => {
    const oldScroll = detail.scrollTop || 0;
    refreshDayCard();
    renderDetail(side, data, dateStr);
    const nextDetail = side.querySelector('.mjb-detail');
    if (nextDetail) {
      nextDetail.scrollTop = oldScroll;
      requestAnimationFrame(() => { nextDetail.scrollTop = oldScroll; });
    }
  };
  if (day.path) {
    const open = configureInternalLink(make('a', 'internal-link mjb-open-note', '↗'), day.path);
    open.title = '打开日记';
    title.appendChild(open);
  }
  if (dayGridItems.length) {
    const hidden = areGridItemsHidden(dayGridItems);
    const dayToggle = make('span', `mjb-grid-toggle mjb-day-grid-toggle${hidden ? ' is-hidden' : ''}`, hidden ? '⊘' : '○');
    dayToggle.title = hidden ? '已隐藏今天全部条目，点一下恢复' : '隐藏今天全部条目，只在右侧显示';
    dayToggle.setAttribute('role', 'switch');
    dayToggle.setAttribute('aria-checked', hidden ? 'true' : 'false');
    dayToggle.tabIndex = 0;
    dayToggle.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); setGridItemsHidden(dayGridItems, !hidden); refreshDetailOnly(); };
    dayToggle.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') dayToggle.click(); };
    title.appendChild(dayToggle);
  }
  if (day.image) {
    const img = make('img', 'mjb-detail-image');
    img.src = safeUrl(day.image);
    img.loading = 'lazy';
    applyImageFocus(img, dateStr);
    detail.appendChild(img);

    const toggleTools = make('button', 'mjb-photo-toggle', state.imageToolsOpen?.[dateStr] ? '收起照片调整' : '调整照片显示');
    toggleTools.onclick = () => {
      if (!state.imageToolsOpen) state.imageToolsOpen = {};
      state.imageToolsOpen[dateStr] = !state.imageToolsOpen[dateStr];
      saveState(state);
      render();
    };
    detail.appendChild(toggleTools);

    if (state.imageToolsOpen?.[dateStr]) {
      const tools = make('div', 'mjb-photo-tools');
      const resetCover = make('button', '', '首图');
      resetCover.onclick = () => { setImageCover(dateStr, ''); render(); };
      const autoFocus = make('button', '', '自动构图');
      autoFocus.onclick = async () => {
        const next = await autoFocusForImageUrl(img.src);
        setImageFocus(dateStr, next.x, next.y);
        render();
      };
      tools.append(resetCover, autoFocus);
      detail.appendChild(tools);

      if ((day.images || []).length > 1) {
        const grid = make('div', 'mjb-photo-grid');
        for (const image of day.images) {
          const src = image.url || '';
          const choice = make('button', `mjb-photo-choice${image.key === day.imageKey ? ' is-active' : ''}`);
          choice.title = '设为格子和右侧置顶照片';
          const thumb = make('img');
          thumb.loading = 'lazy';
          thumb.src = safeUrl(src);
          choice.appendChild(thumb);
          choice.onclick = async () => {
            setImageCover(dateStr, image);
            const next = await autoFocusForImageUrl(safeUrl(src));
            setImageFocus(dateStr, next.x, next.y);
            render();
          };
          grid.appendChild(choice);
        }
        detail.appendChild(grid);
      }

      const focus = getImageFocus(dateStr);
      const panel = make('div', 'mjb-focus-panel');
      const makeSlider = (label, key, value) => {
        const row = make('label');
        row.appendChild(make('span', '', label));
        const input = make('input');
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.value = String(value);
        input.oninput = () => {
          const next = key === 'x' ? { x: input.value, y: getImageFocus(dateStr).y } : { x: getImageFocus(dateStr).x, y: input.value };
          setImageFocus(dateStr, next.x, next.y);
          applyImageFocus(img, dateStr);
        };
        row.appendChild(input);
        return row;
      };
      panel.append(makeSlider('左右', 'x', focus.x), makeSlider('上下', 'y', focus.y));
      detail.appendChild(panel);
    }
  }
  const makeGridToggle = (items, onToggle) => {
    const list = Array.isArray(items) ? items.filter(Boolean) : [items].filter(Boolean);
    const hidden = areGridItemsHidden(list);
    const marker = make('span', `mjb-grid-toggle${hidden ? ' is-hidden' : ''}`, hidden ? '⊘' : '○');
    marker.title = hidden ? '已不放入日期格子，点一下放回' : '点一下仅在右侧显示';
    marker.setAttribute('role', 'switch');
    marker.setAttribute('aria-checked', hidden ? 'true' : 'false');
    marker.tabIndex = 0;
    marker.onclick = ev => {
      ev.preventDefault();
      ev.stopPropagation();
      if (onToggle) onToggle(!hidden);
      else setGridItemsHidden(list, !hidden);
      refreshDetailOnly();
    };
    marker.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') marker.click(); };
    return marker;
  };
  const addGridToggle = (li, item) => {
    li.appendChild(document.createTextNode(' '));
    li.appendChild(makeGridToggle(item));
  };
  const makeGroupTitle = (label, items) => {
    const h = make('h4', 'mjb-detail-group-title');
    h.appendChild(make('span', '', `${label} (${items.length})`));
    h.appendChild(makeGridToggle(items));
    return h;
  };
  if (day.entries.length) {
    detail.appendChild(makeGroupTitle('完成项', day.entries));
    const ul = make('ul', 'mjb-detail-list');
    for (const item of day.entries) {
      const li = make('li');
      const prefix = `${item.time ? item.time + ' · ' : ''}${item.title}`;
      setText(li, prefix);
      if (safeUrl(item.url)) {
        li.appendChild(document.createTextNode(' '));
        const a = make('a', '', '↗');
        a.href = safeUrl(item.url);
        li.appendChild(a);
      }
      addGridToggle(li, item);
      ul.appendChild(li);
    }
    detail.appendChild(ul);
  }
  if (day.related?.length) {
    detail.appendChild(make('h4', '', '关联条目'));
    const groups = new Map();
    for (const item of day.related) {
      const source = String(item.source || '其他');
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source).push(item);
    }
    for (const [source, items] of groups) {
      detail.appendChild(makeGroupTitle(source, items));
      const ul = make('ul', 'mjb-detail-list');
      for (const item of items) {
        const li = make('li');
        setText(li, item.title);
        if (item.path) {
          li.appendChild(document.createTextNode(' '));
          li.appendChild(configureInternalLink(make('a', 'internal-link', '↗'), item.path));
        } else if (safeUrl(item.url)) {
          li.appendChild(document.createTextNode(' '));
          const a = make('a', '', '↗');
          a.href = safeUrl(item.url);
          li.appendChild(a);
        }
        addGridToggle(li, item);
        ul.appendChild(li);
      }
      detail.appendChild(ul);
    }
  }
}

function captureScrollState() {
  const containers = [
    window,
    document.scrollingElement,
    ROOT.closest?.('.markdown-preview-view'),
    ROOT.closest?.('.view-content'),
    ROOT.querySelector?.('.mjb-zoom-viewport'),
    ROOT.querySelector?.('.mjb-side'),
    ROOT.querySelector?.('.mjb-detail'),
  ].filter(Boolean);
  return containers.map(el => {
    if (el === window) return { el, x: window.scrollX || 0, y: window.scrollY || 0 };
    return { el, x: el.scrollLeft || 0, y: el.scrollTop || 0 };
  });
}
function restoreScrollState(snapshot) {
  for (const item of snapshot || []) {
    try {
      if (item.el === window) window.scrollTo(item.x, item.y);
      else {
        item.el.scrollLeft = item.x;
        item.el.scrollTop = item.y;
      }
    } catch {}
  }
}
async function renderPreservingScroll() {
  const snapshot = captureScrollState();
  await render();
  const restore = () => restoreScrollState(snapshot);
  restore();
  requestAnimationFrame(restore);
  setTimeout(restore, 60);
}
async function render() {
  installStyles();
  saveState(state);
  const monthData = await loadMonthData(state.year, state.month);
  if (!state.selectedDate || !state.selectedDate.startsWith(monthKey())) state.selectedDate = ymd(state.year, state.month, 1);

  let noteArea = null;
  const loadDayNoteIntoArea = async dateStr => {
    if (!noteArea || !dateStr) return;
    noteArea.dataset.date = dateStr;
    noteArea.placeholder = `${dateStr} 的日记备注…（自动写入 daily note）`;
    const day = monthData.get(dateStr);
    const markdownNote = await readDayMarkdownNote(dateStr, day?.path);
    if (!noteArea || noteArea.dataset.date !== dateStr) return;
    const legacyKey = monthKey(state.year, state.month);
    if (!state.dayNotes) state.dayNotes = {};
    if (!state.dayNotes[dateStr] && state.monthNotes?.[legacyKey]) {
      state.dayNotes[dateStr] = state.monthNotes[legacyKey];
      delete state.monthNotes[legacyKey];
      saveState(state);
    }
    const fallback = state.dayNotes?.[dateStr] || '';
    noteArea.value = markdownNote || fallback;
    if (!markdownNote && fallback) scheduleDayMarkdownNoteSave(dateStr, day?.path, fallback);
  };

  const root = make('div', 'mjb-root');
  root.dataset.theme = state.theme;
  root.dataset.sideHidden = state.sideHidden ? 'true' : 'false';
  root.style.setProperty('--mjb-side', `${Math.max(150, Number(state.sideWidth) || 300)}px`);
  applyBackground(root, state.bg);

  const head = make('div', 'mjb-head');
  const titleWrap = make('div');
  const title = make('div', 'mjb-title');
  const boardPath = dv.current()?.file?.path || '';
  const yearPath = yearNotePath(state.year);
  const monthTitle = make(boardPath ? 'a' : 'span', boardPath ? 'internal-link mjb-title-link' : '', MONTHS_CN[state.month]);
  if (boardPath) {
    configureInternalLink(monthTitle, boardPath);
    monthTitle.title = '返回月历总览';
  }
  const yearTitle = make(yearPath ? 'a' : 'span', yearPath ? 'internal-link mjb-title-link' : '', state.year);
  if (yearPath) configureInternalLink(yearTitle, yearPath);
  title.append(monthTitle, document.createTextNode(' '), yearTitle);
  titleWrap.appendChild(title);
  titleWrap.appendChild(make('div', 'mjb-subtitle', `Monthly journal board · images, done items, notes · ${BOARD_VERSION}`));
  head.appendChild(titleWrap);

  const controls = make('div', 'mjb-controls');
  const prevYear = make('button', '', '← 年');
  prevYear.onclick = () => { state.year--; render(); };
  const nextYear = make('button', '', '年 →');
  nextYear.onclick = () => { state.year++; render(); };
  const today = make('button', '', '今天');
  today.onclick = () => { const d = new Date(); state.year = d.getFullYear(); state.month = d.getMonth(); state.selectedDate = ymd(state.year, state.month, d.getDate()); render(); };
  const theme = make('select');
  for (const [value, label] of THEME_OPTIONS) {
    const opt = make('option', '', label);
    opt.value = value;
    opt.selected = value === state.theme;
    theme.appendChild(opt);
  }
  theme.onchange = () => { state.theme = theme.value; render(); };
  const bg = make('input');
  bg.placeholder = '背景 URL 或 ![[图片]]';
  bg.value = state.bg || '';
  bg.onchange = () => { state.bg = bg.value.trim(); state.theme = state.bg ? 'custom' : state.theme; render(); };
  const presetButtons = BACKGROUND_PRESETS.map(preset => {
    const button = make('button', '', preset.label || preset.name || '背景');
    button.title = preset.title || ('套用' + (preset.label || preset.name || '自订') + '背景');
    button.onclick = () => { state.bg = preset.image || ''; state.theme = 'custom'; render(); };
    return button;
  });
  const zoomControls = make('div', 'mjb-zoom-controls');
  const zoomOut = make('button', '', '−');
  zoomOut.title = '缩小月历';
  const zoomReset = make('button', 'mjb-zoom-reset', zoomLabel());
  zoomReset.title = '重置缩放';
  const zoomIn = make('button', '', '+');
  zoomIn.title = '放大月历';
  let zoomCanvas = null;
  let zoomFrame = null;
  zoomOut.onclick = () => setBoardZoom(clampZoom(state.zoom) - 0.1, zoomCanvas, zoomReset, zoomFrame);
  zoomReset.onclick = () => setBoardZoom(1, zoomCanvas, zoomReset, zoomFrame);
  zoomIn.onclick = () => setBoardZoom(clampZoom(state.zoom) + 0.1, zoomCanvas, zoomReset, zoomFrame);
  zoomControls.append(zoomOut, zoomReset, zoomIn);
  controls.append(prevYear, nextYear, today, theme, ...presetButtons, bg);
  head.appendChild(controls);
  root.appendChild(head);

  const tabs = make('div', 'mjb-month-tabs');
  MONTHS_CN.forEach((name, i) => {
    const b = make('button', `mjb-month-tab${i === state.month ? ' is-active' : ''}`, name);
    b.onclick = () => { state.month = i; state.selectedDate = ymd(state.year, i, 1); render(); };
    tabs.appendChild(b);
  });
  root.appendChild(tabs);

  const main = make('div', 'mjb-main');
  const calendar = make('section', 'mjb-calendar');
  const weekdays = make('div', 'mjb-weekdays');
  WEEKDAYS.forEach(w => weekdays.appendChild(make('div', '', w)));
  calendar.appendChild(weekdays);
  const grid = make('div', 'mjb-grid');
  const offset = firstMondayOffset(state.year, state.month);
  const totalDays = daysInMonth(state.year, state.month);
  const weeks = Math.ceil((offset + totalDays) / 7);
  for (let weekRow = 0; weekRow < weeks; weekRow++) {
    const monday = new Date(state.year, state.month, 1 - offset + weekRow * 7);
    const weekInfo = isoWeekInfo(monday);
    const weekPath = weekNotePath(weekInfo);

    for (let dow = 0; dow < 7; dow++) {
      const dayNum = weekRow * 7 + dow - offset + 1;
      if (dayNum < 1 || dayNum > totalDays) {
        grid.appendChild(make('div', 'mjb-day is-empty'));
        continue;
      }
      const dateStr = ymd(state.year, state.month, dayNum);
      const info = monthData.get(dateStr);
      const card = make('article', `mjb-day${info?.image ? ' has-image' : ''}${state.selectedDate === dateStr ? ' is-selected' : ''}`);
      card.dataset.date = dateStr;
      card.onclick = () => { state.selectedDate = dateStr; saveState(state); loadDayNoteIntoArea(dateStr); renderDetail(side, monthData, dateStr); grid.querySelectorAll('.mjb-day').forEach(el => el.classList.remove('is-selected')); card.classList.add('is-selected'); };
      card.ondblclick = ev => { if (info?.path) { ev.preventDefault(); ev.stopPropagation(); app.workspace.openLinkText(info.path, dv.current().file.path, false); } };
      const dateBadge = make(info?.path ? 'a' : 'div', info?.path ? 'internal-link mjb-date' : 'mjb-date', dayNum);
      if (info?.path) {
        configureInternalLink(dateBadge, info.path);
        dateBadge.title = '打开当日日记';
      }
      card.appendChild(dateBadge);
      if (weekPath && (dow === 0 || dayNum === 1)) {
        const weekChip = configureInternalLink(make('a', 'internal-link mjb-week-chip', `W${pad(weekInfo.week)}`), weekPath);
        weekChip.title = '打开当周周记';
        card.appendChild(weekChip);
      }
      if (info?.image) {
        const img = make('img', 'mjb-thumb');
        img.loading = 'lazy';
        img.src = safeUrl(info.image);
        applyImageFocus(img, dateStr);
        card.appendChild(img);
        const count = (info.images || []).length;
        if (count > 1) card.appendChild(make('div', 'mjb-photo-count', `▦ ${count}`));
        if (!state.imageFocus?.[dateStr]) {
          autoFocusForImageUrl(img.src).then(next => {
            if (!state.imageFocus?.[dateStr]) {
              setImageFocus(dateStr, next.x, next.y);
              if (state.year === Number(dateStr.slice(0, 4)) && state.month === Number(dateStr.slice(5, 7)) - 1) render();
            }
          });
        }
      }
      const items = make('div', 'mjb-items');
      const allItems = [...(info?.entries || []), ...(info?.related || [])];
      const gridItems = allItems.filter(item => !isGridHidden(item));
      const visible = gridItems.slice(0, info?.image ? 2 : 3);
      for (const item of visible) items.appendChild(make('div', 'mjb-item', `${item.time ? item.time + ' ' : ''}${item.title}`));
      if (gridItems.length > visible.length) items.appendChild(make('div', 'mjb-more', `+${gridItems.length - visible.length} more`));
      card.appendChild(items);
      if (allItems.length || info?.image) card.title = '点击查看完整详情';
      grid.appendChild(card);
    }
  }
  calendar.appendChild(grid);
  main.appendChild(calendar);

  const resizer = make('div', 'mjb-resizer');
  main.appendChild(resizer);
  const side = make('aside', `mjb-side${state.sideHidden ? ' is-collapsed' : ''}`);
  const sideHead = make('div', 'mjb-side-head');
  sideHead.appendChild(make('h3', '', state.sideHidden ? 'Info' : 'Notes'));
  const sideToggle = make('button', 'mjb-side-toggle', state.sideHidden ? '›' : '‹');
  sideToggle.title = state.sideHidden ? '显示右侧信息' : '隐藏右侧信息';
  const setSideHidden = hidden => {
    state.sideHidden = !!hidden;
    saveState(state);
    renderPreservingScroll();
  };
  sideToggle.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); setSideHidden(!state.sideHidden); };
  sideHead.appendChild(sideToggle);
  side.appendChild(sideHead);
  side.onclick = ev => { if (state.sideHidden) { ev.preventDefault(); ev.stopPropagation(); setSideHidden(false); } };
  noteArea = make('textarea', 'mjb-note-area');
  noteArea.placeholder = '选择一天后在这里写 daily note 备注…';
  noteArea.oninput = () => {
    const dateStr = noteArea.dataset.date || state.selectedDate;
    if (!dateStr) return;
    if (!state.dayNotes) state.dayNotes = {};
    state.dayNotes[dateStr] = noteArea.value;
    saveState(state);
    scheduleDayMarkdownNoteSave(dateStr, monthData.get(dateStr)?.path, noteArea.value);
  };
  side.appendChild(noteArea);
  loadDayNoteIntoArea(state.selectedDate);
  side.appendChild(make('div', 'mjb-detail'));
  main.appendChild(side);
  root.appendChild(main);
  renderDetail(side, monthData, state.selectedDate);

  let dragging = false;
  resizer.addEventListener('pointerdown', ev => { dragging = true; resizer.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  resizer.addEventListener('pointermove', ev => {
    if (!dragging) return;
    const rect = main.getBoundingClientRect();
    const minSide = rect.width < 560 ? 112 : rect.width < 720 ? 132 : 150;
    const maxSide = Math.min(620, Math.max(minSide, rect.width * 0.38));
    const width = Math.max(minSide, Math.min(maxSide, rect.right - ev.clientX));
    state.sideWidth = Math.round(width);
    root.style.setProperty('--mjb-side', `${state.sideWidth}px`);
    saveState(state);
  });
  resizer.addEventListener('pointerup', ev => { dragging = false; try { resizer.releasePointerCapture(ev.pointerId); } catch {} });

  const viewport = make('div', 'mjb-zoom-viewport');
  const toolbar = make('div', 'mjb-zoom-toolbar');
  const frame = make('div', 'mjb-zoom-frame');
  const canvas = make('div', 'mjb-zoom-canvas');
  zoomCanvas = canvas;
  zoomFrame = frame;
  toolbar.appendChild(zoomControls);
  canvas.appendChild(root);
  frame.appendChild(canvas);
  viewport.append(toolbar, frame);
  ROOT.replaceChildren(viewport);
  requestAnimationFrame(() => applyBoardZoom(canvas, zoomReset, frame));
  installZoomGestures(viewport, canvas, zoomReset, frame);
  installZoomResize(viewport, canvas, zoomReset, frame);
}

  try {
    await render();
  } catch (err) {
    ROOT.textContent = '';
    const box = make('div', 'mjb-error');
    box.style.cssText = 'padding:16px;border:1px solid var(--background-modifier-error);border-radius:12px;background:var(--background-secondary);white-space:pre-wrap;';
    box.textContent = `月历渲染失败：${err?.message || err}\n\n如果 Obsidian 没有自动刷新，请切到阅读模式或重载 Dataview。`;
    ROOT.appendChild(box);
    console.error(err);
  }
}
const api = { render: renderMonthlyBoard, renderMonthlyBoard, DEFAULT_CONFIG };
if (typeof window !== 'undefined') window.MonthlyBoard = api;
if (typeof module !== 'undefined') module.exports = api;

  return module.exports;
}

// ===== Glass external window (route A: transparent acrylic snapshot) =====
const GLASS_CHROME_CSS = `
html,body{margin:0;padding:0;height:100%;background:transparent;overflow:hidden;font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;}
*{box-sizing:border-box;}
.mjbg-shell{position:fixed;inset:4px;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;
  background:rgba(22,24,32,.30);
  border:1px solid rgba(255,255,255,.18);
  box-shadow:0 22px 70px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.24), inset 0 0 0 .5px rgba(255,255,255,.07);
  backdrop-filter:blur(30px) saturate(168%); -webkit-backdrop-filter:blur(30px) saturate(168%);}
.mjbg-shell::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:18px;
  background:linear-gradient(160deg, rgba(255,255,255,.09), rgba(255,255,255,0) 38%);}
.mjbg-chrome{position:relative;z-index:2;flex:0 0 auto;height:26px;display:flex;align-items:center;justify-content:space-between;
  padding:0 5px 0 9px;-webkit-app-region:drag;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.08);}
.mjbg-title{font-size:10px;font-weight:700;letter-spacing:.02em;color:rgba(255,255,255,.82);text-shadow:0 1px 2px rgba(0,0,0,.45);min-width:58px;text-align:center;}
.mjbg-nav{display:flex;align-items:center;gap:2px;}
.mjbg-actions{display:flex;gap:2px;-webkit-app-region:no-drag;}
.mjbg-btn{-webkit-app-region:no-drag;width:18px;height:18px;border:1px solid rgba(255,255,255,.16);border-radius:999px;
  background:rgba(255,255,255,.09);color:rgba(255,255,255,.86);font-size:10px;line-height:1;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background .15s,transform .1s;}
.mjbg-btn:hover{background:rgba(255,255,255,.22);}
.mjbg-btn:active{transform:scale(.88);}
.mjbg-btn.is-active{background:rgba(120,180,255,.42);border-color:rgba(160,205,255,.66);color:#fff;}
.mjbg-stage{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:auto;padding:3px;display:flex;align-items:flex-start;justify-content:center;}
.mjbg-fit{position:relative;margin:0 auto;}
.mjbg-sizer{width:1180px;transform-origin:top left;will-change:transform;}
.mjbg-stage .mjb-root{margin:0!important;max-height:none!important;height:auto!important;min-height:0!important;width:1180px!important;box-shadow:none!important;}
.mjbg-stage .mjb-side{position:static!important;overflow:hidden!important;}
.mjbg-stage .mjb-detail{overflow:auto!important;min-height:0!important;flex:1 1 auto!important;}
.mjbg-stage .mjb-zoom-viewport{max-height:none!important;overflow:visible!important;}
.mjbg-stage .monthly-journal-board{max-height:none!important;overflow:visible!important;}
.mjbg-stage::-webkit-scrollbar{width:9px;height:9px;}
.mjbg-stage::-webkit-scrollbar-thumb{background:rgba(255,255,255,.24);border-radius:9px;}
.mjbg-stage::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.38);}
.mjbg-stage::-webkit-scrollbar-track{background:transparent;}
.mjbg-loading{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;flex-direction:column;gap:8px;
  background:rgba(18,20,28,.42);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);border-radius:18px;
  -webkit-app-region:no-drag;pointer-events:none;}
.mjbg-loading.is-on{display:flex;}
.mjbg-spinner{width:24px;height:24px;border-radius:999px;border:2.5px solid rgba(255,255,255,.22);border-top-color:rgba(255,255,255,.92);
  animation:mjbg-spin .7s linear infinite;}
.mjbg-loading-txt{font-size:10px;font-weight:700;letter-spacing:.06em;color:rgba(255,255,255,.86);text-shadow:0 1px 2px rgba(0,0,0,.5);}
@keyframes mjbg-spin{to{transform:rotate(360deg);}}
.mjbg-busy{position:absolute;top:5px;right:5px;z-index:5;width:9px;height:9px;border-radius:999px;
  background:radial-gradient(circle at 30% 30%, #b6e0ff, #5aa0ff);box-shadow:0 0 6px rgba(120,180,255,.8);
  opacity:0;transition:opacity .2s;pointer-events:none;}
.mjbg-busy.is-on{opacity:1;animation:mjbg-pulse 1s ease-in-out infinite;}
@keyframes mjbg-pulse{0%,100%{transform:scale(1);opacity:.55;}50%{transform:scale(1.35);opacity:1;}}
`;

const GLASS_RUNTIME_JS = `
(function(){
  var electron=null, remote=null;
  try{ electron=require('electron'); }catch(e){}
  try{ remote=require('@electron/remote'); }catch(e){ try{ remote=electron&&electron.remote; }catch(_){} }
  function curWin(){ try{ return remote&&remote.getCurrentWindow?remote.getCurrentWindow():null; }catch(e){ return null; } }

  // 每天右栏详情（离屏快照时逐格捕获），用于实现「点击格子切换」。
  var DAY_DETAILS={};
  try{ var _dj=document.getElementById('mjbg-day-details'); if(_dj) DAY_DETAILS=JSON.parse(_dj.textContent||'{}'); }catch(e){ console.error('[glass] details parse', e); }
  function switchDay(cell){
    var d=cell.getAttribute('data-date'); if(!d) return;
    var rec=DAY_DETAILS[d];
    var detailEl=document.querySelector('.mjb-side .mjb-detail');
    var noteEl=document.querySelector('.mjb-side .mjb-note-area');
    if(rec&&detailEl){ detailEl.innerHTML=rec.detail||''; }
    if(noteEl){ if(rec){ noteEl.value=rec.note||''; noteEl.placeholder=rec.ph||''; } }
    var sel=document.querySelectorAll('.mjb-day.is-selected');
    for(var i=0;i<sel.length;i++) sel[i].classList.remove('is-selected');
    cell.classList.add('is-selected');
    scheduleFit();
  }
  function glassDir(){
    try{
      var p=decodeURIComponent(location.pathname).replace(/^\\/+/,'');
      return p.substring(0,p.replace(/\\\\/g,'/').lastIndexOf('/'));
    }catch(e){ return null; }
  }
  function flagPath(){ var d=glassDir(); return d?d+'/_glass-refresh.flag':null; }
  function navFlagPath(){ var d=glassDir(); return d?d+'/_glass-nav.flag':null; }
  // 当前玻璃窗展示的月份（主窗口注入），翻月时据此计算目标月。
  var CUR={year:__YEAR__,month:__MONTH__};
  function gotoMonth(y,m){
    while(m<0){m+=12;y--;} while(m>11){m-=12;y++;}
    try{ var fs=require('fs'); var fp=navFlagPath(); if(fp) fs.writeFileSync(fp, y+'-'+(m+1)+'|'+Date.now(), 'utf8'); }catch(e){ console.error(e); }
  }
  var pinned=true;
  function showLoading(txt){
    try{
      var ov=document.getElementById('mjbg-loading');
      if(ov){ var t=ov.querySelector('.mjbg-loading-txt'); if(t&&txt) t.textContent=txt; ov.classList.add('is-on'); }
      var b=document.getElementById('mjbg-busy'); if(b) b.classList.add('is-on');
    }catch(e){}
  }
  document.addEventListener('click', function(ev){
    var btn=ev.target.closest && ev.target.closest('.mjbg-btn');
    if(btn){
      var act=btn.getAttribute('data-act');
      if(act==='close'){ var w=curWin(); if(w){try{w.close();}catch(e){}} else { try{window.close();}catch(e){} } return; }
      if(act==='pin'){ var w2=curWin(); pinned=!pinned; if(w2){try{w2.setAlwaysOnTop(pinned,'floating');}catch(e){}} btn.classList.toggle('is-active',pinned); return; }
      if(act==='prev'){ showLoading('载入中…'); gotoMonth(CUR.year, CUR.month-1); btn.classList.add('is-active'); setTimeout(function(){btn.classList.remove('is-active');},320); return; }
      if(act==='next'){ showLoading('载入中…'); gotoMonth(CUR.year, CUR.month+1); btn.classList.add('is-active'); setTimeout(function(){btn.classList.remove('is-active');},320); return; }
      if(act==='today'){ showLoading('载入中…'); var dt=new Date(); gotoMonth(dt.getFullYear(), dt.getMonth()); btn.classList.add('is-active'); setTimeout(function(){btn.classList.remove('is-active');},320); return; }
      if(act==='refresh'){
        showLoading('刷新中…');
        try{ var fs=require('fs'); var fp=flagPath(); if(fp) fs.writeFileSync(fp, String(Date.now()), 'utf8'); }catch(e){ console.error(e); }
        btn.classList.add('is-active'); setTimeout(function(){btn.classList.remove('is-active');},520);
        return;
      }
    }
    var link=ev.target.closest && ev.target.closest('[data-href]');
    if(link){
      ev.preventDefault(); ev.stopPropagation();
      var href=link.getAttribute('data-href')||'';
      if(href){
        var url='obsidian://open?vault=__VAULT__&file='+encodeURIComponent(href.replace(/\\.md$/,''));
        try{ var sh=(electron&&electron.shell)?electron.shell:require('electron').shell; sh.openExternal(url); }catch(e){ console.error(e); }
      }
      return;
    }
    var dayCell=ev.target.closest && ev.target.closest('.mjb-day[data-date]');
    if(dayCell){ ev.preventDefault(); ev.stopPropagation(); switchDay(dayCell); return; }
  }, true);
  (function(){ var w=curWin(); if(w){ try{ w.setAlwaysOnTop(true,'floating'); }catch(e){} } var pb=document.querySelector('.mjbg-btn[data-act="pin"]'); if(pb) pb.classList.add('is-active'); })();

  // 等比 contain 适配：sizer 固定 1180px 自然宽度（与离屏渲染一致，比例 1:1），
  // 取「宽适配比」与「高适配比」中较小者整体 scale，保证一屏显示全、无需滚动。
  var BASE_W=1180;
  // 玻璃窗把 .mjb-root 锁成 1180px，但离屏快照里的格子高度是按放大后的画布宽度算的，
  // 直接用会变成竖长方形。这里按玻璃窗里的真实列宽重算，让日期格回到正方形；
  // 同时把侧栏高度对齐日历列，详情/笔记超出时内部滚动，避免整块看板被拉很长。
  function relayoutGlass(sizer){
    if(!sizer) return;
    var grids=sizer.querySelectorAll('.mjb-grid');
    for(var k=0;k<grids.length;k++){
      var grid=grids[k];
      var gcs=getComputedStyle(grid);
      var gap=parseFloat(gcs.columnGap||gcs.gap||'0')||0;
      var w=grid.clientWidth||grid.getBoundingClientRect().width||0;
      if(w<=1) continue;
      var size=Math.max(42, Math.floor((w-gap*6)/7));
      grid.style.gridAutoRows=size+'px';
      var ds=grid.querySelectorAll('.mjb-day');
      for(var j=0;j<ds.length;j++){ ds[j].style.height=size+'px'; ds[j].style.minHeight=size+'px'; }
    }
    var cal=sizer.querySelector('.mjb-calendar');
    var side=sizer.querySelector('.mjb-side');
    if(cal&&side){
      var hCal=cal.offsetHeight||0;
      if(hCal>0){ side.style.setProperty('height',hCal+'px','important'); side.style.setProperty('max-height',hCal+'px','important'); }
    }
  }
  function fitGlass(){
    var stage=document.querySelector('.mjbg-stage');
    var fit=document.querySelector('.mjbg-fit');
    var sizer=document.querySelector('.mjbg-sizer');
    if(!stage||!fit||!sizer) return;
    var cs=getComputedStyle(stage);
    var padL=parseFloat(cs.paddingLeft)||0, padR=parseFloat(cs.paddingRight)||0;
    var padT=parseFloat(cs.paddingTop)||0, padB=parseFloat(cs.paddingBottom)||0;
    var availW=stage.clientWidth-padL-padR;
    var availH=stage.clientHeight-padT-padB;
    if(availW<=0||availH<=0) return;
    // 先清掉缩放，按真实 1180 宽度修正格子与侧栏，再量自然高度
    sizer.style.transform='none';
    relayoutGlass(sizer);
    var natH=sizer.offsetHeight||1;
    var scale=Math.min(availW/BASE_W, availH/natH);
    if(!isFinite(scale)||scale<=0) scale=availW/BASE_W;
    sizer.style.transformOrigin='top left';
    sizer.style.transform='scale('+scale+')';
    // transform 不改变布局盒尺寸，手动给 fit 包裹层定缩放后宽高，居中 + 滚动正确
    fit.style.width=Math.ceil(BASE_W*scale)+'px';
    fit.style.height=Math.ceil(natH*scale)+'px';
  }
  var _ft=null;
  function scheduleFit(){ if(_ft) clearTimeout(_ft); _ft=setTimeout(fitGlass,60); }
  window.addEventListener('resize', scheduleFit);
  window.addEventListener('load', function(){ fitGlass(); setTimeout(fitGlass,200); setTimeout(fitGlass,600); });
  if(document.readyState!=='loading'){ fitGlass(); setTimeout(fitGlass,200); setTimeout(fitGlass,600); }
  else document.addEventListener('DOMContentLoaded', function(){ fitGlass(); setTimeout(fitGlass,200); });
})();
`;

module.exports = class MonthlyBoardPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.externalWindow = normalizeExternalWindowSettings(this.settings.externalWindow);

    this.registerMarkdownCodeBlockProcessor('monthly-board', async (source, el, ctx) => {
      await this.renderBoard(source, el, ctx);
    });

    this.addCommand({
      id: 'insert-monthly-board-block',
      name: 'Insert monthly board block',
      editorCallback: editor => {
        editor.replaceSelection('```monthly-board\nconfig: ' + this.settings.configPath + '\n```\n');
      },
    });

    this.addCommand({
      id: 'inspect-monthly-board-entry',
      name: 'Inspect monthly board entry',
      callback: () => this.inspectMonthlyBoardEntry(),
    });

    this.addCommand({
      id: 'toggle-floating-monthly-board',
      name: 'Toggle in-app floating monthly board',
      callback: () => this.toggleFloatingBoard(),
    });

    this.addCommand({
      id: 'open-monthly-board-via-hover-editor',
      name: 'Open monthly board floating note (Hover Editor)',
      callback: () => this.openMonthlyBoardViaHoverEditor().catch(error => this.showFailure('Hover Editor open failed', error)),
    });

    this.addCommand({
      id: 'open-monthly-board-popout',
      name: 'Open monthly board in popout window',
      callback: () => this.openMonthlyBoardPopout().catch(error => this.showFailure('Popout open failed', error)),
    });

    this.addCommand({
      id: 'refit-monthly-board-popout',
      name: 'Refit monthly board popout (强制重算缩放)',
      callback: () => this.refitAllMonthlyBoardPopouts(),
    });

    this.addCommand({
      id: 'open-monthly-board-glass',
      name: 'Open glass monthly board (透明玻璃悬浮窗)',
      callback: () => this.openGlassBoard().catch(error => this.showFailure('Glass board open failed', error)),
    });

    this.addCommand({
      id: 'refresh-monthly-board-glass',
      name: 'Refresh glass monthly board (刷新玻璃悬浮窗数据)',
      callback: () => this.refreshGlassBoard({ force: true }).catch(error => this.showFailure('Glass board refresh failed', error)),
    });



    this.addSettingTab(new MonthlyBoardSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on('file-open', () => this.enforceReadingModeSoon()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.enforceReadingModeSoon()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.enforceReadingModeSoon()));
    this.enforceReadingModeSoon();
  }

  onunload() {
    if (this.readingModeTimer) window.clearTimeout(this.readingModeTimer);
    this.closeFloatingBoard();
    this.closeGlassBoard();
  }

  async saveSettings() {
    this.settings.externalWindow = normalizeExternalWindowSettings(this.settings.externalWindow);
    await this.saveData(this.settings);
  }

  showFailure(prefix, error) {
    new Notice(prefix + ': ' + (error?.message || error));
    console.error(prefix, error);
  }

  loadRenderer() {
    if (this.monthlyBoard) return this.monthlyBoard;
    this.monthlyBoard = createMonthlyBoardRenderer();
    if (!this.monthlyBoard?.render) throw new Error('Monthly Board renderer failed to initialize.');
    return this.monthlyBoard;
  }

  async loadJsonConfig(configPath) {
    const safePath = normalizePath(configPath || this.settings.configPath);
    if (!isSafeVaultPath(safePath) || !safePath.endsWith('.json')) {
      throw new Error('Config path must be a relative .json file inside this vault.');
    }
    const file = this.app.vault.getAbstractFileByPath(safePath);
    if (!file) throw new Error('Config file not found: ' + safePath);
    const text = await this.app.vault.read(file);
    return JSON.parse(text);
  }

  async getMonthlyBoardEntry() {
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    if (!isSafeVaultPath(sourcePath) || !sourcePath.endsWith('.md')) {
      throw new Error('Floating source path must be a relative .md path.');
    }
    const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!sourceFile) throw new Error('Floating source note not found: ' + sourcePath);
    const raw = await this.app.vault.read(sourceFile);
    const blockMatch = raw.match(/^\s*```monthly-board\b([\s\S]*?)```/m);
    if (!blockMatch) throw new Error('No monthly-board code block found in ' + sourcePath);
    const options = parseCodeBlock(blockMatch[1]);
    const configPath = normalizePath(options.config || this.settings.configPath);
    if (!isSafeVaultPath(configPath) || !configPath.endsWith('.json')) {
      throw new Error('Monthly Board config must be a relative .json path.');
    }
    const configFile = this.app.vault.getAbstractFileByPath(configPath);
    if (!configFile) throw new Error('Monthly Board config file not found: ' + configPath);
    return { sourcePath, sourceFile, rawBlock: blockMatch[1], options, configPath, configFile };
  }

  async inspectMonthlyBoardEntry() {
    const entry = await this.getMonthlyBoardEntry();
    await this.loadJsonConfig(entry.configPath);
    new Notice(`Monthly Board entry OK: ${entry.sourcePath} -> ${entry.configPath}`);
  }






  async openMonthlyBoardViaHoverEditor() {
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    if (!isSafeVaultPath(sourcePath) || !sourcePath.endsWith('.md')) {
      throw new Error('Floating source path must be a relative .md path.');
    }
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!file || file.children) {
      throw new Error(`找不到入口笔记：${sourcePath}（请在 Monthly Board 设置里调整 Floating board source note）。`);
    }
    const hoverEditor = this.app.plugins?.plugins?.['obsidian-hover-editor'];
    if (!hoverEditor) {
      new Notice('请先启用 Hover Editor 插件。', 6000);
      return;
    }
    // Hover Editor exposes `spawnPopover(initiatingEl, onShowCallback)`. We
    // call it with no element so it picks the active workspace as parent,
    // then load our floating-source note inside the resulting popover leaf.
    try {
      const leaf = hoverEditor.spawnPopover(undefined, () => {});
      await leaf.openFile(file, { state: { mode: 'preview' } });
    } catch (error) {
      console.error('[Monthly Board] Hover Editor popover failed', error);
      new Notice('Hover Editor 启动浮窗失败：' + (error?.message || error), 8000);
    }
  }

  async openMonthlyBoardPopout() {
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    if (!isSafeVaultPath(sourcePath) || !sourcePath.endsWith('.md')) {
      throw new Error('Floating source path must be a relative .md path.');
    }
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!file || file.children) {
      throw new Error(`找不到入口笔记：${sourcePath}（请在 Monthly Board 设置里调整 Floating board source note）。`);
    }

    // 复用已有的 popout，避免开多个窗口。
    let existingLeaf = null;
    this.app.workspace.iterateAllLeaves(leaf => {
      const root = leaf.getRoot?.();
      const isPopout = !!root && root !== this.app.workspace.rootSplit;
      if (isPopout && leaf.view?.file?.path === sourcePath) existingLeaf = leaf;
    });
    if (existingLeaf) {
      this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
      const winRef = existingLeaf.getRoot?.()?.win;
      try { winRef?.focus?.(); } catch {}
      // 已有 popout：重新跑 fit + 按钮（防旧版本残留进程没装上）
      this.startPopoutAutoFit(existingLeaf);
      return;
    }

    const ws = this.app.workspace;
    const opener =
      ws.openPopoutLeaf ? () => ws.openPopoutLeaf() :
      ws.createLeafInNewWindow ? () => ws.createLeafInNewWindow() :
      null;
    if (!opener) {
      throw new Error('当前 Obsidian 不支持 popout 窗口（缺少 openPopoutLeaf API）。');
    }
    const leaf = opener();
    if (!leaf) throw new Error('无法创建 popout leaf。');
    await leaf.openFile(file, { state: { mode: 'preview' } });

    // 启动自适应缩放：popout 窗口大小变化时，月历内容（含字、图、卡片）整体等比缩放。
    this.startPopoutAutoFit(leaf);
  }

  refitAllMonthlyBoardPopouts() {
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    let touched = 0;
    this.app.workspace.iterateAllLeaves(leaf => {
      const root = leaf.getRoot?.();
      const isPopout = !!root && root !== this.app.workspace.rootSplit;
      if (!isPopout) return;
      const filePath = leaf.view?.file?.path;
      if (filePath !== sourcePath) return;
      this.startPopoutAutoFit(leaf);
      touched += 1;
    });
    new Notice(`Monthly Board: refit ${touched} popout(s).`, 3000);
  }

  startPopoutAutoFit(leaf) {
    const root = leaf.getRoot?.();
    const popoutWin = root?.win || root?.doc?.defaultView;
    const popoutDoc = root?.doc || popoutWin?.document;
    if (!popoutWin || !popoutDoc) return;

    const getMonthlyBoardSizer = () => {
      const board = popoutDoc.querySelector('.monthly-journal-board');
      if (!board) return {};
      return {
        board,
        view: board.closest('.markdown-preview-view, .markdown-reading-view'),
        sizer: board.closest('.markdown-preview-sizer'),
      };
    };

    // 注入关闭/置顶按钮（仅当本 popout 确认渲染了月历时）
    const injectActionsIfReady = () => {
      if (getMonthlyBoardSizer().board) this.injectPopoutActionButtons(popoutWin, popoutDoc);
    };

    // Fit 策略：只操作包含 .monthly-journal-board 的那一棵 markdown DOM。
    // 禁止用 document.querySelector('.markdown-preview-sizer') 这种全局选择器，
    // 否则同一个 popout/window 里打开 Bases/数据库时会误改它们的容器，导致空白。
    const fit = () => {
      try {
        const { view, sizer } = getMonthlyBoardSizer();
        if (!view || !sizer) return false;

        view.style.position = 'relative';
        view.style.overflow = 'hidden';
        view.style.padding = '0';
        view.style.margin = '0';

        sizer.style.position = 'absolute';
        sizer.style.left = '0';
        sizer.style.top = '0';
        sizer.style.maxWidth = 'none';
        sizer.style.margin = '0';
        sizer.style.padding = '0';
        sizer.style.transform = '';
        sizer.style.transformOrigin = 'top left';
        sizer.style.width = '';
        sizer.style.height = '';

        const naturalW = sizer.scrollWidth || sizer.offsetWidth;
        const naturalH = sizer.scrollHeight || sizer.offsetHeight;
        if (naturalW < 200 || naturalH < 200) return false;

        const availW = view.clientWidth || popoutDoc.documentElement.clientWidth;
        const availH = view.clientHeight || popoutDoc.documentElement.clientHeight;
        if (availW < 50 || availH < 50) return false;

        const scale = Math.min(availW / naturalW, availH / naturalH);
        sizer.style.transformOrigin = 'top left';
        sizer.style.transform = `scale(${scale})`;
        return true;
      } catch (error) {
        console.warn('[Monthly Board] auto-fit failed', error);
        return false;
      }
    };

    // 等 monthly-board renderer 渲染稳定
    let attempts = 0;
    let lastSize = null;
    let stableCount = 0;
    const settle = () => {
      attempts += 1;
      const { sizer } = getMonthlyBoardSizer();
      if (sizer) {
        injectActionsIfReady();
        const saved = sizer.style.transform;
        sizer.style.transform = '';
        const w = sizer.scrollWidth, h = sizer.scrollHeight;
        sizer.style.transform = saved;
        if (w > 200 && h > 200) {
          if (lastSize && Math.abs(lastSize.w - w) < 4 && Math.abs(lastSize.h - h) < 4) stableCount += 1;
          else stableCount = 0;
          lastSize = { w, h };
          if (stableCount >= 2) {
            fit();
            attachListeners();
            return;
          }
        }
      }
      if (attempts < 80) popoutWin.setTimeout(settle, 100);
    };

    const attachListeners = () => {
      let pending = null;
      const onResize = () => {
        if (pending) return;
        pending = popoutWin.requestAnimationFrame(() => {
          pending = null;
          fit();
        });
      };
      popoutWin.addEventListener('resize', onResize, { passive: true });
      try {
        const { sizer } = getMonthlyBoardSizer();
        if (sizer && popoutWin.MutationObserver) {
          let muteUntil = 0;
          const mo = new popoutWin.MutationObserver(() => {
            if (Date.now() < muteUntil) return;
            muteUntil = Date.now() + 100;
            onResize();
          });
          mo.observe(sizer, { childList: true, subtree: true, attributes: false });
          popoutWin.addEventListener('unload', () => mo.disconnect(), { once: true });
        }
      } catch {}
    };

    popoutWin.setTimeout(settle, 250);
  }


  injectPopoutActionButtons(popoutWin, popoutDoc) {
    if (popoutDoc.querySelector('.mjb-popout-actions')) return;
    const actions = popoutDoc.createElement('div');
    actions.className = 'mjb-popout-actions';

    // 置顶按钮（pin / always-on-top toggle）
    const pinBtn = popoutDoc.createElement('button');
    pinBtn.title = '置顶';
    pinBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M9 3l6 0"/><path d="M9 3l-1 8 -3 2v2h14v-2l-3 -2 -1 -8"/></svg>`;
    let pinned = false;
    const getBrowserWindow = () => {
      try {
        const electron = popoutWin.require?.('electron');
        const remote = popoutWin.require?.('@electron/remote') || electron?.remote;
        return remote?.getCurrentWindow?.() || electron?.remote?.getCurrentWindow?.() || null;
      } catch { return null; }
    };
    pinBtn.addEventListener('click', () => {
      const bw = getBrowserWindow();
      if (!bw?.setAlwaysOnTop) return;
      pinned = !pinned;
      try { bw.setAlwaysOnTop(pinned, 'floating'); } catch {}
      pinBtn.classList.toggle('is-active', pinned);
      pinBtn.title = pinned ? '取消置顶' : '置顶';
    });
    actions.appendChild(pinBtn);

    // 关闭按钮
    const closeBtn = popoutDoc.createElement('button');
    closeBtn.title = '关闭';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6l-12 12"/></svg>`;
    closeBtn.addEventListener('click', () => {
      const bw = getBrowserWindow();
      if (bw?.close) {
        try { bw.close(); return; } catch {}
      }
      try { popoutWin.close(); } catch {}
    });
    actions.appendChild(closeBtn);

    popoutDoc.body.appendChild(actions);
  }

  // ===== Glass external window (route A: transparent acrylic snapshot) =====
  glassPaths() {
    const adapter = this.app.vault.adapter;
    const base = adapter && adapter.getBasePath ? adapter.getBasePath() : null;
    if (!base) throw new Error('玻璃悬浮窗需要桌面版 Obsidian（FileSystemAdapter）。');
    const path = require('path');
    const dir = path.join(base, (this.manifest && this.manifest.dir) || '.obsidian/plugins/monthly-board');
    return { dir, html: path.join(dir, '_glass-snapshot.html'), flag: path.join(dir, '_glass-refresh.flag'), nav: path.join(dir, '_glass-nav.flag') };
  }

  // 玻璃窗默认月份：优先用主看板已保存的月，否则当月。
  defaultGlassMonth() {
    try {
      const raw = localStorage.getItem(DEFAULT_CONFIG.stateKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (Number.isInteger(s.year) && Number.isInteger(s.month)) return { year: s.year, month: s.month };
      }
    } catch {}
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  }

  // app://<hash>/<encoded-abs-path>?<mtime> → file:///<abs-path>
  // app:// 是 Obsidian 主窗口私有协议，独立 BrowserWindow（file:// 上下文）无法加载。
  glassResolveAppUrl(u) {
    const s = String(u || '');
    if (!s.startsWith('app://')) return s;
    const rest = s.slice('app://'.length);
    const slash = rest.indexOf('/');
    if (slash < 0) return s;
    let p = rest.slice(slash + 1);
    const q = p.indexOf('?');
    if (q >= 0) p = p.slice(0, q);
    let abs;
    try { abs = decodeURIComponent(p); } catch { abs = p; }
    try { return require('url').pathToFileURL(abs).href; } catch { return s; }
  }

  // 把快照子树里所有 app:// 引用（img src + 内联 background-image + CSS 变量）就地转成 file://
  glassRewriteAssetUrls(root) {
    root.querySelectorAll('img[src]').forEach(img => {
      img.setAttribute('src', this.glassResolveAppUrl(img.getAttribute('src')));
      img.removeAttribute('loading');
    });
    const fixStyle = el => {
      const st = el.getAttribute && el.getAttribute('style');
      if (st && st.includes('app://')) {
        el.setAttribute('style', st.replace(/app:\/\/[^\s"')]+/g, m => this.glassResolveAppUrl(m)));
      }
    };
    fixStyle(root);
    root.querySelectorAll('[style*="app://"]').forEach(fixStyle);
  }

  // 在离屏容器里完整渲染一次月历，序列化 .mjb-root 的静态 HTML，
  // 并逐格 click 捕获每天右栏详情，供玻璃窗实现「点击切换」。
  async renderGlassSnapshotRoot(targetMonth) {
    const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
    const host = document.body.createDiv();
    host.setAttribute('style', 'position:fixed;left:-100000px;top:0;width:1180px;pointer-events:none;opacity:0;z-index:-1;');
    let savedStateRaw = null, stateOverridden = false, stateKey = null;
    try {
      const { config, dv } = await this.loadBoardRenderContext(host);
      // 临时把目标月份写进 localStorage，让渲染器渲染指定月；快照结束后原样还原，
      // 不影响用户主看板的真实状态（主看板不会因 localStorage 变动自动重渲）。
      if (targetMonth && Number.isInteger(targetMonth.year) && Number.isInteger(targetMonth.month)) {
        stateKey = config.stateKey || DEFAULT_CONFIG.stateKey;
        try {
          savedStateRaw = localStorage.getItem(stateKey);
          const st = savedStateRaw ? JSON.parse(savedStateRaw) : {};
          st.year = targetMonth.year;
          st.month = targetMonth.month;
          st.selectedDate = `${targetMonth.year}-${String(targetMonth.month + 1).padStart(2, '0')}-01`;
          localStorage.setItem(stateKey, JSON.stringify(st));
          stateOverridden = true;
        } catch (e) { console.error('[Monthly Board] glass month override failed', e); }
      }
      await this.loadRenderer().render({ app: this.app, dv, container: host, config });
      // 等渲染 + 图片(app://)落定
      await sleep(450);
      const root = host.querySelector('.mjb-root') || host.querySelector('.monthly-journal-board');
      if (!root) throw new Error('快照渲染失败：找不到 .mjb-root。');

      // ── 逐格捕获每天右栏（详情 + 笔记），asset url 即时重写为 file:// ──
      const details = {};
      const detailEl = root.querySelector('.mjb-side .mjb-detail');
      const noteEl = root.querySelector('.mjb-side .mjb-note-area');
      const cells = Array.from(root.querySelectorAll('.mjb-day[data-date]'));
      const selStart = root.querySelector('.mjb-day.is-selected[data-date]');
      const origDate = (selStart && selStart.getAttribute('data-date'))
        || (cells[0] && cells[0].getAttribute('data-date')) || '';
      if (detailEl) {
        for (const cell of cells) {
          const date = cell.getAttribute('data-date');
          try { cell.click(); } catch (e) { /* noop */ }
          await sleep(130);
          this.glassRewriteAssetUrls(detailEl);
          details[date] = {
            detail: detailEl.innerHTML,
            note: noteEl ? (noteEl.value || '') : '',
            ph: noteEl ? (noteEl.placeholder || '') : '',
          };
        }
        // 复位到原选中日，保证默认渲染 = 原状态，state.selectedDate 不被改写
        const origCell = origDate && root.querySelector('.mjb-day[data-date="' + origDate + '"]');
        if (origCell) { try { origCell.click(); } catch (e) {} await sleep(150); }
      }

      this.glassRewriteAssetUrls(root);
      return { rootHtml: root.outerHTML, details };
    } finally {
      if (stateOverridden && stateKey) {
        try {
          if (savedStateRaw === null) localStorage.removeItem(stateKey);
          else localStorage.setItem(stateKey, savedStateRaw);
        } catch (e) { console.error('[Monthly Board] glass state restore failed', e); }
      }
      host.remove();
    }
  }

  buildGlassHtml(rootHtml, details, monthInfo) {
    const styleNode = document.getElementById('monthly-journal-board-style');
    const css = (styleNode && styleNode.textContent) || '';
    const vaultName = this.app.vault.getName();
    const mi = monthInfo || this.defaultGlassMonth();
    const label = `${mi.year}年${mi.month + 1}月`;
    const script = GLASS_RUNTIME_JS
      .replace(/__VAULT__/g, encodeURIComponent(vaultName))
      .replace(/__YEAR__/g, String(mi.year))
      .replace(/__MONTH__/g, String(mi.month));
    // 嵌入每天右栏详情 JSON，转义 < 以免提前闭合 script。
    const detailsJson = JSON.stringify(details || {}).replace(/</g, '\\u003c');
    return '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>' + css + '</style><style>' + GLASS_CHROME_CSS + '</style></head><body>'
      + '<div class="mjbg-shell">'
      + '<div class="mjbg-chrome">'
      + '<div class="mjbg-nav">'
      + '<button class="mjbg-btn" data-act="prev" title="上一月">&#8249;</button>'
      + '<span class="mjbg-title" id="mjbg-month-label">' + label + '</span>'
      + '<button class="mjbg-btn" data-act="next" title="下一月">&#8250;</button>'
      + '<button class="mjbg-btn" data-act="today" title="回到本月">&#8226;</button>'
      + '</div>'
      + '<div class="mjbg-actions">'
      + '<button class="mjbg-btn" data-act="refresh" title="刷新数据">&#8635;</button>'
      + '<button class="mjbg-btn" data-act="pin" title="置顶切换">&#128204;</button>'
      + '<button class="mjbg-btn" data-act="close" title="关闭">&#10005;</button>'
      + '</div></div>'
      + '<div class="mjbg-stage"><div class="mjbg-fit"><div class="mjbg-sizer">' + rootHtml + '</div></div></div>'
      + '<div class="mjbg-loading" id="mjbg-loading"><div class="mjbg-spinner"></div><div class="mjbg-loading-txt">载入中…</div></div>'
      + '<div class="mjbg-busy" id="mjbg-busy"></div>'
      + '</div>'
      + '<script type="application/json" id="mjbg-day-details">' + detailsJson + '</' + 'script>'
      + '<script>' + script + '</' + 'script></body></html>';
  }

  async writeGlassHtml(opts) {
    const fs = require('fs');
    const { html } = this.glassPaths();
    if (!this.glassMonth) this.glassMonth = this.defaultGlassMonth();
    const { rootHtml, details } = await this.getGlassSnapshot(this.glassMonth, opts);
    fs.writeFileSync(html, this.buildGlassHtml(rootHtml, details, this.glassMonth), 'utf8');
    return html;
  }

  // 月份快照缓存（方案2）：翻月优先复用已拍过的月（opts.cache=true），秒开不重渲；
  // 首开/刷新走实拍并覆盖缓存。缓存上限 6 个月（覆盖前后几个月秒翻足够，内存峰值 <~6MB），
  // 超出按最早插入淘汰；存的是纯文本（HTML+详情文字），图片走 file:// 引用不进内存；
  // 关窗即整体清空（invalidateGlassCache），不开窗 = 0 占用。
  async getGlassSnapshot(month, opts) {
    opts = opts || {};
    if (!this.glassCache) this.glassCache = new Map();
    const key = month.year + '-' + month.month;
    if (opts.cache && this.glassCache.has(key)) return this.glassCache.get(key);
    const snap = await this.renderGlassSnapshotRoot(month);
    this.glassCache.delete(key);
    this.glassCache.set(key, snap);
    if (this.glassCache.size > 6) {
      const oldest = this.glassCache.keys().next().value;
      this.glassCache.delete(oldest);
    }
    return snap;
  }

  // 预热：当前月显示完后，后台悄悄把前一月 / 后一月也拍进缓存，让翻月秒开。
  // - 延迟 350ms 触发，先让当前页丝滑显示，避免抢 CPU 造成当前页卡顿；
  // - 串行预拍（一个拍完再拍下一个），不并发；
  // - token 机制：每次预热递增 token，用户快速连翻时旧预热在 await 边界自动让位，不堆积；
  // - 已缓存的邻月直接跳过；窗口已关或销毁则停止。
  prefetchAround(month) {
    if (!month) return;
    const token = (this._prefetchToken = (this._prefetchToken || 0) + 1);
    const shift = (delta) => {
      let y = month.year, m = month.month + delta;
      while (m < 0) { m += 12; y--; }
      while (m > 11) { m -= 12; y++; }
      return { year: y, month: m };
    };
    const targets = [shift(-1), shift(1)];
    const run = async () => {
      for (const m of targets) {
        if (token !== this._prefetchToken) return; // 有更新的翻月，放弃这轮旧预热
        if (!this.glassWin || (this.glassWin.isDestroyed && this.glassWin.isDestroyed())) return;
        if (!this.glassCache) this.glassCache = new Map();
        const key = m.year + '-' + m.month;
        if (this.glassCache.has(key)) continue; // 已缓存，跳过
        try { await this.getGlassSnapshot(m, { cache: true }); }
        catch (e) { console.error('[Monthly Board] prefetch failed', e); }
      }
    };
    window.setTimeout(() => { run().catch(() => {}); }, 350);
  }

  // 主看板数据可能已变，清空缓存让翻月重新实拍。
  invalidateGlassCache() { if (this.glassCache) this.glassCache.clear(); }

  startGlassRefreshWatch() {
    if (this.glassWatching) return;
    const fs = require('fs');
    const { flag, nav } = this.glassPaths();
    try { if (!fs.existsSync(flag)) fs.writeFileSync(flag, '0', 'utf8'); } catch {}
    try { if (!fs.existsSync(nav)) fs.writeFileSync(nav, '0', 'utf8'); } catch {}
    try {
      fs.watchFile(flag, { interval: 600 }, (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        this.refreshGlassBoard({ force: true }).catch(error => console.error('[Monthly Board] glass refresh failed', error));
      });
      fs.watchFile(nav, { interval: 400 }, (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        this.handleGlassNav().catch(error => console.error('[Monthly Board] glass nav failed', error));
      });
      this.glassFlagPath = flag;
      this.glassNavPath = nav;
      this.glassWatching = true;
    } catch (error) {
      console.warn('[Monthly Board] glass watch failed', error);
    }
  }

  stopGlassRefreshWatch() {
    const fs = require('fs');
    if (this.glassFlagPath) { try { fs.unwatchFile(this.glassFlagPath); } catch {} }
    if (this.glassNavPath) { try { fs.unwatchFile(this.glassNavPath); } catch {} }
    this.glassFlagPath = null;
    this.glassNavPath = null;
    this.glassWatching = false;
  }

  // 玻璃窗翻月：读取 nav flag 里的目标月份，更新 glassMonth 后重渲快照。
  async handleGlassNav() {
    if (!this.glassWin || (this.glassWin.isDestroyed && this.glassWin.isDestroyed())) return;
    const fs = require('fs');
    const { nav } = this.glassPaths();
    let raw = '';
    try { raw = fs.readFileSync(nav, 'utf8'); } catch { return; }
    const m = String(raw).split('|')[0].trim().match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    if (!Number.isInteger(year) || month < 0 || month > 11) return;
    this.glassMonth = { year, month };
    await this.refreshGlassBoard({ cache: true });
  }

  async refreshGlassBoard(opts) {
    opts = opts || {};
    if (!this.glassWin || (this.glassWin.isDestroyed && this.glassWin.isDestroyed())) return;
    if (opts.force) this.invalidateGlassCache();
    const html = await this.writeGlassHtml(opts);
    try { await this.glassWin.loadFile(html); } catch (error) { console.error('[Monthly Board] glass reload failed', error); }
    // 当前月已显示，后台预热前后两月（不阻塞）
    this.prefetchAround(this.glassMonth);
  }

  async openGlassBoard() {
    if (this.glassWin && !(this.glassWin.isDestroyed && this.glassWin.isDestroyed())) {
      try { this.glassWin.show(); this.glassWin.focus(); } catch {}
      await this.refreshGlassBoard({ force: true });
      return;
    }

    let remote = null;
    try { remote = require('@electron/remote'); }
    catch { try { remote = require('electron').remote; } catch {} }
    const BrowserWindow = remote && remote.BrowserWindow;
    if (!BrowserWindow) throw new Error('无法访问 Electron BrowserWindow（@electron/remote 不可用）。');

    this.glassMonth = this.defaultGlassMonth();
    const html = await this.writeGlassHtml();
    const ext = normalizeExternalWindowSettings(this.settings.externalWindow);
    const onTop = ext.alwaysOnTop !== false;

    const win = new BrowserWindow({
      width: ext.width,
      height: ext.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: true,
      maximizable: false,
      minimizable: true,
      fullscreenable: false,
      skipTaskbar: false,
      alwaysOnTop: onTop,
      title: 'Monthly Board',
      webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false },
    });

    try { remote.enable && remote.enable(win.webContents); } catch {}
    try { win.setMenuBarVisibility(false); } catch {}
    // 不要 setBackgroundMaterial('acrylic')：Windows 上 acrylic 按整个矩形窗口绘制，
    // 会无视 CSS 圆角画出一圈方灰底。玻璃质感完全交给 CSS 的 backdrop-filter blur。
    if (onTop) { try { win.setAlwaysOnTop(true, 'floating'); } catch {} }

    this.glassWin = win;
    win.on('closed', () => { if (this.glassWin === win) { this.glassWin = null; this.stopGlassRefreshWatch(); this.invalidateGlassCache(); } });

    await win.loadFile(html);
    this.startGlassRefreshWatch();
    // 首开完成，后台预热前后两月，翻月即秒开
    this.prefetchAround(this.glassMonth);
  }

  closeGlassBoard() {
    this.stopGlassRefreshWatch();
    if (this.glassWin && !(this.glassWin.isDestroyed && this.glassWin.isDestroyed())) {
      try { this.glassWin.close(); } catch {}
    }
    this.glassWin = null;
  }





  enforceReadingModeSoon() {
    if (!this.settings.forceReadingMode) return;
    if (this.readingModeTimer) window.clearTimeout(this.readingModeTimer);
    this.readingModeTimer = window.setTimeout(() => this.enforceReadingMode().catch(console.error), 80);
  }

  async enforceReadingMode() {
    if (!this.settings.forceReadingMode) return;
    const activeLeaf = this.app.workspace.getActiveLeaf?.();
    const view = activeLeaf?.view instanceof MarkdownView ? activeLeaf.view : null;
    const file = view?.file;
    if (!view || !file || file.extension !== 'md') return;
    const raw = await this.app.vault.cachedRead(file);
    if (!/^\s*```monthly-board\b/m.test(raw)) return;
    if (view.getMode?.() === 'preview') return;
    const state = Object.assign({}, view.getState?.() || {}, { file: file.path, mode: 'preview' });
    if (view.leaf?.setViewState) await view.leaf.setViewState({ type: 'markdown', state, active: true });
    else if (view.setState) await view.setState(state, { history: false });
  }

  getDataviewShim(el, sourcePath) {
    const dataview = this.app.plugins?.plugins?.dataview?.api;
    if (!dataview) throw new Error('Monthly Board requires the Dataview plugin to be enabled.');
    return {
      container: el,
      current: () => ({ file: { path: sourcePath } }),
      pages: query => dataview.pages.call(dataview, query),
    };
  }

  async loadBoardRenderContext(container) {
    const entry = await this.getMonthlyBoardEntry();
    const config = await this.loadJsonConfig(entry.configPath);
    config.plugin = Object.assign({}, config.plugin, { writeNotesToMarkdown: !!this.settings.writeNotesToMarkdown });
    return { entry, config, dv: this.getDataviewShim(container, entry.sourcePath) };
  }

  async renderBoard(source, el, ctx) {
    el.empty();
    try {
      const options = parseCodeBlock(source);
      const config = await this.loadJsonConfig(options.config || this.settings.configPath);
      config.plugin = Object.assign({}, config.plugin, {
        writeNotesToMarkdown: !!this.settings.writeNotesToMarkdown,
      });
      const dv = this.getDataviewShim(el, ctx.sourcePath);
      const monthlyBoard = this.loadRenderer();
      await monthlyBoard.render({ app: this.app, dv, container: el, config });
    } catch (error) {
      const box = el.createDiv();
      box.setAttr('style', 'padding:16px;border:1px solid var(--background-modifier-error);border-radius:12px;background:var(--background-secondary);white-space:pre-wrap;');
      box.setText('Monthly Board failed: ' + (error && error.message ? error.message : String(error)));
      console.error(error);
    }
  }

  toggleFloatingBoard() {
    if (this.floatingPanel?.isConnected) {
      this.closeFloatingBoard();
      return;
    }
    this.openFloatingBoard().catch(error => {
      new Notice('Monthly Board floating panel failed: ' + (error?.message || error));
      console.error(error);
    });
  }

  closeFloatingBoard() {
    this.floatingPanel?.remove();
    this.floatingPanel = null;
  }

  async openFloatingBoard() {
    this.closeFloatingBoard();
    this.ensureFloatingStyles();
    const panel = document.body.createDiv({ cls: 'monthly-board-floating-panel' });
    const header = panel.createDiv({ cls: 'monthly-board-floating-head' });
    header.createSpan({ text: 'Monthly Board' });
    const buttons = header.createDiv({ cls: 'monthly-board-floating-buttons' });
    const refresh = buttons.createEl('button', { text: '↻', attr: { 'aria-label': 'Refresh floating monthly board' } });
    const minimize = buttons.createEl('button', { text: '−', attr: { 'aria-label': 'Minimize floating monthly board' } });
    const close = buttons.createEl('button', { text: '×', attr: { 'aria-label': 'Close floating monthly board' } });
    const body = panel.createDiv({ cls: 'monthly-board-floating-body' });
    this.floatingPanel = panel;
    refresh.onclick = () => this.renderFloatingBoard(body).catch(console.error);
    minimize.onclick = () => panel.classList.toggle('is-minimized');
    close.onclick = () => this.closeFloatingBoard();
    this.installFloatingDrag(panel, header);
    await this.renderFloatingBoard(body);
  }

  async renderFloatingBoard(container) {
    container.empty();
    const { config, dv } = await this.loadBoardRenderContext(container);
    await this.loadRenderer().render({ app: this.app, dv, container, config });
  }

  ensureFloatingStyles() {
    if (document.getElementById('monthly-board-floating-style')) return;
    const style = document.createElement('style');
    style.id = 'monthly-board-floating-style';
    style.textContent = `.monthly-board-floating-panel{position:fixed;right:18px;bottom:18px;width:min(620px,calc(100vw - 36px));height:min(560px,calc(100vh - 36px));z-index:60;display:flex;flex-direction:column;border:1px solid var(--background-modifier-border);border-radius:16px;background:rgba(var(--mono-rgb-0),.86);box-shadow:0 16px 48px rgba(0,0,0,.28);backdrop-filter:blur(16px);overflow:hidden;resize:both}.monthly-board-floating-panel.is-minimized{width:260px!important;height:42px!important}.monthly-board-floating-panel.is-minimized .monthly-board-floating-body{display:none}.monthly-board-floating-head{height:38px;flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 8px 0 12px;cursor:move;background:rgba(var(--mono-rgb-100),.08);font-size:12px;font-weight:800;color:var(--text-muted);user-select:none}.monthly-board-floating-buttons{display:flex;gap:4px}.monthly-board-floating-buttons button{border:1px solid var(--background-modifier-border);border-radius:999px;background:var(--background-secondary);color:var(--text-muted);font-size:12px;line-height:1;min-width:24px;height:24px;cursor:pointer}.monthly-board-floating-body{flex:1 1 auto;min-height:0;overflow:hidden}.monthly-board-floating-body .monthly-journal-board{height:100%!important;max-height:100%!important}.monthly-board-floating-body .mjb-zoom-viewport{height:100%!important;max-height:100%!important}`;
    document.head.appendChild(style);
  }

  installFloatingDrag(panel, handle) {
    let drag = null;
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const rect = panel.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!drag) return;
      const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, drag.left + event.clientX - drag.x));
      const top = Math.max(0, Math.min(window.innerHeight - 42, drag.top + event.clientY - drag.y));
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    handle.addEventListener('pointerup', event => {
      drag = null;
      try { handle.releasePointerCapture(event.pointerId); } catch {}
    });
  }

};

class MonthlyBoardSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Monthly Board' });

    new Setting(containerEl)
      .setName('Default config path')
      .setDesc('Relative path to a JSON config file in this vault.')
      .addText(text => text
        .setPlaceholder('_tools/monthly-board/monthly-board.config.json')
        .setValue(this.plugin.settings.configPath)
        .onChange(async value => {
          const next = value.trim() || DEFAULT_SETTINGS.configPath;
          if (!isSafeVaultPath(next) || !next.endsWith('.json')) {
            new Notice('Monthly Board config must be a relative .json path.');
            return;
          }
          this.plugin.settings.configPath = normalizePath(next);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Floating board source note')
      .setDesc('Relative .md note path used by both in-app and external floating Monthly Board windows.')
      .addText(text => text
        .setPlaceholder('Journal/月历总览.md')
        .setValue(this.plugin.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath)
        .onChange(async value => {
          const next = value.trim() || DEFAULT_SETTINGS.floatingSourcePath;
          if (!isSafeVaultPath(next) || !next.endsWith('.md')) {
            new Notice('Floating source must be a relative .md path.');
            return;
          }
          this.plugin.settings.floatingSourcePath = normalizePath(next);
          await this.plugin.saveSettings();
        }));



    new Setting(containerEl)
      .setName('Force reading mode for Monthly Board notes')
      .setDesc('When opening a note containing a monthly-board code block, switch that tab back to Reading view.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.forceReadingMode)
        .onChange(async value => {
          this.plugin.settings.forceReadingMode = value;
          await this.plugin.saveSettings();
          this.plugin.enforceReadingModeSoon();
        }));

    new Setting(containerEl)
      .setName('Legacy monthly Notes toggle')
      .setDesc('Notes now save to the selected daily note automatically. This legacy toggle only affects old monthly-note storage.')
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.writeNotesToMarkdown)
        .onChange(async value => {
          this.plugin.settings.writeNotesToMarkdown = value;
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: '玻璃悬浮窗 (Glass board)' });
    containerEl.createEl('p', {
      text: '透明无边框、Win11 亚克力毛玻璃的独立桌面窗口。显示当前月历快照（静态），点格子用 obsidian:// 跳回 Obsidian 编辑；窗内 ↻ 刷新数据、📌 置顶、✕ 关闭。',
      attr: { style: 'margin:.2em 0 .8em;color:var(--text-muted);font-size:12px;line-height:1.5;' },
    });

    new Setting(containerEl)
      .setName('Glass window width / height')
      .setDesc('玻璃悬浮窗初始尺寸（px）。')
      .addText(text => text
        .setPlaceholder('860')
        .setValue(String(this.plugin.settings.externalWindow.width))
        .onChange(async value => {
          this.plugin.settings.externalWindow.width = clampNumber(value, 420, 2200, DEFAULT_SETTINGS.externalWindow.width);
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('680')
        .setValue(String(this.plugin.settings.externalWindow.height))
        .onChange(async value => {
          this.plugin.settings.externalWindow.height = clampNumber(value, 360, 1600, DEFAULT_SETTINGS.externalWindow.height);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Glass window always on top')
      .setDesc('打开时默认置顶（可在窗内用 📌 切换）。')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.externalWindow.alwaysOnTop !== false)
        .onChange(async value => {
          this.plugin.settings.externalWindow.alwaysOnTop = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('打开玻璃悬浮窗')
      .setDesc('等同命令面板里的 “Open glass monthly board”。')
      .addButton(btn => btn
        .setButtonText('打开 / 刷新玻璃窗')
        .setCta()
        .onClick(() => this.plugin.openGlassBoard().catch(error => this.plugin.showFailure('Glass board open failed', error))));
  }
}
