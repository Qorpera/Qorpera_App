import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { callLLM, streamLLM } from "@/lib/ai-provider";
import type { LLMRequestOptions } from "@/lib/ai-provider";
import { verifyRequest } from "./auth";

const WORKER_SECRET = process.env.WORKER_SECRET || "";
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB

// ── Body parsing ─────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleLLMCall(body: string, res: ServerResponse) {
  const options: LLMRequestOptions = JSON.parse(body);
  const result = await callLLM(options);
  json(res, 200, result);
}

async function handleLLMStream(body: string, res: ServerResponse) {
  const options: LLMRequestOptions = JSON.parse(body);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    for await (const chunk of streamLLM(options)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[http] stream error:", message);
    res.write(`event: error\ndata: ${JSON.stringify({ error: "LLM call failed" })}\n\n`);
  }
  res.end();
}

function handleHealth(res: ServerResponse) {
  json(res, 200, { ok: true, uptime: process.uptime() });
}

// ── Server ───────────────────────────────────────────────────────────────────

export function createHttpServer() {
  const server = createServer(async (req, res) => {
    const url = req.url || "";
    const method = req.method || "";

    // Health check — no auth required
    if (method === "GET" && url === "/health") {
      return handleHealth(res);
    }

    // All other routes require POST + HMAC auth
    if (method !== "POST") {
      return json(res, 405, { error: "Method not allowed" });
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: "Failed to read request body" });
    }

    // HMAC verification — fail-closed
    if (!WORKER_SECRET) {
      return json(res, 500, { error: "Worker secret not configured" });
    }
    const timestamp = req.headers["x-worker-timestamp"] as string | undefined;
    const signature = req.headers["x-worker-signature"] as string | undefined;
    if (!verifyRequest(timestamp, signature, body, WORKER_SECRET)) {
      return json(res, 401, { error: "Invalid signature" });
    }

    try {
      if (url === "/llm/call") {
        await handleLLMCall(body, res);
      } else if (url === "/llm/stream") {
        await handleLLMStream(body, res);
      } else {
        json(res, 404, { error: "Not found" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[http] ${url} error:`, message);
      if (!res.headersSent) {
        json(res, 500, { error: "Internal worker error" });
      }
    }
  });

  return server;
}
