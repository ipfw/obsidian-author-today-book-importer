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
function getMetaContent(doc, property) {
    var _a;
    return ((_a = doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)) === null || _a === void 0 ? void 0 : _a.getAttribute('content')) || '';
}
function decodeNextFlightPayload(doc) {
    const chunks = [];
    const marker = 'self.__next_f.push([1,';
    for (const script of Array.from(doc.querySelectorAll('script'))) {
        const source = script.textContent || '';
        let searchFrom = 0;
        while (searchFrom < source.length) {
            const markerIndex = source.indexOf(marker, searchFrom);
            if (markerIndex < 0)
                break;
            const valueStart = markerIndex + marker.length;
            if (source[valueStart] !== '"') {
                searchFrom = valueStart;
                continue;
            }
            let escaped = false;
            let valueEnd = -1;
            for (let i = valueStart + 1; i < source.length; i++) {
                const char = source[i];
                if (escaped) {
                    escaped = false;
                }
                else if (char === '\\') {
                    escaped = true;
                }
                else if (char === '"') {
                    valueEnd = i;
                    break;
                }
            }
            if (valueEnd < 0)
                break;
            try {
                const decoded = JSON.parse(source.slice(valueStart, valueEnd + 1));
                if (typeof decoded === 'string')
                    chunks.push(decoded);
            }
            catch (error) {
                console.warn('Failed to decode LitRes data chunk', error);
            }
            searchFrom = valueEnd + 1;
        }
    }
    return chunks.join('\n');
}
function extractJsonObjects(payload, propertyName) {
    const results = [];
    const marker = `"${propertyName}":`;
    let searchFrom = 0;
    while (searchFrom < payload.length) {
        const markerIndex = payload.indexOf(marker, searchFrom);
        if (markerIndex < 0)
            break;
        let objectStart = markerIndex + marker.length;
        while (/\s/.test(payload[objectStart] || ''))
            objectStart++;
        if (payload[objectStart] !== '{') {
            searchFrom = objectStart + 1;
            continue;
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        let objectEnd = -1;
        for (let i = objectStart; i < payload.length; i++) {
            const char = payload[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                }
                else if (char === '\\') {
                    escaped = true;
                }
                else if (char === '"') {
                    inString = false;
                }
                continue;
            }
            if (char === '"') {
                inString = true;
            }
            else if (char === '{') {
                depth++;
            }
            else if (char === '}') {
                depth--;
                if (depth === 0) {
                    objectEnd = i;
                    break;
                }
            }
        }
        if (objectEnd < 0)
            break;
        try {
            results.push(JSON.parse(payload.slice(objectStart, objectEnd + 1)));
        }
        catch (error) {
            console.warn(`Failed to parse LitRes ${propertyName}`, error);
        }
        searchFrom = objectEnd + 1;
    }
    return results;
}
function stripHtml(doc, html) {
    if (!html)
        return '';
    const wrapper = doc.createElement('div');
    wrapper.innerHTML = html;
    return (wrapper.textContent || '').replace(/\s+/g, ' ').trim();
}
function normalizeDate(value) {
    if (!value)
        return '';
    const text = String(value);
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : text;
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
    const publisherEl = doc.querySelector('[itemprop="publisher"] [itemprop="name"], meta[itemprop="publisher"], [itemprop="publisher"]');
    const publisherFromPage = publisherEl
        ? (publisherEl.getAttribute('content') || publisherEl.textContent || '').trim()
        : '';
    const publisher = normalizeTitle(publisherFromPage) || 'АТ';
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
    let pages = '';
    const infoDivs = Array.from(doc.querySelectorAll('div[data-test-id="CONTENT_INFO"]'));
    for (const div of infoDivs) {
        const label = div.querySelector('span.ContentInfo_label__uGu8H, span[class*="ContentInfo_label"]');
        const valueEl = div.querySelector('span.ContentInfo_value__04NMq, span[class*="ContentInfo_value"]');
        const labelText = (label === null || label === void 0 ? void 0 : label.textContent.trim()) || '';
        const valueText = (valueEl === null || valueEl === void 0 ? void 0 : valueEl.textContent.trim()) || '';
        if (labelText === 'Бумажных страниц:') {
            pages = valueText;
        }
        else if (/^Издатель(?:ство)?\s*:?$/i.test(labelText)) {
            publisher = valueText;
        }
    }
    publisher = normalizeTitle(publisher) || 'Яндекс';
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
function parseLitresBook(doc, url) {
    var _a, _b, _c;
    const importDate = getImportDate();
    const artIdMatch = url.match(/-(\d+)\/?(?:[?#].*)?$/);
    const artId = artIdMatch ? Number(artIdMatch[1]) : 0;
    const payload = decodeNextFlightPayload(doc);
    const initialArts = extractJsonObjects(payload, 'initialArt');
    const art = initialArts.find(item => Number(item === null || item === void 0 ? void 0 : item.id) === artId)
        || initialArts[0]
        || null;
    const ogTitle = getMetaContent(doc, 'og:title').trim();
    let fallbackTitle = ogTitle;
    let fallbackAuthor = '';
    const titleParts = ogTitle.split(/\s+[—–]\s+/, 2);
    if (titleParts.length === 2) {
        fallbackTitle = titleParts[0];
        fallbackAuthor = titleParts[1]
            .replace(/\s+Автор\s*(?:\|.*)?$/i, '')
            .replace(/\s*\|\s*Литрес.*$/i, '')
            .trim();
    }
    const title = normalizeTitle((art === null || art === void 0 ? void 0 : art.title) || fallbackTitle);
    const authors = Array.isArray(art === null || art === void 0 ? void 0 : art.persons)
        ? art.persons
            .filter((person) => person && person.role === 'author')
            .map((person) => person.full_name)
            .filter(Boolean)
        : [];
    const author = normalizeTitle(authors.join(', ') || fallbackAuthor);
    const genres = Array.isArray(art === null || art === void 0 ? void 0 : art.genres)
        ? art.genres.map((item) => item === null || item === void 0 ? void 0 : item.name).filter(Boolean)
        : [];
    const genre = normalizeGenre(genres.join(', '));
    const bookSeries = Array.isArray(art === null || art === void 0 ? void 0 : art.series) ? art.series[0] : null;
    const series = normalizeSeries((bookSeries === null || bookSeries === void 0 ? void 0 : bookSeries.name) || '');
    const series_number = (bookSeries === null || bookSeries === void 0 ? void 0 : bookSeries.art_order) == null
        ? ''
        : String(bookSeries.art_order);
    const pagesValue = (art === null || art === void 0 ? void 0 : art.art_type) === 1
        ? ''
        : (_b = (_a = art === null || art === void 0 ? void 0 : art.additional_info) === null || _a === void 0 ? void 0 : _a.current_pages_or_seconds) !== null && _b !== void 0 ? _b : '';
    const pages = pagesValue === '' ? '' : String(pagesValue);
    const published = normalizeDate((art === null || art === void 0 ? void 0 : art.first_time_sale_at) || (art === null || art === void 0 ? void 0 : art.publication_date) || (art === null || art === void 0 ? void 0 : art.date_written_at));
    const publisherValue = ((_c = art === null || art === void 0 ? void 0 : art.publisher) === null || _c === void 0 ? void 0 : _c.name)
        || (typeof (art === null || art === void 0 ? void 0 : art.publisher) === 'string' ? art.publisher : '')
        || '';
    const publisher = normalizeTitle(publisherValue) || 'Литрес';
    let coverURL = getMetaContent(doc, 'og:image').trim();
    if (!coverURL && (art === null || art === void 0 ? void 0 : art.cover_url)) {
        try {
            coverURL = new URL(art.cover_url, 'https://cdn.litres.ru').href;
        }
        catch {
            coverURL = art.cover_url;
        }
    }
    const annotation = (art === null || art === void 0 ? void 0 : art.html_annotation)
        || (art === null || art === void 0 ? void 0 : art.original_html_annotation)
        || (art === null || art === void 0 ? void 0 : art.html_annotation_litres)
        || '';
    const description = stripHtml(doc, annotation)
        || getMetaContent(doc, 'og:description').trim();
    if (!title || !author) {
        throw new Error('LitRes book data was not found on the page');
    }
    return {
        url,
        title,
        author,
        published,
        genre,
        series,
        series_number,
        pages,
        status: 'отложено',
        publisher,
        coverURL,
        description,
        importDate,
        source: url,
        isYandex: false,
        isLitres: true
    };
}

const DEFAULT_SETTINGS = {
    notesFolder: 'References/Books',
    templatePath: '',
    coverFolder: 'Attachments/images',
    authorTodayCookie: '',
    authorTodayUserAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
};
function getUrlHost(value) {
    try {
        return new URL(value).hostname.toLowerCase();
    }
    catch {
        return '';
    }
}
function isHost(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
}
function getCoverExtension(url) {
    try {
        const match = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif)$/i);
        if (!match)
            return 'jpg';
        return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    }
    catch {
        return 'jpg';
    }
}
class UrlPromptModal extends obsidian.Modal {
    constructor(app, promptResult) {
        super(app);
        this.promptResult = promptResult;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Введите URL книги (Author.Today, Яндекс Книги или LitRes):' });
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
            const host = getUrlHost(url);
            if (isHost(host, 'author.today')) {
                this.importBook(url);
            }
            else if (isHost(host, 'books.yandex.ru')) {
                this.importYandexBook(url);
            }
            else if (isHost(host, 'litres.ru') || isHost(host, 'litres.com')) {
                this.importLitresBook(url);
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
    async importLitresBook(url) {
        var _a, _b;
        try {
            const headers = {
                'User-Agent': this.settings.authorTodayUserAgent || 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
            };
            const doc = await this.fetchDocument(url, headers);
            const bookData = parseLitresBook(doc, url);
            await this.createBookNote(bookData);
        }
        catch (e) {
            const anyErr = e;
            const status = (_a = anyErr === null || anyErr === void 0 ? void 0 : anyErr.status) !== null && _a !== void 0 ? _a : (_b = anyErr === null || anyErr === void 0 ? void 0 : anyErr.response) === null || _b === void 0 ? void 0 : _b.status;
            const msg = (anyErr === null || anyErr === void 0 ? void 0 : anyErr.message) ? String(anyErr.message) : String(e);
            console.error('LitRes import error', { status, msg, e });
            new obsidian.Notice(`Не удалось импортировать книгу с LitRes${status ? ` (status ${status})` : ''}`);
        }
    }
    async createBookNote(data) {
        const authors = data.author.split(/\s*(?:,|;|\band\b| и )\s*/i).filter(Boolean);
        const firstAuthor = authors[0] || '';
        const fileName = this.sanitizeFileName(`${data.title} -- ${firstAuthor}`);
        let cover = '';
        if (data.coverURL) {
            try {
                const imagePath = await this.getUniquePath(`${this.settings.coverFolder}/${fileName}`, getCoverExtension(data.coverURL));
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
            : data.isLitres
                ? `Imported "${data.title}" from LitRes`
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
