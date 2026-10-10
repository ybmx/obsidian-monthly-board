const { MarkdownView, Notice, Plugin, PluginSettingTab, Setting, normalizePath } = require('obsidian');

// CSS injected only into the popout window's document, never the main Obsidian
// window. Hides Obsidian's tab bar / view header / breadcrumbs, kills the H1
// title and all chrome padding so the monthly board card sits flush in the
// popout frame.


const DEFAULT_SETTINGS = {
  configPath: '_tools/monthly-board/monthly-board.config.json',
  forceReadingMode: true,
  writeNotesToMarkdown: false,
  floatingSourcePath: 'Monthly Board.md',
  calendarGotoMonthlyBoard: true,
  strikeDoneItems: false,
  strikeDoneStatuses: [],
  sourcesOverride: null,
  sourcesCollapsed: false,
  quickAdd: {
    enabled: true,
    section: 'Glimpse of the day',
    template: '- **{time}** <span class="dt-status dt-status-done" title="完成">✓</span> {title}',
  },
  externalWindow: {
    width: 860,
    height: 680,
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

function getObsidianUILanguage() {
  try {
    const stored = window.localStorage.getItem('language');
    if (stored) return String(stored).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {}
  try {
    const loc = window.moment && typeof window.moment.locale === 'function' ? window.moment.locale() : '';
    if (loc) return String(loc).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) {}
  try {
    return String(navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch (e) { return 'en'; }
}

const MB_I18N = {
  en: {
    cmdInsert: 'Insert monthly board block',
    cmdInspect: 'Inspect monthly board entry',
    cmdToggleFloating: 'Toggle in-app floating monthly board',
    cmdHover: 'Open monthly board floating note (Hover Editor)',
    cmdPopout: 'Open monthly board in popout window',
    cmdRefit: 'Refit monthly board popout',
    cmdOpenGlass: 'Open glass monthly board',
    cmdOpenGlassSnapshot: 'Open glass monthly board (static snapshot)',
    cmdRefreshGlass: 'Refresh glass monthly board',
    noticeGlassFallback: 'Live glass board failed, fell back to static snapshot: ',
    failHover: 'Hover Editor open failed',
    failPopout: 'Popout open failed',
    failGlassOpen: 'Glass board open failed',
    failGlassRefresh: 'Glass board refresh failed',
    noticeEntryOk: 'Monthly Board entry OK: {src} -> {cfg}',
    noticeRefit: 'Monthly Board: refit {n} popout(s).',
    noticeFloatingFailed: 'Monthly Board floating panel failed: ',
    ariaRefresh: 'Refresh floating monthly board',
    ariaMinimize: 'Minimize floating monthly board',
    ariaClose: 'Close floating monthly board',
    setConfigName: 'Default config path',
    setConfigDesc: 'Relative path to a JSON config file in this vault.',
    noticeConfigPath: 'Monthly Board config must be a relative .json path.',
    setFloatSrcName: 'Floating board source note',
    setFloatSrcDesc: 'Relative .md note path used by both in-app and external floating Monthly Board windows.',
    noticeFloatSrc: 'Floating source must be a relative .md path.',
    setForceReadingName: 'Force reading mode for Monthly Board notes',
    setForceReadingDesc: 'When opening a note containing a monthly-board code block, switch that tab back to Reading view.',
    setLegacyName: 'Legacy monthly Notes toggle',
    setLegacyDesc: 'Notes now save to the selected daily note automatically. This legacy toggle only affects old monthly-note storage.',
    setCalGotoName: 'Calendar widget month-title opens Monthly Board',
    setCalGotoDesc: 'Clicking the month title (e.g. "Oct 2026") in the sidebar calendar widget opens the monthly board at that month. When off, clicks keep the calendar plugin\'s own behavior (create/open monthly note).',
    setStrikeDoneName: 'Strike through completed items',
    setStrikeDoneDesc: 'Items whose status is done are shown struck-through and grayed out in day cells and the detail panel. Off by default.',
    setStrikeListName: 'Extra status names treated as done',
    setStrikeListDesc: 'Comma-separated. Exact match on the status property value; built-in rules (完成/done/complete…) always apply too. Leave empty to use built-in only.',
    srcSecHeading: 'Related entry sources',
    srcSecDesc: 'Controls where "related entries" are read from and how they are grouped. Card order = group display order on the board (drag the ⋮⋮ handle to reorder). Editing here saves a settings override that takes precedence over the JSON config file.',
    srcDragHint: 'Drag to reorder (order = group display order)',
    srcFromFile: 'Current: JSON config file',
    srcFromOverride: 'Current: settings override (takes precedence over config file)',
    srcLoadFailed: 'Failed to load sources from the config file.',
    srcDelete: 'Delete',
    srcAdd: 'Add source',
    srcAddCond: 'Add condition',
    srcRestoreFile: 'Revert to config file',
    srcCondsLabel: 'Filter conditions (AND)',
    srcCollapse: 'Collapse this section',
    srcExpand: 'Expand this section',
    srcModeLabel: 'Read mode',
    srcModeFiles: 'Note files',
    srcModeTimeline: 'Daily-note timeline',
    srcModeHintTimeline: 'Reads timestamped list lines (e.g. - **19:30** ...) from daily notes. Mutually exclusive with file mode: entries already shown as done items are not counted again.',
    phSection: 'Heading (optional, e.g. Glimpse of the day; empty = whole note)',
    srcStatusFilter: 'Status filter',
    srcStatusAll: 'All',
    srcStatusDone: 'Done only',
    srcStatusOpen: 'Not done only',
    qaHeading: 'Quick add (write into daily note)',
    setQaEnabledName: 'Enable quick-add entry',
    setQaEnabledDesc: 'Shows a small input row in the day detail panel. Submitting appends a timestamped line to the day\'s daily note (default section: Glimpse of the day).',
    setQaSectionName: 'Target heading',
    setQaSectionDesc: 'The H2 heading in the daily note where new lines are appended. Created automatically when missing.',
    setQaTemplateName: 'Line template',
    setQaTemplateDesc: 'Placeholders: {time} {title}. Default matches the Notion-sync done format; use "- {time} {title}" for Day-Planner-style compatibility.',
    phLabel: 'Label (e.g. 生活)',
    phQuery: 'Dataview source, e.g. "Clippings"; empty = whole vault',
    phGroupBy: 'Group-by property (optional, e.g. 生活分类)',
    phDateFields: 'Date fields, comma-separated (optional)',
    phTitleField: 'Title property (optional)',
    phStatusField: 'Status property (optional)',
    phUrlField: 'URL property (optional)',
    phCondField: 'Property',
    phCondValue: 'Value',
    glassHeading: '玻璃悬浮窗 (Glass board)',
    glassIntro: 'Live borderless window (Win11 acrylic). Same live board as the note: switch months, select days, write notes; links open in the main window; data changes refresh automatically. ↻ re-render, 📌 always on top, ✕ close. The static snapshot version is still available as a separate command.',
    setGlassSizeName: 'Glass window width / height',
    setGlassSizeDesc: '玻璃悬浮窗初始尺寸（px）。',
    setGlassTopName: 'Glass window always on top',
    setGlassTopDesc: '打开时默认置顶（可在窗内用 📌 切换）。',
    setGlassOpenName: '打开玻璃悬浮窗',
    setGlassOpenDesc: '等同命令面板里的 “Open glass monthly board”。',
    glassOpenButton: '打开 / 刷新玻璃窗',
    setGlassLockName: '锁定玻璃窗内容',
    setGlassLockDesc: '开启后玻璃窗只显示月历：在它里面打开其他页面会被拉回月历。关闭则允许它像普通弹出窗口一样切换页面。',
  },
  zh: {
    cmdInsert: '插入月历看板代码块',
    cmdInspect: '检查月历看板条目',
    cmdToggleFloating: '开关应用内浮动月历看板',
    cmdHover: '在浮动笔记中打开月历看板（Hover Editor）',
    cmdPopout: '在弹出窗口中打开月历看板',
    cmdRefit: '重算月历看板弹窗缩放',
    cmdOpenGlass: '打开玻璃悬浮月历看板',
    cmdOpenGlassSnapshot: '打开玻璃悬浮月历看板（静态快照）',
    cmdRefreshGlass: '刷新玻璃悬浮月历看板数据',
    noticeGlassFallback: '实时玻璃窗打开失败，已回退到静态快照：',
    failHover: 'Hover Editor 打开失败',
    failPopout: '弹出窗口打开失败',
    failGlassOpen: '玻璃悬浮窗打开失败',
    failGlassRefresh: '玻璃悬浮窗刷新失败',
    noticeEntryOk: '月历看板条目正常：{src} -> {cfg}',
    noticeRefit: '月历看板：已重算 {n} 个弹窗的缩放。',
    noticeFloatingFailed: '月历看板浮动面板失败：',
    ariaRefresh: '刷新浮动月历看板',
    ariaMinimize: '最小化浮动月历看板',
    ariaClose: '关闭浮动月历看板',
    setConfigName: '默认配置文件路径',
    setConfigDesc: '仓库内 JSON 配置文件的相对路径。',
    noticeConfigPath: '月历看板配置必须是相对的 .json 路径。',
    setFloatSrcName: '浮动看板来源笔记',
    setFloatSrcDesc: '应用内浮动窗口和外部玻璃悬浮窗共用的 .md 笔记相对路径。',
    noticeFloatSrc: '浮动看板来源必须是相对的 .md 路径。',
    setForceReadingName: '强制月历看板笔记使用阅读模式',
    setForceReadingDesc: '打开包含 monthly-board 代码块的笔记时，自动切回阅读视图。',
    setLegacyName: '旧版月记 Notes 开关',
    setLegacyDesc: 'Notes 现在会自动保存到选中的日记。此旧开关仅影响老的月记存储方式。',
    setCalGotoName: '日历小部件月份标题跳转月历看板',
    setCalGotoDesc: '点击侧边日历小部件的月份标题（如「10月 2026」）时，打开月历看板笔记并切到对应月份。关闭后点击保持日历插件原有行为（创建/打开月记）。',
    setStrikeDoneName: '完成条目划线变灰',
    setStrikeDoneDesc: '状态为「完成」的条目在日期格子和右侧详情里显示为删除线+变灰。默认关闭。',
    setStrikeListName: '额外算作「完成」的状态名',
    setStrikeListDesc: '逗号分隔，精确匹配条目的状态属性值；内置规则（完成/已完成/done/complete）始终生效。留空=只用内置规则。',
    srcSecHeading: '关联条目来源',
    srcSecDesc: '决定「关联条目」从哪些笔记读取、如何分组。卡片顺序 = 看板上分组的显示顺序（拖 ⋮⋮ 手柄调整）。在这里编辑会保存为设置覆盖，优先于 JSON 配置文件。',
    srcDragHint: '拖拽调整顺序（顺序即分组显示顺序）',
    srcFromFile: '当前生效：JSON 配置文件',
    srcFromOverride: '当前生效：设置覆盖（优先于配置文件）',
    srcLoadFailed: '从配置文件读取来源失败。',
    srcDelete: '删除',
    srcAdd: '添加来源',
    srcAddCond: '添加条件',
    srcRestoreFile: '恢复使用配置文件',
    srcCondsLabel: '筛选条件（AND）',
    srcCollapse: '收起此模块',
    srcExpand: '展开此模块',
    srcModeLabel: '读取方式',
    srcModeFiles: '笔记文件',
    srcModeTimeline: '日记时间轴',
    srcModeHintTimeline: '从日记正文读取带时间戳的列表行（如 - **19:30** …），适合「不用文件记事件、全记在当天日记里」的用法。与文件模式互斥：已显示为完成项的条目不会重复计入。',
    phSection: '区域标题（可选，如 Glimpse of the day；留空=整篇日记）',
    srcStatusFilter: '状态筛选',
    srcStatusAll: '全部',
    srcStatusDone: '仅完成',
    srcStatusOpen: '仅未完成',
    qaHeading: '记一条（写入当天日记）',
    setQaEnabledName: '启用「记一条」',
    setQaEnabledDesc: '在右侧详情面板显示一个输入行，提交后把一条带时间戳的记录追加到当天日记（默认 Glimpse of the day 区域）。',
    setQaSectionName: '目标区域标题',
    setQaSectionDesc: '新行追加到日记里哪个二级标题下；不存在时自动创建。',
    setQaTemplateName: '行模板',
    setQaTemplateDesc: '占位符：{time} {title}。默认与 Notion 同步的完成格式一致；想兼容 Day Planner 类插件可改成 "- {time} {title}"。',
    phLabel: '标签（如 Clippings）',
    phQuery: 'Dataview 源，如 "Clippings"；留空=全库',
    phGroupBy: '分组属性（可选，如 category）',
    phDateFields: '日期字段，逗号分隔（可选）',
    phTitleField: '标题属性（可选）',
    phStatusField: '状态属性（可选）',
    phUrlField: '链接属性（可选）',
    phCondField: '属性名',
    phCondValue: '值',
    glassHeading: '玻璃悬浮窗 (Glass board)',
    glassIntro: '无边框实时窗口（Win11 亚克力）。和笔记里的月历是同一份实时渲染：可切月、选日期、写备注；点链接在主窗口打开；库里数据变化会自动刷新。窗内 ↻ 重新渲染、📌 置顶、✕ 关闭。旧的静态快照版保留为单独命令。',
    setGlassSizeName: '玻璃窗宽度 / 高度',
    setGlassSizeDesc: '玻璃悬浮窗初始尺寸（px）。',
    setGlassTopName: '玻璃窗默认置顶',
    setGlassTopDesc: '打开时默认置顶（可在窗内用 📌 切换）。',
    setGlassOpenName: '打开玻璃悬浮窗',
    setGlassOpenDesc: '等同命令面板里的“打开玻璃悬浮月历看板”。',
    glassOpenButton: '打开 / 刷新玻璃窗',
    setGlassLockName: '锁定玻璃窗内容',
    setGlassLockDesc: '开启后玻璃窗只显示月历：在它里面打开其他页面会被拉回月历。关闭则允许它像普通弹出窗口一样切换页面。',
  },
};

function t(key, vars) {
  const lang = getObsidianUILanguage();
  let s = (MB_I18N[lang] && MB_I18N[lang][key]) || MB_I18N.en[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

const SOURCE_WHERE_OPS = ['is', 'isNot', 'contains', 'notContains', 'exists', 'notExists', '>', '>=', '<', '<=', 'matches'];

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

function createMonthlyBoardRenderer() {
  const module = { exports: {} };
  const exports = module.exports;

const DEFAULT_CONFIG = {
  stateKey: 'obsidian-monthly-journal-board:v1',
  version: 'v2026-05-25 14:20 floating-panel',
  monthsCn: ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'],
  monthsEn: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  weekdays: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  dateFields: ['date', 'created', 'created_at', 'updated', 'modified_at', 'due', 'start', 'end'],
  journal: {
    query: '"Journal"',
    dailyFilePattern: '^\\d{4}-\\d{2}-\\d{2}$',
  },
  sources: [
    { query: '"Journal"', label: 'Journal' },
    { query: '"Projects"', label: 'Projects' },
    { query: '"Clippings"', label: 'Clippings' },
  ],
  periodicNotes: {
    year: ['Journal/{year}/{year}.md', '{year}.md'],
    month: [
      'Journal/{year}/{year}-Q{quarter}/{monthNameEn}, {year}/{monthNameEn}, {year}.md',
      '{monthNameEn}, {year}.md',
    ],
    week: [
      'Journal/{mondayYear}/{mondayYear}-Q{mondayQuarter}/{mondayMonthNameEn}, {mondayYear}/{isoYear}-W{week2}.md',
      '{isoYear}-W{week2}.md',
    ],
  },
  theme: {
    handwritingFont: '',
    options: [['garden','绿野'], ['paper','纸页'], ['night','夜空'], ['rose','玫瑰'], ['ao3','AO3档案'], ['archive','青档案'], ['custom','自定背景']],
    backgroundPresets: [],
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
  if (typeof window !== 'undefined' && !ROOT.dataset.mjbGotoBound) {
    ROOT.dataset.mjbGotoBound = '1';
    window.addEventListener('mjb-calendar-goto', ev => {
      const d = ev.detail;
      if (!d || !Number.isFinite(d.year) || !Number.isFinite(d.month)) return;
      state.year = d.year;
      state.month = d.month;
      state.selectedDate = ymd(d.year, d.month, 1);
      saveState(state);
      render();
    });
  }
  ROOT.style.width = '100%';
  ROOT.style.maxWidth = 'none';
  // popout/玻璃窗里不限高：100vh 是弹窗自己的高度，限高会把最后一行裁掉（表现为底部的"虚拟边缘"）
  // 手机上也不限高不裁切：手机是单列纵向布局，滚动交给页面本身（否则下面的 Notes/详情根本滑不到）
  const inPopoutRoot = !!(ROOT.ownerDocument && typeof document !== 'undefined' && ROOT.ownerDocument !== document);
  const noCap = inPopoutRoot || isMobileView();
  ROOT.style.maxHeight = noCap ? 'none' : 'calc(100vh - 92px)';
  ROOT.style.overflow = noCap ? 'visible' : 'hidden';
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
  const CUSTOM_THEMES = (Array.isArray(config.theme?.customThemes) ? config.theme.customThemes : [])
    .filter(t => t && /^[a-zA-Z0-9-]+$/.test(String(t.id || '')));
  const THEME_OPTIONS = [
    ...(config.theme?.options || DEFAULT_CONFIG.theme.options),
    ...CUSTOM_THEMES.map(t => [String(t.id), String(t.label || t.id)]),
  ];
  const BACKGROUND_PRESETS = config.theme?.backgroundPresets || [];
  const DAILY_FILE_RE = new RegExp(config.journal?.dailyFilePattern || DEFAULT_CONFIG.journal.dailyFilePattern);
  // popout（含实时玻璃窗）里渲染时：DOM 属于另一个 window，rAF/resize/样式都要跟随宿主窗口
  const ownerWin = () => (ROOT && ROOT.ownerDocument && ROOT.ownerDocument.defaultView) || window;
  const isInPopoutWindow = () => !!(ROOT && ROOT.ownerDocument && typeof document !== 'undefined' && ROOT.ownerDocument !== document);
  // popout 里点链接：在主窗口打开，避免把 popout 里的月历替换掉
  function openNoteLink(linktext, sourcePath) {
    const ws = app.workspace;
    if (!isInPopoutWindow()) return ws.openLinkText(linktext, sourcePath || '', false);
    let target = null;
    try { target = ws.getMostRecentLeaf ? ws.getMostRecentLeaf(ws.rootSplit) : null; } catch (e) {}
    const file = app.metadataCache.getFirstLinkpathDest(String(linktext || '').replace(/\.md$/i, ''), sourcePath || '');
    let result = null;
    if (target && file) {
      try { ws.setActiveLeaf(target, { focus: true }); } catch (e) {}
      const cur = target.view && target.view.file && target.view.file.path;
      const leaf = cur && sourcePath && cur === sourcePath ? ws.getLeaf('tab') : target;
      result = leaf.openFile(file);
    } else {
      result = ws.openLinkText(linktext, sourcePath || '', 'tab');
    }
    try { require('@electron/remote').getCurrentWindow().focus(); } catch (e) { try { window.focus(); } catch (_) {} }
    return result;
  }
// 在已打开的主窗口视图里滚动到指定行（编辑模式移动光标，阅读模式滚动预览）
function scrollMainWindowToLine(path, line) {
  const apply = () => {
    for (const leaf of app.workspace.getLeavesOfType?.('markdown') || []) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.file?.path !== path) continue;
      if (view.containerEl?.ownerDocument && typeof document !== 'undefined' && view.containerEl.ownerDocument !== document) continue;
      try { view.setEphemeralState?.({ line }); } catch (e) {}
      try { view.previewMode?.applyScroll?.(line); } catch (e) {}
      try {
        const ed = view.editor;
        if (ed) {
          ed.setCursor({ line, ch: 0 });
          ed.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: 0 } }, true);
        }
      } catch (e) {}
      return true;
    }
    return false;
  };
  if (!apply()) ownerWin().setTimeout(apply, 120);
  ownerWin().setTimeout(apply, 350);
}
// 定位条目在笔记里的行号：优先 notion 注释 id，其次行号校验，最后按 时间+标题 匹配列表行
async function locateItemLine(path, item) {
  const file = app.vault.getAbstractFileByPath(path);
  if (!file) return -1;
  let lines;
  try { lines = String(await app.vault.read(file)).split(/\r?\n/); } catch (e) { return -1; }
  const id = String(item?.id || '');
  if (/^[0-9a-fA-F-]{32,36}$/.test(id)) {
    const idx = lines.findIndex(l => l.includes(`notion:${id}`));
    if (idx >= 0) return idx;
  }
  const title = cleanItemTitle(item?.title || '').toLowerCase();
  const time = String(item?.time || '');
  if (Number.isInteger(item?.lineNo) && item.lineNo >= 0 && item.lineNo < lines.length) {
    const probe = lines[item.lineNo].toLowerCase();
    if ((title && probe.includes(title.slice(0, 12))) || (time && probe.includes(time))) return item.lineNo;
  }
  if (!title) return -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*-\s+/.test(l)) continue;
    const low = l.toLowerCase();
    if (!low.includes(title)) continue;
    if (time && !l.includes(time)) continue;
    return i;
  }
  return -1;
}
// 打开条目：日记里的行条目跳到那一行，整文件条目只打开文件
async function openItemInNote(item, fallbackPath) {
  const path = String(item?.path || fallbackPath || '');
  if (!path) return;
  await openNoteLink(path, dv.current()?.file?.path || '');
  const line = await locateItemLine(path, item);
  if (line >= 0) scrollMainWindowToLine(path, line);
}

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
function strikeDoneEnabled() {
  return !!config.plugin?.strikeDoneItems;
}
function quickAddConfig() {
  const q = config.plugin?.quickAdd || {};
  return {
    enabled: q.enabled !== false,
    section: String(q.section || 'Glimpse of the day'),
    template: String(q.template || '- **{time}** {title}'),
  };
}
function doneCls(item) {
  if (!strikeDoneEnabled()) return '';
  const s = String(item?.status || '').trim();
  if (!s) return '';
  const custom = Array.isArray(config.plugin?.strikeDoneStatuses) ? config.plugin.strikeDoneStatuses : [];
  if (custom.some(v => String(v).trim() === s)) return ' mjb-done';
  return isDone(s) ? ' mjb-done' : '';
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
let pendingDayNoteSave = null;
function scheduleDayMarkdownNoteSave(dateStr, existingPath, text) {
  clearTimeout(dayMarkdownNoteTimer);
  pendingDayNoteSave = { dateStr, existingPath, text };
  dayMarkdownNoteTimer = setTimeout(() => {
    const pending = pendingDayNoteSave;
    pendingDayNoteSave = null;
    if (!pending) return;
    writeDayMarkdownNote(pending.dateStr, pending.existingPath, pending.text).catch(err => console.error('Monthly Board daily note save failed:', err));
  }, 650);
}
// 写入时间轴条目前先落盘未保存的备注，避免两次 modify 同文件互相覆盖
async function flushDayNoteSave() {
  if (!pendingDayNoteSave) return;
  const pending = pendingDayNoteSave;
  pendingDayNoteSave = null;
  clearTimeout(dayMarkdownNoteTimer);
  await writeDayMarkdownNote(pending.dateStr, pending.existingPath, pending.text).catch(err => console.error('Monthly Board daily note save failed:', err));
}
// 往当天日记的指定标题区域追加一行（区域/文件不存在则自动创建）
async function writeTimelineLine(dateStr, existingPath, section, line) {
  await flushDayNoteSave();
  const heading = String(section || 'Glimpse of the day').trim();
  let path = normalizeVaultPath(existingPath || '');
  let file = path ? app.vault.getAbstractFileByPath(path) : null;
  if (!file) {
    path = dayNoteTargetPath(dateStr);
    if (!path) throw new Error('无法确定日记路径：' + dateStr);
    await ensureFolderForPath(path);
    file = app.vault.getAbstractFileByPath(path);
  }
  if (!file) {
    await app.vault.create(path, `---\ntags:\n  - journal/dailynote\ndate: ${dateStr}\nid: journal-${dateStr}\n---\n\n## ${heading}\n\n${line}\n`);
    return;
  }
  const raw = await app.vault.read(file);
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const headingRe = new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
  let headIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { headIdx = i; break; }
  }
  if (headIdx < 0) {
    const next = raw.replace(/\s*$/, '') + `${eol}${eol}## ${heading}${eol}${eol}${line}${eol}`;
    if (next !== raw) await app.vault.modify(file, next);
    return;
  }
  // 区域内顶层列表条目按时间升序重排（条目连同缩进续行一起移动），新行落在自己的时间位置
  const start = headIdx + 1;
  let end = start;
  while (end < lines.length && !/^#{1,6}\s+/.test(lines[end])) end++;
  const bodyLines = lines.slice(start, end);
  const bulletRe = /^(\s*)-\s+/;
  const indents = bodyLines.map(l => l.match(bulletRe)).filter(Boolean).map(m => m[1].length);
  const topIndent = indents.length ? Math.min(...indents) : 0;
  const preamble = [];
  const items = [];
  let cur = null;
  for (const l of bodyLines) {
    const m = l.match(bulletRe);
    if (m && m[1].length === topIndent) {
      cur = { lines: [l], time: lineTimeKey(l) };
      items.push(cur);
    } else if (cur) cur.lines.push(l);
    else preamble.push(l);
  }
  items.push({ lines: [line], time: lineTimeKey(line) });
  const timed = items.filter(it => it.time != null).sort((a, b) => a.time - b.time);
  const untimed = items.filter(it => it.time == null);
  const rebuilt = [...preamble];
  if (!bodyLines.length) rebuilt.push('');
  for (const it of [...timed, ...untimed]) rebuilt.push(...it.lines);
  const next = [...lines.slice(0, start), ...rebuilt, ...lines.slice(end)];
  await app.vault.modify(file, next.join(eol));
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
function appendClampText(li, text) {
  const span = make('span', '', text);
  if (String(text || '').length > 48) {
    span.classList.add('mjb-clamp');
    span.title = '点击展开/收起全文';
    li.addEventListener('click', ev => {
      if (ev.target.closest('a') || ev.target.closest('.mjb-grid-toggle')) return;
      span.classList.toggle('is-expanded');
    });
  }
  li.appendChild(span);
  return span;
}
function makeGroupTitle(source, items) {
  const wrap = make('div', 'mjb-detail-group-title');
  wrap.appendChild(make('h4', '', `${source} (${items.length})`));
  const allHidden = items.length > 0 && items.every(isGridHidden);
  const marker = make('span', `mjb-grid-toggle${allHidden ? ' is-hidden' : ''}`, allHidden ? '⊘' : '○');
  marker.title = allHidden ? '整组已不放入日期格子，点一下放回' : '点一下整组仅在右侧显示';
  marker.setAttribute('role', 'switch');
  marker.setAttribute('aria-checked', allHidden ? 'true' : 'false');
  marker.tabIndex = 0;
  marker.onclick = ev => {
    ev.preventDefault(); ev.stopPropagation();
    const target = !allHidden;
    for (const item of items) setGridHidden(item, target);
    render();
  };
  marker.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') marker.click(); };
  wrap.appendChild(marker);
  return wrap;
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
  const lines = String(raw || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*-\s+/.test(line)) continue;
    if (!/(dt-status-done|状态[:：]\s*完成|\[x\])/i.test(line)) continue;
    const id = (line.match(/<!--\s*notion:([0-9a-fA-F-]{32,36})\s*-->/) || [])[1] || '';
    const time = (line.match(/\*\*(\d{2}:\d{2}|--:--)\*\*/) || [])[1] || '';
    const url = (line.match(/href="([^"]+)"/) || line.match(/\[Notion\]\(([^)]+)\)/) || [])[1] || '';
    const title = cleanItemTitle(line.replace(/^\s*-\s+/, '').replace(/\*\*(\d{2}:\d{2}|--:--)\*\*/, ''));
    if (title) out.push({ id, title, time, status: '完成', url, lineNo: i });
  }
  return out;
}
// 日记时间轴条目：列表行里带 HH:MM 的行（兼容 - **HH:MM**、- HH:MM、- [x] HH:MM 等写法）。
// 可限定在某个标题区域内（如 Glimpse of the day），并按完成状态筛选。
function parseTimelineLines(raw, opts = {}) {
  const section = String(opts.section || '').trim();
  const filter = ['done', 'open'].includes(String(opts.statusFilter)) ? String(opts.statusFilter) : 'all';
  const lines = String(raw || '').split(/\r?\n/);
  let start = 0;
  if (lines.length && /^\uFEFF?---\s*$/.test(lines[0])) {
    const end = lines.findIndex((l, i) => i > 0 && /^---\s*$/.test(l));
    if (end > 0) start = end + 1;
  }
  const sectionRe = section ? new RegExp(`^#{1,6}\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) : null;
  let inTarget = !sectionRe;
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s+/.test(line)) {
      if (sectionRe) inTarget = sectionRe.test(line);
      continue;
    }
    if (!inTarget) continue;
    const m = line.match(/^\s*-\s+(?:\[[ xX]\]\s+)?(?:\*\*)?(\d{1,2}:\d{2})(?:\*\*)?(?:\s*[-–—:：]\s*|\s+)(\S.*)$/);
    if (!m) continue;
    const done = /(dt-status-done|状态[:：]\s*完成|\[x\]|✓)/i.test(line);
    if (filter === 'done' && !done) continue;
    if (filter === 'open' && done) continue;
    const id = (line.match(/<!--\s*notion:([0-9a-fA-F-]{32,36})\s*-->/) || [])[1] || '';
    const url = (line.match(/href="([^"]+)"/) || line.match(/\[Notion\]\(([^)]+)\)/) || [])[1] || '';
    const title = cleanItemTitle(m[2]);
    if (!title) continue;
    out.push({ id, title, time: m[1], status: done ? '完成' : '', url, lineNo: i });
  }
  return out;
}
// 列表行的时间提取（分钟数，无时间返回 null），兼容 - **HH:MM** / - HH:MM / - [x] HH:MM
function lineTimeKey(l) {
  const m = String(l || '').match(/^\s*-\s+(?:\[[ xX]\]\s+)?(?:\*\*)?(\d{1,2}):(\d{2})(?:\*\*)?/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function timeSortKeyVal(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
// 有时间的条目按时间升序，无时间的保持原顺序排在最后
function sortItemsByTime(items) {
  return (items || []).map((it, i) => [it, i]).sort((a, b) => {
    const ta = timeSortKeyVal(a[0].time);
    const tb = timeSortKeyVal(b[0].time);
    if (ta == null && tb == null) return a[1] - b[1];
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb || a[1] - b[1];
  }).map(p => p[0]);
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
function extractImagesFromRaw(raw, filePath) {
  const candidates = [];
  const text = String(raw || '');
  for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) candidates.push(m[1]);
  for (const m of text.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)) candidates.push(`[[${m[1]}]]`);

  const entries = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const val = String(candidate || '').trim();
    if (!val) continue;
    let entry = null;
    if (/^https?:\/\//i.test(val)) {
      entry = makeImageEntry(val, imageEntryKey(val));
    } else {
      const wiki = val.match(/^\[\[([^\]]+)\]\]$/);
      const link = wiki ? wiki[1] : val;
      const clean = link.split('|')[0].split('#')[0].trim();
      const dest = resolveImageFile(clean, filePath);
      if (dest) entry = makeImageEntry(app.vault.getResourcePath(dest), dest.path || clean);
    }
    if (entry && !seen.has(entry.key)) {
      seen.add(entry.key);
      entries.push(entry);
    }
  }
  return entries;
}
function extractImageFromRaw(raw, filePath) {
  return extractImagesFromRaw(raw, filePath)[0] || null;
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
function pageDate(p, fields) {
  for (const key of (fields || DATE_FIELDS)) {
    const d = dateFromValue(p[key]);
    if (d) return d;
  }
  return '';
}
// 属性值统一转字符串数组（兼容 dataview link / 日期 / 数组 / 空值）
function propStrings(raw) {
  const vals = Array.isArray(raw) ? raw : [raw];
  return vals.map(v => {
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.path) return String(v.path);
      if (typeof v.toFormat === 'function') { try { return v.toFormat('yyyy-MM-dd'); } catch (e) {} }
      return String(v);
    }
    return String(v);
  });
}
// 开放式属性条件（AND 组合）。op: is/isNot/contains/notContains/exists/notExists/>/>=/</<=/matches
function matchSourceWhere(p, where) {
  if (!Array.isArray(where) || !where.length) return true;
  return where.every(cond => {
    if (!cond || !cond.field) return true;
    const raw = p[cond.field];
    const op = String(cond.op || 'is');
    const val = cond.value == null ? '' : String(cond.value);
    const strs = propStrings(raw);
    switch (op) {
      case 'is': return strs.some(s => s === val);
      case 'isNot': return !strs.some(s => s === val);
      case 'contains': return strs.some(s => s.includes(val));
      case 'notContains': return !strs.some(s => s.includes(val));
      case 'exists': return strs.some(s => s.trim() !== '');
      case 'notExists': return !strs.some(s => s.trim() !== '');
      case '>': return Number(raw) > Number(cond.value);
      case '>=': case 'gte': return Number(raw) >= Number(cond.value);
      case '<': return Number(raw) < Number(cond.value);
      case '<=': case 'lte': return Number(raw) <= Number(cond.value);
      case 'matches': try { return strs.some(s => new RegExp(val).test(s)); } catch (e) { return false; }
      default: return true;
    }
  });
}
function addDayData(byDate, date, patch) {
  if (!date) return;
  const current = byDate.get(date) || { entries: [], related: [], images: [], path: '', raw: '', essay: '' };
  if (patch.entries) current.entries = uniqueItems([...current.entries, ...patch.entries]);
  if (patch.related) current.related = uniqueItems([...current.related, ...patch.related]);
  const patchImages = [];
  if (Array.isArray(patch.images)) patchImages.push(...patch.images);
  const imageEntry = normalizeImageEntry(patch.image);
  if (imageEntry) patchImages.push(imageEntry);
  for (const img of patchImages) {
    const entry = normalizeImageEntry(img);
    if (entry && !current.images.some(existing => existing.key === entry.key)) current.images.push(entry);
  }
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
  if (item.path && item.lineNo == null) return `path:${String(item.path)}`;
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
function clampZoom(value) {
  const zoom = Number(value);
  return Math.max(1, Math.min(2.4, Number.isFinite(zoom) ? zoom : 1));
}
function zoomLabel() {
  return `${Math.round(clampZoom(state.zoom) * 100)}%`;
}
// 诊断：把缩放链路的关键数字写进插件目录 _glass-debug.log（排查窗口比例用）
function mjbDbg(msg) {
  try {
    const fs = require('fs');
    const path = require('path');
    const base = app.vault.adapter.getBasePath();
    fs.appendFileSync(path.join(base, '.obsidian/plugins/monthly-board/_glass-debug.log'), `${new Date().toISOString()} [zoom] ${msg}\n`);
  } catch (e) {}
}
function obsidianUiScale() {
  if (typeof document === 'undefined') return 1;
  const styles = getComputedStyle(document.body || document.documentElement);
  const raw = styles.getPropertyValue('--font-ui-medium') || styles.getPropertyValue('--font-text-size') || styles.fontSize || '15px';
  const px = Number.parseFloat(raw);
  return Math.max(0.75, Math.min(1.35, Number.isFinite(px) ? px / 15 : 1));
}
function isMobileView() {
  return !!(document.body?.classList?.contains('is-mobile'));
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
    // popout/玻璃窗自适应会写入 ROOT.dataset.mjbRowH，让格子行高填满窗口高度（不再强制正方形）
    const rowOverride = Number(ROOT && ROOT.dataset && ROOT.dataset.mjbRowH);
    const daySize = Number.isFinite(rowOverride) && rowOverride > 0
      ? Math.round(rowOverride)
      : Math.max(42, Math.floor((width - gap * 6) / 7));
    if (!Number.isFinite(daySize) || daySize <= 0) return;
    // 行高固定为格子高，且内容顶部对齐：防止窄屏 CSS 的 minmax(100px, auto) 行在容器偏高时被拉伸、行间出现大空白（手机版就是这个现象）
    grid.style.alignContent = 'start';
    // 手机上 7 列格子横向已经很挤，行高给 1.25 倍让格子纵向宽松点
    const cellH = isMobileView() ? Math.round(daySize * 1.25) : daySize;
    grid.style.gridAutoRows = `${cellH}px`;
    grid.querySelectorAll('.mjb-day').forEach(day => {
      day.style.height = `${cellH}px`;
      day.style.minHeight = `${cellH}px`;
    });
  });
  // Notes 栏跟日历等高：日历高时右侧不再留一截空白；内容超出在栏内滚动
  const cal = root.querySelector('.mjb-calendar');
  const side = root.querySelector('.mjb-side:not(.is-collapsed)');
  if (cal && side && cal.offsetHeight > 200) {
    side.style.height = `${cal.offsetHeight}px`;
    side.style.maxHeight = `${cal.offsetHeight}px`;
  }
}
function syncZoomViewportBounds(viewport, frameHeight = 0) {
  if (!viewport) return;
  const wrapperEl = viewport.parentElement;
  // 阅读模式或手机：不限高度、不做内部滚动，滚动交给页面本身
  if (viewport.closest?.('.markdown-preview-view.monthly-journal-board') || isMobileView()) {
    viewport.style.maxHeight = 'none';
    // 手机上连高度都不写：frameHeight 可能是在图片/字体没加载完时量的，写小了下面的内容就被裁掉滑不到
    viewport.style.height = isMobileView() ? '' : (frameHeight > 0 ? `${frameHeight}px` : '');
    if (wrapperEl?.classList?.contains('monthly-journal-board')) {
      wrapperEl.style.maxHeight = 'none';
      wrapperEl.style.height = '';
      wrapperEl.style.overflow = 'visible';
    }
    return;
  }
  const visual = window.visualViewport;
  const visualHeight = Math.floor(visual?.height || window.innerHeight || document.documentElement.clientHeight || 720);
  const top = Math.max(0, Math.floor(viewport.getBoundingClientRect?.().top || 0));
  const available = Math.max(260, visualHeight - top - 8);
  const targetHeight = frameHeight > 0 ? Math.min(frameHeight, available) : available;
  viewport.style.maxHeight = `${available}px`;
  viewport.style.height = `${targetHeight}px`;
  const wrapper = viewport.parentElement;
  if (wrapper?.classList?.contains('monthly-journal-board')) {
    wrapper.style.maxHeight = `${available}px`;
    wrapper.style.height = `${targetHeight}px`;
    wrapper.style.overflow = 'hidden';
  }
}
function applyBoardZoom(canvas, label, frame) {
  // popout/玻璃窗有自己的整体等比缩放（fit），用户缩放只留给主窗口；否则共享的 zoom 状态会双重放大
  const inPopout = !!(ROOT && ROOT.ownerDocument && typeof document !== 'undefined' && ROOT.ownerDocument !== document);
  const boardZoom = inPopout ? 1 : clampZoom(state.zoom);
  // 手机端不做 uiScale 补偿：移动端 UI 字号偏大，先缩排版再放大画布会导致又小又糊
  const uiScale = isMobileView() ? 1 : obsidianUiScale();
  const zoom = boardZoom * uiScale;
  if (canvas) {
    // 页签切走时月历是 display:none，所有尺寸都是 0/1，这时候算出来的值写进去就是"被挤没"的元凶
    if (canvas.getClientRects && canvas.getClientRects().length === 0) return;
    const viewport = frame?.parentElement || canvas.parentElement;
    // 注意：viewport 在画布内部，画布的宽度是上一轮写死的内联像素 → viewport.clientWidth 永远是旧值。
    // 宽度必须从画布之外的容器量（阅读模式 sizer / 编辑模式 cm-content / view-content）。
    const outerW = Math.floor(
      viewport?.closest?.('.markdown-preview-sizer')?.clientWidth ||
      viewport?.closest?.('.cm-content')?.clientWidth ||
      viewport?.closest?.('.view-content')?.clientWidth ||
      ROOT?.parentElement?.clientWidth ||
      0
    );
    const measuredWidth = Math.floor(viewport?.clientWidth || viewport?.getBoundingClientRect?.().width || 0);
    const viewportWidth = Math.max(1, outerW || measuredWidth || canvas.offsetWidth || 1);
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
    // 手机上不写死画布/内框高度（测量可能基于未加载完的内容，写死会裁掉下面的部分导致滑不动）
    canvas.style.maxWidth = 'none';
    const root = canvas.firstElementChild;
    // 行高覆盖只在本次确有需要时才重新写入：先无条件清掉再算格子，否则旧高度会一直留在格子上
    const stacked = baseWidth < 900;
    delete ROOT.dataset.mjbRowH;
    stabilizeCalendarGrid(root);
    let baseHeight = Math.max(1, Math.ceil(root?.scrollHeight || canvas.scrollHeight || canvas.offsetHeight || 1));
    // 主窗口且用户没手动放大时：6 行超出可视高度 → 优先压缩格子行高收进来（板子宽度不变，右侧不露白）；
    // 压到下限还不够才整体缩小。
    let effZoom = zoom;
    // 栏位窄于 920 时是单列纵向布局（日历在上、Notes 在下），天生很高、靠滚动查看：
    // 这种模式下不做高度适配（压缩行高/整体缩小），否则会被缩成一小条、两边露白。
    if (!inPopout && !isMobileView() && !stacked && boardZoom <= 1.001) {
      const vv = window.visualViewport;
      const vh = Math.floor(vv?.height || window.innerHeight || 720);
      const topNow = Math.max(0, Math.floor(viewport?.getBoundingClientRect?.().top || 0));
      const avail = Math.max(260, vh - topNow - 8);
      if (baseHeight * zoom > avail) {
        const grid = root && root.querySelector('.mjb-grid');
        const day = grid && grid.querySelector('.mjb-day');
        if (grid && day && day.offsetHeight > 0) {
          const sq = day.offsetHeight;
          const rows = 6;
          const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
          const overhead = baseHeight - grid.offsetHeight;
          const wantRow = Math.floor((avail / zoom - overhead - (rows - 1) * gap) / rows);
          const minRow = Math.max(56, Math.round(sq * 0.92));
          if (wantRow < sq) {
            ROOT.dataset.mjbRowH = String(Math.max(minRow, wantRow));
            stabilizeCalendarGrid(root);
            baseHeight = Math.max(1, Math.ceil(root?.scrollHeight || canvas.scrollHeight || 1));
          }
        }
      }
      canvas.style.height = `${baseHeight}px`;
      if (baseHeight * zoom > avail) effZoom = avail / baseHeight;
    }
    canvas.style.transform = `scale(${effZoom})`;
    let frameHeight = 0;
    if (frame) {
      frame.style.width = `${Math.ceil(baseWidth * effZoom)}px`;
      frameHeight = Math.ceil(baseHeight * effZoom);
      frame.style.height = isMobileView() ? '' : `${frameHeight}px`;
    }
    syncZoomViewportBounds(viewport, frameHeight);
    // 诊断日志（窗口比例排查用，完事可删）
    if (root) {
      const grid = root.querySelector('.mjb-grid');
      const day = grid && grid.querySelector('.mjb-day');
      mjbDbg(`popout=${inPopout} w=${viewportWidth} baseW=${baseWidth} uiScale=${uiScale} zoom=${zoom.toFixed(3)} eff=${effZoom.toFixed(3)} cell=${day ? day.offsetWidth + 'x' + day.offsetHeight : '-'} rootH=${baseHeight} rowH=${ROOT.dataset.mjbRowH || '-'}`);
    }
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
    // 隐藏（切页签）时不要更新基准值
    if (viewport.getClientRects && viewport.getClientRects().length === 0) return;
    // 量外层容器宽度（viewport 的宽度被画布内联像素钉死，窗口变化时它不变）
    const width = Math.round(
      viewport.closest?.('.markdown-preview-sizer')?.clientWidth ||
      viewport.closest?.('.cm-content')?.clientWidth ||
      viewport.closest?.('.view-content')?.clientWidth ||
      viewport.clientWidth || 0
    );
    const scale = Math.round(obsidianUiScale() * 1000) / 1000;
    const widthChanged = Math.abs(width - lastWidth) >= 2;
    const scaleChanged = Math.abs(scale - lastScale) >= 0.002;
    if (!widthChanged && !scaleChanged) return;
    lastWidth = width;
    lastScale = scale;
    ownerWin().cancelAnimationFrame(raf);
    raf = ownerWin().requestAnimationFrame(() => {
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
  const journalRaws = [];
  await Promise.all(journalPages.map(async p => {
    const raw = await readPageRaw(p);
    journalRaws.push({ date: p.file.name, path: p.file.path, raw });
    const entries = uniqueItems([
      ...parseFrontmatterEntryArray(p, raw).filter(e => isDone(e.status)),
      ...parseBodyDoneLines(raw),
    ]);
    addDayData(byDate, p.file.name, {
      entries,
      images: extractImagesFromRaw(raw, p.file.path),
      path: p.file.path,
      raw,
      essay: extractEssay(raw),
    });
  }));

  const sources = SOURCE_CONFIGS;
  const pickStr = v => propStrings(v).find(s => s.trim()) || '';
  for (const src of sources) {
    if (src.hidden) continue;
    const srcLabel = String(src.label || '其他');
    // 日记时间轴模式：事件记在当天日记里而不是独立文件。与文件模式互斥——
    // 已进「完成项」的行（同时间同标题）不再重复计入该分组。
    if (String(src.mode || '') === 'timeline') {
      for (const j of journalRaws) {
        const day = byDate.get(j.date);
        const taken = new Set((day?.entries || []).map(e => `${e.time || ''}|${cleanItemTitle(e.title).toLowerCase()}`));
        const items = parseTimelineLines(j.raw, { section: src.section, statusFilter: src.statusFilter })
          .filter(it => !taken.has(`${it.time || ''}|${cleanItemTitle(it.title).toLowerCase()}`))
          .map(it => ({
            id: it.id,
            title: it.title,
            time: it.time,
            status: it.status,
            url: it.url,
            source: srcLabel,
            path: j.path,
            lineNo: it.lineNo,
          }));
        if (items.length) addDayData(byDate, j.date, { related: items });
      }
      continue;
    }
    const srcFields = Array.isArray(src.dateFields) && src.dateFields.length ? src.dateFields : null;
    const pages = dv.pages(src.query || '').where(p => {
      if (!matchSourceWhere(p, src.where)) return false;
      const d = pageDate(p, srcFields);
      return d && d.startsWith(monthPrefix);
    }).array();
    await Promise.all(pages.map(async p => {
      const raw = await readPageRaw(p);
      const d = pageDate(p, srcFields);
      const source = (src.groupBy && pickStr(p[src.groupBy])) || srcLabel;
      const title = (src.titleField && pickStr(p[src.titleField])) || String(p.title || p.file.name || 'Untitled');
      const status = src.statusField ? pickStr(p[src.statusField]) : String(p['状态'] || p.status || '');
      const url = src.urlField ? pickStr(p[src.urlField]) : String(p.notion_url || p.url || '');
      addDayData(byDate, d, {
        related: [{ id: String(p.notion_id || p.file.path), title: relatedLabel(source, title), status, url, source, path: p.file.path }],
        images: extractImagesFromRaw(raw, p.file.path),
      });
    }));
  }
  // 完成项/关联条目跨区去重：同一事件（notion id / 标题 / 链接任一相同）只留在完成项里
  for (const day of byDate.values()) {
    if (day.entries.length && day.related.length) {
      const normId = v => String(v || '').toLowerCase().replace(/-/g, '');
      const entryIds = new Set(day.entries.map(e => normId(e.id)).filter(Boolean));
      const entryTitles = new Set(day.entries.map(e => cleanItemTitle(e.title).toLowerCase()).filter(Boolean));
      const entryUrls = new Set(day.entries.map(e => String(e.url || '').trim()).filter(Boolean));
      day.related = day.related.filter(r => {
        const rid = normId(r.id);
        if (rid && entryIds.has(rid)) return false;
        const rawTitle = String(r.title || '');
        const dot = rawTitle.indexOf('·');
        const rTitle = cleanItemTitle(dot >= 0 ? rawTitle.slice(dot + 1) : rawTitle).toLowerCase();
        if (rTitle && entryTitles.has(rTitle)) return false;
        const rUrl = String(r.url || '').trim();
        if (rUrl && entryUrls.has(rUrl)) return false;
        return true;
      });
    }
    // 完成项/关联条目统一按时间升序（无时间的保持原顺序排最后），新加的记录参与排序
    day.entries = sortItemsByTime(day.entries);
    day.related = sortItemsByTime(day.related);
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
  const sanitizeCssValue = v => String(v || '').replace(/[;{}]/g, '').trim();
  const customThemeCss = CUSTOM_THEMES.map(t => {
    const vars = [['ink', '--mjb-ink'], ['muted', '--mjb-muted'], ['accent', '--mjb-accent'], ['accent2', '--mjb-accent-2'], ['card', '--mjb-card'], ['line', '--mjb-line']]
      .filter(([key]) => t[key])
      .map(([key, cssVar]) => `${cssVar}: ${sanitizeCssValue(t[key])}`)
      .join('; ');
    const bg = t.background ? ` background: ${sanitizeCssValue(t.background)};` : '';
    const extra = t.extraCss ? `\n${String(t.extraCss)}` : '';
    return `.mjb-root[data-theme="${t.id}"] { ${vars};${bg} }${extra}`;
  }).join('\n');
  style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Ma+Shan+Zheng&display=swap');
${handFontFace}.monthly-journal-board { display: block; max-height: calc(100vh - 92px); overflow: hidden; }
.markdown-preview-section:has(.monthly-journal-board) { max-width: 100% !important; }
/* ── 阅读模式：隐藏内联标题 + 去掉阅读栏宽 padding，看板充满整个可视空间 ── */
.markdown-preview-view.monthly-journal-board .inline-title { display: none; }
.markdown-preview-view.monthly-journal-board .markdown-preview-sizer,
.markdown-preview-view.monthly-journal-board .markdown-preview-section { width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important; margin-right: 0 !important; }
.markdown-preview-view.monthly-journal-board .markdown-preview-sizer { min-height: 100%; padding-top: 0 !important; padding-bottom: 0 !important; }
.markdown-preview-view.monthly-journal-board .mjb-root { border-radius: 0; box-shadow: none; }
.markdown-preview-view.monthly-journal-board .mjb-zoom-viewport { overflow: visible; max-height: none; scrollbar-gutter: auto; }
.markdown-preview-view.monthly-journal-board { padding: 0 !important; }
.view-content:has(.markdown-preview-view.monthly-journal-board) { padding: 0 !important; }
.markdown-preview-view.monthly-journal-board .markdown-preview-section > div { margin: 0 !important; }
.markdown-preview-view.monthly-journal-board .monthly-journal-board { margin: 0 !important; }
.markdown-preview-view.monthly-journal-board::-webkit-scrollbar { width: 0 !important; height: 0 !important; background: transparent !important; }
.markdown-preview-view.monthly-journal-board { scrollbar-width: none !important; }
/* 月历页的阅读视图必须可滚动：某些主题/片段（尤其手机端）会把它的 overflow 关掉，内容一高就整页卡死 */
.markdown-preview-view:has(.monthly-journal-board) { overflow-y: auto !important; overscroll-behavior: auto !important; }
/* ── 编辑模式（实时预览）：月历同样充满整列，不被"可读行宽"挤成窄条 ── */
.markdown-source-view.monthly-journal-board .cm-contentContainer,
.markdown-source-view.monthly-journal-board .cm-content,
.markdown-source-view.monthly-journal-board .cm-sizer { max-width: none !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
.markdown-source-view.monthly-journal-board .cm-line:has(.monthly-journal-board) { padding: 0 !important; }
.markdown-source-view.monthly-journal-board .cm-embed-block,
.markdown-source-view.monthly-journal-board .cm-widgetBuffer { max-width: none !important; width: 100% !important; }
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
.mjb-root[data-theme="kitten"] { --mjb-ink: #3C5189; --mjb-muted: #819DCB; --mjb-accent: #8796BD; --mjb-accent-2: #5E6FA8; --mjb-card: rgba(237,243,255,.86); --mjb-line: rgba(135,150,189,.32); background: #CFDDF1; background-image: radial-gradient(circle at 12% 10%, rgba(255,255,255,.80), transparent 26%), radial-gradient(circle at 88% 86%, rgba(135,150,189,.20), transparent 32%), linear-gradient(180deg, rgba(237,243,255,.55), rgba(207,221,241,.28)); box-shadow: 0 18px 55px rgba(60,81,137,.16); }
.mjb-root[data-theme="kitten"] .mjb-side, .mjb-root[data-theme="kitten"] .mjb-note-area { background: rgba(237,243,255,.66); border-color: rgba(135,150,189,.32); }
.mjb-root[data-theme="kitten"] .mjb-month-tab.is-active { background: linear-gradient(90deg, #8796BD, #5E6FA8); color: #F1F5FF; }
.mjb-root[data-theme="kitten"] .mjb-day:hover { border-color: rgba(135,150,189,.62); box-shadow: 0 12px 28px rgba(60,81,137,.15); }
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
.mjb-zoom-viewport { position: relative; width: 100%; max-height: calc(100vh - 92px); overflow: auto; touch-action: pan-x pan-y; overscroll-behavior: contain; scrollbar-gutter: stable; -webkit-overflow-scrolling: touch; }
.mjb-zoom-toolbar { position: absolute; top: 6px; right: 6px; z-index: 30; display: flex; justify-content: flex-end; width: auto; box-sizing: border-box; padding: 0; pointer-events: none; }
.mjb-zoom-toolbar .mjb-zoom-controls { pointer-events: auto; }
.mjb-zoom-frame { position: relative; }
.mjb-zoom-canvas { transform-origin: top left; width: 100%; max-width: none; will-change: transform; }
.mjb-zoom-controls { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(83, 125, 91, .28); border-radius: 999px; padding: 2px; background: rgba(255,255,255,.52); backdrop-filter: blur(10px); box-shadow: 0 8px 22px rgba(54,62,48,.12); }
.mjb-zoom-controls button { min-width: 30px; border: 1px solid rgba(83, 125, 91, .28); background: rgba(255,255,255,.50); color: #213729; border-radius: 999px; padding: 5px 8px; font-size: 12px; cursor: pointer; font-weight: 800; }
.mjb-zoom-reset { min-width: 48px !important; }
.mjb-root::before { content: ''; position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(rgba(255,255,255,.35) 0.7px, transparent 0.7px); background-size: 5px 5px; opacity: .24; }
.mjb-head, .mjb-main { position: relative; z-index: 1; }
.mjb-head { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.mjb-title { font-size: clamp(38px, 6vw, 78px); line-height: .86; font-family: Georgia, 'Times New Roman', serif; letter-spacing: -2px; }
.mjb-title-link { color: inherit !important; text-decoration: none !important; border: none !important; background: none !important; box-shadow: none !important; outline: none !important; padding: 0 !important; cursor: pointer; }
.mjb-title-link:hover { opacity: .72; }
.mjb-title-link:visited { color: inherit !important; }
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
.mjb-day:not(.has-image) .mjb-items { top: 44px; bottom: auto; }
.mjb-day:not(.has-image) .mjb-week-chip ~ .mjb-items { top: 62px; }
.mjb-item { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(9px, .85vw, 11px); letter-spacing: .01em; color: var(--mjb-ink); background: linear-gradient(90deg, rgba(255,255,255,.30), rgba(255,255,255,.16)); border-radius: 7px; padding: 1px 4px; font-weight: 800; text-shadow: 0 1px 1px rgba(255,255,255,.42); box-shadow: 0 1px 4px rgba(0,0,0,.045); }
.mjb-day.has-image .mjb-item { color: #f7fbff; background: linear-gradient(90deg, rgba(8,14,22,.50), rgba(8,14,22,.30)); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 1px rgba(0,0,0,.85); backdrop-filter: blur(.8px); }
.mjb-more { font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; font-size: clamp(8px, .8vw, 10px); color: var(--mjb-muted); margin-top: 1px; font-weight: 800; text-shadow: 0 1px 1px rgba(255,255,255,.36); }
.mjb-item.mjb-done { text-decoration: line-through; opacity: .52; }
.mjb-li.mjb-done > span:first-child { text-decoration: line-through; opacity: .52; }
.mjb-day.has-image .mjb-more { color: rgba(247,251,255,.96); text-shadow: 0 1px 2px rgba(0,0,0,.95), 0 0 1px rgba(0,0,0,.85); }
.mjb-photo-count { position: absolute; top: 7px; right: 7px; z-index: 3; display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border-radius: 999px; background: rgba(255,255,255,.68); color: #263347; font-size: 10px; font-weight: 800; box-shadow: 0 2px 10px rgba(0,0,0,.16); cursor: pointer; user-select: none; transition: background .15s, transform .1s; }
.mjb-photo-count:hover { background: rgba(255,255,255,.92); }
.mjb-photo-count:active { transform: scale(.92); }
.mjb-pop { display: none; position: fixed; left: 0; top: 0; width: clamp(240px, 30vw, 360px); max-height: min(420px, calc(100vh - 48px)); overflow: auto; padding: 12px; border-radius: 16px; background: rgba(28, 39, 31, .94); color: #fff; box-shadow: 0 18px 42px rgba(0,0,0,.25); backdrop-filter: blur(10px); z-index: 9999; }
.mjb-pop.is-visible { display: block; }
.mjb-pop-title { font-weight: 800; margin-bottom: 7px; }
.mjb-pop ul { margin: 0; padding-left: 18px; }
.mjb-pop li { margin: 4px 0; font-size: 12px; }
.mjb-pop p { margin: 8px 0 0; font-size: 12px; color: rgba(255,255,255,.82); }
.mjb-pop a { color: #d9f1ff !important; }
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
.mjb-side.is-collapsed .mjb-quickadd,
.mjb-side.is-collapsed .mjb-detail { display: none; }
.mjb-note-area { width: 100%; min-height: 96px; max-height: 160px; resize: vertical; box-sizing: border-box; border: 1px solid var(--mjb-line); border-radius: 16px; background: rgba(255,255,255,.58); color: var(--mjb-ink); padding: 12px; margin: 8px 0 14px; flex: 0 0 auto; }
.mjb-quickadd { display: flex; align-items: center; gap: 6px; margin: -6px 0 12px; }
.mjb-quickadd input { box-sizing: border-box; border: 1px solid var(--mjb-line); border-radius: 10px; background: rgba(255,255,255,.55); color: var(--mjb-ink); padding: 5px 8px; font-size: 12px; }
.mjb-quickadd input:focus { outline: 1px solid var(--mjb-accent); }
.mjb-quickadd-time { width: 52px; flex: 0 0 auto; text-align: center; }
.mjb-quickadd-text { flex: 1 1 auto; min-width: 0; }
.mjb-quickadd-btn { border: none; border-radius: 10px; background: var(--mjb-accent); color: #fff; padding: 5px 12px; font-size: 13px; line-height: 1.2; cursor: pointer; flex: 0 0 auto; }
.mjb-quickadd-btn:disabled { opacity: .55; cursor: default; }
.mjb-detail { border-top: 1px solid var(--mjb-line); padding-top: 12px; color: var(--mjb-ink); overflow: auto; min-height: 0; flex: 1 1 auto; padding-right: 6px; scrollbar-gutter: stable; }
.mjb-detail-group-title { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.mjb-detail-group-title .mjb-grid-toggle { flex: 0 0 auto; }
.mjb-day-grid-toggle { margin-left: 8px; vertical-align: .05em; }
.mjb-detail p,
.mjb-detail-list,
.mjb-detail-list li,
.mjb-open-message { font-family: 'AaYouLongZeLingKeAiTi', 'Kalam', 'Ma Shan Zheng', 'Comic Sans MS', cursive; letter-spacing: .01em; }
.mjb-detail a { color: var(--mjb-ink) !important; }
.mjb-detail-list { padding-left: 18px; margin-top: 8px; }
.mjb-detail-list li { margin: 6px 0; line-height: 1.42; }
.mjb-clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; cursor: pointer; }
span.mjb-clamp.is-expanded { display: inline; -webkit-line-clamp: unset; overflow: visible; }
p.mjb-clamp.is-expanded { display: block; -webkit-line-clamp: unset; overflow: visible; }
.mjb-grid-toggle { display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; margin-left: 3px; color: var(--mjb-muted); cursor: pointer; font: 900 10px/1 Georgia, serif; opacity: .34; vertical-align: .08em; user-select: none; }
.mjb-grid-toggle.is-hidden { color: var(--mjb-accent-2); opacity: .78; }
.mjb-grid-toggle:hover { color: var(--mjb-ink); opacity: .9; }
.mjb-detail-image { display: block; width: 100%; max-height: 220px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 18px; margin: 12px 0 14px; border: 1px solid var(--mjb-line); box-shadow: 0 10px 28px rgba(0,0,0,.12); opacity: 1; filter: none !important; mix-blend-mode: normal; }
.mjb-root[data-theme="night"] .mjb-detail-image { box-shadow: 0 10px 28px rgba(18,30,46,.18); }
.mjb-photo-toggle { display: inline-flex; margin: -4px 0 10px; border: 1px solid var(--mjb-line); border-radius: 999px; padding: 5px 10px; background: rgba(255,255,255,.56); color: var(--mjb-ink); cursor: pointer; font-size: 11px; font-weight: 800; }
.mjb-photo-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; }
.mjb-photo-tools button { border: 1px solid var(--mjb-line); border-radius: 999px; padding: 5px 9px; background: rgba(255,255,255,.56); color: var(--mjb-ink); cursor: pointer; font-size: 11px; font-weight: 750; }
.mjb-photo-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 8px 0 12px; max-height: min(24vh, 208px); overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding-right: 2px; }
.mjb-photo-choice { position: relative; aspect-ratio: 1 / 1; padding: 0; border: 2px solid transparent; border-radius: 12px; overflow: hidden; background: transparent; cursor: pointer; }
.mjb-photo-choice.is-active { border-color: var(--mjb-accent-2); box-shadow: 0 0 0 2px rgba(255,255,255,.42); }
.mjb-photo-choice img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mjb-focus-panel { display: grid; gap: 7px; margin: 8px 0 12px; padding: 10px; border: 1px solid var(--mjb-line); border-radius: 16px; background: rgba(255,255,255,.36); }
.mjb-focus-panel label { display: grid; grid-template-columns: 32px 1fr; gap: 8px; align-items: center; font-size: 11px; color: var(--mjb-muted); font-weight: 800; }
.mjb-focus-panel input[type="range"] { width: 100%; accent-color: var(--mjb-accent); }
.mjb-open-note { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; margin-left: 6px; color: var(--mjb-muted) !important; text-decoration: none !important; font: 900 12px/1 Georgia, serif; opacity: .42; vertical-align: .08em; cursor: pointer; }
.mjb-open-note:hover { color: var(--mjb-ink) !important; opacity: .9; }
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
  .mjb-day:not(.has-image) .mjb-items { top: 32px; bottom: auto; }
  .mjb-day:not(.has-image) .mjb-week-chip ~ .mjb-items { top: 46px; }
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
  .mjb-day:not(.has-image) .mjb-items { top: 26px; bottom: auto; }
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
/* ── 手机端：全屏出血 + 排版补偿 ── */
body.is-mobile .markdown-preview-view.monthly-journal-board .inline-title { display: none; }
body.is-mobile .markdown-preview-view.monthly-journal-board .markdown-preview-sizer,
body.is-mobile .markdown-preview-view.monthly-journal-board .markdown-preview-section { width: 100% !important; max-width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; margin-left: 0 !important; margin-right: 0 !important; }
body.is-mobile .monthly-journal-board { max-height: none !important; }
body.is-mobile .mjb-root { padding: 8px; border-radius: 0; box-shadow: none; min-height: 0; }
body.is-mobile .mjb-head { gap: 8px; margin-bottom: 10px; }
body.is-mobile .mjb-weekdays { font-size: 9px; }
body.is-mobile .mjb-item { font-size: 9px; line-height: 1.3; }
body.is-mobile .mjb-more { font-size: 8px; }
body.is-mobile .mjb-date { min-width: 17px; height: 17px; font-size: 9px; }
body.is-mobile .mjb-zoom-viewport { scrollbar-gutter: auto; overflow: visible !important; overscroll-behavior: auto !important; touch-action: pan-x pan-y !important; }
/* 手机上藏掉顶部控件行（年份/今天/主题/背景）和缩放工具条：太挤且遮挡编辑按钮；切月用月份标签，缩放用双指 */
body.is-mobile .mjb-controls,
body.is-mobile .mjb-zoom-toolbar { display: none !important; }
body.is-mobile .mjb-head { margin-bottom: 10px; }
body.is-mobile .mjb-title { font-size: clamp(34px, 11vw, 56px) !important; }
/* ── 手机：7 列月网格换成竖向日程列表（每天一行：日期 | 条目 | 照片），纵向滚动 ── */
body.is-mobile .mjb-weekdays { display: none !important; }
body.is-mobile .mjb-grid { display: flex !important; flex-direction: column; gap: 6px; }
body.is-mobile .mjb-day { position: relative; display: flex; align-items: flex-start; gap: 8px; width: 100%; height: auto !important; min-height: 104px !important; padding: 9px 10px; }
body.is-mobile .mjb-day.is-empty { display: none; }
body.is-mobile .mjb-date { position: static; flex: 0 0 auto; margin-top: 1px; }
body.is-mobile .mjb-week-chip,
body.is-mobile .mjb-photo-count { display: none; }
body.is-mobile .mjb-thumb { position: static; order: 3; flex: 0 0 auto; width: 92px; height: 92px; border-radius: 12px; margin-left: auto; }
body.is-mobile .mjb-day.has-image::after { display: none; }
body.is-mobile .mjb-items { position: static; flex: 1 1 auto; display: flex; flex-direction: column; gap: 3px; }
body.is-mobile .mjb-day.has-image .mjb-item { background: linear-gradient(90deg, rgba(255,255,255,.30), rgba(255,255,255,.16)); color: var(--mjb-ink); text-shadow: 0 1px 1px rgba(255,255,255,.42); backdrop-filter: none; }
/* 手机：点格子弹出的底部详情面板 */
body.is-mobile .mjb-sheet-backdrop { position: fixed; inset: 0; z-index: 98; background: rgba(15,20,35,.38); opacity: 0; pointer-events: none; transition: opacity .2s; }
body.is-mobile .mjb-sheet-backdrop.is-open { opacity: 1; pointer-events: auto; }
body.is-mobile .mjb-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 99; max-height: 72vh; display: flex; flex-direction: column; background: var(--background-primary, #fff); border-radius: 20px 20px 0 0; box-shadow: 0 -10px 34px rgba(20,30,50,.30); transform: translateY(105%); transition: transform .24s ease; }
body.is-mobile .mjb-sheet.is-open { transform: translateY(0); }
body.is-mobile .mjb-sheet-grip { flex: 0 0 auto; height: 30px; display: flex; align-items: center; justify-content: center; cursor: pointer; }
body.is-mobile .mjb-sheet-grip::before { content: ''; width: 44px; height: 5px; border-radius: 99px; background: rgba(120,130,150,.45); }
body.is-mobile .mjb-sheet-body { overflow: auto; padding: 2px 16px 26px; overscroll-behavior: contain; }
${customThemeCss}
`;
  document.head.appendChild(style);
  // popout 窗口有独立 document：同步一份样式过去，保证主题/背景改动在 popout 里即时生效
  const ownDoc = ROOT && ROOT.ownerDocument;
  if (ownDoc && ownDoc !== document && ownDoc.head) {
    ownDoc.getElementById(id)?.remove();
    const mirror = ownDoc.createElement('style');
    mirror.id = id;
    mirror.textContent = style.textContent;
    ownDoc.head.appendChild(mirror);
  }
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
    openNoteLink(cleanPath, dv.current().file.path);
  };
  return el;
}

function configureExternalLink(el, url) {
  const u = safeUrl(url);
  el.href = u;
  el.classList.add('external-link');
  el.target = '_blank';
  el.rel = 'noopener nofollow';
  el.title = u;
  el.onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    window.open(u, '_blank');
  };
  return el;
}

function syncCalendarPlugin(year, month) {
  try {
    const momentRef = window.moment;
    if (!momentRef) return false;
    let firstLeaf = null;
    for (const viewType of ['calendar-plus-view', 'calendar']) {
      const leaves = app.workspace.getLeavesOfType?.(viewType) || [];
      for (const leaf of leaves) {
        const cal = leaf.view?.calendar;
        if (cal && typeof cal.$set === 'function') {
          cal.$set({ displayedMonth: momentRef(new Date(year, month, 1)) });
          firstLeaf = firstLeaf || leaf;
        }
      }
    }
    if (firstLeaf) {
      app.workspace.revealLeaf?.(firstLeaf);
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[monthly-board] calendar sync failed', err);
    return false;
  }
}

function fillPopover(pop, info, dateStr) {
  pop.textContent = '';
  pop.appendChild(make('div', 'mjb-pop-title', dateStr));
  const ul = make('ul');
  for (const item of info.entries || []) {
    const li = make('li');
    appendClampText(li, `${item.time ? item.time + ' · ' : ''}${item.title}`);
    if (safeUrl(item.url)) {
      li.appendChild(document.createTextNode(' '));
      const a = make('a', '', '↗');
      configureExternalLink(a, item.url);
      a.title = '打开对应页面';
      li.appendChild(a);
    } else if (info.path) {
      li.appendChild(document.createTextNode(' '));
      const a = configureInternalLink(make('a', 'internal-link', '↗'), info.path);
      a.title = '跳到日记里这一条';
      a.onclick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        openItemInNote(item, info.path).catch(err => console.error('Monthly Board open item failed:', err));
      };
      li.appendChild(a);
    }
    ul.appendChild(li);
  }
  pop.appendChild(ul);
  if (info.essay) {
    const essayP = make('p', '', info.essay);
    if (String(info.essay).length > 48) {
      essayP.classList.add('mjb-clamp');
      essayP.title = '点击展开/收起全文';
      essayP.addEventListener('click', () => essayP.classList.toggle('is-expanded'));
    }
    pop.appendChild(essayP);
  }
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
  const day = data.get(dateStr) || null;
  if (!day) detail.appendChild(make('p', '', '这一天还没有日记，用下面的「记一条」可以直接创建。'));
  if (day?.path) {
    const open = configureInternalLink(make('a', 'internal-link mjb-open-note', '↗'), day.path);
    open.title = '打开日记';
    title.appendChild(open);
  }
  if (day?.image) {
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
  const addGridToggle = (li, item) => {
    const hidden = isGridHidden(item);
    li.appendChild(document.createTextNode(' '));
    const marker = make('span', `mjb-grid-toggle${hidden ? ' is-hidden' : ''}`, hidden ? '⊘' : '○');
    marker.title = hidden ? '已不放入日期格子，点一下放回' : '点一下仅在右侧显示';
    marker.setAttribute('role', 'switch');
    marker.setAttribute('aria-checked', hidden ? 'true' : 'false');
    marker.tabIndex = 0;
    marker.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); setGridHidden(item, !hidden); render(); };
    marker.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') marker.click(); };
    li.appendChild(marker);
  };
  // 有对应页面（如同步自 Notion 的收集条目）优先打开页面；纯日记行才跳日记里的那一行
  const addEntryLink = (li, item, notePath) => {
    if (safeUrl(item.url)) {
      li.appendChild(document.createTextNode(' '));
      const a = make('a', '', '↗');
      configureExternalLink(a, item.url);
      a.title = '打开对应页面';
      li.appendChild(a);
    } else if (notePath) {
      li.appendChild(document.createTextNode(' '));
      const a = configureInternalLink(make('a', 'internal-link', '↗'), notePath);
      a.title = '跳到日记里这一条';
      a.onclick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        openItemInNote(item, notePath).catch(err => console.error('Monthly Board open item failed:', err));
      };
      li.appendChild(a);
    }
  };
  if (day?.entries?.length) {
    detail.appendChild(make('h4', '', '完成项'));
    const ul = make('ul', 'mjb-detail-list');
    for (const item of day.entries) {
      const li = make('li', item.status ? `mjb-li${doneCls(item)}` : '');
      const prefix = `${item.time ? item.time + ' · ' : ''}${item.title}`;
      appendClampText(li, prefix);
      addEntryLink(li, item, day.path);
      addGridToggle(li, item);
      ul.appendChild(li);
    }
    detail.appendChild(ul);
  }
  if (day?.related?.length) {
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
        const li = make('li', `mjb-li${doneCls(item)}`);
        appendClampText(li, item.title);
        if (item.path && item.lineNo != null && safeUrl(item.url)) {
          // 日记时间轴条目但有对应页面：打开页面
          li.appendChild(document.createTextNode(' '));
          const a = make('a', '', '↗');
          configureExternalLink(a, item.url);
          a.title = '打开对应页面';
          li.appendChild(a);
        } else if (item.path) {
          li.appendChild(document.createTextNode(' '));
          const a = configureInternalLink(make('a', 'internal-link', '↗'), item.path);
          if (item.lineNo != null) {
            a.title = '跳到日记里这一条';
            a.onclick = ev => {
              ev.preventDefault();
              ev.stopPropagation();
              openItemInNote(item, item.path).catch(err => console.error('Monthly Board open item failed:', err));
            };
          }
          li.appendChild(a);
        } else if (safeUrl(item.url)) {
          li.appendChild(document.createTextNode(' '));
          const a = make('a', '', '↗');
          configureExternalLink(a, item.url);
          li.appendChild(a);
        }
        addGridToggle(li, item);
        ul.appendChild(li);
      }
      detail.appendChild(ul);
    }
  }
}

async function render() {
  const goto = typeof window !== 'undefined' ? window.__mjbCalendarGoto : null;
  if (goto) {
    window.__mjbCalendarGoto = null;
    if (Date.now() - goto.ts < 8000 && Number.isFinite(goto.year) && Number.isFinite(goto.month)) {
      state.year = goto.year;
      state.month = goto.month;
      state.selectedDate = ymd(goto.year, goto.month, 1);
    }
  }
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

  // 手机端：点格子从底部弹出当天详情面板（底部 Notes 栏在页面很下面，滑过去不方便）
  let sheet = null, sheetBody = null, sheetBack = null;
  const closeDaySheet = () => { sheet?.classList.remove('is-open'); sheetBack?.classList.remove('is-open'); };
  const openDaySheet = dateStr => {
    if (!isMobileView()) return;
    if (!sheet) {
      sheetBack = make('div', 'mjb-sheet-backdrop');
      sheetBack.onclick = closeDaySheet;
      sheet = make('div', 'mjb-sheet');
      const grip = make('div', 'mjb-sheet-grip');
      grip.title = '关闭';
      grip.onclick = closeDaySheet;
      sheetBody = make('div', 'mjb-sheet-body');
      sheetBody.appendChild(make('div', 'mjb-detail'));
      sheet.append(grip, sheetBody);
      ROOT.append(sheetBack, sheet);
    }
    renderDetail(sheetBody, monthData, dateStr);
    sheet.classList.add('is-open');
    sheetBack.classList.add('is-open');
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
  const monthPath = monthNotePath(state.year, state.month);
  const yearPath = yearNotePath(state.year);
  const monthTitle = make('a', 'mjb-title-link', MONTHS_CN[state.month]);
  monthTitle.title = '侧边日历跳转到该月';
  monthTitle.onclick = ev => {
    ev.preventDefault();
    ev.stopPropagation();
    if (syncCalendarPlugin(state.year, state.month)) return;
    if (monthPath) { openNoteLink(monthPath, dv.current()?.file?.path || ''); return; }
    if (boardPath && !isInPopoutWindow()) app.workspace.openLinkText(boardPath, dv.current()?.file?.path || '', false);
  };
  const yearTitle = make(yearPath ? 'a' : 'span', yearPath ? 'mjb-title-link' : '', state.year);
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
  const weeks = 6; // 固定六行：切换月份时网格行数恒定，页面高度不跳动
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
      card.onclick = () => { state.selectedDate = dateStr; saveState(state); loadDayNoteIntoArea(dateStr); updateQuickAdd(dateStr); renderDetail(side, monthData, dateStr); grid.querySelectorAll('.mjb-day').forEach(el => el.classList.remove('is-selected')); card.classList.add('is-selected'); openDaySheet(dateStr); };
      card.ondblclick = ev => { if (info?.path) { ev.preventDefault(); ev.stopPropagation(); openNoteLink(info.path, dv.current().file.path); } };
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
        if (count > 1) {
          const badge = make('div', 'mjb-photo-count', `▦ ${count}`);
          badge.title = '展开当天全部照片';
          badge.setAttribute('role', 'button');
          badge.tabIndex = 0;
          badge.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); badge.click(); } };
          badge.onclick = ev => {
            ev.preventDefault(); ev.stopPropagation();
            state.selectedDate = dateStr;
            if (!state.imageToolsOpen) state.imageToolsOpen = {};
            state.imageToolsOpen[dateStr] = true;
            if (state.sideHidden) state.sideHidden = false;
            saveState(state);
            loadDayNoteIntoArea(dateStr);
            updateQuickAdd(dateStr);
            renderDetail(side, monthData, dateStr);
            grid.querySelectorAll('.mjb-day').forEach(el => el.classList.remove('is-selected'));
            card.classList.add('is-selected');
            if (!side.isConnected || side.classList.contains('is-collapsed')) render();
          };
          card.appendChild(badge);
        }
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
      const visible = gridItems.slice(0, info?.image ? 3 : 4);
      for (const item of visible) items.appendChild(make('div', 'mjb-item' + doneCls(item), `${item.time ? item.time + ' ' : ''}${item.title}`));
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
  sideToggle.onclick = ev => { ev.stopPropagation(); state.sideHidden = !state.sideHidden; saveState(state); render(); };
  sideHead.appendChild(sideToggle);
  side.appendChild(sideHead);
  side.onclick = () => { if (state.sideHidden) { state.sideHidden = false; saveState(state); render(); } };
  // 记一条：放在 Notes 备注框下面，跟随当前选中的日期
  const quickAdd = quickAddConfig();
  let qaRow = null, qaTime = null, qaText = null;
  const updateQuickAdd = dateStr => {
    if (!qaRow || !dateStr) return;
    qaRow.dataset.date = dateStr;
    qaText.placeholder = `记一条到 ${dateStr} 的日记…`;
  };
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
  if (quickAdd.enabled) {
    qaRow = make('div', 'mjb-quickadd');
    const nowDate = new Date();
    qaTime = make('input', 'mjb-quickadd-time');
    qaTime.type = 'text';
    qaTime.value = `${pad(nowDate.getHours())}:${pad(nowDate.getMinutes())}`;
    qaTime.title = '时间（HH:MM，可改）';
    qaText = make('input', 'mjb-quickadd-text');
    qaText.type = 'text';
    const btn = make('button', 'mjb-quickadd-btn', '＋');
    btn.title = `追加到日记「${quickAdd.section}」区域`;
    const submit = async () => {
      const dateStr = qaRow.dataset.date || state.selectedDate;
      if (!dateStr) return;
      const text = qaText.value.trim();
      if (!text) { qaText.focus(); return; }
      const tm = qaTime.value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
      const now2 = new Date();
      const time = tm ? `${pad(Number(tm[1]))}:${tm[2]}` : `${pad(now2.getHours())}:${pad(now2.getMinutes())}`;
      const line = quickAdd.template.split('{time}').join(time).split('{title}').join(text);
      btn.disabled = true;
      try {
        await writeTimelineLine(dateStr, monthData.get(dateStr)?.path || '', quickAdd.section, line);
        render();
      } catch (err) {
        console.error('Monthly Board quick add failed:', err);
        new Notice('写入日记失败：' + (err?.message || err));
        btn.disabled = false;
      }
    };
    btn.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); submit(); };
    qaText.onkeydown = ev => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } };
    qaRow.append(qaTime, qaText, btn);
    side.appendChild(qaRow);
  }
  loadDayNoteIntoArea(state.selectedDate);
  updateQuickAdd(state.selectedDate);
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

  if (isMobileView()) {
    // 手机：不走桌面那套"画布+缩放+固定高度"，内容直接进文档流，滚动就是页面原生滚动
    ROOT.replaceChildren(root);
    return;
  }
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
  ownerWin().requestAnimationFrame(() => applyBoardZoom(canvas, zoomReset, frame));
  // 供 popout/玻璃窗自适应调用：改行高/宽度后同步重算格子尺寸和画布高度
  ROOT.__mjbRelayout = () => applyBoardZoom(canvas, zoomReset, frame);
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
.mjbg-shell{position:fixed;inset:9px;display:flex;flex-direction:column;border-radius:22px;overflow:hidden;
  background:rgba(22,24,32,.34);
  border:1px solid rgba(255,255,255,.20);
  box-shadow:0 26px 80px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.26), inset 0 0 0 .5px rgba(255,255,255,.08);
  backdrop-filter:blur(30px) saturate(168%); -webkit-backdrop-filter:blur(30px) saturate(168%);}
.mjbg-shell::after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:22px;
  background:linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,0) 38%);}
.mjbg-chrome{position:relative;z-index:2;flex:0 0 auto;height:40px;display:flex;align-items:center;justify-content:space-between;
  padding:0 9px 0 16px;-webkit-app-region:drag;background:rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.10);}
.mjbg-title{font-size:12px;font-weight:700;letter-spacing:.05em;color:rgba(255,255,255,.80);text-shadow:0 1px 2px rgba(0,0,0,.45);}
.mjbg-actions{display:flex;gap:6px;-webkit-app-region:no-drag;}
.mjbg-btn{-webkit-app-region:no-drag;width:27px;height:27px;border:1px solid rgba(255,255,255,.20);border-radius:999px;
  background:rgba(255,255,255,.10);color:rgba(255,255,255,.88);font-size:13px;line-height:1;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:background .15s,transform .1s;}
.mjbg-btn:hover{background:rgba(255,255,255,.24);}
.mjbg-btn:active{transform:scale(.9);}
.mjbg-btn.is-active{background:rgba(120,180,255,.42);border-color:rgba(160,205,255,.66);color:#fff;}
.mjbg-stage{position:relative;z-index:1;flex:1 1 auto;min-height:0;overflow:auto;padding:12px;}
.mjbg-stage .mjb-root{margin:0!important;max-height:none!important;height:auto!important;width:100%!important;box-shadow:none!important;}
.mjbg-stage::-webkit-scrollbar{width:9px;height:9px;}
.mjbg-stage::-webkit-scrollbar-thumb{background:rgba(255,255,255,.24);border-radius:9px;}
.mjbg-stage::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.38);}
.mjbg-stage::-webkit-scrollbar-track{background:transparent;}
`;

// ===== Live glass window (route B: Obsidian popout + 隐藏外壳 + 亚克力，真实渲染、实时联动) =====
const GLASS_LIVE_CSS = `
html:has(body.mjb-glass-live.mjb-glass-acrylic){background:transparent!important;}
body.mjb-glass-live{background:rgb(234,238,246)!important;}
body.mjb-glass-live.mjb-glass-acrylic{background:rgba(252,253,255,.55)!important;}
/* 窗口本身就是那块玻璃：边缘一圈白色高光细边 + 顶部光泽，贴着窗口圆角，内外只有一条边 */
body.mjb-glass-live::after{content:'';position:fixed;inset:0;z-index:99998;pointer-events:none;border-radius:8px;
  border:1px solid rgba(255,255,255,.65);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.9), inset 0 0 0 1px rgba(255,255,255,.12), inset 0 -1px 0 rgba(120,130,150,.18);
  background:linear-gradient(170deg, rgba(255,255,255,.22), rgba(255,255,255,0) 30%);}
/* 阅读视图强制铺满整个窗口（原来下面空着的那块是 Obsidian 给隐藏掉的标题栏/状态栏预留的高度） */
body.mjb-glass-live .workspace-leaf.mod-active .markdown-reading-view,
body.mjb-glass-live .markdown-reading-view{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;margin:0!important;padding:0!important;}
body.mjb-glass-live .titlebar,
body.mjb-glass-live .workspace-tab-header-container,
body.mjb-glass-live .view-header,
body.mjb-glass-live .status-bar,
body.mjb-glass-live .workspace-ribbon,
body.mjb-glass-live .mjb-popout-actions,
body.mjb-glass-live .mjb-zoom-toolbar{display:none!important;}
body.mjb-glass-live .monthly-journal-board,
body.mjb-glass-live .mjb-zoom-viewport{max-height:none!important;}
/* 整块一张玻璃板：内容区贴满窗口，没有外圈；顶部功能条变成透明的浮条 */
body.mjb-glass-live .app-container{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;background:transparent!important;}
body.mjb-glass-live .mjbg-live-chrome{left:0!important;right:0!important;top:0!important;background:transparent!important;border:none!important;box-shadow:none!important;}
body.mjb-glass-live .mjbg-live-title{visibility:hidden;}
body.mjb-glass-live .mjbg-live-actions{background:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.6);border-radius:999px;padding:3px;margin:4px 10px 0 0;}
body.mjb-glass-live .mjbg-live-actions:hover{background:rgba(255,255,255,.75);}
body.mjb-glass-live .horizontal-main-container,
body.mjb-glass-live .workspace,
body.mjb-glass-live .workspace-split,
body.mjb-glass-live .workspace-tabs,
body.mjb-glass-live .workspace-tab-container,
body.mjb-glass-live .workspace-leaf,
body.mjb-glass-live .workspace-leaf-content,
body.mjb-glass-live .view-content,
body.mjb-glass-live .markdown-reading-view,
body.mjb-glass-live .markdown-preview-view{background:transparent!important;border:none!important;box-shadow:none!important;}
/* ── 浅色磨砂：月历本体去实色，格子/侧栏变半透明白雾薄片，照片保持不透明 ── */
body.mjb-glass-live .mjb-root{
  --mjb-ink:#1f2a3d!important; --mjb-muted:rgba(31,42,61,.62)!important;
  --mjb-accent:rgba(78,98,140,.82)!important; --mjb-accent-2:rgba(64,110,210,.75)!important;
  --mjb-card:rgba(255,255,255,.26)!important; --mjb-line:rgba(255,255,255,.62)!important;
  /* 月历本身不再是第二块板：无底色、无边框、无阴影，直接画在窗口玻璃上 */
  background:transparent!important; background-image:none!important;
  border:none!important; border-radius:0!important; box-shadow:none!important;
  color:var(--mjb-ink)!important; min-height:0!important;}
body.mjb-glass-live .mjb-root::before{opacity:.06!important;}
/* 玻璃窗始终按 ≥1220 设计宽度排版再整体缩放：抵消按真实窗口宽度触发的 @media(max-width:920px) 单列布局 */
body.mjb-glass-live .mjb-root:not([data-side-hidden="true"]) .mjb-main{grid-template-columns:minmax(0,1fr) 8px clamp(150px,30%,var(--mjb-side))!important;}
body.mjb-glass-live .mjb-root[data-side-hidden="true"] .mjb-main{grid-template-columns:minmax(0,1fr) 0 34px!important;}
body.mjb-glass-live .mjb-resizer{display:block!important;}
body.mjb-glass-live .mjb-side{overflow:hidden!important;}
body.mjb-glass-live .mjb-detail{overflow:auto!important;flex:1 1 auto!important;min-height:0!important;max-height:none!important;}
body.mjb-glass-live .mjb-side.is-collapsed{width:34px!important;}
body.mjb-glass-live .mjb-side.is-collapsed .mjb-side-head{writing-mode:vertical-rl!important;}
/* 玻璃窗头部紧凑化：小标题、藏副标题、压间距，把高度让给格子 */
body.mjb-glass-live .mjb-root{padding:14px 18px!important;}
body.mjb-glass-live .mjb-head{margin-bottom:8px!important;}
body.mjb-glass-live .mjb-title{font-size:clamp(26px,3.6vw,44px)!important;letter-spacing:-1px!important;}
body.mjb-glass-live .mjb-subtitle{display:none!important;}
body.mjb-glass-live .mjb-month-tabs{margin:2px 0 8px!important;gap:4px!important;}
body.mjb-glass-live .mjb-month-tab{padding:4px 8px!important;}
/* 玻璃窗里用不上的控件藏起来：主题下拉、背景输入框、背景预设按钮（保留 ←年/年→/今天） */
body.mjb-glass-live .mjb-controls select,
body.mjb-glass-live .mjb-controls input,
body.mjb-glass-live .mjb-controls > button:nth-of-type(n+4){display:none!important;}
body.mjb-glass-live .mjbg-live-chrome{-webkit-app-region:no-drag!important;cursor:grab;}
body.mjb-glass-live .mjbg-live-chrome.is-dragging{cursor:grabbing;}
body.mjb-glass-live .mjb-head{background:none!important;}
body.mjb-glass-live .mjb-title,
body.mjb-glass-live .mjb-title-link{color:#1f2a3d!important;text-shadow:0 1px 0 rgba(255,255,255,.7)!important;}
body.mjb-glass-live .mjb-subtitle,
body.mjb-glass-live .mjb-weekdays{color:rgba(31,42,61,.62)!important;text-shadow:0 1px 0 rgba(255,255,255,.6)!important;}
body.mjb-glass-live .mjb-weekdays > div{border-bottom-color:rgba(255,255,255,.7)!important;}
body.mjb-glass-live .mjb-controls button,
body.mjb-glass-live .mjb-controls select,
body.mjb-glass-live .mjb-controls input,
body.mjb-glass-live .mjb-side-toggle,
body.mjb-glass-live .mjb-photo-toggle,
body.mjb-glass-live .mjb-photo-tools button{background:rgba(255,255,255,.42)!important;border-color:rgba(255,255,255,.75)!important;color:#1f2a3d!important;}
body.mjb-glass-live .mjb-month-tab{background:rgba(255,255,255,.48)!important;color:rgba(31,42,61,.78)!important;border:1px solid rgba(255,255,255,.65)!important;text-shadow:none!important;}
body.mjb-glass-live .mjb-month-tab.is-active{background:rgba(255,255,255,.88)!important;color:#1f2a3d!important;box-shadow:0 4px 14px rgba(30,40,60,.14)!important;}
/* 格内文字按设计宽度取字号（cqw=月历容器宽度），抵消整体缩放，视觉上和主窗口一样大 */
body.mjb-glass-live .mjb-item{font-size:clamp(10px,.92cqw,12px)!important;}
body.mjb-glass-live .mjb-more{font-size:clamp(9px,.85cqw,11px)!important;}
body.mjb-glass-live .mjb-day{background:rgba(255,255,255,.52)!important;border-color:rgba(255,255,255,.75)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7), 0 4px 14px rgba(30,40,60,.06)!important;}
body.mjb-glass-live .mjb-day:hover{background:rgba(255,255,255,.40)!important;border-color:rgba(255,255,255,.9)!important;box-shadow:0 10px 24px rgba(30,40,60,.14)!important;}
body.mjb-glass-live .mjb-day.is-empty{background:transparent!important;border-color:rgba(255,255,255,.45)!important;box-shadow:none!important;opacity:.45!important;}
body.mjb-glass-live .mjb-day.is-selected{outline:2px solid rgba(64,110,210,.70)!important;}
body.mjb-glass-live .mjb-day:not(.has-image) .mjb-item{background:rgba(255,255,255,.55)!important;color:#1f2a3d!important;border:none!important;text-shadow:none!important;}
body.mjb-glass-live .mjb-day:not(.has-image) .mjb-more{color:rgba(31,42,61,.62)!important;}
body.mjb-glass-live .mjb-date{background:rgba(255,255,255,.85)!important;color:#1f2a3d!important;box-shadow:0 2px 8px rgba(30,40,60,.18)!important;}
body.mjb-glass-live .mjb-week-chip{background:rgba(255,255,255,.7)!important;color:rgba(31,42,61,.7)!important;}
body.mjb-glass-live .mjb-side{background:rgba(255,255,255,.50)!important;border-color:rgba(255,255,255,.75)!important;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.7), 0 10px 30px rgba(30,40,60,.08)!important;}
body.mjb-glass-live .mjb-side h1,body.mjb-glass-live .mjb-side h2,body.mjb-glass-live .mjb-side h3,body.mjb-glass-live .mjb-side h4,
body.mjb-glass-live .mjb-detail h1,body.mjb-glass-live .mjb-detail h2,body.mjb-glass-live .mjb-detail h3,body.mjb-glass-live .mjb-detail h4{color:#1f2a3d!important;}
body.mjb-glass-live .mjb-note-area{background:rgba(255,255,255,.62)!important;border-color:rgba(255,255,255,.85)!important;color:#1f2a3d!important;}
body.mjb-glass-live .mjb-detail,
body.mjb-glass-live .mjb-detail a{color:#1f2a3d!important;}
body.mjb-glass-live .mjb-detail{border-top-color:rgba(255,255,255,.7)!important;}
body.mjb-glass-live .mjb-open-message,
body.mjb-glass-live .mjb-focus-panel{background:rgba(255,255,255,.40)!important;}
body.mjb-glass-live .mjb-resizer{opacity:.25!important;}
.mjbg-live-chrome{position:fixed;z-index:99999;left:10px;right:10px;top:6px;height:34px;display:flex;align-items:center;justify-content:space-between;
  padding:0 5px 0 14px;-webkit-app-region:drag;user-select:none;border-radius:12px;
  background:rgba(255,255,255,.32);border:1px solid rgba(255,255,255,.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.75);}
.mjbg-live-title{font:700 12px/1 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:.05em;color:#1f2a3d;}
.mjbg-live-title .mjbg-live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#7ee08a;margin-right:8px;box-shadow:0 0 6px rgba(126,224,138,.8);vertical-align:1px;}
.mjbg-live-actions{display:flex;gap:6px;-webkit-app-region:no-drag;}
.mjbg-live-btn{-webkit-app-region:no-drag;width:26px;height:26px;padding:0;border:1px solid rgba(255,255,255,.75);border-radius:999px;box-shadow:none;
  background:rgba(255,255,255,.45);color:#1f2a3d;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.mjbg-live-btn:hover{background:rgba(255,255,255,.80);}
.mjbg-live-btn.is-active{background:rgba(64,110,210,.22);border-color:rgba(64,110,210,.45);color:#1f3f8a;}
`;

const GLASS_RUNTIME_JS = `
(function(){
  var electron=null, remote=null;
  try{ electron=require('electron'); }catch(e){}
  try{ remote=require('@electron/remote'); }catch(e){ try{ remote=electron&&electron.remote; }catch(_){} }
  function curWin(){ try{ return remote&&remote.getCurrentWindow?remote.getCurrentWindow():null; }catch(e){ return null; } }
  function flagPath(){
    try{
      var p=decodeURIComponent(location.pathname).replace(/^\\/+/,'');
      var dir=p.substring(0,p.replace(/\\\\/g,'/').lastIndexOf('/'));
      return dir+'/_glass-refresh.flag';
    }catch(e){ return null; }
  }
  var pinned=true;
  document.addEventListener('click', function(ev){
    var btn=ev.target.closest && ev.target.closest('.mjbg-btn');
    if(btn){
      var act=btn.getAttribute('data-act');
      if(act==='close'){ var w=curWin(); if(w){try{w.close();}catch(e){}} else { try{window.close();}catch(e){} } return; }
      if(act==='pin'){ var w2=curWin(); pinned=!pinned; if(w2){try{w2.setAlwaysOnTop(pinned,'floating');}catch(e){}} btn.classList.toggle('is-active',pinned); return; }
      if(act==='refresh'){
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
    }
  }, true);
  (function(){ var w=curWin(); if(w){ try{ w.setAlwaysOnTop(true,'floating'); }catch(e){} } var pb=document.querySelector('.mjbg-btn[data-act="pin"]'); if(pb) pb.classList.add('is-active'); })();
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
      name: t('cmdInsert'),
      editorCallback: editor => {
        editor.replaceSelection('```monthly-board\nconfig: ' + this.settings.configPath + '\n```\n');
      },
    });

    this.addCommand({
      id: 'inspect-monthly-board-entry',
      name: t('cmdInspect'),
      callback: () => this.inspectMonthlyBoardEntry(),
    });

    this.addCommand({
      id: 'toggle-floating-monthly-board',
      name: t('cmdToggleFloating'),
      callback: () => this.toggleFloatingBoard(),
    });

    this.addCommand({
      id: 'open-monthly-board-via-hover-editor',
      name: t('cmdHover'),
      callback: () => this.openMonthlyBoardViaHoverEditor().catch(error => this.showFailure(t('failHover'), error)),
    });

    this.addCommand({
      id: 'open-monthly-board-popout',
      name: t('cmdPopout'),
      callback: () => this.openMonthlyBoardPopout().catch(error => this.showFailure(t('failPopout'), error)),
    });

    this.addCommand({
      id: 'refit-monthly-board-popout',
      name: t('cmdRefit'),
      callback: () => this.refitAllMonthlyBoardPopouts(),
    });

    this.addCommand({
      id: 'open-monthly-board-glass',
      name: t('cmdOpenGlass'),
      callback: () => this.openGlassBoard().catch(error => this.showFailure(t('failGlassOpen'), error)),
    });

    this.addCommand({
      id: 'open-monthly-board-glass-snapshot',
      name: t('cmdOpenGlassSnapshot'),
      callback: () => this.openGlassSnapshotBoard().catch(error => this.showFailure(t('failGlassOpen'), error)),
    });

    // 玻璃窗被打开了别的页面 → 拉回月历（锁定开关）
    this.registerEvent(this.app.workspace.on('file-open', file => {
      if (this.settings.liveGlassLock === false || !this.liveGlassLeaf) return;
      const leaf = this.liveGlassLeaf;
      if (!this.isLeafAlive(leaf)) return;
      if (file && leaf.view?.file === file) this.recallLiveGlassToBoard();
    }));

    // 实时玻璃窗：库里数据变化后自动重渲染（无玻璃窗时空操作）
    const glassTrigger = () => this.scheduleLiveGlassRerender();
    this.registerEvent(this.app.metadataCache.on('changed', glassTrigger));
    this.registerEvent(this.app.vault.on('create', glassTrigger));
    this.registerEvent(this.app.vault.on('delete', glassTrigger));
    this.registerEvent(this.app.vault.on('rename', glassTrigger));

    this.addCommand({
      id: 'refresh-monthly-board-glass',
      name: t('cmdRefreshGlass'),
      callback: () => this.refreshGlassBoard().catch(error => this.showFailure(t('failGlassRefresh'), error)),
    });



    // 点击侧边日历小部件（Calendar Plus / Calendar）的月份标题 → 打开月历看板笔记并切到对应月份（可在设置中关闭）
    this.registerDomEvent(document, 'click', ev => {
      if (!this.settings.calendarGotoMonthlyBoard) return;
      const leafContent = ev.target?.closest?.('.workspace-leaf-content[data-type="calendar-plus-view"], .workspace-leaf-content[data-type="calendar"]');
      if (!leafContent) return;
      const h3 = ev.target.closest('h3');
      if (!h3 || !leafContent.contains(h3)) return;
      const leaf = [
        ...(this.app.workspace.getLeavesOfType?.('calendar-plus-view') || []),
        ...(this.app.workspace.getLeavesOfType?.('calendar') || []),
      ].find(l => l.view?.containerEl === leafContent);
      let info = null;
      try {
        const m = leaf?.view?.calendar?.$$?.ctx?.[0];
        if (m && typeof m.year === 'function' && typeof m.month === 'function') info = { year: m.year(), month: m.month() };
      } catch {}
      if (!info) {
        const text = h3.textContent || '';
        const year = Number(text.match(/\d{4}/)?.[0]);
        const zh = text.match(/(\d{1,2})\s*月/);
        const en = text.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i);
        const monthNum = zh ? Number(zh[1]) : (en ? 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(en[0].toLowerCase()) / 3 + 1 : NaN);
        if (year && monthNum >= 1 && monthNum <= 12) info = { year, month: monthNum - 1 };
      }
      if (!info) return;
      window.__mjbCalendarGoto = { year: info.year, month: info.month, ts: Date.now() };
      window.dispatchEvent(new CustomEvent('mjb-calendar-goto', { detail: { year: info.year, month: info.month } }));
      const floatPath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
      const dest = this.app.metadataCache.getFirstLinkpathDest(floatPath.replace(/\.md$/i, ''), '');
      this.app.workspace.openLinkText(dest?.path || floatPath, '', false);
    });

    this.addSettingTab(new MonthlyBoardSettingTab(this.app, this));
    this.registerEvent(this.app.workspace.on('file-open', () => this.enforceReadingModeSoon()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.enforceReadingModeSoon()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.enforceReadingModeSoon()));
    this.enforceReadingModeSoon();
    this.app.workspace.onLayoutReady(() => window.setTimeout(() => this.restoreLiveGlass(), 600));
  }

  // Obsidian 重载/重启会按布局恢复 popout，但那是普通窗口 → 若上次玻璃窗开着，就把恢复出来的月历 popout 重新套上玻璃
  restoreLiveGlass() {
    if (!this.settings.liveGlassOpen) return;
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    let found = null;
    this.app.workspace.iterateAllLeaves(leaf => {
      if (found || !this.isPopoutLeaf(leaf)) return;
      const file = leaf.view?.file?.path || leaf.getViewState?.()?.state?.file;
      if (file === sourcePath) found = leaf;
    });
    if (!found) { this.settings.liveGlassOpen = false; this.saveSettings().catch(() => {}); return; }
    this.applyLiveGlassWhenReady(found).then(() => this.startPopoutAutoFit(found));
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

  // 显示类设置改动后立刻重渲染：阅读视图代码块 + 浮动面板 + 玻璃窗（未开则空操作）
  refreshAllBoards() {
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.getMode?.() === 'preview') {
        try { view.previewMode?.rerender(true); } catch (e) {}
      }
    });
    if (this.floatingPanel) {
      const body = this.floatingPanel.querySelector('.monthly-board-floating-body');
      if (body) this.renderFloatingBoard(body).catch(console.error);
    }
    this.refreshGlassBoard().catch(() => {});
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
    new Notice(t('noticeEntryOk', { src: entry.sourcePath, cfg: entry.configPath }));
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

  async openMonthlyBoardPopout(options = {}) {
    const glass = !!options.glass;
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
      if (this.isPopoutLeaf(leaf) && leaf.view?.file?.path === sourcePath) existingLeaf = leaf;
    });
    if (existingLeaf) {
      this.app.workspace.setActiveLeaf(existingLeaf, { focus: true });
      const winRef = this.leafWinDoc(existingLeaf).win;
      try { winRef?.focus?.(); } catch {}
      // 已有 popout：重新跑 fit + 按钮（防旧版本残留进程没装上）
      if (glass) await this.applyLiveGlassWhenReady(existingLeaf);
      this.startPopoutAutoFit(existingLeaf);
      return existingLeaf;
    }

    const ws = this.app.workspace;
    const ext = normalizeExternalWindowSettings(this.settings.externalWindow);
    const initData = glass ? { size: { width: ext.width, height: ext.height } } : undefined;
    const opener =
      ws.openPopoutLeaf ? () => ws.openPopoutLeaf(initData) :
      ws.createLeafInNewWindow ? () => ws.createLeafInNewWindow() :
      null;
    if (!opener) {
      throw new Error('当前 Obsidian 不支持 popout 窗口（缺少 openPopoutLeaf API）。');
    }
    const leaf = opener();
    if (!leaf) throw new Error('无法创建 popout leaf。');
    await leaf.openFile(file, { state: { mode: 'preview' } });
    if (glass) await this.applyLiveGlassWhenReady(leaf);

    // 启动自适应缩放：popout 窗口大小变化时，月历内容（含字、图、卡片）整体等比缩放。
    this.startPopoutAutoFit(leaf);
    return leaf;
  }

  isPopoutLeaf(leaf) {
    const { win } = this.leafWinDoc(leaf);
    if (win) return win !== window;
    const root = leaf.getRoot?.();
    return !!root && root !== this.app.workspace.rootSplit;
  }

  // popout 窗口是异步建的：等 leaf 真正挂进新窗口的 document 再套玻璃（最多 ~4s）
  async applyLiveGlassWhenReady(leaf) {
    for (let i = 0; i < 40; i++) {
      const { win, doc } = this.leafWinDoc(leaf);
      if (win && win !== window && doc && doc.body) {
        this.applyLiveGlass(leaf);
        return true;
      }
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
    this.applyLiveGlass(leaf);
    return false;
  }

  // ===== 实时玻璃窗 =====
  // 诊断日志：写插件目录 _glass-debug.log（复现"窗口不断变大"时把这个文件发我）
  glassDebugLog(msg) {
    try {
      const fs = require('fs');
      const path = require('path');
      fs.appendFileSync(path.join(this.glassPaths().dir, '_glass-debug.log'), `${new Date().toISOString()} ${msg}\n`);
    } catch {}
  }

  // Obsidian 的 popout 是同一渲染进程 window.open 出来的子窗口：popout 里没有自己的 require，
  // 主窗口的 remote.getCurrentWindow() 又只会返回主窗口 → 从全部 BrowserWindow 里按位置尺寸认出它
  popoutBrowserWindow(win) {
    let remote = null;
    try { remote = require('@electron/remote'); } catch { try { remote = require('electron').remote; } catch {} }
    if (!remote || !remote.BrowserWindow) return null;
    try {
      const main = remote.getCurrentWindow ? remote.getCurrentWindow() : null;
      const all = remote.BrowserWindow.getAllWindows().filter(w => !w.isDestroyed() && (!main || w.id !== main.id));
      if (!all.length) return null;
      if (all.length === 1) return all[0];
      const x = win.screenX, y = win.screenY, w0 = win.outerWidth, h0 = win.outerHeight;
      let best = null, bestScore = Infinity;
      for (const bw of all) {
        const b = bw.getBounds();
        const score = Math.abs(b.x - x) + Math.abs(b.y - y) + Math.abs(b.width - w0) + Math.abs(b.height - h0);
        if (score < bestScore) { bestScore = score; best = bw; }
      }
      return best;
    } catch (error) {
      console.warn('[Monthly Board] find popout BrowserWindow failed', error);
      return null;
    }
  }

  supportsAcrylic() {
    try {
      if (process.platform !== 'win32') return false;
      const build = Number(String(require('os').release()).split('.')[2]);
      return Number.isFinite(build) && build >= 22621; // Win11 22H2+
    } catch { return false; }
  }

  isLeafAlive(leaf) {
    if (!leaf) return false;
    let alive = false;
    this.app.workspace.iterateAllLeaves(l => { if (l === leaf) alive = true; });
    if (!alive) return false;
    const { win } = this.leafWinDoc(leaf);
    return !!win && !win.closed;
  }

  // leaf 所在窗口：getRoot() 在 popout 里不一定带 win/doc（实测拿不到），以 DOM 的 ownerDocument 为准
  leafWinDoc(leaf) {
    const el = leaf?.view?.containerEl || leaf?.containerEl;
    let doc = el?.ownerDocument || null;
    let win = doc?.defaultView || null;
    if (!win) {
      const c = leaf?.getContainer?.() || leaf?.getRoot?.();
      win = c?.win || c?.doc?.defaultView || null;
      doc = c?.doc || win?.document || null;
    }
    return { win, doc };
  }

  // 玻璃窗里被打开了别的页面 → 拉回月历（锁定开关开着时）
  recallLiveGlassToBoard() {
    const leaf = this.liveGlassLeaf;
    if (!leaf || !this.isLeafAlive(leaf)) return;
    const want = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    if (leaf.view?.file?.path === want) return;
    const target = this.app.vault.getAbstractFileByPath(want);
    if (!target || target.children) return;
    leaf.openFile(target, { state: { mode: 'preview' } }).catch(() => {});
  }

  applyLiveGlass(leaf) {
    const { win, doc } = this.leafWinDoc(leaf);
    if (!win || !doc || !doc.body || win === window) {
      console.warn('[Monthly Board] live glass: leaf 不在 popout 窗口里', { win: !!win, doc: !!doc, same: win === window });
      return;
    }
    // 锁定内容：钉住 leaf（链接默认进新 tab，不顶掉月历）
    if (this.settings.liveGlassLock !== false) { try { leaf.setPinned(true); } catch {} }
    this.liveGlassLeaf = leaf;
    const body = doc.body;
    body.classList.add('mjb-glass-live');
    if (body.dataset.mjbGlassAcrylic === '1') body.classList.add('mjb-glass-acrylic');
    // Obsidian 会把主窗口的 body className 同步到 popout（换主题/CSS 变化时），会冲掉玻璃类名 → 盯住并补回
    if (!body.__mjbGlassObs && win.MutationObserver) {
      const obs = new win.MutationObserver(() => {
        if (!body.classList.contains('mjb-glass-live')) body.classList.add('mjb-glass-live');
        if (body.dataset.mjbGlassAcrylic === '1' && !body.classList.contains('mjb-glass-acrylic')) body.classList.add('mjb-glass-acrylic');
      });
      obs.observe(body, { attributes: true, attributeFilter: ['class'] });
      body.__mjbGlassObs = obs;
    }
    // 记住玻璃窗开着：Obsidian 重载后会恢复 popout，届时自动重新套玻璃
    if (!this.settings.liveGlassOpen) { this.settings.liveGlassOpen = true; this.saveSettings().catch(() => {}); }
    if (!doc.getElementById('mjb-glass-live-style')) {
      const style = doc.createElement('style');
      style.id = 'mjb-glass-live-style';
      style.textContent = GLASS_LIVE_CSS;
      doc.head.appendChild(style);
    }
    doc.querySelector('.mjb-popout-actions')?.remove();

    const bw = this.popoutBrowserWindow(win);
    const ext = normalizeExternalWindowSettings(this.settings.externalWindow);
    if (!body.dataset.mjbGlassInit) {
      body.dataset.mjbGlassInit = '1';
      // 用户手动关玻璃窗才清标记；退出 Obsidian 时主进程先没了，定时器跑不到，标记保留以便下次恢复
      win.addEventListener('beforeunload', () => {
        window.setTimeout(() => {
          if (this.liveGlassLeaf === leaf && !this.isLeafAlive(leaf)) this.liveGlassLeaf = null;
          if (!this.liveGlassLeaf) { this.settings.liveGlassOpen = false; this.saveSettings().catch(() => {}); }
        }, 1500);
      }, { once: true });
      if (!bw) body.dataset.mjbGlassWhy = '找不到窗口句柄';
      else if (!this.supportsAcrylic()) body.dataset.mjbGlassWhy = '系统低于 Win11 22H2';
      else if (typeof bw.setBackgroundMaterial !== 'function') body.dataset.mjbGlassWhy = 'Electron 版本过旧';
      if (bw) {
        if (ext.alwaysOnTop !== false) { try { bw.setAlwaysOnTop(true, 'floating'); body.dataset.mjbGlassPinned = '1'; } catch {} }
        if (this.supportsAcrylic() && typeof bw.setBackgroundMaterial === 'function') {
          try {
            bw.setBackgroundColor('#00000000');
            bw.setBackgroundMaterial('acrylic');
            body.dataset.mjbGlassAcrylic = '1';
            body.classList.add('mjb-glass-acrylic');
          } catch (error) {
            body.dataset.mjbGlassWhy = '调用失败：' + (error?.message || error);
            console.warn('[Monthly Board] acrylic failed', error);
          }
        }
      }
    }

    if (!doc.querySelector('.mjbg-live-chrome')) {
      const bar = doc.createElement('div');
      bar.className = 'mjbg-live-chrome';
      const title = doc.createElement('span');
      title.className = 'mjbg-live-title';
      const dot = doc.createElement('span');
      dot.className = 'mjbg-live-dot';
      title.appendChild(dot);
      title.appendChild(doc.createTextNode(String(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath).split('/').pop().replace(/\.md$/i, '')));
      title.title = '实时联动中';
      const actions = doc.createElement('div');
      actions.className = 'mjbg-live-actions';
      const mkBtn = (label, tip, onClick) => {
        const b = doc.createElement('button');
        b.className = 'mjbg-live-btn';
        b.innerHTML = label;
        b.title = tip;
        b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); onClick(b); });
        actions.appendChild(b);
        return b;
      };
      mkBtn('&#8635;', '重新渲染', b => {
        this.rerenderLiveGlass(true);
        b.classList.add('is-active');
        win.setTimeout(() => b.classList.remove('is-active'), 520);
      });
      const pinBtn = mkBtn('&#128204;', '置顶切换', b => {
        const w = this.popoutBrowserWindow(win);
        const next = body.dataset.mjbGlassPinned !== '1';
        try { w && w.setAlwaysOnTop(next, 'floating'); } catch {}
        body.dataset.mjbGlassPinned = next ? '1' : '0';
        b.classList.toggle('is-active', next);
      });
      pinBtn.classList.toggle('is-active', body.dataset.mjbGlassPinned === '1');
      mkBtn('&#10005;', '关闭', () => {
        const w = this.popoutBrowserWindow(win);
        if (w && w.close) { try { w.close(); return; } catch {} }
        try { win.close(); } catch {}
      });
      bar.append(title, actions);
      body.appendChild(bar);

      // 拖动窗口：Obsidian popout 里 -webkit-app-region:drag 实测不生效，改用 JS 拖动 BrowserWindow
      let drag = null;
      bar.addEventListener('pointerdown', ev => {
        if (ev.button !== 0 || ev.target.closest('.mjbg-live-btn')) return;
        const w = this.popoutBrowserWindow(win);
        if (!w) return;
        let b = null;
        try { b = w.getBounds(); } catch {}
        if (!b) return;
        // Windows 非 100% 缩放下移动窗口会因 DPI 取整让尺寸抖 1~2px。
        // 拖动期间把最小/最大尺寸都锁成当前尺寸 → 系统层面不允许尺寸变化；同时标记拖动中，fit 忽略 resize
        let minS = null, maxS = null;
        try { minS = w.getMinimumSize(); maxS = w.getMaximumSize(); w.setMinimumSize(b.width, b.height); w.setMaximumSize(b.width, b.height); } catch {}
        win.__mjbDragging = true;
        drag = { w, sx: ev.screenX, sy: ev.screenY, x: b.x, y: b.y, width: b.width, height: b.height, id: ev.pointerId, minS, maxS };
        this.glassDebugLog(`drag start ${b.width}x${b.height}`);
        try { bar.setPointerCapture(ev.pointerId); } catch {}
        bar.classList.add('is-dragging');
        ev.preventDefault();
      });
      bar.addEventListener('pointermove', ev => {
        if (!drag || ev.pointerId !== drag.id) return;
        const nx = Math.round(drag.x + ev.screenX - drag.sx);
        const ny = Math.round(drag.y + ev.screenY - drag.sy);
        try { drag.w.setBounds({ x: nx, y: ny, width: drag.width, height: drag.height }); } catch {}
      });
      const endDrag = ev => {
        if (!drag) return;
        // 先解锁尺寸限制（否则下面的补偿写不进去）
        try {
          if (drag.minS) drag.w.setMinimumSize(drag.minS[0], drag.minS[1]);
          if (drag.maxS) drag.w.setMaximumSize(drag.maxS[0], drag.maxS[1]);
        } catch {}
        // 兜底：若仍有 DPI 取整多出的 1~2px，反向补偿回去（最多 3 次）
        try {
          let tw = drag.width, th = drag.height;
          for (let i = 0; i < 3; i++) {
            const e = drag.w.getBounds();
            const dw = e.width - drag.width, dh = e.height - drag.height;
            if (!dw && !dh) break;
            tw -= dw; th -= dh;
            drag.w.setBounds({ x: e.x, y: e.y, width: tw, height: th });
          }
          const e = drag.w.getBounds();
          this.glassDebugLog(`drag end ${e.width}x${e.height} (start ${drag.width}x${drag.height})`);
        } catch {}
        try { bar.releasePointerCapture(drag.id); } catch {}
        drag = null;
        bar.classList.remove('is-dragging');
        // 松手后残留的 resize 事件也忽略掉，再解除标记
        win.setTimeout(() => { win.__mjbDragging = false; }, 400);
      };
      bar.addEventListener('pointerup', endDrag);
      bar.addEventListener('pointercancel', endDrag);
      bar.addEventListener('lostpointercapture', endDrag);
    }
  }

  scheduleLiveGlassRerender(delay = 1500) {
    if (!this.liveGlassLeaf) return;
    if (!this.isLeafAlive(this.liveGlassLeaf)) { this.liveGlassLeaf = null; return; }
    if (this.liveGlassTimer) window.clearTimeout(this.liveGlassTimer);
    this.liveGlassTimer = window.setTimeout(() => this.rerenderLiveGlass(false), delay);
  }

  rerenderLiveGlass(force) {
    const leaf = this.liveGlassLeaf;
    if (!this.isLeafAlive(leaf)) { this.liveGlassLeaf = null; return; }
    const { doc } = this.leafWinDoc(leaf);
    const active = doc && doc.activeElement;
    // 正在玻璃窗里打字/选下拉：推迟，避免重渲染打断输入
    if (!force && active && /^(TEXTAREA|INPUT|SELECT)$/.test(active.tagName) && doc.hasFocus && doc.hasFocus()) {
      this.scheduleLiveGlassRerender(2500);
      return;
    }
    try { leaf.view?.previewMode?.rerender(true); } catch (error) { console.warn('[Monthly Board] live glass rerender failed', error); }
  }

  refitAllMonthlyBoardPopouts() {
    const sourcePath = normalizePath(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath);
    let touched = 0;
    this.app.workspace.iterateAllLeaves(leaf => {
      if (!this.isPopoutLeaf(leaf)) return;
      const filePath = leaf.view?.file?.path;
      if (filePath !== sourcePath) return;
      this.startPopoutAutoFit(leaf);
      touched += 1;
    });
    new Notice(t('noticeRefit', { n: touched }), 3000);
  }

  startPopoutAutoFit(leaf) {
    const { win: popoutWin, doc: popoutDoc } = this.leafWinDoc(leaf);
    if (!popoutWin || !popoutDoc || popoutWin === window) return;

    // 已装过自适应的 popout：直接重算一次，不重复挂监听
    if (typeof popoutWin.__mjbRefit === 'function') { popoutWin.__mjbRefit(); return; }

    const getMonthlyBoardSizer = () => {
      // 入口笔记 cssclasses 也叫 monthly-journal-board（会挂在 .markdown-preview-view 上），
      // 必须取 sizer 里面那个真正的代码块容器，否则 sizer 永远找不到。
      const viewport = popoutDoc.querySelector('.markdown-preview-sizer .mjb-zoom-viewport');
      const board = viewport ? viewport.parentElement : popoutDoc.querySelector('.markdown-preview-sizer .monthly-journal-board');
      if (!board) return {};
      return {
        board,
        view: board.closest('.markdown-preview-view, .markdown-reading-view'),
        sizer: board.closest('.markdown-preview-sizer'),
      };
    };

    // 注入关闭/置顶按钮（仅当本 popout 确认渲染了月历时；玻璃窗有自己的标题栏）
    const injectActionsIfReady = () => {
      if (popoutDoc.body && popoutDoc.body.classList.contains('mjb-glass-live')) return;
      if (getMonthlyBoardSizer().board) this.injectPopoutActionButtons(popoutWin, popoutDoc);
    };
    let mo = null;
    const fitLog = msg => this.glassDebugLog(`fit ${msg}`);
    // 防循环：短时间内 fit 太频繁就冻结一会儿
    let fitTimes = [], fitFrozenUntil = 0;

    // Fit 策略：只操作包含 .monthly-journal-board 的那一棵 markdown DOM。
    // 禁止用 document.querySelector('.markdown-preview-sizer') 这种全局选择器，
    // 否则同一个 popout/window 里打开 Bases/数据库时会误改它们的容器，导致空白。
    // 稳定性闸门：同一份渲染（同一个 .mjb-root 元素）+ 窗口可用尺寸变化 <4px → 不重算。
    // 只有三种情况才重算：窗口真被拉伸、月历重新渲染（切月/数据变化）、手动点 ↻。
    let lastFit = { root: null, w: 0, h: 0 };
    const fit = (force) => {
      {
        const pre = getMonthlyBoardSizer();
        if (!pre.view || !pre.sizer) return false;
        const aw = pre.view.clientWidth, ah = pre.view.clientHeight;
        const r = pre.board.querySelector('.mjb-root');
        if (!force && r && r === lastFit.root && Math.abs(aw - lastFit.w) < 4 && Math.abs(ah - lastFit.h) < 4) return false;
      }
      const now = Date.now();
      if (now < fitFrozenUntil) return false;
      fitTimes = fitTimes.filter(x => now - x < 2500);
      fitTimes.push(now);
      if (fitTimes.length > 25) {
        fitFrozenUntil = now + 3000;
        fitLog(`FROZEN 3s, ${fitTimes.length} fits in 2.5s`);
        return false;
      }
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
        // 入口笔记 CSS 对 sizer 有 width/max-width:100% !important，内联也必须 important 才压得住
        sizer.style.setProperty('max-width', 'none', 'important');
        sizer.style.margin = '0';
        sizer.style.padding = '0';
        sizer.style.transform = '';
        sizer.style.transformOrigin = 'top left';
        sizer.style.height = '';

        const availW = view.clientWidth || popoutDoc.documentElement.clientWidth;
        const availH = view.clientHeight || popoutDoc.documentElement.clientHeight;
        if (availW < 50 || availH < 50) return false;

        // 等比缩放：先找一个"设计宽度"，让月历本身的宽高比贴近窗口宽高比，再整体 scale。
        // 设计宽度 ≥ 1220，保证始终走桌面版排版（>1200 容器断点），不会因为窗口小就换成紧凑布局。
        const { board } = getMonthlyBoardSizer();
        const relayout = () => { try { board && typeof board.__mjbRelayout === 'function' && board.__mjbRelayout(); } catch (e) {} };
        // 方格子（宽=高）+ 固定 6 行，月历天然比例偏方；硬凑宽高比只会把设计宽度推到很大、字缩得很小。
        // 改为：设计宽度 = max(1220, 窗口宽)（≥1220 保持桌面断点，窗口够大时 1:1 不缩），
        // 再把格子行高拉伸/压缩到正好填满窗口高度，最后只在压到下限还放不下时才额外缩小。
        const MIN_W = 1220;
        sizer.style.minHeight = '0';
        const w = Math.max(MIN_W, Math.round(availW));
        const baseScale = availW / w;
        const targetH = availH / baseScale;
        // 量 .mjb-root 的实际可视高度（sizer 的 transform 此时已清空，只剩 uiScale 画布缩放，正是要的口径）。
        // 不能量外层容器：外层/viewport 的高度是上一轮写死的，会一直卡在旧值（日志里 h 恒为 959 就是这个）。
        const rootEl = () => board.querySelector('.mjb-root');
        const measure = () => {
          relayout();
          const r = rootEl();
          return r ? Math.ceil(r.getBoundingClientRect().height) : 0;
        };
        // 右侧 Notes 栏不参与撑高（原 CSS 是 76vh/720px，会把整块板子顶高）：
        // contain:size 让它的内容不计入行高，再 stretch 到和日历一样高，内容超出就在栏内滚动
        const prepSide = () => {
          const main = board.querySelector('.mjb-main');
          const side = board.querySelector('.mjb-side:not(.is-collapsed)');
          if (main) main.style.setProperty('align-items', 'stretch', 'important');
          if (side) {
            side.style.setProperty('height', 'auto', 'important');
            side.style.setProperty('max-height', 'none', 'important');
            side.style.setProperty('contain', 'size', 'important');
            side.style.setProperty('position', 'relative', 'important');
            side.style.setProperty('top', '0', 'important');
          }
        };
        sizer.style.setProperty('width', `${w}px`, 'important');
        board.style.setProperty('max-height', 'none', 'important');
        prepSide();
        // 纯等比：排版完全照主窗口的自然比例（方格子、固定 6 行、Notes 栏原宽度），
        // 窗口多大就整体缩放多大，放不下的一边留白（透明玻璃），内容居中。
        delete board.dataset.mjbRowH;
        const grid = board.querySelector('.mjb-grid');
        let h = measure();
        if (h < 200) { sizer.style.removeProperty('width'); return false; }
        const firstDay = grid && grid.querySelector('.mjb-day');
        const square = firstDay ? firstDay.offsetHeight : 0;
        const rowH = square;
        const cal = board.querySelector('.mjb-calendar');
        const sideNow = board.querySelector('.mjb-side');
        fitLog(`parts root=${h} cal=${cal ? cal.offsetHeight : '-'} side=${sideNow ? sideNow.offsetHeight : '-'} target=${Math.round(targetH)} square=${square} rowH=${rowH}`);

        // 玻璃窗顶部有 40px 透明工具条，垂直方向在工具条以下的区域里居中，否则视觉上"上挤下空"
        const chromeTop = popoutDoc.body && popoutDoc.body.classList.contains('mjb-glass-live') ? 40 : 0;
        const effH = availH - chromeTop;
        const scale = Math.min(availW / w, effH / h);
        sizer.style.transformOrigin = 'top left';
        sizer.style.left = `${Math.max(0, Math.round((availW - w * scale) / 2))}px`;
        sizer.style.top = `${chromeTop + Math.max(0, Math.round((effH - h * scale) / 2))}px`;
        sizer.style.transform = `scale(${scale})`;
        lastFit = { root: board.querySelector('.mjb-root'), w: availW, h: availH };
        fitLog(`${force ? 'FORCED ' : ''}win=${popoutWin.outerWidth}x${popoutWin.outerHeight} avail=${availW}x${availH} w=${w} h=${h} row=${board.dataset.mjbRowH || '-'} scale=${scale.toFixed(3)}`);
        return true;
      } catch (error) {
        console.warn('[Monthly Board] auto-fit failed', error);
        return false;
      } finally {
        // fit 自己改出来的 DOM 变化（缩放标签文字等）不能再触发 fit，否则死循环
        try { mo && mo.takeRecords(); } catch (e) {}
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
            attachListeners();
            fit();
            return;
          }
        }
      }
      if (attempts < 80) popoutWin.setTimeout(settle, 100);
      else attachListeners();
    };

    let listenersAttached = false;
    const attachListeners = () => {
      if (listenersAttached) return;
      listenersAttached = true;
      let pending = null;
      const onResize = (force) => {
        if (pending) return;
        pending = popoutWin.requestAnimationFrame(() => {
          pending = null;
          injectActionsIfReady();
          fit(force === true);
        });
      };
      // 窗口边缘是系统拖拽区，DOM 收不到 pointer 事件 → 去抖：resize 停 250ms 后才判断一次；
      // 拖动窗口期间（__mjbDragging）的 resize 是 DPI 取整抖动，完全忽略
      let resizeTimer = 0;
      const guardedResize = () => {
        if (popoutWin.__mjbDragging) return;
        popoutWin.clearTimeout(resizeTimer);
        resizeTimer = popoutWin.setTimeout(() => onResize(false), 250);
      };
      popoutWin.__mjbRefit = () => onResize(true);
      popoutWin.addEventListener('resize', guardedResize, { passive: true });
      try {
        // 只在月历被重新渲染（出现新的 .mjb-root）时重算；点格子、图片加载等普通 DOM 变化一律不管
        const target = (leaf.view && leaf.view.containerEl) || popoutDoc.body;
        if (target && popoutWin.MutationObserver) {
          let timer = 0;
          mo = new popoutWin.MutationObserver(() => {
            const r = popoutDoc.querySelector('.markdown-preview-sizer .mjb-root');
            if (!r || r === lastFit.root) return;
            popoutWin.clearTimeout(timer);
            timer = popoutWin.setTimeout(() => onResize(false), 80);
          });
          mo.observe(target, { childList: true, subtree: true, attributes: false });
          popoutWin.addEventListener('unload', () => { try { mo.disconnect(); } catch {} }, { once: true });
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
    return { dir, html: path.join(dir, '_glass-snapshot.html'), flag: path.join(dir, '_glass-refresh.flag') };
  }

  // 在离屏容器里完整渲染一次月历，序列化 .mjb-root 的静态 HTML。
  async renderGlassSnapshotRoot() {
    const host = document.body.createDiv();
    host.setAttribute('style', 'position:fixed;left:-100000px;top:0;width:1180px;pointer-events:none;opacity:0;z-index:-1;');
    try {
      const { config, dv } = await this.loadBoardRenderContext(host);
      await this.loadRenderer().render({ app: this.app, dv, container: host, config });
      // 等渲染 + 图片(app://)落定
      await new Promise(resolve => window.setTimeout(resolve, 450));
      const root = host.querySelector('.mjb-root') || host.querySelector('.monthly-journal-board');
      if (!root) throw new Error('快照渲染失败：找不到 .mjb-root。');
      // app://<hash>/... is Obsidian's own protocol; a standalone BrowserWindow can't load it → rewrite to file:///
      return root.outerHTML.replace(/app:\/\/[0-9a-z]+\//gi, 'file:///');
    } finally {
      host.remove();
    }
  }

  buildGlassHtml(rootHtml) {
    const styleNode = document.getElementById('monthly-journal-board-style');
    const css = ((styleNode && styleNode.textContent) || '').replace(/app:\/\/[0-9a-z]+\//gi, 'file:///');
    const vaultName = this.app.vault.getName();
    const script = GLASS_RUNTIME_JS.replace('__VAULT__', encodeURIComponent(vaultName));
    const boardName = String(this.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath)
      .split('/').pop().replace(/\.md$/i, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<style>' + css + '</style><style>' + GLASS_CHROME_CSS + '</style></head><body>'
      + '<div class="mjbg-shell">'
      + '<div class="mjbg-chrome"><span class="mjbg-title">' + boardName + '</span>'
      + '<div class="mjbg-actions">'
      + '<button class="mjbg-btn" data-act="refresh" title="刷新数据">&#8635;</button>'
      + '<button class="mjbg-btn" data-act="pin" title="置顶切换">&#128204;</button>'
      + '<button class="mjbg-btn" data-act="close" title="关闭">&#10005;</button>'
      + '</div></div>'
      + '<div class="mjbg-stage">' + rootHtml + '</div>'
      + '</div>'
      + '<script>' + script + '</' + 'script></body></html>';
  }

  async writeGlassHtml() {
    const fs = require('fs');
    const { html } = this.glassPaths();
    const rootHtml = await this.renderGlassSnapshotRoot();
    fs.writeFileSync(html, this.buildGlassHtml(rootHtml), 'utf8');
    return html;
  }

  startGlassRefreshWatch() {
    if (this.glassWatching) return;
    const fs = require('fs');
    const { flag } = this.glassPaths();
    try { if (!fs.existsSync(flag)) fs.writeFileSync(flag, '0', 'utf8'); } catch {}
    try {
      fs.watchFile(flag, { interval: 600 }, (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        this.refreshGlassBoard().catch(error => console.error('[Monthly Board] glass refresh failed', error));
      });
      this.glassFlagPath = flag;
      this.glassWatching = true;
    } catch (error) {
      console.warn('[Monthly Board] glass watch failed', error);
    }
  }

  stopGlassRefreshWatch() {
    if (this.glassFlagPath) {
      try { require('fs').unwatchFile(this.glassFlagPath); } catch {}
    }
    this.glassFlagPath = null;
    this.glassWatching = false;
  }

  async refreshGlassBoard() {
    if (this.liveGlassLeaf) this.rerenderLiveGlass(true);
    if (!this.glassWin || (this.glassWin.isDestroyed && this.glassWin.isDestroyed())) return;
    const html = await this.writeGlassHtml();
    try { await this.glassWin.loadFile(html); } catch (error) { console.error('[Monthly Board] glass reload failed', error); }
  }

  // 默认玻璃窗 = 实时版（Obsidian popout + 玻璃外观）；失败再回退静态快照
  async openGlassBoard() {
    try { require('fs').writeFileSync(require('path').join(this.glassPaths().dir, '_glass-debug.log'), '', 'utf8'); } catch {}
    try {
      const leaf = await this.openMonthlyBoardPopout({ glass: true });
      const body = leaf ? this.leafWinDoc(leaf).doc?.body : null;
      const ok = !!body && body.classList.contains('mjb-glass-live');
      const acrylic = !!body && body.dataset.mjbGlassAcrylic === '1';
      const why = body?.dataset?.mjbGlassWhy ? `（${body.dataset.mjbGlassWhy}）` : '';
      new Notice(`实时玻璃窗 v${this.manifest?.version || ''}：${ok ? '已启用' : '外观未套上'} · 亚克力${acrylic ? '已开启' : '不可用' + why}`, 6000);
    } catch (error) {
      console.error('[Monthly Board] live glass failed', error);
      new Notice(t('noticeGlassFallback') + (error?.message || error), 6000);
      await this.openGlassSnapshotBoard();
    }
  }

  async openGlassSnapshotBoard() {
    if (this.glassWin && !(this.glassWin.isDestroyed && this.glassWin.isDestroyed())) {
      try { this.glassWin.show(); this.glassWin.focus(); } catch {}
      await this.refreshGlassBoard();
      return;
    }

    let remote = null;
    try { remote = require('@electron/remote'); }
    catch { try { remote = require('electron').remote; } catch {} }
    const BrowserWindow = remote && remote.BrowserWindow;
    if (!BrowserWindow) throw new Error('无法访问 Electron BrowserWindow（@electron/remote 不可用）。');

    const html = await this.writeGlassHtml();
    const ext = normalizeExternalWindowSettings(this.settings.externalWindow);
    const onTop = ext.alwaysOnTop !== false;

    const win = new BrowserWindow({
      width: ext.width,
      height: ext.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
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
    try { win.setBackgroundMaterial && win.setBackgroundMaterial('acrylic'); } catch {}
    if (onTop) { try { win.setAlwaysOnTop(true, 'floating'); } catch {} }

    this.glassWin = win;
    win.on('closed', () => { if (this.glassWin === win) { this.glassWin = null; this.stopGlassRefreshWatch(); } });

    await win.loadFile(html);
    this.startGlassRefreshWatch();
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

  applySettingsOverrides(config) {
    if (Array.isArray(this.settings.sourcesOverride)) config.sources = this.settings.sourcesOverride;
    return config;
  }

  async loadBoardRenderContext(container) {
    const entry = await this.getMonthlyBoardEntry();
    const config = this.applySettingsOverrides(await this.loadJsonConfig(entry.configPath));
    config.plugin = Object.assign({}, config.plugin, { writeNotesToMarkdown: !!this.settings.writeNotesToMarkdown, strikeDoneItems: !!this.settings.strikeDoneItems, strikeDoneStatuses: Array.isArray(this.settings.strikeDoneStatuses) ? this.settings.strikeDoneStatuses : [], quickAdd: Object.assign({}, DEFAULT_SETTINGS.quickAdd, this.settings.quickAdd || {}) });
    return { entry, config, dv: this.getDataviewShim(container, entry.sourcePath) };
  }

  async renderBoard(source, el, ctx) {
    el.empty();
    try {
      const options = parseCodeBlock(source);
      const config = this.applySettingsOverrides(await this.loadJsonConfig(options.config || this.settings.configPath));
      config.plugin = Object.assign({}, config.plugin, {
        writeNotesToMarkdown: !!this.settings.writeNotesToMarkdown,
        strikeDoneItems: !!this.settings.strikeDoneItems,
        strikeDoneStatuses: Array.isArray(this.settings.strikeDoneStatuses) ? this.settings.strikeDoneStatuses : [],
        quickAdd: Object.assign({}, DEFAULT_SETTINGS.quickAdd, this.settings.quickAdd || {}),
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
      new Notice(t('noticeFloatingFailed') + (error?.message || error));
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
    const refresh = buttons.createEl('button', { text: '↻', attr: { 'aria-label': t('ariaRefresh') } });
    const minimize = buttons.createEl('button', { text: '−', attr: { 'aria-label': t('ariaMinimize') } });
    const close = buttons.createEl('button', { text: '×', attr: { 'aria-label': t('ariaClose') } });
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
      .setName(t('setConfigName'))
      .setDesc(t('setConfigDesc'))
      .addText(text => text
        .setPlaceholder('_tools/monthly-board/monthly-board.config.json')
        .setValue(this.plugin.settings.configPath)
        .onChange(async value => {
          const next = value.trim() || DEFAULT_SETTINGS.configPath;
          if (!isSafeVaultPath(next) || !next.endsWith('.json')) {
            new Notice(t('noticeConfigPath'));
            return;
          }
          this.plugin.settings.configPath = normalizePath(next);
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('setFloatSrcName'))
      .setDesc(t('setFloatSrcDesc'))
      .addText(text => text
        .setPlaceholder('Monthly Board.md')
        .setValue(this.plugin.settings.floatingSourcePath || DEFAULT_SETTINGS.floatingSourcePath)
        .onChange(async value => {
          const next = value.trim() || DEFAULT_SETTINGS.floatingSourcePath;
          if (!isSafeVaultPath(next) || !next.endsWith('.md')) {
            new Notice(t('noticeFloatSrc'));
            return;
          }
          this.plugin.settings.floatingSourcePath = normalizePath(next);
          await this.plugin.saveSettings();
        }));



    new Setting(containerEl)
      .setName(t('setForceReadingName'))
      .setDesc(t('setForceReadingDesc'))
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.forceReadingMode)
        .onChange(async value => {
          this.plugin.settings.forceReadingMode = value;
          await this.plugin.saveSettings();
          this.plugin.enforceReadingModeSoon();
        }));

    new Setting(containerEl)
      .setName(t('setLegacyName'))
      .setDesc(t('setLegacyDesc'))
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.writeNotesToMarkdown)
        .onChange(async value => {
          this.plugin.settings.writeNotesToMarkdown = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('setCalGotoName'))
      .setDesc(t('setCalGotoDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.calendarGotoMonthlyBoard !== false)
        .onChange(async value => {
          this.plugin.settings.calendarGotoMonthlyBoard = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('setStrikeDoneName'))
      .setDesc(t('setStrikeDoneDesc'))
      .addToggle(toggle => toggle
        .setValue(!!this.plugin.settings.strikeDoneItems)
        .onChange(async value => {
          this.plugin.settings.strikeDoneItems = value;
          await this.plugin.saveSettings();
          this.plugin.refreshAllBoards();
        }));

    new Setting(containerEl)
      .setName(t('setStrikeListName'))
      .setDesc(t('setStrikeListDesc'))
      .addText(text => text
        .setPlaceholder('搞定, 已验收, Archived')
        .setValue(Array.isArray(this.plugin.settings.strikeDoneStatuses) ? this.plugin.settings.strikeDoneStatuses.join(', ') : '')
        .onChange(async value => {
          this.plugin.settings.strikeDoneStatuses = value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
          this.plugin.refreshAllBoards();
        }));

    containerEl.createEl('h3', { text: t('glassHeading') });
    containerEl.createEl('p', {
      text: t('glassIntro'),
      attr: { style: 'margin:.2em 0 .8em;color:var(--text-muted);font-size:12px;line-height:1.5;' },
    });

    new Setting(containerEl)
      .setName(t('setGlassSizeName'))
      .setDesc(t('setGlassSizeDesc'))
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
      .setName(t('setGlassTopName'))
      .setDesc(t('setGlassTopDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.externalWindow.alwaysOnTop !== false)
        .onChange(async value => {
          this.plugin.settings.externalWindow.alwaysOnTop = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('setGlassOpenName'))
      .setDesc(t('setGlassOpenDesc'))
      .addButton(btn => btn
        .setButtonText(t('glassOpenButton'))
        .setCta()
        .onClick(() => this.plugin.openGlassBoard().catch(error => this.plugin.showFailure(t('failGlassOpen'), error))));

    new Setting(containerEl)
      .setName(t('setGlassLockName'))
      .setDesc(t('setGlassLockDesc'))
      .addToggle(tg => tg
        .setValue(this.plugin.settings.liveGlassLock !== false)
        .onChange(async value => {
          this.plugin.settings.liveGlassLock = value;
          await this.plugin.saveSettings();
          const leaf = this.plugin.liveGlassLeaf;
          if (leaf && this.plugin.isLeafAlive(leaf)) {
            try { leaf.setPinned(value); } catch {}
            if (value) this.plugin.recallLiveGlassToBoard();
          }
        }));

    containerEl.createEl('h3', { text: t('qaHeading') });

    new Setting(containerEl)
      .setName(t('setQaEnabledName'))
      .setDesc(t('setQaEnabledDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.quickAdd?.enabled !== false)
        .onChange(async value => {
          this.plugin.settings.quickAdd = Object.assign({}, DEFAULT_SETTINGS.quickAdd, this.plugin.settings.quickAdd, { enabled: value });
          await this.plugin.saveSettings();
          this.plugin.refreshAllBoards();
        }));

    new Setting(containerEl)
      .setName(t('setQaSectionName'))
      .setDesc(t('setQaSectionDesc'))
      .addText(text => text
        .setPlaceholder(DEFAULT_SETTINGS.quickAdd.section)
        .setValue(String(this.plugin.settings.quickAdd?.section || ''))
        .onChange(async value => {
          this.plugin.settings.quickAdd = Object.assign({}, DEFAULT_SETTINGS.quickAdd, this.plugin.settings.quickAdd, { section: value.trim() || DEFAULT_SETTINGS.quickAdd.section });
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('setQaTemplateName'))
      .setDesc(t('setQaTemplateDesc'))
      .addText(text => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.quickAdd.template)
          .setValue(String(this.plugin.settings.quickAdd?.template || ''))
          .onChange(async value => {
            this.plugin.settings.quickAdd = Object.assign({}, DEFAULT_SETTINGS.quickAdd, this.plugin.settings.quickAdd, { template: value.trim() || DEFAULT_SETTINGS.quickAdd.template });
            await this.plugin.saveSettings();
          });
        text.inputEl.style.width = '100%';
      });

    const srcCollapsed = !!this.plugin.settings.sourcesCollapsed;
    const srcHeadRow = containerEl.createDiv({ attr: { style: 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:24px;' } });
    srcHeadRow.createEl('h3', { text: t('srcSecHeading'), attr: { style: 'margin:0;' } });
    const srcCollapseBtn = srcHeadRow.createEl('button', {
      text: srcCollapsed ? '▸' : '▾',
      attr: {
        title: t(srcCollapsed ? 'srcExpand' : 'srcCollapse'),
        style: 'border:1px solid var(--background-modifier-border);border-radius:6px;background:var(--background-secondary);color:var(--text-muted);font-size:11px;line-height:1;padding:4px 8px;cursor:pointer;',
      },
    });
    srcCollapseBtn.onclick = async () => {
      this.plugin.settings.sourcesCollapsed = !srcCollapsed;
      await this.plugin.saveSettings();
      this.display();
    };
    if (!srcCollapsed) {
      containerEl.createEl('p', {
        text: t('srcSecDesc'),
        attr: { style: 'margin:.2em 0 .8em;color:var(--text-muted);font-size:12px;line-height:1.5;' },
      });
      const srcHost = containerEl.createDiv();
      this.renderSourcesEditor(srcHost).catch(error => {
        srcHost.setText(t('srcLoadFailed'));
        console.error('[Monthly Board] sources editor failed', error);
      });
    }
    this.renderCustomThemes(containerEl);
  }

  async getEffectiveSources() {
    if (Array.isArray(this.plugin.settings.sourcesOverride)) return { list: this.plugin.settings.sourcesOverride, isOverride: true };
    try {
      const entry = await this.plugin.getMonthlyBoardEntry();
      const cfg = await this.plugin.loadJsonConfig(entry.configPath);
      if (Array.isArray(cfg.sources)) return { list: cfg.sources, isOverride: false };
    } catch (e) {}
    try {
      const cfg = await this.plugin.loadJsonConfig(this.plugin.settings.configPath);
      if (Array.isArray(cfg.sources)) return { list: cfg.sources, isOverride: false };
    } catch (e) {}
    return null;
  }

  async renderSourcesEditor(host) {
    host.empty();
    const effective = await this.getEffectiveSources();
    if (!effective) {
      host.createDiv({ text: t('srcLoadFailed'), attr: { style: 'color:var(--text-error);font-size:12px;' } });
      return;
    }
    const { list, isOverride } = effective;
    host.createDiv({
      text: t(isOverride ? 'srcFromOverride' : 'srcFromFile'),
      attr: { style: 'color:var(--text-muted);font-size:12px;margin-bottom:6px;' },
    });

    const ensureOverride = () => {
      if (!Array.isArray(this.plugin.settings.sourcesOverride)) {
        this.plugin.settings.sourcesOverride = JSON.parse(JSON.stringify(list));
      }
      return this.plugin.settings.sourcesOverride;
    };
    const save = async () => { await this.plugin.saveSettings(); this.plugin.refreshAllBoards(); };
    const rerender = () => this.renderSourcesEditor(host).catch(console.error);

    list.forEach((src, idx) => {
      const card = host.createDiv({ cls: 'mjb-src-card' });
      if (src.hidden) {
        card.style.opacity = '0.55';
        card.createDiv({
          text: t('srcHiddenHint'),
          attr: { style: 'color:var(--text-muted);font-size:11px;margin:2px 0 4px;' },
        });
      }

      const dragHandle = card.createDiv({ cls: 'mjb-src-drag', text: '⋮⋮', attr: { title: t('srcDragHint'), role: 'button' } });
      dragHandle.draggable = true;
      dragHandle.ondragstart = ev => {
        ev.dataTransfer.setData('text/plain', String(idx));
        ev.dataTransfer.effectAllowed = 'move';
      };
      card.ondragover = ev => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; card.classList.add('is-drop-target'); };
      card.ondragleave = () => card.classList.remove('is-drop-target');
      card.ondrop = ev => {
        ev.preventDefault();
        card.classList.remove('is-drop-target');
        const from = Number(ev.dataTransfer.getData('text/plain'));
        if (!Number.isInteger(from) || from === idx) return;
        const arr = ensureOverride();
        const [moved] = arr.splice(from, 1);
        arr.splice(idx, 0, moved);
        save().then(rerender);
      };

      const isTimeline = String(src.mode || '') === 'timeline';

      new Setting(card)
        .addText(text => text
          .setPlaceholder(t('phLabel'))
          .setValue(String(src.label || ''))
          .onChange(async v => { ensureOverride()[idx].label = v; await save(); }))
        .addDropdown(dd => dd
          .addOption('files', t('srcModeFiles'))
          .addOption('timeline', t('srcModeTimeline'))
          .setValue(isTimeline ? 'timeline' : 'files')
          .onChange(async v => {
            const o = ensureOverride()[idx];
            if (v === 'timeline') o.mode = 'timeline'; else delete o.mode;
            await save();
            rerender();
          }))
        .addButton(btn => btn
          .setButtonText(src.hidden ? t('srcShow') : t('srcHide'))
          .onClick(async () => {
            const o = ensureOverride()[idx];
            if (o.hidden) delete o.hidden; else o.hidden = true;
            await save();
            rerender();
          }))
        .addButton(btn => btn
          .setButtonText(t('srcDelete'))
          .setWarning()
          .onClick(async () => { ensureOverride().splice(idx, 1); await save(); rerender(); }));

      if (isTimeline) {
        card.createDiv({
          text: t('srcModeHintTimeline'),
          attr: { style: 'color:var(--text-muted);font-size:11px;line-height:1.5;margin:2px 0 6px;' },
        });
        new Setting(card)
          .addText(text => text
            .setPlaceholder(t('phSection'))
            .setValue(String(src.section || ''))
            .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.section = v.trim(); else delete o.section; await save(); }))
          .addDropdown(dd => dd
            .addOption('all', t('srcStatusAll'))
            .addOption('done', t('srcStatusDone'))
            .addOption('open', t('srcStatusOpen'))
            .setValue(['done', 'open'].includes(String(src.statusFilter)) ? String(src.statusFilter) : 'all')
            .onChange(async v => { const o = ensureOverride()[idx]; if (v !== 'all') o.statusFilter = v; else delete o.statusFilter; await save(); }));
        return;
      }

      new Setting(card)
        .addText(text => text
          .setPlaceholder(t('phQuery'))
          .setValue(String(src.query || ''))
          .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.query = v; else delete o.query; await save(); }))
        .addText(text => text
          .setPlaceholder(t('phGroupBy'))
          .setValue(String(src.groupBy || ''))
          .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.groupBy = v.trim(); else delete o.groupBy; await save(); }));

      new Setting(card)
        .addText(text => text
          .setPlaceholder(t('phDateFields'))
          .setValue(Array.isArray(src.dateFields) ? src.dateFields.join(', ') : '')
          .onChange(async v => {
            const arr = v.split(/[,，]/).map(s => s.trim()).filter(Boolean);
            const o = ensureOverride()[idx];
            if (arr.length) o.dateFields = arr; else delete o.dateFields;
            await save();
          }))
        .addText(text => text
          .setPlaceholder(t('phTitleField'))
          .setValue(String(src.titleField || ''))
          .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.titleField = v.trim(); else delete o.titleField; await save(); }));

      new Setting(card)
        .addText(text => text
          .setPlaceholder(t('phStatusField'))
          .setValue(String(src.statusField || ''))
          .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.statusField = v.trim(); else delete o.statusField; await save(); }))
        .addText(text => text
          .setPlaceholder(t('phUrlField'))
          .setValue(String(src.urlField || ''))
          .onChange(async v => { const o = ensureOverride()[idx]; if (v.trim()) o.urlField = v.trim(); else delete o.urlField; await save(); }));

      card.createDiv({ cls: 'mjb-src-conds-label', text: t('srcCondsLabel') });
      (Array.isArray(src.where) ? src.where : []).forEach((cond, ci) => {
        const row = card.createDiv({ cls: 'mjb-src-cond' });
        const fieldInput = row.createEl('input', { attr: { type: 'text', placeholder: t('phCondField') } });
        fieldInput.value = String(cond.field || '');
        fieldInput.onchange = async () => { ensureOverride()[idx].where[ci].field = fieldInput.value; await save(); };
        const opSel = row.createEl('select');
        for (const op of SOURCE_WHERE_OPS) opSel.createEl('option', { attr: { value: op }, text: op });
        opSel.value = String(cond.op || 'is');
        opSel.onchange = async () => { ensureOverride()[idx].where[ci].op = opSel.value; await save(); };
        const valInput = row.createEl('input', { attr: { type: 'text', placeholder: t('phCondValue') } });
        valInput.value = cond.value == null ? '' : String(cond.value);
        valInput.onchange = async () => { ensureOverride()[idx].where[ci].value = valInput.value; await save(); };
        const delBtn = row.createEl('button', { text: '×', attr: { 'aria-label': t('srcDelete') } });
        delBtn.onclick = async () => { ensureOverride()[idx].where.splice(ci, 1); await save(); rerender(); };
      });
      const addCondBtn = card.createEl('button', { cls: 'mjb-src-addcond', text: t('srcAddCond') });
      addCondBtn.onclick = async () => {
        const o = ensureOverride()[idx];
        o.where = [...(Array.isArray(o.where) ? o.where : []), { field: '', op: 'is', value: '' }];
        await save();
        rerender();
      };
    });

    new Setting(host)
      .addButton(btn => btn
        .setButtonText(t('srcAdd'))
        .setCta()
        .onClick(async () => { ensureOverride().push({ label: '', query: '', where: [] }); await save(); rerender(); }))
      .addButton(btn => btn
        .setButtonText(t('srcRestoreFile'))
        .setDisabled(!isOverride)
        .onClick(async () => { this.plugin.settings.sourcesOverride = null; await save(); rerender(); }));
  }

  async renderCustomThemes(containerEl) {
    const COLOR_FIELDS = [['ink', '文字主色'], ['muted', '次要文字'], ['accent', '强调色'], ['accent2', '次强调'], ['card', '格子底色'], ['line', '描边色'], ['background', '背景']];
    const wrap = containerEl.createDiv();
    wrap.createEl('h3', { text: '自制主题（可视化取色器）' });
    const hint = wrap.createEl('div', { text: '正在读取配置…' });
    hint.style.cssText = 'font-size:12px;opacity:.7;margin-bottom:6px;';
    let file, configObj;
    try {
      const configPath = normalizePath(this.plugin.settings.configPath || DEFAULT_SETTINGS.configPath);
      if (!isSafeVaultPath(configPath) || !configPath.endsWith('.json')) throw new Error('配置路径必须是 vault 内的 .json');
      file = this.app.vault.getAbstractFileByPath(configPath);
      if (!file) throw new Error('找不到配置文件：' + configPath);
      configObj = JSON.parse(await this.app.vault.read(file));
      hint.setText('编辑后点「保存到配置」写回 ' + configPath + '，刷新看板即可生效。');
    } catch (e) {
      hint.setText('无法读取配置文件：' + ((e && e.message) || e));
      return;
    }
    configObj.theme = configObj.theme || {};
    const themes = Array.isArray(configObj.theme.customThemes) ? configObj.theme.customThemes : [];
    const listEl = wrap.createDiv();
    const render = () => {
      listEl.empty();
      if (!themes.length) {
        const empty = listEl.createEl('div', { text: '（暂无自制主题，点下方「+ 添加主题」）' });
        empty.style.cssText = 'opacity:.6;font-size:12px;padding:4px 0;';
      }
      themes.forEach((t, idx) => {
        const card = listEl.createDiv();
        card.style.cssText = 'border:1px solid var(--background-modifier-border);border-radius:8px;padding:8px 12px;margin:8px 0;';
        new Setting(card).setName('主题 #' + (idx + 1))
          .addText(tx => tx.setPlaceholder('id（英文，必填）').setValue(t.id || '').onChange(v => { t.id = v.trim(); }))
          .addText(tx => tx.setPlaceholder('显示名 label').setValue(t.label || '').onChange(v => { t.label = v.trim(); }))
          .addExtraButton(b => b.setIcon('trash').setTooltip('删除此主题').onClick(() => { themes.splice(idx, 1); render(); }));
        for (const pair of COLOR_FIELDS) {
          const key = pair[0], cn = pair[1];
          const s = new Setting(card).setName(cn).setDesc(key);
          s.addText(tx => {
            tx.setPlaceholder(key === 'background' ? '#色值 / rgba() / 渐变' : '#色值 或 rgba()').setValue(t[key] || '').onChange(v => { t[key] = v.trim(); });
            tx.inputEl.style.width = '210px';
            tx.inputEl.setAttribute('data-key', key);
          });
          const picker = s.controlEl.createEl('input');
          picker.type = 'color';
          picker.style.cssText = 'width:32px;height:28px;padding:0;border:none;background:none;cursor:pointer;';
          const m = /^#([0-9a-fA-F]{6})$/.exec((t[key] || '').trim());
          picker.value = m ? m[0] : '#888888';
          picker.addEventListener('input', () => {
            t[key] = picker.value;
            const inp = s.controlEl.querySelector('input[data-key="' + key + '"]');
            if (inp) inp.value = picker.value;
          });
        }
      });
    };
    render();
    new Setting(wrap)
      .addButton(b => b.setButtonText('+ 添加主题').onClick(() => { themes.push({ id: '', label: '' }); render(); }))
      .addButton(b => b.setButtonText('保存到配置').setCta().onClick(async () => {
        const seen = new Set();
        const out = [];
        for (const t of themes) {
          if (!t.id) continue;
          if (seen.has(t.id)) { new Notice('主题 id 重复：' + t.id); return; }
          seen.add(t.id);
          const o = { id: t.id };
          if (t.label) o.label = t.label;
          for (const pair of COLOR_FIELDS) { if (t[pair[0]]) o[pair[0]] = t[pair[0]]; }
          if (t.backgroundImage) o.backgroundImage = t.backgroundImage;
          if (t.extraCss) o.extraCss = t.extraCss;
          out.push(o);
        }
        try {
          const fresh = JSON.parse(await this.app.vault.read(file));
          fresh.theme = fresh.theme || {};
          fresh.theme.customThemes = out;
          await this.app.vault.modify(file, JSON.stringify(fresh, null, 2));
          new Notice('已保存 ' + out.length + ' 个自制主题，刷新看板生效。');
        } catch (e) { new Notice('保存失败：' + ((e && e.message) || e)); }
      }));
  }
}
