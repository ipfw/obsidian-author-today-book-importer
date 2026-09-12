export interface ImporterSettings {
  notesFolder: string;
  templatePath: string;
  coverFolder: string;
  authorTodayCookie: string;
  authorTodayUserAgent: string;
}

export interface BookNoteInput {
  url: string;
  title: string;
  author: string;
  published: string;
  category: string;
  series: string;
  series_number: string;
  pages: string;
  status: string;
  publisher: string;
  coverURL: string;
  description: string;
  importDate: string;
  source: string;
  isYandex: boolean;
}
