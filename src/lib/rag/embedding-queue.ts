/**
 * Batch embedding queue.
 * Accumulates document IDs and flushes when batch is full or timeout expires.
 * Prevents N separate embedding API calls when N documents are uploaded simultaneously.
 */

import { processDocument } from "./pipeline";

const queue: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let processing = false;

const BATCH_SIZE = 5;
const FLUSH_MS = 5000;

export function enqueueDocument(documentId: string): void {
  queue.push(documentId);

  if (queue.length >= BATCH_SIZE) {
    flushQueue();
  } else if (!flushTimer) {
    flushTimer = setTimeout(flushQueue, FLUSH_MS);
  }
}

async function flushQueue(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (processing || queue.length === 0) return;
  processing = true;

  const batch = queue.splice(0, BATCH_SIZE);

  try {
    for (const docId of batch) {
      try {
        await processDocument(docId);
      } catch (err) {
        console.error(`[embedding-queue] Failed to process ${docId}:`, err);
      }
    }
  } finally {
    processing = false;
    if (queue.length > 0) {
      flushQueue();
    }
  }
}
