export type ExtractionResult = {
  text: string;
  pagesCount: number;
  isOcr: boolean;
  metadata?: Record<string, unknown>;
};

export abstract class StatementProcessor {
  abstract extractText(buffer: Buffer, originalName?: string): Promise<ExtractionResult>;
}
