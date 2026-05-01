import * as pdfjsLib from 'pdfjs-dist'

// Point the worker at the pre-built worker bundle via Vite's asset URL resolution.
// This runs in the Electron renderer (Chromium) so DOM APIs are available.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Extract plain text from a PDF File object.
 * Returns the concatenated text of all pages, with pages separated by a blank line.
 */
export async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer, useWorkerFetch: false, isEvalSupported: false })
  const pdf = await loadingTask.promise

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/ {2,}/g, ' ')
      .trim()
    if (pageText) pageTexts.push(pageText)
  }

  return pageTexts.join('\n\n')
}
