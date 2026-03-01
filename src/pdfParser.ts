import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PageData {
  page: number;
  lines: string[];
}

export async function extractPages(file: File): Promise<PageData[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: PageData[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");
    // Split into lines; collapse blank lines
    const lines = pageText
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    pages.push({ page: i, lines });
  }

  return pages;
}
