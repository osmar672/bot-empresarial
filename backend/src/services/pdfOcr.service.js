import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createWorker } from "tesseract.js";
import spa from "@tesseract.js-data/spa";
import eng from "@tesseract.js-data/eng";
import { getDocumentProxy, renderPageAsImage } from "unpdf";
import { env } from "../config/env.js";
// Language data ships with npm: documents and images never leave this server.
async function languages() {
  const target = path.join(env.backendDir, "cache", "ocr", "languages");
  await fs.mkdir(target, { recursive: true });
  for (const language of [spa, eng]) {
    const source = path.join(
        language.langPath,
        language.code + ".traineddata.gz",
      ),
      destination = path.join(target, language.code + ".traineddata.gz");
    const size = (await fs.stat(source)).size;
    if ((await fs.stat(destination).catch(() => null))?.size === size) continue;
    const temp = destination + "." + randomUUID();
    try {
      await fs.copyFile(source, temp);
      await fs.rename(temp, destination);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  return target;
}
export async function extractPdf(buffer, { onProgress, onMetadata } = {}) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer), {
    maxImageSize: 16777216,
  });
  let worker = null,
    ocrPages = 0,
    confidence = 0;
  const texts = [];
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        let text = content.items
          .map((item) => (item.str || "") + (item.hasEOL ? "\n" : " "))
          .join("")
          .trim();
        if (text.replace(/\s/g, "").length < 40) {
          if (!worker)
            worker = await createWorker(["spa", "eng"], 1, {
              langPath: await languages(),
              cachePath: path.join(env.backendDir, "cache", "ocr"),
              gzip: true,
            });
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.min(
            2.5,
            1800 / viewport.width,
            2400 / viewport.height,
          );
          const png = await renderPageAsImage(pdf, number, {
            canvasImport: () => import("@napi-rs/canvas"),
            scale,
          });
          const result = await worker.recognize(Buffer.from(png));
          text = result.data.text.trim() || text;
          ocrPages++;
          confidence += result.data.confidence;
        }
        texts.push(text);
        await onProgress?.({ page: number, total: pdf.numPages, ocrPages });
      } finally {
        page.cleanup();
      }
    }
    await onMetadata?.({
      method:
        ocrPages === 0 ? "text" : ocrPages === pdf.numPages ? "ocr" : "mixed",
      pages: pdf.numPages,
      ocrPages,
      confidence: ocrPages
        ? Math.round((confidence / ocrPages) * 100) / 100
        : null,
    });
    return texts.join("\n\n");
  } finally {
    await worker?.terminate();
    await pdf.loadingTask.destroy();
  }
}
