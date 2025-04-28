# obsidian-author-today-book-importer

An Obsidian plugin to import book metadata from Author.Today into Markdown note

## Для вашего шаблона плагин подставляет следующие плейсхолдеры

 • {{title}} — название книги
 • {{author}} — автор(ы)
 • {{cover}} — URL обложки (OG-image)
 • {{description}} — описание из мета-тега
 • {{source}} — исходный URL страницы
 • {{date}} — дата импорта (YYYY-MM-DD)
 • {{publishDate}} — дата публикации (из data-time span)
 • {{category}} — жанры (текст из div class="book-genres")
 • {{series}} — имя цикла (без скобок, оборачивается в шаблоне [[…]])
 • {{series_number}} — номер в цикле
 • {{pages}} — примерное число страниц (число знаков ÷ 2000, округл. вверх)
