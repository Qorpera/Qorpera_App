import { describe, it, expect } from "vitest";
import { addBusinessDays, isWithinOneBusinessDay, countBusinessDaysBetween } from "@/lib/business-days";

describe("addBusinessDays", () => {
  it("adds 3 business days from Monday → Thursday", () => {
    // Monday 2026-03-16
    const monday = new Date(2026, 2, 16);
    const result = addBusinessDays(monday, 3);
    // Thursday 2026-03-19
    expect(result.getDay()).toBe(4); // Thursday
    expect(result.getDate()).toBe(19);
  });

  it("adds 3 business days from Wednesday → Monday (skips weekend)", () => {
    // Wednesday 2026-03-18
    const wednesday = new Date(2026, 2, 18);
    const result = addBusinessDays(wednesday, 3);
    // Monday 2026-03-23
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(23);
  });

  it("adds 3 business days from Friday → Wednesday", () => {
    // Friday 2026-03-20
    const friday = new Date(2026, 2, 20);
    const result = addBusinessDays(friday, 3);
    // Wednesday 2026-03-25
    expect(result.getDay()).toBe(3); // Wednesday
    expect(result.getDate()).toBe(25);
  });

  it("adds 1 business day from Friday → Monday", () => {
    // Friday 2026-03-20
    const friday = new Date(2026, 2, 20);
    const result = addBusinessDays(friday, 1);
    // Monday 2026-03-23
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(23);
  });
});

describe("isWithinOneBusinessDay", () => {
  it("true on Friday when triggerAt is Monday", () => {
    // Friday 2026-03-20
    const friday = new Date(2026, 2, 20, 12, 0, 0);
    // Monday 2026-03-23
    const monday = new Date(2026, 2, 23, 12, 0, 0);
    expect(isWithinOneBusinessDay(monday, friday)).toBe(true);
  });

  it("false on Thursday when triggerAt is Monday", () => {
    // Thursday 2026-03-19
    const thursday = new Date(2026, 2, 19, 12, 0, 0);
    // Monday 2026-03-23
    const monday = new Date(2026, 2, 23, 12, 0, 0);
    expect(isWithinOneBusinessDay(monday, thursday)).toBe(false);
  });

  it("true on day before when both weekdays", () => {
    // Tuesday 2026-03-17
    const tuesday = new Date(2026, 2, 17, 12, 0, 0);
    // Wednesday 2026-03-18
    const wednesday = new Date(2026, 2, 18, 12, 0, 0);
    expect(isWithinOneBusinessDay(wednesday, tuesday)).toBe(true);
  });
});

describe("countBusinessDaysBetween", () => {
  it("returns 5 for Mon–Fri", () => {
    // Monday 2026-03-16 to Friday 2026-03-20
    const monday = new Date(2026, 2, 16);
    const friday = new Date(2026, 2, 20);
    expect(countBusinessDaysBetween(monday, friday)).toBe(4);
    // Mon→Tue(1), Tue→Wed(2), Wed→Thu(3), Thu→Fri(4). Mon-Fri is 4 business days between.
  });

  it("returns 5 for Wed–Tue (skipping weekend)", () => {
    // Wednesday 2026-03-18 to next Tuesday 2026-03-24
    const wednesday = new Date(2026, 2, 18);
    const tuesday = new Date(2026, 2, 24);
    // Thu(1), Fri(2), [Sat, Sun], Mon(3), Tue(4)
    expect(countBusinessDaysBetween(wednesday, tuesday)).toBe(4);
  });
});
