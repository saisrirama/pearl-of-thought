// Client-only PDF text extraction. pdfjs-dist references DOMMatrix (browser-only),
// so we lazy-import it inside the function to keep SSR safe.

export interface PageText {
  page: number;
  text: string;
}

export async function extractPdfPages(file: File): Promise<PageText[]> {
  const pdfjsLib = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: PageText[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: unknown) => (it && typeof it === "object" && "str" in it ? (it as { str: string }).str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ page: i, text });
  }
  return pages;
}

export interface Chunk {
  page: number;
  index: number;
  content: string;
}

export function chunkPages(pages: PageText[], size = 800, overlap = 100): Chunk[] {
  const chunks: Chunk[] = [];
  let idx = 0;
  for (const { page, text } of pages) {
    if (!text) continue;
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + size, text.length);
      if (end < text.length) {
        const slice = text.slice(start, end + 100);
        const m = slice.match(/[.!?]\s/g);
        if (m) {
          const lastIdx = slice.lastIndexOf(m[m.length - 1]);
          if (lastIdx > size * 0.5) end = start + lastIdx + 1;
        }
      }
      const content = text.slice(start, end).trim();
      if (content.length > 40) chunks.push({ page, index: idx++, content });
      if (end >= text.length) break;
      start = end - overlap;
    }
  }
  return chunks;
}
