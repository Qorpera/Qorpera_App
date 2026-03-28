import { describe, test, expect } from "vitest";
import { HARDCODED_TYPE_DEFS } from "@/lib/hardcoded-type-defs";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/connectors/registry";

describe("Connector infrastructure: new entity types", () => {
  test("sales-order type exists with correct properties", () => {
    const t = HARDCODED_TYPE_DEFS["sales-order"];
    expect(t).toBeDefined();
    expect(t.slug).toBe("sales-order");
    const slugs = t.properties.map(p => p.slug);
    expect(slugs).toContain("order-number");
    expect(slugs).toContain("amount");
    expect(slugs).toContain("status");
  });

  test("purchase-order type exists with correct properties", () => {
    const t = HARDCODED_TYPE_DEFS["purchase-order"];
    expect(t).toBeDefined();
    expect(t.slug).toBe("purchase-order");
    const slugs = t.properties.map(p => p.slug);
    expect(slugs).toContain("supplier");
    expect(slugs).toContain("expected-delivery");
  });

  test("shipment type exists with correct properties", () => {
    const t = HARDCODED_TYPE_DEFS["shipment"];
    expect(t).toBeDefined();
    const slugs = t.properties.map(p => p.slug);
    expect(slugs).toContain("tracking-number");
    expect(slugs).toContain("carrier");
    expect(slugs).toContain("eta");
    expect(slugs).toContain("mode");
  });

  test("container type exists with correct properties", () => {
    const t = HARDCODED_TYPE_DEFS["container"];
    expect(t).toBeDefined();
    const slugs = t.properties.map(p => p.slug);
    expect(slugs).toContain("number");
    expect(slugs).toContain("seal-number");
    expect(slugs).toContain("size");
  });
});

describe("Connector infrastructure: new categories", () => {
  test("erp and logistics categories exist", () => {
    expect(CATEGORY_LABELS.erp).toBe("ERP");
    expect(CATEGORY_LABELS.logistics).toBe("Logistics");
  });

  test("category order includes new categories", () => {
    expect(CATEGORY_ORDER).toContain("erp");
    expect(CATEGORY_ORDER).toContain("logistics");
    // erp should come after finance
    const financeIdx = CATEGORY_ORDER.indexOf("finance");
    const erpIdx = CATEGORY_ORDER.indexOf("erp");
    expect(erpIdx).toBeGreaterThan(financeIdx);
  });
});
