import { describe, expect, it } from "vitest";
import { normalizeIsbn } from "./isbn.ts";

describe("normalizeIsbn", () => {
  it("accepts ISBN-13 with or without hyphens and spaces", () => {
    expect(normalizeIsbn("9783257229530")).toBe("9783257229530");
    expect(normalizeIsbn("978-3-257-22953-0")).toBe("9783257229530");
    expect(normalizeIsbn(" 978 3 257 22953 0 ")).toBe("9783257229530");
    expect(normalizeIsbn(" 979 10 90636 07 1 ")).toBe("9791090636071");
  });

  it("converts ISBN-10 to ISBN-13", () => {
    expect(normalizeIsbn("3-257-22953-4")).toBe("9783257229530");
    expect(normalizeIsbn("0-15-600131-4")).toBe("9780156001311");
    expect(normalizeIsbn("054792822X")).toBe("9780547928227");
    expect(normalizeIsbn("054792822x")).toBe("9780547928227");
  });

  it("rejects wrong check digits and malformed input", () => {
    expect(normalizeIsbn("9783257229531")).toBeNull();
    expect(normalizeIsbn("3257229535")).toBeNull();
    expect(normalizeIsbn("0-15-600131-3")).toBeNull();
    expect(normalizeIsbn("4006381333931")).toBeNull(); // valid EAN, not an ISBN
    expect(normalizeIsbn("97832572295")).toBeNull();
    expect(normalizeIsbn("978325722953X")).toBeNull();
    expect(normalizeIsbn("ISBN 9783257229530")).toBeNull();
    expect(normalizeIsbn("abc")).toBeNull();
    expect(normalizeIsbn("")).toBeNull();
  });
});
