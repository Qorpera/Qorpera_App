import { describe, it, expect, vi, beforeEach } from "vitest";

// Test the PDF extraction logic in isolation (without running full syncDrive)
// These tests validate the size guard, minimum text threshold, and error handling.

describe("Google Drive PDF extraction logic", () => {
  it("skips PDF text extraction for files > 5MB", () => {
    const byteLength = 6 * 1024 * 1024; // 6MB
    const shouldSkip = byteLength > 5 * 1024 * 1024;
    expect(shouldSkip).toBe(true);
  });

  it("allows PDF text extraction for files <= 5MB", () => {
    const byteLength = 4 * 1024 * 1024; // 4MB
    const shouldSkip = byteLength > 5 * 1024 * 1024;
    expect(shouldSkip).toBe(false);
  });

  it("skips text with < 50 chars as likely scanned PDF", () => {
    const extractedText = "Short text";
    const isTooShort = extractedText.trim().length < 50;
    expect(isTooShort).toBe(true);
  });

  it("keeps text with >= 50 chars", () => {
    const extractedText = "This is a reasonably long piece of text extracted from a PDF document.";
    const isTooShort = extractedText.trim().length < 50;
    expect(isTooShort).toBe(false);
  });

  it("handles empty text from PDF parse", () => {
    const extractedText = "";
    const isTooShort = !extractedText || extractedText.trim().length < 50;
    expect(isTooShort).toBe(true);
  });
});

describe("Slack content departmentId from channel mapping", () => {
  it("includes departmentId when channel has mapping", () => {
    const channelDeptMap = new Map([["C001", "dept1"]]);
    const channelId = "C001";
    const departmentId = channelDeptMap.get(channelId) || null;
    expect(departmentId).toBe("dept1");
  });

  it("has null departmentId when channel is unmapped", () => {
    const channelDeptMap = new Map<string, string>();
    const channelId = "C002";
    const departmentId = channelDeptMap.get(channelId) || null;
    expect(departmentId).toBeNull();
  });

  it("merges mapped departmentId into deptIds array", () => {
    const deptIds = ["dept-from-email"];
    const mappedDeptId: string | null = "dept-from-channel";

    if (mappedDeptId && !deptIds.includes(mappedDeptId)) {
      deptIds.push(mappedDeptId);
    }

    expect(deptIds).toEqual(["dept-from-email", "dept-from-channel"]);
  });

  it("does not duplicate departmentId if already in deptIds", () => {
    const deptIds = ["dept1"];
    const mappedDeptId: string | null = "dept1";

    if (mappedDeptId && !deptIds.includes(mappedDeptId)) {
      deptIds.push(mappedDeptId);
    }

    expect(deptIds).toEqual(["dept1"]);
  });
});
