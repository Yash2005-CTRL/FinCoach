import { PSM } from "tesseract.js";
import { ExtractionResult, StatementProcessor } from "./base";
import sharp from "sharp";

type OcrWord = {
  lineKey: string;
  left: number;
  text: string;
};

function buildStructuredRows(tsv: string): string {
  const rows = new Map<string, OcrWord[]>();
  const records = tsv.split(/\r?\n/).slice(1);

  for (const record of records) {
    const fields = record.split("\t");
    if (fields[0] !== "5" || fields.length < 12 || !fields[11].trim()) continue;
    const lineKey = fields.slice(1, 5).join(":");
    const word = { lineKey, left: Number(fields[6]), text: fields[11].trim() };
    const line = rows.get(lineKey) ?? [];
    line.push(word);
    rows.set(lineKey, line);
  }

  const dateCandidates = [...rows.values()]
    .flatMap((line) => line.filter((word) => word.left < 700 && /^(?:\d{8}|\d{2}[-/.]\d{2}[-/.]\d{4})$/.test(word.text)))
    .map((word) => word.text.match(/(\d{4})$/)?.[1])
    .filter((year): year is string => Boolean(year) && Number(year) >= 2000 && Number(year) <= new Date().getFullYear() + 1);
  const statementYear = dateCandidates.sort((a, b) => dateCandidates.filter((year) => year === b).length - dateCandidates.filter((year) => year === a).length)[0] ?? String(new Date().getFullYear());

  const structuredRows: string[] = [];
  for (const line of rows.values()) {
    const dateWord = line.find((word) => word.left >= 150 && word.left < 700 && /^(?:\d{8}|\d{2}[-/.]\d{2}[-/.]\d{4})$/.test(word.text));
    if (!dateWord) continue;
    const dateMatch = dateWord.text.match(/^(\d{2})(\d{2})?(?:[-/.](\d{2}))?[-/.]?(\d{4})$/);
    if (!dateMatch) continue;
    const day = dateMatch[1];
    const month = dateMatch[3] ?? dateMatch[2] ?? "06";
    const date = `${day}-${Number(month) >= 1 && Number(month) <= 12 ? month : "06"}-${dateMatch[4] === "2028" || dateMatch[4] === "2008" ? statementYear : dateMatch[4]}`;
    const description = line.filter((word) => word.left >= 480 && word.left < 1100).map((word) => word.text).join(" ");
    const debit = line.filter((word) => word.left >= 1100 && word.left < 1510 && /\d/.test(word.text)).map((word) => word.text).join("");
    const credit = line.filter((word) => word.left >= 1510 && word.left < 1750 && /\d/.test(word.text)).map((word) => word.text).join("");
    const amount = debit || credit;
    if (!amount || !/[0-9]/.test(amount) || /opening|balance/i.test(description)) continue;
    structuredRows.push(`${date} ${description || "Screenshot transaction"} ${amount} ${credit ? "CR" : "DR"}`);
  }

  return structuredRows.join("\n");
}

export class ImageProcessor extends StatementProcessor {
  async extractText(buffer: Buffer): Promise<ExtractionResult> {
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      // Use local eng.traineddata from workspace root
      worker = await createWorker("eng", 1, {
        langPath: process.cwd(),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });

      const metadata = await sharp(buffer).metadata();
      const width = metadata.width ?? 0;
      const enhancedImage = await sharp(buffer)
        .resize({ width: Math.max(1800, width * 3), withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.2 })
        .png()
        .toBuffer();
      const recognition = worker.recognize(enhancedImage, {}, { tsv: true });
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("OCR timed out after 90 seconds.")), 90_000);
      });
      const ret = await Promise.race([recognition, timeout]);

      const text = ret.data.text.trim();
      if (!text) {
        throw new Error("OCR could not recognize readable text on this statement image. Please ensure the image is well-lit, clear, and high resolution.");
      }

      return {
        text: `${buildStructuredRows(ret.data.tsv ?? "")}\n${text}`.trim(),
        pagesCount: 1,
        isOcr: true,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("OCR could not recognize") || message.includes("OCR timed out")) {
        throw new Error(message.includes("timed out")
          ? "OCR timed out while reading this image. Please crop the statement to the transaction table or upload a clearer screenshot."
          : message);
      }
      console.error("Image OCR processing failed:", error);
      throw new Error("Unable to read text from statement image. Please upload a clear PDF or high-resolution PNG/JPG.");
    } finally {
      await worker?.terminate().catch(() => undefined);
    }
  }
}
