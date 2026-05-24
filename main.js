const { Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require('obsidian');

const DEFAULT_SETTINGS = {
  configPath: '_tools/monthly-board/monthly-board.config.json',
};

function parseCodeBlock(source) {
  const result = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function isSafeVaultPath(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 240) return false;
  if (/^[a-z]+:/i.test(raw) || raw.startsWith('/') || raw.startsWith('\\\\')) return false;
  const normalized = normalizePath(raw);
  return normalized && !normalized.split('/').includes('..');
}

function createMonthlyBoardRenderer() {
  const module = { exports: {} };
  const exports = module.exports;

const DEFAULT_CONFIG = {
  stateKey: 'obsidian-monthly-journal-board:v1',
  version: 'v2026-05-24 23:58 simple-whole-zoom',
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
    options: [['garden','绿野'], ['paper','纸页'], ['night','夜空'], ['rose','玫瑰'], ['custom','自定背景']],
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
  imageCovers: {},
  imageFocus: {},
  imageToolsOpen: {},
}, loadState());

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
function extractImageFromRaw(raw, filePath) {
  const candidates = [];
  const text = String(raw || '');
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) candidates.push(`[[${m[1]}]]`);

  for (const candidate of candidates) {
    const val = String(candidate || '').trim();
    if (!val) continue;
    if (/^https?:\/\//i.test(val)) return val;
    const wiki = val.match(/^\[\[([^\]]+)\]\]$/);
    const link = wiki ? wiki[1] : val;
    const clean = link.split('|')[0].split('#')[0].trim();
    const dest = resolveImageFile(clean, filePath);
    if (dest) return app.vault.getResourcePath(dest);
  }
  return '';
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
  if (patch.image && !current.images.includes(patch.image)) current.images.push(patch.image);
  if (patch.path && !current.path) current.path = patch.path;
  if (patch.raw) current.raw = patch.raw;
  if (patch.essay) current.essay = patch.essay;
  const preferred = state.imageCovers?.[date];
  const preferredKey = imageKey(preferred);
  current.image = preferredKey ? (current.images.find(img => imageKey(img) === preferredKey) || current.images[0] || '') : (current.images[0] || '');
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
  if (image) state.imageCovers[dateStr] = imageKey(image);
  else delete state.imageCovers[dateStr];
  saveState(state);
}
function clampZoom(value) {
  const zoom = Number(value);
  return Math.max(0.65, Math.min(1.8, Number.isFinite(zoom) ? zoom : 1));
}
function zoomLabel() {
  return `${Math.round(clampZoom(state.zoom) * 100)}%`;
}
function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}
function applyBoardZoom(canvas, label) {
  const zoom = clampZoom(state.zoom);
  if (canvas) {
    canvas.style.zoom = '';
    canvas.style.transform = `scale(${zoom})`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.width = '100%';
  }
  if (label) setText(label, zoomLabel());
}
function setBoardZoom(value, canvas, label) {
  state.zoom = clampZoom(value);
  saveState(state);
  applyBoardZoom(canvas, label);
}
function installZoomGestures(viewport, canvas, label) {
  let pinch = null;
  viewport.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 2) return;
    pinch = { distance: touchDistance(ev.touches), zoom: clampZoom(state.zoom) };
    ev.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchmove', ev => {
    if (!pinch || ev.touches.length !== 2) return;
    const nextDistance = touchDistance(ev.touches);
    if (nextDistance > 0 && pinch.distance > 0) setBoardZoom(pinch.zoom * nextDistance / pinch.distance, canvas, label);
    ev.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', ev => {
    if (ev.touches.length < 2) pinch = null;
  }, { passive: true });
  viewport.addEventListener('wheel', ev => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 0.92 : 1.08;
    setBoardZoom(clampZoom(state.zoom) * factor, canvas, label);
  }, { passive: false });
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
${handFontFace}.monthly-journal-board .markdown-preview-section { max-width: 100% !important; }
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
  min-height: 760px;
  padding: 24px;
  border-radius: 28px;
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
.mjb-root[data-theme="custom"] { --mjb-ink: #f7fbff; --mjb-muted: rgba(247,251,255,.80); --mjb-accent: #e7f1ff; --mjb-accent-2: #a9d28f; --mjb-card: rgba(255,255,255,.16); --mjb-line: rgba(255,255,255,.30); background-image: var(--mjb-bg-image); background-size: cover; background-position: center; }
.mjb-root[data-theme="custom"] .mjb-head { padding: 14px 16px; margin: -8px -8px 18px; border-radius: 26px; background: linear-gradient(90deg, rgba(7,14,24,.22), rgba(7,14,24,.10) 58%, transparent); }
.mjb-root[data-theme="custom"] .mjb-title { color: #f4f8ff; text-shadow: 0 3px 14px rgba(0,0,0,.72), 0 0 2px rgba(0,0,0,.95); }
.mjb-root[data-theme="custom"] .mjb-subtitle,
.mjb-root[data-theme="custom"] .mjb-weekdays { color: rgba(247,251,255,.88); text-shadow: 0 2px 7px rgba(0,0,0,.72), 0 0 1px rgba(0,0,0,.9); }
.mjb-root[data-theme="custom"] .mjb-month-tab { color: rgba(247,251,255,.88); background: rgba(15,27,43,.28); text-shadow: 0 1px 4px rgba(0,0,0,.45); }
.mjb-root[data-theme="custom"] .mjb-month-tab.is-active { color: #19324a; background: rgba(238,247,255,.92); text-shadow: none; }
.mjb-zoom-viewport { width: 100%; overflow: auto; touch-action: pan-x pan-y; overscroll-behavior: contain; }
.mjb-zoom-canvas { transform-origin: top left; width: 100%; will-change: transform; }
.mjb-zoom-controls { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--mjb-line); border-radius: 999px; padding: 2px; background: rgba(255,255,255,.28); backdrop-filter: blur(10px); }
.mjb-zoom-controls button { min-width: 30px; padding: 5px 8px; }
.mjb-zoom-reset { min-width: 48px !important; }
.mjb-root::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(rgba(255,255,255,.35) 0.7px, transparent 0.7px); background-size: 5px 5px; opacity: .24; }
.mjb-head, .mjb-main { position: relative; z-index: 1; }
.mjb-head { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.mjb-title { font-size: clamp(38px, 6vw, 78px); line-height: .86; font-family: Georgia, 'Times New Roman', serif; letter-spacing: -2px; }
.mjb-title-link { color: inherit !important; text-decoration: none !important; cursor: pointer; border-radius: 14px; transition: background .16s ease, opacity .16s ease; }
.mjb-title-link:hover { background: rgba(255,255,255,.22); opacity: .88; }
.mjb-subtitle { color: var(--mjb-muted); font-size: 12px; letter-spacing: .18em; text-transform: uppercase; margin-top: 8px; }
.mjb-controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 580px; }
.mjb-controls button, .mjb-controls select, .mjb-controls input { border: 1px solid var(--mjb-line); background: rgba(255,255,255,.45); color: var(--mjb-ink); border-radius: 999px; padding: 7px 12px; font-size: 12px; backdrop-filter: blur(10px); }
.mjb-controls select option { color: #263347; background: #f7f1e8; }
.mjb-root[data-theme="night"] .mjb-controls select option { color: #223047; background: #edf3fb; }
.mjb-controls button { cursor: pointer; font-weight: 700; }
.mjb-controls input { min-width: 190px; }
.mjb-month-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 18px; }
.mjb-month-tab { border: 0; border-radius: 999px; padding: 6px 10px; background: rgba(255,255,255,.32); color: var(--mjb-muted); cursor: pointer; }
.mjb-month-tab.is-active { color: white; background: var(--mjb-accent); box-shadow: 0 6px 20px rgba(80,120,70,.22); }
.mjb-main { display: grid; grid-template-columns: minmax(0, 1fr) 8px clamp(150px, 30%, var(--mjb-side)); gap: clamp(10px, 1.3vw, 16px); align-items: start; }
.mjb-root[data-side-hidden="true"] .mjb-main { grid-template-columns: minmax(0, 1fr) 0 48px; gap: 10px; }
.mjb-calendar { min-width: 0; }
.mjb-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: clamp(6px, .9vw, 10px); margin-bottom: 10px; color: var(--mjb-muted); font: 700 clamp(10px, 1.15vw, 13px) Georgia, serif; letter-spacing: .12em; }
.mjb-weekdays > div { text-align: center; border-bottom: 2px solid var(--mjb-line); padding-bottom: 8px; white-space: nowrap; }
.mjb-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: clamp(6px, .9vw, 10px); }
.mjb-day { position: relative; aspect-ratio: 1 / 1; min-height: 0; border: 1px solid var(--mjb-line); border-radius: clamp(12px, 1.4vw, 18px); background: var(--mjb-card); overflow: hidden; padding: 8px; cursor: pointer; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
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
.mjb-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(10px, 1vw, 12px); letter-spacing: .01em; color: var(--mjb-ink); background: linear-gradient(90deg, rgba(255,255,255,.24), rgba(255,255,255,.12)); border-radius: 8px; padding: 1px 5px; font-weight: 700; text-shadow: 0 1px 2px rgba(255,255,255,.72), 0 0 1px rgba(255,255,255,.85); box-shadow: 0 1px 4px rgba(0,0,0,.045); }
.mjb-day.has-image .mjb-item { color: #fff; background: linear-gradient(90deg, rgba(20,28,38,.30), rgba(20,28,38,.16)); text-shadow: 0 1px 4px rgba(0,0,0,.88), 0 0 1px rgba(0,0,0,.95); backdrop-filter: blur(.8px); }
.mjb-more { font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(10px, .95vw, 11px); color: var(--mjb-muted); margin-top: 1px; font-weight: 700; text-shadow: 0 1px 2px rgba(255,255,255,.62); }
.mjb-day.has-image .mjb-more { color: rgba(255,255,255,.95); text-shadow: 0 1px 4px rgba(0,0,0,.9), 0 0 1px rgba(0,0,0,.95); }
.mjb-photo-count { position: absolute; top: 7px; right: 7px; z-index: 3; display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border-radius: 999px; background: rgba(255,255,255,.68); color: #263347; font-size: 10px; font-weight: 800; box-shadow: 0 2px 10px rgba(0,0,0,.16); }
.mjb-pop { display: none; position: fixed; left: 0; top: 0; width: clamp(240px, 30vw, 360px); max-height: min(420px, calc(100vh - 48px)); overflow: auto; padding: 12px; border-radius: 16px; background: rgba(28, 39, 31, .94); color: #fff; box-shadow: 0 18px 42px rgba(0,0,0,.25); backdrop-filter: blur(10px); z-index: 9999; }
.mjb-pop.is-visible { display: block; }
.mjb-pop-title { font-weight: 800; margin-bottom: 7px; }
.mjb-pop ul { margin: 0; padding-left: 18px; }
.mjb-pop li { margin: 4px 0; font-size: 12px; }
.mjb-pop p { margin: 8px 0 0; font-size: 12px; color: rgba(255,255,255,.82); }
.mjb-pop a { color: #d9f1ff !important; }
.mjb-resizer { border-radius: 999px; background: linear-gradient(var(--mjb-line), var(--mjb-accent), var(--mjb-line)); opacity: .45; cursor: col-resize; }
.mjb-root[data-side-hidden="true"] .mjb-resizer { opacity: 0; pointer-events: none; }
.mjb-side { min-width: 0; max-height: min(76vh, 720px); position: sticky; top: 12px; display: flex; flex-direction: column; border: 1px solid var(--mjb-line); border-radius: 24px; padding: 16px; background: rgba(255,255,255,.46); backdrop-filter: blur(12px); overflow: hidden; transition: padding .18s ease, border-radius .18s ease, background .18s ease; }
.mjb-side.is-collapsed { min-width: 0; width: 48px; align-items: center; padding: 10px 6px; border-radius: 18px; cursor: pointer; }
.mjb-side-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; }
.mjb-side h3 { margin: 0; font-family: Georgia, serif; font-size: 28px; }
.mjb-side-toggle { border: 1px solid var(--mjb-line); border-radius: 999px; padding: 4px 8px; background: rgba(255,255,255,.34); color: var(--mjb-muted); cursor: pointer; font-size: 12px; font-weight: 850; line-height: 1; }
.mjb-side-toggle:hover { color: var(--mjb-ink); background: rgba(255,255,255,.54); }
.mjb-side.is-collapsed .mjb-side-head { writing-mode: vertical-rl; gap: 8px; margin: 0; }
.mjb-side.is-collapsed h3 { font-size: 15px; letter-spacing: .08em; }
.mjb-side.is-collapsed .mjb-side-toggle { padding: 6px 5px; }
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
.mjb-open-note { display: inline-flex; align-items: center; gap: 5px; padding: 6px 10px; border: 0; border-radius: 999px; background: var(--mjb-accent); color: #fff !important; text-decoration: none !important; font-size: 12px; font-weight: 800; cursor: pointer; }
.mjb-open-note:hover { filter: brightness(1.04); transform: translateY(-1px); }
.mjb-open-message { margin: 8px 0 0; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.38); color: var(--mjb-muted); font-size: 12px; white-space: pre-wrap; }
.mjb-open-message.is-error { color: #8a2f2f; background: rgba(255, 228, 228, .72); }
@container mjb-board (max-width: 720px) {
  .mjb-main { grid-template-columns: minmax(0, 1fr) 6px clamp(132px, 27%, 180px); gap: 8px; }
  .mjb-side { padding: 10px; border-radius: 18px; max-height: 70vh; }
  .mjb-side h3 { font-size: 20px; }
  .mjb-side-toggle { padding: 4px 7px; }
  .mjb-note-area { min-height: 64px; max-height: 96px; padding: 9px; font-size: 11px; margin-bottom: 10px; }
  .mjb-detail { font-size: 12px; padding-right: 2px; }
  .mjb-detail-list { padding-left: 14px; }
  .mjb-detail-image { max-height: 120px; border-radius: 14px; margin: 8px 0 10px; }
  .mjb-photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@container mjb-board (max-width: 560px) {
  .mjb-main { grid-template-columns: minmax(0, 1fr) 5px clamp(112px, 24%, 140px); gap: 6px; }
  .mjb-side { padding: 8px; border-radius: 16px; }
  .mjb-side h3 { font-size: 18px; }
  .mjb-note-area { min-height: 52px; max-height: 76px; padding: 8px; }
  .mjb-detail { font-size: 11px; }
  .mjb-detail-image { max-height: 96px; }
  .mjb-photo-tools { display: none; }
  .mjb-open-note { font-size: 11px; padding: 5px 8px; }
}
@media (max-width: 920px) { .mjb-main, .mjb-root[data-side-hidden="true"] .mjb-main { grid-template-columns: 1fr; } .mjb-resizer { display:none; } .mjb-side { position: static; max-height: 68vh; } .mjb-side.is-collapsed { width: auto; min-height: 44px; align-items: stretch; } .mjb-side.is-collapsed .mjb-side-head { writing-mode: horizontal-tb; } .mjb-grid { grid-auto-rows: minmax(100px, auto); } }
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
  if (day.path) {
    const open = configureInternalLink(make('a', 'internal-link mjb-open-note', '打开日记 ↗'), day.path);
    detail.appendChild(open);
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
        for (const src of day.images) {
          const choice = make('button', `mjb-photo-choice${src === day.image ? ' is-active' : ''}`);
          choice.title = '设为格子和右侧置顶照片';
          const thumb = make('img');
          thumb.loading = 'lazy';
          thumb.src = safeUrl(src);
          choice.appendChild(thumb);
          choice.onclick = async () => {
            setImageCover(dateStr, src);
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
  if (day.entries.length) {
    detail.appendChild(make('h4', '', '完成项'));
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
      ul.appendChild(li);
    }
    detail.appendChild(ul);
  }
  if (day.related?.length) {
    detail.appendChild(make('h4', '', '关联条目'));
    const ul = make('ul', 'mjb-detail-list');
    for (const item of day.related) {
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
      ul.appendChild(li);
    }
    detail.appendChild(ul);
  }
}

async function render() {
  installStyles();
  saveState(state);
  const monthData = await loadMonthData(state.year, state.month);
  if (!state.selectedDate || !state.selectedDate.startsWith(monthKey())) state.selectedDate = ymd(state.year, state.month, 1);

  const root = make('div', 'mjb-root');
  root.dataset.theme = state.theme;
  root.dataset.sideHidden = state.sideHidden ? 'true' : 'false';
  root.style.setProperty('--mjb-side', `${Math.max(150, Number(state.sideWidth) || 300)}px`);
  applyBackground(root, state.bg);

  const head = make('div', 'mjb-head');
  const titleWrap = make('div');
  const title = make('div', 'mjb-title');
  const monthPath = monthNotePath(state.year, state.month);
  const yearPath = yearNotePath(state.year);
  const monthTitle = make(monthPath ? 'a' : 'span', monthPath ? 'internal-link mjb-title-link' : '', MONTHS_CN[state.month]);
  if (monthPath) configureInternalLink(monthTitle, monthPath);
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
  zoomOut.onclick = () => setBoardZoom(clampZoom(state.zoom) - 0.1, null, zoomReset);
  zoomReset.onclick = () => setBoardZoom(1, null, zoomReset);
  zoomIn.onclick = () => setBoardZoom(clampZoom(state.zoom) + 0.1, null, zoomReset);
  zoomControls.append(zoomOut, zoomReset, zoomIn);
  controls.append(prevYear, nextYear, today, zoomControls, theme, ...presetButtons, bg);
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
      card.onclick = () => { state.selectedDate = dateStr; saveState(state); renderDetail(side, monthData, dateStr); grid.querySelectorAll('.mjb-day').forEach(el => el.classList.remove('is-selected')); card.classList.add('is-selected'); };
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
      const visible = allItems.slice(0, info?.image ? 2 : 3);
      for (const item of visible) items.appendChild(make('div', 'mjb-item', `${item.time ? item.time + ' ' : ''}${item.title}`));
      if (allItems.length > visible.length) items.appendChild(make('div', 'mjb-more', `+${allItems.length - visible.length} more`));
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
  sideToggle.onclick = ev => { ev.stopPropagation(); state.sideHidden = !state.sideHidden; saveState(state); render(); };
  sideHead.appendChild(sideToggle);
  side.appendChild(sideHead);
  side.onclick = () => { if (state.sideHidden) { state.sideHidden = false; saveState(state); render(); } };
  const noteArea = make('textarea', 'mjb-note-area');
  noteArea.placeholder = '本月随笔 / goals / notes…（保存在本机 Obsidian localStorage）';
  noteArea.value = state.monthNotes[monthKey()] || '';
  noteArea.oninput = () => { state.monthNotes[monthKey()] = noteArea.value; saveState(state); };
  side.appendChild(noteArea);
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
  const canvas = make('div', 'mjb-zoom-canvas');
  canvas.appendChild(root);
  viewport.appendChild(canvas);
  applyBoardZoom(canvas, zoomReset);
  installZoomGestures(viewport, canvas, zoomReset);
  ROOT.replaceChildren(viewport);
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

module.exports = class MonthlyBoardPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

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

    this.addSettingTab(new MonthlyBoardSettingTab(this.app, this));
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

  getDataviewShim(el, sourcePath) {
    const dataview = this.app.plugins?.plugins?.dataview?.api;
    if (!dataview) throw new Error('Monthly Board requires the Dataview plugin to be enabled.');
    return {
      container: el,
      current: () => ({ file: { path: sourcePath } }),
      pages: query => dataview.pages.call(dataview, query),
    };
  }

  async renderBoard(source, el, ctx) {
    el.empty();
    try {
      const options = parseCodeBlock(source);
      const config = await this.loadJsonConfig(options.config || this.settings.configPath);
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
          await this.plugin.saveData(this.plugin.settings);
        }));
  }
}
