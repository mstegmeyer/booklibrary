import { describe, expect, it } from "vitest";
import { isGermanLanguageGroup, normaliseIsbn } from "./isbn.ts";

describe("normaliseIsbn", () => {
  it("accepts ISBN-13 with or without hyphens and spaces", () => {
    expect(normaliseIsbn("9783257229530")).toBe("9783257229530");
    expect(normaliseIsbn("978-3-257-22953-0")).toBe("9783257229530");
    expect(normaliseIsbn(" 978 3 257 22953 0 ")).toBe("9783257229530");
  });

  it("converts ISBN-10 to ISBN-13", () => {
    expect(normaliseIsbn("3-257-22953-4")).toBe("9783257229530");
    expect(normaliseIsbn("054792822X")).toBe("9780547928227");
    expect(normaliseIsbn("054792822x")).toBe("9780547928227");
  });

  it("rejects wrong check digits and malformed input", () => {
    expect(normaliseIsbn("9783257229531")).toBeNull();
    expect(normaliseIsbn("3257229535")).toBeNull();
    expect(normaliseIsbn("4006381333931")).toBeNull(); // valid EAN, not an ISBN
    expect(normaliseIsbn("97832572295")).toBeNull();
    expect(normaliseIsbn("978325722953X")).toBeNull();
    expect(normaliseIsbn("ISBN 9783257229530")).toBeNull();
    expect(normaliseIsbn("")).toBeNull();
  });

  it("recognises the German-language registration group", () => {
    expect(isGermanLanguageGroup("9783257229530")).toBe(true);
    expect(isGermanLanguageGroup("9780140328721")).toBe(false);
  });
});
