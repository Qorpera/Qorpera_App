/**
 * Pluggable file storage backend.
 *
 * - "qorpera" / "s3": S3-compatible (Cloudflare R2 or AWS S3)
 * - "local": filesystem (dev / self-hosted)
 *
 * Auto-detect: if R2_ACCOUNT_ID or AWS_ACCESS_KEY_ID is set and
 * FILE_STORAGE_PROVIDER is not explicit, defaults to S3-compatible.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

// ── Interface ──────────────────────────────────────────────

export interface FileStorageProvider {
  upload(key: string, data: Buffer, mimeType: string): Promise<void>;
  getBuffer(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// ── S3-compatible (R2 / AWS S3) ────────────────────────────

class S3CompatibleProvider implements FileStorageProvider {
  private bucket: string;
  private clientPromise: ReturnType<typeof this.buildClient>;

  constructor() {
    this.bucket = process.env.R2_BUCKET_NAME || process.env.AWS_S3_BUCKET || "qorpera-uploads";
    this.clientPromise = this.buildClient();
  }

  private async buildClient() {
    const { S3Client } = await import("@aws-sdk/client-s3");

    const accountId = process.env.R2_ACCOUNT_ID;
    const endpoint = accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : process.env.AWS_S3_ENDPOINT || undefined;

    return new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
      },
      forcePathStyle: !!accountId, // R2 requires path-style
    });
  }

  async upload(key: string, data: Buffer, mimeType: string): Promise<void> {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: mimeType,
    }));
  }

  async getBuffer(key: string): Promise<Buffer> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    const resp = await client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
    const stream = resp.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const client = await this.clientPromise;
    return getSignedUrl(client, new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }), { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }
}

// ── Local filesystem ───────────────────────────────────────

class LocalStorageProvider implements FileStorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.FILE_UPLOAD_DIR || path.resolve("uploads");
  }

  async upload(key: string, data: Buffer): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async getBuffer(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.baseDir, key));
  }

  async getSignedUrl(key: string): Promise<string> {
    // Local provider returns an API download route — the fileId is extracted from the key
    // Key format: {operatorId}/uploads/{fileId}-{filename}
    const fileId = key.split("/uploads/")[1]?.split("-")[0];
    return `/api/files/${fileId}/download`;
  }

  async delete(key: string): Promise<void> {
    await fs.unlink(path.join(this.baseDir, key)).catch(() => {});
  }
}

// ── Connector stub (no file blob — text lives in extractedFullText) ───

class ConnectorStorageStub implements FileStorageProvider {
  async upload(): Promise<void> {
    throw new Error("Connector documents cannot be uploaded — content synced from external provider");
  }
  async getBuffer(): Promise<Buffer> {
    throw new Error("Connector documents have no file blob — use extractedFullText");
  }
  async getSignedUrl(): Promise<string> {
    throw new Error("Connector documents have no file blob — use extractedFullText");
  }
  async delete(): Promise<void> {
    // No-op — nothing to delete from storage
  }
}

// ── Factory ────────────────────────────────────────────────

export function getStorageProvider(provider?: string): FileStorageProvider {
  if (provider === "connector") {
    return new ConnectorStorageStub();
  }
  const explicit = process.env.FILE_STORAGE_PROVIDER;
  if (explicit === "qorpera" || explicit === "s3") {
    return new S3CompatibleProvider();
  }
  if (explicit === "local") {
    return new LocalStorageProvider();
  }
  // Auto-detect: S3 credentials present → use S3
  if (process.env.R2_ACCOUNT_ID || process.env.AWS_ACCESS_KEY_ID) {
    return new S3CompatibleProvider();
  }
  return new LocalStorageProvider();
}
