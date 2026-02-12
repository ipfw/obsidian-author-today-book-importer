import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, TFile, requestUrl } from 'obsidian';

interface ImporterSettings {
  notesFolder: string;
  templatePath: string;
  coverFolder: string;
  authorTodayCookie: string;
  authorTodayUserAgent: string;
}

const DEFAULT_SETTINGS: ImporterSettings = {
  notesFolder: 'Books',
  templatePath: '',
  coverFolder: 'images',
  authorTodayCookie: '',
  authorTodayUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};

// Модальное окно для ввода URL
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
    submit.onclick = () => { const url = input.value.trim(); this.close(); this.promptResult(url); };
    input.focus();
    input.addEventListener('keydown', evt => { if (evt.key === 'Enter') submit.click(); });
  }
  onClose() { this.contentEl.empty(); }
}

export default class AuthorTodayImporter extends Plugin {
  settings: ImporterSettings;

  sanitizeFileName(name: string): string {
    return name
      .replace(/[\\\/:*?"<>|]/g, '')  // удалить недопустимые символы
      .replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '') // оставить буквы, цифры, пробелы, дефисы и скобки
      .trim()
      .replace(/\s+/g, ' ')            // схлопнуть пробелы
      .substring(0, 100);              // ограничить длину
  }

  // Вспомогательная функция для получения уникального пути с нужным расширением
  async getUniquePath(basePath: string, ext: string): Promise<string> {
    let path = `${basePath}.${ext}`;
    let counter = 1;
    // Проверка для файлов (заметки и обложки)
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

      // Если author.today отдает 403 (часто Cloudflare/антибот), можно передать Cookie из браузера
      if (this.settings.authorTodayCookie && this.settings.authorTodayCookie.trim()) {
        headers['Cookie'] = this.settings.authorTodayCookie.trim();
      }

      const result = await requestUrl({
        url,
        method: 'GET',
        headers,
      });
      const html = result.text;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // Вычислить дату импорта для {{date}}
      const importDate = new Date().toISOString().split('T')[0];

      // Извлечь метаданные
      let title = doc.querySelector('h1.book-title[itemprop="name"]')?.textContent?.trim() ||
                  doc.querySelector('h1.work-page__title')?.textContent?.trim() || '';

      // Новый способ извлечения автора: сначала meta[itemprop="name"], затем .work-page__author a
      let author = '';
      const metaAuthor = doc.querySelector('meta[itemprop="name"]');
      if (metaAuthor) {
        author = metaAuthor.getAttribute('content')?.trim() || '';
      } else {
        const authorEl = doc.querySelector('.work-page__author a');
        if (authorEl) {
          author = authorEl.textContent.trim();
        }
      }
      // Очистка автора от кавычек и двоеточий
      author = author.replace(/['":]/g, '').trim();
      // Очистка названия
      title = title.replace(/['":]/g, '').trim();

      // Переменная published для {{published}}
      let published = '';
      const pubSpans = Array.from(doc.querySelectorAll('span.hint-top'));
      const dateEl = pubSpans.find(el => el.getAttribute('data-time'));
      if (dateEl) {
        published = dateEl.getAttribute('data-time')?.split('T')[0] || '';
      }
      // Жанры
      let category = '';
      const genreDiv = doc.querySelector('div.book-genres');
      if (genreDiv) category = genreDiv.textContent.trim();
      // Преобразовать слэши в запятые для YAML-массива
      category = category.replace(/\s*\/\s*/g, ', ').replace(/[\r\n]+/g, ', ');

      // Серия и номер
      let series = '', series_number = '';
      const cycleLabel = Array.from(doc.querySelectorAll('span.text-muted'))
        .find(el => el.textContent.trim().startsWith('Цикл'));
      if (cycleLabel) {
        const container = cycleLabel.parentElement as HTMLElement | null;
        const linkEl = container?.querySelector('a') as HTMLAnchorElement | null;
        if (linkEl) {
          // имя серии
          series = linkEl.textContent.trim().replace(/['"]/g, '');
          // номер серии может быть в соседнем span после ссылки: "&nbsp;#7"
          let numMatch = (linkEl.nextElementSibling as HTMLElement | null)?.textContent?.match(/#\s*(\d+)/);
          // если не нашли, попробуем по всему контейнеру
          if (!numMatch && container?.textContent) {
            numMatch = container.textContent.match(/#\s*(\d+)/);
          }
          if (numMatch) series_number = numMatch[1];
        }
      }
      // очистка серии от лишних символов (оставляем буквы/цифры/пробел/дефис/скобки)
      series = series.replace(/['":\/|!?]/g, '').replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '').trim();

      // Оценочное количество страниц
      let pages = '';
      const charsSpan = doc.querySelector('span.hint-top[data-hint^="Размер"]');
      if (charsSpan) {
        const raw = charsSpan.textContent.replace(/\D/g, '');
        const count = parseInt(raw, 10);
        pages = Math.ceil(count / 2000).toString();
      }

      // Статус по умолчанию и издатель
      const status = 'отложено';
      const publisher = 'АТ';

      // Обложка и описание
      const coverMeta = doc.querySelector('meta[property="og:image"]');
      const coverURL = coverMeta?.getAttribute('content') ||
        doc.querySelector('img.work-cover__image')?.getAttribute('src') || '';
      const description = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

      await this.createBookNote({
        url,
        title,
        author,
        published,
        category,
        series,
        series_number,
        pages,
        status,
        publisher,
        coverURL,
        description,
        importDate,
        source: url,
        isYandex: false
      });
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
      const result = await requestUrl({ url, method: 'GET' });
      const html = result.text;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      // Парсинг названия
      let title = '';
      const titleEl = doc.querySelector('[data-test-id="CONTENT_TITLE_MAIN"]');
      if (titleEl) {
        title = titleEl.textContent.trim();
      } else {
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
        title = ogTitle
          ? ogTitle.replace(/^Читать\s+/, '').replace(/\s+—.+$/, '').trim()
          : 'Unknown Title';
      }
      // Удалить кавычки, двоеточия и специальные символы из названия
      title = title.replace(/['":]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();

      // Парсинг описания
      let description = '';
      const descEl = doc.querySelector('.ExpandableText_text__2OFwq');
      if (descEl) {
        description = descEl.textContent.trim().replace(/\s+/g, ' ');
      }

      // Серия и номер
      let series = '';
      let series_number = '';
      const seriesEl = Array.from(doc.querySelectorAll('li')).find(el => el.textContent.includes('Серия:'));
      if (seriesEl) {
        const seriesText = seriesEl.textContent.replace('Серия:', '').trim();
        const seriesNumMatch = seriesText.match(/(.+?)\s*#(\d+)/);
        if (seriesNumMatch) {
          series = seriesNumMatch[1].trim();
          series_number = seriesNumMatch[2];
        } else {
          series = seriesText;
        }
      }

      // Автор
      let author = '';
      const authorEl = doc.querySelector('[data-test-id="CONTENT_TITLE_AUTHOR"] a');
      if (authorEl) {
        author = authorEl.textContent.trim();
      }

      // Категории
      let category = '';
      const topicsEl = doc.querySelector('[data-test-id="CONTENT_TOPICS"]');
      if (topicsEl) {
        category = Array.from(topicsEl.querySelectorAll('a'))
          .map(el => el.textContent.trim())
          .join(', ');
      }
      // Преобразовать слэши в запятые для YAML-массива
      category = category.replace(/\s*\/\s*/g, ', ').replace(/[\r\n]+/g, ', ');

      // Издатель
      let publisher = '';
      const pubEl = doc.querySelector('.ContentInfo_value__04NMq a');
      if (pubEl) {
        publisher = pubEl.textContent.trim();
      }

      // Страницы
      let pages = '';
      const infoDivs = Array.from(doc.querySelectorAll('div[data-test-id="CONTENT_INFO"]'));
      for (const div of infoDivs) {
        const label = div.querySelector('span.ContentInfo_label__uGu8H');
        if (label?.textContent.trim() === 'Бумажных страниц:') {
          const valueEl = div.querySelector('span.ContentInfo_value__04NMq');
          if (valueEl) {
            pages = valueEl.textContent.trim();
          }
          break;
        }
      }

      // 8. Статус по умолчанию
      const status = 'отложено';

      // 9. Дата импорта
      const importDate = new Date().toISOString().split('T')[0];

      // 10. Обложка
      let coverURL = '';
      const coverEl = doc.querySelector('img.book-cover__image') ?? doc.querySelector('img[src*="assets/books-covers/"]');
      if (coverEl) {
        coverURL = coverEl.getAttribute('src') || '';
        if (coverURL && coverURL.startsWith('//')) {
          coverURL = 'https:' + coverURL;
        }
      }
      if (!coverURL) {
        const og = doc.querySelector('meta[property="og:image"]');
        if (og) coverURL = og.getAttribute('content') || '';
      }

      // 13. Удалить кавычки из серии
      series = series.replace(/['":]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();

      // 14. Использовать шаблон, если он задан
      // Переменная published для {{published}} (нет даты публикации у Yandex)
      const published = '';

      await this.createBookNote({
        url,
        title,
        author,
        published,
        category,
        series,
        series_number,
        pages,
        status,
        publisher,
        coverURL,
        description,
        importDate,
        source: url,
        isYandex: true
      });
    } catch (e) {
      console.error(e);
      new Notice('Failed to import from Yandex.Books');
    }
  }

  // Вынесенная общая функция создания заметки по данным книги
  private async createBookNote(data: {
    url: string;
    title: string;
    author: string;
    published: string;
    category: string;
    series: string;
    series_number: string;
    pages: string;
    status: string;
    publisher: string;
    coverURL: string;
    description: string;
    importDate: string;
    source: string;
    isYandex: boolean;
  }) {
    // Очистить базовое имя файла (удалить спецсимволы, оставить пробелы)
    const fileName = this.sanitizeFileName(`${data.title} -- ${data.author}`);
    // Скачать обложку локально, всегда сохранять с уникальным именем при необходимости
    let cover = '';
    if (data.coverURL) {
      try {
        const imagePath = await this.getUniquePath(`${this.settings.coverFolder}/${fileName}`, 'jpg');
        const imgResult = await requestUrl({ url: data.coverURL, method: 'GET' });
        const buffer: ArrayBuffer = imgResult.arrayBuffer;
        await this.app.vault.createBinary(imagePath, buffer);
        cover = imagePath;
      } catch (e) {
        // ignore
        console.warn('Cover download failed', e);
      }
    }
    // Уникальный путь к файлу заметки
    const filePath = await this.getUniquePath(`${this.settings.notesFolder}/${fileName}`, 'md');
    // Создать содержимое через шаблон или по умолчанию
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
        .onChange(async v => { this.plugin.settings.notesFolder = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Template Path')
      .setDesc('Relative path to note template')
      .addText(text => text.setPlaceholder('Templates/BookTemplate.md').setValue(this.plugin.settings.templatePath)
        .onChange(async v => { this.plugin.settings.templatePath = v; await this.plugin.saveSettings(); }));
    new Setting(containerEl)
      .setName('Cover Folder')
      .setDesc('Folder where cover images will be saved')
      .addText(text => text.setPlaceholder('images').setValue(this.plugin.settings.coverFolder)
        .onChange(async v => { this.plugin.settings.coverFolder = v; await this.plugin.saveSettings(); }));

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
