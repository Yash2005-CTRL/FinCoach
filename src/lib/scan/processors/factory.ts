import { ExtractionResult, StatementProcessor } from "./base";
import { TextPDFProcessor } from "./text-pdf";
import { ImageProcessor } from "./image";

export class ScannedPDFProcessor extends StatementProcessor {
  async extractText(buffer: Buffer): Promise<ExtractionResult> {
    // Attempt text PDF extraction first
    const textProcessor = new TextPDFProcessor();
    const result = await textProcessor.extractText(buffer);

    // If reasonable text was extracted, return it
    if (result.text && result.text.trim().length >= 40) {
      return result;
    }

    // If text was sparse or empty, it's a scanned/image PDF
    throw new Error(
      "This appears to be a scanned or image-only PDF without embedded text. For best results, please upload the original digital e-statement downloaded from your bank netbanking portal."
    );
  }
}

export function getStatementProcessor(mimeType: string): StatementProcessor {
  if (mimeType === "application/pdf") {
    return new ScannedPDFProcessor();
  }
  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    return new ImageProcessor();
  }
  throw new Error(`Unsupported statement file format: ${mimeType}`);
}
