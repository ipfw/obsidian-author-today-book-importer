'use strict';

var obsidian = require('obsidian');

// Получаем текущую дату для {{date}}
const importDate = new Date().toISOString().split('T')[0];
const DEFAULT_SETTINGS = {
    notesFolder: 'Books',
    templatePath: ''
};
// Modal to prompt for URL input
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
            const result = await obsidian.requestUrl({ url });
            const html = result.text;
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            let title = ((_b = (_a = doc.querySelector('h1.work-page__title')) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '';
            if (!title) {
                const fullTitle = doc.title;
                title = ((_c = fullTitle.split(' - ')[0]) === null || _c === void 0 ? void 0 : _c.trim()) || 'Unknown Title';
            }
            let author = ((_e = (_d = doc.querySelector('.work-page__author a')) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) || '';
            if (!author) {
                const parts = doc.title.split(' - ');
                author = ((_f = parts[1]) === null || _f === void 0 ? void 0 : _f.trim()) || '';
            }
            // Получаем дату публикации из data-time
            let publishDate = '';
            const pubSpan = doc.querySelector('span.hint-top[data-format="calendar-short"]');
            if (pubSpan) {
                const dt = pubSpan.getAttribute('data-time');
                if (dt) {
                    publishDate = dt.split('T')[0]; // YYYY-MM-DD
                }
            }
            const cover = ((_g = doc.querySelector('meta[property="og:image"]')) === null || _g === void 0 ? void 0 : _g.getAttribute('content')) || '';
            const description = ((_h = doc.querySelector('meta[property="og:description"]')) === null || _h === void 0 ? void 0 : _h.getAttribute('content')) || '';
            // … после получения description …
            // Извлекаем жанры из <div class="book-genres">
            let category = '';
            const genreDiv = doc.querySelector('div.book-genres');
            if (genreDiv) {
                // textContent отдаст «Роман / Дорама, Попаданцы, Развитие личности»
                category = genreDiv.textContent.trim();
            }
            // === Извлекаем цикл и номер ===
            let series = '';
            let series_number = '';
            // Находим <span class="text-muted">Цикл:</span>
            const cycleLabel = Array.from(doc.querySelectorAll('span.text-muted'))
                .find(el => el.textContent.trim().startsWith('Цикл'));
            if (cycleLabel) {
                // следом идёт <a> с названием цикла
                const linkEl = cycleLabel.nextElementSibling;
                if (linkEl) {
                    series = linkEl.textContent.trim();
                    // а за ним <span>&nbsp;#7</span>
                    const numEl = linkEl.nextElementSibling;
                    const m = numEl === null || numEl === void 0 ? void 0 : numEl.textContent.match(/#(\d+)/);
                    if (m)
                        series_number = m[1];
                }
            }
            // === Извлекаем примерный объём страниц ===
            let pages = '';
            const charsSpan = doc.querySelector('span.hint-top[data-hint^="Размер"]');
            if (charsSpan) {
                // «390 842 зн.» → «390842»
                const raw = charsSpan.textContent.replace(/\D/g, '');
                const count = parseInt(raw, 10);
                pages = Math.ceil(count / 2000).toString();
            }
            const fileName = title
                .replace(/[^\p{L}\p{N}\s]/gu, '') // remove any non-letter, non-number, non-space
                .trim();
            // можно заменить пробелы .replace(/\s+/g, '_');
            const filePath = `${this.settings.notesFolder}/${fileName}.md`;
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
                        .replace(/\{\{description\}\}/g, description)
                        .replace(/\{\{category\}\}/g, category)
                        .replace(/\{\{series\}\}/g, series)
                        .replace(/\{\{series_number\}\}/g, series_number)
                        .replace(/\{\{pages\}\}/g, pages)
                        .replace(/\{\{source\}\}/g, url);
                    content = tpl;
                }
                else {
                    new obsidian.Notice(`🔴 Template not found: ${this.settings.templatePath}`);
                }
            }
            if (!content) {
                content = `---\ntitle: "${title}"\nauthor: "${author}"\ncover: "${cover}"\ncategory: "${category}"\npubpish: "${publishDate}"\nsource: "${url}"\nseries: "[[${series}]]"\nseries_nember: "${series_number}"\n
		pages: "${pages}"\n---\n### Аннотация\n\n${description}`;
            }
            await this.app.vault.create(filePath, content);
            new obsidian.Notice(`Imported "${title}"`);
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof obsidian.TFile) {
                this.app.workspace.getLeaf(true).openFile(file);
            }
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
    }
}

module.exports = AuthorTodayImporter;
//# sourceMappingURL=main.js.map
