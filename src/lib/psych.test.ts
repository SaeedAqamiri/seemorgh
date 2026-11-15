import { describe, expect, it } from "vitest";
import type { PsychBand } from "@/db/schema";
import {
  findPsychBand,
  normalizePsychCode,
  scorePsychAttempt,
  type PsychScoringDimension,
} from "./psych";

const introvertBands: PsychBand[] = [
  { min: 0, max: 4, label: "درون‌گرا", code: "I", analysis: "به خلوت نیاز داری." },
  { min: 5, max: 8, label: "میانه", code: "M", analysis: "تعادل بین جمع و خلوت داری." },
  { min: 9, max: null, label: "برون‌گرا", code: "E", analysis: "از جمع انرژی می‌گیری." },
];

const worryBands: PsychBand[] = [
  { min: 0, max: 4, label: "خیلی وسواسی", code: "", analysis: "جزئیات را زیاد چک می‌کنی." },
  { min: 5, max: 8, label: "معمولی", code: "", analysis: "تعادل نسبتاً خوبی داری." },
  { min: 9, max: null, label: "بی‌خیال", code: "", analysis: "سخت‌گیری کمتری داری." },
];

const dimensions: PsychScoringDimension[] = [
  { id: "intro", title: "درون‌گرایی", description: "", bands: introvertBands },
  { id: "worry", title: "وسواس", description: "", bands: worryBands },
];

describe("scorePsychAttempt", () => {
  it("sums option scores and selects the matching band", () => {
    const result = scorePsychAttempt(
      dimensions,
      [{ intro: 3 }, { intro: 3 }, { worry: 2 }],
      [],
    );

    expect(result.scores.intro).toBe(6);
    expect(result.scores.worry).toBe(2);
    expect(result.dimensions[0].bandLabel).toBe("میانه");
    expect(result.dimensions[1].bandLabel).toBe("خیلی وسواسی");
    expect(result.code).toBe("M");
  });

  it("matches a result rule by concatenated band codes", () => {
    const result = scorePsychAttempt(
      dimensions,
      [{ intro: 10 }, { worry: 1 }],
      [{ code: "E", title: "برون‌گرا", body: "تحلیل ثابت برون‌گرا" }],
    );

    expect(result.code).toBe("E");
    expect(result.title).toBe("برون‌گرا");
    expect(result.body).toBe("تحلیل ثابت برون‌گرا");
    expect(result.matchedRule).toBe(true);
  });

  it("falls back to band analysis when no rule matches", () => {
    const result = scorePsychAttempt(dimensions, [{ intro: 0 }, { worry: 0 }], []);

    expect(result.code).toBe("I");
    expect(result.matchedRule).toBe(false);
    expect(result.title).toBe("نتیجه: I");
    expect(result.body).toContain("درون‌گرایی: درون‌گرا (امتیاز ۰)");
    expect(result.body).toContain("به خلوت نیاز داری.");
  });

  it("uses band labels as the title when no band has a code", () => {
    const result = scorePsychAttempt(
      [{ id: "worry", title: "وسواس", description: "", bands: worryBands }],
      [{ worry: 12 }],
      [],
    );

    expect(result.code).toBe("");
    expect(result.title).toBe("بی‌خیال");
    expect(result.dimensions[0].bandLabel).toBe("بی‌خیال");
  });

  it("ignores unknown dimensions", () => {
    const result = scorePsychAttempt(dimensions, [{ unknown: 99, intro: 2 }], []);

    expect(result.scores.unknown).toBeUndefined();
    expect(result.scores.intro).toBe(2);
  });
});

describe("findPsychBand", () => {
  it("uses an open-ended last band for large scores", () => {
    expect(findPsychBand(introvertBands, 100)?.label).toBe("برون‌گرا");
  });

  it("returns the first band for scores below its start", () => {
    expect(findPsychBand(worryBands, -2)?.label).toBe("خیلی وسواسی");
  });
});

describe("normalizePsychCode", () => {
  it("normalizes whitespace and case", () => {
    expect(normalizePsychCode(" i n t j ")).toBe("INTJ");
  });
});
