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
        contentEl.createEl('h2', { text: 'Enter Author.Today book URL' });
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
            // Download cover locally
            let localCover = '';
            if (cover) {
                try {
                    const imgResult = await obsidian.requestUrl({ url: cover, method: 'GET' });
                    // `arrayBuffer` is already a property, not a function
                    const buffer = imgResult.arrayBuffer;
                    const imageName = `${fileName}.jpg`;
                    const imagePath = `${this.settings.coverFolder}/${imageName}`;
                    await this.app.vault.createBinary(imagePath, new Uint8Array(buffer));
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
series_number: ${series_number}
pages: ${pages}
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
