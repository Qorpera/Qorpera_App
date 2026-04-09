/**
 * Source text extraction and structural chunking.
 *
 * Converts uploaded files into raw text, then splits into structural
 * sections (chapters, headings) stored as SourceSection records.
 *
 * For markdown-based sources: splits on ## headers.
 * For books/PDFs: uses Haiku to detect chapter structure.
 */

import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/file-storage";
import { callLLM, getModel } from "@/lib/ai-provider";
import { extractJSONArray } from "@/lib/json-helpers";

// ─── Raw Text Extraction ────────────────────────────────

export async function extractRawText(fileUploadId: string): Promise<string> {
  const file = await prisma.fileUpload.findUniqueOrThrow({
    where: { id: fileUploadId },
    select: { storageKey: true, mimeType: true, filename: true },
  });

  const storage = getStorageProvider();
  const buffer = await storage.getBuffer(file.storageKey);

  switch (file.mimeType) {
    case "application/pdf": {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer, verbosity: 0 }) as any;
      await parser.load();
      const result = await parser.getText();
      return typeof result === "string" ? result : result?.text ?? "";
    }
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf-8");
    default:
      // Attempt UTF-8 read as fallback
      return buffer.toString("utf-8");
  }
}

// ─── Section Extraction ─────────────────────────────────

export async function extractSections(params: {
  sourceId: string;
  rawText: string;
  sourceType: string;
}): Promise<void> {
  const { sourceId, rawText, sourceType } = params;

  // Delete existing sections (idempotent re-run)
  await prisma.sourceSection.deleteMany({ where: { sourceId } });

  const useLLMStructure = sourceType === "book" || sourceType === "standard" || sourceType === "regulation";
  const sections = useLLMStructure
    ? await detectBookStructure(rawText)
    : splitByHeaders(rawText);

  if (sections.length === 0) {
    // Fallback: treat entire text as one section
    sections.push({
      title: "Full Document",
      titleHierarchy: [],
      content: rawText,
      sectionType: "content",
    });
  }

  // Create SourceSection records
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const tokenCount = Math.ceil(s.content.length / 4);
    const contentHash = crypto.createHash("sha256").update(s.content).digest("hex");

    await prisma.sourceSection.create({
      data: {
        sourceId,
        sectionIndex: i,
        title: s.title,
        titleHierarchy: s.titleHierarchy,
        content: s.content,
        tokenCount,
        sectionType: s.sectionType,
        contentHash,
        status: "pending",
      },
    });
  }

  await prisma.sourceDocument.update({
    where: { id: sourceId },
    data: { sectionCount: sections.length },
  });
}

// ─── Markdown Header Splitting ──────────────────────────

interface RawSection {
  title: string;
  titleHierarchy: string[];
  content: string;
  sectionType: string;
}

function splitByHeaders(text: string): RawSection[] {
  const sections: RawSection[] = [];
  const lines = text.split("\n");
  let currentH1 = "";
  let currentTitle = "";
  let currentContent: string[] = [];
  let currentHierarchy: string[] = [];

  function flush() {
    if (currentContent.length > 0 && currentTitle) {
      const content = currentContent.join("\n").trim();
      if (content.length > 50) {
        sections.push({
          title: currentTitle,
          titleHierarchy: currentHierarchy,
          content,
          sectionType: "content",
        });
      }
    }
    currentContent = [];
  }

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    const h2Match = line.match(/^##\s+(.+)$/);

    if (h1Match) {
      flush();
      currentH1 = h1Match[1].trim();
      currentTitle = currentH1;
      currentHierarchy = [currentH1];
    } else if (h2Match) {
      flush();
      currentTitle = h2Match[1].trim();
      currentHierarchy = currentH1 ? [currentH1, currentTitle] : [currentTitle];
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections;
}

// ─── Book/PDF Structure Detection ───────────────────────

const MAX_TOKENS_PER_SECTION = 8000; // ~32,000 chars

async function detectBookStructure(text: string): Promise<RawSection[]> {
  // Take a representative sample for structure detection
  const head = text.slice(0, 8000);
  const totalChars = text.length;
  const samplePositions = [0.25, 0.5, 0.75].map(p => Math.floor(totalChars * p));
  const samples = samplePositions.map(pos => text.slice(pos, pos + 2000));

  const sampleContent = [
    `=== BEGINNING (chars 0-8000) ===\n${head}`,
    ...samples.map((s, i) => `=== SAMPLE AT ${Math.round(samplePositions[i] / totalChars * 100)}% ===\n${s}`),
  ].join("\n\n");

  const model = getModel("sourceStructureDetection");

  const response = await callLLM({
    instructions: `You are analyzing a book or long document to identify its chapter/section structure.

The document has ${totalChars} characters (~${Math.ceil(totalChars / 4)} tokens). You're seeing the beginning and samples from throughout.

Identify the chapter and section structure. Output a JSON array:
[
  {
    "title": "Chapter/section title",
    "titleHierarchy": ["Part Title", "Chapter Title"],
    "approximateStartPosition": 0,
    "sectionType": "content" | "preface" | "appendix" | "index" | "case_study" | "framework" | "data_table"
  }
]

Rules:
- Include all major divisions (parts, chapters, major sections)
- approximateStartPosition is the character index where this section begins
- If you can't determine exact positions, estimate based on the document proportion
- Include preface/introduction and appendices as separate sections
- Target 5-50 sections depending on document length
- Each section should be 2,000-8,000 tokens. If a chapter seems very long, note sub-sections.`,
    messages: [{ role: "user", content: sampleContent }],
    model,
    maxTokens: 4096,
  });

  const parsed = extractJSONArray(response.text) as Array<{
    title?: string;
    titleHierarchy?: string[];
    approximateStartPosition?: number;
    sectionType?: string;
  }> | null;

  if (!parsed || parsed.length === 0) {
    // Fallback: split by fixed character count
    return splitBySize(text);
  }

  // Sort by position
  const structures = parsed
    .filter(s => typeof s.title === "string" && typeof s.approximateStartPosition === "number")
    .sort((a, b) => (a.approximateStartPosition ?? 0) - (b.approximateStartPosition ?? 0));

  const sections: RawSection[] = [];
  for (let i = 0; i < structures.length; i++) {
    const start = structures[i].approximateStartPosition ?? 0;
    const end = i + 1 < structures.length
      ? (structures[i + 1].approximateStartPosition ?? text.length)
      : text.length;

    let content = text.slice(start, end).trim();

    // If section is too large, split it further
    if (content.length > MAX_TOKENS_PER_SECTION * 4) {
      const subSections = splitBySize(content, structures[i].title ?? `Section ${i + 1}`);
      sections.push(...subSections);
    } else if (content.length > 50) {
      sections.push({
        title: structures[i].title ?? `Section ${i + 1}`,
        titleHierarchy: Array.isArray(structures[i].titleHierarchy) ? structures[i].titleHierarchy as string[] : [],
        content,
        sectionType: structures[i].sectionType ?? "content",
      });
    }
  }

  return sections;
}

function splitBySize(text: string, parentTitle?: string): RawSection[] {
  const CHUNK_SIZE = MAX_TOKENS_PER_SECTION * 4; // chars
  const sections: RawSection[] = [];

  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    const content = text.slice(i, i + CHUNK_SIZE).trim();
    if (content.length < 50) continue;

    const partNum = sections.length + 1;
    sections.push({
      title: parentTitle ? `${parentTitle} — Part ${partNum}` : `Part ${partNum}`,
      titleHierarchy: parentTitle ? [parentTitle] : [],
      content,
      sectionType: "content",
    });
  }

  return sections;
}
