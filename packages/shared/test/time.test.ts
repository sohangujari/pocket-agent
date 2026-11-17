import { describe, expect, it } from "vitest";
import { isValidTimeZone, parseWhen } from "../src/time.ts";

describe("parseWhen", () => {
  it("reads a wall-clock time in the owner's zone", () => {
    const parsed = parseWhen("2026-11-17 09:00", "Asia/Kolkata");
    expect(parsed?.toISOString()).toBe("2026-11-17T03:30:00.000Z");
  });

  it("handles a DST boundary in New York", () => {
    // 2026-03-08 02:30 is skipped in America/New_York (clocks jump 02:00 → 03:00).
    const before = parseWhen("2026-03-07 09:00", "America/New_York");
    const after = parseWhen("2026-03-09 09:00", "America/New_York");
    expect(before?.toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(after?.toISOString()).toBe("2026-03-09T13:00:00.000Z");
  });

  it("accepts an explicit ISO timestamp", () => {
    const parsed = parseWhen("2026-11-17T03:30:00.000Z", "Asia/Kolkata");
    expect(parsed?.toISOString()).toBe("2026-11-17T03:30:00.000Z");
  });

  it("rejects nonsense", () => {
    expect(parseWhen("sometime tomorrow", "Asia/Kolkata")).toBeNull();
  });
});

describe("isValidTimeZone", () => {
  it("accepts IANA zones", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects unknown zones and blanks", () => {
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
