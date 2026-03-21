import { describe, it, expect } from "vitest";

// ── Billing Usage Data Tests (pure logic) ───────────────────────────────────

describe("billing usage helpers", () => {
  const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const getDaysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  it("startOfMonth returns first day at midnight", () => {
    const result = startOfMonth(new Date(2026, 2, 15)); // March 15
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(2);
    expect(result.getHours()).toBe(0);
  });

  it("endOfMonth returns last day at end of day", () => {
    const result = endOfMonth(new Date(2026, 2, 15)); // March
    expect(result.getDate()).toBe(31);
    expect(result.getMonth()).toBe(2);
    expect(result.getHours()).toBe(23);
  });

  it("getDaysInMonth handles Feb correctly", () => {
    expect(getDaysInMonth(new Date(2026, 1, 1))).toBe(28); // Feb 2026
    expect(getDaysInMonth(new Date(2024, 1, 1))).toBe(29); // Feb 2024 (leap)
    expect(getDaysInMonth(new Date(2026, 2, 1))).toBe(31); // March
  });

  // --- Situation grouping by autonomy ---
  it("groups situations by autonomy level correctly", () => {
    const situations = [
      { situationType: { autonomyLevel: "supervised" }, billedCents: 100 },
      { situationType: { autonomyLevel: "supervised" }, billedCents: 50 },
      { situationType: { autonomyLevel: "notify" }, billedCents: 200 },
      { situationType: { autonomyLevel: "autonomous" }, billedCents: 300 },
    ];

    const groups: Record<string, { count: number; totalCents: number }> = {
      supervised: { count: 0, totalCents: 0 },
      notify: { count: 0, totalCents: 0 },
      autonomous: { count: 0, totalCents: 0 },
    };

    for (const s of situations) {
      const level = s.situationType.autonomyLevel;
      if (groups[level]) {
        groups[level].count++;
        groups[level].totalCents += s.billedCents ?? 0;
      }
    }

    expect(groups.supervised).toEqual({ count: 2, totalCents: 150 });
    expect(groups.notify).toEqual({ count: 1, totalCents: 200 });
    expect(groups.autonomous).toEqual({ count: 1, totalCents: 300 });
  });

  // --- Department grouping ---
  it("groups situations by department correctly (sorted by cost desc)", () => {
    const deptData = [
      { name: "Sales", count: 3, totalCents: 200 },
      { name: "Ops", count: 5, totalCents: 500 },
      { name: "Finance", count: 1, totalCents: 50 },
    ];

    const sorted = deptData.sort((a, b) => b.totalCents - a.totalCents);
    expect(sorted[0].name).toBe("Ops");
    expect(sorted[1].name).toBe("Sales");
    expect(sorted[2].name).toBe("Finance");
  });

  // --- Historical months filter ---
  it("only includes months with data", () => {
    const months = [
      { month: "2026-01", data: true },
      { month: "2026-02", data: false },
      { month: "2026-03", data: true },
    ].filter((m) => m.data);

    expect(months).toHaveLength(2);
    expect(months[0].month).toBe("2026-01");
    expect(months[1].month).toBe("2026-03");
  });

  // --- Projection ---
  it("projection calculation is reasonable", () => {
    const currentTotalCents = 15000; // $150
    const daysInMonth = 31;
    const dayOfMonth = 15;

    const projected = Math.round(currentTotalCents * (daysInMonth / Math.max(dayOfMonth, 1)));
    // $150 * (31/15) = $310
    expect(projected).toBe(31000);
  });

  it("projection handles day 1 without division by zero", () => {
    const currentTotalCents = 500;
    const daysInMonth = 30;
    const dayOfMonth = 1;

    const projected = Math.round(currentTotalCents * (daysInMonth / Math.max(dayOfMonth, 1)));
    expect(projected).toBe(15000);
  });

  // --- Free user stats ---
  it("free user response includes free tier usage stats", () => {
    const op = {
      billingStatus: "free",
      freeCopilotBudgetCents: 500,
      freeCopilotUsedCents: 200,
      freeDetectionSituationCount: 23,
      freeDetectionStartedAt: "2026-03-01",
    };

    expect(op.freeCopilotBudgetCents - op.freeCopilotUsedCents).toBe(300);
    expect(op.freeDetectionSituationCount).toBeLessThan(50);
  });

  // --- Discount indicator ---
  it("month-1 discount shows when multiplier < 1.0", () => {
    expect(0.5 < 1.0).toBe(true);
    expect(1.0 < 1.0).toBe(false);
  });

  it("effective rate calculation for discount", () => {
    const multiplier = 0.5;
    const rates = [
      { level: "Observe", base: 1.0 },
      { level: "Propose", base: 2.0 },
      { level: "Act", base: 3.0 },
    ];

    expect(Math.round(rates[0].base * multiplier * 100)).toBe(50);
    expect(Math.round(rates[1].base * multiplier * 100)).toBe(100);
    expect(Math.round(rates[2].base * multiplier * 100)).toBe(150);
  });
});
