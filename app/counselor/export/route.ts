import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { requireCounselor } from "@/lib/auth";
import { getPeriodReport, getPlanForWeek, getStudentDetail, getWeekReport } from "@/lib/counselor";
import {
  addDays,
  currentJalaliMonthRange,
  formatJalaliNumeric,
  jalaliMonthRange,
  formatTime,
  isISODate,
  startOfWeekSaturday,
  todayISO,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/dates";
import { buildTemplateWorkbook } from "@/lib/excel";

export const runtime = "nodejs";

const TYPE_LABELS = { study: "مطالعه", review: "مرور", test: "تست" } as const;

function styleSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: "frozen", ySplit: 1, rightToLeft: true }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.height = 24;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6F4A" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
}

async function workbookResponse(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let counselor;
  try {
    counselor = await requireCounselor();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "template";

  if (type === "template") {
    const buffer = await buildTemplateWorkbook();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="seemorgh-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  }

  const studentId = searchParams.get("studentId") ?? "";
  const weekParam = searchParams.get("week") ?? todayISO();
  const weekStart = startOfWeekSaturday(isISODate(weekParam) ? weekParam : todayISO());

  const detail = await getStudentDetail(counselor.workspaceId, studentId);
  if (!detail) {
    return NextResponse.json({ error: "دانش‌آموز پیدا نشد." }, { status: 404 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "سیمرغ";
  workbook.created = new Date();

  if (type === "plan") {
    const planData = await getPlanForWeek(counselor.workspaceId, studentId, weekStart);
    const sheet = workbook.addWorksheet("برنامه هفته");
    sheet.columns = [
      { header: "تاریخ", key: "date", width: 14 },
      { header: "روز", key: "weekday", width: 10 },
      { header: "شروع", key: "start", width: 9 },
      { header: "پایان", key: "end", width: 9 },
      { header: "درس", key: "subject", width: 18 },
      { header: "منبع", key: "topic", width: 30 },
      { header: "نوع", key: "type", width: 10 },
      { header: "واحد هدف", key: "units", width: 10 },
      { header: "دقیقه", key: "minutes", width: 9 },
      { header: "وضعیت", key: "status", width: 12 },
      { header: "یادداشت", key: "note", width: 26 },
    ];
    styleSheet(sheet);

    const subjectTitle = new Map(detail.subjects.map((subject) => [subject.id, subject.title]));

    if (planData) {
      for (const task of planData.tasks) {
        const index = weekDates(weekStart).indexOf(task.planDate);
        sheet.addRow({
          date: formatJalaliNumeric(task.planDate),
          weekday: index >= 0 ? WEEKDAY_LABELS[index] : "",
          start: formatTime(task.plannedStart),
          end: formatTime(task.plannedEnd),
          subject: subjectTitle.get(task.subjectId) ?? "",
          topic: task.topic,
          type: TYPE_LABELS[task.type],
          units: task.targetUnits,
          minutes: task.estMinutes,
          status: task.status === "done" ? "انجام شد" : task.status === "skipped" ? "رد شد" : "در انتظار",
          note: task.note,
        });
      }
    }

    const info = workbook.addWorksheet("مشخصات");
    info.views = [{ rightToLeft: true }];
    info.addRows([
      ["دانش‌آموز", detail.student.name],
      ["پایه", detail.student.grade],
      ["رشته", detail.student.field],
      ["هفته", formatJalaliNumeric(weekStart)],
      ["وضعیت برنامه", planData?.plan.status ?? "بدون برنامه"],
    ]);
    info.getColumn(1).width = 18;
    info.getColumn(2).width = 30;

    return workbookResponse(workbook, `plan-${studentId}-${weekStart}.xlsx`);
  }

  if (type === "report") {
    const report = await getWeekReport(counselor.workspaceId, studentId, weekStart);
    const sheet = workbook.addWorksheet("گزارش هفته");
    sheet.columns = [
      { header: "روز", key: "weekday", width: 10 },
      { header: "تاریخ", key: "date", width: 14 },
      { header: "تعداد تسک", key: "total", width: 12 },
      { header: "انجام‌شده", key: "done", width: 12 },
      { header: "دقیقه انجام‌شده", key: "minutes", width: 16 },
    ];
    styleSheet(sheet);
    for (const [index, day] of report.byDay.entries()) {
      sheet.addRow({
        weekday: WEEKDAY_LABELS[index],
        date: formatJalaliNumeric(day.date),
        total: day.total,
        done: day.done,
        minutes: day.minutes,
      });
    }

    const summary = workbook.addWorksheet("خلاصه");
    summary.views = [{ rightToLeft: true }];
    summary.addRows([
      ["دانش‌آموز", detail.student.name],
      ["هفته", formatJalaliNumeric(weekStart)],
      ["دقیقه برنامه‌ریزی‌شده", report.plannedMinutes],
      ["دقیقه انجام‌شده", report.doneMinutes],
      ["تسک انجام‌شده", `${report.doneTasks} از ${report.totalTasks}`],
      ["روز فعال", report.activeDays],
      ["شروع درست", `${report.correctStarts} از ${report.eligibleDays}`],
      ["تست انجام‌شده", report.testsDone],
    ]);
    summary.getColumn(1).width = 24;
    summary.getColumn(2).width = 20;

    return workbookResponse(workbook, `report-${studentId}-${weekStart}.xlsx`);
  }


  if (type === "period" || type === "month") {
    let from: string;
    let to: string;
    let periodLabel: string;

    if (type === "month") {
      const range =
        jalaliMonthRange(searchParams.get("month") ?? "") ?? currentJalaliMonthRange();
      from = range.from;
      to = range.to;
      periodLabel = `گزارش ماه ${range.label}`;
    } else {
      const currentWeek = startOfWeekSaturday(todayISO());
      from = addDays(currentWeek, -21);
      to = addDays(currentWeek, 6);
      periodLabel = "گزارش ۴ هفته";
    }

    const report = await getPeriodReport(counselor.workspaceId, studentId, from, to);

    const sheet = workbook.addWorksheet(periodLabel);
    sheet.columns = [
      { header: "هفته", key: "week", width: 16 },
      { header: "تعداد تسک", key: "total", width: 12 },
      { header: "انجام‌شده", key: "done", width: 12 },
      { header: "دقیقه انجام‌شده", key: "minutes", width: 16 },
    ];
    styleSheet(sheet);
    for (const week of report.byWeek) {
      sheet.addRow({
        week: formatJalaliNumeric(week.weekStart),
        total: week.total,
        done: week.done,
        minutes: week.minutes,
      });
    }

    const summary = workbook.addWorksheet("خلاصه");
    summary.views = [{ rightToLeft: true }];
    summary.addRows([
      ["دانش‌آموز", detail.student.name],
      ["از", formatJalaliNumeric(from)],
      ["تا", formatJalaliNumeric(to)],
      ["دقیقه برنامه‌ریزی‌شده", report.plannedMinutes],
      ["دقیقه انجام‌شده", report.doneMinutes],
      ["تسک انجام‌شده", `${report.doneTasks} از ${report.totalTasks}`],
      ["روز فعال", report.activeDays],
      ["شروع درست", `${report.correctStarts} از ${report.eligibleDays}`],
      ["تست انجام‌شده", report.testsDone],
      ["واحد باقی‌مانده", detail.resources.reduce((sum, resource) => sum + Math.max(0, resource.totalUnits - resource.completedUnits), 0)],
      ["بازه", periodLabel],
    ]);
    summary.getColumn(1).width = 24;
    summary.getColumn(2).width = 20;

    return workbookResponse(
      workbook,
      `${type === "month" ? "report-month" : "report-4w"}-${studentId}-${from}.xlsx`,
    );
  }

  return NextResponse.json({ error: "نوع خروجی نامعتبر است." }, { status: 400 });
}
