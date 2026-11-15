import { describe, expect, it } from "vitest";
import {
  bookLabelFor,
  gradeForBookNumber,
  inferGradeFromText,
  inferSubjectTitleFromBankTitle,
  normalizeGrade,
  parseQuestionBookKey,
  questionBookKey,
} from "./question-taxonomy";

describe("question taxonomy", () => {
  it("infers the subject before generic ریاضی in bank titles", () => {
    expect(inferSubjectTitleFromBankTitle("منتا - فیزیک 1 (ریاضی)")).toBe("فیزیک");
    expect(inferSubjectTitleFromBankTitle("منتا - ریاضی و آمار 2")).toBe("ریاضی و آمار");
    expect(inferSubjectTitleFromBankTitle("منتا - ریاضیات گسسته")).toBe("گسسته");
    expect(inferSubjectTitleFromBankTitle("منتا - عربی، زبان قرآن 3 (اختصاصی)")).toBe("عربی");
  });

  it("maps book numbers to grades with subject-specific exceptions", () => {
    expect(gradeForBookNumber("شیمی", 3)).toBe("دوازدهم");
    expect(gradeForBookNumber("حسابان", 1)).toBe("یازدهم");
    expect(gradeForBookNumber("حسابان", 2)).toBe("دوازدهم");
    expect(gradeForBookNumber("فلسفه", 1)).toBe("یازدهم");
    expect(gradeForBookNumber("زیست‌شناسی", 1)).toBe("دهم");
  });

  it("infers grades from bank titles and labels", () => {
    expect(inferGradeFromText("منتا - شیمی 3", "شیمی")).toBe("دوازدهم");
    expect(inferGradeFromText("منتا - حسابان 1", "حسابان")).toBe("یازدهم");
    expect(inferGradeFromText("منتا - ریاضیات گسسته", "گسسته")).toBe("دوازدهم");
    expect(inferGradeFromText("منتا - زیست‌شناسی 2", "زیست‌شناسی")).toBe("یازدهم");
    expect(normalizeGrade("پایه دوازدهم")).toBe("دوازدهم");
    expect(normalizeGrade("۳")).toBe("دوازدهم");
  });

  it("builds book labels aligned with resource titles", () => {
    expect(bookLabelFor("شیمی", "دهم", "شیمی دهم")).toBe("شیمی ۱");
    expect(bookLabelFor("حسابان", "یازدهم", "حسابان ۱")).toBe("حسابان ۱");
    expect(bookLabelFor("حسابان", "دهم", "ریاضی دهم")).toBe("ریاضی ۱");
    expect(bookLabelFor("فیزیک", "دوازدهم")).toBe("فیزیک ۳");
  });

  it("round-trips book filter keys", () => {
    const key = questionBookKey("subject-id", "دوازدهم");
    expect(parseQuestionBookKey(key)).toEqual({
      subjectId: "subject-id",
      grade: "دوازدهم",
    });
    expect(parseQuestionBookKey("bad-key")).toBeNull();
  });
});