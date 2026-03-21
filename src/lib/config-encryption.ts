import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { decrypt as legacyDecrypt } from "./encryption";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKeyBuffer(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY; // 32-byte hex string
  if (!key) return null;
  return Buffer.from(key, "hex");
}

export function encryptConfig(plainConfig: Record<string, unknown>): string {
  const key = getKeyBuffer();
  if (!key) {
    // No ENCRYPTION_KEY — development mode, store as plain JSON
    return JSON.stringify(plainConfig);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(plainConfig);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // iv (16) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return "enc:v1:" + combined.toString("base64");
}

export function decryptConfig(
  stored: string | Record<string, unknown>
): Record<string, unknown> {
  // Case 1: already an object (unencrypted legacy)
  if (typeof stored === "object" && stored !== null) {
    return stored;
  }

  if (typeof stored !== "string") {
    return {};
  }

  // Case 2: encrypted with enc:v1: prefix
  if (stored.startsWith("enc:v1:")) {
    try {
      const key = getKeyBuffer();
      if (!key) {
        console.warn(
          "[config-encryption] Encrypted config found but no ENCRYPTION_KEY set"
        );
        return {};
      }

      const combined = Buffer.from(stored.slice("enc:v1:".length), "base64");
      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
      const ciphertext = combined.subarray(IV_LENGTH + TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      const decrypted =
        decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");
      return JSON.parse(decrypted);
    } catch (err) {
      console.warn("[config-encryption] Failed to decrypt config:", err);
      return {};
    }
  }

  // Case 3: legacy — plain JSON string or old encrypted format
  try {
    const parsed = JSON.parse(stored);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed;
    }
    return {};
  } catch {
    // Not valid JSON — may be old encryption format, try legacy decrypt
    try {
      const decrypted = legacyDecrypt(stored);
      const parsed = JSON.parse(decrypted);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed;
      }
      return {};
    } catch {
      console.warn(
        "[config-encryption] Could not parse config — returning empty"
      );
      return {};
    }
  }
}
