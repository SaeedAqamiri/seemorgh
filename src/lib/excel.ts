import ExcelJS from "exceljs";
import { parseTime } from "./dates";
import { isValidIranianMobile, normalizePhone } from "./password";
import { FIELDS, GRADES, TRACK_LABELS } from "./subjects";

export const SHEET_NAMES = {
  students: "Students",
  resources: "Resources",
  availability: "Availability",
  constraints: "Constraints",
  questions: "Questions",
} as const;

const STUDENT_HEADERS = [
  "name",
  "phone",
  "grade",
  "field",
  "track",
  "guardian_phone",
] as const;
const RESOURCE_HEADERS = [
  "student_phone",
  "subject",
  "title",
  "unit_type",
  "total_units",
  "completed_units",
  "priority",
] as const;
const AVAILABILITY_HEADERS = ["student_phone", "weekday", "start", "end"] as const;
const CONSTRAINTS_HEADERS = [
  "student_phone",
  "max_daily_minutes",
  "rest_weekday",
  "buffer_pct",
] as const;
const QUESTION_HEADERS = [
  "bank",
  "subject",
  "topic",
  "type",
  "difficulty",
  "body",
  "option1",
  "option2",
  "option3",
  "option4",
  "correct",
  "score",
  "explanation",
  "external_key",
] as const;

export type StudentImportRow = {
  name: string;
  phone: string;
  grade: string;
  field: string;
  track: "konkur" | "final" | "both";
  guardianPhone: string | null;
};

export type ResourceImportRow = {
  studentPhone: string;
  subject: string;
  title: string;
  unitType: "test" | "page" | "chapter";
  totalUnits: number;
  completedUnits: number;
  priority: number;
};

export type AvailabilityImportRow = {
  studentPhone: string;
  weekday: number;
  startMin: number;
  endMin: number;
};

export type ConstraintsImportRow = {
  studentPhone: string;
  maxDailyMinutes: number;
  restWeekday: number;
  bufferPct: number;
};

export type QuestionImportRow = {
  bank: string;
  subject: string | null;
  topic: string;
  type: "mcq" | "short";
  difficulty: "easy" | "medium" | "hard";
  body: string;
  options: string[] | null;
  correct: string | number;
  score: number;
  explanation: string;
  externalKey: string | null;
};

export type ParsedRow<T> = { row: number; data: T; errors: string[] };

export type ParsedWorkbook = {
  students: ParsedRow<StudentImportRow>[];
  resources: ParsedRow<ResourceImportRow>[];
  availability: ParsedRow<AvailabilityImportRow>[];
  constraints: ParsedRow<ConstraintsImportRow>[];
  questions: ParsedRow<QuestionImportRow>[];
  fileErrors: string[];
};

function styleHeader(sheet: ExcelJS.Worksheet, columns: readonly string[]) {
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];
  const header = sheet.getRow(1);
  header.values = [...columns];
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F4A" } };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF145034" } },
    };
  });
  columns.forEach((_, index) => {
    sheet.getColumn(index + 1).width = 18;
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

export async function buildTemplateWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "سیمرغ";
  workbook.created = new Date();

  const students = workbook.addWorksheet(SHEET_NAMES.students);
  styleHeader(students, STUDENT_HEADERS);
  students.addRow([
    "علی رضایی",
    "09121111111",
    GRADES[2],
    FIELDS[0],
    "both",
    "",
  ]);
  students.getColumn(1).width = 24;
  students.getColumn(2).width = 16;

  const resources = workbook.addWorksheet(SHEET_NAMES.resources);
  styleHeader(resources, RESOURCE_HEADERS);
  resources.addRow(["09121111111", "زیست‌شناسی", "زیست دوازدهم — تست", "test", 1200, 420, 5]);
  resources.getColumn(2).width = 22;
  resources.getColumn(3).width = 34;

  const availability = workbook.addWorksheet(SHEET_NAMES.availability);
  styleHeader(availability, AVAILABILITY_HEADERS);
  availability.addRow(["09121111111", 0, "16:00", "20:00"]);
  availability.addRow(["09121111111", 5, "09:00", "13:00"]);

  const constraints = workbook.addWorksheet(SHEET_NAMES.constraints);
  styleHeader(constraints, CONSTRAINTS_HEADERS);
  constraints.addRow(["09121111111", 300, 6, 15]);

  const questions = workbook.addWorksheet(SHEET_NAMES.questions);
  styleHeader(questions, QUESTION_HEADERS);
  questions.addRow([
    "بانک زیست",
    "زیست‌شناسی",
    "ژنتیک",
    "mcq",
    "medium",
    "کدام مورد درباره DNA صحیح است؟",
    "گزینه ۱",
    "گزینه ۲",
    "گزینه ۳",
    "گزینه ۴",
    2,
    1,
    "توضیح پاسخ",
    "bio-001",
  ]);
  questions.getColumn(6).width = 46;
  questions.getColumn(12).width = 26;

  const guide = workbook.addWorksheet("راهنما");
  guide.views = [{ rightToLeft: true }];
  guide.getColumn(1).width = 22;
  guide.getColumn(2).width = 74;
  guide.addRows([
    ["شیت", "توضیح"],
    ["Students", "دانش‌آموزان جدید. phone باید یکتا باشد (۰۹xxxxxxxxx)."],
    ["Resources", "منبع برای دانش‌آموز موجود (بر اساس student_phone)."],
    ["Availability", "بازه آزاد هفتگی. weekday: 0=شنبه تا 6=جمعه."],
    ["Constraints", "محدودیت‌های دانش‌آموز. buffer_pct بین ۰ تا ۵۰."],
    ["Questions", "سوال چهارگزینه‌ای (mcq) یا کوتاه‌پاسخ (short). correct برای MCQ شماره گزینه ۱ تا ۴ است."],
    ["unit_type", "test / page / chapter"],
    ["track", "konkur / final / both"],
    ["difficulty", "easy / medium / hard"],
  ]);
  guide.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return String(value.result ?? "").trim();
  }
  return String(value).trim();
}

function cellNumber(cell: ExcelJS.Cell): number {
  const text = cellText(cell)
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");
  return text === "" ? Number.NaN : Number(text);
}

function getSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | null {
  return workbook.getWorksheet(name) ?? null;
}

function forEachDataRow(
  sheet: ExcelJS.Worksheet | null,
  handle: (row: ExcelJS.Row, rowNumber: number) => void,
) {
  if (!sheet) return;
  for (let rowNumber = 2; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const hasContent = Array.from({ length: sheet.columnCount }, (_, index) => index + 1).some(
      (column) => cellText(row.getCell(column)) !== "",
    );
    if (hasContent) handle(row, rowNumber);
  }
}

function normalizeTrack(value: string): "konkur" | "final" | "both" | null {
  const map: Record<string, "konkur" | "final" | "both"> = {
    konkur: "konkur",
    کنکور: "konkur",
    final: "final",
    "امتحان نهایی": "final",
    نهایی: "final",
    both: "both",
    "هر دو": "both",
  };
  return map[value.trim().toLowerCase()] ?? map[value.trim()] ?? null;
}

function normalizeUnitType(value: string): "test" | "page" | "chapter" | null {
  const map: Record<string, "test" | "page" | "chapter"> = {
    test: "test",
    تست: "test",
    page: "page",
    صفحه: "page",
    chapter: "chapter",
    فصل: "chapter",
  };
  return map[value.trim().toLowerCase()] ?? map[value.trim()] ?? null;
}

function normalizeQuestionType(value: string): "mcq" | "short" | null {
  const map: Record<string, "mcq" | "short"> = {
    mcq: "mcq",
    "چهارگزینه‌ای": "mcq",
    چهارگزینه: "mcq",
    short: "short",
    "کوتاه‌پاسخ": "short",
    کوتاه: "short",
  };
  return map[value.trim().toLowerCase()] ?? map[value.trim()] ?? null;
}

function normalizeDifficulty(value: string): "easy" | "medium" | "hard" | null {
  const map: Record<string, "easy" | "medium" | "hard"> = {
    easy: "easy",
    آسان: "easy",
    medium: "medium",
    متوسط: "medium",
    hard: "hard",
    سخت: "hard",
  };
  return map[value.trim().toLowerCase()] ?? map[value.trim()] ?? null;
}

export async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const result: ParsedWorkbook = {
    students: [],
    resources: [],
    availability: [],
    constraints: [],
    questions: [],
    fileErrors: [],
  };

  forEachDataRow(getSheet(workbook, SHEET_NAMES.students), (row, rowNumber) => {
    const errors: string[] = [];
    const name = cellText(row.getCell(1));
    const phone = normalizePhone(cellText(row.getCell(2)));
    const grade = cellText(row.getCell(3)) || "دوازدهم";
    const studentField = cellText(row.getCell(4)) || "تجربی";
    const track = normalizeTrack(cellText(row.getCell(5))) ?? "both";
    const guardianPhone = cellText(row.getCell(6)) || null;

    if (name.length < 2) errors.push("نام خالی است.");
    if (!isValidIranianMobile(phone)) errors.push("شماره موبایل معتبر نیست.");
    if (!GRADES.includes(grade as (typeof GRADES)[number])) {
      errors.push(`پایه نامعتبر است: ${grade}`);
    }
    if (!FIELDS.includes(studentField as (typeof FIELDS)[number])) {
      errors.push(`رشته نامعتبر است: ${studentField}`);
    }

    result.students.push({
      row: rowNumber,
      errors,
      data: { name, phone, grade, field: studentField, track, guardianPhone },
    });
  });

  forEachDataRow(getSheet(workbook, SHEET_NAMES.resources), (row, rowNumber) => {
    const errors: string[] = [];
    const studentPhone = normalizePhone(cellText(row.getCell(1)));
    const subject = cellText(row.getCell(2));
    const title = cellText(row.getCell(3));
    const unitType = normalizeUnitType(cellText(row.getCell(4)) || "test");
    const totalUnits = cellNumber(row.getCell(5));
    const completedUnits = cellNumber(row.getCell(6));
    const priority = cellNumber(row.getCell(7));

    if (!isValidIranianMobile(studentPhone)) errors.push("شماره دانش‌آموز معتبر نیست.");
    if (!subject) errors.push("درس خالی است.");
    if (!title) errors.push("عنوان منبع خالی است.");
    if (!unitType) errors.push("نوع واحد نامعتبر است.");
    if (!Number.isFinite(totalUnits) || totalUnits < 0) errors.push("تعداد کل نامعتبر است.");
    if (!Number.isFinite(completedUnits) || completedUnits < 0) {
      errors.push("تعداد انجام‌شده نامعتبر است.");
    }
    if (Number.isFinite(totalUnits) && Number.isFinite(completedUnits) && completedUnits > totalUnits) {
      errors.push("پیشرفت بیشتر از کل است.");
    }
    if (!Number.isFinite(priority) || priority < 1 || priority > 5) {
      errors.push("اولویت باید بین ۱ تا ۵ باشد.");
    }

    result.resources.push({
      row: rowNumber,
      errors,
      data: {
        studentPhone,
        subject,
        title,
        unitType: unitType ?? "test",
        totalUnits: Number.isFinite(totalUnits) ? totalUnits : 0,
        completedUnits: Number.isFinite(completedUnits) ? completedUnits : 0,
        priority: Number.isFinite(priority) ? priority : 3,
      },
    });
  });

  forEachDataRow(getSheet(workbook, SHEET_NAMES.availability), (row, rowNumber) => {
    const errors: string[] = [];
    const studentPhone = normalizePhone(cellText(row.getCell(1)));
    const weekday = cellNumber(row.getCell(2));
    const start = parseTime(cellText(row.getCell(3)));
    const end = parseTime(cellText(row.getCell(4)));

    if (!isValidIranianMobile(studentPhone)) errors.push("شماره دانش‌آموز معتبر نیست.");
    if (!Number.isFinite(weekday) || weekday < 0 || weekday > 6) {
      errors.push("روز هفته باید ۰ (شنبه) تا ۶ (جمعه) باشد.");
    }
    if (start === null) errors.push("ساعت شروع نامعتبر است.");
    if (end === null) errors.push("ساعت پایان نامعتبر است.");
    if (start !== null && end !== null && end <= start) errors.push("پایان باید بعد از شروع باشد.");

    result.availability.push({
      row: rowNumber,
      errors,
      data: {
        studentPhone,
        weekday: Number.isFinite(weekday) ? weekday : 0,
        startMin: start ?? 0,
        endMin: end ?? 0,
      },
    });
  });

  forEachDataRow(getSheet(workbook, SHEET_NAMES.constraints), (row, rowNumber) => {
    const errors: string[] = [];
    const studentPhone = normalizePhone(cellText(row.getCell(1)));
    const maxDailyMinutes = cellNumber(row.getCell(2));
    const restWeekday = cellNumber(row.getCell(3));
    const bufferPct = cellNumber(row.getCell(4));

    if (!isValidIranianMobile(studentPhone)) errors.push("شماره دانش‌آموز معتبر نیست.");
    if (!Number.isFinite(maxDailyMinutes) || maxDailyMinutes < 30 || maxDailyMinutes > 720) {
      errors.push("سقف دقیقه روزانه باید بین ۳۰ تا ۷۲۰ باشد.");
    }
    if (!Number.isFinite(restWeekday) || restWeekday < 0 || restWeekday > 6) {
      errors.push("روز تعطیل نامعتبر است.");
    }
    if (!Number.isFinite(bufferPct) || bufferPct < 0 || bufferPct > 50) {
      errors.push("بافر باید بین ۰ تا ۵۰ باشد.");
    }

    result.constraints.push({
      row: rowNumber,
      errors,
      data: {
        studentPhone,
        maxDailyMinutes: Number.isFinite(maxDailyMinutes) ? maxDailyMinutes : 240,
        restWeekday: Number.isFinite(restWeekday) ? restWeekday : 6,
        bufferPct: Number.isFinite(bufferPct) ? bufferPct : 15,
      },
    });
  });

  forEachDataRow(getSheet(workbook, SHEET_NAMES.questions), (row, rowNumber) => {
    const errors: string[] = [];
    const bank = cellText(row.getCell(1));
    const subject = cellText(row.getCell(2)) || null;
    const topic = cellText(row.getCell(3));
    const type = normalizeQuestionType(cellText(row.getCell(4)) || "mcq");
    const difficulty = normalizeDifficulty(cellText(row.getCell(5)) || "medium");
    const body = cellText(row.getCell(6));
    const options = [7, 8, 9, 10]
      .map((column) => cellText(row.getCell(column)))
      .filter((value) => value !== "");
    const correctText = cellText(row.getCell(11));
    const score = cellNumber(row.getCell(12));
    const explanation = cellText(row.getCell(13));
    const externalKey = cellText(row.getCell(14)) || null;

    if (!bank) errors.push("نام بانک خالی است.");
    if (!body) errors.push("متن سوال خالی است.");
    if (!type) errors.push("نوع سوال نامعتبر است.");
    if (!difficulty) errors.push("سختی نامعتبر است.");
    if (!Number.isFinite(score) || score <= 0) errors.push("بارم باید عددی مثبت باشد.");

    let correct: string | number = correctText;
    if (type === "mcq") {
      if (options.length < 2) errors.push("سوال چهارگزینه‌ای حداقل دو گزینه لازم دارد.");
      const index = Number(correctText);
      if (!Number.isInteger(index) || index < 1 || index > 4) {
        errors.push("پاسخ صحیح MCQ باید شماره گزینه ۱ تا ۴ باشد.");
      } else if (index > options.length) {
        errors.push("شماره پاسخ از تعداد گزینه‌ها بیشتر است.");
      }
      correct = index;
    } else if (!correctText) {
      errors.push("پاسخ کوتاه خالی است.");
    }

    result.questions.push({
      row: rowNumber,
      errors,
      data: {
        bank,
        subject,
        topic,
        type: type ?? "mcq",
        difficulty: difficulty ?? "medium",
        body,
        options: type === "mcq" ? options : null,
        correct,
        score: Number.isFinite(score) ? score : 1,
        explanation,
        externalKey,
      },
    });
  });

  if (
    result.students.length === 0 &&
    result.resources.length === 0 &&
    result.availability.length === 0 &&
    result.constraints.length === 0 &&
    result.questions.length === 0
  ) {
    result.fileErrors.push("هیچ ردیف داده‌ای در شیت‌های شناخته‌شده پیدا نشد.");
  }

  return result;
}

export function errorRows(parsed: ParsedWorkbook): number {
  return [
    ...parsed.students,
    ...parsed.resources,
    ...parsed.availability,
    ...parsed.constraints,
    ...parsed.questions,
  ].filter((row) => row.errors.length > 0).length;
}

export function totalRows(parsed: ParsedWorkbook): number {
  return (
    parsed.students.length +
    parsed.resources.length +
    parsed.availability.length +
    parsed.constraints.length +
    parsed.questions.length
  );
}
