import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

describe("SuperadminBanner", () => {
  it("shows impersonated user name with arrow separator", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/components/app-shell.tsx"),
      "utf-8",
    );
    // Shows impersonated user
    expect(source).toContain("impersonatedUserName");
    expect(source).toContain("actingAsUser");
    // Arrow separator
    expect(source).toContain("→");
    // Stop impersonation button
    expect(source).toContain("stop-impersonation");
    expect(source).toContain("stopImpersonation");
  });
});

describe("Department page View as button", () => {
  it("has impersonation button for superadmin viewing member with account", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/app/map/[departmentId]/page.tsx"),
      "utf-8",
    );
    expect(source).toContain("impersonate-user");
    expect(source).toContain("entityUserIds");
    expect(source).toContain("viewAs");
  });
});
