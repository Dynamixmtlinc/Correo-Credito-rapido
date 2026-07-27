/**
 * `pdfjs-dist` no publica tipos para su worker (solo para `pdf.mjs`). Se declara como
 * módulo sin forma porque nunca se usa su API: solo se carga para dejarlo en
 * `globalThis.pdfjsWorker` (ver `src/lib/certificat-parser.ts`).
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
