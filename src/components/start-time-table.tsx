import { formatJalaliNumeric, formatTime, WEEKDAY_LABELS } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { DayStartStatus } from "@/lib/performance";

export function StartTimeTable({ days }: { days: DayStartStatus[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>روز</th>
            <th>تاریخ</th>
            <th>شروع برنامه</th>
            <th>شروع واقعی</th>
            <th>اختلاف</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const diff =
              day.performedStartMin !== null && day.plannedStartMin !== null
                ? day.performedStartMin - day.plannedStartMin
                : null;
            return (
              <tr key={day.date}>
                <td>{WEEKDAY_LABELS[day.weekday]}</td>
                <td>{formatJalaliNumeric(day.date)}</td>
                <td dir="ltr" style={{ textAlign: "right" }}>
                  {day.plannedStartMin !== null ? formatTime(day.plannedStartMin) : "—"}
                </td>
                <td dir="ltr" style={{ textAlign: "right" }}>
                  {day.performedStartMin !== null ? formatTime(day.performedStartMin) : "—"}
                </td>
                <td>
                  {diff === null
                    ? "—"
                    : `${diff > 0 ? "+" : ""}${faNumber(diff)} دقیقه`}
                </td>
                <td>
                  {day.status === "onplan" ? (
                    <span className="badge badge-green">طبق برنامه</span>
                  ) : day.status === "offplan" ? (
                    <span className="badge badge-danger">خارج از برنامه</span>
                  ) : (
                    <span className="muted">بدون فعالیت</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
