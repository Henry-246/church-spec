import { describe, expect, it } from "vitest";
import { firstNameOf, hasPlaceholders, renderTemplate, unknownPlaceholders } from "@/lib/templates";

describe("renderTemplate", () => {
  it("fills all placeholders", () => {
    expect(
      renderTemplate("Hi {first_name} ({full_name}), welcome to {church_name}!", {
        first_name: "Ama",
        full_name: "Ama Owusu",
        church_name: "Grace Chapel",
      }),
    ).toBe("Hi Ama (Ama Owusu), welcome to Grace Chapel!");
  });
  it("replaces every occurrence", () => {
    expect(renderTemplate("{first_name} {first_name}", { first_name: "Kofi" })).toBe("Kofi Kofi");
  });
  it("uses Friend for missing names (same as the database)", () => {
    expect(renderTemplate("Hi {first_name}, {full_name}", { first_name: "  ", full_name: null })).toBe("Hi Friend, Friend");
  });
  it("blank church name becomes empty", () => {
    expect(renderTemplate("[{church_name}]", {})).toBe("[]");
  });
  it("leaves unknown placeholders", () => {
    expect(renderTemplate("Hi {name}", { first_name: "A" })).toBe("Hi {name}");
  });
});

describe("helpers", () => {
  it("firstNameOf", () => {
    expect(firstNameOf(" Kwame A. Mensah ")).toBe("Kwame");
    expect(firstNameOf("")).toBe("");
    expect(firstNameOf(null)).toBe("");
  });
  it("hasPlaceholders", () => {
    expect(hasPlaceholders("Hello {first_name}")).toBe(true);
    expect(hasPlaceholders("Service at 8am")).toBe(false);
  });
  it("unknownPlaceholders", () => {
    expect(unknownPlaceholders("Hi {firstname} {first_name} {firstname}")).toEqual(["{firstname}"]);
  });
});
