import Link from "next/link";
import { applyImportAction, cancelImportAction } from "@/app/actions/import";
import { SubmitButton } from "@/components/submit-button";
import { requireCounselor } from "@/lib/auth";
import { listStudents } from "@/lib/counselor";
import { errorRows, parseWorkbook, totalRows, type ParsedRow } from "@/lib/excel";
import { readImportFile } from "@/lib/import-store";
import { formatTime } from "@/lib/dates";

function Status({ errors }: { errors: string[] }) {
  return errors.length === 0 ? (
    <span className="badge badge-green">معتبر</span>
  ) : (
    <span className="badge badge-danger">{errors.join(" ")}</span>
  );
}

function PreviewTable({
  title,
  rows,
  columns,
  empty,
}: {
  title: string;
  rows: ParsedRow<Record<string, unknown>>[];
  columns: { key: string; label: string; render?: (row: Record<string, unknown>) => string }[];
  empty: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card">
      <div className="section-head">
        <h3>{title}</h3>
        <small>
          {rows.length} ردیف — {rows.filter((row) => row.errors.length === 0).length} معتبر
        </small>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ردیف</th>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((row) => (
              <tr key={row.row}>
                <td>{row.row}</td>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render
                      ? column.render(row.data)
                      : String(row.data[column.key] ?? "—")}
                  </td>
                ))}
                <td>
                  <Status errors={row.errors} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 40 ? (
        <small>نمایش ۴۰ ردیف اول از {rows.length} ردیف. ردیف‌های نامعتبر اعمال نمی‌شوند.</small>
      ) : null}
      {rows.length === 0 ? <div className="empty">{empty}</div> : null}
    </div>
  );
}

export default async function ImportPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const counselor = await requireCounselor();
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="card">
        <h1>ایمپورت اکسل</h1>
        <p>شناسه ایمپورت پیدا نشد.</p>
        <Link href="/counselor" className="btn">
          بازگشت
        </Link>
      </div>
    );
  }

  const buffer = await readImportFile(token);
  if (!buffer) {
    return (
      <div className="card">
        <h1>فایل پیدا نشد</h1>
        <p>فایل منقضی شده یا قبلاً اعمال شده است. دوباره آپلود کنید.</p>
        <Link href="/counselor" className="btn">
          بازگشت
        </Link>
      </div>
    );
  }

  let parsed;
  try {
    parsed = await parseWorkbook(buffer);
  } catch {
    return (
      <div className="card">
        <h1>فایل خوانده نشد</h1>
        <p>فایل اکسل معتبر نیست. از قالب رسمی استفاده کنید.</p>
        <Link href="/counselor" className="btn">
          بازگشت
        </Link>
      </div>
    );
  }

  const students = await listStudents(counselor.workspaceId, counselor.id);
  const knownPhones = new Set(students.map((student) => student.phone));

  const invalid = errorRows(parsed);
  const total = totalRows(parsed);

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <Link href="/counselor" className="muted" style={{ fontSize: "0.82rem" }}>
            ← بازگشت
          </Link>
          <h1>پیش‌نمایش ایمپورت</h1>
          <small>هیچ داده‌ای تا تأیید نهایی ذخیره نمی‌شود.</small>
        </div>
        <div className="row">
          <form action={applyImportAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton pendingLabel="در حال اعمال…">تأیید و اعمال {total - invalid} ردیف معتبر</SubmitButton>
          </form>
          <form action={cancelImportAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="btn-secondary">انصراف</SubmitButton>
          </form>
        </div>
      </div>

      {parsed.fileErrors.map((message) => (
        <div key={message} className="alert alert-error">
          {message}
        </div>
      ))}

      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-value">{total}</div>
          <div className="stat-label">کل ردیف‌ها</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: "var(--brand)" }}>
            {total - invalid}
          </div>
          <div className="stat-label">آماده اعمال</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: invalid ? "var(--danger)" : undefined }}>
            {invalid}
          </div>
          <div className="stat-label">ردیف نامعتبر</div>
        </div>
      </div>

      {parsed.students.length > 0 ? (
        <PreviewTable
          title="دانش‌آموزان"
          rows={parsed.students as unknown as ParsedRow<Record<string, unknown>>[]}
          columns={[
            { key: "name", label: "نام" },
            { key: "phone", label: "موبایل" },
            { key: "grade", label: "پایه" },
            { key: "field", label: "رشته" },
            {
              key: "exists",
              label: "وضعیت",
              render: (row) =>
                knownPhones.has(String(row.phone)) ? "از قبل موجود (رد می‌شود)" : "دانش‌آموز جدید",
            },
          ]}
          empty=""
        />
      ) : null}

      {parsed.resources.length > 0 ? (
        <PreviewTable
          title="منابع"
          rows={parsed.resources as unknown as ParsedRow<Record<string, unknown>>[]}
          columns={[
            { key: "studentPhone", label: "موبایل" },
            { key: "subject", label: "درس" },
            { key: "title", label: "منبع" },
            { key: "unitType", label: "نوع" },
            {
              key: "units",
              label: "پیشرفت",
              render: (row) => `${row.completedUnits} / ${row.totalUnits}`,
            },
            { key: "priority", label: "اولویت" },
          ]}
          empty=""
        />
      ) : null}

      {parsed.availability.length > 0 ? (
        <PreviewTable
          title="زمان‌های آزاد"
          rows={parsed.availability as unknown as ParsedRow<Record<string, unknown>>[]}
          columns={[
            { key: "studentPhone", label: "موبایل" },
            { key: "weekday", label: "روز (۰=شنبه)" },
            {
              key: "time",
              label: "بازه",
              render: (row) => `${formatTime(Number(row.startMin))}–${formatTime(Number(row.endMin))}`,
            },
          ]}
          empty=""
        />
      ) : null}

      {parsed.constraints.length > 0 ? (
        <PreviewTable
          title="محدودیت‌ها"
          rows={parsed.constraints as unknown as ParsedRow<Record<string, unknown>>[]}
          columns={[
            { key: "studentPhone", label: "موبایل" },
            { key: "maxDailyMinutes", label: "سقف روزانه" },
            { key: "restWeekday", label: "روز تعطیل" },
            { key: "bufferPct", label: "بافر" },
          ]}
          empty=""
        />
      ) : null}

      {parsed.questions.length > 0 ? (
        <PreviewTable
          title="سوالات"
          rows={parsed.questions as unknown as ParsedRow<Record<string, unknown>>[]}
          columns={[
            { key: "bank", label: "بانک" },
            { key: "subject", label: "درس" },
            { key: "topic", label: "مبحث" },
            { key: "type", label: "نوع" },
            { key: "difficulty", label: "سختی" },
            {
              key: "body",
              label: "متن",
              render: (row) => {
                const text = String(row.body ?? "");
                return text.length > 50 ? `${text.slice(0, 50)}…` : text;
              },
            },
          ]}
          empty=""
        />
      ) : null}

      {total === 0 ? <div className="card empty">هیچ ردیف داده‌ای پیدا نشد.</div> : null}
    </div>
  );
}
