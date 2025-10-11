'use strict';

var obsidian = require('obsidian');

const DEFAULT_SETTINGS = {
    notesFolder: 'Books',
    templatePath: '',
    coverFolder: 'images'
};
// Modal for entering a URL
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
            id: 'import-author-today-book',
            name: 'Import Book from Author.Today',
            callback: () => this.openPrompt()
        });
        this.addCommand({
            id: 'import-yandex-book',
            name: 'Import Book from Yandex.Books',
            callback: () => this.openPromptYandex()
        });
        this.addSettingTab(new ImporterSettingTab(this.app, this));
    }
    openPrompt() {
        new UrlPromptModal(this.app, url => {
            if (url)
                this.importBook(url);
            else
                new obsidian.Notice('No URL provided');
        }).open();
    }
    openPromptYandex() {
        new UrlPromptModal(this.app, (url) => {
            if (url)
                this.importYandexBook(url);
            else
                new obsidian.Notice('No URL provided');
        }).open();
    }
    async importBook(url) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            // Fetch page HTML via Obsidian API
            const result = await obsidian.requestUrl({ url, method: 'GET' });
            const html = result.text;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            // Compute import date for {{date}}
            const importDate = new Date().toISOString().split('T')[0];
            // Extract metadata
            let title = ((_b = (_a = doc.querySelector('h1.work-page__title')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            if (!title)
                title = ((_c = doc.title.split(' - ')[0]) === null || _c === void 0 ? void 0 : _c.trim()) || 'Unknown Title';
            // Remove colons from title
            title = title.replace(/:/g, '');
            let author = ((_e = (_d = doc.querySelector('.work-page__author a')) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
            if (!author)
                author = ((_f = doc.title.split(' - ')[1]) === null || _f === void 0 ? void 0 : _f.trim()) || '';
            let publishDate = '';
            const pubSpan = doc.querySelector('span.hint-top[data-format="calendar-short"]');
            if (pubSpan === null || pubSpan === void 0 ? void 0 : pubSpan.getAttribute('data-time')) {
                publishDate = pubSpan.getAttribute('data-time').split('T')[0];
            }
            // Sanitize base fileName (remove colons and special characters, keep spaces)
            const fileName = title
                .replace(/:/g, '')
                .replace(/[^\p{L}\p{N}\s]/gu, '')
                .trim();
            const cover = ((_g = doc.querySelector('meta[property="og:image"]')) === null || _g === void 0 ? void 0 : _g.getAttribute('content')) || '';
            const description = ((_h = doc.querySelector('meta[property="og:description"]')) === null || _h === void 0 ? void 0 : _h.getAttribute('content')) || '';
            // Genres
            let category = '';
            const genreDiv = doc.querySelector('div.book-genres');
            if (genreDiv)
                category = genreDiv.textContent.trim();
            // Normalize slash separators into commas, for YAML array
            category = category.replace(/\s*\/\s*/g, ', ');
            // Series and number
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
            // Estimated pages
            let pages = '';
            const charsSpan = doc.querySelector('span.hint-top[data-hint^="Размер"]');
            if (charsSpan) {
                const raw = charsSpan.textContent.replace(/\D/g, '');
                const count = parseInt(raw, 10);
                pages = Math.ceil(count / 2000).toString();
            }
            // Default status
            const status = 'отложено';
            const publisher = 'АТ';
            // Download cover locally, always save with unique name if needed
            let localCover = '';
            if (cover) {
                try {
                    let baseImagePath = `${this.settings.coverFolder}/${fileName}`;
                    let imagePath = `${baseImagePath}.jpg`;
                    let imageCounter = 1;
                    while (await this.app.vault.adapter.exists(imagePath)) {
                        imagePath = `${baseImagePath}_${imageCounter}.jpg`;
                        imageCounter++;
                    }
                    const imgResult = await obsidian.requestUrl({ url: cover, method: 'GET' });
                    const buffer = imgResult.arrayBuffer;
                    await this.app.vault.createBinary(imagePath, buffer);
                    localCover = imagePath;
                }
                catch (e) {
                    console.warn('Cover download failed', e);
                }
            }
            // Unique file path
            const basePath = `${this.settings.notesFolder}/${fileName}`;
            let filePath = `${basePath}.md`;
            let counter = 1;
            // Only add suffix if a file with the same path already exists
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${basePath}_${counter}.md`;
                counter++;
            }
            // Build content via template or default
            let content = '';
            if (this.settings.templatePath) {
                const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
                if (tplFile instanceof obsidian.TFile) {
                    let tpl = await this.app.vault.read(tplFile);
                    tpl = tpl
                        .replace(/\{\{date\}\}/g, importDate)
                        .replace(/\{\{title\}\}/g, title)
                        .replace(/\{\{author\}\}/g, author)
                        .replace(/\{\{publishDate\}\}/g, publishDate)
                        .replace(/\{\{cover\}\}/g, cover)
                        .replace(/\{\{localCover\}\}/g, localCover)
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
cover: "${localCover || cover}"
localCover: "${localCover}"
title: "${title}"
author: "${author}"
category: "${category}"
publishDate: "${publishDate}"
source: "${url}"
series: "[[${series}]]"
series_number: "${series_number}"
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
            // Title parsing
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
            // Remove colons from title
            title = title.replace(/:/g, '');
            // Description parsing
            let description = '';
            const descEl = doc.querySelector('.ExpandableText_text__2OFwq');
            if (descEl) {
                description = descEl.textContent.trim().replace(/\s+/g, ' ');
            }
            // Series and number
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
            // Author
            let author = '';
            const authorEl = doc.querySelector('[data-test-id="CONTENT_TITLE_AUTHOR"] a');
            if (authorEl) {
                author = authorEl.textContent.trim();
            }
            // Categories
            let category = '';
            const topicsEl = doc.querySelector('[data-test-id="CONTENT_TOPICS"]');
            if (topicsEl) {
                category = Array.from(topicsEl.querySelectorAll('a'))
                    .map(el => el.textContent.trim())
                    .join(', ');
            }
            // Normalize slash separators into commas, for YAML array
            category = category.replace(/\s*\/\s*/g, ', ');
            // Publisher
            let publisher = '';
            const pubEl = doc.querySelector('.ContentInfo_value__04NMq a');
            if (pubEl) {
                publisher = pubEl.textContent.trim();
            }
            // Pages
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
            // 8. Default status
            const status = 'отложено';
            // 9. Import date and file name
            const importDate = new Date().toISOString().split('T')[0];
            const fileName = title.replace(/[:\\/\\?%*|"<>]/g, '').trim();
            // 10. Cover
            let cover = '';
            const coverEl = (_e = doc.querySelector('img.book-cover__image')) !== null && _e !== void 0 ? _e : doc.querySelector('img[src*="assets/books-covers/"]');
            if (coverEl) {
                cover = coverEl.getAttribute('src') || '';
                if (cover && cover.startsWith('//')) {
                    cover = 'https:' + cover;
                }
            }
            if (!cover) {
                const og = doc.querySelector('meta[property="og:image"]');
                if (og)
                    cover = og.getAttribute('content') || '';
            }
            // 11. Download cover locally
            let localCover = '';
            if (cover) {
                try {
                    let baseImagePath = `${this.settings.coverFolder}/${fileName}`;
                    let imagePath = `${baseImagePath}.jpg`;
                    let imageCounter = 1;
                    while (await this.app.vault.adapter.exists(imagePath)) {
                        imagePath = `${baseImagePath}_${imageCounter}.jpg`;
                        imageCounter++;
                    }
                    const imgResult = await obsidian.requestUrl({ url: cover, method: 'GET' });
                    const buffer = imgResult.arrayBuffer;
                    await this.app.vault.createBinary(imagePath, buffer);
                    localCover = imagePath;
                }
                catch { /* ignore */ }
            }
            // 12. Ensure unique file path
            const basePath = `${this.settings.notesFolder}/${fileName}`;
            let filePath = `${basePath}.md`;
            let counter = 1;
            while (this.app.vault.getAbstractFileByPath(filePath)) {
                filePath = `${basePath}_${counter}.md`;
                counter++;
            }
            // 13. Remove quotes from series
            series = series.replace(/['"]/g, '').trim();
            // 14. Use template if provided
            let content = '';
            if (this.settings.templatePath) {
                const tplFile = this.app.vault.getAbstractFileByPath(this.settings.templatePath);
                if (tplFile instanceof obsidian.TFile) {
                    let tpl = await this.app.vault.read(tplFile);
                    tpl = tpl
                        .replace(/\{\{date\}\}/g, importDate)
                        .replace(/\{\{title\}\}/g, title)
                        .replace(/\{\{author\}\}/g, author)
                        .replace(/\{\{cover\}\}/g, cover)
                        .replace(/\{\{localCover\}\}/g, localCover)
                        .replace(/\{\{description\}\}/g, description)
                        .replace(/\{\{category\}\}/g, category)
                        .replace(/\{\{series\}\}/g, series)
                        .replace(/\{\{series_number\}\}/g, series_number)
                        .replace(/\{\{pages\}\}/g, pages)
                        .replace(/\{\{publisher\}\}/g, publisher)
                        .replace(/\{\{status\}\}/g, status)
                        .replace(/\{\{source\}\}/g, url);
                    content = tpl;
                }
                else {
                    new obsidian.Notice(`🔴 Template not found: ${this.settings.templatePath}`);
                }
            }
            // 15. PublishDate
            let publishDate = ' ';
            if (!content) {
                content = `---
title: "${title}"
author: "${author}"
description: "${description}"
publisher: "${publisher}"
publishDate: ""
pages: "${pages}"
cover: "${cover}"
localCover: "${localCover}"
category: "${category}"
series: "[[${series}]]"
series_number: "${series_number}"
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
