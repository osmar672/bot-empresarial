import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { createCanvas } from "@napi-rs/canvas";
import { extractFile } from "../backend/src/services/extraction.service.js";
function makePdf({ scanned = true, native = false } = {}) {
  const doc = new PDFDocument({ size: "A4", margin: 40 }),
    parts = [];
  const done = new Promise((resolve, reject) => {
    doc.on("data", (p) => parts.push(p));
    doc.on("end", () => resolve(Buffer.concat(parts)));
    doc.on("error", reject);
  });
  if (scanned) {
    const canvas = createCanvas(1400, 800),
      cx = canvas.getContext("2d");
    cx.fillStyle = "white";
    cx.fillRect(0, 0, 1400, 800);
    cx.fillStyle = "black";
    cx.font = "44px sans-serif";
    cx.fillText("POLITICA DE VACACIONES", 80, 130);
    cx.fillText("Los colaboradores tienen quince dias libres.", 80, 240);
    cx.fillText("Recursos Humanos revisa cada solicitud.", 80, 350);
    doc.image(canvas.toBuffer("image/png"), 40, 60, { width: 510 });
  }
  if (native) {
    if (scanned) doc.addPage();
    doc.text(
      "La empresa documenta los horarios de trabajo y los permisos laborales. Recursos Humanos mantiene actualizado el saldo de vacaciones.",
    );
  }
  doc.end();
  return done;
}
let metadata;
const progress = [];
const text = await extractFile(
  await makePdf({ native: true }),
  "application/pdf",
  {
    onMetadata: (m) => {
      metadata = m;
    },
    onProgress: (p) => progress.push(p),
  },
);
assert.match(text, /vacaciones/i);
assert.match(text, /quince/i);
assert.match(text, /horarios de trabajo/);
assert.equal(metadata.method, "mixed");
assert.equal(metadata.pages, 2);
assert.equal(metadata.ocrPages, 1);
assert.equal(progress.length, 2);
assert.ok(metadata.confidence > 40);
await assert.rejects(() =>
  extractFile(Buffer.from("not a PDF"), "application/pdf"),
);
const native = await extractFile(
  await makePdf({ scanned: false, native: true }),
  "application/pdf",
  {
    onMetadata: (m) => {
      metadata = m;
    },
  },
);
assert.match(native, /horarios/);
assert.equal(metadata.ocrPages, 0);
console.log(
  "PASS: actual local OCR reads image-only Spanish PDF; hybrid pages keep native text, metadata/progress correct; invalid files rejected.",
);
