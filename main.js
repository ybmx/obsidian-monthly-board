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
    const candidates = [];
    try { candidates.push(require.resolve('./monthly-board.js')); } catch {}
    try {
      const basePath = this.app.vault.adapter.getBasePath?.();
      const pluginDir = this.manifest.dir || '.obsidian/plugins/monthly-board';
      if (basePath) candidates.push((basePath + '/' + pluginDir + '/monthly-board.js').replace(/\\/g, '/'));
    } catch {}

    let lastError = null;
    for (const candidate of candidates) {
      try {
        this.monthlyBoard = require(candidate);
        if (this.monthlyBoard?.render) return this.monthlyBoard;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error('Monthly Board renderer failed to load: ' + (lastError?.message || 'monthly-board.js not found'));
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
