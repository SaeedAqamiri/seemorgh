import { formatJalaliNumeric } from "@/lib/dates";
import { faNumber } from "@/lib/panel";
import type { SingleExamAnalysis } from "@/lib/exam-analysis";

function difficultyBadge(difficulty: SingleExamAnalysis["subjects"][number]["difficulty"]) {
  if (difficulty === "سخت") return <span className="badge badge-danger">سخت</span>;
  if (difficulty === "راحت") return <span className="badge badge-green">راحت</span>;
  if (difficulty === "متوسط") return <span className="badge badge-warn">متوسط</span>;
  return <span className="badge">نامشخص</span>;
}

export function SingleExamAnalysisCard({ analysis }: { analysis: SingleExamAnalysis }) {
  const { exam, subjects } = analysis;
  return (
    <div className="card">
      <div className="section-head">
        <div>
          <h2>تحلیل آزمون «{exam.title}»</h2>
          <small>
            {formatJalaliNumeric(exam.examDate)} — {exam.provider || "بدون ارائه‌دهنده"} —{" "}
            {exam.source === "internal" ? "درون سامانه" : "بیرونی"}
          </small>
        </div>
        <div className="row">
          <span className="badge badge-green">درصد وزنی: {faNumber(analysis.weightedPercent)}٪</span>
        </div>
      </div>

      <p style={{ marginTop: 0, lineHeight: 1.9 }}>{analysis.summary}</p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>درس</th>
              <th>سؤال</th>
              <th>درصد تو</th>
              <th>میانگین جمع</th>
              <th>اختلاف</th>
              <th>سختی آزمون</th>
              <th>جایگاه</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.subjectTitle}>
                <td>
                  <strong>{subject.subjectTitle}</strong>
                  <div className="progress" style={{ marginTop: "0.35rem", minWidth: "120px" }}>
                    <span style={{ width: `${Math.min(100, subject.studentPercent)}%` }} />
                  </div>
                </td>
                <td>{faNumber(subject.questionCount)}</td>
                <td>
                  <strong>{faNumber(subject.studentPercent)}٪</strong>
                </td>
                <td>
                  {subject.cohortAverage !== null ? `${faNumber(subject.cohortAverage)}٪` : "—"}
                </td>
                <td>
                  {subject.diff !== null
                    ? `${subject.diff > 0 ? "+" : ""}${faNumber(subject.diff)}`
                    : "—"}
                </td>
                <td>{difficultyBadge(subject.difficulty)}</td>
                <td>{subject.comparison}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-3" style={{ marginTop: "0.9rem" }}>
        <div className="stat">
          <div className="stat-value">
            {analysis.strongest ? `${faNumber(analysis.strongest.studentPercent)}٪` : "—"}
          </div>
          <div className="stat-label">
            قوی‌ترین درس: {analysis.strongest?.subjectTitle ?? "—"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {analysis.weakest ? `${faNumber(analysis.weakest.studentPercent)}٪` : "—"}
          </div>
          <div className="stat-label">
            ضعیف‌ترین درس: {analysis.weakest?.subjectTitle ?? "—"}
          </div>
        </div>
        <div className="stat">
          <div className="stat-value">{faNumber(analysis.weightedPercent)}٪</div>
          <div className="stat-label">میانگین وزنی با ضرایب کنکور</div>
        </div>
      </div>
    </div>
  );
}
