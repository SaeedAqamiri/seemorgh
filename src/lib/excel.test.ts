import { describe, expect, it } from "vitest";
import { buildTemplateWorkbook, errorRows, parseWorkbook, totalRows } from "./excel";

describe("excel template", () => {
  it("round-trips through the parser without validation errors", async () => {
    const buffer = await buildTemplateWorkbook();
    expect(buffer.length).toBeGreaterThan(1000);

    const parsed = await parseWorkbook(buffer);
    expect(totalRows(parsed)).toBe(6);
    expect(errorRows(parsed)).toBe(0);
    expect(parsed.students[0].data.phone).toBe("09121111111");
    expect(parsed.questions[0].data.type).toBe("mcq");
    expect(parsed.questions[0].data.correct).toBe(2);
  });
});
