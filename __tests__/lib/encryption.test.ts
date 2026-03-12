import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt, isEncrypted } from "@/lib/encryption";

beforeAll(() => {
  // Set test encryption secret if not present
  if (!process.env.ENCRYPTION_SECRET) {
    process.env.ENCRYPTION_SECRET = "test-secret-for-vitest-only-do-not-use-in-production";
  }
});

describe("encryption", () => {
  describe("encrypt / decrypt roundtrip", () => {
    it("encrypts and decrypts a simple string", () => {
      const plaintext = "hello world";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("encrypts and decrypts JSON config (OAuth token pattern)", () => {
      const config = JSON.stringify({
        access_token: "xoxb-fake-token-12345",
        refresh_token: "refresh-abc-789",
        expires_at: Date.now() + 3600000,
      });
      const encrypted = encrypt(config);
      const decrypted = decrypt(encrypted);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(config));
    });

    it("encrypts and decrypts empty string", () => {
      const encrypted = encrypt("");
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe("");
    });

    it("encrypts and decrypts unicode text", () => {
      const plaintext = "Qorpera — Dánsk virksomhéd 🇩🇰";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("produces different ciphertext for same plaintext (random IV)", () => {
      const plaintext = "same input";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
      // But both decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });
  });

  describe("isEncrypted", () => {
    it("detects encrypted format (iv:tag:data)", () => {
      const encrypted = encrypt("test");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("rejects plaintext strings", () => {
      expect(isEncrypted("just a plain string")).toBe(false);
      expect(isEncrypted("hello:world")).toBe(false);
      expect(isEncrypted("")).toBe(false);
    });

    it("rejects JSON strings (pre-encryption connector config)", () => {
      const json = JSON.stringify({ access_token: "abc123" });
      expect(isEncrypted(json)).toBe(false);
    });
  });

  describe("decrypt plaintext fallback", () => {
    it("returns plaintext as-is when not encrypted", () => {
      const plaintext = '{"access_token":"old-unencrypted-token"}';
      const result = decrypt(plaintext);
      expect(result).toBe(plaintext);
    });
  });

  describe("encrypted format structure", () => {
    it("produces iv:tag:ciphertext format with three base64 parts", () => {
      const encrypted = encrypt("test data");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);

      // Each part should be valid base64
      for (const part of parts) {
        expect(() => Buffer.from(part, "base64")).not.toThrow();
        expect(Buffer.from(part, "base64").length).toBeGreaterThan(0);
      }

      // IV should be 16 bytes
      const iv = Buffer.from(parts[0], "base64");
      expect(iv.length).toBe(16);

      // Auth tag should be 16 bytes
      const tag = Buffer.from(parts[1], "base64");
      expect(tag.length).toBe(16);
    });
  });

  describe("tamper detection", () => {
    it("throws on tampered ciphertext", () => {
      const encrypted = encrypt("sensitive data");
      const parts = encrypted.split(":");
      // Tamper with the ciphertext portion
      const tamperedData = Buffer.from(parts[2], "base64");
      tamperedData[0] ^= 0xff;
      parts[2] = tamperedData.toString("base64");
      const tampered = parts.join(":");

      expect(() => decrypt(tampered)).toThrow();
    });

    it("throws on tampered auth tag", () => {
      const encrypted = encrypt("sensitive data");
      const parts = encrypted.split(":");
      // Tamper with the auth tag
      const tamperedTag = Buffer.from(parts[1], "base64");
      tamperedTag[0] ^= 0xff;
      parts[1] = tamperedTag.toString("base64");
      const tampered = parts.join(":");

      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
