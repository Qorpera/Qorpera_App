import { readFile } from "fs/promises";
import path from "path";

/** Resolve a document filePath (which may be relative) to an absolute path. */
export function resolveDocumentPath(filePath: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  const storageBase = process.env.DOCUMENT_STORAGE_PATH || "./uploads/documents";
  return path.join(storageBase, filePath);
}

/** Extract text content from a file based on its MIME type. */
export async function extractText(filePath: string, mimeType: string): Promise<string | null> {
  const buffer = await readFile(filePath);

  switch (mimeType) {
    case "text/plain":
    case "text/markdown":
    case "text/x-markdown":
      return buffer.toString("utf-8");

    case "text/csv": {
      const Papa = (await import("papaparse")).default;
      const text = buffer.toString("utf-8");
      const parsed = Papa.parse(text, { header: true });
      if (!parsed.data || parsed.data.length === 0) return text;
      const headers = parsed.meta.fields ?? [];
      const rows = (parsed.data as Record<string, string>[]).map((row, i) => {
        const fields = headers.map((h) => `${h}: ${row[h] ?? ""}`).join(", ");
        return `Record ${i + 1}: ${fields}`;
      });
      return `CSV with ${rows.length} records.\nHeaders: ${headers.join(", ")}\n\n${rows.join("\n")}`;
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.map(name => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        return `Sheet: ${name}\n${csv}`;
      });
      return sheets.join("\n\n");
    }

    case "application/pdf": {
      try {
        const { PDFParse } = await import("pdf-parse");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
        await parser.load();
        const result = await parser.getText();
        const text = typeof result === "string" ? result : result?.text;
        if (!text || text.trim().length < 10) return null;
        return text;
      } catch (err) {
        console.error("[text-extraction] PDF parse error:", err);
        return null;
      }
    }

    default:
      return null;
  }
}
