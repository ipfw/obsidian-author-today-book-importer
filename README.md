# obsidian-author-today-book-importer

An Obsidian plugin to import book metadata from Author.Today into Markdown note

# Author.Today Book Importer

**Import book metadata from Author.Today directly into Obsidian.**

This plugin:

- **Fetches** title, author, cover image, description, publication date, genres, series name & number, and estimated page count from a given Author.Today URL.  
- **Bypasses CORS** using Obsidian’s built-in `requestUrl` API.  
- **Creates** a new note in a folder of your choice, with frontmatter fields and body templated by you.  
- **Supports** Mustache-style placeholders:
  - `{{title}}`, `{{author}}`, `{{cover}}`, `{{description}}`, `{{source}}`  
  - `{{date}}` (import date), `{{publishDate}}`, `{{category}}`, `{{series}}`, `{{series_number}}`, `{{pages}}`  
- **Configurable** via plugin settings:
  - Vault folder for new notes  
  - Relative path to your custom note template  

---

## Installation

1. Clone this repo into your Vault’s `.obsidian/plugins/author-today-importer` folder  
2. Build with `npm install && npm run build` to generate `main.js`  
3. Enable the plugin in Obsidian’s **Community Plugins** settings  
4. Run **“Import Book from Author.Today”** from the command palette and enter a URL

## The plugin provides the following placeholders for your template

- `{{title}}` — the book title
- `{{author}}` — the author(s)
- `{{cover}}` — the cover image URL (OG-image)
- `{{description}}` — the description from the meta tag
- `{{source}}` — the original page URL
- `{{date}}` — the import date (YYYY-MM-DD)
- `{{publishDate}}` — the publication date (extracted from the `data-time` span)
- `{{category}}` — the genres (text from `div.book-genres`)
- `{{series}}` — the series name (without brackets; wrap in `[[…]]` in your template)
- `{{series_number}}` — the number in the series
- `{{pages}}` — an estimated page count (character count ÷ 2000, rounded up)
