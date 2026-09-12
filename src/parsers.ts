import { BookNoteInput } from './types';

export function normalizeTitle(value: string): string {
  return value.replace(/['":]/g, '').trim();
}

export function normalizeSeries(value: string): string {
  return value
    .replace(/['":\/|!?]/g, '')
    .replace(/[^\p{L}\p{N}\s\-\(\)]/gu, '')
    .trim();
}

export function normalizeGenre(value: string): string {
  return value.replace(/\s*\/\s*/g, ', ').replace(/[\r\n]+/g, ', ').trim();
}

export function getImportDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function parseAuthorTodayBook(doc: Document, url: string): BookNoteInput {
  const importDate = getImportDate();

  const titleEl = doc.querySelector('h1.book-title[itemprop="name"]');
  const fallbackTitleEl = doc.querySelector('h1.work-page__title');
  let title = titleEl?.textContent?.trim() || fallbackTitleEl?.textContent?.trim() || '';

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
  author = normalizeTitle(author);
  title = normalizeTitle(title);

  let published = '';
  const dateEl = Array.from(doc.querySelectorAll('span.hint-top'))
    .find(el => el.getAttribute('data-time'));
  if (dateEl) {
    published = dateEl.getAttribute('data-time')?.split('T')[0] || '';
  }

  let genre = '';
  const genreDiv = doc.querySelector('div.book-genres');
  if (genreDiv) genre = genreDiv.textContent.trim();
  genre = normalizeGenre(genre);

  let series = '';
  let series_number = '';
  const cycleLabel = Array.from(doc.querySelectorAll('span.text-muted'))
    .find(el => el.textContent.trim().startsWith('Цикл'));
  if (cycleLabel) {
    const container = cycleLabel.parentElement as HTMLElement | null;
    const linkEl = container?.querySelector('a') as HTMLAnchorElement | null;
    if (linkEl) {
      series = linkEl.textContent.trim().replace(/['"]/g, '');
      let numMatch = (linkEl.nextElementSibling as HTMLElement | null)?.textContent?.match(/#\s*(\d+)/);
      if (!numMatch && container?.textContent) {
        numMatch = container.textContent.match(/#\s*(\d+)/);
      }
      if (numMatch) series_number = numMatch[1];
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
  const coverURL = coverMeta?.getAttribute('content')
    || doc.querySelector('img.work-cover__image')?.getAttribute('src')
    || '';
  const description = doc.querySelector('meta[property="og:description"]')
    ?.getAttribute('content') || '';

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

export function parseYandexBook(doc: Document, url: string): BookNoteInput {
  const importDate = getImportDate();

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
    } else {
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
    if (label?.textContent.trim() === 'Бумажных страниц:') {
      const valueEl = div.querySelector('span.ContentInfo_value__04NMq');
      if (valueEl) {
        pages = valueEl.textContent.trim();
      }
      break;
    }
  }

  const status = 'отложено';

  let coverURL = '';
  const coverEl = doc.querySelector('img.book-cover__image')
    ?? doc.querySelector('img[src*="assets/books-covers/"]');
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
