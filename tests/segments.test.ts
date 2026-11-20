import { describe, expect, it } from "vitest";
import { countSegments } from "@/lib/sms/segments";

describe("countSegments", () => {
  it("empty message", () => {
    expect(countSegments("")).toMatchObject({ segments: 0, length: 0, encoding: "GSM-7" });
  });
  it("160 GSM chars = 1 segment", () => {
    expect(countSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1, remaining: 0, perSegment: 160 });
  });
  it("161 GSM chars = 2 segments of 153", () => {
    expect(countSegments("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153, remaining: 306 - 161 });
  });
  it("306 = 2 segments, 307 = 3", () => {
    expect(countSegments("a".repeat(306)).segments).toBe(2);
    expect(countSegments("a".repeat(307)).segments).toBe(3);
  });
  it("extended chars count double", () => {
    expect(countSegments("€".repeat(80))).toMatchObject({ encoding: "GSM-7", length: 160, segments: 1 });
    expect(countSegments("a".repeat(159) + "{").segments).toBe(2);
  });
  it("GSM accented letters stay GSM", () => {
    expect(countSegments("Café à Élise ñ ü").encoding).toBe("GSM-7");
  });
  it("emoji switches to Unicode (70 / 67)", () => {
    const party = "\u{1F389}";
    const r = countSegments("Happy birthday " + party);
    expect(r.encoding).toBe("Unicode");
    expect(r.unicodeChars).toEqual([party]);
    expect(r.length).toBe(17); // emoji = 2 UTF-16 units
    expect(r.segments).toBe(1);
  });
  it("Unicode boundaries", () => {
    const e = "ɛ"; // Twi/Ga open e
    expect(countSegments(e.repeat(70)).segments).toBe(1);
    expect(countSegments(e.repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
    expect(countSegments(e.repeat(134)).segments).toBe(2);
    expect(countSegments(e.repeat(135)).segments).toBe(3);
  });
  it("curly apostrophe forces Unicode", () => {
    expect(countSegments("It’s Sunday").encoding).toBe("Unicode");
  });
  it("newlines are GSM", () => {
    expect(countSegments("Line 1\nLine 2").encoding).toBe("GSM-7");
  });
});
