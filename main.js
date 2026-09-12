'use strict';

var obsidian = require('obsidian');

function normalizeTitle(value) {
    return value.replace(/['":]/g, '').trim();
}
function normalizeSeries(value) {
    return value
        .replace(/['":\/|!?]/g, '')
        .replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '')
        .trim();
}
function normalizeGenre(value) {
    return value.replace(/\s*\/\s*/g, ', ').replace(/[\r\n]+/g, ', ').trim();
}
function getImportDate() {
    return new Date().toISOString().split('T')[0];
}
function parseAuthorTodayBook(doc, url) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const importDate = getImportDate();
    const titleEl = doc.querySelector('h1.book-title[itemprop="name"]');
    const fallbackTitleEl = doc.querySelector('h1.work-page__title');
    let title = ((_a = titleEl === null || titleEl === void 0 ? void 0 : titleEl.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || ((_b = fallbackTitleEl === null || fallbackTitleEl === void 0 ? void 0 : fallbackTitleEl.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
    let author = '';
    const metaAuthor = doc.querySelector('meta[itemprop="name"]');
    if (metaAuthor) {
        author = ((_c = metaAuthor.getAttribute('content')) === null || _c === void 0 ? void 0 : _c.trim()) || '';
    }
    else {
        const authorEl = doc.querySelector('.work-page__author a');
        if (authorEl) {
            author = authorEl.textContent.trim();
        }
    }
    author = normalizeTitle(author);
    title = normalizeTitle(title);
    let published = '';
    const dateEl = Array.from(doc.querySelectorAll('span.hint-top'))
        .find(el => el.getAttribute('data-time'));
    if (dateEl) {
        published = ((_d = dateEl.getAttribute('data-time')) === null || _d === void 0 ? void 0 : _d.split('T')[0]) || '';
    }
    let genre = '';
    const genreDiv = doc.querySelector('div.book-genres');
    if (genreDiv)
        genre = genreDiv.textContent.trim();
    genre = normalizeGenre(genre);
    let series = '';
    let series_number = '';
    const cycleLabel = Array.from(doc.querySelectorAll('span.text-muted'))
        .find(el => el.textContent.trim().startsWith('Цикл'));
    if (cycleLabel) {
        const container = cycleLabel.parentElement;
        const linkEl = container === null || container === void 0 ? void 0 : container.querySelector('a');
        if (linkEl) {
            series = linkEl.textContent.trim().replace(/['"]/g, '');
            let numMatch = (_f = (_e = linkEl.nextElementSibling) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.match(/#\s*(\d+)/);
            if (!numMatch && (container === null || container === void 0 ? void 0 : container.textContent)) {
                numMatch = container.textContent.match(/#\s*(\d+)/);
            }
            if (numMatch)
                series_number = numMatch[1];
        }
    }
    series = normalizeSeries(series);
    let pages = '';
    const charsSpan = doc.querySelector('span.hint-top[data-hint^="Размер"]');
    if (charsSpan) {
        const raw = charsSpan.textContent.replace(/\D/g, '');
        const count = parseInt(raw, 10);
        pages = Math.ceil(count / 2000).toString();
    }
    const status = 'отложено';
    const publisher = 'АТ';
    const coverMeta = doc.querySelector('meta[property="og:image"]');
    const coverURL = (coverMeta === null || coverMeta === void 0 ? void 0 : coverMeta.getAttribute('content'))
        || ((_g = doc.querySelector('img.work-cover__image')) === null || _g === void 0 ? void 0 : _g.getAttribute('src'))
        || '';
    const description = ((_h = doc.querySelector('meta[property="og:description"]')) === null || _h === void 0 ? void 0 : _h.getAttribute('content')) || '';
    return {
        url,
        title,
        author,
        published,
        genre,
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
    };
}
function parseYandexBook(doc, url) {
    var _a, _b, _c;
    const importDate = getImportDate();
    let title = '';
    const titleEl = doc.querySelector('[data-test-id="CONTENT_TITLE_MAIN"]');
    if (titleEl) {
        title = titleEl.textContent.trim();
    }
    else {
        const ogTitle = (_b = (_a = doc.querySelector('meta[property="og:title"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) === null || _b === void 0 ? void 0 : _b.trim();
        title = ogTitle
            ? ogTitle.replace(/^Читать\s+/, '').replace(/\s+—.+$/, '').trim()
            : 'Unknown Title';
    }
    title = normalizeTitle(title).replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    let description = '';
    const descEl = doc.querySelector('.ExpandableText_text__2OFwq');
    if (descEl) {
        description = descEl.textContent.trim().replace(/\s+/g, ' ');
    }
    let series = '';
    let series_number = '';
    const seriesEl = Array.from(doc.querySelectorAll('li'))
        .find(el => el.textContent.includes('Серия:'));
    if (seriesEl) {
        const seriesText = seriesEl.textContent.replace('Серия:', '').trim();
        const seriesNumMatch = seriesText.match(/(.+?)\s*#(\d+)/);
        if (seriesNumMatch) {
            series = seriesNumMatch[1].trim();
            series_number = seriesNumMatch[2];
        }
        else {
            series = seriesText;
        }
    }
    let author = '';
    const authorEl = doc.querySelector('[data-test-id="CONTENT_TITLE_AUTHOR"] a');
    if (authorEl) {
        author = authorEl.textContent.trim();
    }
    let genre = '';
    const topicsEl = doc.querySelector('[data-test-id="CONTENT_TOPICS"]');
    if (topicsEl) {
        genre = Array.from(topicsEl.querySelectorAll('a'))
            .map(el => el.textContent.trim())
            .join(', ');
    }
    genre = normalizeGenre(genre);
    let publisher = '';
    const pubEl = doc.querySelector('.ContentInfo_value__04NMq a');
    if (pubEl) {
        publisher = pubEl.textContent.trim();
    }
    let pages = '';
    const infoDivs = Array.from(doc.querySelectorAll('div[data-test-id="CONTENT_INFO"]'));
    for (const div of infoDivs) {
        const label = div.querySelector('span.ContentInfo_label__uGu8H');
        if ((label === null || label === void 0 ? void 0 : label.textContent.trim()) === 'Бумажных страниц:') {
            const valueEl = div.querySelector('span.ContentInfo_value__04NMq');
            if (valueEl) {
                pages = valueEl.textContent.trim();
            }
            break;
        }
    }
    const status = 'отложено';
    let coverURL = '';
    const coverEl = (_c = doc.querySelector('img.book-cover__image')) !== null && _c !== void 0 ? _c : doc.querySelector('img[src*="assets/books-covers/"]');
    if (coverEl) {
        coverURL = coverEl.getAttribute('src') || '';
        if (coverURL && coverURL.startsWith('//')) {
            coverURL = 'https:' + coverURL;
        }
    }
    if (!coverURL) {
        const og = doc.querySelector('meta[property="og:image"]');
        if (og)
            coverURL = og.getAttribute('content') || '';
    }
    series = normalizeSeries(series);
    return {
        url,
        title,
        author,
        published: '',
        genre,
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
    };
}

const DEFAULT_SETTINGS = {
    notesFolder: 'References/Books',
    templatePath: '',
    coverFolder: 'Attachments/images',
    authorTodayCookie: '',
    authorTodayUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};
class UrlPromptModal extends obsidian.Modal {
    constructor(app, promptResult) {
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
            if (evt.key === 'Enter')
                submit.click();
        });
    }
    onClose() {
        this.contentEl.empty();
    }
}
class AuthorTodayImporter extends obsidian.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
    }
    sanitizeFileName(name) {
        return name
            .replace(/[\\\/:*?"<>|]/g, '')
            .replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '')
            .trim()
            .replace(/\s+/g, ' ')
            .substring(0, 100);
    }
    async fetchDocument(url, headers) {
        const result = await obsidian.requestUrl({
            url,
            method: 'GET',
            ...(headers ? { headers } : {})
        });
        const parser = new DOMParser();
        return parser.parseFromString(result.text, 'text/html');
    }
    async getUniquePath(basePath, ext) {
        let path = `${basePath}.${ext}`;
        let counter = 1;
        if (ext === 'md') {
            while (this.app.vault.getAbstractFileByPath(path)) {
                path = `${basePath}_${counter}.${ext}`;
                counter++;
            }
        }
        else {
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
                new obsidian.Notice('Некорректный URL');
                return;
            }
            if (url.includes('author.today')) {
                this.importBook(url);
            }
            else if (url.includes('books.yandex.ru')) {
                this.importYandexBook(url);
            }
            else {
                new obsidian.Notice('Неизвестный ресурс');
            }
        }).open();
    }
    async importBook(url) {
        var _a, _b;
        try {
            const headers = {
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
        }
        catch (e) {
            const anyErr = e;
            const status = (_a = anyErr === null || anyErr === void 0 ? void 0 : anyErr.status) !== null && _a !== void 0 ? _a : (_b = anyErr === null || anyErr === void 0 ? void 0 : anyErr.response) === null || _b === void 0 ? void 0 : _b.status;
            const msg = (anyErr === null || anyErr === void 0 ? void 0 : anyErr.message) ? String(anyErr.message) : String(e);
            console.error('AuthorToday import error', { status, msg, e });
            if (status === 403) {
                new obsidian.Notice('Author.Today вернул 403 (блокировка/антибот). Попробуй указать Cookie в настройках плагина или открыть страницу в браузере и проверить доступ.');
            }
            else {
                new obsidian.Notice(`Failed to import book${status ? ` (status ${status})` : ''}`);
            }
        }
    }
    async importYandexBook(url) {
        try {
            const doc = await this.fetchDocument(url);
            const bookData = parseYandexBook(doc, url);
            await this.createBookNote(bookData);
        }
        catch (e) {
            console.error(e);
            new obsidian.Notice('Failed to import from Yandex.Books');
        }
    }
    async createBookNote(data) {
        const authors = data.author.split(/\s*(?:,|;|\band\b| и )\s*/i).filter(Boolean);
        const firstAuthor = authors[0] || '';
        const fileName = this.sanitizeFileName(`${data.title} -- ${firstAuthor}`);
        let cover = '';
        if (data.coverURL) {
            try {
                const imagePath = await this.getUniquePath(`${this.settings.coverFolder}/${fileName}`, 'jpg');
                const imgResult = await obsidian.requestUrl({ url: data.coverURL, method: 'GET' });
                const buffer = imgResult.arrayBuffer;
                await this.app.vault.createBinary(imagePath, buffer);
                cover = imagePath;
            }
            catch (e) {
                console.warn('Cover download failed', e);
            }
        }
        const filePath = await this.getUniquePath(`${this.settings.notesFolder}/${fileName}`, 'md');
        const yamlList = (values) => values.length
            ? values.map(value => `  - "[[${value.trim()}]]"`).join('\n')
            : '';
        const genreValues = data.genre.split(',').map(value => value.trim()).filter(Boolean);
        const authorsYaml = yamlList(authors);
        const genresYaml = yamlList(genreValues);
        const coverLink = cover ? `"[[${cover}]]"` : '';
        const statusLink = data.status ? `"[[${data.status}]]"` : '';
        const seriesLink = data.series ? `"[[${data.series}]]"` : '';
        let content = '';
        if (this.settings.templatePath) {
            const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
            if (tplFile instanceof obsidian.TFile) {
                let tpl = await this.app.vault.read(tplFile);
                const placeholders = {
                    date: data.importDate,
                    title: data.title,
                    author: data.author,
                    genre: data.genre,
                    authors_yaml: authorsYaml,
                    genres_yaml: genresYaml,
                    publisher: data.publisher,
                    published: data.published,
                    pages: data.pages,
                    coverURL: data.coverURL,
                    cover,
                    cover_link: coverLink,
                    status: data.status,
                    status_link: statusLink,
                    series: data.series,
                    series_link: seriesLink,
                    series_number: data.series_number,
                    source: data.source,
                    description: data.description
                };
                tpl = tpl.replace(/\{\{(date|title|author|genre|authors_yaml|genres_yaml|publisher|published|pages|coverURL|cover|cover_link|status|status_link|series|series_link|series_number|source|description)\}\}/g, (_, key) => { var _a; return (_a = placeholders[key]) !== null && _a !== void 0 ? _a : ''; });
                content = tpl.replace(/\{\{[^}]+\}\}/g, '');
            }
            else {
                new obsidian.Notice(`🔴 Template not found: ${this.settings.templatePath}`);
            }
        }
        if (!content) {
            content = `---
categories:
  - "[[Books]]"
type:
  - "[[Book]]"

created: ${data.importDate}
updated:

title: "${data.title}"

author:
${authorsYaml}

genre:
${genresYaml}

publisher: "${data.publisher}"
published: ${data.published}
pages: ${data.pages}

coverURL: "${data.coverURL}"
cover: ${coverLink}

status: ${statusLink}

series: ${seriesLink}
series_number: ${data.series_number}

rating:
last:

source: "${data.source}"
---

${data.description}`;
        }
        await this.app.vault.create(filePath, content);
        new obsidian.Notice(data.isYandex
            ? `Imported "${data.title}" from Yandex.Books`
            : `Imported "${data.title}"`);
        const newFile = this.app.vault.getAbstractFileByPath(filePath);
        if (newFile instanceof obsidian.TFile)
            this.app.workspace.getLeaf(true).openFile(newFile);
    }
    onunload() { }
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
class ImporterSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        new obsidian.Setting(containerEl)
            .setName('Notes Folder')
            .setDesc('Folder where imported book notes will be saved')
            .addText(text => text.setPlaceholder('References/Books').setValue(this.plugin.settings.notesFolder)
            .onChange(async (v) => {
            this.plugin.settings.notesFolder = v;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('Template Path')
            .setDesc('Relative path to note template')
            .addText(text => text.setPlaceholder('Templates/BookTemplate.md').setValue(this.plugin.settings.templatePath)
            .onChange(async (v) => {
            this.plugin.settings.templatePath = v;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('Cover Folder')
            .setDesc('Folder where cover images will be saved')
            .addText(text => text.setPlaceholder('Attachments/images').setValue(this.plugin.settings.coverFolder)
            .onChange(async (v) => {
            this.plugin.settings.coverFolder = v;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('Author.Today Cookie (optional)')
            .setDesc('Вставь Cookie из браузера (только если Author.Today возвращает 403). Хранится локально в настройках Obsidian.')
            .addTextArea(text => text
            .setPlaceholder('cf_clearance=...; session=...')
            .setValue(this.plugin.settings.authorTodayCookie)
            .onChange(async (v) => {
            this.plugin.settings.authorTodayCookie = v;
            await this.plugin.saveSettings();
        }));
        new obsidian.Setting(containerEl)
            .setName('Author.Today User-Agent')
            .setDesc('User-Agent для запроса страницы (иногда помогает обойти 403).')
            .addText(text => text
            .setPlaceholder('Mozilla/5.0 ...')
            .setValue(this.plugin.settings.authorTodayUserAgent)
            .onChange(async (v) => {
            this.plugin.settings.authorTodayUserAgent = v;
            await this.plugin.saveSettings();
        }));
    }
}

module.exports = AuthorTodayImporter;
//# sourceMappingURL=main.js.map
