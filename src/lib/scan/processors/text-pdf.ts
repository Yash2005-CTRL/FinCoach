import { createRequire } from "node:module";
import { ExtractionResult, StatementProcessor } from "./base";

const req = createRequire(import.meta.url);

export class TextPDFProcessor extends StatementProcessor {
  async extractText(buffer: Buffer): Promise<ExtractionResult> {
    try {
      const pdfModule = req("pdf-parse");
      const PDFParseClass = pdfModule.PDFParse ?? pdfModule.default?.PDFParse ?? pdfModule;

      if (!PDFParseClass) {
        throw new Error("PDF parser engine could not be initialized.");
      }


      const parser = new PDFParseClass({ data: buffer });
      await parser.load();
      const textResult = await parser.getText();

      const combinedText = typeof textResult === "string" 
        ? textResult 
        : textResult?.text ?? textResult?.pages?.map((p: { text?: string }) => p.text ?? "").join("\n") ?? "";

      const pagesCount = textResult?.total ?? textResult?.pages?.length ?? 1;

      return {
        text: combinedText,
        pagesCount,
        isOcr: false,
      };
    } catch (error: any) {
      const msg = String(error?.message ?? error?.name ?? error);
      if (/password/i.test(msg)) {
        throw new Error("This PDF statement is password-protected. Please remove the password and upload an unlocked statement.");
      }
      if (/format|invalid|corrupt/i.test(msg)) {
        throw new Error("The uploaded file appears to be a damaged or invalid PDF document.");
      }
      throw error;
    }
  }
}
