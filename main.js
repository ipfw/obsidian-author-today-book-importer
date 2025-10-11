'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    notesFolder: 'Books',
    templatePath: '',
    coverFolder: 'images'
};
// Модальное окно для ввода URL
class UrlPromptModal extends obsidian.Modal {
    constructor(app, promptResult) {
        super(app);
        this.promptResult = promptResult;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Enter book URL' });
        const input = contentEl.createEl('input', { type: 'text' });
        input.style.width = '100%';
        const submit = contentEl.createEl('button', { text: 'Import' });
        submit.style.marginTop = '10px';
        submit.onclick = () => { const url = input.value.trim(); this.close(); this.promptResult(url); };
        input.focus();
        input.addEventListener('keydown', evt => { if (evt.key === 'Enter')
            submit.click(); });
    }
    onClose() { this.contentEl.empty(); }
}
class AuthorTodayImporter extends obsidian.Plugin {
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
                new obsidian.Notice('No URL provided');
                return;
            }
            if (url.includes('author.today')) {
                this.importBook(url);
            }
            else if (url.includes('books.yandex.ru')) {
                this.importYandexBook(url);
            }
            else {
                new obsidian.Notice('Unsupported book source');
            }
        }).open();
    }
    async importBook(url) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        try {
            // Получить HTML страницы через API Obsidian
            const result = await obsidian.requestUrl({ url, method: 'GET' });
            const html = result.text;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Вычислить дату импорта для {{date}}
            const importDate = new Date().toISOString().split('T')[0];
            // Извлечь метаданные
            let title = ((_b = (_a = doc.querySelector('h1.work-page__title')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            if (!title)
                title = ((_c = doc.title.split(' - ')[0]) === null || _c === void 0 ? void 0 : _c.trim()) || 'Unknown Title';
            // Удалить кавычки, двоеточия и специальные символы из названия
            title = title.replace(/['":]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
            let author = ((_e = (_d = doc.querySelector('.work-page__author a')) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
            if (!author)
                author = ((_f = doc.title.split(' - ')[1]) === null || _f === void 0 ? void 0 : _f.trim()) || '';
            // Переменная published для {{published}}
            let published = '';
            const pubSpan = doc.querySelector('span.hint-top[data-time]');
            if (pubSpan) {
                published = ((_g = pubSpan.getAttribute('data-time')) === null || _g === void 0 ? void 0 : _g.split('T')[0]) || '';
            }
            // Очистить базовое имя файла (удалить спецсимволы, оставить пробелы)
            const fileName = title;
            const coverURL = ((_h = doc.querySelector('meta[property="og:image"]')) === null || _h === void 0 ? void 0 : _h.getAttribute('content')) || '';
            const description = ((_j = doc.querySelector('meta[property="og:description"]')) === null || _j === void 0 ? void 0 : _j.getAttribute('content')) || '';
            // Жанры
            let category = '';
            const genreDiv = doc.querySelector('div.book-genres');
            if (genreDiv)
                category = genreDiv.textContent.trim();
            // Преобразовать слэши в запятые для YAML-массива
            category = category.replace(/\s*\/\s*/g, ', ').replace(/[\r\n]+/g, ', ');
            // Серия и номер
            let series = '', series_number = '';
            const cycleLabel = Array.from(doc.querySelectorAll('span.text-muted'))
                .find(el => el.textContent.trim().startsWith('Цикл'));
            if (cycleLabel) {
                const linkEl = cycleLabel.nextElementSibling;
                if (linkEl) {
                    series = linkEl.textContent.trim().replace(/['"]/g, '');
                    const numEl = linkEl.nextElementSibling;
                    const m = numEl === null || numEl === void 0 ? void 0 : numEl.textContent.match(/#(\d+)/);
                    if (m)
                        series_number = m[1];
                }
            }
            series = series.replace(/['":]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
            // Оценочное количество страниц
            let pages = '';
            const charsSpan = doc.querySelector('span.hint-top[data-hint^="Размер"]');
            if (charsSpan) {
                const raw = charsSpan.textContent.replace(/\D/g, '');
                const count = parseInt(raw, 10);
                pages = Math.ceil(count / 2000).toString();
            }
            // Статус по умолчанию
            const status = 'отложено';
            const publisher = 'АТ';
            // Скачать обложку локально, всегда сохранять с уникальным именем при необходимости
            let cover = '';
            if (coverURL) {
                try {
                    let baseImagePath = `${this.settings.coverFolder}/${fileName}`;
                    let imagePath = `${baseImagePath}.jpg`;
                    let imageCounter = 1;
                    while (await this.app.vault.adapter.exists(imagePath)) {
                        imagePath = `${baseImagePath}_${imageCounter}.jpg`;
                        imageCounter++;
                    }
                    const imgResult = await obsidian.requestUrl({ url: coverURL, method: 'GET' });
                    const buffer = imgResult.arrayBuffer;
                    await this.app.vault.createBinary(imagePath, buffer);
                    cover = imagePath;
                }
                catch (e) {
                    console.warn('Cover download failed', e);
                }
            }
            // Уникальный путь к файлу
            const basePath = `${this.settings.notesFolder}/${fileName}`;
            let filePath = `${basePath}.md`;
            let counter = 1;
            // Добавлять суффикс только если файл с таким именем уже существует
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${basePath}_${counter}.md`;
                counter++;
            }
            // Создать содержимое через шаблон или по умолчанию
            let content = '';
            if (this.settings.templatePath) {
                const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
                if (tplFile instanceof obsidian.TFile) {
                    let tpl = await this.app.vault.read(tplFile);
                    tpl = tpl
                        .replace(/\{\{date\}\}/g, importDate)
                        .replace(/\{\{title\}\}/g, title)
                        .replace(/\{\{author\}\}/g, author)
                        .replace(/\{\{published\}\}/g, published)
                        .replace(/\{\{coverURL\}\}/g, coverURL)
                        .replace(/\{\{cover\}\}/g, cover)
                        .replace(/\{\{description\}\}/g, description)
                        .replace(/\{\{category\}\}/g, category)
                        .replace(/\{\{series\}\}/g, series)
                        .replace(/\{\{series_number\}\}/g, series_number)
                        .replace(/\{\{pages\}\}/g, pages)
                        .replace(/\{\{status\}\}/g, status)
                        .replace(/\{\{publisher\}\}/g, publisher)
                        .replace(/\{\{source\}\}/g, url);
                    content = tpl;
                }
                else {
                    new obsidian.Notice(`🔴 Template not found: ${this.settings.templatePath}`);
                }
            }
            if (!content) {
                content = `---
coverURL: "${coverURL}"
cover: "${cover}"
title: "${title}"
author: "${author}"
category: "${category}"
published: "${published}"
source: "${url}"
series: "[[${series}]]"
series_number: "${series_number}"
seriesname: "${series}"
publisher: "${publisher}"
pages: "${pages}"
status: "${status}"
date: "${importDate}"
---

${description}`;
            }
            await this.app.vault.create(filePath, content);
            new obsidian.Notice(`Imported "${title}"`);
            const newFile = this.app.vault.getAbstractFileByPath(filePath);
            if (newFile instanceof obsidian.TFile)
                this.app.workspace.getLeaf(true).openFile(newFile);
        }
        catch (e) {
            console.error(e);
            new obsidian.Notice('Failed to import book');
        }
    }
    async importYandexBook(url) {
        var _a, _b, _c, _d, _e;
        try {
            const result = await obsidian.requestUrl({ url, method: 'GET' });
            const html = result.text;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            console.log("Yandex page HTML:", doc.body.innerHTML.slice(0, 1000));
            console.log("OG title:", (_a = doc.querySelector('meta[property="og:title"]')) === null || _a === void 0 ? void 0 : _a.getAttribute('content'));
            console.log("OG desc:", (_b = doc.querySelector('meta[property="og:description"]')) === null || _b === void 0 ? void 0 : _b.getAttribute('content'));
            // Парсинг названия
            let title = '';
            const titleEl = doc.querySelector('[data-test-id="CONTENT_TITLE_MAIN"]');
            if (titleEl) {
                title = titleEl.textContent.trim();
            }
            else {
                const ogTitle = (_d = (_c = doc.querySelector('meta[property="og:title"]')) === null || _c === void 0 ? void 0 : _c.getAttribute('content')) === null || _d === void 0 ? void 0 : _d.trim();
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
                }
                else {
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
                if ((label === null || label === void 0 ? void 0 : label.textContent.trim()) === 'Бумажных страниц:') {
                    const valueEl = div.querySelector('span.ContentInfo_value__04NMq');
                    if (valueEl) {
                        pages = valueEl.textContent.trim();
                    }
                    break;
                }
            }
            // 8. Статус по умолчанию
            const status = 'отложено';
            // 9. Дата импорта и имя файла
            const importDate = new Date().toISOString().split('T')[0];
            const fileName = title;
            // 10. Обложка
            let coverURL = '';
            const coverEl = (_e = doc.querySelector('img.book-cover__image')) !== null && _e !== void 0 ? _e : doc.querySelector('img[src*="assets/books-covers/"]');
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
            // 11. Скачать обложку локально
            let cover = '';
            if (coverURL) {
                try {
                    let baseImagePath = `${this.settings.coverFolder}/${fileName}`;
                    let imagePath = `${baseImagePath}.jpg`;
                    let imageCounter = 1;
                    while (await this.app.vault.adapter.exists(imagePath)) {
                        imagePath = `${baseImagePath}_${imageCounter}.jpg`;
                        imageCounter++;
                    }
                    const imgResult = await obsidian.requestUrl({ url: coverURL, method: 'GET' });
                    const buffer = imgResult.arrayBuffer;
                    await this.app.vault.createBinary(imagePath, buffer);
                    cover = imagePath;
                }
                catch { /* ignore */ }
            }
            // 12. Обеспечить уникальность пути к файлу
            const basePath = `${this.settings.notesFolder}/${fileName}`;
            let filePath = `${basePath}.md`;
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${basePath}_${counter}.md`;
                counter++;
            }
            // 13. Удалить кавычки из серии
            series = series.replace(/['":]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
            // 14. Использовать шаблон, если он задан
            // Переменная published для {{published}} (нет даты публикации у Yandex)
            const published = '';
            let content = '';
            if (this.settings.templatePath) {
                const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
                if (tplFile instanceof obsidian.TFile) {
                    let tpl = await this.app.vault.read(tplFile);
                    tpl = tpl
                        .replace(/\{\{date\}\}/g, importDate)
                        .replace(/\{\{title\}\}/g, title)
                        .replace(/\{\{author\}\}/g, author)
                        .replace(/\{\{coverURL\}\}/g, coverURL)
                        .replace(/\{\{cover\}\}/g, cover)
                        .replace(/\{\{description\}\}/g, description)
                        .replace(/\{\{category\}\}/g, category)
                        .replace(/\{\{series\}\}/g, series)
                        .replace(/\{\{series_number\}\}/g, series_number)
                        .replace(/\{\{pages\}\}/g, pages)
                        .replace(/\{\{publisher\}\}/g, publisher)
                        .replace(/\{\{status\}\}/g, status)
                        .replace(/\{\{source\}\}/g, url)
                        .replace(/\{\{published\}\}/g, published);
                    content = tpl;
                }
                else {
                    new obsidian.Notice(`🔴 Template not found: ${this.settings.templatePath}`);
                }
            }
            if (!content) {
                content = `---
title: "${title}"
author: "${author}"
publisher: "${publisher}"
published: "${published}"
pages: "${pages}"
coverURL: "${coverURL}"
cover: "${cover}"
category: "${category}"
series: "[[${series}]]"
series_number: "${series_number}"
seriesname: "${series}"
source: "${url}"
date: "${importDate}"
status: "${status}"
---

${description}`;
            }
            await this.app.vault.create(filePath, content);
            new obsidian.Notice(`Imported "${title}" from Yandex.Books`);
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof obsidian.TFile)
                this.app.workspace.getLeaf(true).openFile(file);
        }
        catch (e) {
            console.error(e);
            new obsidian.Notice('Failed to import from Yandex.Books');
        }
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
            .addText(text => text.setPlaceholder('Books').setValue(this.plugin.settings.notesFolder)
            .onChange(async (v) => { this.plugin.settings.notesFolder = v; await this.plugin.saveSettings(); }));
        new obsidian.Setting(containerEl)
            .setName('Template Path')
            .setDesc('Relative path to note template')
            .addText(text => text.setPlaceholder('Templates/BookTemplate.md').setValue(this.plugin.settings.templatePath)
            .onChange(async (v) => { this.plugin.settings.templatePath = v; await this.plugin.saveSettings(); }));
        new obsidian.Setting(containerEl)
            .setName('Cover Folder')
            .setDesc('Folder where cover images will be saved')
            .addText(text => text.setPlaceholder('images').setValue(this.plugin.settings.coverFolder)
            .onChange(async (v) => { this.plugin.settings.coverFolder = v; await this.plugin.saveSettings(); }));
    }
}

module.exports = AuthorTodayImporter;
//# sourceMappingURL=main.js.map
