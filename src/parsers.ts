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

function getMetaContent(doc: Document, property: string): string {
  return doc.querySelector(`meta[property="${property}"], meta[name="${property}"]`)
    ?.getAttribute('content') || '';
}

function decodeNextFlightPayload(doc: Document): string {
  const chunks: string[] = [];
  const marker = 'self.__next_f.push([1,';

  for (const script of Array.from(doc.querySelectorAll('script'))) {
    const source = script.textContent || '';
    let searchFrom = 0;

    while (searchFrom < source.length) {
      const markerIndex = source.indexOf(marker, searchFrom);
      if (markerIndex < 0) break;

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
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          valueEnd = i;
          break;
        }
      }

      if (valueEnd < 0) break;

      try {
        const decoded = JSON.parse(source.slice(valueStart, valueEnd + 1));
        if (typeof decoded === 'string') chunks.push(decoded);
      } catch (error) {
        console.warn('Failed to decode LitRes data chunk', error);
      }
      searchFrom = valueEnd + 1;
    }
  }

  return chunks.join('\n');
}

function extractJsonObjects(payload: string, propertyName: string): any[] {
  const results: any[] = [];
  const marker = `"${propertyName}":`;
  let searchFrom = 0;

  while (searchFrom < payload.length) {
    const markerIndex = payload.indexOf(marker, searchFrom);
    if (markerIndex < 0) break;

    let objectStart = markerIndex + marker.length;
    while (/\s/.test(payload[objectStart] || '')) objectStart++;
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
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          objectEnd = i;
          break;
        }
      }
    }

    if (objectEnd < 0) break;

    try {
      results.push(JSON.parse(payload.slice(objectStart, objectEnd + 1)));
    } catch (error) {
      console.warn(`Failed to parse LitRes ${propertyName}`, error);
    }
    searchFrom = objectEnd + 1;
  }

  return results;
}

function stripHtml(doc: Document, html: string): string {
  if (!html) return '';
  const wrapper = doc.createElement('div');
  wrapper.innerHTML = html;
  return (wrapper.textContent || '').replace(/\s+/g, ' ').trim();
}

function normalizeDate(value: unknown): string {
  if (!value) return '';
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : text;
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
  const publisherEl = doc.querySelector(
    '[itemprop="publisher"] [itemprop="name"], meta[itemprop="publisher"], [itemprop="publisher"]'
  );
  const publisherFromPage = publisherEl
    ? (publisherEl.getAttribute('content') || publisherEl.textContent || '').trim()
    : '';
  const publisher = normalizeTitle(publisherFromPage) || 'АТ';
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
  let pages = '';
  const infoDivs = Array.from(doc.querySelectorAll('div[data-test-id="CONTENT_INFO"]'));
  for (const div of infoDivs) {
    const label = div.querySelector(
      'span.ContentInfo_label__uGu8H, span[class*="ContentInfo_label"]'
    );
    const valueEl = div.querySelector(
      'span.ContentInfo_value__04NMq, span[class*="ContentInfo_value"]'
    );
    const labelText = label?.textContent.trim() || '';
    const valueText = valueEl?.textContent.trim() || '';

    if (labelText === 'Бумажных страниц:') {
      pages = valueText;
    } else if (/^Издатель(?:ство)?\s*:?$/i.test(labelText)) {
      publisher = valueText;
    }
  }
  publisher = normalizeTitle(publisher) || 'Яндекс';

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

export function parseLitresBook(doc: Document, url: string): BookNoteInput {
  const importDate = getImportDate();
  const artIdMatch = url.match(/-(\d+)\/?(?:[?#].*)?$/);
  const artId = artIdMatch ? Number(artIdMatch[1]) : 0;
  const payload = decodeNextFlightPayload(doc);
  const initialArts = extractJsonObjects(payload, 'initialArt');
  const art = initialArts.find(item => Number(item?.id) === artId)
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

  const title = normalizeTitle(art?.title || fallbackTitle);
  const authors = Array.isArray(art?.persons)
    ? art.persons
      .filter((person: any) => person && person.role === 'author')
      .map((person: any) => person.full_name)
      .filter(Boolean)
    : [];
  const author = normalizeTitle(authors.join(', ') || fallbackAuthor);

  const genres = Array.isArray(art?.genres)
    ? art.genres.map((item: any) => item?.name).filter(Boolean)
    : [];
  const genre = normalizeGenre(genres.join(', '));

  const bookSeries = Array.isArray(art?.series) ? art.series[0] : null;
  const series = normalizeSeries(bookSeries?.name || '');
  const series_number = bookSeries?.art_order == null
    ? ''
    : String(bookSeries.art_order);

  const pagesValue = art?.art_type === 1
    ? ''
    : art?.additional_info?.current_pages_or_seconds ?? '';
  const pages = pagesValue === '' ? '' : String(pagesValue);
  const published = normalizeDate(
    art?.first_time_sale_at || art?.publication_date || art?.date_written_at
  );

  const publisherValue = art?.publisher?.name
    || (typeof art?.publisher === 'string' ? art.publisher : '')
    || '';
  const publisher = normalizeTitle(publisherValue) || 'Литрес';

  let coverURL = getMetaContent(doc, 'og:image').trim();
  if (!coverURL && art?.cover_url) {
    try {
      coverURL = new URL(art.cover_url, 'https://cdn.litres.ru').href;
    } catch {
      coverURL = art.cover_url;
    }
  }

  const annotation = art?.html_annotation
    || art?.original_html_annotation
    || art?.html_annotation_litres
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
