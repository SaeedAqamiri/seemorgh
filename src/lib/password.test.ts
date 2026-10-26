import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isValidIranianMobile,
  normalizePhone,
  verifyPassword,
} from "./password";

describe("password", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("correct horse");
    expect(hash.startsWith("argon2id:$argon2id$")).toBe(true);
    expect(verifyPassword("correct horse", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("uses a random salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("normalizes Persian and international phone formats", () => {
    expect(normalizePhone("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(normalizePhone("+989123456789")).toBe("09123456789");
    expect(normalizePhone("00989123456789")).toBe("09123456789");
    expect(normalizePhone("9123456789")).toBe("09123456789");
    expect(isValidIranianMobile("۰۹۱۲۳۴۵۶۷۸۹")).toBe(true);
    expect(isValidIranianMobile("0212345678")).toBe(false);
  });
});
