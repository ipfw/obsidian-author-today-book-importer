import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, requestUrl } from 'obsidian';
import { parseAuthorTodayBook, parseYandexBook } from './parsers';
import { BookNoteInput, ImporterSettings } from './types';

const DEFAULT_SETTINGS: ImporterSettings = {
  notesFolder: 'Books',
  templatePath: '',
  coverFolder: 'images',
  authorTodayCookie: '',
  authorTodayUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};

class UrlPromptModal extends Modal {
  private promptResult: (value: string) => void;

  constructor(app: App, promptResult: (value: string) => void) {
    super(app);
    this.promptResult = promptResult;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Введите URL книги (author.today или Яндекс.книги):' });
    const input = contentEl.createEl('input', { type: 'text' });
    input.style.width = '100%';
    const submit = contentEl.createEl('button', { text: 'Добавить' });
    submit.style.marginTop = '10px';
    submit.onclick = () => {
      const url = input.value.trim();
      this.close();
      this.promptResult(url);
    };
    input.focus();
    input.addEventListener('keydown', evt => {
      if (evt.key === 'Enter') submit.click();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class AuthorTodayImporter extends Plugin {
  settings: ImporterSettings = DEFAULT_SETTINGS;

  sanitizeFileName(name: string): string {
    return name
      .replace(/[\\\/:*?"<>|]/g, '')
      .replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '')
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 100);
  }

  private async fetchDocument(url: string, headers?: Record<string, string>): Promise<Document> {
    const result = await requestUrl({
      url,
      method: 'GET',
      ...(headers ? { headers } : {})
    });
    const parser = new DOMParser();
    return parser.parseFromString(result.text, 'text/html');
  }

  async getUniquePath(basePath: string, ext: string): Promise<string> {
    let path = `${basePath}.${ext}`;
    let counter = 1;

    if (ext === 'md') {
      while (this.app.vault.getAbstractFileByPath(path)) {
        path = `${basePath}_${counter}.${ext}`;
        counter++;
      }
    } else {
      while (await this.app.vault.adapter.exists(path)) {
        path = `${basePath}_${counter}.${ext}`;
        counter++;
      }
    }

    return path;
  }

  async onload() {
    await this.loadSettings();
    this.addCommand({
      id: 'import-book-auto',
      name: 'Import Book (Auto)',
      callback: () => this.openPromptAuto()
    });
    this.addSettingTab(new ImporterSettingTab(this.app, this));
  }

  openPromptAuto() {
    new UrlPromptModal(this.app, (url) => {
      if (!url) {
        new Notice('Некорректный URL');
        return;
      }

      if (url.includes('author.today')) {
        this.importBook(url);
      } else if (url.includes('books.yandex.ru')) {
        this.importYandexBook(url);
      } else {
        new Notice('Неизвестный ресурс');
      }
    }).open();
  }

  async importBook(url: string) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': this.settings.authorTodayUserAgent || 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': url,
      };

      if (this.settings.authorTodayCookie && this.settings.authorTodayCookie.trim()) {
        headers['Cookie'] = this.settings.authorTodayCookie.trim();
      }

      const doc = await this.fetchDocument(url, headers);
      const bookData = parseAuthorTodayBook(doc, url);
      await this.createBookNote(bookData);
    } catch (e) {
      const anyErr = e as any;
      const status = anyErr?.status ?? anyErr?.response?.status;
      const msg = anyErr?.message ? String(anyErr.message) : String(e);
      console.error('AuthorToday import error', { status, msg, e });

      if (status === 403) {
        new Notice('Author.Today вернул 403 (блокировка/антибот). Попробуй указать Cookie в настройках плагина или открыть страницу в браузере и проверить доступ.');
      } else {
        new Notice(`Failed to import book${status ? ` (status ${status})` : ''}`);
      }
    }
  }

  async importYandexBook(url: string) {
    try {
      const doc = await this.fetchDocument(url);
      const bookData = parseYandexBook(doc, url);
      await this.createBookNote(bookData);
    } catch (e) {
      console.error(e);
      new Notice('Failed to import from Yandex.Books');
    }
  }

  private async createBookNote(data: BookNoteInput) {
    const fileName = this.sanitizeFileName(`${data.title} -- ${data.author}`);

    let cover = '';
    if (data.coverURL) {
      try {
        const imagePath = await this.getUniquePath(`${this.settings.coverFolder}/${fileName}`, 'jpg');
        const imgResult = await requestUrl({ url: data.coverURL, method: 'GET' });
        const buffer: ArrayBuffer = imgResult.arrayBuffer;
        await this.app.vault.createBinary(imagePath, buffer);
        cover = imagePath;
      } catch (e) {
        console.warn('Cover download failed', e);
      }
    }

    const filePath = await this.getUniquePath(`${this.settings.notesFolder}/${fileName}`, 'md');
    let content = '';

    if (this.settings.templatePath) {
      const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
      if (tplFile instanceof TFile) {
        let tpl = await this.app.vault.read(tplFile);
        tpl = tpl
          .replace(/\{\{date\}\}/g, data.importDate)
          .replace(/\{\{title\}\}/g, data.title)
          .replace(/\{\{author\}\}/g, data.author)
          .replace(/\{\{published\}\}/g, data.published)
          .replace(/\{\{coverURL\}\}/g, data.coverURL)
          .replace(/\{\{cover\}\}/g, cover)
          .replace(/\{\{description\}\}/g, data.description)
          .replace(/\{\{category\}\}/g, data.category)
          .replace(/\{\{series\}\}/g, data.series)
          .replace(/\{\{series_number\}\}/g, data.series_number)
          .replace(/\{\{pages\}\}/g, data.pages)
          .replace(/\{\{status\}\}/g, data.status)
          .replace(/\{\{publisher\}\}/g, data.publisher)
          .replace(/\{\{source\}\}/g, data.source);
        content = tpl;
      } else {
        new Notice(`🔴 Template not found: ${this.settings.templatePath}`);
      }
    }

    if (!content) {
      content = `---

title: "${data.title}"
author: "${data.author}"
category: "${data.category}"
published: "${data.published}"
source: "${data.source}"
coverURL: "${data.coverURL}"
cover: "${cover}"
series: "${data.series}"
serieslink: "[[${data.series}]]"
series_number: "${data.series_number}"
publisher: "${data.publisher}"
pages: "${data.pages}"
status: "${data.status}"
date: "${data.importDate}"
---

${data.description}`;
    }

    await this.app.vault.create(filePath, content);
    new Notice(
      data.isYandex
        ? `Imported "${data.title}" from Yandex.Books`
        : `Imported "${data.title}"`
    );

    const newFile = this.app.vault.getAbstractFileByPath(filePath);
    if (newFile instanceof TFile) this.app.workspace.getLeaf(true).openFile(newFile);
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class ImporterSettingTab extends PluginSettingTab {
  plugin: AuthorTodayImporter;

  constructor(app: App, plugin: AuthorTodayImporter) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Notes Folder')
      .setDesc('Folder where imported book notes will be saved')
      .addText(text => text.setPlaceholder('Books').setValue(this.plugin.settings.notesFolder)
        .onChange(async v => {
          this.plugin.settings.notesFolder = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Template Path')
      .setDesc('Relative path to note template')
      .addText(text => text.setPlaceholder('Templates/BookTemplate.md').setValue(this.plugin.settings.templatePath)
        .onChange(async v => {
          this.plugin.settings.templatePath = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Cover Folder')
      .setDesc('Folder where cover images will be saved')
      .addText(text => text.setPlaceholder('images').setValue(this.plugin.settings.coverFolder)
        .onChange(async v => {
          this.plugin.settings.coverFolder = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Author.Today Cookie (optional)')
      .setDesc('Вставь Cookie из браузера (только если Author.Today возвращает 403). Хранится локально в настройках Obsidian.')
      .addTextArea(text =>
        text
          .setPlaceholder('cf_clearance=...; session=...')
          .setValue(this.plugin.settings.authorTodayCookie)
          .onChange(async v => {
            this.plugin.settings.authorTodayCookie = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Author.Today User-Agent')
      .setDesc('User-Agent для запроса страницы (иногда помогает обойти 403).')
      .addText(text =>
        text
          .setPlaceholder('Mozilla/5.0 ...')
          .setValue(this.plugin.settings.authorTodayUserAgent)
          .onChange(async v => {
            this.plugin.settings.authorTodayUserAgent = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
