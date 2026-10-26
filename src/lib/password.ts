import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { hashSync, verifySync, type Algorithm } from "@node-rs/argon2";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const hash = hashSync(password, { algorithm: 2 as Algorithm });
  return `argon2id:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("argon2id:")) {
    try {
      return verifySync(stored.slice("argon2id:".length), password);
    } catch {
      return false;
    }
  }

  const [algorithm, salt, hash] = stored.split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, expected.length);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function normalizePhone(value: string): string {
  const english = value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\d+]/g, "");

  let digits = english.replace(/^\+98/, "0").replace(/^0098/, "0");
  if (digits.startsWith("98") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return digits;
}

export function isValidIranianMobile(value: string): boolean {
  return /^09\d{9}$/.test(normalizePhone(value));
}
