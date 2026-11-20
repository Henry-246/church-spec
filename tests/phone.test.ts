import { describe, expect, it } from "vitest";
import { formatGhanaPhone, normalizeGhanaPhone } from "@/lib/phone";

const ok = (input: string) => {
  const r = normalizeGhanaPhone(input);
  return r.ok ? r.phone : null;
};

describe("normalizeGhanaPhone", () => {
  it.each([
    ["0241234567", "233241234567"],
    ["024 123 4567", "233241234567"],
    ["024-123-4567", "233241234567"],
    ["(024) 123 4567", "233241234567"],
    ["+233241234567", "233241234567"],
    ["+233 24 123 4567", "233241234567"],
    ["233241234567", "233241234567"],
    ["00233241234567", "233241234567"],
    ["+233 (0)24 123 4567", "233241234567"],
    ["+2330241234567", "233241234567"],
    ["  0551234567  ", "233551234567"],
    ["020.123.4567", "233201234567"],
  ])("%s -> %s", (input, expected) => {
    expect(ok(input)).toBe(expected);
  });

  it.each([
    "",
    "024123456", // 9 digits
    "02412345678", // 11 digits
    "241234567", // missing leading 0
    "+234801234567", // Nigeria
    "23324123456", // too short
    "024abc4567",
    "+",
    "1234567890",
  ])("rejects %j", (input) => {
    const r = normalizeGhanaPhone(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valid Ghana phone/);
  });

  it("rejects null/undefined", () => {
    expect(normalizeGhanaPhone(null).ok).toBe(false);
    expect(normalizeGhanaPhone(undefined).ok).toBe(false);
  });
});

describe("formatGhanaPhone", () => {
  it("formats for display", () => expect(formatGhanaPhone("233241234567")).toBe("024 123 4567"));
  it("leaves unknown values alone", () => expect(formatGhanaPhone("12345")).toBe("12345"));
});
